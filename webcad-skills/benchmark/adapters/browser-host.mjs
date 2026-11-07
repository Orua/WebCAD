import {m05CommittedCutScope} from './radial-hole-receipts.mjs';
import {sewnSurfaceCaseIds,sewnSurfaceToolIds,sewnSurfaceRecipe,observeSewnSurface} from './sewn-surface-cases.mjs';
import {shellDetailCaseIds,shellDetailToolIds,runShellDetail,observeShellDetail} from './shell-detail-cases.mjs';
import {graphSurfaceCaseIds,graphSurfaceToolIds,runGraphSurface,observeGraphSurface} from './graph-surface-cases.mjs';
import {bentSectionCaseIds,bentSectionToolIds,s05Recipe,observeBentSection} from './bent-section-cases.mjs';
import {spatialSweepCaseIds,spatialSweepToolIds,s04Recipe,observeSpatialSweep} from './spatial-sweep-cases.mjs';
import {sampleCoordinates} from './host-math.mjs';
import {twistCaseIds,twistToolIds,s01Recipe,observeTwistCase} from './twist-cases.mjs';
import {assertModelHistoryArgs,executeModelHistory} from './model-history.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {createPageClient} from '../../../skills/webcad-page-api/scripts/page-client.mjs';
import {judgeGeometry} from '../oracle/judge.mjs';
import {basicCaseIds,basicToolIds,runAdditionalBasicCase,observeAdditionalBasicCase} from './basic-cases.mjs';
import {fixtureIndex} from '../runner.mjs';
import {compositeCaseIds,compositeToolIds,compositeRecipe,observeCompositeCase} from './composite-cases.mjs';
import {sectionCaseIds,sectionToolIds,s03Recipe,observeSectionCase} from './section-cases.mjs';
import {surfaceCaseIds,surfaceToolIds,s06Recipe,observeSurfaceCase} from './surface-cases.mjs';
import {ellipseCaseIds,ellipseToolIds,s02Recipe,observeEllipseCase} from './ellipse-cases.mjs';
import {bendCaseIds,bendToolIds,m03Recipe,observeBendCase} from './bend-cases.mjs';
import {radialHoleCaseIds,radialHoleToolIds,runRadialHoleCase,observeRadialHoleCase} from './radial-hole-cases.mjs';
import {closedWireCaseIds,closedWireToolIds,m02Recipe,observeClosedWireCase} from './closed-wire-cases.mjs';
const hostCaseIds=[...sewnSurfaceCaseIds,...shellDetailCaseIds,...graphSurfaceCaseIds,...bentSectionCaseIds,...spatialSweepCaseIds,...twistCaseIds,...basicCaseIds,...compositeCaseIds,...sectionCaseIds,...surfaceCaseIds,...ellipseCaseIds,...bendCaseIds,...radialHoleCaseIds,...closedWireCaseIds];

