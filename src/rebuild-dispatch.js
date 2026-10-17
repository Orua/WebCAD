import {RebuildPool} from './rebuild-pool.js';
import {geometryFeatureSignature} from './services/geometry-signature.js';

export async function rebuildWithPool(kernel,document,{workers,headless=false,displayCoarsen=1}={}){
  if(workers!==undefined&&(!Number.isInteger(workers)||workers<0||workers>4))throw new RangeError('workers 必须是0–4；0为串行');
  const cold=kernel.historySignature[0]!==geometryFeatureSignature(document.features[0]||{});
  const roots=document.features.filter(row=>!row.refs?.length).length;
  const eligible=workers!==0&&cold&&!document.features.some(row=>row.compiledCheckpoint)&&roots>1&&(workers!==undefined||document.features.length>=8);
  if(!eligible)return kernel.rebuild(document,{headless,displayCoarsen});
  const pool=new RebuildPool(workers===undefined?{}:{workers}),started=performance.now();
  kernel.rebuildStarted=started;
  try{
    const out=await pool.rebuild(document,{kernel,headless,displayCoarsen,onProgress:progress=>kernel.reportRebuildProgress('feature','重建特征',progress)});
    if(!out.completionOrder)return out.result; // Asset/mesh plans were selected as serial before dispatch.
    const perFeatureMs=out.perFeatureMs.map(row=>({...row,op:document.features.find(feature=>feature.id===row.featureId).op,reused:false,checkpoint:false,worker:true}));
    // The temporary checkpoint document only carries worker results. The page
    // still owns the original recipes; persistent checkpoints are baked from
    // these accepted shapes using actual worker timings and the original graph.
    kernel.historySignature=document.features.map(geometryFeatureSignature);
    kernel.lastFeatureTimings=perFeatureMs;kernel.lastCompiledInvalidated=[];
    return {...out.result,perFeatureMs,parallelRebuild:{workers:pool.size,wallMs:performance.now()-started,completed:out.completionOrder.length},stats:{...out.result.stats,checkpointCandidates:perFeatureMs.filter(row=>row.ms>1000).map(row=>row.featureId)}};
  }finally{kernel.rebuildStarted=undefined;await pool.dispose();}
}
