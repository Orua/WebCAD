/**
 * Positive-width closed native two-support chain cutter.
 * No filesystem, product IDs, kernel initializer or Boolean execution.
 * The caller owns the current source and the one serial native kernel.
 */
import {topologyDetails} from './topology.js';
import {normalizeOrientedSurfaceNormal} from './normal-measurement.js';
import {sewFaces} from '../../surface-repair.js';
import {nativeGrindingPiece,prepareGrindingFields} from './native-grinding-fields.js';

const dispose=x=>{try{x?.delete?.();}catch{}};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>Math.hypot(...a),distance=(a,b)=>norm(sub(a,b));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=norm(a);need(Number.isFinite(n)&&n>0,'An actual closed source direction is zero or nonfinite');return mul(a,1/n);};
const vec=p=>[p.X(),p.Y(),p.Z()];
const need=(ok,message,details)=>{if(!ok)throw Object.assign(new Error(message),{code:'CLOSED_GRINDING_CHAIN_REJECTED',details});};
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,Math.abs(dot(unit(a),unit(b))))))*180/Math.PI;
const directedAngle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,dot(unit(a),unit(b)))))*180/Math.PI;
const bezier=(points,t)=>{let p=points.map(v=>[...v]);while(p.length>1)p=p.slice(0,-1).map((v,i)=>add(mul(v,1-t),mul(p[i+1],t)));return p[0];};
const derivative=(points,t,span)=>bezier(points.slice(0,-1).map((v,i)=>mul(sub(points[i+1],v),(points.length-1)/span)),t);

function endpointRecords(edge,vertices,edgeId,cad) {
  const oc=cad.getOC(),owned=[],hold=value=>(owned.push(value),value);
  try {
    const curve=hold(new oc.BRepAdaptor_Curve(edge.wrapped)),p=hold(new oc.gp_Pnt()),v=hold(new oc.gp_Vec());
    const lo=curve.FirstParameter(),hi=curve.LastParameter(),span=hi-lo,edgeToleranceMm=oc.BRep_Tool.Tolerance(edge.wrapped),ends=[];
    need(Number.isFinite(span)&&span>0,'The actual closed-chain source has no finite curve parameter span',{edgeId,lo,hi});
    for(const [t,parameter] of [[0,lo],[1,hi]]){curve.D1(parameter,p,v);ends.push({t,parameter,point:vec(p),d1:mul(vec(v),span)});}
    return ends.map(end=>{
      const members=vertices.map((vertex,index)=>{const point=oc.BRep_Tool.Pnt(vertex);try {
        const storedParameter=oc.BRep_Tool.Parameter(vertex,edge.wrapped),vertexToleranceMm=oc.BRep_Tool.Tolerance(vertex),gapMm=distance(vec(point),end.point),maximumGapMm=Math.min(1e-5,Math.max(edgeToleranceMm,vertexToleranceMm)+1e-10);
        return {index,point:vec(point),storedParameter,vertexToleranceMm,gapMm,maximumGapMm,positionPassed:gapMm<=maximumGapMm,parameterExact:storedParameter===end.parameter,parameterMatches:Math.abs(storedParameter-end.parameter)<=Math.max(1e-12,span*1e-10)};
      }finally{dispose(point);}});
      const exact=members.filter(m=>m.parameterExact),matches=exact.length?exact:members.filter(m=>m.parameterMatches);let member=matches.length===1?matches[0]:null,closedDoubleRole=false;
      if(!member&&matches.length===0&&members.length===1){const sole=members[0],other=ends[1-end.t];if(Math.abs(sole.storedParameter-other.parameter)<=Math.max(1e-12,span*1e-10)&&sole.positionPassed&&distance(sole.point,other.point)<=sole.maximumGapMm){member=sole;closedDoubleRole=true;}}
      need(member&&member.positionPassed,'A closed-chain endpoint has no unique native stored-parameter member within encoded tolerance and product G0',{edgeId,...end,edgeToleranceMm,members});
      return {...end,vertex:vertices[member.index],vertexPoint:member.point,vertexToleranceMm:member.vertexToleranceMm,edgeToleranceMm,curveVertexGapMm:member.gapMm,storedParameter:member.storedParameter,closedDoubleRole};
    });
  }finally{owned.reverse().forEach(dispose);}
}

