import {binaryHash} from './contracts/operation-schema.js';
import {localCheckpointFingerprint,LOCAL_KERNEL_BUILD_ID,LOCAL_REBUILD_SEMANTICS,GEOMETRY_CODEC} from './services/geometry-exchange.js';

const LIMIT=20*1024*1024;
const SERIAL_OPS=new Set(['import','importStep','importBrep','importMesh','meshRelief','meshReliefPlate','meshHeightfieldRelief','meshReliefEdit','meshSculpt','relief','reliefSculpt','reliefLayer','reliefImage','meshBoolean','meshCut','meshUnion','remove']);
const supported=feature=>!SERIAL_OPS.has(feature.op);
const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
const hash=bytes=>binaryHash(bytes).slice(7);

function plan(document){
 if(!document||![1,2,3,4].includes(document.version)||!Array.isArray(document.features))throw new TypeError('无效的 WebCAD 工程');
 const byId=new Map(),index=new Map();document.features.forEach((feature,i)=>{if(!feature?.id||byId.has(feature.id))throw Object.assign(new Error('特征 ID 缺失或重复'),{featureId:feature?.id});byId.set(feature.id,feature);index.set(feature.id,i);});
 const deps=new Map();for(const feature of document.features){const refs=feature.refs||[];if(!Array.isArray(refs)||new Set(refs).size!==refs.length)throw Object.assign(new Error('特征依赖无效'),{featureId:feature.id});for(const ref of refs){if(!byId.has(ref))throw Object.assign(new Error(`特征引用不存在：${ref}`),{featureId:feature.id});if(index.get(ref)>=index.get(feature.id))throw Object.assign(new Error(`依赖顺序无效：${ref}`),{featureId:feature.id});}deps.set(feature.id,new Set(refs));const artifact=feature.compiledCheckpoint?.artifactSha256,bytes=artifact&&document.compiledArtifacts?.[artifact];if(bytes instanceof Uint8Array&&bytes.byteLength>LIMIT)throw Object.assign(new Error('现有精确检查点超出 20 MiB 持久化门'),{featureId:feature.id,code:'CHECKPOINT_CLIENT_CAPACITY'});}
 const children=new Map(document.features.map(f=>[f.id,[]]));for(const f of document.features)for(const ref of f.refs||[])children.get(ref).push(f.id);
 return {byId,children,remaining:new Map([...deps].map(([id,refs])=>[id,refs.size])),serial:new Set(document.features.filter(f=>!supported(f)).map(f=>f.id))};
}

function makeTaskDocument(source,featureId,completed){
 const byId=new Map(source.features.map(f=>[f.id,f])),needed=new Set();const visit=id=>{if(needed.has(id))return;const f=byId.get(id);if(!f)throw Object.assign(new Error(`找不到依赖特征 ${id}`),{featureId});needed.add(id);for(const ref of f.refs||[])visit(ref);};visit(featureId);
 const features=source.features.filter(f=>needed.has(f.id)).map(f=>clone(f)),compiledArtifacts={...(source.compiledArtifacts||{})};
 for(const f of features){const result=completed.get(f.id);if(!result)continue;
  const existing=f.compiledCheckpoint;
  if(existing&&existing.kind!=='local-rebuild')continue; // Never replace or relax Native checkpoint rules.
  const bytes=result.bytes;if(!(bytes instanceof Uint8Array))throw Object.assign(new Error('Worker 未返回精确 BRep'),{featureId:f.id});
  const artifactSha256=hash(bytes);if(bytes.length>LIMIT)throw Object.assign(new Error('精确检查点超出 20 MiB 持久化门'),{featureId:f.id,code:'CHECKPOINT_CLIENT_CAPACITY'});
  const inputs=(f.refs||[]).map(id=>completed.get(id)?.bytes);if(inputs.some(x=>!(x instanceof Uint8Array)))throw Object.assign(new Error('缺少依赖 BRep 检查点'),{featureId:f.id});
  const row={kind:'local-rebuild',codec:GEOMETRY_CODEC,brepVersion:3,kernelBuildId:LOCAL_KERNEL_BUILD_ID,semanticVersion:LOCAL_REBUILD_SEMANTICS,artifactSha256,inputSha256:inputs.map(hash),sourceSnapshotVersion:2,faceOriginSignatures:result.faceOriginSignatures,reports:result.reports};
  f.compiledCheckpoint=row;compiledArtifacts[artifactSha256]=new Uint8Array(bytes);
  // Fingerprinting uses the whole upstream recipe and upstream artifact identities.
  row.recipeFingerprint=localCheckpointFingerprint({features,compiledArtifacts},f.id);
 }
 return {...source,features,compiledArtifacts};
}

