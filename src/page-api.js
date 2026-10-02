import {layoutDrawing} from './drawing/technical-layout.js';
import {drawingSVG,drawingDXF,drawingPDF,drawingJPEG} from './drawing/drawing-export.js';
import {infoMetadata,discoveryMetadata,searchTools,getTools,getTool,readDocs} from './page-api-docs.js';
import {createBrowserFiles} from './browser-files.js';
import {FILE_ARGUMENT_KEYS} from './browser-file-contracts.js';
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
import {readVectorInput,selectVector} from './browser-vector-input.js';
import {connectVector} from './vector-import.js';

// Only structured, bounded commands cross this boundary. No mutable app objects escape.
export function createPageAPI(host){
  const current=()=>host.state();
  const failure=e=>({status:'failed',commitState:'not_committed',error:{code:e.code||'PARAM_SCHEMA_INVALID',message:e.message,path:e.path??null,retryable:false,recoveryAction:e.recoveryAction||(e.code==='REVISION_CONFLICT'?'READ_STATE_AND_REPLAN':'READ_TOOL_AND_CORRECT_PARAMS')},context:current().context});
  const fail=(code,message,path)=>{throw Object.assign(new Error(message),{code,...(path?{path}:{})});};
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
  const files=Object.fromEntries(Object.entries(FILE_ARGUMENT_KEYS).map(([key,keys])=>[key,(input={})=>{
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(name=>!keys.includes(name)))fail('PARAM_SCHEMA_INVALID',`Unexpected files.${key} arguments`);
    return rawFiles[key](normalizeRequest(input));
  }]));
  const viewKeys=['context','direction','projection','fit','selectedIds','section','display','grid','snap','gizmo','selectionMode','camera','language','temporaryDisplay','anchorVisible','panels'];
  const pasteReceipts=new Map();
  const vectorCache=new Map();
  const drawingCache=new Map();
  const api={
    getHistory:()=>host.history(),
    planAlignment:guarded(async input=>{check(input,['context','bodyIds','target','axes','sourceSide','targetSide','group','gapMm']);return {status:'read',...host.planAlignment(input),context:current().context};}),
    selectRectangle:guarded(async input=>{check(input,['context','rect','mode','additive']);if(input.additive!==undefined&&typeof input.additive!=='boolean')fail('PARAM_SCHEMA_INVALID','additive must be boolean');return host.selectRectangle(input);}),
    createDrawing:guarded(async input=>{
      const s=check(input,['context','bodyIds','projection','sections','hiddenLines']);
      if(!Array.isArray(input.bodyIds)||!input.bodyIds.length||input.bodyIds.length>40||new Set(input.bodyIds).size!==input.bodyIds.length||input.bodyIds.some(id=>!s.bodies.some(b=>b.id===id)))fail('STALE_REFERENCE','Select 1–40 current bodies');
      const drawing=await host.createDrawing(input);check(input,['context','bodyIds','projection','sections','hiddenLines']);
      const drawingId=crypto.randomUUID();while(drawingCache.size>=4)drawingCache.delete(drawingCache.keys().next().value);
      drawingCache.set(drawingId,{drawing,context:structuredClone(s.context)});
      return {status:'generated',drawingId,context:s.context,drawing,formats:['pdf','jpg','dxf','svg'],unavailableFormats:{dwg:'Browser LibreDWG build has no DWG writer'},svg:drawingSVG(layoutDrawing(drawing))};
    }),
    exportDrawing:guarded(async input=>{
      const s=check(input,['context','drawingId','format','disabledDimensions','title','paper','name']);const cached=drawingCache.get(input.drawingId);
      if(!cached||['documentInstanceId','revision'].some(k=>cached.context[k]!==s.context[k]))fail('STALE_REFERENCE','Regenerate drawing for current model');
      if(!['pdf','jpg','dxf','svg'].includes(input.format))fail('FORMAT_UNSUPPORTED','Supported: PDF, JPG, DXF, SVG. Native DWG writer unavailable.');
      if(input.paper!==undefined&&!['A4','A3'].includes(input.paper)||input.title!==undefined&&(typeof input.title!=='string'||input.title.length>70))fail('PARAM_SCHEMA_INVALID','Invalid paper or title');
      if(input.disabledDimensions!==undefined&&(!Array.isArray(input.disabledDimensions)||input.disabledDimensions.some(id=>!cached.drawing.dimensions.some(d=>d.id===id))))fail('PARAM_SCHEMA_INVALID','Unknown dimension');
      const scene=layoutDrawing(cached.drawing,input),format=input.format,data=format==='pdf'?drawingPDF(scene):format==='jpg'?await drawingJPEG(scene):new TextEncoder().encode(format==='svg'?drawingSVG(scene):drawingDXF(scene));
      check({context:input.context},['context']);return rawFiles.generated({bytes:data,name:input.name||'drawing.'+format,mime:{pdf:'application/pdf',jpg:'image/jpeg',dxf:'application/dxf',svg:'image/svg+xml'}[format],context:s.context});
    }),
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
      if((input.includeContracts||toolIds.length)&&ids.length){
        const contracts=getTools({ids:ids.slice(0,20),knownHashes:input.knownHashes});
        const omissions=ids.slice(20).map(id=>({id,reason:'ITEM_LIMIT'}));let automaticChars=0;
        // Pointed requests keep complete contracts. Broad search results must not
        // pull an entire template library into the agent's first handshake.
        contracts.items=contracts.items.filter(item=>{
          if(toolIds.includes(item.id)||item.status!=='read')return true;
          const chars=JSON.stringify(item.card).length;
          if(automaticChars+chars>64000){omissions.push({id:item.id,reason:'CHAR_BUDGET',chars});return false;}
          automaticChars+=chars;return true;
        });
        response.contracts=contracts;response.contractIdsOmitted=omissions.map(item=>item.id);
        response.contractReadPolicy={automaticCharBudget:64000,automaticChars,omissions,nextAction:omissions.length?'Use getTools({ids:contractIdsOmitted}) only for contracts needed by the plan; template.* cards already contain complete variant arguments.':null};
      }
      return response;
    },
    info:()=>({...infoMetadata({buildId:host.buildId,browserReady:current().summary.kernelReady}),transport:'in-page',context:current().context,page:{url:location.href,topLevel:window===window.top},display:host.display()}),
    getState:(input={})=>{const state=host.state(input);return {...state,requestContext:requestContext(state.context),display:host.display()};},
    getQuickModelUsage:guarded(input=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)fail('PARAM_SCHEMA_INVALID','getQuickModelUsage takes no fields');return {status:'read',...structuredClone(host.quickModelUsage()),context:current().context};}),
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
        const distance=Math.hypot(...delta);
        if(!Number.isFinite(distance))fail('PARAM_RANGE_INVALID','Coordinate difference exceeds finite measurement range');
        return {status:'read',source:'provided-coordinates',units:{length:'mm'},distance,delta,context:current().context};
      }
      const body=current().bodies.find(b=>b.id===input.bodyId);
      if(!body)fail('STALE_REFERENCE','Unknown current body');
      if(input.kind!==undefined&&!['body','face','edge'].includes(input.kind))fail('PARAM_SCHEMA_INVALID','kind must be body, face or edge');
      if(input.kind==='face'||input.kind==='edge'){
        if(!Number.isSafeInteger(input.topologyId)||input.topologyId<0)fail('PARAM_SCHEMA_INVALID','A nonnegative topologyId is required');
        const count=input.kind==='face'?body.faceCount:body.edgeCount;
        if(Number.isSafeInteger(count)&&input.topologyId>=count)fail('STALE_REFERENCE','Topology index is outside the current body; query geometry again');
      }else if(input.topologyId!==undefined)fail('PARAM_SCHEMA_INVALID','topologyId requires kind:face or kind:edge');
      const result=await host.measure(input);check(input,['context','bodyId','kind','topologyId','points']);
      return {status:'read',source:'exact-brep',units:{length:'mm',area:'mm^2',volume:'mm^3'},context:current().context,...result};
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
    inspectProfile:guarded(async input=>{
      check(input,['context','bodyId']);
      if(typeof input.bodyId!=='string'||!current().bodies.some(body=>body.id===input.bodyId))fail('STALE_REFERENCE','Unknown current profile body');
      const result=host.inspectProfile(input.bodyId);
      check(input,['context','bodyId']);
      return {status:'read',source:'saved-analytic-profile',units:{length:'mm'},context:current().context,bodyId:input.bodyId,...result};
    }),
    prepareProfileEdit:guarded(async input=>{
      const allowed=['context','bodyId','mode','entityId','targetId','edgeIds','endpoint','candidateId','startCandidateId','endCandidateId','keepSide','radiusMm','arcId','output'];check(input,allowed);
      if(typeof input.bodyId!=='string'||!current().bodies.some(body=>body.id===input.bodyId))fail('STALE_REFERENCE','Unknown current profile body');
      if(!['intersections','trim','extend','trimCircle','fillet'].includes(input.mode))fail('PARAM_SCHEMA_INVALID','Choose an analytic profile edit mode');
      if(input.edgeIds!==undefined){if(input.mode!=='fillet'||!Array.isArray(input.edgeIds)||input.edgeIds.length!==2||new Set(input.edgeIds).size!==2||input.edgeIds.some(id=>!Number.isSafeInteger(id)||id<0)||input.entityId!==undefined||input.targetId!==undefined)fail('PARAM_SCHEMA_INVALID','二维圆角须明确选择两条不同的当前边，不同时传入图元 ID');}
      else for(const key of ['entityId','targetId'])if(typeof input[key]!=='string'||!input[key].length||input[key].length>64)fail('PARAM_SCHEMA_INVALID','Stable entity IDs are required',key);
      for(const key of ['candidateId','startCandidateId','endCandidateId','arcId'])if(input[key]!==undefined&&(typeof input[key]!=='string'||!input[key].length||input[key].length>64))fail('PARAM_SCHEMA_INVALID','Invalid bounded ID',key);
      if(input.endpoint!==undefined&&!['start','end'].includes(input.endpoint)||input.keepSide!==undefined&&!['cw','ccw'].includes(input.keepSide)||input.output!==undefined&&!['wire','face'].includes(input.output))fail('PARAM_SCHEMA_INVALID','Invalid edit option');
      if(input.mode==='fillet'&&(!Number.isFinite(input.radiusMm)||input.radiusMm<=0||input.radiusMm>1e5||!input.arcId))fail('PARAM_RANGE_INVALID','Fillet requires an explicit positive radius and new arc ID');
      const result=await host.prepareProfileEdit(input);check(input,allowed);
      return {status:'read',source:'saved-analytic-profile',units:{length:'mm'},context:current().context,bodyId:input.bodyId,...result};
    }),
    inspectConstraints:guarded(async input=>{
      check(input,['context','bodyId']);
      if(typeof input.bodyId!=='string'||!current().bodies.some(body=>body.id===input.bodyId))fail('STALE_REFERENCE','Unknown current profile body');
      const result=await host.inspectConstraints(input.bodyId);check(input,['context','bodyId']);
      return {status:'read',source:'saved-local-constraint-graph',units:{length:'mm',angle:'degrees'},context:current().context,bodyId:input.bodyId,...result};
    }),
    projectProfile:guarded(async input=>{
      check(input,['context','bodyId','edgeIds','pointWorld','frame']);
      const edges=Array.isArray(input.edgeIds)&&input.edgeIds.length>0&&input.edgeIds.length<=100&&new Set(input.edgeIds).size===input.edgeIds.length&&input.edgeIds.every(id=>Number.isSafeInteger(id)&&id>=0);
      const point=Array.isArray(input.pointWorld)&&input.pointWorld.length===3&&input.pointWorld.every(Number.isFinite);
      if(edges===point)fail('PARAM_SCHEMA_INVALID','请选择一组精确边，或一个显式世界坐标点');
      if(edges&&(typeof input.bodyId!=='string'||!current().bodies.some(body=>body.id===input.bodyId)))fail('STALE_REFERENCE','来源实体不在当前工程');
      if(input.frame!==undefined){const f=input.frame;if(!f||!Array.isArray(f.origin)||f.origin.length!==3||f.origin.some(v=>!Number.isFinite(v))||!Array.isArray(f.quaternion)||f.quaternion.length!==4||f.quaternion.some(v=>!Number.isFinite(v))||Math.abs(Math.hypot(...f.quaternion)-1)>1e-6)fail('PARAM_SCHEMA_INVALID','目标平面快照无效');}
      const result=await host.projectProfile(input);check(input,['context','bodyId','edgeIds','pointWorld','frame']);
      return {status:'read',source:edges?'exact-brep-snapshot':'provided-coordinate',units:{length:'mm'},context:current().context,...result};
    }),
    inspectFit:guarded(async input=>{
      check(input,['context','bodyAId','bodyBId','toleranceMm','volumeThresholdMm3']);
      if(typeof input.bodyAId!=='string'||typeof input.bodyBId!=='string'||input.bodyAId===input.bodyBId||![input.bodyAId,input.bodyBId].every(id=>current().bodies.some(body=>body.id===id&&body.solidCount===1)))fail('STALE_REFERENCE','Select two distinct current single solid bodies');
      const toleranceMm=input.toleranceMm??1e-5,volumeThresholdMm3=input.volumeThresholdMm3??1e-6;
      if(!Number.isFinite(toleranceMm)||toleranceMm<0||toleranceMm>1||!Number.isFinite(volumeThresholdMm3)||volumeThresholdMm3<=0)fail('PARAM_RANGE_INVALID','Inspection tolerances must be finite positive values in mm and mm^3');
      const result=await host.inspectFit(input.bodyAId,input.bodyBId,toleranceMm,volumeThresholdMm3);
      check(input,['context','bodyAId','bodyBId','toleranceMm','volumeThresholdMm3']);
      return {status:'read',source:'exact-brep',units:{length:'mm',volume:'mm^3'},context:current().context,bodyAId:input.bodyAId,bodyBId:input.bodyBId,...result};
    }),
    inspectThickness:guarded(async input=>{
      check(input,['context','bodyId','mode','point','direction','faceAId','faceBId','toleranceMm']);
      if(typeof input.bodyId!=='string'||!current().bodies.some(body=>body.id===input.bodyId&&body.solidCount===1))fail('STALE_REFERENCE','选择一个当前单一封闭实体');
      if(!Array.isArray(input.point)||input.point.length!==3||input.point.some(v=>!Number.isFinite(v)))fail('PARAM_SCHEMA_INVALID','指定真实表面世界坐标点');
      const mode=input.mode??'ray';if(!['ray','faces'].includes(mode))fail('PARAM_SCHEMA_INVALID','厚度模式须为 ray 或 faces');
      if(mode==='ray'&&(!Array.isArray(input.direction)||input.direction.length!==3||input.direction.some(v=>!Number.isFinite(v))||Math.hypot(...input.direction)<1e-9))fail('PARAM_SCHEMA_INVALID','方向须指向材料内部');
      if(mode==='faces'&&(!Number.isSafeInteger(input.faceAId)||!Number.isSafeInteger(input.faceBId)||input.faceAId<0||input.faceBId<0||input.faceAId===input.faceBId))fail('PARAM_SCHEMA_INVALID','须选择两个不同的当前平面面片');
      const toleranceMm=input.toleranceMm??1e-5;if(!Number.isFinite(toleranceMm)||toleranceMm<=0||toleranceMm>0.1)fail('PARAM_RANGE_INVALID','容差须大于零且不超过 0.1 mm');
      const result=await host.inspectThickness({...input,mode,toleranceMm});check(input,['context','bodyId','mode','point','direction','faceAId','faceBId','toleranceMm']);
      return {status:'read',source:'exact-brep-intersection',units:{length:'mm'},context:current().context,...result};
    }),
    inspectDraft:guarded(async input=>{
      check(input,['context','bodyId','pullDirection','thresholdDeg']);
      if(typeof input.bodyId!=='string'||!current().bodies.some(body=>body.id===input.bodyId&&body.solidCount===1))fail('STALE_REFERENCE','选择一个当前单一封闭实体');
      if(!Array.isArray(input.pullDirection)||input.pullDirection.length!==3||input.pullDirection.some(v=>!Number.isFinite(v))||Math.hypot(...input.pullDirection)<1e-9)fail('PARAM_SCHEMA_INVALID','须提供非零拉出方向');
      if(!Number.isFinite(input.thresholdDeg)||input.thresholdDeg<0||input.thresholdDeg>=90)fail('PARAM_RANGE_INVALID','拔模检查阈值须在 0–90° 之间');
      const result=await host.inspectDraft(input);check(input,['context','bodyId','pullDirection','thresholdDeg']);
      return {status:'read',source:'exact-planar-normal',units:{angle:'degrees'},context:current().context,bodyId:input.bodyId,...result};
    }),
    measureRelation:guarded(async input=>{
      check(input,['context','mode','first','second','face','pointWorld']);
      if(!['shortest','centerDistance','axisAlignment','pointFace','parallelFaces'].includes(input.mode))fail('PARAM_SCHEMA_INVALID','未知关系测量模式');
      const validRef=ref=>{if(!ref||typeof ref!=='object'||Object.keys(ref).some(key=>!['bodyId','kind','topologyId'].includes(key))||!['body','edge','face'].includes(ref.kind))return false;const body=current().bodies.find(item=>item.id===ref.bodyId);if(!body)return false;return ref.kind==='body'?ref.topologyId===undefined:Number.isSafeInteger(ref.topologyId)&&ref.topologyId>=0&&ref.topologyId<(ref.kind==='edge'?body.edgeCount:body.faceCount);};
      if(input.mode==='pointFace'){if(!validRef(input.face)||input.face.kind!=='face'||!Array.isArray(input.pointWorld)||input.pointWorld.length!==3||input.pointWorld.some(v=>!Number.isFinite(v)))fail('STALE_REFERENCE','需要当前有限面和明确的世界坐标点');}
      else if(!validRef(input.first)||!validRef(input.second))fail('STALE_REFERENCE','需要两个当前有效的实体或拓扑引用');
      const result=await host.measureRelation(input);check(input,['context','mode','first','second','face','pointWorld']);
      return {status:'read',source:'exact-brep',units:{length:'mm',angle:'degrees'},context:current().context,...result};
    }),
    readVector:guarded(async input=>{
      const keys=['context','resourceId','name','text','scaleMm','targetWidthMm','entityIds','bounds','layers','offset','limit'];check(input,keys);
      if((input.resourceId===undefined)===(input.text===undefined)||typeof input.name!=='string'||input.name.length>255)fail('PARAM_SCHEMA_INVALID','Provide name and exactly one of resourceId/text');
      const offset=input.offset??0,limit=input.limit??500;if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>10000)fail('PARAM_SCHEMA_INVALID','offset >= 0; limit 1..10000');
      const cacheKey=JSON.stringify([input.resourceId,input.name,input.scaleMm,input.targetWidthMm]);
      let dataset;if(input.resourceId){const bytes=await rawFiles.read({resourceId:input.resourceId,as:'bytes'});dataset=vectorCache.get(cacheKey);if(!dataset){dataset=await readVectorInput({...input,bytes});if(vectorCache.size>=2)vectorCache.delete(vectorCache.keys().next().value);vectorCache.set(cacheKey,dataset);}}else dataset=await readVectorInput(input);
      const selected=selectVector(dataset,input);check(input,keys);
      return {status:'read',...selected,entities:selected.entities.slice(offset,offset+limit),unsupported:selected.unsupported.slice(0,100),unsupportedCount:selected.unsupported.length,total:selected.entities.length,offset,truncated:offset+limit<selected.entities.length,context:current().context};
    }),
    connectVector:guarded(async input=>{
      check(input,['context','entities','toleranceMm','origin','flipY']);
      return {status:'read',...connectVector(input),context:current().context};
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
    copySelection:guarded(async input=>{check(input,['context','bodyIds']);const ids=input.bodyIds;if(!Array.isArray(ids)||!ids.length||ids.length>200||new Set(ids).size!==ids.length||ids.some(id=>!current().bodies.some(b=>b.id===id)))fail('STALE_REFERENCE','Provide current unique bodyIds');await host.clipboard('copy',ids);return {status:'read',bodyIds:[...ids],context:current().context};}),
    pasteSelection:guarded(async input=>{
      const key=input.idempotencyKey,c=input.context;
      if(typeof key!=='string'||!key||key.length>200)fail('PARAM_SCHEMA_INVALID','idempotencyKey is required');
      const cacheKey=`${c?.documentInstanceId}:${key}`,fingerprint=JSON.stringify(input),cached=pasteReceipts.get(cacheKey);
      if(cached){if(cached.fingerprint!==fingerprint)fail('IDEMPOTENCY_KEY_REUSED','Paste key reused with different input');if(c?.documentInstanceId!==current().context.documentInstanceId||c?.sessionId!==current().context.sessionId||c?.documentId!==current().context.documentId)fail('INSTANCE_MISMATCH','Stale paste context');return cached.result;}
      check(input,['context','idempotencyKey']);if(pasteReceipts.size>=128)fail('RESOURCE_LIMIT','Reload after saving to clear paste receipt cache');
      const result=Promise.resolve().then(async()=>({status:'committed',createdBodyIds:await host.clipboard('paste'),context:current().context}));pasteReceipts.set(cacheKey,{fingerprint,result});
      try{return await result;}catch(error){pasteReceipts.delete(cacheKey);throw error;}
    }),
    setView:guarded(async input=>{
      check(input,viewKeys);
      for(const [key,values] of Object.entries({display:['solid','edges','wire','transparentEdges'],gizmo:['off','translate','rotate'],selectionMode:['body','face','edge'],language:['zh','en'],temporaryDisplay:['normal','selectedOnly','transparentOthers']}))if(input[key]!==undefined&&!values.includes(input[key]))fail('PARAM_SCHEMA_INVALID',`Unknown ${key}`);
      if(input.gizmo!==undefined&&input.gizmo!=='off'&&input.selectionMode!==undefined&&input.selectionMode!=='body')fail('SELECTION_CONFLICT','Move/rotate handles require body selection; omit selectionMode or use body','selectionMode');
      for(const key of ['grid','snap','anchorVisible'])if(input[key]!==undefined&&typeof input[key]!=='boolean')fail('PARAM_SCHEMA_INVALID',`${key} must be boolean`);
      if(input.panels!==undefined&&(!input.panels||typeof input.panels!=='object'||Array.isArray(input.panels)||Object.entries(input.panels).some(([key,value])=>!['left','right'].includes(key)||typeof value!=='boolean')))fail('PARAM_SCHEMA_INVALID','panels requires left/right booleans');
      if(input.camera!==undefined){const c=input.camera;if(!c||typeof c!=='object'||Object.keys(c).some(k=>!['position','target'].includes(k))||[c.position,c.target].some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)))||c.position.every((v,i)=>v===c.target[i]))fail('PARAM_SCHEMA_INVALID','camera requires distinct finite XYZ position and target');}
      if(input.direction&&!['top','bottom','front','back','left','right','side','iso'].includes(input.direction))fail('PARAM_SCHEMA_INVALID','Unknown view');
      if(input.projection&&!['orthographic','perspective'].includes(input.projection))fail('PARAM_SCHEMA_INVALID','Unknown projection');
      if(input.fit!==undefined&&typeof input.fit!=='boolean')fail('PARAM_SCHEMA_INVALID','fit must be boolean');
      if(input.section&&(!['X','Y','Z'].includes(input.section.axis)||!Number.isFinite(input.section.position)||typeof input.section.enabled!=='boolean'))fail('PARAM_SCHEMA_INVALID','Section requires axis, finite position and enabled boolean');
      if(input.selectedIds!==undefined){
        if(!Array.isArray(input.selectedIds)||input.selectedIds.length>200||input.selectedIds.some(id=>typeof id!=='string'||!id.length))fail('PARAM_SCHEMA_INVALID','selectedIds requires up to 200 current body IDs','selectedIds');
        if(new Set(input.selectedIds).size!==input.selectedIds.length||input.selectedIds.some(id=>!current().bodies.some(b=>b.id===id)))fail('STALE_REFERENCE','Unknown or duplicate selected body','selectedIds');
      }
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