function orderClosedChain(records) {
  const remaining=records.slice(1),ordered=[{...records[0],reverse:false}],first=records[0].ends[0],start=first.vertex;let end=records[0].ends[1].vertex;
  if(records.length===1){need(start.IsSame(end),'A single native source edge does not have the same actual endpoint vertex');return ordered;}
  while(remaining.length){const matches=[];remaining.forEach((record,index)=>{if(record.ends[0].vertex.IsSame(end))matches.push({record,index,reverse:false});if(record.ends[1].vertex.IsSame(end))matches.push({record,index,reverse:true});});need(matches.length===1,'The selected native closed contour is disconnected, branched or ambiguously oriented',{lastEdgeId:ordered.at(-1).edgeId,matches:matches.map(m=>({edgeId:m.record.edgeId,reverse:m.reverse}))});const next=matches[0];remaining.splice(next.index,1);ordered.push({...next.record,reverse:next.reverse});end=next.record.ends[next.reverse?0:1].vertex;}
  need(end.IsSame(start),'The last and first contour endpoints are not the same actual native vertex');return ordered;
}

// Monotone parameter change: source endpoints and native pcurves are preserved.
// Matching actual endpoint speeds permits meaningful cyclic D1 comparisons.
function reparameterize(piece,slopeStart,slopeEnd) {
  need(slopeStart>0&&slopeStart<=1&&slopeEnd>0&&slopeEnd<=1,'Closed-chain endpoint parameter slopes must remain monotone and bounded',{slopeStart,slopeEnd});
  const map=t=>({u:(-2*t*t*t+3*t*t)+(t*t*t-2*t*t+t)*slopeStart+(t*t*t-t*t)*slopeEnd,du:(-6*t*t+6*t)+(3*t*t-4*t+1)*slopeStart+(3*t*t-2*t)*slopeEnd});
  const support=S=>({...S,pcurve(t){const {u,du}=map(t),p=S.pcurve(u);return {uv:p.uv,d1:mul(p.d1,du)};}});
  return {...piece,A:support(piece.A),B:support(piece.B),evaluate(t){const {u,du}=map(t),p=piece.evaluate(u);return {point:p.point,d1:mul(p.d1,du)};},parameterWarp:{slopeStart,slopeEnd},dispose(){}};
}

