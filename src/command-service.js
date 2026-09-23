import { assertOperationContract, normalizeOperationParams, normalizeOperationPatch, validateOperationRefs, migratedOperationIds, getOperation, validateOperationExample } from './operation-registry.js';

const clone=structuredClone;
const uid=()=>crypto.randomUUID();
const canonical=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function domainError(code,path,message,recoveryAction='NONE') {
  return Object.assign(new Error(message),{code,path,retryable:false,recoveryAction});
}
function fail(code,path,message,recovery){throw domainError(code,path,message,recovery);}
function object(value,keys,path){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('PARAM_SCHEMA_INVALID',path,'Expected an object');
  for(const k of Object.keys(value))if(!keys.includes(k))fail('PARAM_SCHEMA_INVALID',`${path}.${k}`,'Unknown field');
}
function string(value,path,max=150){if(typeof value!=='string'||!value.length||value.length>max)fail('PARAM_SCHEMA_INVALID',path,`Expected nonempty string (max ${max})`);}
function finiteTree(v,path='args'){if(typeof v==='number'&&!Number.isFinite(v))fail('PARAM_SCHEMA_INVALID',path,'Number must be finite');if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))finiteTree(x,`${path}.${k}`);}
function integer(v,path,min=0,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(v)||v<min||v>max)fail('PARAM_RANGE_INVALID',path,`Expected integer ${min}..${max}`);}
function ids(v,path,nonempty=false){if(!Array.isArray(v)||v.length>200||(nonempty&&!v.length))fail('PARAM_SCHEMA_INVALID',path,'Expected bounded ID array');v.forEach(x=>string(x,path));if(new Set(v).size!==v.length)fail('PARAM_SCHEMA_INVALID',path,'Duplicate references');}
const contextOf=s=>({sessionId:s.sessionId,documentId:s.documentId,documentInstanceId:s.documentInstanceId,revision:s.revision});
function errorResult(e,requestId,s){return {status:'failed',requestId,error:{code:e.code||(/no material|remove material|无.*材料|未.*材料/i.test(e.message)?'NO_MATERIAL_REMOVED':'GEOMETRY_INVALID'),path:e.path||'args',message:e.message||String(e),retryable:false,recoveryAction:e.recoveryAction||'NONE'},commitState:'not_committed',currentRevision:s?.revision};}

