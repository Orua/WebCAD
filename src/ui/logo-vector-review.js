import {humanError} from '../error-recovery.js';
import {logoContourBounds} from '../logo-vector-review.js';
import {setLogoButtonIcon} from './logo-icons.js';

const NS='http://www.w3.org/2000/svg';
const svgTags=new Set(['svg','g','path','circle','image']);
const el=(tag,attrs={},text)=>{const n=svgTags.has(tag)?document.createElementNS(NS,tag):document.createElement(tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
export function createLogoVectorReview({session,imageUrl,onChange,onError}){
 if(typeof window!=='undefined')import('./logo-vector-review.css');
 const root=el('section',{class:'logo-vector-review','aria-label':'矢量轮廓校对'}),canvas=el('svg',{class:'logo-review-canvas',role:'img','aria-label':'毫米轮廓；选择轮廓后拖动节点，或使用下方坐标编辑'}),toolbar=el('div',{class:'logo-review-toolbar'}),select=el('select',{'aria-label':'选择外轮廓或孔洞'}),node=el('input',{type:'number',min:'1',step:'1','aria-label':'节点编号'}),x=el('input',{type:'number',step:'any','aria-label':'节点 X 毫米'}),y=el('input',{type:'number',step:'any','aria-label':'节点 Y 毫米'}),status=el('p',{class:'property-footnote',role:'status'}),error=el('p',{class:'form-error',role:'alert'});
 const button=(text,action)=>{const b=el('button',{type:'button',class:'secondary','data-ui-action':'logoReview'},text);b.addEventListener('click',action);return b;};
 const run=request=>{try{const state=session.act({...request,expectedRevision:session.get().revision});error.textContent='';render();onChange?.(state);return state;}catch(e){error.textContent=humanError(e);onError?.(e);render();}};
 const undo=button('撤销',()=>run({action:'undo'})),removePoint=button('删除节点',()=>run({action:'deletePoint'})),removeContour=button('删除所选轮廓',()=>run({action:'deleteContour'})),apply=button('更新坐标',()=>run({action:'setPoint',pointMm:[Number(x.value),Number(y.value)]}));
 for(const [control,icon,title]of [[undo,'undo','撤销修改'],[removePoint,'point','删除节点'],[removeContour,'trash','删除所选轮廓'],[apply,'check','应用节点坐标']])setLogoButtonIcon(control,icon,title);
 toolbar.append(select,undo);
 const fields=el('div',{class:'logo-review-coordinates'});for(const [name,input]of [['节点',node],['X · mm',x],['Y · mm',y]]){const label=el('label',{},name);label.append(input);fields.append(label);}
 const actions=el('div',{class:'logo-review-actions'});actions.append(apply,removePoint,removeContour);
 canvas.setAttribute('title','选择轮廓，拖动节点或输入毫米坐标。');root.append(toolbar,canvas,fields,actions,status,error);
 let viewport=null,drag=null;
 function render(){
  const state=session.get(),{logo,selection}=state;undo.disabled=!state.canUndo;
  select.replaceChildren();logo.regions.forEach((r,i)=>{const outer=el('option',{value:`${i}:-1`},`区域 ${i+1} · 外轮廓 (${r.outer.length})`);select.append(outer);(r.holes||[]).forEach((hole,j)=>select.append(el('option',{value:`${i}:${j}`},`区域 ${i+1} · 孔 ${j+1} (${hole.length})`)));});
  select.value=`${selection.regionIndex}:${selection.holeIndex??-1}`;
  const region=logo.regions[selection.regionIndex],ring=selection.holeIndex===null?region.outer:region.holes[selection.holeIndex],point=ring[selection.pointIndex];
  node.max=String(ring.length);node.value=String(selection.pointIndex+1);x.value=String(point[0]);y.value=String(point[1]);
  canvas.replaceChildren();
  const bounds=logoContourBounds(logo),frame=logo.source?.rasterFrame;
  if(!viewport){let [a,b,c,d]=bounds;if(frame){a=Math.min(a,frame.xMm);b=Math.min(b,frame.yMm);c=Math.max(c,frame.xMm+frame.widthMm);d=Math.max(d,frame.yMm+frame.heightMm);}const pad=Math.max(c-a,d-b)*.06;viewport=[a-pad,-d-pad,c-a+2*pad,d-b+2*pad];}
  canvas.setAttribute('viewBox',viewport.join(' '));
  if(imageUrl&&frame)canvas.append(el('image',{href:imageUrl,x:frame.xMm,y:-(frame.yMm+frame.heightMm),width:frame.widthMm,height:frame.heightMm,opacity:'.35',preserveAspectRatio:'none','pointer-events':'none'}));
  for(const [i,r] of logo.regions.entries())for(const [j,points] of [r.outer,...(r.holes||[])].entries()){
   const active=i===selection.regionIndex&&(j===0?selection.holeIndex===null:selection.holeIndex===j-1),path=el('path',{d:points.map(([a,b],k)=>`${k?'L':'M'}${a} ${-b}`).join(' ')+' Z',class:active?'logo-review-path selected':'logo-review-path','data-region':i,'data-hole':j-1});
   path.addEventListener('pointerdown',event=>{if(drag)return;event.stopPropagation();run({action:'select',regionIndex:i,holeIndex:j===0?null:j-1,pointIndex:0});});canvas.append(path);
  }
  // Only the selected contour exposes handles; all vertices remain reachable by number.
  const radius=Math.max(viewport[2],viewport[3])*.008;
  const visible=ring.length<=250?ring.map((_,i)=>i):[selection.pointIndex];
  for(const index of visible){const p=ring[index],handle=el('circle',{cx:p[0],cy:-p[1],r:radius,class:index===selection.pointIndex?'logo-review-node selected':'logo-review-node'});handle.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();run({action:'select',...selection,pointIndex:index});drag={index,pointerId:event.pointerId,original:session.get().revision};canvas.setPointerCapture(event.pointerId);});canvas.append(handle);}
  status.textContent=`${logo.sizeMm.map(v=>v.toFixed(2)).join(' × ')} mm`;status.title=`${logo.regions.length} 个区域 · ${logo.regions.reduce((n,r)=>n+(r.holes?.length||0),0)} 个孔 · ${state.reviewRequired?'尚未确认':'已确认'}`;
 }
 const local=event=>{const p=canvas.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const matrix=canvas.getScreenCTM();if(!matrix)throw new Error('画布当前不可见');const q=p.matrixTransform(matrix.inverse());return [q.x,-q.y];};
 canvas.addEventListener('pointermove',event=>{if(!drag||drag.pointerId!==event.pointerId)return;const [a,b]=local(event);x.value=String(a);y.value=String(b);const h=canvas.querySelector('.logo-review-node.selected');if(h){h.setAttribute('cx',a);h.setAttribute('cy',-b);}});
 canvas.addEventListener('pointerup',event=>{if(!drag||drag.pointerId!==event.pointerId)return;const expectedRevision=drag.original;drag=null;try{const state=session.act({action:'setPoint',expectedRevision,pointMm:local(event)});render();onChange?.(state);}catch(e){error.textContent=humanError(e);render();}});
 canvas.addEventListener('pointercancel',()=>{drag=null;render();});
 select.addEventListener('change',()=>{const [i,j]=select.value.split(':').map(Number);run({action:'select',regionIndex:i,holeIndex:j<0?null:j,pointIndex:0});});
 node.addEventListener('change',()=>run({action:'select',...session.get().selection,pointIndex:Number(node.value)-1}));
 render();return {element:root,render,act:request=>{const state=session.act(request);render();onChange?.(state);return state;}};
}
