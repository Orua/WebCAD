import {updateReliefDesigns} from './relief-design-drafts.js';
import {validateMaterialSettings} from './material-density.js';
import {validateReliefReference} from './relief-design-reference-contract.js';
// Public editor actions: one contract for the UI, AI, and generated documentation.
export const FINISH_KEYS = Object.freeze(['design','light-gold','nickel','24k-gold','gunmetal','matt-nickel','matt-light-gold','matt-24k-gold','matt-gunmetal','antique-brass','antique-silver','rose-gold','silver-925','white-gold-18k']);
// This action is never published as a JSON editor tool. Only the resource-backed
// page method may dispatch it with the private CommandService validation option.
export const INTERNAL_EDITOR_ACTIONS=Object.freeze({'document.reliefDesignReference':{title:'浮雕原参考图绑定',fields:['designId','expectedDraftRevision','action','source']}});
export const EDITOR_ACTIONS = Object.freeze({
  'document.materials':{title:'材料密度与重量',fields:['settings'],example:{settings:{version:1,defaultMaterial:'zincAlloy',densities:{zincAlloy:6.6,copper:8.94,iron:7.87,steel:7.85,brass:8.5,stainless:7.9,aluminum:2.7},bodyMaterials:{}}},description:'设置参考密度g/cm³、默认材料和对象材料映射，保存工程、可撤销；新工程记住浏览器默认值，与电镀外观独立。'},
  'feature.compileServices':{title:'Services 原特征编译',fields:['featureId','allowUpload'],example:{featureId:'<featureId>',allowUpload:true},description:'按服务能力执行世界坐标纯平移、均匀柱面凸雕层、多刀具 cut 或带一边旧R的矩形面完整边界 round。round 仅支持一个无孔矩形面、六个正交支撑面和一条完整同R旧圆角；四侧精确R，四角光滑自由曲面，保留4个孤立终止点。cut 的 refs 首项为目标，其余 1–32 项为刀具，各来源必须是已提交单实体，结果须为非空单实体；keepTools 保持原历史语义。全部来源按顺序校验，单项限 20 MiB、合计 64 MiB。浮雕通过几何意图匹配原宿主面，保留轮廓与孔，显式刀具策略不重试。验证精确结果后原子安装原特征，保留 op/参数/依赖。原生任务成功不等于工程提交。若修改来源会使下游复杂运算失效，先移除下游步骤、完成来源修改后重新执行，禁止转到本地偷算。失败保留真实错误码、jobId、stage、diagnosticsRef 和 commitState；等待中断保留原任务查询信息，不自动重算。'},
  'body.align': {title:'快速对齐',fields:['bodyIds','target','axes','sourceSide','targetSide','group','gapMm'],example:{bodyIds:['<bodyId>'],target:{kind:'origin'},axes:['X','Y','Z'],sourceSide:'center',targetSide:'center',group:true},description:'按世界 X/Y/Z 对齐包围范围的 min/center/max；移动件和基准件显式分开；group=true 保持相对位置。一次原子历史操作。'},
  'history.restore': {title:'退回工程状态',fields:['stateId'],example:{stateId:'<stateId>'},description:'用 getHistory 返回的状态 ID 恢复当时参数、显隐、外观和基准。导入来源只存一份，历史差异最多100状态/2MiB。恢复自身可撤销。'},
  'document.reliefDesign':{title:'浮雕设计约束草稿',fields:['id','expectedDraftRevision','draft','remove'],example:{id:'design-1',expectedDraftRevision:0,draft:{schemaVersion:1,name:'设计草稿',support:{kind:'circle',centerMm:[0,0],radiusMm:30},throughHoles:[],protectedZones:[],heightRangeMm:[0,3],points:[]}},description:'保存人工设计约束到当前工程，支持撤销、历史和工程重开。id最多64字符；新建expectedDraftRevision=0，编辑/删除传当前草稿revision；remove:true删除，不能同时传draft。draft完整替换：schemaVersion:1、name、support(circle/rect)、throughHoles/protectedZones各最多32区域、heightRangeMm:[min,max](-100..100)、points最多256项{id,pointMm:[x,y],heightMm}。区域均有centerMm，circle有radiusMm，rect有widthMm/heightMm。点须在支撑内、孔与保护区外。最多16草稿。heightSource可选{source,depthMm,edgeKeepoutMm?,edgeFadeMm?,weight?}：source为浏览器转换生成的高度来源记录（原图sha256、转换设置及哈希、u16le网格≤513²）；照片须带derivedFrom及用户确认“我确认此结果为我制作的高度图”，否则MACHINING_SOURCE_CONFLICT；高度图覆盖支撑外接矩形，亮=高，按depthMm映射到最低高度之上，作为求解观测。fieldSettings可选machiningPrecisionMm(0.01–0.5 mm，默认0.05，可调：小于该值的起伏/噪声/台阶以C1平滑方式去除，边缘与基线平齐，记入草稿指纹)、columns/rows(9–129)、smoothWeight、maxIterations(1–20000)、toleranceMm及edits笔刷数组(最多256笔，按顺序执行)。每笔显式mode:raise/lower/flatten/smooth、centerMm:[x,y]、radiusMm:0.001..10000；strength可选0..1默认1；raise/lower必填amountMm:0..100，flatten必填targetMm:-100..100，smooth为一次邻域平滑。坐标与草稿支撑同一毫米坐标系；孔、边缘固定节点及保护区保持基线，高度不超heightRangeMm。UI新增/更新/移除笔画会连同当前其他有效表单字段一次保存，Agent等价传整份draft并携带expectedDraftRevision；原图reference及其他既有设置必须保留。随工程保留可重算设计。使用reliefDesignField求解/残差回读和保留圆/矩形支撑、孔与作者保护基线的采样闭网格候选（边界近似，不是精确圆）；不从原图亮度推断设计高度。getState({include:["reliefDesigns"]})读取。'},
  'document.rename': {title:'工程改名', fields:['name'], example:{name:'圆环设计'}, description:'修改工程名称，保留几何。'},
  'feature.rename': {title:'特征改名 实体名称', fields:['featureId','name'], example:{featureId:'<featureId>',name:'主体'}, description:'修改历史步骤及同 ID 实体名称，导入件也可使用。'},
  'body.visibility': {title:'显示 隐藏实体', fields:['bodyIds','visible'], example:{bodyIds:['<bodyId>'],visible:false}, description:'显隐指定当前实体，不删除几何。'},
  'body.appearance': {title:'实体原色 颜色 金属 材质', fields:['bodyIds','color','finish'], example:{bodyIds:['<bodyId>'],color:'#e87939',finish:'design'}, description:'color 为 #RRGGBB 或 null 恢复默认；finish 为材质键或 null 跟随工程。仅改 color 不改变金属设置；需显示原色时同时设 finish:design。'},
  'document.appearance': {title:'工程渲染 金属色', fields:['finish'], example:{finish:'nickel'}, description:'设置当前工程材质覆盖，null 跟随全局默认，仅影响未单独指定材质的实体。'},
  'body.explode': {title:'组合拆散 多实体分解', fields:['bodyId'], example:{bodyId:'<bodyId>'}, description:'将含 2–500 个封闭体的组合拆成独立实体；一个撤销步骤。'}
});
export function validateEditorAction(action,args,state){
  const spec=EDITOR_ACTIONS[action]??INTERNAL_EDITOR_ACTIONS[action];
  const fail=(message,code='PARAM_SCHEMA_INVALID')=>{throw Object.assign(new Error(message),{code,path:'args'});};
  if(!spec||!args||Array.isArray(args)||typeof args!=='object'||Object.keys(args).some(k=>!spec.fields.includes(k)))fail('Unexpected editor action fields');
  if(action==='document.reliefDesign'){
    updateReliefDesigns(state.reliefDesigns,args);
    const previous=state.reliefDesigns?.find(d=>d.id===args.id)?.draft.reference;
    if(args.draft?.reference&&JSON.stringify(args.draft.reference)!==JSON.stringify(previous))fail('Use registered-resource reliefDesignReference to attach or replace the original image');
  }
  if(action==='document.reliefDesignReference'){
    const entry=state.reliefDesigns?.find(d=>d.id===args.designId);
    if(!entry)fail('Design draft not found','STALE_REFERENCE');
    if(args.expectedDraftRevision!==entry.revision)fail('Read the current draft revision','REVISION_CONFLICT');
    if(!['attach','detach'].includes(args.action))fail('Expected attach or detach');
    if(args.action==='attach'){validateReliefReference(args.source?.reference);if(!(args.source?.bytes instanceof Uint8Array))fail('Use registered original reference bytes');}
    else if(args.source!==undefined)fail('Detach cannot contain source bytes');
  }
  const current=id=>state.bodies.some(b=>b.id===id);
  if(action==='document.materials'){validateMaterialSettings(args.settings);if(Object.keys(args.settings.bodyMaterials).some(id=>!state.features.some(f=>f.id===id)))fail('材料对象已失效','STALE_REFERENCE');}
  if(action==='feature.compileServices'&&(typeof args.featureId!=='string'||!state.features.some(f=>f.id===args.featureId)||args.allowUpload!==true))fail('请选择当前特征并明确授权上传','UPLOAD_AUTH_REQUIRED');
  if(action==='history.restore'&&(typeof args.stateId!=='string'||args.stateId.length>150))fail('需要有效的历史状态 ID');
  if(action==='body.align'&&(!Array.isArray(args.bodyIds)||!args.bodyIds.length||args.bodyIds.some(id=>!current(id))))fail('请选择当前移动件','STALE_REFERENCE');
  if(action.endsWith('.rename')){
    if(typeof args.name!=='string'||!args.name.trim()||args.name.length>120)fail('name must contain 1–120 characters');
    if(action==='feature.rename'&&!state.features.some(f=>f.id===args.featureId))fail('Unknown feature','STALE_REFERENCE');
  }
  if(action==='body.visibility'||action==='body.appearance'){
    if(!Array.isArray(args.bodyIds)||!args.bodyIds.length||args.bodyIds.length>200||new Set(args.bodyIds).size!==args.bodyIds.length)fail('bodyIds requires 1–200 unique IDs');
    if(args.bodyIds.some(id=>!current(id)))fail('Unknown current body','STALE_REFERENCE');
  }
  if(action==='body.visibility'&&typeof args.visible!=='boolean')fail('visible must be boolean');
  if(action==='document.appearance'&&args.finish!==null&&!FINISH_KEYS.includes(args.finish))fail('Unknown finish');
  if(action==='body.appearance'){
    if(args.color===undefined&&args.finish===undefined)fail('Provide color or finish');
    if(args.color!==undefined&&args.color!==null&&(typeof args.color!=='string'||!/^#[0-9a-f]{6}$/i.test(args.color)))fail('color must be #RRGGBB or null');
    if(args.finish!==undefined&&args.finish!==null&&!FINISH_KEYS.includes(args.finish))fail('Unknown finish');
  }
  if(action==='body.explode'){
    const body=state.bodies.find(b=>b.id===args.bodyId);
    if(!body)fail('Unknown current body','STALE_REFERENCE');
    if(!Number.isInteger(body.solidCount)||body.solidCount<2||body.solidCount>500)fail('explode requires 2–500 solids');
  }
  return {command:'editor_action',args:{action,values:structuredClone(args)}};
}
