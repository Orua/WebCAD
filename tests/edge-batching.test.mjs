import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTechnicalEdgeBatch} from '../src/viewport/edge-batching.js';
import {ExactDisplayDetail} from '../src/viewport/exact-detail.js';
import {CADViewport} from '../src/viewport.js';
import {captureEvidence,evidenceDisplaySignature} from '../src/viewport/evidence-capture.js';
function edges(){const group=new THREE.Group();for(let id=0;id<12;id++){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,id,0,1,id,0],3));const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x465b6e,transparent:true,opacity:.72}));line.userData={type:'edge',edgeId:id,bodyId:'body'};group.add(line);}return group;}
test('compatible technical edges use one render object while source coordinates and IDs remain intact',()=>{
  const source=edges(),original=source.children.map(line=>line.geometry.getAttribute('position').array),batch=createTechnicalEdgeBatch(source,{bodyId:'body'});
  assert.equal(batch.root.children.length,1);assert.equal(source.children.length,12);assert(source.children.every(line=>!line.visible));
  assert.deepEqual([...batch.root.children[0].geometry.attributes.position.array],original.flatMap(array=>[...array]));
  for(let i=0;i<12;i++){assert.equal(source.children[i].userData.edgeId,i);assert.equal(source.children[i].geometry.attributes.position.array,original[i]);}
});
test('selection depth/order/opacity and clipping are retained as distinct render groups',()=>{
  const source=edges(),plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);source.children.forEach(line=>{line.material.clippingPlanes=[plane];});
  const batch=createTechnicalEdgeBatch(source),selected=source.children[0];selected.material.color.set(0xff8b22);selected.material.opacity=1;selected.material.depthTest=false;selected.renderOrder=1000;batch.invalidate();batch.sync();
  assert.equal(batch.root.children.length,2);const overlay=batch.root.children.find(line=>line.renderOrder===1000);
  assert.equal(overlay.material.depthTest,false);assert.equal(overlay.material.opacity,1);assert.equal(overlay.material.color.getHex(),0xff8b22);assert.deepEqual(overlay.material.clippingPlanes[0].normal.toArray(),plane.normal.toArray());
  source.visible=false;batch.sync();assert.equal(batch.root.visible,false);source.visible=true;batch.sync();assert.equal(batch.root.visible,true);
});
test('hidden render proxies remain pickable with the original edge ID under body transforms',()=>{
  const source=edges(),root=new THREE.Group();root.add(source);root.position.set(2,0,0);const batch=createTechnicalEdgeBatch(source);root.add(batch.root);root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(2.5,0,1),new THREE.Vector3(0,0,-1));ray.params.Line.threshold=.01;
  const hits=ray.intersectObjects(source.children,false);assert(hits.length);assert.equal(hits[0].object.userData.edgeId,0);assert.equal(source.children.includes(batch.root.children[0]),false);
});
test('adaptive or unsupported line representations retain their original render path',()=>{
  const source=edges();assert.equal(createTechnicalEdgeBatch(source,{eligible:false}),null);assert(source.children.every(line=>line.visible));
  source.children[0].position.x=1;assert.equal(createTechnicalEdgeBatch(source),null);assert(source.children.every(line=>line.visible));
});

function planarDisplay({faceCount=500,change=()=>{}}={}){
  const positions=[],indices=[],faceGroups=[];
  for(let i=0;i<faceCount;i++){
    const x=i%25*.04-.5,y=Math.floor(i/25)*.04-.4,start=indices.length;
    positions.push(x,y,0,x+.03,y,0,x,y+.03,0);indices.push(start,start+1,start+2);faceGroups.push({start,count:3,faceId:100+i,exactPolygon:true});
  }
  const body={id:'planar',indices:new Uint32Array(indices),faceGroups,adaptiveDisplay:{requestedQuality:'fine',heavyFaceIds:[]}};
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(new THREE.BufferAttribute(body.indices,1));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({side:THREE.DoubleSide}));mesh.userData={type:'body',bodyId:body.id,body};
  const root=new THREE.Group(),edgeObjects=edges();root.add(mesh,edgeObjects);const entry={body,mesh,root,edges:edgeObjects};change(entry);
  const v=Object.create(CADViewport.prototype);Object.assign(v,{scene:new THREE.Scene(),modelRoot:new THREE.Group(),camera:new THREE.PerspectiveCamera(35,1,.1,100),
    objects:new Map([[body.id,entry]]),host:{clientHeight:500},callbacks:{},mode:'edges',selectionMode:'body',selected:[],hidden:[],temporaryDisplay:'normal',
    clipPlanes:[],displayPreferences:{themeColor:'#155e75'},hud:{textContent:''},metals:{setSelected:(material,active)=>{material.userData.selected=active;}},syncGizmo(){}});
  v.scene.add(v.modelRoot);v.modelRoot.add(root);v.camera.position.set(0,0,3);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.scene.updateMatrixWorld(true);
  const detail=new ExactDisplayDetail(v);detail.attach(entry);return {v,entry,detail,geometry};
}

test('500 exact polygon faces retain one original indexed surface and unchanged face IDs',()=>{
  const {v,entry,detail,geometry}=planarDisplay(),indices=entry.body.indices,faceGroups=entry.body.faceGroups;
  const state=detail.update(true),surfaces=[];v.modelRoot.traverseVisible(o=>{if(o.isMesh)surfaces.push(o);});
  assert.deepEqual(surfaces,[entry.mesh]);assert.equal(entry.exactDisplay.patches.length,0);assert.equal(state.planarBatchedBodies,1);
  assert.equal(state.fullTriangles,500);assert.equal(state.patchCount,500);assert.equal(state.visibleFaces,500);assert.equal(entry.edges.visible,false);
  assert.equal(entry.mesh.geometry,geometry);assert.equal(entry.body.indices,indices);assert.equal(entry.body.faceGroups,faceGroups);
  let disposed=false;geometry.addEventListener('dispose',()=>disposed=true);detail.release(entry);assert.equal(disposed,false,'display detail must not dispose the shared original mesh');
});

