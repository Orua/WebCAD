// One display contract for object and solid counts. A compound is one object
// but keeps its real solidCount, so the two numbers cannot diverge across HUD,
// tree and status bar.
export function countSummary(bodies=[]){
  return {
    objects:bodies.length,
    solids:bodies.reduce((sum,body)=>sum+(Number.isFinite(body?.solidCount)?body.solidCount:0),0)
  };
}

export function formatBodyCount(bodies=[]){
  const {objects,solids}=countSummary(bodies);
  return `${objects} 个对象 · ${solids} 个实心体`;
}
