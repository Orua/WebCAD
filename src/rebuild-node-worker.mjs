import {parentPort,threadId} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import initOpenCascade from 'replicad-opencascadejs';
import {CadKernel} from './cad-kernel.js';
import {originSignatures} from './modeling/face-origins.js';
import {checkpointReports} from './local-checkpoint-reports.js';
import {boundedDiagnosticReport} from './modeling/diagnostic-report.js';

const wasmBinary=await readFile(fileURLToPath(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url)));
const oc=await initOpenCascade({wasmBinary});
const directOperations=new Set(['box','sphere','cylinder','cone','torus','curveSweep','advancedLoft','subdBody','bumpSet','transform','copy','union','cut','intersect','smoothTransition','fillet','chamfer']);
parentPort.on('message',async({requestId,document,featureId})=>{
 const started=performance.now(),kernel=new CadKernel(oc);
 try{
  const feature=document.features.find(row=>row.id===featureId);
  if(feature&&!feature.compiledCheckpoint&&directOperations.has(feature.op))await kernel.rebuildFeatureFromSnapshots(document,featureId);
  else await kernel.rebuild(document,{headless:true});
  const shape=kernel.shapes.get(featureId);if(!shape||shape.geometryType==='mesh')throw Object.assign(new Error('目标特征未生成精确 BRep'),{featureId});
  const bytes=kernel.serializeFeatureShape(featureId).data;
  if(bytes.byteLength>20*1024*1024)throw Object.assign(new Error('BRep 超出 20 MiB 持久化门'),{featureId,code:'CHECKPOINT_CLIENT_CAPACITY'});
  parentPort.postMessage({requestId,result:{bytes,faceOriginSignatures:originSignatures(shape),reports:checkpointReports(shape),elapsedMs:performance.now()-started,threadId}},[bytes.buffer]);
 }catch(error){parentPort.postMessage({requestId,error:{message:error.message,featureId:error.featureId||featureId,code:error.code,report:boundedDiagnosticReport(error.report),details:boundedDiagnosticReport(error.details)}});}
 finally{kernel.dispose();}
});
