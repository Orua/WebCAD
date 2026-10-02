/**
 * Native source-parametric grinding contact fields. No OC initializer or Boolean calls.
 * The caller owns the current kernel, original faces, source identity and final
 * solid/material/locality/contact/endpoint acceptance. No numeric R contract.
 */
const dispose=x=>{try{x?.delete?.();}catch{}};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>Math.hypot(...a),distance=(a,b)=>norm(sub(a,b));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=norm(a);need(Number.isFinite(n)&&n>0,'Undefined surface direction');return mul(a,1/n);};
const vec=p=>[p.X(),p.Y(),p.Z()],uvvec=p=>[p.X(),p.Y()];
const angle=(a,b)=>Math.acos(Math.min(1,Math.max(-1,Math.abs(dot(unit(a),unit(b))))))*180/Math.PI;
const need=(ok,message,details)=>{if(!ok)throw Object.assign(new Error(message),{code:'GRINDING_STRIP_REJECTED',details});};

// G^{-1} maps a physical tangent into the source UV chart. Native cylinder and
// torus charts stay regular at the x-height-graph poles; no sqrt graph is used.
function uvForTangent(jet,tangent) {
  const e=dot(jet.du,jet.du),f=dot(jet.du,jet.dv),g=dot(jet.dv,jet.dv),det=e*g-f*f;
  need(Number.isFinite(e)&&e>0&&Number.isFinite(g)&&g>0&&Number.isFinite(det)&&det>e*g*1e-20,'The actual source UV chart is singular',{e,f,g,det});
  const a=dot(jet.du,tangent),b=dot(jet.dv,tangent);
  return [(g*a-f*b)/det,(e*b-f*a)/det];
}
function tangentInJet(jet,tangent) {
  const normal=unit(jet.normal),projected=sub(tangent,mul(normal,dot(tangent,normal)));
  return unit(projected);
}
function ridgeFrame(support,t) {
  const p=support.pcurve(t),jet=support.jet(p.uv),tangent=add(mul(jet.du,p.d1[0]),mul(jet.dv,p.d1[1]));
  need([...p.uv,...p.d1,...jet.point,...jet.du,...jet.dv,...jet.normal].every(Number.isFinite),'Source pcurve/UV jet is not finite');
  return {uv:p.uv,jet,tangent:unit(tangent),across:unit(cross(unit(jet.normal),unit(tangent)))};
}

/**
 * Root-callable adapters over borrowed exact BRep edge and finite support faces.
 * Uses only APIs present in the installed bindings. The finite-face test is
 * native extrema with actual interior-face support, not unbound FaceClassifier.
 */
export function nativeGrindingPiece({id,edge,supportA,supportB,reverse=false,lengthMm=edge.length},cad) {
  const oc=cad.getOC(),owned=[],hold=value=>(owned.push(value),value),map=(first,last,t)=>reverse?last-t*(last-first):first+t*(last-first);
  const makeSupport=(face,label)=>{
    const pcurve=hold(new oc.BRepAdaptor_Curve2d(edge.wrapped,face.wrapped)),surface=hold(new oc.BRepAdaptor_Surface(face.wrapped,false)),props=hold(new oc.BRepGProp_Face(face.wrapped,false)),query=hold(new oc.BRepExtrema_DistShapeShape());
    query.LoadS2(face.wrapped);query.SetDeflection(1e-10);
    const first=pcurve.FirstParameter(),last=pcurve.LastParameter(),faceToleranceMm=oc.BRep_Tool.Tolerance(face.wrapped);
    return {id:label,faceToleranceMm,
      pcurve(t){const p=new oc.gp_Pnt2d(),v=new oc.gp_Vec2d();try{pcurve.D1(map(first,last,t),p,v);return {uv:uvvec(p),d1:mul(uvvec(v),(reverse?-1:1)*(last-first))};}finally{dispose(p);dispose(v);}},
      jet(uv){const p=new oc.gp_Pnt(),du=new oc.gp_Vec(),dv=new oc.gp_Vec(),np=new oc.gp_Pnt(),n=new oc.gp_Vec();try{surface.D1(uv[0],uv[1],p,du,dv);props.Normal(uv[0],uv[1],np,n);return {point:vec(p),du:vec(du),dv:vec(dv),normal:vec(n)};}finally{[p,du,dv,np,n].forEach(dispose);}},
      classify(point){let vertex,nearest;try{vertex=cad.makeVertex(point);query.LoadS1(vertex.wrapped);query.Perform();need(query.IsDone()&&query.NbSolution()>0&&Number.isFinite(query.Value()),'Finite source face extrema did not converge',{label,point});nearest=query.SupportOnShape2(1);const gapMm=query.Value(),interior=nearest.ShapeType()===oc.TopAbs_ShapeEnum.TopAbs_FACE&&nearest.IsSame(face.wrapped);return {gapMm,interior};}finally{dispose(nearest);dispose(vertex);}},
    };
  };
  try {
    const curve=hold(new oc.BRepAdaptor_Curve(edge.wrapped)),lo=curve.FirstParameter(),hi=curve.LastParameter();
    const A=makeSupport(supportA,'A'),B=makeSupport(supportB,'B');
    return {id,lengthMm,A,B,
      evaluate(t){const p=new oc.gp_Pnt(),v=new oc.gp_Vec();try{curve.D1(map(lo,hi,t),p,v);return {point:vec(p),d1:mul(vec(v),(reverse?-1:1)*(hi-lo))};}finally{dispose(p);dispose(v);}},
      dispose(){owned.reverse().forEach(dispose);owned.length=0;},
    };
  }catch(error){owned.reverse().forEach(dispose);throw error;}
}

