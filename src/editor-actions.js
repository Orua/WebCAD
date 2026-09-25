// Public editor actions: one contract for the UI, AI, and generated documentation.
export const FINISH_KEYS = Object.freeze(['design','light-gold','nickel','24k-gold','gunmetal','matt-nickel','matt-light-gold','matt-24k-gold','matt-gunmetal','antique-brass','antique-silver']);
export const EDITOR_ACTIONS = Object.freeze({
  'document.rename': {title:'工程改名', fields:['name'], example:{name:'圆环设计'}, description:'修改工程名称，保留几何。'},
  'feature.rename': {title:'特征改名 实体名称', fields:['featureId','name'], example:{featureId:'<featureId>',name:'主体'}, description:'修改历史步骤及同 ID 实体名称，导入件也可使用。'},
  'body.visibility': {title:'显示 隐藏实体', fields:['bodyIds','visible'], example:{bodyIds:['<bodyId>'],visible:false}, description:'显隐指定当前实体，不删除几何。'},
  'body.appearance': {title:'实体原色 颜色 金属 材质', fields:['bodyIds','color','finish'], example:{bodyIds:['<bodyId>'],color:'#e87939',finish:'design'}, description:'color 为 #RRGGBB 或 null 恢复默认；finish 为材质键或 null 跟随工程。仅改 color 不改变金属设置；需显示原色时同时设 finish:design。'},
  'document.appearance': {title:'工程渲染 金属色', fields:['finish'], example:{finish:'nickel'}, description:'设置当前工程材质覆盖，null 跟随全局默认，仅影响未单独指定材质的实体。'},
  'body.explode': {title:'组合拆散 多实体分解', fields:['bodyId'], example:{bodyId:'<bodyId>'}, description:'将含 2–500 个封闭体的组合拆成独立实体；一个撤销步骤。'}
});
export function validateEditorAction(action,args,state){
  const spec=EDITOR_ACTIONS[action];
  const fail=(message,code='PARAM_SCHEMA_INVALID')=>{throw Object.assign(new Error(message),{code,path:'args'});};
  if(!spec||!args||Array.isArray(args)||typeof args!=='object'||Object.keys(args).some(k=>!spec.fields.includes(k)))fail('Unexpected editor action fields');
  const current=id=>state.bodies.some(b=>b.id===id);
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
