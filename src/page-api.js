import {infoMetadata,discoveryMetadata,searchTools,getTools,getTool,readDocs} from './page-api-docs.js';
import {createBrowserFiles} from './browser-files.js';
import {validateDisplayPreferences} from './display-preferences.js';
import {createPageBatch} from './page-batch.js';
import {readBrowserLogo} from './browser-logo-input.js';
import {getLogoConverterConfig,setLogoConverterConfig} from './logo-converter-settings.js';
import {compileTextCommands} from './text-commands.js';
import {fitProfilePoints} from './profile-fitting.js';
import {traceTwinWindowProfile} from './dwg-spline-twin-window.js';
import {normalizeRequest,requestContext} from './page-context.js';
import {createPageJobs} from './page-jobs.js';
import {renderQuality} from './render-quality.js';
import {UI_LAYOUT} from './ui-layout.js';
import {validateReferenceQuery} from './reference-query.js';

// Only structured, bounded commands cross this boundary. No mutable app objects escape.
export function createPageAPI(host){
  const current=()=>host.state();
  const failure=e=>({status:'failed',commitState:'not_committed',error:{code:e.code||'PARAM_SCHEMA_INVALID',message:e.message,path:e.path??null,retryable:false,recoveryAction:e.recoveryAction||(e.code==='REVISION_CONFLICT'?'READ_STATE_AND_REPLAN':'READ_TOOL_AND_CORRECT_PARAMS')},context:current().context});
  const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
  function check(input,keys,requiredContext=true){
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))fail('PARAM_SCHEMA_INVALID','Unexpected request fields');
    const s=current();
    if(requiredContext){
      const c=input.context;
      if(!c||Object.keys(c).some(k=>!['sessionId','documentId','documentInstanceId','expectedRevision'].includes(k)))fail('PARAM_SCHEMA_INVALID','Full context is required');
      for(const key of ['sessionId','documentId','documentInstanceId'])if(c[key]!==s.context[key])fail('INSTANCE_MISMATCH',`Stale ${key}`);
      if(c.expectedRevision!==s.context.revision)fail('REVISION_CONFLICT','Read current state and replan');
    }
    if(s.summary.busy||!s.summary.kernelReady||s.preview.active||s.preview.computing)fail('CAPABILITY_UNAVAILABLE','Finish computation/preview before this request');
    return s;
  }
  const guarded=fn=>async(input={})=>{try{return await fn(normalizeRequest(input));}catch(e){return failure(e);}};
  const rawFiles=createBrowserFiles({command:input=>host.files(input),confirmSaved:host.confirmSaved});
  const files=Object.fromEntries(Object.entries(rawFiles).filter(([key])=>key!=='previewInput').map(([key,fn])=>[key,input=>fn(normalizeRequest(input))]));
  const viewKeys=['context','direction','projection','fit','selectedIds','section','display','grid','snap','gizmo','selectionMode','camera','language'];
  const api={
    connect:(input={})=>{
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['queries','toolIds','limit','includeContracts','knownCatalogHash','knownDocsHash','knownHashes'].includes(k)))fail('PARAM_SCHEMA_INVALID','Unexpected connect fields');
      const queries=input.queries??[],limit=input.limit??5;
      if(!Array.isArray(queries)||queries.length>4||queries.some(q=>typeof q!=='string'||q.length>500)||!Number.isInteger(limit)||limit<1||limit>10)fail('PARAM_SCHEMA_INVALID','Use up to 4 queries of 500 characters and limit 1..10');
      if(input.includeContracts!==undefined&&typeof input.includeContracts!=='boolean')fail('PARAM_SCHEMA_INVALID','includeContracts must be boolean');
      const toolIds=input.toolIds??[];
      if(!Array.isArray(toolIds)||toolIds.length>20||new Set(toolIds).size!==toolIds.length||toolIds.some(id=>typeof id!=='string'||!id.length||id.length>150))fail('PARAM_SCHEMA_INVALID','toolIds must contain up to 20 unique tool IDs');
      for(const k of ['knownCatalogHash','knownDocsHash'])if(input[k]!==undefined&&(typeof input[k]!=='string'||!/^sha256:[a-f0-9]{64}$/.test(input[k])))fail('PARAM_SCHEMA_INVALID',`${k} must be a sha256 hash`);
      const s=current(),metadata=discoveryMetadata(),{revision,...identity}=s.context;
      const results=queries.map(query=>({query,...searchTools({query,limit},{browserReady:s.summary.kernelReady})}));
      const ids=[...new Set([...toolIds,...results.flatMap(result=>result.items.map(item=>item.id))])];
      const blockers=[...(!s.summary.kernelReady?['KERNEL_LOADING']:[]),...(s.summary.busy?['BUSY']:[]),...(s.preview?.active||s.preview?.computing?['PREVIEW_ACTIVE']:[])];
      const response={product:'WebCAD',buildId:host.buildId,transport:'in-page',...metadata,
        context:{...s.context},requestContext:{...identity,expectedRevision:revision},
        ...(s.referenceSystem?.workFrame?{reference:{version:1,workFrame:{origin:[...s.referenceSystem.workFrame.origin],quaternion:[...s.referenceSystem.workFrame.quaternion],locked:s.referenceSystem.workFrame.locked,frameVersion:s.referenceSystem.workFrame.frameVersion},placementVersion:1}}:{}),
        ready:s.summary.kernelReady,busy:s.summary.busy,preview:{active:s.preview?.active===true,computing:s.preview?.computing===true},
        canExecute:blockers.length===0, blockers,
        nextAction:blockers.includes('PREVIEW_ACTIVE')?'FINISH_PREVIEW':blockers.length?'WAIT_AND_RECONNECT':ids.length?'READ_CONTRACTS_AND_PLAN':'SEARCH_CAPABILITIES',
        bodies:(s.bodies||[]).slice(0,20).map(({id,name,kind})=>({id,...(name?{name}:{}),...(kind?{kind}:{})})),
        bodyCount:(s.bodies||[]).length,bodiesTruncated:(s.bodies||[]).length>20,
        cache:{catalogChanged:input.knownCatalogHash!==metadata.catalogHash,docsChanged:input.knownDocsHash!==metadata.docsHash},results};
      if((input.includeContracts||toolIds.length)&&ids.length){response.contracts=getTools({ids:ids.slice(0,20),knownHashes:input.knownHashes});response.contractIdsOmitted=ids.slice(20);}
      return response;
    },
    info:()=>({...infoMetadata({buildId:host.buildId,browserReady:current().summary.kernelReady}),transport:'in-page',context:current().context,page:{url:location.href,topLevel:window===window.top},display:host.display()}),
    getState:(input={})=>{const state=host.state(input);return {...state,requestContext:requestContext(state.context),display:host.display()};},
    getUILayout:()=>structuredClone(UI_LAYOUT),
    createRequestContext:(context=current().context)=>requestContext(context),
    searchTools:input=>searchTools(input,{browserReady:current().summary.kernelReady}),getTools,getTool,readDocs,
    execute:async input=>{let request;try{request=normalizeRequest(input);}catch(e){return failure(e);}let submitted=false;try{if(request?.action==='preview.start'&&request.args?.fileImport){const file=request.args.fileImport;if(Object.keys(request.args).some(key=>key!=='fileImport')||!file||typeof file!=='object'||Object.keys(file).some(key=>!['resourceId','name','placement'].includes(key)))fail('PARAM_SCHEMA_INVALID','File preview takes only fileImport with resourceId and placement');const source=await rawFiles.previewInput({resourceId:file.resourceId});request={...request,args:{fileImport:{...source,resourceId:file.resourceId,placement:file.placement}}};}submitted=true;return await host.execute(request);}catch(e){return submitted?{...failure(e),status:'unknown',commitState:'unknown',error:{...failure(e).error,recoveryAction:'INSPECT_STATE_BEFORE_RETRY'}}:failure(e);}},queryGeometry:guarded(input=>host.query(input)),
    queryReferences:guarded(async input=>{check(input,['context','bodyIds','kind','filter','limit','offset','requireUnique']);const request=validateReferenceQuery(input),result=await host.references(request);check(input,['context','bodyIds','kind','filter','limit','offset','requireUnique']);return result;}),
    resolvePlacement:guarded(async input=>{check(input,['context','op','params','refs','placement']);if(typeof input.op!=='string'||!Array.isArray(input.refs)||input.refs.some(id=>typeof id!=='string')||!input.params||typeof input.params!=='object')fail('PARAM_SCHEMA_INVALID','op, params and refs required');const result=await host.resolvePlacement(input);check(input,['context','op','params','refs','placement']);return result;}),
    setRenderQuality:guarded(async input=>{check(input,['context','quality']);renderQuality(input.quality);await host.quality(input.quality);check(input,['context','quality']);return {status:'applied',context:current().context,renderQuality:current().renderQuality,display:host.display()};}),
    measure:guarded(async input=>{
      check(input,['context','bodyId','kind','topologyId','points']);
      if(input.points!==undefined){
        if(input.bodyId!==undefined||input.kind!==undefined||input.topologyId!==undefined||!Array.isArray(input.points)||input.points.length!==2||input.points.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v))))fail('PARAM_SCHEMA_INVALID','Provide two finite XYZ points only');
        const delta=input.points[1].map((v,i)=>v-input.points[0][i]);
        return {status:'read',source:'provided-coordinates',units:{length:'mm'},distance:Math.hypot(...delta),delta,context:current().context};
      }
      if(!current().bodies.some(b=>b.id===input.bodyId))fail('STALE_REFERENCE','Unknown current body');
      if(input.kind!==undefined&&!['body','face','edge'].includes(input.kind))fail('PARAM_SCHEMA_INVALID','kind must be body, face or edge');
      if(input.kind&&input.kind!=='body'&&(!Number.isSafeInteger(input.topologyId)||input.topologyId<0))fail('PARAM_SCHEMA_INVALID','A nonnegative topologyId is required');
      const result=await host.measure(input);check(input,['context','bodyId','kind','topologyId']);
      return {status:'read',source:'exact-brep',units:{length:'mm',volume:'mm^3'},context:current().context,...result};
    }),
    inspectPrintability:guarded(async input=>{
      check(input,['context','bodyId','angleLimitDeg']);
      if(typeof input.bodyId!=='string'||!current().bodies.some(b=>b.id===input.bodyId))fail('STALE_REFERENCE','Unknown current body');
      const angleLimitDeg=input.angleLimitDeg??45;
      if(!Number.isFinite(angleLimitDeg)||angleLimitDeg<=0||angleLimitDeg>=90)fail('PARAM_RANGE_INVALID','angleLimitDeg must be between 0 and 90');
      const result=await host.inspectPrintability(input.bodyId,angleLimitDeg);
      check(input,['context','bodyId','angleLimitDeg']);
      return {status:'read',source:'viewer-tessellation-with-exact-brep-metadata',context:current().context,...result};
    }),
    fitProfile:guarded(async input=>{
      check(input,['context','kind','plane','points','maxResidualMm']);
      const result=fitProfilePoints(input);
      check(input,['context','kind','plane','points','maxResidualMm']);
      return {status:'read',context:current().context,...result};
    }),
    traceTwinWindow:guarded(async input=>{
      check(input,['context','outerLeft','outerRight','innerLeft','innerRight','barTopY','barBottomY','simplifyToleranceMm']);
      const {context,...curves}=input;
      const result=traceTwinWindowProfile(curves);
      check(input,['context','outerLeft','outerRight','innerLeft','innerRight','barTopY','barBottomY','simplifyToleranceMm']);
      return {...result,context:current().context};
    }),
    executeText:guarded(async input=>{
      check(input,['context','idempotencyKey','text','dryRun']);
      if(input.dryRun!==undefined&&typeof input.dryRun!=='boolean')fail('PARAM_SCHEMA_INVALID','dryRun must be boolean');
      const steps=compileTextCommands(input.text);
      if(input.dryRun)return {status:'read',source:'text-command-parser',steps,context:current().context};
      if(typeof input.idempotencyKey!=='string'||!input.idempotencyKey)fail('PARAM_SCHEMA_INVALID','idempotencyKey is required for execution');
      return api.run({context:input.context,idempotencyKey:input.idempotencyKey,steps});
    }),
    setView:guarded(async input=>{
      check(input,viewKeys);
      for(const [key,values] of Object.entries({display:['solid','edges','wire'],gizmo:['off','translate','rotate'],selectionMode:['body','face','edge'],language:['zh','en']}))if(input[key]!==undefined&&!values.includes(input[key]))fail('PARAM_SCHEMA_INVALID',`Unknown ${key}`);
      for(const key of ['grid','snap'])if(input[key]!==undefined&&typeof input[key]!=='boolean')fail('PARAM_SCHEMA_INVALID',`${key} must be boolean`);
      if(input.camera!==undefined){const c=input.camera;if(!c||typeof c!=='object'||Object.keys(c).some(k=>!['position','target'].includes(k))||[c.position,c.target].some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)))||c.position.every((v,i)=>v===c.target[i]))fail('PARAM_SCHEMA_INVALID','camera requires distinct finite XYZ position and target');}
      if(input.direction&&!['top','bottom','front','back','left','right','side','iso'].includes(input.direction))fail('PARAM_SCHEMA_INVALID','Unknown view');
      if(input.projection&&!['orthographic','perspective'].includes(input.projection))fail('PARAM_SCHEMA_INVALID','Unknown projection');
      if(input.fit!==undefined&&typeof input.fit!=='boolean')fail('PARAM_SCHEMA_INVALID','fit must be boolean');
      if(input.section&&(!['X','Y','Z'].includes(input.section.axis)||!Number.isFinite(input.section.position)||typeof input.section.enabled!=='boolean'))fail('PARAM_SCHEMA_INVALID','Section requires axis, finite position and enabled boolean');
      if(input.selectedIds&&(!Array.isArray(input.selectedIds)||input.selectedIds.length>200||new Set(input.selectedIds).size!==input.selectedIds.length||input.selectedIds.some(id=>!current().bodies.some(b=>b.id===id))))fail('STALE_REFERENCE','Unknown or duplicate selected body');
      await host.view(input);check(input,viewKeys);return {status:'read',context:current().context,display:host.display(),view:current().view};
    }),
    setDisplayPreferences:guarded(async input=>{check(input,['context','values']);const values=validateDisplayPreferences(input.values);const result=await host.preferences(values);return {status:'applied',context:current().context,...result};}),
    getLogoConverter:async()=>getLogoConverterConfig(),
    setLogoConverter:guarded(async input=>{check(input,['context','url','key']);const result=setLogoConverterConfig(input);return {status:'applied',context:current().context,...result};}),
    convertLogoPdf:guarded(async input=>{check(input,['context','name','data','targetWidthMm']);if(typeof input.name!=='string'||!input.name.toLowerCase().endsWith('.pdf')||!(input.data instanceof Uint8Array||input.data instanceof ArrayBuffer||input.data instanceof Blob))fail('PARAM_SCHEMA_INVALID','Provide PDF bytes and filename');const file=new File([input.data],input.name,{type:'application/pdf'});const logo=await readBrowserLogo(file,x=>x,{targetWidthMm:input.targetWidthMm});return {status:'read',context:current().context,logo};}),
    redraw:guarded(async input=>{check(input,['context']);await host.redraw();check(input,['context']);return {status:'read',context:current().context,display:host.display()};}),
    capture:guarded(async input=>{
      check(input,['context']);await host.frame();check(input,['context']);
      const display=host.display(),state=current();
      if(display.status!=='rendered'||['documentId','documentInstanceId','revision'].some(k=>display.rendered?.[k]!==state.context[k]))fail('DISPLAY_FAILED','Rendered frame does not match the committed model; call redraw');
      const dataUrl=host.capture();
      return {status:'read',mime:'image/png',dataUrl,context:current().context,display};
    }),files:Object.freeze(files),
  };
  const run=createPageBatch(api);
  api.run=guarded(input=>run(input));
  const callable=new Set([...Object.keys(api),...Object.keys(files).map(k=>`files.${k}`)]);
  api.invoke=async(input={})=>{
    try{
      if(!input||Object.keys(input).some(k=>!['method','args'].includes(k))||!callable.has(input.method))fail('PARAM_SCHEMA_INVALID','Unknown method; read info().methods');
      const [name,member]=input.method.split('.');
      return await (member?api[name][member](input.args):api[name](input.args));
    }catch(e){return e.result||failure(e);}
  };
  Object.assign(api,createPageJobs(api));
  for(const name of ['submit','getJob','cancelJob'])callable.add(name);
  return Object.freeze(api);
}