test('planar batch keeps original indexed raycast, face overlay and selected edge IDs under transforms',()=>{
  const {v,entry,detail}=planarDisplay({faceCount:2});entry.root.position.x=2;v.scene.updateMatrixWorld(true);detail.update(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(1.505,-.395,1),new THREE.Vector3(0,0,-1)),hit=ray.intersectObject(entry.mesh,false)[0];
  assert.ok(hit);assert.equal(hit.faceIndex,0);
  const faceId=entry.body.faceGroups.find(g=>hit.faceIndex*3>=g.start&&hit.faceIndex*3<g.start+g.count).faceId;assert.equal(faceId,100);
  v.setSelection([entry.body.id],{type:'face',bodyId:entry.body.id,ids:[faceId]});assert.deepEqual([...v.faceOverlay.geometry.index.array],[0,1,2]);
  assert.equal(entry.mesh.material.userData.selected,true);
  v.setSelection([entry.body.id],{type:'edge',bodyId:entry.body.id,ids:[0]});detail.update(false);
  assert.equal(entry.edges.children[0].userData.edgeId,0);assert.equal(entry.edges.children[0].material.color.getHex(),0xf08e2b);assert.equal(entry.edges.children[0].renderOrder,1000);
});

test('planar batch shares live clipping/wireframe/opacity and keeps semantic hidden roots',()=>{
  const {v,entry,detail}=planarDisplay();const material=entry.mesh.material;
  v.clipPlanes=[new THREE.Plane(new THREE.Vector3(1,0,0),0)];v.applyClipping();assert.equal(material.clippingPlanes,v.clipPlanes);
  v.mode='wire';detail.update(true);assert.equal(material.wireframe,true);assert.equal(entry.mesh.visible,true);
  v.mode='transparentEdges';v.applyTemporaryDisplay();detail.update(true);assert.equal(material.wireframe,false);assert.equal(material.opacity,.35);assert.equal(material.transparent,true);
  v.mode='edges';v.setTemporaryDisplay('transparentOthers');assert.equal(material.opacity,.2);assert.equal(entry.mesh.material,material);
  v.setHidden([entry.body.id]);const state=detail.update(false);assert.equal(entry.root.visible,false);assert.equal(state.visibleFaces,0);
  const rendered=[];v.modelRoot.traverseVisible(o=>{if(o.isMesh)rendered.push(o);});assert.equal(rendered.length,0);
});

test('mixed/unknown/heavy/limited/incomplete or patched surfaces keep original per-face fallback',()=>{
  for(const change of [entry=>entry.body.faceGroups[0].exactPolygon=false,entry=>delete entry.body.faceGroups[0].exactPolygon,
    entry=>entry.body.adaptiveDisplay.heavy=true,entry=>entry.body.adaptiveDisplay.heavyFaceIds=[100],entry=>entry.body.adaptiveDisplay.splinePoles=1,
    entry=>entry.body.faceGroups[1].start=0,entry=>entry.body.faceGroups.pop(),entry=>entry.body.displayPatches=[],
    entry=>entry.body.displayReport={untriangulatedFaceIds:[100]},entry=>entry.mesh.geometry.setDrawRange(0,3)]){
    const {entry,detail}=planarDisplay({faceCount:2,change});assert.notEqual(entry.exactDisplay.planarBatch,true);assert.ok(entry.exactDisplay.patches.length);detail.update(true);assert.equal(entry.mesh.visible,false);
  }
});

test('isolated evidence sees planar batch exactly once even after camera culling and restores failure state',()=>{
  const {v,entry,detail}=planarDisplay();detail.update(true);
  const signature=evidenceDisplaySignature({...v,renderer:{toneMappingExposure:1}});
  // Keep the interaction phase fixed so the existing idle edge-culling policy
  // does not change the evidence signature independently of the surface batch.
  v.camera.position.set(100,0,3);v.camera.lookAt(100,0,0);v.camera.updateMatrixWorld();assert.equal(detail.update(true).visibleFaces,0);assert.equal(entry.mesh.visible,true);
  assert.equal(evidenceDisplaySignature({...v,renderer:{toneMappingExposure:1}}),signature);
  let target='user-target',renders=0;const occlusion={value:1};
  v.metals.getOcclusionUniforms=()=>({webcadOcclusionEnabled:occlusion});
  v.renderer={autoClear:false,outputColorSpace:THREE.SRGBColorSpace,getContext:()=>({isContextLost:()=>false}),getRenderTarget:()=>target,setRenderTarget:value=>target=value,
    getViewport:value=>value.set(0,0,100,100),setViewport(){},getScissor:value=>value.set(0,0,100,100),setScissor(){},getScissorTest:()=>true,setScissorTest(){},clear(){},
    render(scene,camera){const meshes=[];scene.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});assert.deepEqual(meshes,[entry.mesh]);assert.notEqual(camera,v.camera);renders++;},
    readRenderTargetPixels(){throw Error('controlled readback failure');}};
  assert.throws(()=>captureEvidence(v,{maxWidth:64,viewId:'front',format:'png'}),/controlled readback failure/);
  assert.equal(renders,1);assert.equal(target,'user-target');assert.equal(v.renderer.autoClear,false);assert.equal(entry.mesh.visible,true);assert.equal(occlusion.value,1);
});
