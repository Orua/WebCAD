import {layoutDrawing} from '../../drawing/technical-layout.js';
import {drawingSVG} from '../../drawing/drawing-export.js';
const dimensionLabel=dim=>`${({front:'主视',top:'俯视',side:'侧视'})[dim.viewId]||'截面 '+String.fromCharCode(65+Number(dim.viewId.replace('section','')))} · ${{horizontal:'横向',vertical:'纵向',diameter:'直径'}[dim.kind]} ${dim.label} mm`;

export function showQuickDrawing({getState,openDialog,element,button,emit}){
 const state=getState(),d=openDialog('快速出图','选实体生成三视图；按需加截面，勾选尺寸后导出。几何标注仍需核对工艺与公差。');
 d.style.cssText='width:min(1280px,96vw);max-width:96vw';
 const layout=element('div',{});layout.style.cssText='display:grid;grid-template-columns:230px 1fr;gap:16px;max-height:76vh;overflow:auto';
 const controls=element('div',{}),preview=element('div',{}),status=element('p',{'aria-live':'polite'},'先选择对象，再生成图纸。'),objects=element('details',{open:true}),options=element('div',{}),dims=element('details',{}),sectionBox=element('div',{});
 objects.append(element('summary',{},'出图对象'));const inputs=[];
 for(const b of state.bodies){const row=element('label',{}),c=element('input',{type:'checkbox'});c.checked=state.selectedIds.includes(b.id);row.style.display='block';row.append(c,element('span',{},b.name||b.id));objects.append(row);inputs.push([b.id,c]);}
 const field=(label,input)=>{const row=element('label',{});row.style.cssText='display:block;margin:8px 0';row.append(element('span',{},label),input);controls.append(row);return input;};
 const projection=field('投影方式 ',element('select',{'aria-label':'投影方式'}));projection.append(element('option',{value:'first'},'第一角法'),element('option',{value:'third'},'第三角法'));
 const paper=field('图纸 ',element('select',{'aria-label':'图纸幅面'}));paper.append(element('option',{value:'A4'},'A4 横向'),element('option',{value:'A3'},'A3 横向'));
 const title=field('图名 ',element('input',{value:state.document.name,maxlength:70}));
 const hidden=field('显示隐藏线 ',element('input',{type:'checkbox',checked:true}));
 const sections=[];controls.append(sectionBox,button('+ 添加截面',()=>{if(sections.length>=3)return;const row=element('div',{}),plane=element('select',{}),offset=element('input',{type:'number',step:'any',value:'0'});for(const p of ['XY','XZ','YZ'])plane.append(element('option',{value:p},p));offset.style.width='80px';const item={plane,offset,row};sections.push(item);row.append(plane,offset,element('span',{},' mm'),button('×',()=>{sections.splice(sections.indexOf(item),1);row.remove();invalidate();},'secondary'));sectionBox.append(row);row.addEventListener('change',invalidate);invalidate();},'secondary'));
 let live=true,result,busy=false,generation=0;const disabled=new Set();
 const exportButtons=[];
 function invalidate(){generation++;result=null;status.textContent='设置已改变，请重新生成图纸。';exportButtons.forEach(b=>b.disabled=true);}
 function draw(){if(!result)return;preview.innerHTML=drawingSVG(layoutDrawing(result.drawing,{paper:paper.value,title:title.value,disabledDimensions:[...disabled]}));const svg=preview.querySelector('svg');svg.style.cssText='width:100%;height:auto;border:1px solid #cbd5e1;background:white';}
 const generate=button('生成三视图',async()=>{if(busy)return;busy=true;generate.disabled=true;invalidate();const ticket=generation;status.textContent='正在读取实体并生成投影…';
  try{const out=await emit('drawingCreate',{bodyIds:inputs.filter(([,c])=>c.checked).map(([id])=>id),projection:projection.value,hiddenLines:hidden.checked,sections:sections.map(s=>({plane:s.plane.value,offset:Number(s.offset.value)}))});if(!live||ticket!==generation)return;if(!out||out.status==='failed'){status.textContent=out?.error?.message||'出图失败，请检查对象和截面位置。';return;}result=out;disabled.clear();dims.replaceChildren(element('summary',{},'自动尺寸（取消勾选即可移除）'));for(const dim of result.drawing.dimensions){const row=element('label',{}),c=element('input',{type:'checkbox',checked:true});row.style.display='block';row.append(c,element('span',{},dimensionLabel(dim)));c.addEventListener('change',()=>{c.checked?disabled.delete(dim.id):disabled.add(dim.id);draw();});dims.append(row);}draw();exportButtons.forEach(b=>b.disabled=false);status.textContent='图纸已生成；尺寸来自几何，原实体未修改。';}finally{busy=false;generate.disabled=false;}
 },'primary');
 for(const format of ['pdf','jpg','dxf','svg']){const b=button(format.toUpperCase(),async()=>{if(!result||busy)return;busy=true;b.disabled=true;try{const r=await emit('drawingExport',{drawingId:result.drawingId,format,paper:paper.value,title:title.value,disabledDimensions:[...disabled],name:'drawing.'+format});if(r?.result?.status==='download_initiated')status.textContent='已发起 '+format.toUpperCase()+' 下载；请在下载目录确认文件。';else if(r?.result?.status==='failed')status.textContent=r.result.error.message;else if(!r)status.textContent='导出未完成。';}finally{busy=false;b.disabled=!result;}},'secondary');b.disabled=true;exportButtons.push(b);options.append(b);}
 controls.prepend(objects);controls.append(generate,status,dims,options,element('p',{class:'property-footnote'},'DWG 写出尚不可用；DXF 可在 CAD 软件中打开。非整圆曲线按 0.01 mm 折线输出。截面为交线图。'));
 projection.addEventListener('change',invalidate);hidden.addEventListener('change',invalidate);objects.addEventListener('change',invalidate);paper.addEventListener('change',draw);title.addEventListener('input',draw);
 layout.append(controls,preview);d.append(layout);d._onClose=()=>{live=false;};
}

