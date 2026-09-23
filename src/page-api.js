import {infoMetadata,searchTools,getTool,readDocs} from './page-api-docs.js';
import {createBrowserFiles} from './browser-files.js';

// Only structured, bounded commands cross this boundary. No mutable app objects escape.
export function createPageAPI(host){
  const current=()=>host.state();
  const failure=e=>({status:'failed',commitState:'not_committed',error:{code:e.code||'PARAM_SCHEMA_INVALID',message:e.message},context:current().context});
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
  const guarded=fn=>async(input={})=>{try{return await fn(input);}catch(e){return failure(e);}};
  const files=createBrowserFiles({command:input=>host.files(input),confirmSaved:host.confirmSaved});
  const api={
    info:()=>({...infoMetadata({buildId:host.buildId,browserReady:current().summary.kernelReady}),transport:'in-page',context:current().context,page:{url:location.href,topLevel:window===window.top},display:host.display()}),
    getState:(input={})=>({...host.state(input),display:host.display()}),
    searchTools:input=>searchTools(input,{browserReady:current().summary.kernelReady}),getTool,readDocs,
    execute:input=>host.execute(input),queryGeometry:input=>host.query(input),
    measure:guarded(async input=>{
      check(input,['context','bodyId','kind','topologyId']);
      if(!current().bodies.some(b=>b.id===input.bodyId))fail('STALE_REFERENCE','Unknown current body');
      if(input.kind!==undefined&&!['body','face','edge'].includes(input.kind))fail('PARAM_SCHEMA_INVALID','kind must be body, face or edge');
      if(input.kind&&input.kind!=='body'&&(!Number.isSafeInteger(input.topologyId)||input.topologyId<0))fail('PARAM_SCHEMA_INVALID','A nonnegative topologyId is required');
      const result=await host.measure(input);check(input,['context','bodyId','kind','topologyId']);
      return {status:'read',source:'exact-brep',units:{length:'mm',volume:'mm^3'},context:current().context,...result};
    }),
    setView:guarded(async input=>{
      check(input,['context','direction','projection','fit','selectedIds']);
      if(input.direction&&!['top','bottom','front','back','left','right','side','iso'].includes(input.direction))fail('PARAM_SCHEMA_INVALID','Unknown view');
      if(input.projection&&!['orthographic','perspective'].includes(input.projection))fail('PARAM_SCHEMA_INVALID','Unknown projection');
      if(input.selectedIds&&(!Array.isArray(input.selectedIds)||input.selectedIds.some(id=>!current().bodies.some(b=>b.id===id))))fail('STALE_REFERENCE','Unknown selected body');
      await host.view(input);return {status:'read',context:current().context,display:host.display()};
    }),
    redraw:guarded(async input=>{check(input,['context']);await host.redraw();return {status:'read',context:current().context,display:host.display()};}),
    capture:guarded(async input=>{
      check(input,['context']);await host.frame();check(input,['context']);
      const display=host.display(),state=current();
      if(display.status!=='rendered'||['documentId','documentInstanceId','revision'].some(k=>display.rendered?.[k]!==state.context[k]))fail('DISPLAY_FAILED','Rendered frame does not match the committed model; call redraw');
      const dataUrl=host.capture();
      return {status:'read',mime:'image/png',dataUrl,context:current().context,display};
    }),files:Object.freeze(files),
  };
  return Object.freeze(api);
}