/** Read-only native resolution and support adapters, with explicit ownership. */
export function prepareClosedNativeGrindingChain(shape,input,cad) {
  const options={initialHalfWidthMm:.02,minimumHalfWidthMm:.0025,maximumWidthHalvings:3,walkSteps:8,...input},faces=shape.faces,edges=shape.edges,vertexLists=[],owned=[];let returned=false;
  try {
    const ids=options.edgeIds;need(Array.isArray(ids)&&ids.length>0&&ids.length<=64&&new Set(ids).size===ids.length&&ids.every(id=>Number.isInteger(id)&&id>=0&&id<edges.length),'Explicit current source edge IDs are required for a bounded closed contour');
    const rows=topologyDetails(shape,{connectivityOnly:true}),records=ids.map(edgeId=>{
      const row=rows[edgeId];need(row.adjacentFaceIds.length===2&&!cad.getOC().BRep_Tool.Degenerated(edges[edgeId].wrapped),'Every selected native contour edge must have exactly two distinct actual supports and be nondegenerate',{edgeId,adjacentFaceIds:row.adjacentFaceIds});
      const vertices=[];for(const vertex of cad.iterTopo(edges[edgeId].wrapped,'vertex')){if(vertices.some(v=>v.IsSame(vertex)))dispose(vertex);else vertices.push(vertex);}vertexLists.push(vertices);
      return {edgeId,row,ends:endpointRecords(edges[edgeId],vertices,edgeId,cad)};
    }),ordered=orderClosedChain(records),rawPieces=[],sourcePairs=[];
    for(let i=0;i<ordered.length;i++) {
      const item=ordered[i];let pair=[...item.row.adjacentFaceIds];
      if(i){const previous=sourcePairs.at(-1);if(pair.includes(previous.supportAFaceId))pair=[previous.supportAFaceId,pair.find(id=>id!==previous.supportAFaceId)];else if(pair.includes(previous.supportBFaceId))pair=[pair.find(id=>id!==previous.supportBFaceId),previous.supportBFaceId];}
      let piece=nativeGrindingPiece({id:`native-closed-edge:${item.edgeId}`,edge:edges[item.edgeId],supportA:faces[pair[0]],supportB:faces[pair[1]],reverse:item.reverse},cad);owned.push(piece);
      if(i&&!pair.includes(sourcePairs.at(-1).supportAFaceId)&&!pair.includes(sourcePairs.at(-1).supportBFaceId)) {
        const previous=rawPieces.at(-1),P=previous.A.jet(previous.A.pcurve(1).uv),Q=previous.B.jet(previous.B.pcurve(1).uv),A=piece.A.jet(piece.A.pcurve(0).uv),B=piece.B.jet(piece.B.pcurve(0).uv),same=angle(P.normal,A.normal)+angle(Q.normal,B.normal),swap=angle(P.normal,B.normal)+angle(Q.normal,A.normal);
        need(Math.abs(same-swap)>1e-6,'Changing both native supports at a closed-chain node requires an explicit network patch',{previousEdgeId:ordered[i-1].edgeId,edgeId:item.edgeId,same,swap});
        if(swap<same){piece.dispose();owned.pop();pair.reverse();piece=nativeGrindingPiece({id:`native-closed-edge:${item.edgeId}`,edge:edges[item.edgeId],supportA:faces[pair[0]],supportB:faces[pair[1]],reverse:item.reverse},cad);owned.push(piece);}
      }
      rawPieces.push(piece);sourcePairs.push({sourceEdgeId:item.edgeId,supportAFaceId:pair[0],supportBFaceId:pair[1],reverse:item.reverse,adjacencyMethod:'fresh-actual-native-edge-IsSame-on-current-support-boundaries'});
    }
    const joints=rawPieces.map((piece,i)=>{const next=rawPieces[(i+1)%rawPieces.length],a=piece.evaluate(1),b=next.evaluate(0),before=ordered[i].ends[ordered[i].reverse?0:1],after=ordered[(i+1)%ordered.length].ends[ordered[(i+1)%ordered.length].reverse?1:0];
      need(before.vertex.IsSame(after.vertex),'A cyclic source node lost its actual native vertex identity');const tangentAngleDeg=directedAngle(a.d1,b.d1),positionGapMm=distance(a.point,b.point);need(positionGapMm<=1e-5&&tangentAngleDeg<=.02,'A geometric closed-contour corner requires a local junction patch',{beforeEdgeId:ordered[i].edgeId,afterEdgeId:ordered[(i+1)%ordered.length].edgeId,positionGapMm,tangentAngleDeg});return {beforeEdgeId:ordered[i].edgeId,afterEdgeId:ordered[(i+1)%ordered.length].edgeId,nativeVertexIsSame:true,point:before.vertexPoint,positionGapMm,tangentAngleDeg,commonParameterSpeed:Math.min(norm(a.d1),norm(b.d1)),beforeSourceEndpoint:{curveVertexGapMm:before.curveVertexGapMm,edgeToleranceMm:before.edgeToleranceMm,vertexToleranceMm:before.vertexToleranceMm,storedParameter:before.storedParameter,closedDoubleRole:before.closedDoubleRole},afterSourceEndpoint:{curveVertexGapMm:after.curveVertexGapMm,edgeToleranceMm:after.edgeToleranceMm,vertexToleranceMm:after.vertexToleranceMm,storedParameter:after.storedParameter,closedDoubleRole:after.closedDoubleRole}};});
    const pieces=rawPieces.map((piece,i)=>reparameterize(piece,joints[(i-1+joints.length)%joints.length].commonParameterSpeed/norm(piece.evaluate(0).d1),joints[i].commonParameterSpeed/norm(piece.evaluate(1).d1)));
    const prepared=prepareGrindingFields(pieces,{initialHalfWidthMm:options.initialHalfWidthMm,minimumHalfWidthMm:options.minimumHalfWidthMm,maximumWidthHalvings:options.maximumWidthHalvings,walkSteps:options.walkSteps,fadeTermini:false});
    const disposeSourceAdapters=()=>{owned.reverse().forEach(piece=>piece.dispose());owned.length=0;vertexLists.forEach(list=>list.forEach(dispose));vertexLists.length=0;edges.forEach(dispose);faces.forEach(dispose);};
    prepared.dispose=disposeSourceAdapters;prepared.report.closed=true;prepared.report.nativeClosedChainEvidence={sourcePairs,joints,sourceCurveTypes:ids.map(id=>({sourceEdgeId:id,geomType:edges[id].geomType})),parameterWarps:pieces.map(piece=>({pieceId:piece.id,...piece.parameterWarp})),singleNativeClosedEdge:ids.length===1,sourceAdjacencyVerified:true,noGuessedCaps:true,noZeroWidthEndpoints:true};returned=true;return prepared;
  }finally{if(!returned){owned.reverse().forEach(piece=>piece.dispose());vertexLists.forEach(list=>list.forEach(dispose));edges.forEach(dispose);faces.forEach(dispose);}}
}

