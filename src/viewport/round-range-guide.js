import * as THREE from 'three';

export class RoundRangeGuide{
 constructor(viewport,report,handlers){
  this.v=viewport;this.report=report;this.handlers=handlers;this.group=new THREE.Group();viewport.scene.add(this.group);
  if(report.mode!=='end')return;
  const s=report.scope;this.axis='XYZ'.indexOf(s.axis);this.value=report.control.value;
  const entry=viewport.objects.get(report.previewBodyId);
  if(entry){const n=new THREE.Vector3();n.setComponent(this.axis,s.direction);this.plane=new THREE.Plane(n,-s.direction*s.center[this.axis]);
   const material=new THREE.MeshBasicMaterial({color:viewport.displayPreferences.themeColor,transparent:true,opacity:.36,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,clippingPlanes:[this.plane]});
   this.group.add(new THREE.Mesh(entry.mesh.geometry.clone(),material));}
  this.ring=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:viewport.displayPreferences.themeColor,depthTest:false}));this.ring.renderOrder=1001;this.group.add(this.ring);
  if(handlers){const b=document.createElement('button');this.button=b;b.type='button';b.textContent='↔ 范围';b.setAttribute('aria-label','拖动圆头范围');b.style.cssText='position:absolute;z-index:9;touch-action:none;cursor:ew-resize;border:2px solid var(--theme-color,#2563eb);border-radius:14px;background:var(--panel-bg,#fff);color:var(--text-color,#243446);padding:4px 9px;font-size:12px';viewport.host.append(b);
   b.onpointerdown=e=>{if(viewport.busy)return;e.preventDefault();e.stopPropagation();b.setPointerCapture(e.pointerId);this.drag={x:e.clientX,y:e.clientY,value:this.value};viewport.controls.enabled=false;};
   b.onpointermove=e=>{if(!this.drag)return;const [a,z]=this.projection();const dx=z.x-a.x,dy=z.y-a.y,n=dx*dx+dy*dy;if(n<.1)return;this.setValue(this.drag.value-((e.clientX-this.drag.x)*dx+(e.clientY-this.drag.y)*dy)/n*s.direction);handlers.onInput?.(this.value);};
   const finish=()=>{if(!this.drag)return;this.drag=null;viewport.controls.enabled=true;viewport.suppressPickUntil=Date.now()+200;handlers.onRelease?.(this.value);};b.onpointerup=finish;b.onpointercancel=finish;
   b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)&&!viewport.busy){e.preventDefault();this.setValue(this.value+(e.key==='ArrowLeft'?-.01:.01));handlers.onInput?.(this.value);handlers.onRelease?.(this.value);}};
  }
  this.setValue(this.value);
 }
 center(){const p=[...this.report.scope.center];p[this.axis]=this.report.scope.end-this.report.scope.direction*this.value;return p;}
 projection(){const a=new THREE.Vector3(...this.center()),z=a.clone();z.setComponent(this.axis,z.getComponent(this.axis)+1);const {width,height}=this.v.host.getBoundingClientRect();return[a,z].map(p=>{p.project(this.v.camera);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2,z:p.z};});}
 setValue(value){const c=this.report.control;this.value=Math.max(c.min,Math.min(c.max,Math.round(value/(c.step??.01))*(c.step??.01)));const center=this.center(),axes=this.report.scope.crossAxes.map(a=>'XYZ'.indexOf(a)),size=this.report.scope.sectionSize;if(this.plane)this.plane.constant=-this.report.scope.direction*center[this.axis];const points=[[1,1],[-1,1],[-1,-1],[1,-1]].map(sign=>{const p=[...center];axes.forEach((a,i)=>p[a]+=sign[i]*(size[i]/2+.08));return new THREE.Vector3(...p);});this.ring.geometry.dispose();this.ring.geometry=new THREE.BufferGeometry().setFromPoints(points);this.render();}
 render(){if(!this.button)return;const p=this.projection()[0];this.button.hidden=p.z>1||p.z< -1;this.button.disabled=this.v.busy;this.button.style.left=p.x+'px';this.button.style.top=p.y+'px';this.button.style.transform='translate(-50%,-50%)';}
 dispose(){this.drag=null;this.v.controls.enabled=true;this.button?.remove();this.v.scene.remove(this.group);this.v.disposeObject(this.group);}
}