function inwardSign(support,t,widthMm) {
  const r=ridgeFrame(support,t),tol=Math.max(support.faceToleranceMm*2,1e-8),baseStep=Math.max(tol*40,Math.min(widthMm*.02,.001));
  const direction=uvForTangent(r.jet,r.across),trials=[];
  for(const step of [baseStep,baseStep/4,baseStep*4]) {
    const candidates=[-1,1].map(sign=>{const uv=add(r.uv,mul(direction,sign*step)),jet=support.jet(uv);return {sign,...support.classify(jet.point)};});
    trials.push({stepMm:step,candidates});const inside=candidates.filter(c=>c.interior&&c.gapMm<=tol),outside=candidates.filter(c=>!c.interior&&c.gapMm>tol*4);
    if(inside.length===1&&outside.length===1)return {sign:inside[0].sign,trials};
  }
  need(false,'No unique source-face inward direction was measured',{supportId:support.id,t,trials});
}

// Bounded midpoint UV integration, with re-normalization in the actual source
// metric. It follows the surface, rather than translating a curved face in XYZ.
function offsetContact(support,t,widthMm,sign,{walkSteps=8,verifyFinite=false,ignoreContactUV=false}={}) {
  const r=ridgeFrame(support,t);if(widthMm===0)return {uv:r.uv,...r.jet,widthMm,finiteGapMm:0};
  if(!ignoreContactUV&&typeof support.contactUV==='function') {
    let maximumGapMm=0,uv;
    for(let i=verifyFinite?1:walkSteps;i<=walkSteps;i++) {
      uv=support.contactUV(t,widthMm*i/walkSteps,sign,{walkSteps});need(Array.isArray(uv)&&uv.length===2&&uv.every(Number.isFinite),'A coupled contact did not return an actual finite source UV');
      if(verifyFinite){const jet=support.jet(uv),classification=support.classify(jet.point);maximumGapMm=Math.max(maximumGapMm,classification.gapMm);need(classification.interior&&classification.gapMm<=Math.max(support.faceToleranceMm*2,1e-8),'A coupled contact leaves the actual finite source face',{supportId:support.id,t,widthMm,step:i,classification});}
    }
    return {uv,...support.jet(uv),widthMm,finiteGapMm:maximumGapMm};
  }
  let uv=[...r.uv],maximumGapMm=0;
  const direction=(at)=>{const jet=support.jet(at),tangent=tangentInJet(jet,r.tangent);let across=unit(cross(unit(jet.normal),tangent));if(dot(across,r.across)<0)across=mul(across,-1);return uvForTangent(jet,mul(across,sign));};
  for(let i=0;i<walkSteps;i++) {
    const h=widthMm/walkSteps,duv=direction(uv),middle=add(uv,mul(duv,h/2));uv=add(uv,mul(direction(middle),h));
    if(verifyFinite){const jet=support.jet(uv),classification=support.classify(jet.point);maximumGapMm=Math.max(maximumGapMm,classification.gapMm);need(classification.interior&&classification.gapMm<=Math.max(support.faceToleranceMm*2,1e-8),'A contact walk leaves the actual finite source face',{supportId:support.id,t,widthMm,step:i,classification});}
  }
  return {uv,...support.jet(uv),widthMm,finiteGapMm:maximumGapMm};
}

// Coupled-junction builders may prescribe UV contacts, never arbitrary XYZ
// contacts or normals. This bypass exposes the same actual metric walk so their
// compact UV correction starts from the default construction.
export function metricGrindingContact(support,t,widthMm,sign,options={}) {
  return offsetContact(support,t,widthMm,sign,{...options,ignoreContactUV:true});
}

