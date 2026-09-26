const dispose=value=>{try{value?.delete?.();}catch{}};
const xyz=value=>[value.X(),value.Y(),value.Z()];
const finite=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
export function findExactDragSnap(input,getShape,oc,cad){
  const {bodyId,pointWorld,translation=[0,0,0],targetIds,thresholdMm=0.2,axis='XYZ'}=input;
  if(!Number.isFinite(thresholdMm)||thresholdMm<0||thresholdMm>10||!Array.isArray(targetIds)||targetIds.length>200||(!bodyId&&!finite(pointWorld))||!finite(translation)||!['X','Y','Z','XY','XZ','YZ','XYZ'].includes(axis))throw new Error('拖动吸附参数无效');
  if(!thresholdMm)return null;
  let source,best=null;
  try{
    source=bodyId?getShape(bodyId).clone().translate(...translation):cad.makeVertex(pointWorld);
    for(const targetId of new Set(targetIds)){
      if(targetId===bodyId)continue;
      let query,a,b;
      try{
        query=new oc.BRepExtrema_DistShapeShape();query.LoadS1(source.wrapped);query.LoadS2(getShape(targetId).wrapped);query.Perform();
        if(!query.IsDone()||query.NbSolution()<1)continue;
        const distanceMm=query.Value();if(!Number.isFinite(distanceMm)||distanceMm<1e-8||distanceMm>thresholdMm+1e-8||best&&distanceMm>best.distanceMm+1e-8)continue;
        for(let i=1;i<=query.NbSolution();i++){
          a=query.PointOnShape1(i);b=query.PointOnShape2(i);const from=xyz(a),to=xyz(b),delta=to.map((v,j)=>v-from[j]);dispose(a);dispose(b);a=b=null;
          if(delta.some((v,j)=>!axis.includes('XYZ'[j])&&Math.abs(v)>1e-6))continue;
          best={distanceMm,delta,from,to,targetId,method:'exact-brep-nearest-boundary'};break;
        }
      }finally{dispose(a);dispose(b);dispose(query);}
    }
    return best;
  }finally{dispose(source);}
}
