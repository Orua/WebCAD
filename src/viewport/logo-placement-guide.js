import * as THREE from 'three';
import {logoIcon} from '../ui/logo-icons.js';
import {logoContourBounds} from '../logo-vector-review.js';

const el=(tag,attrs={})=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
/** Display-only placement. No topology or geometry job is created by dragging. */
export class LogoPlacementGuide{
 constructor(v,{bodyId,faceId,point,face,logo,params={}},handlers={}){
  this.v=v;this.handlers=handlers;this.logo=logo;this.bodyId=bodyId;this.faceId=faceId;
  this.origin=new THREE.Vector3(...face.origin);this.n=new THREE.Vector3(...face.normal).normalize();
  const seed=Math.abs(this.n.x)<.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
  this.x=seed.addScaledVector(this.n,-seed.dot(this.n)).normalize();this.y=new THREE.Vector3().crossVectors(this.n,this.x);
  this.sourceBounds=logoContourBounds(logo);const [x0,y0,x1,y1]=this.sourceBounds;this.cx=(x0+x1)/2;this.cy=(y0+y1)/2;
  const entry=v.objects.get(bodyId),faceGroup=entry?.body.faceGroups?.find(g=>g.faceId===faceId);
  if(!entry||!faceGroup)throw new Error('目标面的显示数据已变化，请重新选面。');
  const vertices=[],mesh=entry.mesh,position=mesh.geometry.getAttribute('position'),indices=mesh.geometry.index;
  mesh.updateWorldMatrix(true,false);this.bounds=[Infinity,Infinity,-Infinity,-Infinity];
  for(let i=faceGroup.start;i<faceGroup.start+faceGroup.count;i++){
   const p=mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(position,indices.getX(i))),q=this.local(p);
   vertices.push(...p.toArray());this.bounds[0]=Math.min(this.bounds[0],q[0]);this.bounds[1]=Math.min(this.bounds[1],q[1]);this.bounds[2]=Math.max(this.bounds[2],q[0]);this.bounds[3]=Math.max(this.bounds[3],q[1]);
  }
  const at=this.local(new THREE.Vector3(...point));this.tx=at[0];this.ty=at[1];
  this.scale=params.scale??Math.min(1,(this.bounds[2]-this.bounds[0])*.6/(x1-x0),(this.bounds[3]-this.bounds[1])*.6/(y1-y0));
  this.angle=params.angle??0;this.depth=params.depth??.2;
  this.group=new THREE.Group();v.scene.add(this.group);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const highlight=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x47bdad,transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));highlight.renderOrder=1000;this.group.add(highlight);
  this.outline=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xe2730b,depthTest:false,transparent:true,opacity:1}));this.outline.renderOrder=1005;this.group.add(this.outline);
  this.frame=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xe48b24,depthTest:false,transparent:true,opacity:1}));this.frame.renderOrder=1006;this.group.add(this.frame);
  this.dimensions=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x547b92,depthTest:false,transparent:true,opacity:.8}));this.dimensions.renderOrder=1004;this.group.add(this.dimensions);
  this.dom=el('div',{class:'logo-placement-overlay','data-ui-action':'logo'});v.host.append(this.dom);
  const field=(name,editable)=>{
   const n=el(editable?'input':'output',editable?{type:'number',step:'.01','aria-label':name}: {'aria-label':name});n.title=name;n.className='logo-gap';this.dom.append(n);return n;
  };
  this.top=field('距上边界（mm）',true);this.left=field('距左边界（mm）',true);this.right=field('距右边界（mm）',false);this.bottom=field('距下边界（mm）',false);
  this.top.addEventListener('change',()=>this.update({topMm:Number(this.top.value)}));this.left.addEventListener('change',()=>this.update({leftMm:Number(this.left.value)}));
  this.toolbar=el('div',{class:'logo-placement-toolbar'});this.dom.append(this.toolbar);
  const button=(icon,title,fn)=>{const b=el('button',{type:'button',title,'aria-label':title});b.append(logoIcon(icon));b.addEventListener('click',fn);this.toolbar.append(b);return b;};
  button('horizontal','水平居中',()=>this.align('horizontal'));button('vertical','垂直居中',()=>this.align('vertical'));button('center','双向居中',()=>this.align('center'));button('rotate','旋转 90°',()=>this.update({angleDeg:(this.angle+90)%360}));
  this.width=el('input',{type:'number',min:'.001',step:'.1',title:'LOGO 宽度（mm）','aria-label':'LOGO 宽度（mm）'});this.toolbar.append(this.width);this.width.addEventListener('change',()=>this.update({scale:Number(this.width.value)/(x1-x0)}));
  const depthIcon=el('span',{title:'雕刻深度（mm）'});depthIcon.append(logoIcon('depth'));this.toolbar.append(depthIcon);
  this.depthInput=el('input',{type:'number',min:'.001',step:'.1',value:this.depth,title:'雕刻深度（mm）','aria-label':'雕刻深度（mm）'});this.toolbar.append(this.depthInput);this.depthInput.addEventListener('change',()=>this.update({depthMm:Number(this.depthInput.value)}));
  button('image','更换目标面',()=>handlers.onSelectFace?.());this.apply=button('check','确认雕刻',()=>handlers.onApply?.());button('close','取消定位',()=>handlers.onCancel?.());
  this.dragHandle=el('button',{type:'button',class:'logo-drag-handle',title:'拖动 LOGO','aria-label':'拖动 LOGO'});this.dragHandle.append(logoIcon('image'));this.dom.append(this.dragHandle);
  this.scaleHandle=el('button',{type:'button',class:'logo-scale-handle',title:'等比缩放 LOGO','aria-label':'等比缩放 LOGO'});this.dom.append(this.scaleHandle);
  this.installDrag(this.dragHandle,false);this.installDrag(this.scaleHandle,true);this.redraw();
 }
 local(p){const q=p.clone().sub(this.origin);return[q.dot(this.x),q.dot(this.y)];}
 world(u,v,lift=.025){return this.origin.clone().addScaledVector(this.x,u).addScaledVector(this.y,v).addScaledVector(this.n,lift);}
 transformed([u,v]){const a=this.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=(u-this.cx)*this.scale,y=(v-this.cy)*this.scale;return[this.tx+x*c-y*s,this.ty+x*s+y*c];}
 projected(p){const q=p.clone().project(this.v.camera);return{x:(q.x+1)*this.v.host.clientWidth/2,y:(1-q.y)*this.v.host.clientHeight/2};}
 extents(){const[x0,y0,x1,y1]=this.sourceBounds,pts=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(p=>this.transformed(p));return[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];}
 get(){const[x0,y0,x1,y1]=this.extents(),a=this.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return{bodyId:this.bodyId,faceId:this.faceId,point:this.world(this.tx,this.ty,0).toArray(),scale:this.scale,angle:this.angle,depth:this.depth,offsetX:-(this.cx*c-this.cy*s)*this.scale,offsetY:-(this.cx*s+this.cy*c)*this.scale,margins:{left:x0-this.bounds[0],right:this.bounds[2]-x1,top:this.bounds[3]-y1,bottom:y0-this.bounds[1]},dimensionBasis:'target-face projected bounds',frame:{origin:this.origin.toArray(),normal:this.n.toArray(),x:this.x.toArray()}};}
 update(patch={}){
  if(patch.scale!==undefined){if(!Number.isFinite(patch.scale)||patch.scale<=0||patch.scale>10000)throw new Error('LOGO 比例无效');this.scale=patch.scale;}
  if(patch.angleDeg!==undefined){if(!Number.isFinite(patch.angleDeg))throw new Error('LOGO 角度无效');this.angle=patch.angleDeg;}
  if(patch.depthMm!==undefined){if(!Number.isFinite(patch.depthMm)||patch.depthMm<=0)throw new Error('雕刻深度必须大于 0');this.depth=patch.depthMm;}
  if(patch.point){if(patch.point.length!==3||!patch.point.every(Number.isFinite))throw new Error('LOGO 放置点无效');[this.tx,this.ty]=this.local(new THREE.Vector3(...patch.point));}
  const box=this.extents();if(patch.leftMm!==undefined){if(!Number.isFinite(patch.leftMm))throw new Error('左边距无效');this.tx+=this.bounds[0]+patch.leftMm-box[0];}if(patch.topMm!==undefined){if(!Number.isFinite(patch.topMm))throw new Error('上边距无效');this.ty+=this.bounds[3]-patch.topMm-box[3];}
  this.redraw();return this.get();
 }
 align(kind){if(!['center','horizontal','vertical'].includes(kind))throw new Error('未知对齐方式');const b=this.extents();if(kind!=='vertical')this.tx+=(this.bounds[0]+this.bounds[2]-b[0]-b[2])/2;if(kind!=='horizontal')this.ty+=(this.bounds[1]+this.bounds[3]-b[1]-b[3])/2;this.redraw();return this.get();}
 installDrag(handle,resize){
  handle.addEventListener('pointerdown',e=>{if(this.v.busy||this.v.interactionLocked)return;const at=this.pointerPoint(e);if(!at)return;e.preventDefault();e.stopPropagation();handle.setPointerCapture(e.pointerId);this.drag={pointerId:e.pointerId,at,tx:this.tx,ty:this.ty,scale:this.scale};this.v.controls.enabled=false;});
  handle.addEventListener('pointermove',e=>{if(!this.drag||this.drag.pointerId!==e.pointerId)return;e.preventDefault();const p=this.pointerPoint(e);if(!p)return;const d=this.drag;if(resize){const old=Math.hypot(d.at[0]-d.tx,d.at[1]-d.ty);if(old>1e-8)this.scale=Math.max(.001,Math.min(10000,d.scale*Math.hypot(p[0]-d.tx,p[1]-d.ty)/old));}else{this.tx=d.tx+p[0]-d.at[0];this.ty=d.ty+p[1]-d.at[1];}this.redraw();});
  const finish=()=>{this.drag=null;this.v.controls.enabled=true;this.v.suppressPickUntil=Date.now()+200;};handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
 }
 pointerPoint(e){const ray=this.v.ray(e).ray,p=ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.n,this.origin),new THREE.Vector3());return p?this.local(p):null;}
 redraw(){
  const lines=[];for(const r of this.logo.regions)for(const ring of[r.outer,...(r.holes??[])])for(let i=0;i<ring.length;i++)for(const p of[ring[i],ring[(i+1)%ring.length]])lines.push(...this.world(...this.transformed(p)).toArray());
  this.outline.geometry.dispose();this.outline.geometry=new THREE.BufferGeometry();this.outline.geometry.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
  const b=this.extents();this.frame.geometry.dispose();this.frame.geometry=new THREE.BufferGeometry().setFromPoints([[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].map(p=>this.world(...p)));
  const mx=(b[0]+b[2])/2,my=(b[1]+b[3])/2,pairs=[[[mx,b[3]],[mx,this.bounds[3]]],[[b[0],my],[this.bounds[0],my]],[[b[2],my],[this.bounds[2],my]],[[mx,b[1]],[mx,this.bounds[1]]]];this.dimensions.geometry.dispose();this.dimensions.geometry=new THREE.BufferGeometry().setFromPoints(pairs.flat().map(p=>this.world(...p)));
  const state=this.get();for(const key of['top','left','right','bottom']){const n=this[key],value=state.margins[key].toFixed(2);if(document.activeElement!==n){if(n.tagName==='INPUT')n.value=value;else n.textContent=value;}n.dataset.outside=state.margins[key]<-.001?'true':'false';}
  if(document.activeElement!==this.width)this.width.value=((this.sourceBounds[2]-this.sourceBounds[0])*this.scale).toFixed(2);if(document.activeElement!==this.depthInput)this.depthInput.value=this.depth;
  this.apply.disabled=Object.values(state.margins).some(v=>v<-.001)||this.v.busy;
  this.handlers.onChange?.(state);this.v.lastFrameKey=null;this.render();
 }
 render(){
  if(this.v.topology?.bodyId===this.bodyId&&this.v.topology?.ids?.includes(this.faceId)&&this.v.faceOverlay){this.hiddenFaceOverlay=this.v.faceOverlay;this.hiddenFaceOverlay.visible=false;}
  const b=this.extents(),points={top:[(b[0]+b[2])/2,(b[3]+this.bounds[3])/2],left:[(b[0]+this.bounds[0])/2,(b[1]+b[3])/2],right:[(b[2]+this.bounds[2])/2,(b[1]+b[3])/2],bottom:[(b[0]+b[2])/2,(b[1]+this.bounds[1])/2]};
  const put=(node,p,dx=0,dy=0)=>{const q=this.projected(this.world(...p));node.style.left=Math.max(40,Math.min(this.v.host.clientWidth-40,q.x+dx))+'px';node.style.top=Math.max(18,Math.min(this.v.host.clientHeight-22,q.y+dy))+'px';};
  for(const key of Object.keys(points))put(this[key],points[key]);put(this.dragHandle,[this.tx,this.ty]);put(this.scaleHandle,[b[2],b[3]]);put(this.toolbar,[(b[0]+b[2])/2,b[1]],0,34);for(const control of this.dom.querySelectorAll('input,button'))control.disabled=this.v.busy||this.v.interactionLocked;this.apply.disabled=this.v.busy||this.v.interactionLocked||Object.values(this.get().margins).some(v=>v<-.001);
 }
 dispose(){this.drag=null;this.v.controls.enabled=true;if(this.hiddenFaceOverlay)this.hiddenFaceOverlay.visible=true;this.dom.remove();this.v.scene.remove(this.group);this.v.disposeObject(this.group);this.v.lastFrameKey=null;}
}
