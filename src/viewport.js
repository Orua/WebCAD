import * as THREE from 'three';
import {applyViewportDisplay} from './viewport/display-modes.js';
import {snapReleasedDrag} from './viewport/drag-snap-controller.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { MetalMaterials, METAL_FINISHES } from './metal-materials.js';
import { getLanguage } from './i18n.js';
import { loadDisplayPreferences } from './display-preferences.js';
const say=(zh,en)=>getLanguage()==='en'?en:zh;

const COLORS = [0xaac4d9, 0xc5b395, 0x91bdb1, 0xb3a6c8, 0x9db5c6, 0xc39e9e];
export class CADViewport {
  constructor(host, callbacks = {}) {
    this.host=host; this.callbacks=callbacks; this.objects=new Map(); this.selected=[]; this.selectionMode='body'; this.mode='edges'; this.hidden=[]; this.temporaryDisplay='normal';
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color('#eef1f5');
    this.camera=new THREE.PerspectiveCamera(35,1,0.01,100000); this.camera.up.set(0,0,1); this.camera.position.set(90,-110,85);
    this.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.displayPreferences=loadDisplayPreferences();this.finishKey=this.displayPreferences.defaultFinish;
    this.metals=new MetalMaterials(this.renderer,this.scene,{onError:error=>this.callbacks.onRenderError?.(error)});
    this.metals.ready.then(()=>this.setMetalFinish(this.finishKey));
    host.append(this.renderer.domElement); this.renderer.domElement.setAttribute('aria-label','三维建模视口'); this.renderer.domElement.tabIndex=0;
    this.controls=new OrbitControls(this.camera,this.renderer.domElement); this.controls.enableDamping=true; this.controls.dampingFactor=.12;
    this.partFinishes={};this.partColors={};this.snapEnabled=true;this.clipPlanes=[];this.renderer.localClippingEnabled=true;
    this.gizmoProxy=new THREE.Object3D();this.scene.add(this.gizmoProxy);
    this.gizmo=new TransformControls(this.camera,this.renderer.domElement);this.gizmo.setSize(.8);this.gizmo.setSpace('world');this.gizmoMode='off';this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed',event=>{this.controls.enabled=!event.value;});
    this.gizmo.addEventListener('mouseDown',()=>this.beginTransform());
    this.gizmo.addEventListener('objectChange',()=>this.previewTransform());
    this.gizmo.addEventListener('mouseUp',()=>this.finishTransform());
    const hemisphere=new THREE.HemisphereLight(0xffffff,0x7a879e,2.4);this.scene.add(hemisphere);
    const light=new THREE.DirectionalLight(0xffffff,3.1);light.position.set(30,-50,100);this.scene.add(light);
    const fill=new THREE.DirectionalLight(0xe1edff,1.8);fill.position.set(-60,20,30);this.scene.add(fill);
    this.studioLights=[hemisphere,light,fill];
    this.modelRoot=new THREE.Group();this.scene.add(this.modelRoot);this.guideRoot=new THREE.Group();this.scene.add(this.guideRoot);
    this.anchorProxy=new THREE.Object3D();this.scene.add(this.anchorProxy);
    this.anchorVisual=new THREE.Group();this.anchorVisual.renderOrder=900;this.scene.add(this.anchorVisual);
    this.anchorVisible=localStorage.getItem('webcad.anchorVisible')!=='false';
    this.anchorMarker=document.createElement('span');this.anchorMarker.className='cad-anchor-orb';this.anchorMarker.setAttribute('aria-label','参考锚点');host.append(this.anchorMarker);
    this.anchorGizmo=new TransformControls(this.camera,this.renderer.domElement);this.anchorGizmo.setMode('translate');this.anchorGizmo.setSpace('world');this.anchorGizmo.setSize(.72);this.anchorGizmoHelper=this.anchorGizmo.getHelper();this.anchorGizmoHelper.visible=false;this.scene.add(this.anchorGizmoHelper);this.anchorDragEnabled=false;
    this.anchorGizmo.addEventListener('dragging-changed',event=>{this.controls.enabled=!event.value;});
    this.anchorGizmo.addEventListener('mouseDown',()=>{this.anchorStart=this.anchorProxy.position.clone();this.anchorAxis=this.anchorGizmo.axis;this.anchorSkipSnap=!!this.skipAnchorSnap;this.skipAnchorSnap=false;});
    this.anchorGizmo.addEventListener('objectChange',()=>this.anchorVisual.position.copy(this.anchorProxy.position));
    this.anchorGizmo.addEventListener('mouseUp',()=>this.finishAnchorDrag());
    this.grid=new THREE.GridHelper(200,40,0x99acb8,0xd5dce3);this.grid.rotation.x=Math.PI/2;this.grid.position.z=-.01;this.scene.add(this.grid);
    this.axes=new THREE.AxesHelper(20);this.axes.visible=false;this.scene.add(this.axes);this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.span=50;
    this.hud=document.createElement('div');this.hud.className='viewport-entity-status';this.hud.style.cssText='position:absolute;left:18px;bottom:38px;pointer-events:none;color:#64748b;font:11px monospace;z-index:2';host.append(this.hud);
    this.overlay=document.createElement('div');this.overlay.className='viewport-task';this.overlay.style.cssText='display:none;position:absolute;left:50%;top:20px;transform:translateX(-50%);background:#fff;padding:14px 18px;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 8px 30px #14213320;z-index:12;min-width:320px;color:#243446;font-size:12px';host.append(this.overlay);
    this.renderer.domElement.addEventListener('pointerdown',e=>{this.down=[e.clientX,e.clientY,e.button];});
    this.renderer.domElement.addEventListener('pointerup',e=>{if(this.gizmo.axis||Date.now()<(this.suppressPickUntil||0)||!this.down||this.down[2]!==0||Math.hypot(e.clientX-this.down[0],e.clientY-this.down[1])>5)return;this.pick(e);});
    this.renderer.domElement.addEventListener('pointermove',e=>this.onMove(e));
    window.addEventListener('keydown',e=>{if(e.key!=='Tab'||!(this.measuring||this.anchorDragEnabled)||!this.snapCandidates?.length||e.target instanceof HTMLElement&&(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)||e.target.isContentEditable))return;e.preventDefault();this.snapCandidateIndex=((this.snapCandidateIndex||0)+1)%this.snapCandidates.length;this.showSnapCandidate();});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);
    this.frameSequence=0;this.renderer.setAnimationLoop(()=>{try{this.renderFrame();}catch(error){this.displayError=error.message;this.callbacks.onRenderError?.(error);}});this.resize();this.updateHud();
  }
  resize(){const {width,height}=this.host.getBoundingClientRect();if(width<1||height<1)return;this.camera.aspect=width/height;if(this.camera.isOrthographicCamera){this.camera.left=-this.camera.top*this.camera.aspect;this.camera.right=this.camera.top*this.camera.aspect;}this.camera.updateProjectionMatrix();this.renderer.setSize(width,height);}
  disposeObject(root){root.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});}
  clearGuides(){for(const child of [...this.guideRoot.children]){this.disposeObject(child);this.guideRoot.remove(child);}}
  setWorkFrame(frame){if(!frame)return;this.anchorProxy.position.fromArray(frame.origin);this.anchorProxy.quaternion.fromArray(frame.quaternion);this.anchorVisual.position.copy(this.anchorProxy.position);this.anchorVisual.quaternion.copy(this.anchorProxy.quaternion);if(frame.locked)this.setAnchorDrag(false);}
  setAnchorVisible(visible){this.anchorVisible=!!visible;this.anchorMarker.hidden=!this.anchorVisible;localStorage.setItem('webcad.anchorVisible',String(this.anchorVisible));}
  setAnchorDrag(enabled){this.setModelingPrecision();this.anchorDragEnabled=!!enabled;this.anchorGizmoHelper.visible=this.anchorDragEnabled;if(this.anchorDragEnabled){this.setGizmo('off');this.anchorGizmo.attach(this.anchorProxy);}else{this.anchorGizmo.detach();this.controls.enabled=true;}}
  cancelAnchorDrag(){if(this.anchorStart){this.anchorProxy.position.copy(this.anchorStart);this.anchorVisual.position.copy(this.anchorStart);this.anchorStart=null;}this.snapCandidates=[];this.setAnchorDrag(false);}
  setBodies(bodies,hidden=[]){
    // Keep unchanged GPU objects alive. Kernel render versions survive a rebuild
    // only when the exact geometry was reused (including undo/preview branches).
    this.hidden=hidden;
    if(this.faceOverlay){this.modelRoot.remove(this.faceOverlay);this.disposeObject(this.faceOverlay);this.faceOverlay=null;}
    const incoming=new Map(bodies.map(body=>[body.id,body]));
    for(const [id,entry] of this.objects){
      const body=incoming.get(id);
      if(!body||body.renderVersion===undefined||body.renderVersion!==entry.body.renderVersion){
        this.modelRoot.remove(entry.root);this.disposeObject(entry.root);this.objects.delete(id);
      }
    }
    bodies.forEach((body,i)=>{
      const retained=this.objects.get(body.id);
      if(retained){retained.body=body;retained.mesh.userData.body=body;retained.root.visible=!hidden.includes(body.id);return;}
      const root=new THREE.Group();root.userData.bodyId=body.id;const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(body.positions,3));
      if(body.normals?.length)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(body.normals,3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(body.indices),1));if(!body.normals?.length)geometry.computeVertexNormals();
      const defaultColor=this.displayPreferences.defaultColor,color=this.partColors[body.id]||defaultColor;const material=new THREE.MeshStandardMaterial({color,metalness:.15,roughness:.42,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,side:THREE.DoubleSide});
      this.metals.apply(material,this.partFinishes[body.id]||this.finishKey,{bounds:body.bounds,baseColor:color});material.clippingPlanes=this.clipPlanes;
      const mesh=new THREE.Mesh(geometry,material);mesh.userData={bodyId:body.id,body,baseColor:color,defaultColor,type:'body'};root.add(mesh);
      const edges=new THREE.Group();
      for(const edge of body.edges||[]){if(edge.positions.length<6)continue;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(edge.positions,3));const line=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x465b6e,transparent:true,opacity:.72}));line.userData={bodyId:body.id,type:'edge',edgeId:edge.edgeId};edges.add(line);}
      if(!edges.children.length){const outline=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,25),new THREE.LineBasicMaterial({color:0x465b6e}));outline.userData={bodyId:body.id,type:'outline'};edges.add(outline);}
      root.add(edges);root.visible=!hidden.includes(body.id);this.modelRoot.add(root);this.objects.set(body.id,{root,mesh,edges,body});
    });this.setDisplay(this.mode);this.setMetalFinish(this.finishKey);this.applyClipping();this.updateHud();
  }
  setHidden(ids){this.hidden=ids;this.applyTemporaryDisplay();}
  setTemporaryDisplay(mode){if(!['normal','selectedOnly','transparentOthers'].includes(mode))throw new Error('未知临时显示方式');this.temporaryDisplay=mode;this.applyTemporaryDisplay();}
  applyTemporaryDisplay(){for(const [id,entry] of this.objects){const selected=this.selected.includes(id),persistentlyHidden=this.hidden.includes(id),solo=this.temporaryDisplay==='selectedOnly';entry.root.visible=!persistentlyHidden&&(!solo||selected);const translucent=this.temporaryDisplay==='transparentOthers'&&!selected&&!persistentlyHidden,technical=this.mode==='transparentEdges';entry.mesh.material.transparent=translucent||technical;entry.mesh.material.opacity=translucent?.2:technical?.35:1;entry.mesh.material.depthWrite=!(translucent||technical);for(const edge of entry.edges.children){edge.material.opacity=translucent?.25:.72;edge.material.transparent=true;}}this.updateHud();}
  setSelection(ids=[],topology=null){
    this.selected=ids;this.topology=topology;
    for(const [id,entry] of this.objects){const active=ids.includes(id),design=(this.partFinishes[id]||this.finishKey)==='design';if(design)entry.mesh.material.color.set(entry.mesh.userData.baseColor);entry.mesh.material.emissive.set(active?0x080b0b:0x000000);entry.edges.children.forEach(line=>{const edge=topology?.bodyId===id&&topology?.type==='edge'&&topology.ids.includes(line.userData.edgeId);line.material.color.set(edge?0xf08e2b:active?new THREE.Color(this.displayPreferences.themeColor):0x465b6e);line.material.opacity=edge?1:.72;});}
    if(this.faceOverlay){this.modelRoot.remove(this.faceOverlay);this.disposeObject(this.faceOverlay);this.faceOverlay=null;}
    if(topology?.type==='face'){const entry=this.objects.get(topology.bodyId);if(entry&&!this.hidden.includes(topology.bodyId)){const indices=[];for(const g of entry.body.faceGroups||[])if(topology.ids.includes(g.faceId))for(let i=g.start;i<g.start+g.count;i++)indices.push(entry.body.indices[i]);if(indices.length){const geo=new THREE.BufferGeometry();geo.setAttribute('position',entry.mesh.geometry.getAttribute('position').clone());geo.setIndex(indices);this.faceOverlay=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xf7ac50,transparent:true,opacity:.48,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));this.modelRoot.add(this.faceOverlay);}}}
    this.applyTemporaryDisplay();this.applyClipping();this.syncGizmo();
  }
  setSelectionMode(mode){this.selectionMode=mode;this.setDisplay(this.mode);this.updateHud();}
  viewFrame(frame){const previous={position:this.camera.position.toArray(),up:this.camera.up.toArray(),target:this.controls.target.toArray()},q=new THREE.Quaternion(...frame.quaternion),origin=new THREE.Vector3(...frame.origin),normal=new THREE.Vector3(0,0,1).applyQuaternion(q),distance=Math.max(this.camera.position.distanceTo(this.controls.target),20);this.camera.up.copy(new THREE.Vector3(0,1,0).applyQuaternion(q));this.controls.target.copy(origin);this.camera.position.copy(origin).addScaledVector(normal,distance);this.controls.update();return previous;}
  restoreFrameView(previous){this.camera.position.fromArray(previous.position);this.camera.up.fromArray(previous.up);this.controls.target.fromArray(previous.target);this.controls.update();}
  setMetalFinish(key){
    if(!METAL_FINISHES[key])throw new Error('未知金属材质。');
    this.finishKey=key;
    const metal=key!=='design'||Object.entries(this.partFinishes).some(([id,finish])=>this.objects.has(id)&&finish!=='design');
    this.renderer.toneMapping=metal?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;
    const p=this.displayPreferences;
    this.renderer.toneMappingExposure=p.exposure;
    this.scene.background.set(p.background);
    const intensity=metal?[p.ambientIntensity,p.keyIntensity,p.fillIntensity]:[p.ambientIntensity*2.4/.7,p.keyIntensity*3.1/1.3,p.fillIntensity*1.8/.6];
    this.studioLights?.forEach((light,index)=>light.intensity=intensity[index]);
    const az=p.lightAzimuth*Math.PI/180,el=p.lightElevation*Math.PI/180;
    this.studioLights?.[1].position.set(100*Math.cos(el)*Math.cos(az),100*Math.cos(el)*Math.sin(az),100*Math.sin(el));
    this.studioLights?.[2].position.set(-100*Math.cos(az),-100*Math.sin(az),50);
    for(const [id,entry] of this.objects){entry.mesh.userData.defaultColor=p.defaultColor;entry.mesh.userData.baseColor=this.partColors[id]||p.defaultColor;this.metals.apply(entry.mesh.material,this.partFinishes[id]||key,{bounds:entry.body.bounds,baseColor:entry.mesh.userData.baseColor,displayPreferences:p});}
    this.setSelection(this.selected,this.topology);
    return METAL_FINISHES[key].label;
  }
  setPartMetal(ids,key){if(!METAL_FINISHES[key])throw new Error('Unknown material');for(const id of ids)this.partFinishes={...this.partFinishes,[id]:key};this.setMetalFinish(this.finishKey);}
  setBusy(value){this.busy=value;this.gizmo.enabled=!value&&!this.transformPending;}
  setModelingPrecision(){const mm=this.displayPreferences?.dimensionPrecisionMm??0.01,deg=this.displayPreferences?.anglePrecisionDeg??0.1;this.gizmo.setTranslationSnap(mm);this.gizmo.setRotationSnap(THREE.MathUtils.degToRad(deg));this.anchorGizmo.setTranslationSnap(mm);}
  setGizmo(mode){this.setModelingPrecision();if(!['off','translate','rotate'].includes(mode))throw new Error('Invalid transform mode');if(mode==='off')this.cancelTransform();this.cancelTask();this.gizmoMode=mode;this.syncGizmo();this.updateHud();}
  beginTransform(){
    if(!this.getTransformState().canDrag)return;
    const bodyId=this.selected[0];this.transformGesture={bodyId,context:this.callbacks.onTransformStart?.(bodyId)};
    this.draggingGizmo=true;this.gizmoOrigin=this.gizmoProxy.position.clone();this.dragSkipSnap=this.skipSnapBodyId===bodyId;this.skipSnapBodyId=null;this.dragAxis=this.gizmo.axis;
  }
  cancelTransform(){
    if(!this.draggingGizmo||this.transformPending)return;
    this.draggingGizmo=false;this.gizmo.dragging=false;this.controls.enabled=true;
    const entry=this.objects.get(this.transformGesture?.bodyId||this.selected[0]);if(entry){entry.root.matrixAutoUpdate=true;entry.root.matrix.identity();entry.root.updateMatrix();}
    if(this.gizmoOrigin)this.gizmoProxy.position.copy(this.gizmoOrigin);this.gizmoProxy.quaternion.identity();
    this.transformGesture=null;
  }
  getTransformState(){
    const bodyIds=[...this.selected],entry=bodyIds.length===1?this.objects.get(bodyIds[0]):null;
    const blocker=this.gizmoMode==='off'?'MODE_OFF':this.busy||this.transformPending?'BUSY':!bodyIds.length?'NO_SELECTION':bodyIds.length!==1?'MULTIPLE_SELECTION':!entry?'STALE_SELECTION':!entry.root.visible?'HIDDEN_SELECTION':null;
    return {mode:this.gizmoMode,bodyIds,attached:!!this.gizmo.object,canDrag:!blocker,blocker};
  }
  syncGizmo(){
    if(this.draggingGizmo||this.transformPending)return;this.gizmo.detach();
    const entry=this.selected.length===1?this.objects.get(this.selected[0]):null;
    if(this.gizmoMode==='off'||!entry?.root.visible)return;
    this.gizmoProxy.position.copy(new THREE.Box3().setFromObject(entry.mesh).getCenter(new THREE.Vector3()));this.gizmoProxy.quaternion.identity();this.gizmoProxy.updateMatrixWorld();
    this.gizmo.setMode(this.gizmoMode);this.gizmo.attach(this.gizmoProxy);
  }
  previewTransform(){
    if(!this.draggingGizmo)return;const entry=this.objects.get(this.transformGesture?.bodyId||this.selected[0]);if(!entry)return;
    this.gizmoProxy.updateMatrix();entry.root.matrixAutoUpdate=false;
    entry.root.matrix.copy(this.gizmoProxy.matrix).multiply(new THREE.Matrix4().makeTranslation(...this.gizmoOrigin.clone().negate().toArray()));entry.root.matrixWorldNeedsUpdate=true;
  }
  async finishAnchorDrag(){
    const start=this.anchorStart,axis=this.anchorAxis;if(!start)return;this.anchorStart=null;this.anchorAxis=null;this.controls.enabled=false;this.anchorGizmo.enabled=false;
    try{const snap=await snapReleasedDrag(this,{pointWorld:this.anchorProxy.position.toArray(),axis,skip:this.anchorSkipSnap});if(snap){this.anchorProxy.position.add(new THREE.Vector3(...snap.delta));this.anchorVisual.position.copy(this.anchorProxy.position);}if(start.distanceTo(this.anchorProxy.position)>1e-8){await this.callbacks.onWorkFrameMove?.(this.anchorProxy.position.toArray());if(snap)this.skipAnchorSnap=true;}}catch(error){this.anchorProxy.position.copy(start);this.anchorVisual.position.copy(start);this.callbacks.onTransformError?.(error);}finally{this.controls.enabled=true;this.anchorGizmo.enabled=true;}
  }
  async finishTransform(){
    if(!this.draggingGizmo)return;this.draggingGizmo=false;this.suppressPickUntil=Date.now()+150;
    const gesture=this.transformGesture||{bodyId:this.selected[0]},sourceId=gesture.bodyId,center=this.gizmoOrigin.clone(),position=this.gizmoProxy.position.clone(),quaternion=this.gizmoProxy.quaternion.clone();this.transformPending=true;this.gizmo.enabled=false;let snapped=false;
    try{if(this.gizmoMode==='translate'){const delta=position.clone().sub(center);if(delta.length()>1e-8){const snap=await snapReleasedDrag(this,{bodyId:sourceId,translation:delta.toArray(),axis:this.dragAxis,skip:this.dragSkipSnap});if(snap){position.add(new THREE.Vector3(...snap.delta));this.gizmoProxy.position.copy(position);snapped=true;}}}}catch(error){this.callbacks.onTransformError?.(error);this.transformPending=false;this.transformGesture=null;this.gizmo.enabled=!this.busy;const failed=this.objects.get(sourceId);if(failed){failed.root.matrixAutoUpdate=true;failed.root.matrix.identity();failed.root.updateMatrix();}this.syncGizmo();return;}
    const euler=new THREE.Euler().setFromQuaternion(quaternion,'ZYX');
    const shift=position.sub(center.clone().applyQuaternion(quaternion));
    const params={x:shift.x,y:shift.y,z:shift.z,rx:THREE.MathUtils.radToDeg(euler.x),ry:THREE.MathUtils.radToDeg(euler.y),rz:THREE.MathUtils.radToDeg(euler.z)};
    const entry=this.objects.get(sourceId);
    const changed=Object.values(params).some(v=>Math.abs(v)>1e-7);
    // Leave the dragged geometry in place while the worker commits. A successful
    // commit replaces this entry; failure restores it without changing history.
    this.transformPending=true;this.gizmo.enabled=false;
    try{
      if(changed){const result=await this.callbacks.onTransform?.(params,gesture);if(snapped&&result?.bodyId)this.skipSnapBodyId=result.bodyId;}
    }catch(error){this.callbacks.onTransformError?.(error);}
    finally{
      if(entry&&this.objects.get(entry.body.id)===entry){entry.root.matrixAutoUpdate=true;entry.root.matrix.identity();entry.root.updateMatrix();}
      this.transformPending=false;this.transformGesture=null;this.gizmo.enabled=!this.busy;this.syncGizmo();
    }
  }
  applyClipping(){this.modelRoot.traverse(object=>{if(object.material){for(const material of [object.material].flat()){material.clippingPlanes=this.clipPlanes;material.needsUpdate=true;}}});}
  setSection({axis='Z',position=0,enabled=true}={}){
    if(!['X','Y','Z'].includes(axis)||!Number.isFinite(Number(position)))throw new Error('Invalid section plane');
    this.sectionState={axis,position:Number(position),enabled:!!enabled};
    const normal=new THREE.Vector3(axis==='X'?1:0,axis==='Y'?1:0,axis==='Z'?1:0);
    this.clipPlanes=enabled?[new THREE.Plane(normal,-Number(position))]:[];this.applyClipping();
  }
  isVisiblePoint(point){return this.clipPlanes.every(plane=>plane.distanceToPoint(point)>=-1e-7);}
  findSnapCandidates(event,{constraint=null,start=null}={}){
    if(!this.snapEnabled)return [];
    const rect=this.renderer.domElement.getBoundingClientRect(),radius=event.pointerType==='touch'?22:10,all=[];
    for(const entry of this.objects.values()){if(!entry.root.visible)continue;
      for(const item of entry.body.snapPoints||[]){const point=new THREE.Vector3(...item.point);if(!this.isVisiblePoint(point))continue;
        if(start&&constraint&&['X','Y','Z','XY','XZ','YZ'].includes(constraint)&&[0,1,2].some(i=>!constraint.includes('XYZ'[i])&&Math.abs(point.getComponent(i)-start.getComponent(i))>1e-5))continue;
        const projected=point.clone().project(this.camera);if(projected.z<-1||projected.z>1)continue;
        const distancePx=Math.hypot((projected.x+1)*rect.width/2+rect.left-event.clientX,(1-projected.y)*rect.height/2+rect.top-event.clientY);
        if(distancePx<=radius)all.push({point,type:item.type,bodyId:entry.body.id,edgeId:item.edgeId,distancePx,projected});
      }
    }
    all.sort((a,b)=>a.distancePx-b.distancePx||({endpoint:0,midpoint:1,center:2}[a.type]??3)-({endpoint:0,midpoint:1,center:2}[b.type]??3));
    const visible=[],meshes=[...this.objects.values()].filter(entry=>entry.root.visible).map(entry=>entry.mesh),ray=new THREE.Raycaster(),epsilon=Math.max(.02,this.span*1e-4);
    for(const candidate of all.slice(0,40)){
      ray.setFromCamera(new THREE.Vector2(candidate.projected.x,candidate.projected.y),this.camera);
      const hit=ray.intersectObjects(meshes,false).find(item=>this.isVisiblePoint(item.point));
      if(hit&&hit.distance+epsilon<ray.ray.origin.distanceTo(candidate.point))continue;
      if(!visible.some(other=>other.point.distanceTo(candidate.point)<1e-7&&other.type===candidate.type))visible.push(candidate);
      if(visible.length>=12)break;
    }
    return visible;
  }
  showSnapCandidate(){const item=this.snapCandidates?.[this.snapCandidateIndex||0];if(!item)return;const label={endpoint:say('CAD 顶点','CAD vertex'),midpoint:say('真实边中点','Arc-length midpoint'),center:say('解析圆心','Circle center')}[item.type]||item.type;this.hud.textContent=`${label} · ${item.point.toArray().map(v=>Number(v.toFixed(4))).join(', ')} mm · ${this.snapCandidates.length>1?say('Tab 切换候选','Tab cycles candidates'):''}`;}
  snapPoint(event,fallback){
    const candidates=this.findSnapCandidates(event),same=this.lastSnapPosition&&Math.hypot(event.clientX-this.lastSnapPosition[0],event.clientY-this.lastSnapPosition[1])<3;
    this.snapCandidates=candidates;if(!same)this.snapCandidateIndex=0;
    return candidates[this.snapCandidateIndex||0]?.point||fallback;
  }
  ray(e){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);this.raycaster.params.Line.threshold=this.span*.008;return this.raycaster;}
  sketchCoordinates(ray){const frame=this.sketch.frameSnapshot,q=new THREE.Quaternion(...frame.quaternion),origin=new THREE.Vector3(...frame.origin),normal=new THREE.Vector3(0,0,1).applyQuaternion(q),world=ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal,origin),new THREE.Vector3());if(!world)return null;const local=world.sub(origin).applyQuaternion(q.invert());return [local.x,local.y];}
  sketchWorldPoint(point){const frame=this.sketch.frameSnapshot;return new THREE.Vector3(point[0],point[1],0.04).applyQuaternion(new THREE.Quaternion(...frame.quaternion)).add(new THREE.Vector3(...frame.origin));}
  pick(e){
    const ray=this.ray(e);
    if(this.sketch){const p=this.sketchCoordinates(ray);if(p){
      const snap=Math.max(.01,Number(this.overlay.querySelector('[name=snap]').value)||1);let point=this.sketch.snap?[Math.round(p[0]/snap)*snap,Math.round(p[1]/snap)*snap]:p;
      const previous=this.sketch.points.at(-1),constraint=this.overlay.querySelector('[name=constraint]').value;
      if(previous&&(constraint!=='free'||e.shiftKey)){const dx=Math.abs(point[0]-previous[0]),dy=Math.abs(point[1]-previous[1]);if(constraint==='horizontal'||(constraint==='auto'||e.shiftKey)&&dx>=dy)point[1]=previous[1];else point[0]=previous[0];}
      if(!previous||Math.hypot(point[0]-previous[0],point[1]-previous[1])>1e-7){this.sketch.points.push(point);this.drawSketch();}
    }return;}
    const hits=ray.intersectObjects([...this.objects.values()].filter(v=>v.root.visible).map(v=>v.mesh),false).filter(hit=>this.isVisiblePoint(hit.point));
    if(this.measuring){const point=this.snapPoint(e,hits[0]?.point);if(point)this.addMeasure(point);return;}
    if(e.altKey){const type=this.selectionMode,raw=type==='edge'?ray.intersectObjects([...this.objects.values()].filter(v=>v.root.visible).flatMap(v=>v.edges.children),false).filter(hit=>this.isVisiblePoint(hit.point)):hits,seen=new Set(),candidates=[];for(const hit of raw){const id=hit.object.userData.bodyId,topologyId=type==='edge'?hit.object.userData.edgeId:type==='face'?hit.object.userData.body.faceGroups?.find(group=>hit.faceIndex*3>=group.start&&hit.faceIndex*3<group.start+group.count)?.faceId:undefined,key=`${id}:${type}:${topologyId}`;if(!id||seen.has(key)||type!=='body'&&topologyId===undefined)continue;seen.add(key);candidates.push({id,type,topologyId,point:hit.point.toArray(),distance:hit.distance});if(candidates.length===50)break;}this.callbacks.onPickCandidates?.(candidates);return;}
    let hit=hits[0],type=this.selectionMode,topologyId;
    if(type==='body'){
      const curves=[...this.objects.values()].filter(v=>v.root.visible&&!v.body.indices.length).flatMap(v=>v.edges.children);
      const lineHit=ray.intersectObjects(curves,false).find(h=>this.isVisiblePoint(h.point));
      if(lineHit&&(!hit||lineHit.distance<hit.distance))hit=lineHit;
    }
    if(type==='edge'){const edges=[...this.objects.values()].filter(v=>v.root.visible).flatMap(v=>v.edges.children.filter(o=>o.userData.type==='edge'));const eh=ray.intersectObjects(edges,false).filter(h=>this.isVisiblePoint(h.point)&&(!hit||h.distance<=hit.distance+this.span*.015));if(eh[0]){hit=eh[0];topologyId=hit.object.userData.edgeId;}else hit=null;}
    else if(type==='face'&&hit){const index=hit.faceIndex*3;topologyId=hit.object.userData.body.faceGroups?.find(g=>index>=g.start&&index<g.start+g.count)?.faceId;}
    this.callbacks.onPick?.(hit?{id:hit.object.userData.bodyId,type,topologyId,point:(type==='face'?hit.point:this.snapPoint(e,hit.point)).toArray()}:null,e.shiftKey||e.ctrlKey||e.metaKey);
  }
  onMove(e){this.lastPointerEvent=e;if(this.sketch){const p=this.sketchCoordinates(this.ray(e));if(p)this.hud.textContent=`当前轮廓平面 · X ${p[0].toFixed(1)}  Y ${p[1].toFixed(1)} mm · ${this.sketch.points.length} ${say('点','points')}`;return;}if(this.measuring||this.anchorDragEnabled){const moved=!this.lastSnapPosition||Math.hypot(e.clientX-this.lastSnapPosition[0],e.clientY-this.lastSnapPosition[1])>3;if(moved){this.snapCandidateIndex=0;this.lastSnapPosition=[e.clientX,e.clientY];}this.snapCandidates=this.findSnapCandidates(e,{constraint:this.anchorStart?this.anchorAxis:null,start:this.anchorStart});if(this.snapCandidates.length)this.showSnapCandidate();else this.updateHud();}}
  setDisplay(mode){if(!['solid','edges','wire','transparentEdges'].includes(mode))throw new Error('未知显示模式');applyViewportDisplay(this,mode);}
  toggleGrid(){this.grid.visible=!this.grid.visible;return this.grid.visible;}
  bounds(){const box=new THREE.Box3();for(const entry of this.objects.values())if(entry.root.visible){box.expandByPoint(new THREE.Vector3(...entry.body.bounds.min));box.expandByPoint(new THREE.Vector3(...entry.body.bounds.max));}if(box.isEmpty())box.set(new THREE.Vector3(-15,-15,-5),new THREE.Vector3(15,15,20));return box;}
  fit(){const box=this.bounds(),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());this.span=Math.max(size.x,size.y,size.z,5);const dir=this.camera.position.clone().sub(this.controls.target).normalize();const aspect=this.camera.aspect||1;const extent=this.span*Math.max(1,1/aspect)*1.55;const distance=extent/(2*Math.tan(THREE.MathUtils.degToRad(35/2)));if(this.camera.isOrthographicCamera){this.camera.top=extent/2;this.camera.bottom=-extent/2;this.camera.left=-extent*aspect/2;this.camera.right=extent*aspect/2;this.camera.zoom=1;}this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(dir,distance);this.camera.near=Math.max(.001,this.span/10000);this.camera.far=Math.max(10000,this.span*500);this.camera.updateProjectionMatrix();this.controls.update();this.updateHud();}
  setProjection(mode){const old=this.camera,aspect=old.aspect||1;if((mode==='orthographic')===!!old.isOrthographicCamera)return;const cam=mode==='orthographic'?new THREE.OrthographicCamera(-50,50,50,-50,.01,100000):new THREE.PerspectiveCamera(35,aspect,.01,100000);cam.aspect=aspect;cam.position.copy(old.position);cam.up.copy(old.up);cam.quaternion.copy(old.quaternion);this.camera=cam;this.gizmo.camera=cam;this.anchorGizmo.camera=cam;this.controls.object=cam;this.controls.update();this.fit();}
  view(direction='iso'){const vectors={iso:[1,-1,.85],front:[0,-1,0],back:[0,1,0],top:[0,0,1],bottom:[0,0,-1],left:[-1,0,0],right:[1,0,0]};const distance=this.camera.position.distanceTo(this.controls.target);this.camera.up.set(0,0,1);if(direction==='top'||direction==='bottom')this.camera.up.set(0,1,0);this.camera.position.copy(this.controls.target).addScaledVector(new THREE.Vector3(...(vectors[direction]||vectors.iso)).normalize(),distance);this.controls.update();this.fit();}
  updateLanguage(){this.updateHud();this.renderer.domElement.setAttribute('aria-label',say('三维建模视口','3D modeling viewport'));if(this.measuring)this.startMeasure();if(this.sketch)this.startSketch({...this.sketch});}
  updateHud(){if(!this.sketch)this.hud.textContent=`${[...this.objects.values()].filter(v=>v.root.visible).length} ${say('个可见实体','visible bodies')} · ${this.selectionMode==='edge'?say('选边','Edge'):this.selectionMode==='face'?say('选面','Face'):say('选实体','Body')}`;}
  startMeasure(){this.cancelTask();this.measuring=[];this.callbacks.onInteraction?.('measure');this.overlay.style.display='block';this.overlay.innerHTML=`<strong>${say('两点测距','Point distance')}</strong><p>${say('点击两个位置，靠近端点/中点/圆心时吸附。选边或面后点测量可测精确几何。','Click two points. Snap to endpoints, midpoints and circle centers. Select an edge or face for exact geometry measures.')}</p><div data-measure>${say('请选择第一个点','Select first point')}</div><button type="button" data-cancel>${say('结束测量','Finish')}</button>`;this.overlay.querySelector('[data-cancel]').onclick=()=>this.cancelTask();}
  addMeasure(point){if(this.measuring.length===2){this.clearGuides();this.measuring=[];}this.measuring.push(point.clone());const dot=new THREE.Mesh(new THREE.SphereGeometry(this.span*.009,12,8),new THREE.MeshBasicMaterial({color:0xe88423,depthTest:false}));dot.position.copy(point);this.guideRoot.add(dot);if(this.measuring.length===2){const [a,b]=this.measuring,delta=b.clone().sub(a),d=a.distanceTo(b);this.guideRoot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:0xe88423,depthTest:false})));this.overlay.querySelector('[data-measure]').textContent=`${d.toFixed(3)} mm · ΔX ${delta.x.toFixed(3)} ΔY ${delta.y.toFixed(3)} ΔZ ${delta.z.toFixed(3)}`;this.callbacks.onMeasure?.(d,delta.toArray());}else this.overlay.querySelector('[data-measure]').textContent='请选择第二个点';}
  startSketch(options={}){
    this.cancelTask();const frameSnapshot=options.frameSnapshot||{origin:[0,0,0],quaternion:[0,0,0,1]};this.sketch={points:options.points||[],snap:options.snap!==false,frameSnapshot,frameVersion:options.frameVersion,previousGridVisible:this.grid.visible};this.callbacks.onInteraction?.('sketch');const origin=new THREE.Vector3(...frameSnapshot.origin),q=new THREE.Quaternion(...frameSnapshot.quaternion),normal=new THREE.Vector3(0,0,1).applyQuaternion(q);this.camera.up.copy(new THREE.Vector3(0,1,0).applyQuaternion(q));this.controls.target.copy(origin);this.camera.position.copy(origin).addScaledVector(normal,Math.max(this.span*2,30));this.controls.update();this.controls.enableRotate=false;this.grid.visible=false;this.overlay.style.display='block';
    this.overlay.innerHTML=`<strong>${say('当前参考锚点平面 → 拉伸','Current anchor plane → extrusion')}</strong><p>${say('点击放置顶点，完成时闭合。Shift 临时水平/竖直。','Click vertices; finish closes the profile. Hold Shift for horizontal / vertical.')}</p><label>${say('吸附','Snap')} mm <input name="snap" type="number" min="0.1" value="1" step="0.5" style="width:60px"></label> <label>${say('高度','Height')} mm <input name="height" type="number" value="10" step="1" style="width:70px"></label><p><select name="constraint"><option value="free">${say('自由线段','Free line')}</option><option value="auto">${say('水平/竖直','Horizontal / vertical')}</option><option value="horizontal">${say('水平','Horizontal')}</option><option value="vertical">${say('竖直','Vertical')}</option></select></p><p data-count></p><button data-back>${say('撤回一点','Remove last')}</button> <button data-done>${say('完成并拉伸','Finish & extrude')}</button> <button data-cancel>${say('取消','Cancel')}</button>`;
    this.overlay.querySelector('[name=constraint]').value=options.snapHV?'auto':'free';if(Number.isFinite(options.height))this.overlay.querySelector('[name=height]').value=options.height;this.drawSketch();
    this.overlay.querySelector('[data-back]').onclick=()=>{this.sketch.points.pop();this.drawSketch();};this.overlay.querySelector('[data-cancel]').onclick=()=>this.cancelTask();
    this.overlay.querySelector('[data-done]').onclick=()=>{if(this.sketch.points.length<3){this.overlay.querySelector('[data-count]').textContent='至少需要三个不同顶点';return;}const height=Number(this.overlay.querySelector('[name=height]').value);if(!Number.isFinite(height)||height===0){this.overlay.querySelector('[data-count]').textContent='拉伸高度必须是非零数值';return;}const points=this.sketch.points.map(p=>[...p]),frameVersion=this.sketch.frameVersion;this.cancelTask();this.callbacks.onSketch?.({profile:'polygon',points,height,plane:'XY',useWorkFrame:true,expectedFrameVersion:frameVersion});};
  }
  drawSketch(){this.clearGuides();const points=this.sketch.points.map(p=>this.sketchWorldPoint(p));if(points.length>1)this.guideRoot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([...points,points[0]]),new THREE.LineBasicMaterial({color:0x008d7e,depthTest:false})));for(const point of points){const dot=new THREE.Mesh(new THREE.SphereGeometry(this.span*.007,10,6),new THREE.MeshBasicMaterial({color:0x008d7e}));dot.position.copy(point);this.guideRoot.add(dot);}this.overlay.querySelector('[data-count]').textContent=`${points.length} ${say('个顶点','vertices')}`;}
  cancelTask(){if(this.sketch)this.grid.visible=this.sketch.previousGridVisible;this.callbacks.onInteraction?.(null);this.sketch=null;this.measuring=null;this.controls.enableRotate=true;this.overlay.style.display='none';this.clearGuides();this.updateHud();}
  markModel(context){this.modelContext={...context};this.displayError=null;}
  renderFrame(){this.controls.update();this.renderer.render(this.scene,this.camera);const position=this.anchorProxy.position.clone().project(this.camera),width=this.host.clientWidth,height=this.host.clientHeight;this.anchorMarker.style.transform=`translate(${(position.x+1)*width/2}px,${(1-position.y)*height/2}px)`;this.anchorMarker.hidden=!this.anchorVisible||position.z>1;this.renderedContext=this.modelContext?{...this.modelContext}:null;this.frameSequence++;this.displayError=null;}
  async frame(){await new Promise(resolve=>requestAnimationFrame(resolve));this.renderFrame();return this.displayState();}
  displayState(){return {model:this.modelContext||null,rendered:this.renderedContext||null,frame:this.frameSequence,status:this.displayError?'failed':this.renderedContext?'rendered':'pending',error:this.displayError||null,camera:{projection:this.camera.isOrthographicCamera?'orthographic':'perspective',position:this.camera.position.toArray(),target:this.controls.target.toArray(),up:this.camera.up.toArray()}};}
  screenshot(){this.renderer.render(this.scene,this.camera);return this.renderer.domElement.toDataURL('image/png');}
  destroy(){this.resizeObserver.disconnect();this.renderer.setAnimationLoop(null);this.controls.dispose();this.gizmo.dispose();this.disposeObject(this.scene);this.metals.dispose();this.renderer.dispose();}
}


