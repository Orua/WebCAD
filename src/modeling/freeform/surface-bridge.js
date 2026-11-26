import {buildSurfaceFill} from '../manufacturing/surface-fill.js';
import {add,cross,curveReader,distance,dot,fail,joinMm,readShape,scale,scope,sub,tuple,unit} from './exact-input.js';

function connectorJet(item,atEnd,chord,tension,oc,hold) {
  const {face,edge,continuity}=item, width=Math.hypot(...chord);
  if (continuity==='G0') return {d:scale(chord,tension),dd:[0,0,0]};
  const uvCurve=hold(new oc.BRepAdaptor_Curve2d(edge.wrapped,face.wrapped));
  const uv=hold(new oc.gp_Pnt2d()), p=hold(new oc.gp_Pnt());
  const u=hold(new oc.gp_Vec()), v=hold(new oc.gp_Vec());
  const uu=hold(new oc.gp_Vec()), vv=hold(new oc.gp_Vec()), uvDerivative=hold(new oc.gp_Vec());
  const support=hold(new oc.BRepAdaptor_Surface(face.wrapped,false));
  uvCurve.D0(atEnd?uvCurve.LastParameter():uvCurve.FirstParameter(),uv);
  if(continuity==='G2') support.D2(uv.X(),uv.Y(),p,u,v,uu,vv,uvDerivative);
  else support.D1(uv.X(),uv.Y(),p,u,v);
  const a=tuple(u), b=tuple(v), crossAB=cross(a,b), n=unit(crossAB);
  if (!n) fail('FREEFORM_BRIDGE','邻面边端切平面退化，无法设定连续性。');
  const direction=unit(sub(chord,scale(n,dot(chord,n))));
  if (!direction) fail('FREEFORM_BRIDGE','接边方向几乎垂直邻面，请检查两边配对或降低接续条件。');
  const d=scale(direction,width*tension);
  if (continuity!=='G2') return {d,dd:[0,0,0]};
  const denom=dot(crossAB,crossAB);
  const du=dot(cross(d,b),crossAB)/denom, dv=dot(cross(a,d),crossAB)/denom;
  const second=add(add(scale(tuple(uu),du*du),scale(tuple(vv),dv*dv)),scale(tuple(uvDerivative),2*du*dv));
  return {d,dd:scale(n,dot(second,n))};
}

export function buildSurfaceBridge(sources,params,cad) {
  const {hold,close}=scope(), oc=cad.getOC(), cache=new Map();
  try {
    const inputs=[params.a,params.b].map(item=>{
      const edge=readShape(sources,item,'edges',hold,cache), face=readShape(sources,item,'faces',hold,cache);
      if (!face.edges.map(hold).some(other=>other.wrapped.IsSame(edge.wrapped))) {
        fail('FREEFORM_BRIDGE','过渡边必须属于所选邻面。');
      }
      const curve=curveReader(edge,oc,hold);
      if(distance(curve.at(0),curve.at(1))<=joinMm)fail('FREEFORM_BRIDGE','双边过渡须选择两条开放边。');
      return {...item,edge,face,curve};
    });
    const [a,b]=inputs, reverse=params.pairing==='reverse', tension=params.tension??.6;
    const connectors=[false,true].map(end=>{
      const other=reverse?!end:end, p=a.curve.at(Number(end)), q=b.curve.at(Number(other)), chord=sub(q,p);
      if(distance(p,q)<=joinMm)fail('FREEFORM_BRIDGE','两边端点重合，请给过渡面留出跨度。');
      const A=connectorJet(a,end,chord,tension,oc,hold), B=connectorJet(b,other,chord,tension,oc,hold);
      const p1=add(p,scale(A.d,.2)), p2=add(add(p,scale(A.d,.4)),scale(A.dd,.05));
      const q1=sub(q,scale(B.d,.2)), q2=add(sub(q,scale(B.d,.4)),scale(B.dd,.05));
      return hold(cad.makeBezierCurve([p,p1,p2,q2,q1,q]));
    });
    const refs=[...new Set([a.refIndex,b.refIndex])], localRefs=refs.map(index=>sources[index]);
    const bounds=inputs.map(item=>({kind:item.continuity,refIndex:refs.indexOf(item.refIndex),edgeId:item.edgeId,
      ...(item.continuity==='G0'?{}:{supportFaceId:item.faceId})}));
    localRefs.push(...connectors);
    const face=buildSurfaceFill(localRefs,{boundary:{kind:'edges',edges:[...bounds,
      ...connectors.map((_,i)=>({kind:'G0',refIndex:refs.length+i,edgeId:0}))]},
      toleranceMm:params.toleranceMm,output:{kind:'surface'}},cad);
    face.freeformReport={...face.surfaceFillReport,pairing:params.pairing,tension};
    return face;
  } finally {close();}
}
