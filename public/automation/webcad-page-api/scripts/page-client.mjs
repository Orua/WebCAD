// Optional host helper. The caller supplies an already authorized CDP adapter.
// No browser discovery, socket, service, CLI process or automatic retry lives here.
const methods=new Set(['copySelection','pasteSelection','createRequestContext','getUILayout','setRenderQuality','invoke','submit','getJob','cancelJob','connect','info','getState','searchTools','getTools','getTool','readDocs','queryGeometry','queryReferences','resolvePlacement','execute','measure','measureRelation','inspectPrintability','inspectProfile','prepareProfileEdit','projectProfile','inspectFit','inspectThickness','inspectDraft','fitProfile','traceTwinWindow','executeText','setDisplayPreferences','getLogoConverter','setLogoConverter','convertLogoPdf','setView','redraw','capture','run']);
const files=new Set(['capabilities','register','new','open','import','save','export','read','download','write','release']);
function failure(code,message,details={}){return Object.assign(new Error(message),{code,...details});}
function encode(value){const text=JSON.stringify(value);if(text===undefined)throw failure('INPUT_INVALID','Arguments must be JSON values.');return text.replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');}
function pageExpression(method,args){
  const isFile=method.startsWith('files.'),name=isFile?method.slice(6):method;
  if(!(isFile?files:methods).has(name))throw failure('METHOD_UNKNOWN',`Unknown public page method: ${method}`);
  return `(async()=>{const api=window.webcad?.api;if(!api?.connect)throw new Error('Current WebCAD page API is unavailable');const owner=${isFile?'api.files':'api'};const method=${encode(name)};if(typeof owner?.[method]!=='function')throw new Error('Page method is unavailable: '+method);return await owner[method](${encode(args)});})()`;
}

export function createPageClient({send,keyFactory=()=>{if(!globalThis.crypto?.randomUUID)throw failure('KEY_GENERATOR_REQUIRED','Supply a unique keyFactory for a host without crypto.randomUUID.');return `agent-${globalThis.crypto.randomUUID()}`;}}={}){
  if(typeof send!=='function')throw failure('CHANNEL_REQUIRED','Supply the host\'s already authorized CDP send adapter.');
  let catalogHash;
  async function call(method,args={}){
    const expression=pageExpression(method,args);
    let response;
    try{response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});}
    catch(cause){throw failure('TRANSPORT_ERROR','The host did not return a page result; inspect state before retrying writes.',{cause});}
    if(response?.exceptionDetails)throw failure('PAGE_SCRIPT_ERROR',response.exceptionDetails.exception?.description||response.exceptionDetails.text||'Page script failed.',{exceptionDetails:response.exceptionDetails});
    if(!response?.result||!Object.hasOwn(response.result,'value'))throw failure('PAGE_RESULT_UNAVAILABLE','CDP returned no serializable page value.');
    return response.result.value;
  }
  async function connect(input={}){const connection=await call('connect',input);catalogHash=connection.catalogHash;return connection;}
  async function run(steps,{context,idempotencyKey}={}){
    if(!Array.isArray(steps)||steps.length<1||steps.length>20)throw failure('INPUT_INVALID','A batch needs 1 to 20 explicit steps.');
    if(!context||!['sessionId','documentId','documentInstanceId'].every(field=>typeof context[field]==='string'&&context[field])||!Number.isInteger(context.expectedRevision))throw failure('CONTEXT_REQUIRED','Supply the requestContext used to plan these steps.');
    const connection=await connect();
    if(connection.canExecute!==true)throw failure('PAGE_BLOCKED','The current page cannot execute this batch.',{blockers:connection.blockers||[]});
    const current=connection.requestContext;
    if(!current||!['sessionId','documentId','documentInstanceId','expectedRevision'].every(field=>current[field]===context[field]))throw failure('STALE_CONTEXT','The page changed after planning. Read state and replan; the helper will not silently adopt the new revision.',{plannedContext:context,currentContext:current});
    const key=idempotencyKey??keyFactory();
    if(typeof key!=='string'||!key.length||key.length>80)throw failure('INPUT_INVALID','The idempotency key must contain 1 to 80 characters.');
    const request=JSON.parse(encode({context,idempotencyKey:key,steps}));
    try{return await call('run',request);}
    catch(cause){throw failure('UNKNOWN_OUTCOME','The batch may have committed. Read current state and the original receipt before any retry.',{cause,outcome:'unknown',request,idempotencyKey:key,recovery:'READ_STATE_AND_REPLAN'});}
  }
  return Object.freeze({call,connect,run,getState:()=>call('getState'),readDocs:(docId,options={})=>call('readDocs',{docId,...options}),getTools:(ids,options={})=>call('getTools',{ids,...(catalogHash?{expectedCatalogHash:catalogHash}:{}),...options})});
}

export function findRoutes(index,query,{limit=10}={}){
  if(typeof query!=='string'||!Number.isInteger(limit)||limit<1||limit>50)throw failure('INPUT_INVALID','Use a string query and a result limit from 1 to 50.');
  const routes=index?.routes??index;
  if(!routes||Array.isArray(routes)||typeof routes!=='object')throw failure('INPUT_INVALID','Expected the generated route object.');
  const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return Object.entries(routes).filter(([id,route])=>terms.every(term=>`${id} ${route.label||index.labels?.[id]||''} ${(route.tools||[]).join(' ')} ${route.method||''} ${route.usage||''}`.toLocaleLowerCase().includes(term))).slice(0,limit).map(([action,route])=>({action,...(index.labels?.[action]?{label:index.labels[action]}:{}),...route}));
}
export async function findLocalRoutes(query,options={}){
  const {file=new URL('../routes.json',import.meta.url),...searchOptions}=options;
  const {readFile}=await import('node:fs/promises');
  return findRoutes(JSON.parse(await readFile(file,'utf8')),query,searchOptions);
}