export function showAlignBodies({getState,openDialog,element,button,emit,setTaskTargetRefresh,close}){
 const d=openDialog('快速对齐','移动件可框选；基准件保持固定。选择轴和对齐位置后，一次应用。',{returnToSelect:true});
 let bodyIds=[...getState().selectedIds],picking=false,working=false;d._acceptSelection=!bodyIds.length;
 const info=element('p',{}),target=element('select',{'aria-label':'对齐目标'}),sourceSide=element('select',{'aria-label':'移动件对齐位置'}),targetSide=element('select',{'aria-label':'基准对齐位置'}),group=element('input',{type:'checkbox',checked:true}),axes=[];
 target.append(element('option',{value:'origin'},'世界原点'),element('option',{value:'anchor'},'参考锚点'));for(const b of getState().bodies)target.append(element('option',{value:b.id},b.name||b.id));
 if(bodyIds.length===2){target.value=bodyIds.at(-1);bodyIds=bodyIds.slice(0,1);}
 for(const select of [sourceSide,targetSide])for(const [v,t]of [['min','最小侧'],['center','中心'],['max','最大侧']])select.append(element('option',{value:v},t));sourceSide.value=targetSide.value='center';
 const row=(label,input)=>{const r=element('label',{class:'form-field wide'});r.append(element('span',{},label),input);d.append(r);};
 d.append(info,button('重新框选移动件',()=>{bodyIds=[];d._acceptSelection=true;picking=false;info.textContent='在模型上框选或 Shift 点选移动件。';emit('selectMode',{mode:'body'});},'secondary'));
 row('对齐到',target);d.append(button('在模型上点基准件',()=>{if(!bodyIds.length)return;picking=true;d._acceptSelection=true;emit('selectMode',{mode:'body'});info.textContent='请点一个固定基准件。';},'secondary'));
 row('移动件位置',sourceSide);row('目标位置',targetSide);
 const axisRow=element('div',{});for(const a of ['X','Y','Z']){const label=element('label',{}),c=element('input',{type:'checkbox',checked:true});label.append(c,element('span',{},a+' '));axisRow.append(label);axes.push([a,c]);}d.append(axisRow);row('多个移动件保持相对位置',group);
 const preview=element('p',{class:'property-callout'});d.append(preview);
 const read=()=>({bodyIds:[...bodyIds],target:['origin','anchor'].includes(target.value)?{kind:target.value}:{kind:'body',bodyId:target.value},axes:axes.filter(([,c])=>c.checked).map(([a])=>a),sourceSide:sourceSide.value,targetSide:targetSide.value,group:group.checked});
 const update=()=>{info.textContent='移动 '+bodyIds.length+' 件；'+(target.value==='origin'?'对齐世界原点':target.value==='anchor'?'对齐参考锚点':'基准件保持固定');preview.textContent='X/Y/Z 指世界坐标。最小侧/最大侧对应该轴的较小/较大坐标。';};
 d.append(button('查看位移',async()=>{const r=await emit('alignmentPlan',read());if(r)preview.textContent=r.moves.map(m=>`${getState().bodies.find(b=>b.id===m.bodyId)?.name||'实体'}：Δ ${m.delta.map(v=>Number(v.toFixed(3))).join(', ')} mm`).join('\n');},'secondary'),button('应用对齐',async()=>{if(working)return;working=true;try{const r=await emit('alignBodies',read());if(r?.status==='committed')close();}finally{working=false;}},'primary'));
 setTaskTargetRefresh(()=>{if(working)return;const ids=getState().selectedIds;if(picking&&ids.length===1&&!bodyIds.includes(ids[0])){target.value=ids[0];picking=false;d._acceptSelection=false;update();}else if(!picking&&d._acceptSelection&&ids.length){bodyIds=[...ids];update();}});update();
}