function wire(worker,node){
 return {native:worker,send:(message,transfer=[])=>node?worker.postMessage(message,transfer):worker.postMessage(message,transfer),on:(name,fn)=>{if(node)worker.on(name,fn);else worker.addEventListener(name,event=>fn(name==='message'?event.data:event));},terminate:()=>worker.terminate()};
}

export function defaultRebuildWorkers({hardwareConcurrency=globalThis.navigator?.hardwareConcurrency||1}={}){return Math.max(1,Math.min(4,Math.floor(Number(hardwareConcurrency)||1)-1||1));}

export class RebuildPool {
 constructor({workers=defaultRebuildWorkers(),runtime='auto'}={}){
  if(!Number.isInteger(workers)||workers<1||workers>4)throw new RangeError('workers 必须是 1..4');
  this.size=workers;this.node=runtime==='node'||runtime==='auto'&&typeof process!=='undefined'&&!!process.versions?.node;this.closed=false;this.failed=false;this.sequence=0;this.pending=new Map();this.workers=[];
  if(runtime!=='auto'&&runtime!=='node'&&runtime!=='browser')throw new TypeError('runtime 必须是 auto、node 或 browser');
  if(!this.node&&typeof Worker==='undefined')throw new Error('当前环境不支持 module Worker');
  for(let i=0;i<workers;i++){
   const worker=this.node?null:new Worker(new URL('./rebuild-task-worker.js',import.meta.url),{type:'module'});
   const slot={worker:null,busy:false};slot.worker=this.node?null:wire(worker,false);this.workers.push(slot);if(slot.worker)this.bind(slot);
  }
 }
 bind(slot){
  if(slot.bound)return;slot.bound=true;
  slot.worker.on('message',message=>{const p=this.pending.get(message?.requestId);if(!p)return;p.cleanup();if(message.error)p.reject(Object.assign(new Error(message.error.message),{featureId:message.error.featureId||p.featureId,code:message.error.code,report:message.error.report,details:message.error.details}));else p.resolve(message.result);});
  slot.worker.on('error',error=>{for(const [id,p]of this.pending)if(p.slot===slot){p.cleanup();p.reject(Object.assign(error,{featureId:p.featureId}));}});
  slot.worker.on('exit',code=>{for(const [id,p]of this.pending)if(p.slot===slot){p.cleanup();p.reject(Object.assign(new Error(`重建 Worker 退出 (${code})`),{featureId:p.featureId}));}});
 }
 async ensureWorkers(){
  if(this.closed)throw new Error('重建池已关闭');
  for(const slot of this.workers)if(!slot.worker){const nodeWorkerModule='node:worker_threads';const {Worker}=await import(/* @vite-ignore */ nodeWorkerModule);if(this.closed)throw new Error('重建池已关闭');const worker=new Worker(new URL(import.meta.resolve('./rebuild-node-worker.mjs')));slot.worker=wire(worker,true);slot.bound=false;this.bind(slot);}
 }
 async task(slot,featureId,document){
  await this.ensureWorkers();if(this.closed||this.failed)throw new Error('重建池已终止');
  const requestId=++this.sequence;slot.busy=true;
  try{return await new Promise((resolve,reject)=>{
   const cleanup=()=>this.pending.delete(requestId);this.pending.set(requestId,{slot,resolve,reject,cleanup,featureId});
   slot.worker.send({requestId,document,featureId});
  });}finally{slot.busy=false;}
 }
 async rebuild(document,{kernel,displayCoarsen=1,headless=false,onProgress=()=>{}}={}){
  if(this.closed)throw new Error('重建池已关闭');
  const immutable=clone(document),graph=plan(immutable),completed=new Map(),scheduled=new Set(),ready=()=>immutable.features.filter(f=>graph.remaining.get(f.id)===0&&!scheduled.has(f.id));
  // This decision is made before any work starts. Asset/mesh paths are never
  // retried serially after a parallel geometry failure.
  if(graph.serial.size){if(!kernel)throw Object.assign(new Error('此工程按预计划须由父级 CadKernel 串行重建'),{code:'SERIAL_REBUILD_REQUIRED'});const result=await kernel.rebuild(immutable,{displayCoarsen,headless});return {document:immutable,result,perFeatureMs:result.perFeatureMs||[]};}
  await this.ensureWorkers();
  const free=()=>this.workers.find(w=>!w.busy);const running=new Map();
  const completionOrder=[];
  const execute=async(feature,slot)=>{const child=makeTaskDocument(immutable,feature.id,completed);const result=await this.task(slot,feature.id,child);if(!(result.bytes instanceof Uint8Array)||result.bytes.length>LIMIT)throw Object.assign(new Error('BRep 结果超出 20 MiB 持久化门或格式无效'),{featureId:feature.id,code:'CHECKPOINT_CLIENT_CAPACITY'});completed.set(feature.id,{...result,bytes:new Uint8Array(result.bytes)});completionOrder.push(feature.id);for(const id of graph.children.get(feature.id))graph.remaining.set(id,graph.remaining.get(id)-1);onProgress({featureId:feature.id,completed:completed.size,total:immutable.features.length});};
  try{
   while(completed.size<immutable.features.length){
    let progress=false;
    for(const feature of ready()){const slot=free();if(!slot)break;scheduled.add(feature.id);slot.busy=true;running.set(feature.id,execute(feature,slot));progress=true;}
    if(running.size===0){if(!progress)throw Object.assign(new Error('依赖图无法调度'),{featureId:ready()[0]?.id});}
    const settled=await Promise.race([...running.entries()].map(([id,p])=>p.then(()=>({id}),error=>({id,error}))));running.delete(settled.id);if(settled.error)throw settled.error;
   }
   const checkpointed=new Map(),artifacts={...(immutable.compiledArtifacts||{})};
   for(const feature of immutable.features){const partial=makeTaskDocument(immutable,feature.id,completed);const row=partial.features.find(f=>f.id===feature.id);if(row)checkpointed.set(feature.id,row);Object.assign(artifacts,partial.compiledArtifacts);}
   const temporary={...immutable,version:4,binaryAssets:immutable.binaryAssets||{},features:immutable.features.map(f=>checkpointed.get(f.id)||clone(f)),compiledArtifacts:artifacts};
   const finalResult=kernel?await kernel.rebuild(temporary,{displayCoarsen,headless}):undefined;
   return {document:temporary,result:finalResult,completionOrder,perFeatureMs:immutable.features.map(f=>({featureId:f.id,ms:completed.get(f.id)?.elapsedMs??0,threadId:completed.get(f.id)?.threadId}))};
  }catch(error){this.failed=true;await this.dispose();throw Object.assign(error instanceof Error?error:new Error(String(error)),{featureId:error?.featureId||error?.cause?.featureId});}
 }
 async dispose(){if(this.closed)return;this.closed=true;for(const slot of this.workers){try{await slot.worker?.terminate();}catch{}slot.worker=null;}for(const [id,p]of this.pending){p.cleanup();p.reject(Object.assign(new Error('重建池已终止'),{featureId:p.featureId}));}this.pending.clear();}
}

export function rebuildDocument(document,options={}){const pool=new RebuildPool(options);return pool.rebuild(document,options).finally(()=>pool.dispose());}
