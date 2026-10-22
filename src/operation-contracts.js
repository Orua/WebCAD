import policy from '../contracts/services/v1/execution-routing.json' with {type:'json'};
import {LIMITS} from './limits.js';
import {annotateParameterSchema} from './parameter-metadata.js';
import sourceErrors from '../contracts/operation-source-errors.json' with {type:'json'};
const scenarios={
 meshHeightfieldRelief:{when:['作者制作的白高黑低高度图，保留毛发或纹理细节并输出打印STL'],avoid:{case:'照片光影尚未人工转换成高度图，或目标必须为精确STEP',use:'relief'},related:['heightfieldSculpt','meshBoolean','files.export']},
 meshBoolean:{when:['已定位的封闭网格与网格或精确实体做并集、差集或交集'],avoid:{case:'需要保留精确BRep和STEP输出',use:'union'},related:['transform','meshHeightfieldRelief','meshReliefEdit','files.export']},
 meshReliefPlate:{when:['用明确圆形起伏点和网格间距制作参数化测试底板'],avoid:{case:'输入是作者制作的高度图',use:'meshHeightfieldRelief'},related:['meshReliefEdit','meshBoolean','files.export']},
 meshReliefEdit:{when:['对已有STL或网格做有明确支撑和保护区域的局部修高'],avoid:{case:'编辑保存的高度图笔刷配方',use:'meshHeightfieldRelief'},related:['sampleMeshRelief','meshReliefPlate','meshBoolean','files.export']},
 relief:{when:['小图案、分层矢量或外凸圆柱面，需要精确曲面与STEP'],avoid:{case:'百万采样高度图的毛发纹理用于打印',use:'meshHeightfieldRelief'},related:['readRelief','prepareReliefSculpt','reliefShoulder','logo','files.export']},
 reliefShoulder:{when:['已有精确分层浮雕需要层间肩部过渡，并已配置支持此操作的Services'],avoid:{case:'高度图浮雕网格的笔刷平滑',use:'meshHeightfieldRelief'},related:['relief','prepareReliefTopologyUpgrade','files.export']},
 logo:{when:['明确矢量LOGO或文字；单面等深凹凸，或跨相连面投影凹刻（深度沿投影方向）'],avoid:{case:'目标为连续起伏或分层高度',use:'relief'},related:['readVector','relief','files.export']}
};
const errorDetails={
 HEIGHTFIELD_INVALID:['尺寸、采样数量、编码或 heights 字节与 columns×rows 不匹配','核对正尺寸及 columns×rows，并重新提供匹配的u8/u16le高度样本'],
 HEIGHTFIELD_SCULPT_INVALID:['笔刷模式、半径、强度、点列或笔画总量不合法','修正完整sculpt数组，遵守工具卡的笔数与点数上限'],
 MESH_BOOLEAN_INVALID:['refs数量、布尔方式、公差或输入几何不合法','提供2–16个明确实体，读取当前网格报告并修正operation/toleranceMm'],
 MESH_BOOLEAN_EMPTY:['布尔运算没有非空闭合结果','核对实体位置和运算方式；先measure或queryGeometry检查交叠'],
 MESH_BOOLEAN_UNAVAILABLE:['当前宿主未加载Manifold网格布尔引擎','确认已加载当前正式构建包及其WASM资源，再查询能力'],
 MESH_NOT_MANIFOLD:['输入或结果未通过闭合、定向流形检查','先提供符合网格报告检查的闭合来源；不自动修补来源'],
 RELIEF_EDIT_CAPACITY:['三角面、受影响顶点或空间查询超出已声明预算','降低来源网格规模或缩小明确的局部编辑范围']
};
const meshes=new Set(['meshHeightfieldRelief','meshReliefPlate','meshReliefEdit','meshBoolean']);
const family=['relief','reliefShoulder','logo','meshHeightfieldRelief','meshReliefPlate','meshReliefEdit','meshBoolean'];
const families=[['box','cylinder','sphere','cone','torus','quickModel'],['union','cut','intersect','split','meshBoolean'],['transform','copy','mirror','linearPattern','circularPattern','group','extractSolid'],['fillet','chamfer','round','roundEnd','rounding','autoRound','smoothTransition'],['hole','holeWizard','tap','faceHole','multiHole','multiPocket','multiBoss','slot'],['sketchProfile','profileOffset','profileRepair','profileExtrude','profileSweep','profileLoft','profileRevolve','profileConstraints'],['fittedSurface','thickenFace','sewFaces','surfaceTrim','extractFaces','extractShell','offsetSurface','offsetSolid'],['planeSection','faceBoundary','referenceExtrude','referenceLoft']];
const aliases={meshHeightfieldRelief:['高度图','灰度图','照片 浮雕','heightmap','depth map','photo relief'],meshBoolean:['合并 网格','STL 布尔','mesh boolean'],meshReliefPlate:['网格底板','起伏点','relief plate'],meshReliefEdit:['网格修高','STL 精修','mesh sculpt'],relief:['圆柱 浮雕','小图案 精确 STEP','vector relief'],logo:['恒深LOGO','文字刻字','logo engraving']};
const errors={meshHeightfieldRelief:['HEIGHTFIELD_INVALID','HEIGHTFIELD_SCULPT_INVALID','RELIEF_EDIT_CAPACITY','RELIEF_DESIGN_MASK_INVALID','RELIEF_DESIGN_DOMAIN_NONMANIFOLD','RELIEF_DESIGN_DOMAIN_EMPTY','RELIEF_DESIGN_DOMAIN_TOPOLOGY_CHANGED','RELIEF_DESIGN_BASE_INTERSECTION'],meshBoolean:['MESH_BOOLEAN_INVALID','MESH_BOOLEAN_EMPTY','MESH_BOOLEAN_UNAVAILABLE','MESH_NOT_MANIFOLD']};
export function operationRoutingClass(id){return policy.boundedMeshOperations.includes(id)?'bounded-mesh':policy.servicesEligibleOperations.includes(id)?'services-eligible':policy.localOnlyOperations.includes(id)?'local-only':'unregistered';}
export function sourceOperationContract(id,source,{defaults={},exampleParams={}}={}){
 const schema=annotateParameterSchema(source.paramsSchema||{type:'object',properties:{}}),required=new Set(schema.required||[]);
 const params=Object.fromEntries(Object.entries(schema.properties||{}).map(([name,s])=>[name,{meaning:s.description||`${name}: ${source.description}`,unit:s.unit||(/Mm$/.test(name)?'mm':s.type==='number'?'dimensionless':'none'),range:[s.minimum??s.exclusiveMinimum??s.minItems??s.minLength??null,s.maximum??s.exclusiveMaximum??s.maxItems??s.maxLength??null],...(required.has(name)?{}:{default:s.default??defaults[name]??{behavior:'omitted; retain the operation source default'}})}]));
 const refs=typeof source.refs==='number'?{min:source.refs,max:source.refs}:typeof source.refs==='object'?source.refs:{min:Number(String(source.refs).slice(2)),max:null};
 const limitGroup=id==='meshHeightfieldRelief'?'heightfield':id==='relief'||id==='reliefShoulder'?'relief':Object.hasOwn(LIMITS,id)?id:meshes.has(id)?'mesh':'document';
 const limits=Object.entries(LIMITS[limitGroup]).map(([name,value])=>({name,value,unit:/Mm$/.test(name)?'mm':'count',source:`src/limits.js#${limitGroup}.${name}`}));
 const example={op:id,params:structuredClone(exampleParams),refs:Array.from({length:refs.min||0},(_,n)=>`body-${n+1}`)};
 const errorCode=id==='meshHeightfieldRelief'?'HEIGHTFIELD_INVALID':id==='meshBoolean'?'MESH_BOOLEAN_INVALID':'PARAM_SCHEMA_INVALID';
 const relatives=family.includes(id)?family:families.find(group=>group.includes(id))||['sketchProfile','profileExtrude'];
 const contract={purpose:source.description,whenToUse:scenarios[id]?.when||[source.notes||source.description],whenNotToUse:[scenarios[id]?.avoid||{case:meshes.has(id)?'需要精确曲面和STEP交换':'输入是三角网格，需要网格加工',use:meshes.has(id)?'relief':'meshBoolean'}],params,refs:{...refs,meaning:refs.min?'引用当前工程中的来源实体；数量和选择顺序按schema':'独立创建，不引用已有实体'},limits,outputs:{geometryType:meshes.has(id)?'rawMesh':'brep',exportFormats:meshes.has(id)?['stl']:['step','brep','stl'],consumesRefs:refs.min>0&&!['copy','extractFaces','extractShell','planeSection','faceBoundary','referenceExtrude','referenceLoft'].includes(id),metrics:['bounds','area','volume (when available)']},errors:[...new Set([errorCode,...(errors[id]||[]),...(sourceErrors[id]?.codes||[])])].map(code=>({code,when:errorDetails[code]?.[0]||'输入违反该操作源码的校验或几何约束',recovery:errorDetails[code]?.[1]||'核对当前工具schema、来源和限制，修改参数后重试'})),examples:{minimal:example,normal:structuredClone(example),invalid:[{params:{__invalid:true},errorCode}]},routing:{class:operationRoutingClass(id),reason:'按共享 execution-routing.json 执行；Services 能力与输入规模另行校验'},related:scenarios[id]?.related||[...relatives.filter(other=>other!==id),'queryGeometry','measure','files.export'],synonyms:aliases[id]||[id,source.description.split('/')[0].trim(),source.description.split('/').at(-1).trim(),id.replace(/([a-z])([A-Z])/g,'$1 $2')+' operation'],status:'experimental',sourcePaths:sourceErrors[id]?.sourcePaths||[]};
 return contract;
}
