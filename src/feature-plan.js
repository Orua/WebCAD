import {validateOperationRefs,normalizeOperationParams,assertOperationContract} from './operation-registry.js';
import {resolvePlacement,newFeaturePlacement} from './work-frame.js';

// Only whole-body operations; intermediate face/edge numbers have no live revision.
export const FEATURE_PLAN_OPERATIONS=['box','cylinder','sphere','cone','torus','extrude','revolve','sweep','loft','quickModel','vectorProfile','arcProfile','sketchProfile','curveSweep','advancedLoft','transform','copy','mirror','linearPattern','circularPattern','union','cut','intersect','group','fillet','chamfer','hole','multiHole','multiPocket','multiBoss'];
export const FEATURE_PLAN_SCHEMA={type:'object',additionalProperties:false,required:['features'],properties:{features:{type:'array',minItems:1,maxItems:64,items:{type:'object',additionalProperties:false,required:['key','op','opVersion','schemaHash','params','refs'],properties:{key:{type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,39}$'},op:{enum:FEATURE_PLAN_OPERATIONS},opVersion:{type:'string'},schemaHash:{type:'string'},params:{type:'object',description:'Complete current selected operation schema applies; no intermediate topology IDs'},refs:{type:'array',items:{oneOf:[{type:'string',minLength:1},{type:'object',additionalProperties:false,required:['feature'],properties:{feature:{type:'string',minLength:1}}}]}},name:{type:'string',minLength:1,maxLength:120},placement:{type:'object',description:'Same placement contract as feature.add; frozen against transaction-start state'}}}}}};
const fail=(code,path,message)=>{throw Object.assign(new Error(message),{code,path});};
const object=(v,allowed,path)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail('PARAM_SCHEMA_INVALID',path,'Unexpected feature plan fields');};
function topologyFree(value,path){
 if(!value||typeof value!=='object')return;
 for(const [key,v]of Object.entries(value)){
  if(['faceId','faceIds','edgeId','edgeIds','selectionToken','geometryFingerprint','sourceBodyId'].includes(key))fail('SELECTION_CONFLICT',path+'.'+key,'Query current topology after the feature plan; do not guess intermediate indices');
  topologyFree(v,path+'.'+key);
 }
}
export async function compileFeaturePlan(input,state,{uid=()=>crypto.randomUUID(),verifyPlacement=async()=>{},validateContract=assertOperationContract,normalizeParams=normalizeOperationParams}={}){
 object(input,['features'],'args');
 if(!Array.isArray(input.features)||!input.features.length||input.features.length>64)fail('RESOURCE_LIMIT','args.features','Provide 1..64 ordered features');
 const features=[],featureIds=Object.create(null),active=new Set(state.bodies.map(b=>b.id)),allocated=new Set(state.features.map(f=>f.id));
 for(const [index,item]of input.features.entries()){
  const path='args.features.'+index;
  object(item,['key','op','opVersion','schemaHash','params','refs','name','placement'],path);
  if(typeof item.key!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(item.key)||['prototype','constructor'].includes(item.key)||Object.hasOwn(featureIds,item.key))fail('PARAM_SCHEMA_INVALID',path+'.key','Unique short feature key required');
  if(!FEATURE_PLAN_OPERATIONS.includes(item.op))fail('CAPABILITY_UNAVAILABLE',path+'.op','Operation requires a separate live step or is not supported in a feature plan');
  validateContract(item.op,item);
  if(!Array.isArray(item.refs))fail('PARAM_SCHEMA_INVALID',path+'.refs','Explicit refs required');
  const refs=item.refs.map(ref=>{
   if(typeof ref==='string'){if(!state.bodies.some(b=>b.id===ref))fail('STALE_REFERENCE',path+'.refs','Use current body IDs or {feature:earlierKey}');return ref;}
   object(ref,['feature'],path+'.refs');
   if(typeof ref.feature!=='string'||!Object.hasOwn(featureIds,ref.feature))fail('STALE_REFERENCE',path+'.refs','Only earlier plan keys can be referenced');
   return featureIds[ref.feature];
  });
  validateOperationRefs(item.op,refs);
  if(new Set(refs).size!==refs.length||refs.some(id=>!active.has(id)))fail('STALE_REFERENCE',path+'.refs','Referenced body was consumed or duplicated');
  topologyFree(item.params,path+'.params');
  const params=normalizeParams(item.op,item.params);
  if(['fillet','chamfer'].includes(item.op)&&params.allEdges!==true)fail('SELECTION_CONFLICT',path+'.params','Feature plans only accept allEdges:true blends; selected-edge work needs a live step');
  if(item.name!==undefined&&(typeof item.name!=='string'||!item.name.trim()||item.name.length>120))fail('PARAM_SCHEMA_INVALID',path+'.name','Short nonempty name required');
  if(['transform','copy'].includes(item.op)&&params.mode&&item.placement===undefined)fail('FRAME_INVALID',path+'.placement','Spatial transform mode requires explicit placement');
  await verifyPlacement(item.placement,state,refs);
  const placement=resolvePlacement(newFeaturePlacement(item.placement,state.referenceSystem,item.op),state.referenceSystem,item.op,params);
  const id=uid();if(allocated.has(id))fail('RESOURCE_LIMIT',path,'Feature ID collision');allocated.add(id);featureIds[item.key]=id;
  features.push({id,op:item.op,params,refs,name:item.name||item.key,...(placement?{placement,semanticsVersion:2}:{})});
  if(item.op==='copy'||item.op==='mirror'&&params.keepOriginal!==false){}
  else if(['union','cut','intersect'].includes(item.op)&&params.keepTools===true)active.delete(refs[0]);
  else refs.forEach(id=>active.delete(id));
  active.add(id);
 }
 return {features,featureIds};
}

export const FEATURE_PLAN_GUIDANCE=`快速多特征事务
execute action feature.addMany 的 args 为 {features:[{key,op,opVersion,schemaHash,params,refs,name?,placement?}]}，1–64项。或在run里用 method:addMany，args:{features:[{key,op,params,refs,placement?}]}，由当前工具卡补版本/哈希。refs中的当前bodyId字符串引用现存对象；{feature:"earlierKey"}引用本事务前序特征。成功返回featurePlan:{atomic:true,featureIds,featureCount}，整个计划一次重建、一次revision和一个撤销步骤，保留每项参数历史。run整体仍atomic:false；addMany这个单独步骤失败时全部不提交。
先完成来源/尺寸/空间结构判断再批量提交。支持的操作：${FEATURE_PLAN_OPERATIONS.join(', ')}。只使用完整工具卡中明确的参数，独立创建省略placement默认当前work frame，需要世界坐标时显式world frame；所有定位使用事务开始的参考锚点快照，不在中间自动移动锚点。圆角/倒角仅allEdges:true；面/边编号、选择token、Logo、导入、检查、文件和不在清单内的操作另行执行。需要当前面/边时把计划分段，提交后查询新拓扑。不得把不适用模板或假设尺寸塞进事务。失败返回实际featureId及featureKey，先定位该项再修订，不重复盲试。
几何提交后可用{$ref:"build.featurePlan.featureIds.finalKey"}检查或导出；仅最终仍存在的bodyId可做后续操作。检查关键材料/尺寸及displayMatchesContext，一次通过即交付。速度统计必须注明WASM启动、计划编写/读图、计算/网格、检查、导出与传输是否计入；单事务速度不代表整件已经正确。`;
