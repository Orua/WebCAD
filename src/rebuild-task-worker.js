import initOpenCascade from 'replicad-opencascadejs';
import wasmURL from 'replicad-opencascadejs/wasm?url';
import {CadKernel} from './cad-kernel.js';
import {originSignatures} from './modeling/face-origins.js';
import {checkpointReports} from './local-checkpoint-reports.js';
import {boundedDiagnosticReport} from './modeling/diagnostic-report.js';

let ocPromise;
const directOperations=new Set(['box','sphere','cylinder','cone','torus','curveSweep','advancedLoft','subdBody','bumpSet','transform','copy','union','cut','intersect','smoothTransition','fillet','chamfer']);
const openCascade=()=>ocPromise??=initOpenCascade({locateFile:()=>wasmURL});

export async function runRebuildTask({document,featureId}){
 const oc=await openCascade(),started=performance.now(),kernel=new CadKernel(oc);
 try{
  const feature=document.features.find(row=>row.id===featureId);
  if(feature&&!feature.compiledCheckpoint&&directOperations.has(feature.op))await kernel.rebuildFeatureFromSnapshots(document,featureId);
  else await kernel.rebuild(document,{headless:true});
  const shape=kernel.shapes.get(featureId);if(!shape||shape.geometryType==='mesh')throw Object.assign(new Error('目标特征未生成精确 BRep'),{featureId});
  const data=kernel.serializeFeatureShape(featureId).data;
  if(data.byteLength>20*1024*1024)throw Object.assign(new Error('BRep 超出 20 MiB 持久化门'),{featureId,code:'CHECKPOINT_CLIENT_CAPACITY'});
  return {bytes:data,faceOriginSignatures:originSignatures(shape),reports:checkpointReports(shape),elapsedMs:performance.now()-started};
 }catch(error){throw Object.assign(error instanceof Error?error:new Error(String(error)),{featureId:error?.featureId||featureId});}
 finally{kernel.dispose();}
}

self.onmessage=async({data})=>{
 const {requestId}=data;
 try{const result=await runRebuildTask(data);self.postMessage({requestId,result},[result.bytes.buffer]);}
 catch(error){self.postMessage({requestId,error:{message:error.message,featureId:error.featureId,code:error.code,report:boundedDiagnosticReport(error.report),details:boundedDiagnosticReport(error.details)}});}
};
