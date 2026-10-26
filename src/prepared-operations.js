import {validateSchema,contractHash} from './contracts/operation-schema.js';
import {logoContourBounds} from './logo-vector-review.js';
import {requestContext} from './page-context.js';
import {parameterQuestions,parameterSchema,fillParameterConstants,normalizeUnitAliases,answerParameter} from './parameter-questions.js';
import {assertPatternExecution} from './machining-intent.js';
import {migrateReliefParams} from './relief-param-migration.js';

const clone=value=>structuredClone(value);
const fail=(code,message,path)=>{throw Object.assign(new Error(message),{code,path});};
const faceFilters={top:{axis:'Z',side:'max',normal:[0,0,1]},bottom:{axis:'Z',side:'min',normal:[0,0,-1]},front:{axis:'Y',side:'min',normal:[0,-1,0]},back:{axis:'Y',side:'max',normal:[0,1,0]},left:{axis:'X',side:'min',normal:[-1,0,0]},right:{axis:'X',side:'max',normal:[1,0,0]}};
const labels={'params.mode':'加工方式','params.depthMm':'加工深度（mm）','params.faceId':'目标面','params.point':'图案中心的世界坐标（mm）','params.logoId':'图案草稿','params.height':'高度/厚度（mm）','params.radius':'半径（mm）','params.distance':'距离（mm）','params.diameterMm':'孔径（mm）','params.recessDiameterMm':'沉孔口径（mm）','params.recessDepthMm':'沉孔深度（mm）','params.includedAngleDeg':'沉头夹角（度）','params.through':'通孔或盲孔',bodyId:'目标实体',refs:'来源实体',face:'加工入口面',point:'世界入口坐标（mm）',op:'操作'};
const briefFace=f=>({value:f.topologyId,label:`面 ${f.topologyId} · ${f.surfaceType||f.geomType||'曲面'} · ${Number(f.area??0).toFixed(2)} mm²`,center:f.center,normal:f.normal,planar:f.planar});
const retainedData=value=>Array.isArray(value)?{retained:true,count:value.length,...(Array.isArray(value[0])?{columns:value[0].length}:{}),sha256:contractHash(value)}:value;
function summaryParams(op,p){
 const result=clone(p);if(op!=='relief')return result;
 for(const key of ['values','regions','strokes'])if(result[key])result[key]=retainedData(result[key]);
 if(result.layers)result.layers=result.layers.map(layer=>{for(const key of ['values','regions','strokes'])if(layer[key])layer[key]=retainedData(layer[key]);return layer;});
 return result;
}
const fieldQuestion=(path,schema={},message)=>({id:path,answerPath:path,label:labels[path]||schema.description||path,message:message||'请根据用户要求补充此项；准备阶段不会修改工程。',input:clone(schema),...(schema.enum?{choices:schema.enum.map(value=>({value,label:String(value)}))}:{})});