const hash=value=>createHash('sha256').update(value instanceof Uint8Array?value:typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const fail=(code)=>{throw Object.assign(Error(code),{code});};
const terminal=new Set(['completed','partial','failed','canceled','cancelled']);
const readMethods=new Set(['getState','getTools','getTool','readDocs','searchTools','measure','queryGeometry','inspectDesign','getHistory','getDebugReport']);
export function assertLocalTaskUrl(url){
 const parsed=new URL(url);
 if(parsed.origin!=='http://localhost'||parsed.pathname!=='/webcad/')fail('TASK_LOCALHOST_WEBCAD_REQUIRED');
 return parsed.href;
}
export function createPlaywrightTransport(page,{owned=false}={}){
 if(!owned||typeof page?.evaluate!=='function')fail('HOST_OWNED_PAGE_REQUIRED');
 assertLocalTaskUrl(page.url());
 return async(method,params)=>{
  assertLocalTaskUrl(page.url());
  if(method!=='Runtime.evaluate'||!params.awaitPromise||!params.returnByValue)fail('UNSUPPORTED_TRANSPORT_METHOD');
  try{
   const result=await page.evaluate(`(async()=>{try{return {value:await (${params.expression})};}catch(error){return {pageError:{code:error.code??null,message:error.message??String(error)}};}})()`);
   return result.pageError?{exceptionDetails:{text:result.pageError.message,exception:{description:result.pageError.message},code:result.pageError.code}}:{result:{value:result.value}};
  }
  catch(error){throw Object.assign(Error('PLAYWRIGHT_PAGE_CALL_FAILED'),{code:'TRANSPORT_ERROR',cause:error});}
 };
}
// The caller supplies its already-authorized browser. This never launches a browser/server.
export function createPlaywrightPageFactory(browser,{url='http://localhost/webcad/',timeoutMs=60000}={}){
 assertLocalTaskUrl(url);
 if(typeof browser?.newContext!=='function')fail('AUTHORIZED_PLAYWRIGHT_BROWSER_REQUIRED');
 return async()=>{
  const context=await browser.newContext();let page;
  try{
   page=await context.newPage();await page.goto(url,{waitUntil:'domcontentloaded',timeout:timeoutMs});
   await page.waitForFunction(()=>window.webcad?.api?.getState().summary.kernelReady,{},{timeout:timeoutMs});
   return {owned:true,url:page.url(),send:createPlaywrightTransport(page,{owned:true}),close:()=>context.close()};
  }catch(error){await context.close();throw error;}
 };
}
async function evaluate(send,expression){
 const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(response?.exceptionDetails||!response?.result||!Object.hasOwn(response.result,'value'))fail('PAGE_VALUE_UNAVAILABLE');
 return response.result.value;
}
export function b01AnalyticReference(){
 const holes=[[-12,0],[12,0]],radius=2;
 const checks={positiveStock:40>0&&30>0&&4>0,containedHoles:holes.every(([x,y])=>Math.abs(x)+radius<20&&Math.abs(y)+radius<15),disjointHoles:24>2*radius,positiveRemainingVolume:4800-32*Math.PI>0};
 return {status:'UNVERIFIED',analyticStatus:Object.values(checks).every(Boolean)?'PASS':'FAIL',checks,volume:4800-32*Math.PI,reason:'Independent reference BRep, calibrated checker and STEP round-trip not yet supplied'};
}
function matchingContext(a,b){return a&&b&&['sessionId','documentId','documentInstanceId','expectedRevision'].every(k=>a[k]===b[k]);}
export async function readCompleteSelection(client,query){
 const selection=await client.readLocal({...query,maxChars:64000});
 const items=[];
 for(const item of selection.items){
  if(item.status==='read'){items.push(item);continue;}
  if(item.reason!=='CHAR_BUDGET')fail('COMPLETE_SELECTED_KNOWLEDGE_REQUIRED');
  const followup=await client.readLocal({[item.kind==='tool'?'toolIds':'docIds']:[item.id],maxChars:64000});
  if(followup.catalogHash!==selection.catalogHash||followup.docsHash!==selection.docsHash)fail('KNOWLEDGE_CHANGED_DURING_SELECTION');
  const complete=followup.items.find(result=>result.id===item.id);
  if(complete?.status!=='read')fail('COMPLETE_SELECTED_KNOWLEDGE_REQUIRED');
  items.push(complete);
 }
 return {...selection,items};
}

/**
 * openPage -> {owned:true,url,send,close}; each call creates an isolated task page.
 * knowledge -> explicit {baseUrl,directory,fetchImpl?}; directory is host-authorized storage.
 * runtime -> verified browser/OS/device/wasmHash identity; missing values stay null.
 * referenceValidator and independentReader are evaluator-only functions, never LLM tools.
 * persist({name,bytes,sha256}) must write AND read back bytes; return {sha256,verified:true}.
 */
export function createBrowserBenchmarkAdapter({openPage,knowledge,runtime={},modelTransport,referenceValidator,independentReader,persist,record}={}){
 if(typeof openPage!=='function')fail('TASK_PAGE_FACTORY_REQUIRED');
 if(!knowledge?.directory||knowledge.baseUrl!=='http://localhost/webcad/')fail('EXPLICIT_LOCAL_KNOWLEDGE_STORAGE_REQUIRED');
 const sessions=new Set();
 async function bind({signal}={}){
  const page=await openPage();
  if(page?.owned!==true||typeof page.send!=='function'||typeof page.close!=='function')fail('HOST_OWNED_PAGE_REQUIRED');
  assertLocalTaskUrl(page.url);
  try{
   const lifecycle={accepting:true};
   const send=async(method,params)=>{
    // The shared helper reconnects before dispatch. Gate the final mutation send,
    // so an abort during that asynchronous preparation cannot start a late write.
    if(/const method="(?:run|execute|submit|open|new|import)"/.test(params?.expression??'')){
     signal?.throwIfAborted();if(!lifecycle.accepting)fail('SESSION_STOPPED_BEFORE_DISPATCH');
    }
    return page.send(method,params);
   };
   const client=createPageClient({send,knowledge});
   const connection=await client.connect({toolIds:[...new Set([...basicToolIds,...Object.values(sewnSurfaceToolIds).flat(),...Object.values(shellDetailToolIds).flat(),...Object.values(graphSurfaceToolIds).flat(),...Object.values(bentSectionToolIds).flat(),...Object.values(spatialSweepToolIds).flat(),...Object.values(twistToolIds).flat(),...Object.values(compositeToolIds).flat(),...Object.values(sectionToolIds).flat(),...Object.values(surfaceToolIds).flat(),...Object.values(ellipseToolIds).flat(),...Object.values(bendToolIds).flat(),...Object.values(radialHoleToolIds).flat(),...Object.values(closedWireToolIds).flat()])],includeContracts:true});
   if(connection.canExecute!==true||connection.bodyCount!==0)fail('EMPTY_EXECUTABLE_TASK_PAGE_REQUIRED');
   if(connection.knowledgeStatus?.status!=='ready')fail('VERIFIED_LIVE_KNOWLEDGE_REQUIRED');
   await record?.({event:'page-bound',buildId:connection.buildId,pageApiVersion:connection.pageApiVersion,catalogHash:connection.catalogHash,docsHash:connection.docsHash,documentInstanceId:connection.context.documentInstanceId,knowledgeStatus:connection.knowledgeStatus.status});
   return {page,client,connection,lifecycle};
  }catch(error){await page.close();throw error;}
 }
 async function context(session){
  const state=await session.client.getState();
  if(state.context.documentInstanceId!==session.documentInstanceId)fail('TASK_DOCUMENT_CHANGED');
  return state.requestContext;
 }
 async function makeSession({input,signal}={}){
  if(input?.caseId&&!hostCaseIds.includes(input.caseId))fail('HOST_CASE_MAPPING_NOT_IMPLEMENTED');
  signal?.throwIfAborted();const bound=await bind({signal});
  if(signal?.aborted){await bound.page.close();signal.throwIfAborted();}
  const state=await bound.client.getState();
  const session={...bound,caseId:input?.caseId??'B01',documentInstanceId:state.context.documentInstanceId,llmSessionId:randomUUID(),initialStateHash:hash(state),bodyCount:state.summary.bodyCount,busy:state.summary.busy,pending:new Map(),unknown:[],resources:new Map(),accepting:true,lastGeometryFailed:false};
  sessions.add(session);
  session.debugReport=()=>session.client.call('getDebugReport',{limit:100,includeState:true,source:'agent'});
  session.knowledge=async({group,signal}={})=>{
   signal?.throwIfAborted();
   const workflow=sewnSurfaceCaseIds.includes(session.caseId)||shellDetailCaseIds.includes(session.caseId)?'api.workflow':graphSurfaceCaseIds.includes(session.caseId)?'api.workflow':session.caseId==='S05'?'api.guide.sweep-loft':session.caseId==='S04'?'api.guide.sweep-loft':session.caseId==='S06'?'api.workflow':session.caseId==='B02'||session.caseId==='M01'?'api.modeling.workflows.axisymmetric':session.caseId==='B03'?'api.modeling.workflows.finishing':'api.modeling.workflows.solid-section';
   const toolIds=sewnSurfaceToolIds[session.caseId]??shellDetailToolIds[session.caseId]??graphSurfaceToolIds[session.caseId]??bentSectionToolIds[session.caseId]??spatialSweepToolIds[session.caseId]??twistToolIds[session.caseId]??closedWireToolIds[session.caseId]??radialHoleToolIds[session.caseId]??bendToolIds[session.caseId]??ellipseToolIds[session.caseId]??surfaceToolIds[session.caseId]??sectionToolIds[session.caseId]??compositeToolIds[session.caseId]??(session.caseId==='B02'?['cylinder','cut']:session.caseId==='B03'?['box','transform','fillet','history.undo','history.redo']:['box','transform','multiHole']);
   const selection=await readCompleteSelection(session.client,{docIds:group==='A'?['api.run','api.workflow']:['api.modeling.start','api.modeling.guide',workflow,'api.run','api.workflow'],toolIds});
   if(selection.items.some(item=>item.status!=='read'))fail('COMPLETE_SELECTED_KNOWLEDGE_REQUIRED');
   const files=selection.items.map(({id,kind,text,card},order)=>({docId:id,kind,order,sha256:hash(text??card),chars:(text??JSON.stringify(card)).length,status:'read',exposure:id.startsWith('api.modeling')?'group-B-method':'shared-contract'}));
   const text=item=>item.text??JSON.stringify(item.card);
   session.sharedKnowledgeContent=selection.items.filter(item=>!item.id.startsWith('api.modeling')).map(text).join('\n\n');
   session.knowledgeFiles=files;
   // A retains the same safety/parameter contracts without additional modeling methods.
   return {verified:true,catalogHash:selection.catalogHash,docsHash:selection.docsHash,files,content:selection.items.filter(item=>item.id.startsWith('api.modeling')).map(text).join('\n\n')};
  };
  session.classify=async call=>{
   const {method,args={}}=parseCall(call);
   return {geometryAlternative:method==='run'&&session.lastGeometryFailed,mechanism:args.alternativeMechanism??null,loadsMethodology:method==='readDocs'&&String(args.docId).startsWith('api.modeling')||method==='run'&&(args.steps??[]).some(s=>s.method==='readDocs'&&String(s.args?.docId).startsWith('api.modeling'))};
  };
  session.execute=async(call,{signal}={})=>{
   signal?.throwIfAborted();if(!session.accepting)fail('SESSION_STOPPED');
   const {method,args={}}=parseCall(call);
   if(method==='sampleCoordinates'){
    try{const result=sampleCoordinates(args);await record({event:'host-coordinate-computation',args,result});return result;}
    catch(error){return {status:'failed',error:{code:'HOST_COORDINATE_INPUT_INVALID',message:error.message}};}
   }
   if(method==='files.capabilities')return session.client.call(method,{});
   if(method==='files.export'||method==='files.save'){
    if(method==='files.export'&&!['step','brep','stl'].includes(args.format))return {status:'failed',error:{code:'HOST_EXPORT_FORMAT_UNAVAILABLE',message:'Use step, brep or stl.'}};
    const extension=method==='files.save'?'webcad':args.format;
    let exported;
    try{exported=await artifact(session,method,args,`model-${randomUUID()}.${extension}`);}
    catch(error){
     if(error.code==='PAGE_SCRIPT_ERROR')return {status:'failed',error:{code:error.exceptionDetails?.code??error.code,message:error.message,nextAction:'Read the exact files method tool card and correct arguments. No geometry was changed.'}};
     throw error;
    }
    session.resources.set(exported.descriptor.resourceId,exported);
    return {...exported.descriptor,status:'completed',hostFile:exported.saved};
   }
   if(method==='files.read'||method==='files.download'){
    const resource=session.resources.get(args.resourceId);
    if(!resource)return {status:'failed',error:{code:'HOST_RESOURCE_NOT_OWNED',message:'Export or save this session resource first.'}};
    return {...resource.descriptor,status:'completed',byteLength:resource.bytes.length,hostFile:resource.saved,hostMaterialized:true};
   }
   if(method==='execute'){
    assertModelHistoryArgs(args);const current=await context(session);if(args.context&&!matchingContext(args.context,current))fail('STALE_MODEL_CONTEXT');
    return executeModelHistory({session,args,signal,context,record,run:action=>runSteps(session,[{id:'history',method:'execute',args:{action,args:{}}}],{key:`t03-model-history-${hash([session.documentInstanceId,call.id]).slice(0,40)}`,signal,trustedHistory:true})});
   }
   if(method!=='run'){
    if(!readMethods.has(method))return {status:'failed',error:{code:'MODEL_METHOD_NOT_ALLOWED',message:'Use the advertised WebCAD methods; no call was dispatched.'}};
    const current=await context(session);
    try{return await session.client.call(method,{...args,...(['getState','getTools','getTool','readDocs','searchTools','getDebugReport'].includes(method)?{}:{context:current})});}
    catch(error){
     // A read-only page validation failure is a tool result the model can correct.
     // A lost transport remains unknown and must not be replayed.
     if(error.code==='PAGE_SCRIPT_ERROR')return {status:'failed',error:{code:error.exceptionDetails?.code??error.code,message:error.message}};
     throw error;
    }
   }
   if(!Array.isArray(args.steps)||args.steps.length<1||args.steps.length>20||args.steps.some(s=>!['add','measure','queryGeometry','inspectDesign','readDocs'].includes(s.method))){
    return {status:'failed',error:{code:'BOUNDED_PUBLIC_STEPS_REQUIRED',message:'run requires 1..20 steps using add, measure, queryGeometry, inspectDesign or readDocs. Call files.save/export directly as webcad_call methods. Use execute only for history.undo/redo. No steps were dispatched.'}};
   }
   const current=await context(session);signal?.throwIfAborted();
   if(args.context&&!matchingContext(args.context,current))return {status:'failed',error:{code:'STALE_MODEL_CONTEXT',message:'Read getState().requestContext and correct the request; no steps were dispatched.'}};
   return runSteps(session,args.steps,{key:`t03-${hash([session.documentInstanceId,call.id]).slice(0,48)}`,signal});
  };
  session.model=async request=>{
   if(typeof record!=='function')fail('EVIDENCE_RECORDER_REQUIRED');
   if(!modelTransport?.request)fail('REAL_MODEL_TRANSPORT_REQUIRED');
   if(!session.sharedKnowledgeContent)fail('SHARED_PARAMETER_CONTRACTS_NOT_LOADED');
   const messages=structuredClone(request.messages);
   messages[0].content+='\n\nShared current safety and full parameter contracts:\n'+session.sharedKnowledgeContent;
   await record({event:'provider-request',llmSessionId:session.llmSessionId,knowledgeFiles:session.knowledgeFiles,messages});
   return modelTransport.request({...request,messages,llmSessionId:session.llmSessionId});
  };
  session.runDeterministic=async({input:task,maxToolCalls,signal})=>{
   if(sewnSurfaceCaseIds.includes(task.caseId)){if(maxToolCalls<1)fail('TOOL_BUDGET_EXHAUSTED');return runSteps(session,sewnSurfaceRecipe(task.caseId),{key:'sewn-'+randomUUID(),signal});}
   if(shellDetailCaseIds.includes(task.caseId))return runShellDetail({caseId:task.caseId,session,context,record,runSteps:(steps,options)=>runSteps(session,steps,options),signal,maxToolCalls});
   if(graphSurfaceCaseIds.includes(task.caseId))return runGraphSurface({caseId:task.caseId,session,context,record,runSteps:(steps,options)=>runSteps(session,steps,options),signal,maxToolCalls});
   if(task.caseId==='S05'){if(maxToolCalls<1)fail('TOOL_BUDGET_EXHAUSTED');return runSteps(session,s05Recipe(),{key:`s05-${randomUUID()}`,signal});}
   if(task.caseId==='S04'){if(maxToolCalls<1)fail('TOOL_BUDGET_EXHAUSTED');return runSteps(session,s04Recipe(),{key:`s04-${randomUUID()}`,signal});}
   if(task.caseId==='S01'){if(maxToolCalls<1)fail('TOOL_BUDGET_EXHAUSTED');return runSteps(session,s01Recipe(),{key:`t03-S01-${randomUUID()}`,signal});}
   if(task.caseId==='M02'){
    if(maxToolCalls<1)fail('TOOL_BUDGET_EXHAUSTED');
    return runSteps(session,m02Recipe(),{key:`t03-M02-${randomUUID()}`,signal});
   }
   if(task.caseId==='M05')return runRadialHoleCase({session,context,record,signal,maxToolCalls,
    runSteps:(steps,options)=>runSteps(session,steps,options),
    exportFirst:async()=>artifact(session,'files.export',{format:'step',ids:(await session.client.getState()).bodies.map(b=>b.id)},'M05-first-hole.step'),
    readFirst:independentReader?bytes=>independentReader({bytes,caseId:'M05',stage:'m05-first-hole'}):null});
   if(task.caseId==='M03'){
    if(maxToolCalls<1)fail('TOOL_BUDGET_EXHAUSTED');
    return runSteps(session,m03Recipe(),{key:`t03-M03-${randomUUID()}`,signal});
   }
   if(task.caseId==='S02'){
    if(maxToolCalls<1)fail('TOOL_BUDGET_EXHAUSTED');
    return runSteps(session,s02Recipe(),{key:`t03-S02-${randomUUID()}`,signal});
   }
   if(task.caseId==='S06'){
    if(maxToolCalls<1)fail('TOOL_BUDGET_EXHAUSTED');
    return runSteps(session,s06Recipe(),{key:`t03-S06-${randomUUID()}`,signal});
   }
   if(task.caseId==='S03'){
    if(maxToolCalls<1)fail('TOOL_BUDGET_EXHAUSTED');
    return runSteps(session,s03Recipe(),{key:`t03-S03-${randomUUID()}`,signal});
   }
   if(compositeCaseIds.includes(task.caseId)){
    if(maxToolCalls<1)fail('TOOL_BUDGET_EXHAUSTED');
    return runSteps(session,compositeRecipe(task.caseId),{key:`t03-${task.caseId}-${randomUUID()}`,signal});
   }
   if(['B02','B03'].includes(task.caseId))return runAdditionalBasicCase({caseId:task.caseId,session,context,record,signal,maxToolCalls,
    runSteps:(steps,options)=>runSteps(session,steps,options),
    history:(action,options)=>runSteps(session,[{id:'history',method:'execute',args:{action,args:{}}}],{...options,trustedHistory:true})});
   if(task.caseId!=='B01')fail('L1_RECIPE_NOT_IMPLEMENTED');
   if(maxToolCalls<1)fail('TOOL_BUDGET_EXHAUSTED');
   const place={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
   return runSteps(session,[
    {id:'stock',method:'add',args:{op:'box',params:{width:40,depth:30,height:4},refs:[],placement:place}},
    {id:'centered',method:'add',args:{op:'transform',params:{x:-20,y:-15,z:0},refs:[{$ref:'stock.createdBodyIds.0'}]}},
    {id:'drilled',method:'add',args:{op:'multiHole',params:{radius:2,depth:4,axis:'Z',direction:-1,points:[[-12,0,4],[12,0,4]]},refs:[{$ref:'centered.createdBodyIds.0'}]}},
   ],{key:`t03-b01-${randomUUID()}`,signal});
  };
  session.stopAndReconcile=async()=>{
   session.accepting=false;session.lifecycle.accepting=false;
   const unresolved=[];
   for(const [key,request] of session.pending){
    try{const receipt=await session.client.getBatchReceipt(request);await record?.({event:'original-receipt',key,receipt});if(!terminal.has(receipt?.receipt?.status??receipt?.status))unresolved.push(key);}
    catch{unresolved.push(key);}
   }
   if(session.unknown.length)unresolved.push(...session.unknown);
   const state=await session.client.getState();
   // Closing only a fully reconciled task context prevents late calls on the next case.
   if(unresolved.length||state.summary.busy)return {status:'unknown',unresolved,documentInstanceId:session.documentInstanceId};
   await session.page.close();sessions.delete(session);
   return {status:'terminal',closed:true,documentInstanceId:session.documentInstanceId};
  };
  return session;
 }
 async function runSteps(session,steps,{key,signal,trustedHistory=false}){
  if(typeof record!=='function')fail('EVIDENCE_RECORDER_REQUIRED');
  if(!Array.isArray(steps)||steps.length<1||steps.length>20||steps.some(s=>!['add','measure','queryGeometry','inspectDesign','readDocs'].includes(s.method)&&!(trustedHistory&&s.method==='execute'&&['history.undo','history.redo'].includes(s.args?.action)&&s.args?.args&&Object.keys(s.args.args).length===0)))fail('BOUNDED_PUBLIC_STEPS_REQUIRED');
  const request={context:await context(session),idempotencyKey:key,steps};
  if(session.pending.has(key))fail('DUPLICATE_KEY_RECONCILE_REQUIRED');
  signal?.throwIfAborted();session.pending.set(key,request);
  await record({event:'page-request',request});
  if(session.caseId==='M05')(session.committedEvents??=[]).push(structuredClone({event:'page-request',request}));
  const receipt=await session.client.run(steps,{context:request.context,idempotencyKey:key});
  await record({event:'page-receipt',requestKey:key,receipt});
  if(session.caseId==='M05')session.committedEvents.push(structuredClone({event:'page-receipt',requestKey:key,receipt}));
  session.lastGeometryFailed=['failed','partial'].includes(receipt.status)&&/^(?:GEOMETRY_INVALID|KERNEL_|OCCT_|BOOLEAN_)/.test(receipt.error?.code??'');
  if(terminal.has(receipt.status))session.pending.delete(key);
  return receipt;
 }
 async function readBytes(session,resourceId){
  const values=await evaluate(session.page.send,`(async()=>Array.from(await window.webcad.api.files.read(${JSON.stringify({resourceId,as:'bytes'})})))()`);
  if(!Array.isArray(values)||values.some(v=>!Number.isInteger(v)||v<0||v>255))fail('FILE_BYTE_TRANSPORT_INVALID');
  return Uint8Array.from(values);
 }
 async function artifact(session,method,args,name){
  const descriptor=await session.client.call(method,{context:await context(session),...args,name});
  const bytes=await readBytes(session,descriptor.resourceId);
  if(bytes.length!==descriptor.size||hash(bytes)!==descriptor.sha256)fail('ARTIFACT_BYTES_HASH_MISMATCH');
  let saved=null;
  if(persist){saved=await persist({scope:session.documentInstanceId,name,bytes,sha256:descriptor.sha256});if(!saved?.verified||saved.sha256!==descriptor.sha256)fail('HOST_ARTIFACT_WRITE_NOT_VERIFIED');}
  return {descriptor,bytes,saved};
 }
 async function observeB01(session){
  const current=await context(session),state=await session.client.getState();
  if(state.bodies.length!==1)fail('B01_REQUIRES_SINGLE_BODY');
  const bodyId=state.bodies[0].id;
  const measured=await session.client.call('measure',{context:current,bodyId});
  const rims=await session.client.call('queryGeometry',{context:current,bodyId,kind:'edge',filter:{curveType:'circle',radiusRangeMm:{min:1.99,max:2.01},lengthRangeMm:{min:4*Math.PI-.01,max:4*Math.PI+.01}},requireUnique:false,limit:20});
  const material=await session.client.call('inspectDesign',{context:current,requirements:[
   {id:'holeVoid',bodyId,kind:'material',points:[[-12,0,.5],[-12,0,2],[-12,0,3.5],[12,0,.5],[12,0,2],[12,0,3.5]],expected:'outside',evidence:{kind:'drawing',reference:'Synthetic B01 specification 1.0.0'}},
   {id:'materialKept',bodyId,kind:'material',points:[[0,0,2],[-19,-14,2],[19,14,2]],expected:'inside',evidence:{kind:'drawing',reference:'Synthetic B01 specification 1.0.0'}},
  ]});
  await record?.({event:'b01-page-readback',context:current,measured,rims,material});
  const grouped=new Map();
  for(const edge of rims.items??[]){const key=edge.center.slice(0,2).map(n=>Math.round(n*100)/100).join(',');const group=grouped.get(key)??[];group.push(edge);grouped.set(key,group);}
  const holes=[...grouped.values()].map(edges=>({x:edges[0].center[0],y:edges[0].center[1],diameter:2*(edges[0].radiusMm??edges[0].radius),minZ:Math.min(...edges.map(e=>e.center[2])),maxZ:Math.max(...edges.map(e=>e.center[2]))}));
  const bounds=Object.fromEntries(['X','Y','Z'].flatMap((axis,i)=>[[`min${axis}`,measured.bounds.min[i]],[`max${axis}`,measured.bounds.max[i]]]));
  const check=id=>{const raw=material.results?.find(r=>r.id===id);return {checkerId:'page.inspectDesign.material-samples',pass:raw?.verdict==='pass',evidence:raw??null};};
  return {geometry:{reader:{independent:false,source:'public-page-readback'},brepValid:null,units:'mm',targetType:measured.solidCount>0?'solid':'surface',solidCount:measured.solidCount,volume:measured.volume,bounds,holes,checks:{through:check('holeVoid'),retainedMaterial:check('materialKept')}},raw:{measured,rims,material},revision:current.expectedRevision};
 }
 const adapter={
  async preflight(){
   const {page,client,connection}=await bind();
   try{
    const info=await client.call('info');
    const sourceCommit=/^([a-f0-9]{40})(?:-|$)/.exec(connection.buildId??'')?.[1]??null;
    return {page:{buildId:connection.buildId,sourceCommit,catalogHash:connection.catalogHash,docsHash:connection.docsHash,wasmHash:runtime.wasmHash??null,browser:runtime.browser??null,os:runtime.os??null,device:runtime.device??null,toolSetHash:hash({methods:[...readMethods,'run','execute:history.undo/redo','host.sampleCoordinates','files.capabilities','files.export','files.save','files.read','files.download'],catalogHash:connection.catalogHash}),pageApiVersion:info.pageApiVersion??connection.pageApiVersion,canExecute:connection.canExecute,documentInstanceId:connection.context.documentInstanceId,knowledge:connection.knowledgeStatus},model:modelTransport?.identity??null,realModel:Boolean(modelTransport?.request&&modelTransport?.authorized),authorizedPageChannel:true,supportsAbort:true,supportsReconcile:true};
   }finally{await page.close();}
  },
  async validateReference({fixture}){
   if(!hostCaseIds.includes(fixture.caseId))return {status:'UNVERIFIED',reason:'HOST_CASE_MAPPING_NOT_IMPLEMENTED'};
   if(!referenceValidator)return sewnSurfaceCaseIds.includes(fixture.caseId)||shellDetailCaseIds.includes(fixture.caseId)||graphSurfaceCaseIds.includes(fixture.caseId)||bentSectionCaseIds.includes(fixture.caseId)||spatialSweepCaseIds.includes(fixture.caseId)||twistCaseIds.includes(fixture.caseId)||closedWireCaseIds.includes(fixture.caseId)||radialHoleCaseIds.includes(fixture.caseId)||bendCaseIds.includes(fixture.caseId)||compositeCaseIds.includes(fixture.caseId)||sectionCaseIds.includes(fixture.caseId)||surfaceCaseIds.includes(fixture.caseId)||ellipseCaseIds.includes(fixture.caseId)?{status:'UNVERIFIED',reason:'INDEPENDENT_REFERENCE_VALIDATOR_REQUIRED'}:{...b01AnalyticReference(),reason:'INDEPENDENT_REFERENCE_VALIDATOR_REQUIRED'};
   return referenceValidator({fixture});
  },
  openSession:makeSession,
  async inspect({session,caseId,signal}){
   if(!hostCaseIds.includes(caseId))fail('OBSERVATION_MAPPING_NOT_IMPLEMENTED');
   const observe=s=>sewnSurfaceCaseIds.includes(caseId)?observeSewnSurface({caseId,session:s,context,record}):shellDetailCaseIds.includes(caseId)?observeShellDetail({caseId,session:s,context,record}):graphSurfaceCaseIds.includes(caseId)?observeGraphSurface({caseId,session:s,context,record}):caseId==='B01'?observeB01(s):bentSectionCaseIds.includes(caseId)?observeBentSection({session:s,context,record}):spatialSweepCaseIds.includes(caseId)?observeSpatialSweep({session:s,context,record}):twistCaseIds.includes(caseId)?observeTwistCase({caseId,session:s,context,record}):closedWireCaseIds.includes(caseId)?observeClosedWireCase({caseId,session:s,context,record}):radialHoleCaseIds.includes(caseId)?observeRadialHoleCase({caseId,session:s,context,record}):bendCaseIds.includes(caseId)?observeBendCase({caseId,session:s,context,record}):ellipseCaseIds.includes(caseId)?observeEllipseCase({caseId,session:s,context,record}):surfaceCaseIds.includes(caseId)?observeSurfaceCase({caseId,session:s,context,record}):sectionCaseIds.includes(caseId)?observeSectionCase({caseId,session:s,context,record}):compositeCaseIds.includes(caseId)?observeCompositeCase({caseId,session:s,context,record}):observeAdditionalBasicCase({caseId,session:s,context,record});
   signal?.throwIfAborted();const observed=await observe(session);
   const step=await artifact(session,'files.export',{format:'step',ids:observed.exportBodyIds??(await session.client.getState()).bodies.map(b=>b.id)},caseId+'.step');
   const project=await artifact(session,'files.save',{},caseId+'.webcad');
   const capture=await session.client.call('capture',{context:await context(session),format:'png',maxWidth:1024});
   const screenshotBytes=Buffer.from(capture.dataUrl.split(',')[1],'base64');
   const shot=persist?await persist({scope:session.documentInstanceId,name:caseId+'.png',bytes:screenshotBytes,sha256:hash(screenshotBytes)}):null;
   let roundTripSession;
   try{
    roundTripSession=await makeSession({input:{caseId},signal});
    // Transfer bytes in a fixed host expression. No model-selected script or URL.
    const registered=await evaluate(roundTripSession.page.send,`(async()=>window.webcad.api.files.register({name:${JSON.stringify(caseId+'.step')},data:Uint8Array.from(atob(${JSON.stringify(Buffer.from(step.bytes).toString('base64'))}),c=>c.charCodeAt(0))}))()`);
    const openContext=await context(roundTripSession);roundTripSession.unknown.push('STEP_OPEN');
    const opened=await roundTripSession.client.call('files.open',{context:openContext,resourceId:registered.resourceId,unsaved:'fail'});
    if(opened.status==='failed'||opened.status==='unknown')fail('STEP_OPEN_FAILED_OR_UNKNOWN');
    roundTripSession.unknown=[];
    roundTripSession.documentInstanceId=(await roundTripSession.client.getState()).context.documentInstanceId;
    const reimported=await observe(roundTripSession);
    const originalGeometry=independentReader?await independentReader({bytes:step.bytes,caseId,stage:'original-export'}):observed.geometry;
    // Readback of the actual re-exported imported document, not the original bytes twice.
    const reread=await artifact(roundTripSession,'files.export',{format:'step'},caseId+'-roundtrip.step');
    const reimportGeometry=independentReader?await independentReader({bytes:reread.bytes,caseId,stage:'roundtrip-export'}):reimported.geometry;
    if(caseId==='M05'&&!session.workflowChecks?.cutScope){
     const workflow=m05CommittedCutScope({events:session.committedEvents,finalGeometry:originalGeometry,documentInstanceId:session.documentInstanceId,finalRevision:observed.revision});
     originalGeometry.checks.cutScope=workflow;reimportGeometry.checks.cutScope=workflow;await record({event:'m05-committed-cut-scope',check:workflow});
    }
    if(caseId==='M05'&&session.workflowChecks?.cutScope){
     const workflow=session.workflowChecks.cutScope;
     if(workflow.evidence.documentInstanceId!==session.documentInstanceId||workflow.evidence.finalContext.expectedRevision!==observed.revision)fail('M05_SCOPE_EVIDENCE_REVISION_MISMATCH');
     // This remains an explicitly named original-process assertion, inherited by
     // both final STEP judgments; neither final STEP independently proves history.
     originalGeometry.checks.cutScope=workflow;reimportGeometry.checks.cutScope=workflow;
    }
    if(caseId==='B03'&&session.workflowChecks?.undo){
     const workflow=session.workflowChecks.undo;
     if(workflow.evidence.redo.context.expectedRevision!==observed.revision)fail('UNDO_EVIDENCE_REVISION_MISMATCH');
     // Reuse the explicitly recorded original workflow assertion; STEP carries no history.
     originalGeometry.checks.undo=workflow;reimportGeometry.checks.undo=workflow;
    }
    await record({event:'basic-observations',caseId,original:observed,roundTrip:reimported,stepSha256:step.descriptor.sha256});
    return {geometry:originalGeometry,revision:observed.revision,stepBytes:step.bytes,projectSha256:project.saved?.verified?project.descriptor.sha256:null,screenshotSha256:shot?.verified&&shot.sha256===hash(screenshotBytes)?shot.sha256:null,roundTrip:{geometry:reimportGeometry,sourceSha256:step.descriptor.sha256,sourceRevision:observed.revision,documentInstanceId:roundTripSession.documentInstanceId}};
   }finally{
    if(roundTripSession){const cleanup=await roundTripSession.stopAndReconcile();if(cleanup.status!=='terminal')session.unknown.push(roundTripSession.documentInstanceId);}
   }
  },
  async runBasicDiagnostic({caseId='B01',signal}={}){
   if(!hostCaseIds.includes(caseId))fail('BASIC_DIAGNOSTIC_CASE_NOT_IMPLEMENTED');
   if(typeof record!=='function'||typeof persist!=='function')fail('L1_DIAGNOSTIC_EVIDENCE_STORAGE_REQUIRED');
   const reference=await adapter.validateReference({fixture:fixtureIndex().find(f=>f.caseId===caseId)});
   if(reference.status!=='PASS')return {recordType:'L1_DIAGNOSTIC_NOT_BASELINE',caseId,status:'BLOCKED',reason:'INDEPENDENT_REFERENCE_REQUIRED',reference};
   const session=await makeSession({input:{caseId},signal});let result;
   try{
    const receipt=await session.runDeterministic({input:{caseId},maxToolCalls:80,signal});
    if(receipt.status!=='completed'){result={recordType:'L1_DIAGNOSTIC_NOT_BASELINE',status:receipt.status==='failed'?'FAIL':'UNVERIFIED',receipt};return result;}
    const observation=await adapter.inspect({session,caseId,signal});
    const judgment=judgeGeometry(caseId,observation.geometry),roundTrip=judgeGeometry(caseId,observation.roundTrip.geometry);
    const verifiedArtifacts=observation.projectSha256&&observation.screenshotSha256;
    result={recordType:'L1_DIAGNOSTIC_NOT_BASELINE',caseId,status:[judgment.status,roundTrip.status].includes('FAIL')?'FAIL':judgment.status==='PASS'&&roundTrip.status==='PASS'&&verifiedArtifacts?'PASS':'UNVERIFIED',reference,judgment,roundTrip,artifacts:{stepSha256:hash(observation.stepBytes),stepBytes:observation.stepBytes.length,projectSha256:observation.projectSha256,screenshotSha256:observation.screenshotSha256},documentInstanceId:session.documentInstanceId};
    return result;
   }catch(error){
    result={recordType:'L1_DIAGNOSTIC_NOT_BASELINE',status:'BLOCKED',reason:error.code??'B01_DIAGNOSTIC_FAILED',message:error.message};
    try{
     const state=await session.client.getState();
     if(!state.summary.busy&&state.bodies.length){
      const last=await artifact(session,'files.save',{},caseId+'-last-confirmed.webcad');
      result.lastConfirmedProjectSha256=last.saved?.verified?last.descriptor.sha256:null;
     }
    }catch{result.lastConfirmedProjectSha256=null;}
    return result;
   }finally{if(result?.status!=='PASS')try{await record?.({event:'failure-debug-report',report:await session.debugReport()});}catch{}const cleanup=await session.stopAndReconcile();if(result){result.cleanup=cleanup;if(cleanup.status!=='terminal')result.status='BLOCKED';}}
  },
  runB01Diagnostic:options=>adapter.runBasicDiagnostic({...options,caseId:'B01'}),
  async reconcileOpenSessions(){
   const results=[];
   for(const session of [...sessions])results.push(await session.stopAndReconcile());
   return {status:results.every(result=>result.status==='terminal')?'terminal':'unknown',sessions:results};
  },
 };
 return Object.freeze(adapter);
}
function parseCall(call){
 if(call?.name!=='webcad_call'||!call.id)fail('BOUND_WEB_CAD_CALL_REQUIRED');
 const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
 if(!args||typeof args.method!=='string'||!args.args||typeof args.args!=='object'||Array.isArray(args.args))fail('PUBLIC_METHOD_ARGUMENTS_REQUIRED');
 return args;
}
