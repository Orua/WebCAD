import * as THREE from 'three';
const boxEdges=[];for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))boxEdges.push([i,i|bit]);
const inDepth=p=>p.w>0&&p.z>=-p.w&&p.z<=p.w;
function clipDepth(a,b){
 let first=0,last=1;
 // Clip in homogeneous coordinates before dividing by w. Dropping out-of-depth
 // corners misses boxes whose edges cross the visible near/far slab entirely.
 for(const sign of [1,-1]){
  const fa=a.w+sign*a.z,fb=b.w+sign*b.z;
  if(fa<0&&fb<0)return null;
  if(fa<0)first=Math.max(first,fa/(fa-fb));
  if(fb<0)last=Math.min(last,fa/(fa-fb));
 }
 if(first>last)return null;
 return [a.clone().lerp(b,first),a.clone().lerp(b,last)].filter(p=>p.w>0);
}
export function rectangleCandidates(viewport,{rect,mode='window'}={}){
 if(!Array.isArray(rect)||rect.length!==4||rect.some(x=>!Number.isFinite(x)||x<0||x>1)||rect[0]>=rect[2]||rect[1]>=rect[3]||!['window','crossing'].includes(mode))throw Object.assign(new Error('框选范围须为视口归一化 [左,上,右,下]'),{code:'PARAM_SCHEMA_INVALID'});
 viewport.camera.updateMatrixWorld();const ids=[],projection=new THREE.Matrix4().multiplyMatrices(viewport.camera.projectionMatrix,viewport.camera.matrixWorldInverse);
 for(const [id,entry]of viewport.objects){if(!entry.root.visible)continue;const {min,max}=entry.body.bounds,corners=[];
  for(let i=0;i<8;i++)corners.push(new THREE.Vector4(...[0,1,2].map(k=>(i>>k&1)?max[k]:min[k]),1).applyMatrix4(projection));
  const complete=corners.every(inDepth);if(mode==='window'&&!complete)continue;
  const clipped=complete?corners:boxEdges.flatMap(([a,b])=>clipDepth(corners[a],corners[b])||[]);
  const pts=clipped.map(p=>[(p.x/p.w+1)/2,(1-p.y/p.w)/2]);
  if(!pts.length)continue;const b=[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];
  const hit=mode==='window'?b[0]>=rect[0]&&b[1]>=rect[1]&&b[2]<=rect[2]&&b[3]<=rect[3]:b[0]<=rect[2]&&b[2]>=rect[0]&&b[1]<=rect[3]&&b[3]>=rect[1];if(hit)ids.push(id);
 }
 return ids;
}
export function installRectangleSelection(viewport){
 const canvas=viewport.renderer.domElement,keys=window;let drag,box;
 const cleanup=(cancelPick=false)=>{const previous=drag;drag=null;box?.remove();box=null;if(!previous)return;
  viewport.controls.enabled=previous.controlsEnabled;if(cancelPick)viewport.suppressPickUntil=Date.now()+200;
  if(canvas.hasPointerCapture?.(previous.pointerId))canvas.releasePointerCapture(previous.pointerId);
 };
 const down=e=>{if(drag||e.button!==0||e.altKey||viewport.busy||viewport.selectionMode!=='body'||viewport.gizmoMode!=='off'||viewport.anchorDragEnabled||viewport.sketch||viewport.measuring)return;
  const r=canvas.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,rect:r,pointerId:e.pointerId,controlsEnabled:viewport.controls.enabled,additive:e.shiftKey||e.ctrlKey};viewport.controls.enabled=false;canvas.setPointerCapture(e.pointerId);
 };
 const move=e=>{if(!drag||e.pointerId!==drag.pointerId||!box&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5)return;
  if(!box){box=document.createElement('div');box.style.cssText='position:absolute;pointer-events:none;z-index:10;border:1px solid var(--theme-color,#2563eb);background:#2563eb20';viewport.host.append(box);}
  Object.assign(box.style,{left:Math.min(drag.x,e.clientX)-drag.rect.left+'px',top:Math.min(drag.y,e.clientY)-drag.rect.top+'px',width:Math.abs(e.clientX-drag.x)+'px',height:Math.abs(e.clientY-drag.y)+'px',borderStyle:e.clientX>=drag.x?'solid':'dashed'});
 };
 const up=e=>{if(!drag||e.pointerId!==drag.pointerId)return;const d=drag,active=!!box;cleanup();if(!active)return;viewport.suppressPickUntil=Date.now()+200;const clamp=v=>Math.max(0,Math.min(1,v));const rect=[clamp((Math.min(d.x,e.clientX)-d.rect.left)/d.rect.width),clamp((Math.min(d.y,e.clientY)-d.rect.top)/d.rect.height),clamp((Math.max(d.x,e.clientX)-d.rect.left)/d.rect.width),clamp((Math.max(d.y,e.clientY)-d.rect.top)/d.rect.height)];if(rect[0]<rect[2]&&rect[1]<rect[3])viewport.callbacks.onRectangleSelect?.({rect,mode:e.clientX>=d.x?'window':'crossing',additive:d.additive});};
 const cancel=e=>{if(drag&&e.pointerId===drag.pointerId)cleanup(true);},escape=e=>{if(e.key==='Escape'&&drag)cleanup(true);};
 const listeners={pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:cancel};
 for(const [type,handler]of Object.entries(listeners))canvas.addEventListener(type,handler,true);keys.addEventListener('keydown',escape);
 return ()=>{cleanup(true);for(const [type,handler]of Object.entries(listeners))canvas.removeEventListener(type,handler,true);keys.removeEventListener('keydown',escape);};
}