// Only complete-contour termini fade. Internal source-piece junctions retain
// positive width. A fade is not proof that the original endpoint corner is gone.
function fade(s,fraction) {
  if(s<=0||s>=1)return 0;
  const near=Math.min(s,1-s);return near>=fraction?1:Math.sin(Math.PI*near/(2*fraction));
}
function fieldValue(piece,t,plan,options) {
  const s=(plan.startLengthMm+piece.lengthMm*t)/plan.totalLengthMm,w=plan.halfWidthMm*(options.fadeTermini?fade(s,options.fadeFraction):1),source=piece.evaluate(t);
  const A=offsetContact(piece.A,t,w,plan.signA,{walkSteps:options.walkSteps}),B=offsetContact(piece.B,t,w,plan.signB,{walkSteps:options.walkSteps});
  if(w===0)return {controls:Array.from({length:4},()=>[...source.point]),outer:[...source.point],sourceRidge:source.point,A,B,widthMm:0,collapsedTerminus:true};
  const gap=sub(B.point,A.point),chord=norm(gap);need(chord>1e-12,'Source contacts coincide inside the grinding span',{pieceId:piece.id,t,w});
  const conormal=(contact,signTarget)=>{const tangent=tangentInJet(contact,source.d1),n=unit(cross(unit(contact.normal),tangent));return mul(n,dot(n,signTarget)>=0?1:-1);};
  const da=conormal(A,gap),db=conormal(B,gap),h=Math.min(chord*options.handleFraction,w*.75);
  const controls=[A.point,add(A.point,mul(da,h)),sub(B.point,mul(db,h)),B.point];
  const outside=unit(add(unit(A.normal),unit(B.normal))),outer=add(source.point,mul(outside,Math.max(chord,w)*options.outerFactor));
  need(dot(sub(outer,source.point),A.normal)>0&&dot(sub(outer,source.point),B.normal)>0,'No common outward closure sector exists',{pieceId:piece.id,t});
  return {controls,outer,sourceRidge:source.point,A,B,widthMm:w,collapsedTerminus:false};
}
function fieldDerivative(fn,t) {
  const h=1e-5,weights=t>=2*h&&t<=1-2*h?[-1,8,-8,1]:t<2*h?[-25,48,-36,16,-3]:[25,-48,36,-16,3];
  const offsets=t>=2*h&&t<=1-2*h?[2,1,-1,-2]:t<2*h?[0,1,2,3,4]:[0,-1,-2,-3,-4];
  const values=offsets.map(k=>fn(t+k*h)),derivativeAt=extract=>mul(values.reduce((sum,value,i)=>add(sum,mul(extract(value),weights[i])),[0,0,0]),1/(12*h));
  return {d1:Array.from({length:4},(_,i)=>derivativeAt(v=>v.controls[i])),outerD1:derivativeAt(v=>v.outer)};
}

/**
 * Prepare one continuous complete-contour grinding field. Adaptation is finite
 * source-face feasibility planning, never repeated Boolean builds. The returned
 * endpoints and junction obligations explicitly prevent a taper being reported
 * as complete removal of all original sharp corners.
 */