function profileJet(field,v) {
  const point=bezier(field.controls,v),du=bezier(field.d1,v),dv=bezier(field.controls.slice(0,-1).map((p,i)=>mul(sub(field.controls[i+1],p),3)),v),measurement=normalizeOrientedSurfaceNormal({normal:cross(du,dv),du,dv});return {point,du,dv,normal:measurement.normal,relativeJacobian:measurement.relativeJacobian};
}
function measureCyclicJoint(before,after) {
  const controlGapsMm=before.controls.map((p,i)=>distance(p,after.controls[i])),outerGapMm=distance(before.outer,after.outer),derivativeRelativeGaps=before.d1.map((d,i)=>distance(d,after.d1[i])/Math.max(norm(d),norm(after.d1[i]),Number.MIN_VALUE)),outerDerivativeRelativeGap=distance(before.outerD1,after.outerD1)/Math.max(norm(before.outerD1),norm(after.outerD1),Number.MIN_VALUE),stations=[];
  for(let i=0;i<=64;i++){const v=i/64,A=profileJet(before,v),B=profileJet(after,v);stations.push({v,gapMm:distance(A.point,B.point),angleDeg:angle(A.normal,B.normal),relativeJacobianBefore:A.relativeJacobian,relativeJacobianAfter:B.relativeJacobian});}
  return {controlGapsMm,outerGapMm,derivativeRelativeGaps,outerDerivativeRelativeGap,fullD1ContinuityObserved:Math.max(...derivativeRelativeGaps,outerDerivativeRelativeGap)<=1e-5,derivativeComparisonRole:'diagnostic-only-across-independent-BRep-faces',maxProfileGapMm:Math.max(...stations.map(s=>s.gapMm)),maxProfileAngleDeg:Math.max(...stations.map(s=>s.angleDeg)),stations};
}