// A single browser document remains authoritative. No DOM, UI selection or kernel copy.
export function createCommandService(adapter) {
  let tail=Promise.resolve(),instance=null;
  const receipts=new Map(),tokens=new Map(),cursors=new Map();
  function contract(op,args){
    if(!adapter.allowAdvisory||migratedOperationIds.includes(op))return assertOperationContract(op,args);
    const card=getOperation(op);
    if(['import','remove'].includes(op))fail('CAPABILITY_UNAVAILABLE','args.op','Use the document/file operations');
    if(args.opVersion!==card.version)fail('OPERATION_VERSION_UNSUPPORTED','args.opVersion','Read current tool card');
    if(args.schemaHash!==card.schemaHash)fail('SCHEMA_MISMATCH','args.schemaHash','Read current tool card');
    return card;
  }
  function parameters(op,params){if(migratedOperationIds.includes(op))return normalizeOperationParams(op,params);finiteTree(params);validateOperationExample(op,params);return clone(params);}
  function snapshot(){const s=adapter.snapshot();if(instance!==s.documentInstanceId){instance=s.documentInstanceId;receipts.clear();tokens.clear();cursors.clear();}return s;}
  function context(input,s,{revision=true}={}){
    object(input,['sessionId','documentId','documentInstanceId','expectedRevision'],'context');
    for(const k of ['sessionId','documentId','documentInstanceId'])string(input[k],`context.${k}`);
    integer(input.expectedRevision,'context.expectedRevision');
    if(input.sessionId!==s.sessionId)fail('INSTANCE_MISMATCH','context.sessionId','Browser session changed','READ_STATE_AND_REPLAN');
    if(input.documentId!==s.documentId)fail('DOCUMENT_MISMATCH','context.documentId','Different document','READ_STATE_AND_REPLAN');
    if(input.documentInstanceId!==s.documentInstanceId)fail('INSTANCE_MISMATCH','context.documentInstanceId','Document was reloaded','READ_STATE_AND_REPLAN');
    if(revision&&input.expectedRevision!==s.revision)fail('REVISION_CONFLICT','context.expectedRevision','Model revision changed; no change performed','READ_STATE_AND_REPLAN');
  }
  function available(s){if(!s.kernelReady)fail('CAPABILITY_UNAVAILABLE','context','Kernel is not ready');if(s.preview||s.previewComputing)fail('PREVIEW_ACTIVE','context','Apply or cancel the UI preview');if(s.busy)fail('CAPABILITY_UNAVAILABLE','context','Worker is busy');}
  function token(value,s,bodyId,kind){
    string(value,'selectionToken',2048);const t=tokens.get(value);
    if(!t||t.documentInstanceId!==s.documentInstanceId||t.revision!==s.revision)fail('STALE_REFERENCE','selectionToken','Selection is not in the current snapshot','QUERY_GEOMETRY_AGAIN');
    if(t.bodyId!==bodyId||t.kind!==kind)fail('SELECTION_CONFLICT','selectionToken','Selection kind/body does not match references');
    return t;
  }
  async function verifyToken(t){const result=await adapter.query({bodyId:t.bodyId,kind:t.kind,filter:{}});if(result.geometryFingerprint!==t.geometryFingerprint)fail('STALE_REFERENCE','selectionToken','Geometry fingerprint changed','QUERY_GEOMETRY_AGAIN');}
  function getState(input={}){
    const requestId=uid();let s;
    try{s=snapshot();object(input,['sessionId','include'],'input');string(input.sessionId,'sessionId');if(input.sessionId!==s.sessionId)fail('INSTANCE_MISMATCH','sessionId','Unknown current session');
      const include=input.include??['summary','bodies','capabilities'];
      if(!Array.isArray(include)||include.some(x=>!['summary','features','bodies','selection','capabilities'].includes(x)))fail('PARAM_SCHEMA_INVALID','include','Unknown state field');
      const r={status:'read',context:contextOf(s),persistence:s.persistence,preview:{active:!!s.preview,computing:!!s.previewComputing}};
      if(include.includes('summary'))r.summary={name:s.documentName,featureCount:s.features.length,bodyCount:s.bodies.length,busy:s.busy,kernelReady:s.kernelReady,dirty:!!s.dirty};
      if(include.includes('features'))r.features=clone(s.features);
      if(include.includes('bodies'))r.bodies=clone(s.bodies);
      if(include.includes('selection'))r.selection={bodyIds:clone(s.selectedIds),topology:clone(s.selectedTopology)};
      if(include.includes('capabilities'))r.capabilities={runtimeAvailability:s.kernelReady&&!s.busy&&!s.preview&&!s.previewComputing?'available':'not_ready',executeV2Operations:[...migratedOperationIds],geometryQuery:{faces:['plane'],edges:['line','circle'],loopRole:false},idempotencyGuarantee:'same document runtime instance; memory only; no cross-reload guarantee'};
      return r;
    }catch(e){return errorResult(e,requestId,s);}
  }
  async function queryGeometry(input){
    const requestId=uid();let s;
    try{s=snapshot();object(input,['context','bodyId','kind','filter','requireUnique','limit','cursor'],'input');context(input.context,s);available(s);
      string(input.bodyId,'bodyId');if(!s.bodies.some(b=>b.id===input.bodyId))fail('STALE_REFERENCE','bodyId','Body is not current');
      if(!['face','edge'].includes(input.kind))fail('PARAM_SCHEMA_INVALID','kind','Expected face or edge');
      if(input.requireUnique!==undefined&&typeof input.requireUnique!=='boolean')fail('PARAM_SCHEMA_INVALID','requireUnique','Expected boolean');
      const limit=input.limit??20;integer(limit,'limit',1,100);
      const filter=clone(input.filter??{});finiteTree(filter,'filter');
      object(filter,input.kind==='face'?['surfaceType','normal','atExtreme']:['curveType','lengthRangeMm','radiusRangeMm','onFaceToken'],'filter');
      if(filter.onFaceToken!==undefined){const t=token(filter.onFaceToken,s,input.bodyId,'face');if(t.ids.length!==1)fail('AMBIGUOUS_SELECTION','filter.onFaceToken','One face is required');await verifyToken(t);filter.onFaceId=t.ids[0];delete filter.onFaceToken;}
      const result=await adapter.query({bodyId:input.bodyId,kind:input.kind,filter});
      context(input.context,snapshot());available(snapshot());
      if(result.matchCount===0)fail('NO_MATCH','filter','No geometry matches','QUERY_GEOMETRY_AGAIN');
      if((input.requireUnique??true)&&result.matchCount>1){const r=errorResult(domainError('AMBIGUOUS_SELECTION','filter','More than one match','REFINE_QUERY'),requestId,s);return {...r,matchCount:result.matchCount,items:result.items.slice(0,limit),ambiguous:true,context:contextOf(s)};}
      const fingerprint=canonical({context:input.context,bodyId:input.bodyId,kind:input.kind,filter,requireUnique:input.requireUnique??true,limit});
      let offset=0;
      if(input.cursor!==undefined){string(input.cursor,'cursor',2048);const c=cursors.get(input.cursor);if(!c||c.fingerprint!==fingerprint)fail('STALE_REFERENCE','cursor','Cursor does not match this snapshot/query');offset=c.offset;}
      if(tokens.size>=1000||cursors.size>=1000)fail('RESOURCE_LIMIT','query','Selection cache is full; reload to start a new instance');
      const selectionToken=uid();tokens.set(selectionToken,{documentInstanceId:s.documentInstanceId,revision:s.revision,bodyId:input.bodyId,kind:input.kind,ids:result.items.map(x=>x.topologyId),geometryFingerprint:result.geometryFingerprint});
      let nextCursor=null;if(offset+limit<result.matchCount){nextCursor=uid();cursors.set(nextCursor,{fingerprint,offset:offset+limit});}
      return {status:'read',context:contextOf(s),bodyId:input.bodyId,kind:input.kind,matchCount:result.matchCount,items:result.items.slice(offset,offset+limit),selectionToken,nextCursor,ambiguous:result.matchCount>1,geometryFingerprint:result.geometryFingerprint};
    }catch(e){return errorResult(e,requestId,s);}
  }
  async function executeOnce(input,options){
    const requestId=options.requestId??uid();let s,key,fingerprint,revisionBefore;
    try{
      s=snapshot();object(input,['context','idempotencyKey','action','args'],'input');context(input.context,s,{revision:false});
      string(input.idempotencyKey,'idempotencyKey',128);key=input.idempotencyKey;
      fingerprint=canonical({...input,context:{...input.context,sessionId:undefined}});
      const previous=receipts.get(key);
      if(previous){if(previous.fingerprint!==fingerprint)fail('IDEMPOTENCY_KEY_REUSED','idempotencyKey','Key has a different payload');return clone(previous.result);}
      context(input.context,s);available(s);finiteTree(input);
      if(receipts.size>=1000)fail('RESOURCE_LIMIT','idempotencyKey','1000 receipts per document instance; no receipts are silently evicted');
      if(options.signal?.aborted)fail('CANCELLED','context','Cancelled before commit');
      const a=clone(input.args);let command,args,op,refs=[];
      switch(input.action){
        case 'feature.add':{
          object(a,['op','opVersion','schemaHash','params','refs','name','selectionToken'],'args');string(a.op,'args.op',60);op=a.op;
          contract(op,a);ids(a.refs,'args.refs');validateOperationRefs(op,a.refs);refs=a.refs;
          if(refs.some(id=>!s.bodies.some(b=>b.id===id)))fail('STALE_REFERENCE','args.refs','Reference is not a current body');
          if(a.selectionToken!==undefined){
            if(!['fillet','chamfer','shell','faceHole'].includes(op))fail('SELECTION_CONFLICT','args.selectionToken','Operation does not accept a token');
            if(!a.params||['edgeIds','faceIds','faceId','allEdges'].some(k=>Object.hasOwn(a.params,k)))fail('SELECTION_CONFLICT','args.params','Token conflicts with explicit topology');
            // Validate user input before injecting trusted topology indices.
            normalizeOperationParams(op,a.params,{phase:'input',selectionToken:a.selectionToken});
            const t=token(a.selectionToken,s,refs[0],['fillet','chamfer'].includes(op)?'edge':'face');await verifyToken(t);
            if(op==='faceHole'&&t.ids.length!==1)fail('AMBIGUOUS_SELECTION','selectionToken','One face is required');
            if(['fillet','chamfer'].includes(op))a.params.edgeIds=t.ids;else if(op==='shell')a.params.faceIds=t.ids;else a.params.faceId=t.ids[0];
          }
          a.params=parameters(op,a.params);if(a.name!==undefined)string(a.name,'args.name',120);
          command='add_feature';args={op,params:a.params,refs,name:a.name};break;
        }
        case 'feature.edit':{
          object(a,['featureId','opVersion','schemaHash','params','name'],'args');string(a.featureId,'args.featureId');
          const index=s.features.findIndex(f=>f.id===a.featureId);if(index<0)fail('STALE_REFERENCE','args.featureId','Unknown feature');
          const feature=s.features[index];op=feature.op;contract(op,a);
          if(a.params&&Object.keys(a.params).length&&s.features.slice(index+1).some(f=>['edgeIds','faceIds','faceId'].some(k=>Object.hasOwn(f.params,k))))fail('UNSAFE_LEGACY_REFERENCE','args.featureId','Downstream index references cannot be proven stable; edit rejected','RESELECT_TOPOLOGY');
          const params=migratedOperationIds.includes(op)?normalizeOperationPatch(op,feature.params,a.params):parameters(op,{...feature.params,...a.params});if(a.name!==undefined)string(a.name,'args.name',120);
          command='edit_feature';args={featureId:a.featureId,params,name:a.name};break;
        }
        case 'document.parameters':
          object(a,['parameters','bindings'],'args');object(a.parameters,Object.keys(a.parameters||{}),'args.parameters');finiteTree(a.parameters);
          if(a.bindings!==undefined){object(a.bindings,Object.keys(a.bindings||{}),'args.bindings');finiteTree(a.bindings);}
          command='set_parameters';args=clone(a);break;
        case 'feature.remove':object(a,['bodyIds'],'args');ids(a.bodyIds,'args.bodyIds',true);if(a.bodyIds.some(id=>!s.bodies.some(b=>b.id===id)))fail('STALE_REFERENCE','args.bodyIds','Body is not current');refs=a.bodyIds;command='remove';args={ids:refs};break;
        case 'history.undo':case 'history.redo':case 'document.refresh':object(a,[],'args');command=input.action.split('.')[1];args={};break;
        default:fail('PARAM_SCHEMA_INVALID','action','Unsupported action');
      }
      context(input.context,snapshot());available(snapshot());revisionBefore=s.revision;
      await adapter.execute(command,args,{signal:options.signal,expectedRevision:s.revision});
      const after=snapshot();let result;
      if(after.revision===revisionBefore)result={status:'no_change',requestId,context:contextOf(after),commitState:'not_committed'};
      else{
        const createdFeatureIds=after.features.filter(f=>!s.features.some(x=>x.id===f.id)).map(f=>f.id);
        const createdBodyIds=after.bodies.filter(b=>!s.bodies.some(x=>x.id===b.id)).map(b=>b.id);
        result={status:'committed',requestId,transactionId:uid(),documentId:after.documentId,documentInstanceId:after.documentInstanceId,revisionBefore,revisionAfter:after.revision,createdFeatureIds,createdBodyIds,replacements:s.bodies.filter(b=>!after.bodies.some(x=>x.id===b.id)).flatMap(b=>createdBodyIds.map(id=>({before:b.id,after:id}))),validation:{geometry:'passed',...(['hole','multiHole','faceHole'].includes(op)?{materialRemoved:true}:{})},persistence:after.persistence,warnings:after.warnings??[]};
      }
      receipts.set(key,{fingerprint,result:clone(result)});return result;
    }catch(e){
      const now=snapshot();let result=errorResult(e,requestId,now);
      if(revisionBefore!==undefined&&now.documentInstanceId===s.documentInstanceId&&now.revision!==revisionBefore)result={status:'unknown',requestId,idempotencyKey:key,commitState:'unknown',error:{code:'RESULT_UNKNOWN',path:'result',message:e.message,retryable:false,recoveryAction:'READ_STATE_AND_REPLAN'}};
      // Preserve an existing receipt even on a conflicting reuse.
      if(key&&fingerprint&&!receipts.has(key)&&receipts.size<1000)receipts.set(key,{fingerprint,result:clone(result)});
      return result;
    }
  }
  function execute(input,options={}){const job=tail.then(()=>executeOnce(input,options));tail=job.catch(()=>{});return job;}
  function fileCommand(input,options={}){
    const run=async()=>{
      const requestId=options.requestId??uid();let before;
      try{
        before=snapshot();object(input,['context','action','args'],'input');context(input.context,before);available(before);
        if(!['new','open','import','save','export'].includes(input.action))fail('PARAM_SCHEMA_INVALID','action','Unknown file action');
        const result=await adapter.execute(`file_${input.action}`,input.args??{},{...options,expectedRevision:before.revision});
        const after=snapshot(),readOnly=['save','export'].includes(input.action);return {status:readOnly?'read':'committed',requestId,context:contextOf(readOnly?before:after),...result};
      }catch(error){
        const after=snapshot();
        if(before&&(before.revision!==after.revision||before.documentInstanceId!==after.documentInstanceId))return {status:'unknown',commitState:'unknown',requestId,error:{code:'RESULT_UNKNOWN',path:'result',message:error.message,retryable:false,recoveryAction:'READ_STATE_AND_REPLAN'}};
        return errorResult(error,requestId,after);
      }
    };
    const job=tail.then(run);tail=job.catch(()=>{});return job;
  }
  return {getState,queryGeometry,execute,fileCommand};
}