export function prepareGrindingFields(pieces,input={}) {
  const options={initialHalfWidthMm:.2,minimumHalfWidthMm:1e-4,maximumWidthHalvings:5,walkSteps:8,fadeTermini:true,fadeFraction:.08,handleFraction:.45,outerFactor:2,...input};
  need(pieces.length>0&&pieces.every(p=>Number.isFinite(p.lengthMm)&&p.lengthMm>0),'Ordered finite source pieces are required');
  need(Number.isFinite(options.initialHalfWidthMm)&&options.initialHalfWidthMm>0&&Number.isFinite(options.minimumHalfWidthMm)&&options.minimumHalfWidthMm>0&&options.minimumHalfWidthMm<=options.initialHalfWidthMm&&Number.isInteger(options.maximumWidthHalvings)&&options.maximumWidthHalvings>=0&&options.maximumWidthHalvings<=6,'Width adaptation must have a finite positive bound');
  need(Number.isInteger(options.walkSteps)&&options.walkSteps>=4&&options.walkSteps<=16&&options.fadeFraction>0&&options.fadeFraction<.25&&options.handleFraction>0&&options.handleFraction<.5&&Number.isFinite(options.outerFactor)&&options.outerFactor>0,'UV integration/fade/handle bounds are invalid');
  const totalLengthMm=pieces.reduce((s,p)=>s+p.lengthMm,0),report={strategy:'actual-pcurve-source-UV-metric-contact-grinding',dimensionKind:'no-numeric-radius-contract',accepted:false,totalLengthMm,widthAttempts:[],junctions:[],endpointObligations:[]};
  let startLengthMm=0;const plans=pieces.map(piece=>{const signA=inwardSign(piece.A,.5,options.initialHalfWidthMm),signB=inwardSign(piece.B,.5,options.initialHalfWidthMm),plan={pieceId:piece.id,startLengthMm,totalLengthMm,signA:signA.sign,signB:signB.sign,inwardEvidence:{A:signA.trials,B:signB.trials}};startLengthMm+=piece.lengthMm;return plan;});
  let halfWidthMm=options.initialHalfWidthMm,feasible=false;
  for(let trial=0;trial<=options.maximumWidthHalvings&&halfWidthMm>=options.minimumHalfWidthMm;trial++,halfWidthMm/=2) {
    const attempt={halfWidthMm,checks:[],acceptedForPlanning:false};report.widthAttempts.push(attempt);
    try {
      pieces.forEach((piece,index)=>{const plan=plans[index];for(const t of [.005,.05,.125,.25,.5,.75,.875,.95,.995]) {
        const s=(plan.startLengthMm+piece.lengthMm*t)/totalLengthMm,w=halfWidthMm*(options.fadeTermini?fade(s,options.fadeFraction):1),C=piece.evaluate(t).point;
        for(const [label,support,sign] of [['A',piece.A,plan.signA],['B',piece.B,plan.signB]]) {
          const base=ridgeFrame(support,t);need(distance(base.jet.point,C)<=1e-5,'The actual pcurve does not represent the actual source edge',{pieceId:piece.id,t,label,gapMm:distance(base.jet.point,C)});
          const rail=offsetContact(support,t,w,sign,{walkSteps:options.walkSteps,verifyFinite:true});attempt.checks.push({pieceId:piece.id,t,label,actualContact:rail.point,uv:rail.uv,widthMm:w,finiteGapMm:rail.finiteGapMm});
        }
      }});attempt.acceptedForPlanning=true;feasible=true;break;
    }catch(error){
      // Width adaptation addresses actual finite-face coverage only. Native
      // integration, chart, extrema and source correspondence errors are not
      // evidence that a smaller geometric grinding width is feasible.
      const finiteWidthFailure=error.code==='GRINDING_STRIP_REJECTED'&&error.details?.classification&&['A contact walk leaves the actual finite source face','A coupled contact leaves the actual finite source face'].includes(error.message);
      if(!finiteWidthFailure)throw error;
      attempt.rejection={code:error.code,message:error.message,details:error.details};
    }
  }
  need(feasible,'No bounded grinding width remains inside both actual finite supports',report.widthAttempts);
  report.halfWidthMm=halfWidthMm;report.options=options;
  const fields=pieces.map((piece,index)=>{const plan={...plans[index],halfWidthMm},value=t=>fieldValue(piece,t,plan,options);return {piece,plan,field(t){need(Number.isFinite(t)&&t>=0&&t<=1,'Field parameter must stay in [0,1]');const f=value(t),d=fieldDerivative(value,t);if(!f.collapsedTerminus){d.d1[0]=sub(d.d1[0],mul(unit(f.A.normal),dot(d.d1[0],unit(f.A.normal))));d.d1[3]=sub(d.d1[3],mul(unit(f.B.normal),dot(d.d1[3],unit(f.B.normal))));}return {...f,...d};}};});
  for(let i=1;i<fields.length;i++) {
    const a=fields[i-1].field(1),b=fields[i].field(0),controlGapsMm=a.controls.map((p,j)=>distance(p,b.controls[j])),outerGapMm=distance(a.outer,b.outer);
    report.junctions.push({before:pieces[i-1].id,after:pieces[i].id,controlGapsMm,outerGapMm,requiresJunctionPatch:Math.max(...controlGapsMm,outerGapMm)>1e-6,
      requirement:'Internal junctions retain positive width; all actual BRep boundaries need measured G0/G1.'});
  }
  if(options.fadeTermini)for(const [index,t,end] of [[0,0,'start'],[fields.length-1,1,'end']])report.endpointObligations.push({end,pieceId:pieces[index].id,point:fields[index].field(t).sourceRidge,
    collapsed:true,requiresActualSourceCapCorrespondence:true,originalEndpointVertexRetained:true,
    requirement:'Measure original endpoint support/cap normals and actual remaining sharp geometry. If a sharp endpoint remains, construct a source-bounded junction patch; taper alone is not complete grinding acceptance.'});
  report.limitations=['Source UV offsets and finite coverage are sampled construction evidence, not final BRep acceptance.','No radius is promised or inferred from contact width or handle size.','A singular graph pole is avoided with actual source UV charts; collapsed complete-contour endpoints still require original cap and remaining-sharpness acceptance.'];
  return {fields,report,accepted:false};
}