/** Pure bounded fitting. Exact source contact columns get the tighter budget. */
export function planClosedGrindingStrip(field,input={}) {
  const options={contactToleranceMm:1e-9,fieldToleranceMm:1e-7,tangentToleranceDeg:.02,maxSegments:1024,...input},parts=[];
  need(options.contactToleranceMm>0&&options.contactToleranceMm<=1e-9&&options.fieldToleranceMm>0&&options.fieldToleranceMm<=1e-7&&options.tangentToleranceDeg>0&&options.tangentToleranceDeg<=.02&&Number.isInteger(options.maxSegments)&&options.maxSegments>0&&options.maxSegments<=2048,'Closed source fitting limits are invalid');
  const visit=(a,b,depth)=>{
    const A=field(a),B=field(b),span=b-a,columns=A.controls.map((p,i)=>[p,add(p,mul(A.d1[i],span/3)),sub(B.controls[i],mul(B.d1[i],span/3)),B.controls[i]]),outer=[A.outer,add(A.outer,mul(A.outerD1,span/3)),sub(B.outer,mul(B.outerD1,span/3)),B.outer];let maxContactErrorMm=0,maxFieldErrorMm=0,maxContactAngleDeg=0,minRelativeJacobian=Infinity;
    for(let i=0;i<=16;i++){const q=i/16,t=a+span*q,exact=field(t),fitted=columns.map(p=>bezier(p,q));fitted.forEach((p,j)=>{const error=distance(p,exact.controls[j]);if(j===0||j===3)maxContactErrorMm=Math.max(maxContactErrorMm,error);else maxFieldErrorMm=Math.max(maxFieldErrorMm,error);});maxFieldErrorMm=Math.max(maxFieldErrorMm,distance(bezier(outer,q),exact.outer));
      for(const [column,contact] of [[0,exact.A],[3,exact.B]]){const du=derivative(columns[column],q,span),dv=column===0?sub(fitted[1],fitted[0]):sub(fitted[3],fitted[2]),normal=normalizeOrientedSurfaceNormal({normal:cross(du,dv),du,dv});minRelativeJacobian=Math.min(minRelativeJacobian,normal.relativeJacobian);maxContactAngleDeg=Math.max(maxContactAngleDeg,angle(normal.normal,contact.normal));}
    }
    if(maxContactErrorMm<=options.contactToleranceMm&&maxFieldErrorMm<=options.fieldToleranceMm&&maxContactAngleDeg<=options.tangentToleranceDeg){need(parts.length<options.maxSegments,'Closed grinding fit segment budget exceeded');parts.push({a,b,columns,outer,maxContactErrorMm,maxFieldErrorMm,maxContactAngleDeg,minRelativeJacobian});return;}
    need(depth<20&&parts.length+1<options.maxSegments,'Closed source contact fitting exceeds its bounded budget',{a,b,depth,maxContactErrorMm,maxFieldErrorMm,maxContactAngleDeg});const middle=(a+b)/2;visit(a,middle,depth+1);visit(middle,b,depth+1);
  };
  visit(0,1,0);return {parts,options,sampledEstimate:{maxContactErrorMm:Math.max(...parts.map(p=>p.maxContactErrorMm)),maxFieldErrorMm:Math.max(...parts.map(p=>p.maxFieldErrorMm)),maxContactAngleDeg:Math.max(...parts.map(p=>p.maxContactAngleDeg)),minRelativeJacobian:Math.min(...parts.map(p=>p.minRelativeJacobian))},accepted:false};
}

