// Compact per-body display controls. All writes use the public body.appearance action.
export function renderBodySurfaceProperties(box,{state,body,ids,element,button,emit}){
 const current=state.document?.surface?.[body.id]||{},patch=value=>emit('bodySurface',{patch:value});
 const row=(title,control)=>{const label=element('label',{class:'form-field'});label.append(element('span',{},title),control);box.append(label);return label;};
 const control=(tag,attrs={})=>{const value=element(tag,{'data-ui-action':'bodySurface',...attrs});value.disabled=state.busy;return value;};
 const preset=control('select',{'aria-label':'透明材质'});for(const [value,label]of [['opaque','不透明'],['plastic','透明塑料'],['glass','玻璃']])preset.append(element('option',{value},label));preset.value=(current.transmission??0)>0?'glass':(current.opacity??1)<1?'plastic':'opaque';
 preset.addEventListener('change',()=>patch(preset.value==='opaque'?{opacity:1,transmission:0}:{finish:'design',opacity:preset.value==='glass'?1:.35,transmission:preset.value==='glass'?.9:0,roughness:preset.value==='glass'?.08:.25,ior:1.5,thicknessMm:1}));row('透明材质',preset);
 const alpha=control('input',{type:'range',min:'0',max:'100',step:'1','aria-label':'透明度百分比'}),alphaValue=element('output');alpha.value=String(Math.round((1-(current.opacity??1))*100));alphaValue.textContent=alpha.value+'%';alpha.addEventListener('input',()=>alphaValue.textContent=alpha.value+'%');alpha.addEventListener('change',()=>patch({opacity:1-Number(alpha.value)/100}));const alphaControls=element('div',{class:'color-controls'});alphaControls.append(alpha,alphaValue);row('透明度',alphaControls);
 const roughness=control('input',{type:'number',min:'0',max:'1',step:'.05','aria-label':'粗糙度'});roughness.value=String(current.roughness??.42);roughness.addEventListener('change',()=>patch({roughness:Number(roughness.value)}));row('粗糙度',roughness);
 const details=element('details',{class:'surface-texture-properties'});details.open=!!current.texture;details.append(element('summary',{},'表面贴图'));
 const file=control('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':'选择贴图图片'}),status=element('p',{class:'form-error',role:'status'});
 file.addEventListener('change',async()=>{const image=file.files?.[0];if(!image)return;try{if(image.size>4.5*1024*1024)throw Error('图片不超过 4.5 MiB。');status.textContent='正在读取图片…';const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败。'));reader.readAsDataURL(image);});await patch({texture:{dataUrl,mapping:'box',sizeMm:[20,20]},finish:'design',color:'#ffffff'});status.textContent='';}catch(error){status.textContent=error.message;}});
 details.append(file,status,element('p',{class:'property-footnote'},'PNG / JPG / WebP，最大 4096×4096；图片随工程保存。'));
 const texture=current.texture;
 if(texture){
  const update=value=>patch({texture:{...texture,...value}}),field=(label,input)=>{const row=element('label',{class:'form-field'});row.append(element('span',{},label),input);details.append(row);};
  const mapping=control('select',{'aria-label':'贴图投射'});for(const [value,label]of [['box','盒式投射'],['xy','XY 平面'],['xz','XZ 平面'],['yz','YZ 平面']])mapping.append(element('option',{value},label));mapping.value=texture.mapping;mapping.addEventListener('change',()=>update({mapping:mapping.value}));field('投射',mapping);
  for(const [key,title,defaults]of [['sizeMm','图片尺寸（mm）',[20,20]],['offsetMm','偏移（mm）',[0,0]]]){const pair=element('div',{class:'color-controls'}),values=texture[key]||defaults;for(let axis=0;axis<2;axis++){const input=control('input',{type:'number',step:'.1','aria-label':title+' '+(axis?'V':'U'),...(key==='sizeMm'?{min:'.001'}:{})});input.value=String(values[axis]);input.style.width='50%';input.addEventListener('change',()=>{const next=[...values];next[axis]=Number(input.value);update({[key]:next});});pair.append(input);}field(title,pair);}
  const angle=control('input',{type:'number',step:'1','aria-label':'贴图旋转角度'});angle.value=String(texture.rotationDeg||0);angle.addEventListener('change',()=>update({rotationDeg:Number(angle.value)}));field('旋转（°）',angle);
  const remove=button('移除贴图',()=>patch({texture:null}),'secondary');remove.dataset.uiAction='bodySurface';remove.disabled=state.busy;details.append(remove);
 }
 box.append(details);
}
