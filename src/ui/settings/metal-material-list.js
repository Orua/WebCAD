import {getMetalMaterials,DEFAULT_METAL_CONFIG} from '../../metal-presets.js';

export function metalMaterialList({element,button,emit,api,finishSelect}){
  const section=element('details',{class:'wide'});section.style.gridColumn='1 / -1';
  section.append(element('summary',{},'金属材质参数列表（编辑 / 新增 / 导入导出）'));
  section.append(element('p',{class:'property-footnote'},'底色为线性 RGB（0–1）；材质中的参数优先于渲染方式。配置保存在此浏览器，并随工程保存。内置材质可修改，自定义材质可删除。'));
  let draft=getMetalMaterials();
  const scroll=element('div');scroll.style.overflowX='auto';
  const table=element('table');table.style.cssText='width:100%;min-width:740px;border-collapse:collapse;font-size:12px';
  const head=element('thead'),headRow=element('tr');
  for(const title of ['名称 / ID','渲染方式','底色 RGB','粗糙度','反射强度','操作'])headRow.append(element('th',{},title));head.append(headRow);table.append(head);
  const tbody=element('tbody');table.append(tbody);scroll.append(table);section.append(scroll);
  const error=element('p',{role:'alert',class:'form-error'});
  const advanced=element('details'),json=element('textarea',{'aria-label':'完整材质配置 JSON',rows:12});json.style.cssText='width:100%;box-sizing:border-box;font:12px monospace';advanced.append(element('summary',{},'完整配置 JSON（渲染方式、涂层、古铜等高级参数）'),json);
  const builtin=new Set(DEFAULT_METAL_CONFIG.materials.map(m=>m.id));
  function syncJson(){json.value=JSON.stringify(draft,null,2);}
  function render(){tbody.replaceChildren();for(const material of draft.materials){
    const row=element('tr'),resolved={...draft.styles[material.style],...material};
    const cell=child=>{const td=element('td');td.style.padding='6px 4px';td.append(child);row.append(td);};
    const name=element('input',{value:material.label,'aria-label':material.id+' 名称'});name.style.width='110px';name.addEventListener('change',()=>{material.label=name.value;syncJson();});const title=element('div');title.append(name,element('small',{},material.id));title.lastElementChild.style.display='block';cell(title);
    const style=element('select',{'aria-label':material.id+' 渲染方式'});for(const id of Object.keys(draft.styles))style.append(element('option',{value:id},id));style.value=material.style;style.addEventListener('change',()=>{material.style=style.value;for(const key of ['environmentMode','roughness','reflectionStrength','metalBodyTint','coat','hueKeep','depth','anisotropy','studioReflection'])delete material[key];render();});cell(style);
    const color=element('input',{'aria-label':material.id+' 底色 RGB',value:(material.color||[]).join(', ')});color.style.width='135px';color.disabled=material.id==='design';color.addEventListener('change',()=>{material.color=color.value.split(/[,，\s]+/).filter(Boolean).map(Number);syncJson();});cell(color);
    for(const [key,label]of [['roughness','粗糙度'],['reflectionStrength','反射强度']]){const input=element('input',{type:'number',min:0,max:key==='roughness'?1:3,step:0.005,'aria-label':material.id+' '+label,value:resolved[key]??0});input.style.width='67px';input.addEventListener('change',()=>{material[key]=Number(input.value);syncJson();});cell(input);}
    const actions=element('div');actions.style.cssText='display:flex;gap:4px';actions.append(button('复制',()=>{let n=1,id;do{id='custom-'+n++;}while(draft.materials.some(m=>m.id===id));draft.materials.push({...structuredClone(material),...(!material.color?{style:'mirror',color:[0.76,0.76,0.76],metalness:1,roughness:0.055,reflectionStrength:1.08}:{}),id,label:material.label+' 副本'});render();},'secondary'));if(!builtin.has(material.id))actions.append(button('删除',()=>{draft.materials=draft.materials.filter(m=>m!==material);render();},'secondary'));cell(actions);tbody.append(row);
  }syncJson();}
  const actions=element('div',{class:'dialog-footer'});
  actions.append(button('应用材质配置',async()=>{error.textContent='';try{const configuration=JSON.parse(json.value);const result=await emit('metalMaterials',{configuration});if(result===false)return;draft=getMetalMaterials();render();error.textContent=result.persisted?'已应用并记住。':'已应用，但浏览器存储失败；请导出配置备份。';}catch(e){error.textContent=e.message;}},'primary'),button('恢复默认列表',()=>{draft=structuredClone(DEFAULT_METAL_CONFIG);render();},'secondary'),button('导出 JSON',()=>{const blob=new Blob([json.value],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='webcad-metal-materials.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'secondary'));
  const file=element('input',{type:'file',accept:'.json','aria-label':'导入材质配置 JSON'});file.addEventListener('change',async()=>{error.textContent='';try{if(file.files[0].size>65536)throw Error('配置文件不能超过64 KiB');draft=JSON.parse(await file.files[0].text());json.value=JSON.stringify(draft,null,2);error.textContent='配置已读入，点击应用后生效。';}catch(e){error.textContent=e.message;}file.value='';});
  section.append(advanced,actions,file,error);render();return section;
}