function assembleNet(parts,role) {
  const sourceColumns=p=>role==='blend'?p.columns:role==='closure-A'?[p.columns[0],p.outer]:[p.outer,p.columns[3]],columns=sourceColumns(parts[0]).map(row=>row.map(p=>[...p])),knots=[parts[0].a,parts[0].b];let maxPositionGapMm=0,maxRelativeD1Gap=0;
  for(let i=1;i<parts.length;i++){const previous=sourceColumns(parts[i-1]),current=sourceColumns(parts[i]);need(Math.abs(parts[i-1].b-parts[i].a)<=1e-14,'Closed fit blocks lost their actual parameter correspondence');current.forEach((row,c)=>{const gapMm=distance(previous[c][3],row[0]),left=mul(sub(previous[c][3],previous[c][2]),3/(parts[i-1].b-parts[i-1].a)),right=mul(sub(row[1],row[0]),3/(parts[i].b-parts[i].a)),relative=distance(left,right)/Math.max(norm(left),norm(right),Number.MIN_VALUE);maxPositionGapMm=Math.max(maxPositionGapMm,gapMm);maxRelativeD1Gap=Math.max(maxRelativeD1Gap,relative);need(gapMm<=1e-12&&relative<=1e-8,'Actual cubic fit intervals do not form a C1 block',{role,partIndex:i,column:c,gapMm,relative});columns[c].push(...row.slice(1));});knots.push(parts[i].b);}
  return {columns,knots,maxPositionGapMm,maxRelativeD1Gap};
}
function nativeBlockFace(parts,role,cad,held,report) {
  const net=assembleNet(parts,role),oc=cad.getOC(),countU=net.columns[0].length,countV=net.columns.length,degreeV=countV-1,arrays=[],hold=value=>(arrays.push(value),value);let surface,maker;
  try {
    const poles=hold(new oc.NCollection_Array2_gp_Pnt(1,countU,1,countV)),uk=hold(new oc.NCollection_Array1_double(1,net.knots.length)),um=hold(new oc.NCollection_Array1_int(1,net.knots.length)),vk=hold(new oc.NCollection_Array1_double(1,2)),vm=hold(new oc.NCollection_Array1_int(1,2));
    net.columns.forEach((column,v)=>column.forEach((point,u)=>{const p=new oc.gp_Pnt(...point);try{poles.SetValue(u+1,v+1,p);}finally{dispose(p);}}));net.knots.forEach((k,i)=>{uk.SetValue(i+1,k);um.SetValue(i+1,i===0||i===net.knots.length-1?4:3);});vk.SetValue(1,0);vk.SetValue(2,1);vm.SetValue(1,countV);vm.SetValue(2,countV);surface=new oc.Geom_BSplineSurface(poles,uk,vk,um,vm,3,degreeV,false,false);
    for(let i=net.knots.length-1;i>=2;i--)need(surface.RemoveUKnot(i,2,1e-12),'A measured closed-chain C1 block cannot remove an internal knot exactly',{role,knotIndex:i});need(surface.IsCNu(1),'The native closed source block is not C1');let maxReadbackDeviationMm=0;
    for(const part of parts)for(let i=0;i<=8;i++){const q=i/8,u=part.a+(part.b-part.a)*q,columns=role==='blend'?part.columns:role==='closure-A'?[part.columns[0],part.outer]:[part.outer,part.columns[3]],fitted=columns.map(row=>bezier(row,q));for(const v of [0,.25,.5,.75,1]){const p=surface.Value(u,v);try{maxReadbackDeviationMm=Math.max(maxReadbackDeviationMm,distance(vec(p),bezier(fitted,v)));}finally{dispose(p);}}}
    need(maxReadbackDeviationMm<=1e-11,'Native closed block assembly changed its measured source-contact geometry',{role,maxReadbackDeviationMm});maker=new oc.BRepBuilderAPI_MakeFace(surface,net.knots[0],net.knots.at(-1),0,1,1e-7);need(maker.IsDone(),'Closed source contact face construction failed',{role});const face=cad.cast(maker.Face());held.push(face);report.push({role,segments:parts.length,uRange:[net.knots[0],net.knots.at(-1)],maxPositionGapMm:net.maxPositionGapMm,maxRelativeD1Gap:net.maxRelativeD1Gap,maxReadbackDeviationMm,internalContinuity:'C1',knotRemovalToleranceMm:1e-12});return face;
  }finally{[maker,surface].forEach(dispose);arrays.reverse().forEach(dispose);}
}