// Bounded page-local plans. No scripts, no geometry computation and no guessed
// design dimensions. Applying a plan uses the existing command transaction.
export function createOperationPreparation({state,getCard,normalize,execute,queryFaces,pointOnFace,logoDrafts,reliefDrafts=()=>[],measureBody,now=Date.now}){
 const entries=new Map();let sequence=0;
 const same=(a,b)=>['sessionId','documentId','documentInstanceId','revision'].every(k=>a[k]===b[k]);
 const fresh=entry=>{if(!same(entry.context,state().context))fail('PREPARATION_STALE','工程修订或实例已变化，请重新准备并重新查询目标面。','preparationId');if(!entry.result&&entry.expiresAt<now())fail('RESOURCE_EXPIRED','准备单已过期，请重新准备。','preparationId');};
 const allocate=base=>{
  for(const [id,e]of entries)if(!e.result&&!e.pending&&e.expiresAt<now())entries.delete(id);
  if(entries.size>=32)fail('RESOURCE_LIMIT','本页准备单达到32份上限，请保存后重新打开工程。','preparationId');
  const entry={id:`prep_${++sequence}`,base,context:clone(state().context),expiresAt:now()+30*60*1000,key:`prepared-${crypto.randomUUID()}`};entries.set(entry.id,entry);return entry;
 };
 const get=id=>{const e=entries.get(id);if(!e)fail('RESOURCE_EXPIRED','Unknown preparationId in this page.','preparationId');return e;};
 async function faces(bodyId,filter={}){
  const out=[];let cursor;
  do{const r=await queryFaces({bodyId,filter,requireUnique:false,limit:100,...(cursor?{cursor}:{})});if(r.status==='failed'){if(r.error.code==='NO_MATCH')return [];throw Object.assign(new Error(r.error.message),r.error);}out.push(...r.items);cursor=r.nextCursor;}while(cursor&&out.length<1000);
  return out;
 }
 async function prepare(input){
  let entry;
  if(input.preparationId){entry=get(input.preparationId);fresh(entry);if(entry.result||entry.pending)fail('PREPARATION_APPLIED','准备单已应用，请读取原回执。','preparationId');
   if(Object.keys(input).some(k=>!['context','preparationId','answers'].includes(k)))fail('PARAM_SCHEMA_INVALID','续接仅传 preparationId 和 answers。');
   for(const [path,value]of Object.entries(input.answers||{})){if(!entry.questions?.some(q=>q.answerPath===path||q.answerPaths?.includes(path)))fail('PARAM_SCHEMA_INVALID','只回答准备单列出的字段。',path);answerParameter(entry.base,path,value,['op','bodyId','refs','face','point','intent','params']);if(path==='bodyId')delete entry.base.refs;if(path==='refs')delete entry.base.bodyId;}
  }else{const {context,answers,preparationId,...base}=input;if(answers)fail('PARAM_SCHEMA_INVALID','answers requires preparationId');entry=allocate(clone(base));}
  const base=entry.base,p=clone(base.params||{}),questions=[],filled=[],s=state();
  let card;
  if(!base.op)questions.push(fieldQuestion('op',{type:'string'},'请给出要执行的已注册操作名称。'));
  else{card=getCard({id:base.op});if(!card?.inputSchema||!card.refsSchema||card.v2Executable!==true||['import','remove'].includes(base.op))fail('CAPABILITY_UNAVAILABLE','此项有独立入口；请按工具卡mcpCall执行，导入使用files.import，删除使用feature.remove。','op');}
  let refs=base.refs?clone(base.refs):base.bodyId?[base.bodyId]:[];
  const min=card?.refsSchema?.minItems??0;
  if(base.refs&&base.bodyId)fail('PARAM_SCHEMA_INVALID','Choose refs or bodyId, not both.','bodyId');
  if(min===1&&!refs.length&&s.bodies.length===1){refs=[s.bodies[0].id];filled.push({field:'refs',reason:'当前工程只有一个实体',value:refs});}
  if(refs.length<min)questions.push({...fieldQuestion(min===1?'bodyId':'refs',{type:min===1?'string':'array'},'请选择明确的来源/目标；多个实体时不自动猜选。'),choices:s.bodies.slice(0,20).map(b=>({value:b.id,label:b.name||b.id}))});
  else if(refs.some(id=>!s.bodies.some(b=>b.id===id)))questions.push({...fieldQuestion('refs',card.refsSchema,'实体引用已失效，请选择当前实体。'),choices:s.bodies.slice(0,20).map(b=>({value:b.id,label:b.name||b.id}))});
  const properties=card?Object.assign({},...([card.inputSchema,...(card.inputSchema.oneOf||[])]).map(schema=>schema.properties||{})):{};
  if(card&&base.face!==undefined&&!properties.faceId&&!properties.faceIds&&!['logo','fillet','chamfer','holeWizard'].includes(base.op))fail('PARAM_SCHEMA_INVALID','此工具没有单面入口；请使用其明确的来源/定位参数。','face');
  if(card&&base.point!==undefined){
   if(base.op==='holeWizard'){for(const [i,key]of ['x','y','z'].entries()){if(p[key]!==undefined&&p[key]!==base.point[i])fail('PARAM_SCHEMA_INVALID','point与已给入口坐标冲突。',`params.${key}`);p[key]=base.point[i];}}
   else if(properties.point){if(p.point!==undefined&&JSON.stringify(p.point)!==JSON.stringify(base.point))fail('PARAM_SCHEMA_INVALID','point与params.point冲突。','point');p.point=clone(base.point);}
   else fail('PARAM_SCHEMA_INVALID','此操作没有单点入口，请按问题指定实际参数。','point');
  }
  if(card&&base.op!=='logo'&&!['fillet','chamfer','holeWizard'].includes(base.op)&&(base.face!==undefined||properties.faceId)&&refs.length===1&&s.bodies.some(b=>b.id===refs[0])){
   if(!properties.faceId&&!properties.faceIds)fail('PARAM_SCHEMA_INVALID','此工具不接受单面简写，请按其显式参数指定范围。','face');
   const rule=faceFilters[base.face],filter=rule?{surfaceType:'plane',normal:{direction:rule.normal},atExtreme:{axis:rule.axis,side:rule.side}}:{};
   const candidates=await faces(refs[0],filter),face=Number.isInteger(base.face)?candidates.find(f=>f.topologyId===base.face):rule&&candidates.length===1?candidates[0]:candidates.find(f=>f.topologyId===p.faceId);
   if(!face)questions.push({...fieldQuestion('face',{type:'integer',minimum:0},'请选择当前真实加工面；方向条件没有唯一匹配时不会猜选。'),choices:candidates.slice().sort((a,b)=>(b.area??0)-(a.area??0)).slice(0,12).map(briefFace)});
   else{
    const key=properties.faceId?'faceId':'faceIds',resolved=key==='faceId'?face.topologyId:[face.topologyId];
    if(p[key]!==undefined&&JSON.stringify(p[key])!==JSON.stringify(resolved))fail('SELECTION_CONFLICT','face与显式加工面范围冲突。','face');
    p[key]=resolved;filled.push({field:`params.${key}`,value:resolved,reason:'按明确条件解析当前真实面'});
    if(base.op==='relief'&&p.point===undefined){
     if(face.planar===true||String(face.surfaceType||face.geomType).toLowerCase()==='plane'){
      const center=face.center,checked=Array.isArray(center)?await pointOnFace(refs[0],face.topologyId,center):null;
      if(checked?.status==='read'&&checked.distanceMm<=1e-6){p.point=clone(center);filled.push({field:'params.point',value:p.point,reason:'已核验有限平面内的真实浮雕中心'});}
     }
     if(p.point===undefined)questions.push(fieldQuestion('params.point',properties.point,'请指定真实曲面落点；面中心在孔洞或有限面外时也须明确位置。'));
    }
   }
  }
  if(card&&['fillet','chamfer','holeWizard'].includes(base.op)&&refs.length===1&&s.bodies.some(b=>b.id===refs[0])){
   const hasScope=p.edgeIds!==undefined||p.faceIds!==undefined||p.allEdges===true||p.selector!==undefined;
   if(base.face!==undefined||(['fillet','chamfer'].includes(base.op)&&!hasScope)){
    const rule=typeof base.face==='string'?faceFilters[base.face]:null,filter=rule?{surfaceType:'plane',normal:{direction:rule.normal},atExtreme:{axis:rule.axis,side:rule.side}}:{};
    const candidates=await faces(refs[0],filter),face=Number.isInteger(base.face)?candidates.find(f=>f.topologyId===base.face):rule&&candidates.length===1?candidates[0]:null;
    if(!face)questions.push({...fieldQuestion('face',{type:'integer',minimum:0},'请选择实际加工入口面。圆角/倒角也可明确传params.edgeIds选边或allEdges:true选整件。'),choices:candidates.slice().sort((a,b)=>(b.area??0)-(a.area??0)).slice(0,12).map(briefFace)});
    else if(['fillet','chamfer'].includes(base.op)){
     if(hasScope&&!(p.faceIds?.length===1&&p.faceIds[0]===face.topologyId))fail('SELECTION_CONFLICT','face与显式边/面范围冲突，请只选择一种。','face');
     p.faceIds=[face.topologyId];filled.push({field:'params.faceIds',value:p.faceIds,reason:'按明确入口面处理该面的完整边界，保留原工具语义'});
    }else{
     if(['x','y','z'].every(key=>p[key]===undefined)){
      const center=face.center,checked=Array.isArray(center)?await pointOnFace(refs[0],face.topologyId,center):null;
      if(checked?.status==='read'&&checked.distanceMm<=1e-6){[p.x,p.y,p.z]=center;filled.push({field:'params.x/y/z',value:clone(center),reason:'已核验的有限面材料内入口中心'});}
      else questions.push(fieldQuestion('point',{type:'array',minItems:3,maxItems:3,items:{type:'number'},unit:'mm'},'面中心在孔洞或有限面外，请明确孔入口位置。'));
     }
     const normal=face.normal,idx=Array.isArray(normal)?normal.findIndex(n=>Math.abs(n)>=1-1e-6):-1;
     if(idx>=0){const axis=['X','Y','Z'][idx];if(p.axis===undefined){p.axis=axis;filled.push({field:'params.axis',value:axis,reason:'入口面的精确主轴法向'});}if(p.direction===undefined&&p.axis===axis){p.direction=normal[idx]>0?-1:1;filled.push({field:'params.direction',value:p.direction,reason:'从已指定入口面朝材料内部钻入'});}else if(p.direction===undefined)questions.push(fieldQuestion('params.direction',{type:'integer',enum:[-1,1]},'指定轴与入口面法向不同，请明确钻入方向。'));}
     else{if(p.axis===undefined)questions.push(fieldQuestion('params.axis',{type:'string',enum:['X','Y','Z']},'孔向导仅支持主轴钻孔。请明确世界轴，或改用支持该平面的faceHole。'));if(p.direction===undefined)questions.push(fieldQuestion('params.direction',{type:'integer',enum:[-1,1]},'请明确钻入方向。'));}
    }
   }
  }
  if(card&&base.op==='holeWizard'){
   for(const key of p.kind==='counterbore'?['recessDiameterMm','recessDepthMm']:p.kind==='countersink'?['recessDiameterMm','includedAngleDeg']:[])if(p[key]===undefined)questions.push(fieldQuestion(`params.${key}`,card.inputSchema.properties[key]));
   if(p.through===false&&p.depthMm===undefined)questions.push(fieldQuestion('params.depthMm',card.inputSchema.properties.depthMm,'盲孔需要明确的实际深度，不自动按通孔处理。'));
   if(['x','y','z'].every(key=>p[key]===undefined)&&!questions.some(q=>q.answerPath==='point'))questions.push(fieldQuestion('point',{type:'array',minItems:3,maxItems:3,items:{type:'number'},unit:'mm'},'请明确世界入口坐标，或给face让工具核验面内中心。'));
  }
  if(card&&base.op==='logo'){
   const allDrafts=logoDrafts(),drafts=allDrafts.filter(d=>!d.reviewRequired);
   let draft=drafts.find(d=>d.logoId===p.logoId);
   if(p.logoId===undefined&&allDrafts.length===1&&drafts.length===1){draft=drafts[0];p.logoId=draft.logoId;filled.push({field:'params.logoId',reason:'当前文档只有一份草稿且已接受'});}
   if(!draft)questions.push({...fieldQuestion('params.logoId',{type:'string'},drafts.length?'请选择已接受的图案；不会猜选相似ID。':'请先使用 readLogo 转换并接受图案；预览草稿须按用户要求确认。'),choices:drafts.map(d=>({value:d.logoId,label:d.name||d.logoId}))});
   if(p.source!==undefined||p.regions!==undefined)fail('PARAM_SCHEMA_INVALID','简化入口使用已接受的草稿；只传 logoId 或在唯一草稿时省略，不混入 source/regions。','params.source');
   if(p.mode===undefined)questions.push(fieldQuestion('params.mode',{type:'string',enum:['engrave','emboss']},'用户要求向内凹刻，还是向外凸起？'));
   if(p.depthMm===undefined)questions.push(fieldQuestion('params.depthMm',{type:'number',exclusiveMinimum:0,unit:'mm'},'请给出用户要求的实际深度；不会默认加深。'));
   let face;
   if(refs.length===1&&s.bodies.some(b=>b.id===refs[0])){
    const filter=typeof base.face==='string'?(()=>{const f=faceFilters[base.face];return {surfaceType:'plane',normal:{direction:f.normal},atExtreme:{axis:f.axis,side:f.side}};})():{};
    const candidates=await faces(refs[0],filter);
    if(p.faceId!==undefined)face=candidates.find(f=>f.topologyId===p.faceId);
    else if(Number.isInteger(base.face))face=candidates.find(f=>f.topologyId===base.face);
    else if(typeof base.face==='string'&&candidates.length===1){face=candidates[0];p.faceId=face.topologyId;filled.push({field:'params.faceId',reason:`按明确的 ${base.face} 条件唯一匹配`});}
    if(face)p.faceId=face.topologyId;
    else questions.push({...fieldQuestion('params.faceId',{type:'integer',minimum:0},'请选择真实目标面；没有唯一匹配时保持工程不动。'),choices:candidates.slice().sort((a,b)=>(b.area??0)-(a.area??0)).slice(0,12).map(briefFace)});
   }
   if(face&&p.point===undefined){
    if(face.planar===true||String(face.surfaceType||face.geomType).toLowerCase()==='plane'){
     const center=face.center;if(Array.isArray(center)&&center.length===3){const checked=await pointOnFace(refs[0],face.topologyId,center);if(checked.status==='read'&&checked.distanceMm<=1e-6){p.point=clone(center);filled.push({field:'params.point',value:p.point,reason:'已核验面积中心位于当前有限平面材料内'});}}
    }
    if(p.point===undefined)questions.push(fieldQuestion('params.point',{type:'array',minItems:3,maxItems:3,items:{type:'number'},unit:'mm'},'请指定当前曲面上的实际落点，或平面内有效位置；不把曲面面积中心猜成表面点。'));
   }
   if(draft){
    const [x0,y0,x1,y1]=logoContourBounds(draft.logo),width=x1-x0;
    if(p.widthMm!==undefined){if(typeof p.widthMm!=='number'||!Number.isFinite(p.widthMm)||p.widthMm<=0)questions.push(fieldQuestion('params.widthMm',{type:'number',exclusiveMinimum:0},'宽度须为正的毫米数。'));
     else if(p.scale!==undefined&&Math.abs(p.scale-p.widthMm/width)>1e-9)questions.push(fieldQuestion('params.scale',{type:'number',exclusiveMinimum:0},'scale 与 widthMm 冲突，请按用户要求给出一致比例。'));
     else{p.scale=p.widthMm/width;filled.push({field:'params.scale',value:p.scale,reason:'按已验证轮廓边界和明确宽度计算'});}delete p.widthMm;
    }
    p.scale??=1;p.placementVersion??=2;p.projectionMode??='singleFace';p.draftAngle??=0;
    if(p.expectedReviewRevision!==undefined&&p.expectedReviewRevision!==draft.revision)questions.push(fieldQuestion('params.expectedReviewRevision',{type:'integer',const:draft.revision},'草稿审核版次已变化，请确认使用当前稿。'));
    else p.expectedReviewRevision=draft.revision;
    if(p.machiningIntent===undefined&&p.mode&&p.depthMm!==undefined){p.machiningIntent={version:1,requestedGeometry:'constantDepthContours',sourceInterpretation:'reviewedVectors',userIntentEvidence:base.intent||`调用者要求使用已接受图案${p.mode==='engrave'?'向内凹刻':'向外凸起'}，深度${p.depthMm} mm。`};filled.push({field:'params.machiningIntent',reason:'由明确的LOGO操作、模式、深度和已接受来源生成'});}
    entry.logoSummary={name:draft.name,sizeMm:[width*p.scale,(y1-y0)*p.scale],reviewRevision:draft.revision};
   }
  }
  if(card&&base.op==='relief'){
   for(const [alias,key]of [['widthMm','sizeXMm'],['heightMm','sizeYMm'],['depthMm','reliefHeightMm']])if(p[alias]!==undefined){if(p[key]!==undefined&&p[key]!==p[alias])fail('PARAM_SCHEMA_INVALID',`${alias}与${key}冲突。`,`params.${alias}`);p[key]=p[alias];delete p[alias];filled.push({field:`params.${key}`,value:p[key],reason:`由明确的${alias}毫米参数转换`});}
   const supplied=p.values!==undefined||p.layers!==undefined,drafts=reliefDrafts();
   let draft=p.reliefId!==undefined?drafts.find(d=>d.reliefId===p.reliefId):!supplied&&drafts.length===1?drafts[0]:null;
   if(p.reliefId!==undefined&&supplied)fail('PARAM_SCHEMA_INVALID','reliefId与直接高度/分层数据只能选择一种。','params.reliefId');
   if(!supplied&&!draft)questions.push({...fieldQuestion('params.reliefId',{type:'string'},drafts.length?'请选择已读取的浮雕原件，或按原契约明确提供values/layers。':'先readRelief读取真实原件；也可明确提供作者制作的高度或分层数据。'),choices:drafts.map(d=>({value:d.reliefId,label:d.source?.name||d.reliefId})),answerPaths:['params.values','params.layers']});
   if(draft){
    for(const key of ['values','layers','regions','surfaceMode','curveToleranceMm','source'])if(draft[key]!==undefined){if(p[key]!==undefined&&JSON.stringify(p[key])!==JSON.stringify(draft[key]))fail('PARAM_SCHEMA_INVALID','草稿来源数据不能与另传数据混合。',`params.${key}`);p[key]=clone(draft[key]);}
    if(p.sizeXMm===undefined&&draft.widthMm!==undefined)p.sizeXMm=draft.widthMm;
    if(p.sizeYMm===undefined&&draft.heightMm!==undefined)p.sizeYMm=draft.heightMm;
    filled.push({field:'params.reliefId',value:draft.reliefId,reason:'复用本页真实原件的不可变高度、轮廓、孔洞和来源'});
    entry.reliefSummary={reliefId:draft.reliefId,name:draft.source?.name,sha256:draft.source?.sha256};
   }
   delete p.reliefId;
   if(p.mode===undefined&&!p.layers)questions.push(fieldQuestion('params.mode',{enum:['emboss','engrave']},'请明确向外浮雕还是向内凹雕。'));
   const interpretation=p.sourceInterpretation||p.source?.sourceInterpretation;
   delete p.sourceInterpretation;
   if(p.machiningIntent===undefined){
    if(!interpretation)questions.push(fieldQuestion('params.sourceInterpretation',{enum:['authoredHeightMap','rasterArtwork','reviewedVectors']},'请声明真实来源用途；照片和光影不能直接作为几何高度。'));
    else{p.machiningIntent={version:1,requestedGeometry:p.layers?'layeredRelief':'continuousRelief',sourceInterpretation:interpretation,userIntentEvidence:base.intent||`调用者明确请求${p.layers?'分层矢量浮雕':'连续高度浮雕'}，保留给定原始高度和轮廓。`,...(p.source?.sha256?{sourceHash:p.source.sha256}:{})};filled.push({field:'params.machiningIntent',reason:'由明确来源用途与实际连续/分层数据生成，不推断照片深度'});}
   }
  }
  if(card){
   const migrated=migrateReliefParams(base.op,p);if(migrated!==p){for(const key of Object.keys(p))delete p[key];Object.assign(p,migrated);}
   filled.push(...normalizeUnitAliases(card.inputSchema,p));
   filled.push(...fillParameterConstants(card.inputSchema,p));
   const supplied=new Set(questions.map(q=>q.answerPath));questions.push(...parameterQuestions(card.inputSchema,p).filter(q=>!supplied.has(q.answerPath)&&!(q.answerPath==='params.faceId'&&questions.some(q=>q.answerPath==='face'))&&!(base.op==='logo'&&(q.answerPath==='params.faceId'&&refs.length!==1||q.answerPath==='params'&&questions.some(q=>q.answerPath==='params.logoId')))&&!(base.op==='relief'&&q.answerPath==='params'&&questions.some(q=>q.answerPath==='params.reliefId'))&&!(base.op==='holeWizard'&&questions.some(q=>q.answerPath==='point')&&['params.x','params.y','params.z'].includes(q.answerPath))));
   if(!questions.length)try{validateSchema(card.refsSchema,refs,'refs');const normalized=card.strictContract?normalize(base.op,p):validateSchema(card.inputSchema,p);assertPatternExecution(base.op,normalized,{required:true});for(const [key,value]of Object.entries(normalized))if(!Object.hasOwn(p,key)){p[key]=clone(value);filled.push({field:`params.${key}`,value:clone(value),reason:'当前工具公开的可选默认值，已在摘要中明确列出'});}}catch(error){if(!error.code)throw error;const path=error.path||'params',schema=parameterSchema(card.inputSchema,p,path.split('.').slice(1));questions.push({...fieldQuestion(path,schema,error.message),answerPaths:['params'],issue:{code:error.code,path,message:error.message}});}
  }
  fresh(entry);entry.questions=questions;entry.filled=filled;
  if(questions.length){entry.args=null;return {status:'needs_input',commitState:'not_committed',preparationId:entry.id,questions,autoFilled:filled,context:clone(state().context),nextAction:'从用户原话或已有真实回执回答 questions；只有缺少设计意图才询问用户。用同一 preparationId 和 answers 续接，不执行几何。'};}
  if(refs.length&&card.consumesInputs&&measureBody){try{const m=await measureBody(refs[0]);entry.baseline=m.status==='read'&&Number.isFinite(m.volume)?{status:'measured',bodyId:refs[0],revision:entry.context.revision,volumeMm3:m.volume,bounds:m.bounds,solidCount:m.solidCount,source:'exact-brep'}:{status:'unavailable',reason:m.error?.code||'VOLUME_UNAVAILABLE'};}catch(error){entry.baseline={status:'unavailable',reason:error.code||'MEASUREMENT_FAILED'};}fresh(entry);}
  entry.args={op:base.op,opVersion:card.version,schemaHash:card.schemaHash,refs,params:p,...(base.name?{name:base.name}:{}),...(base.placement?{placement:clone(base.placement)}:{})};entry.hash=contractHash(entry.args);
  return {status:'prepared',commitState:'not_committed',preparationId:entry.id,expiresAt:entry.expiresAt,summary:{op:base.op,refs,...(entry.logoSummary?{logo:entry.logoSummary}:{}),...(entry.reliefSummary?{relief:entry.reliefSummary}:{}),...(entry.baseline?{baseline:entry.baseline}:{}),params:summaryParams(base.op,p)},autoFilled:filled,recipeHash:entry.hash,context:clone(state().context),requestContext:requestContext(state().context),nextCall:{tool:'webcad_submit',method:'applyPreparedOperation',requestKey:`apply-${entry.id}`,args:{context:requestContext(state().context),preparationId:entry.id}},nextAction:'核对摘要符合本次用户授权后按nextCall应用准备单；不重拼参数或重读底层工具卡。'};
 }
 async function apply(input){
  const entry=get(input.preparationId);
  if(!['sessionId','documentId','documentInstanceId'].every(key=>entry.context[key]===state().context[key]))fail('INSTANCE_MISMATCH','准备单属于其他文档实例，不能在当前工程应用或冒充当前回执。','preparationId');
  // A settled or uncertain receipt is always reconciled, never computed again.
  if(entry.result)return clone({...entry.result,reused:true});if(entry.pending)return entry.pending;
  fresh(entry);if(!entry.args) return {status:'needs_input',commitState:'not_committed',preparationId:entry.id,questions:clone(entry.questions),context:clone(state().context)};
  const live=getCard({id:entry.args.op});if(live.schemaHash!==entry.args.schemaHash)fail('PREPARATION_STALE','工具契约已变化，请重新准备。','preparationId');
  entry.pending=Promise.resolve().then(async()=>{
   try{const result=await execute({context:requestContext(entry.context),idempotencyKey:entry.key,action:'feature.add',args:clone(entry.args)});entry.result={...result,preparationId:entry.id,recipeHash:entry.hash,...(entry.baseline?{baseline:entry.baseline}:{})};}
   catch(error){entry.result={status:'unknown',commitState:'unknown',preparationId:entry.id,error:{code:error.code||'EXECUTION_UNKNOWN',message:error.message},context:clone(state().context)};}
   return clone(entry.result);
  });return entry.pending;
 }
 return {prepare,apply};
}
