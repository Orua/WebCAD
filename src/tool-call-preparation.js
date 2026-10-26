import {validateSchema,contractHash} from './contracts/operation-schema.js';
import {parameterQuestions,parameterQuestion,parameterSchema,answerParameter,fillParameterConstants} from './parameter-questions.js';
import {preparationSchema} from './tool-call-contracts.js';
import {requestContext} from './page-context.js';

const clone=value=>structuredClone(value);
const fail=(code,message,path)=>{throw Object.assign(Error(message),{code,path});};
export function createToolCallPreparation({state,getCard,normalizePatch,now=Date.now}){
 const entries=new Map();let sequence=0;
 return async input=>{
  let entry;
  if(input.callPreparationId){
   entry=entries.get(input.callPreparationId);if(!entry||entry.expiresAt<now())fail('RESOURCE_EXPIRED','工具预检单已过期。','callPreparationId');
   if(Object.keys(input).some(key=>!['context','callPreparationId','answers'].includes(key)))fail('PARAM_SCHEMA_INVALID','续接只传callPreparationId和answers。');
   if(['sessionId','documentId','documentInstanceId','revision'].some(key=>entry.context[key]!==state().context[key]))fail('PREPARATION_STALE','工程已变化，请按新修订重新预检。');
   for(const [path,value]of Object.entries(input.answers||{})){
    if(!entry.questions?.some(q=>q.answerPath===path||q.answerPaths?.includes(path)))fail('PARAM_SCHEMA_INVALID','只回答预检列出的字段。',path);
    answerParameter(entry.base,path,value,['toolId','args']);
   }
  }else{
   if(input.answers)fail('PARAM_SCHEMA_INVALID','answers需要callPreparationId。');
   for(const [id,e]of entries)if(e.expiresAt<now())entries.delete(id);
   if(entries.size>=32)fail('RESOURCE_LIMIT','工具预检单已达32份上限。');
   entry={id:`call_${++sequence}`,context:clone(state().context),base:{toolId:input.toolId,args:clone(input.args||{})},expiresAt:now()+1800000};entries.set(entry.id,entry);
  }
  const {toolId}=entry.base,args=clone(entry.base.args),questions=[],autoFilled=[],s=state(),context=requestContext(s.context);
  const finish=result=>{entry.questions=result.questions||[];return {...result,commitState:'not_committed',callPreparationId:entry.id,context:clone(s.context),validationScope:'input structure only; source, current lifecycle, capabilities, permissions and geometry are checked by the actual target'};};
  if(!toolId)return finish({status:'needs_input',questions:[parameterQuestion('toolId',{type:'string'},'请给出当前目录中的准确工具ID。')]});
  const card=getCard({id:toolId});
  if(card.implementationStatus==='unavailable'||card.runtimeAvailability==='unavailable')return finish({status:'blocked',reason:'CAPABILITY_UNAVAILABLE',toolId,message:card.description,requiredDocs:card.docs?[card.docs]:[]});
  if(card.mcpCall?.tool==='host-only')return finish({status:'blocked',reason:'HOST_MANAGED_TOOL',toolId,message:card.mcpCall.reason,...(card.mcpCall.alternative?{alternative:clone(card.mcpCall.alternative)}:{})});
  if(card.refsSchema&&!['import','remove'].includes(toolId)||card.category==='template'){
   const op=card.category==='template'?'quickModel':toolId,keys=['op','opVersion','schemaHash','refs','bodyId','face','point','intent','name','placement'];
   const params=clone(args.params||Object.fromEntries(Object.entries(args).filter(([key])=>!keys.includes(key))));
   if(args.op!==undefined&&args.op!==op)fail('PARAM_SCHEMA_INVALID','工具ID与op冲突。','args.op');
   if(card.category==='template'){const kind=card.inputSchema.properties?.kind?.const??toolId.slice(9);if(params.kind!==undefined&&params.kind!==kind)fail('PARAM_SCHEMA_INVALID','模板ID与kind冲突。','args.params.kind');params.kind=kind;}
   const supplied=Object.fromEntries(['refs','bodyId','face','point','intent','name','placement'].filter(key=>args[key]!==undefined).map(key=>[key,args[key]]));
   return finish({status:'routed',nextCall:{tool:'webcad_read',method:'prepareOperation',args:{context,op,params,...supplied}},message:'建模工具共用prepareOperation准备单；按其questions续接，prepared后应用原编号。'});
  }
  if(['import','remove'].includes(toolId))return finish({status:'routed',nextCall:{tool:'webcad_read',method:'prepareToolCall',args:{context,toolId:toolId==='import'?'files.import':'feature.remove',args}},message:'使用文件或删除的原公开入口。'});
  if(card.executableOperation===false)return finish({status:'guidance',toolId,relatedTools:card.relatedTools||[],message:card.usage,requiredDocs:card.docs?[card.docs]:[]});
  const schema=preparationSchema(card);
  if(!schema)return finish({status:'blocked',reason:'PREPARATION_CONTRACT_MISSING',toolId,message:'此工具缺少结构化预检合同；请读取原卡，不能将其当作已验证输入。'});
  if(schema.properties?.context&&args.context===undefined){args.context=context;autoFilled.push({field:'args.context',reason:'从当前真实文档身份和修订读取'});}
  if(args.context){for(const key of ['sessionId','documentId','documentInstanceId'])if(args.context[key]!==s.context[key])fail('INSTANCE_MISMATCH','工具参数属于其他工程实例。',`args.context.${key}`);if((args.context.expectedRevision??args.context.revision)!==undefined&&(args.context.expectedRevision??args.context.revision)!==s.context.revision)fail('REVISION_CONFLICT','工具参数的工程修订已过期。','args.context');}
  if(schema.required?.includes('bodyId')&&args.bodyId===undefined&&s.bodies.length===1){args.bodyId=s.bodies[0].id;autoFilled.push({field:'args.bodyId',value:args.bodyId,reason:'工程只有一个实体'});}
  const ask=(key,member,message)=>{if(args[key]===undefined)questions.push(parameterQuestion(`args.${key}`,member||schema.properties?.[key],message));};
  if(toolId==='measure'&&args.points===undefined){ask('bodyId',{type:'string'});if(['face','edge'].includes(args.kind))ask('topologyId',{type:'integer',minimum:0});}
  if(toolId==='measureRelation')for(const key of args.mode==='pointFace'?['face','pointWorld']:args.mode?['first','second']:[])ask(key);
  if(toolId==='inspectThickness')for(const key of args.mode==='faces'?['faceAId','faceBId']:['direction'])ask(key);
  if(toolId==='readVector'&&args.resourceId===undefined&&args.text===undefined)questions.push({...parameterQuestion('args',{},'请选择已登记原件resourceId或直接text中的一种。'),answerPaths:['args.resourceId','args.text']});
  if(toolId==='projectProfile'&&args.edgeIds===undefined&&args.pointWorld===undefined)questions.push({...parameterQuestion('args',{},'请选择当前精确边edgeIds或明确世界点pointWorld。'),answerPaths:['args.edgeIds','args.pointWorld']});
  if(toolId==='updateModelLibrary'&&args.operation==='move'){ask('id');ask('index');}
  if(['reviewLogo','logoWizard'].includes(toolId)&&(args.action??'get')!=='get'){
   ask('expectedRevision',{type:'integer',minimum:0},'从原草稿回执读取审核版次；工程修订不能代替草稿版次。');
   if(args.action==='confirm')ask('confirmed',{const:true},'仅在用户要求确认时传true。');
  }
  if(['reliefDesignReference','reliefDesignField','reliefDesignFit'].includes(toolId)&&!['get','resource'].includes(args.action??'get'))ask('expectedDraftRevision',{type:'integer',minimum:0},'请使用同一设计草稿的实际版次，不能绕过解算/拟合阶段。');
  if(toolId==='feature.edit'&&args.featureId){
   const feature=s.features?.find(f=>f.id===args.featureId);
   if(!feature)fail('STALE_REFERENCE','被编辑特征不在当前工程。','args.featureId');
   const operation=getCard({id:feature.op});for(const [key,value]of [['opVersion',operation.version],['schemaHash',operation.schemaHash]]){if(args[key]===undefined){args[key]=value;autoFilled.push({field:`args.${key}`,value,reason:`被编辑特征实际操作${feature.op}的当前契约`});}}
   if(args.params)try{normalizePatch(feature.op,feature.params,args.params);}catch(error){if(!error.code)throw error;const path=error.path?.startsWith('params.')?'args.'+error.path:'args.params';questions.push(parameterQuestion(path,{},error.message));}
  }
  autoFilled.push(...fillParameterConstants(schema,args,'args'));
  const supplied=new Set(questions.map(q=>q.answerPath));questions.push(...parameterQuestions(schema,args,'args').filter(q=>!supplied.has(q.answerPath)));
  if(!questions.length)try{validateSchema(schema,args,'args');}catch(error){if(!error.code)throw error;const path=error.path||'args';questions.push({...parameterQuestion(path,parameterSchema(schema,args,path.split('.').slice(1)),error.message),answerPaths:['args'],issue:{code:error.code,path}});}
  if(questions.length)return finish({status:'needs_input',questions,autoFilled,nextAction:'优先从已有用户要求和真实回执补充；缺少设计意图才询问用户。用同一callPreparationId和answers续接。'});
  const route=card.mcpCall;if(!route?.tool)return finish({status:'blocked',reason:'TOOL_NOT_EXPOSED',toolId,message:'当前工具卡没有可执行MCP路由。'});
  const callArgs=route.action?{context,action:route.action,args}:args;
  return finish({status:'prepared',toolId,autoFilled,recipeHash:contractHash({toolId,args}),summary:{args},nextCall:{tool:route.tool,method:route.method,args:callArgs},nextAction:'按nextCall调用原工具；提交仍需要原权限、当前修订和本次请求唯一键。预检不会执行或自动重试。'});
 };
}