/** Build one closed positive-width cutter. No source Boolean or acceptance. */
export function createClosedNativeGrindingContactCutter(shape,input,cad) {
  const options={maximumIntervalsPerFace:8,maximumTotalFitSegments:1024,maximumToolFaces:384,sewingToleranceMm:1e-6,...input};
  need(Number.isInteger(options.maximumIntervalsPerFace)&&options.maximumIntervalsPerFace>0&&options.maximumIntervalsPerFace<=8&&Number.isInteger(options.maximumTotalFitSegments)&&options.maximumTotalFitSegments>0&&options.maximumTotalFitSegments<=4096&&Number.isInteger(options.maximumToolFaces)&&options.maximumToolFaces>0&&options.maximumToolFaces<=1536&&options.sewingToleranceMm>0&&options.sewingToleranceMm<=1e-6,'Closed constructor topology and sewing bounds are invalid');
  const prepared=prepareClosedNativeGrindingChain(shape,options,cad),faces=[],plans=[],assemblies=[],cyclicJoints=[];let tool;
  try {
    for(let i=0;i<prepared.fields.length;i++){const before=prepared.fields[i].field(1),after=prepared.fields[(i+1)%prepared.fields.length].field(0),joint=measureCyclicJoint(before,after);need(before.widthMm>0&&after.widthMm>0&&!before.collapsedTerminus&&!after.collapsedTerminus,'A closed native contour must have strictly positive width at every join');need(Math.max(...joint.controlGapsMm,joint.outerGapMm,joint.maxProfileGapMm)<=1e-6&&joint.maxProfileAngleDeg<=.02,'A cyclic actual source-contact profile needs a separate junction patch',{beforePieceId:prepared.fields[i].piece.id,afterPieceId:prepared.fields[(i+1)%prepared.fields.length].piece.id,joint});cyclicJoints.push({beforePieceId:prepared.fields[i].piece.id,afterPieceId:prepared.fields[(i+1)%prepared.fields.length].piece.id,positiveWidthMm:before.widthMm,...joint});
    }
    // Last/first are real source contact stations, including periodic chart
    // seams. Native extrema may return an edge there, so gap is authoritative;
    // no guessed end plane or synthetic cap is introduced.
    for(const record of prepared.fields)for(const t of [0,1]){const field=record.field(t);for(const [label,support,contact] of [['A',record.piece.A,field.A],['B',record.piece.B,field.B]]){const finite=support.classify(contact.point);need(finite.gapMm<=Math.max(2*support.faceToleranceMm,1e-8)&&finite.gapMm<=1e-6,'A positive cyclic contact station leaves its actual finite source support',{pieceId:record.piece.id,t,label,finite});}}
    let totalSegments=0,predictedToolFaces=0;
    for(const record of prepared.fields){const plan=planClosedGrindingStrip(record.field,options.fit);totalSegments+=plan.parts.length;predictedToolFaces+=Math.ceil(plan.parts.length/options.maximumIntervalsPerFace)*3;need(totalSegments<=options.maximumTotalFitSegments,'Closed cutter exceeds its total interval budget',{totalSegments,maximumTotalFitSegments:options.maximumTotalFitSegments});need(predictedToolFaces<=options.maximumToolFaces,'Closed cutter exceeds its declared face budget before native face construction',{predictedToolFaces,maximumToolFaces:options.maximumToolFaces});plans.push({pieceId:record.piece.id,...plan});}
    for(const plan of plans)for(let start=0;start<plan.parts.length;start+=options.maximumIntervalsPerFace){const parts=plan.parts.slice(start,start+options.maximumIntervalsPerFace);for(const role of ['blend','closure-A','closure-B'])nativeBlockFace(parts,role,cad,faces,assemblies);}
    tool=sewFaces({faces,tolerance:options.sewingToleranceMm,makeSolid:true},cad);const result={tool,plans,report:{...prepared.report,strategy:'positive-width-native-closed-two-support-contact-cutter',cyclicJoints,assemblies,totalFitSegments:totalSegments,toolFaceCount:faces.length,topologyBounds:{maximumIntervalsPerFace:options.maximumIntervalsPerFace,maximumToolFaces:options.maximumToolFaces,maximumTotalFitSegments:options.maximumTotalFitSegments},sewingToleranceMm:options.sewingToleranceMm,constructedCutterOnly:true,accepted:false,cutBuildCalls:0,historyUse:'The caller must use one native Cut history against this unchanged current source to derive every final generated face and retained source support; sourcePairs describes the input adjacency only.',limitations:[...prepared.report.limitations,'Closed native source chains require actual full-profile G0/G1 and regularity, including last/first. D1 magnitudes across independent faces remain diagnostic; C1 is required only within each assembled spline block. Geometric corners/support swaps requiring a patch are rejected explicitly.','The closed source is sampled in regular native UV charts; arbitrary chart poles, concave sectors and self-intersections are not claimed supported.','Final valid one solid, actual selected-edge coverage, every generated G0/G1 boundary, material and locality are independently measured after the caller-owned single Cut.']},accepted:false,disposeCandidate(){dispose(this.tool);this.tool=null;}};tool=null;return result;
  }finally{dispose(tool);faces.forEach(dispose);prepared.dispose();}
}
