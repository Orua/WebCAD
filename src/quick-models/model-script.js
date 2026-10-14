// A finite declarative recipe, never JavaScript/eval. Its complete source is
// carried by each generated feature, so library edits cannot alter old projects.
const OPS={box:['width','depth','height'],cylinder:['radius','height'],sphere:['radius'],quickModel:null,union:[],cut:[],intersect:[],transform:['x','y','z','rx','ry','rz','scale']};
const fail=message=>{throw Object.assign(new Error('建模脚本：'+message),{code:'PARAM_SCHEMA_INVALID'});};
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
export function validateModelScript(script,params,definitions){
  if(!Array.isArray(script)||!script.length||script.length>20)fail('需要 1–20 个步骤');
  const known=new Set();
  for(const step of script){
    if(!plain(step)||Object.keys(step).some(k=>!['id','op','params','refs'].includes(k))||!/^[a-zA-Z][\w-]{0,39}$/.test(step.id)||known.has(step.id)||!Object.hasOwn(OPS,step.op))fail('步骤 ID 或操作无效');
    const p=step.params||{},refs=step.refs||[];
    if(!plain(p)||!Array.isArray(refs)||refs.some(id=>!known.has(id)))fail('参数须为对象；引用须指向前面的步骤');
    const count=['union','cut','intersect'].includes(step.op)?2:step.op==='transform'?1:0;
    if(refs.length!==count)fail(step.op+' 需要 '+count+' 个引用');
    const allowed=step.op==='quickModel'?['kind',...Object.keys(definitions[p.kind]?.defaults||{})]:OPS[step.op];
    if(step.op==='quickModel'&&!definitions[p.kind])fail('未知快捷模型类型');
    for(const [key,value]of Object.entries(p)){
      if(!allowed.includes(key))fail('未知参数 '+key);
      if(typeof value==='string'&&value.startsWith('$params.')){if(!Object.hasOwn(params,value.slice(8)))fail('未知工具参数 '+value);}
      else if(key!=='kind'&&step.op!=='quickModel'&&(typeof value!=='number'||!Number.isFinite(value)))fail(key+' 须为有限数或 $params.字段');
    }
    if(['box','cylinder','sphere'].includes(step.op))for(const key of OPS[step.op]){const raw=p[key],value=typeof raw==='string'&&raw.startsWith('$params.')?params[raw.slice(8)]:raw;if(!(typeof value==='number'&&Number.isFinite(value)&&value>0))fail(step.op+'.'+key+' 须大于零');}
    known.add(step.id);
  }
  return structuredClone(script);
}
export function defaultModelScript(kind,definition){return [{id:'model',op:'quickModel',params:{kind,...Object.fromEntries(Object.keys(definition.defaults).map(key=>[key,'$params.'+key]))},refs:[]}];}
export function buildModelScript(script,params,cad,options,definitions,buildNested){
  validateModelScript(script,params,definitions);
  const held=[],shapes=new Map(),hold=s=>(held.push(s),s);
  const positive=(p,key)=>{const v=p[key];if(!(typeof v==='number'&&Number.isFinite(v)&&v>0))fail(key+' 须大于零');return v;};
  try{
    for(const step of script){
      const p=Object.fromEntries(Object.entries(step.params||{}).map(([key,v])=>[key,typeof v==='string'&&v.startsWith('$params.')?params[v.slice(8)]:v]));
      const refs=(step.refs||[]).map(id=>shapes.get(id));let shape;
      if(step.op==='quickModel')shape=buildNested(p,cad,options);
      else if(step.op==='box')shape=cad.makeBox([0,0,0],['width','depth','height'].map(k=>positive(p,k)));
      else if(step.op==='cylinder')shape=cad.makeCylinder(positive(p,'radius'),positive(p,'height'));
      else if(step.op==='sphere')shape=cad.makeSphere(positive(p,'radius'));
      else if(step.op==='union')shape=refs[0].fuse(refs[1]);
      else if(step.op==='cut')shape=refs[0].cut(refs[1]);
      else if(step.op==='intersect')shape=refs[0].intersect(refs[1]);
      else{
        shape=hold(refs[0].clone());
        if(p.scale!==undefined)shape=hold(shape.scale(positive(p,'scale')));
        for(const [key,axis]of [['rx',[1,0,0]],['ry',[0,1,0]],['rz',[0,0,1]]])if(p[key])shape=hold(shape.rotate(p[key],[0,0,0],axis));
        shape=shape.translate(p.x||0,p.y||0,p.z||0);
      }
      shapes.set(step.id,hold(shape));
    }
    const result=shapes.get(script.at(-1).id).clone();
    const analyzer=new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false);let valid;try{valid=analyzer.IsValid();}finally{analyzer.delete();}
    if(!valid||!(cad.measureVolume(result)>1e-9)){result.delete();fail('最后步骤没有有效实体');}
    return result;
  }finally{for(const shape of new Set(held))try{shape.delete();}catch{}}
}
