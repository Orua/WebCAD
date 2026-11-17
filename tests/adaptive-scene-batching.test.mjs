import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CADViewport} from '../src/viewport.js';
import {ExactDisplayDetail} from '../src/viewport/exact-detail.js';
import {captureEvidence} from '../src/viewport/evidence-capture.js';

function fixture(callbacks={}){
 const body={id:'part',renderVersion:'1',positions:new Float32Array([0,0,0,1,0,0,0,1,0,2,0,0,3,0,0,2,1,0]),indices:new Uint32Array([0,1,2,3,4,5]),
  faceGroups:[{start:0,count:3,faceId:10},{start:3,count:3,faceId:11}],edges:[{edgeId:20,positions:[0,0,0,1,0,0]},{edgeId:21,positions:[2,0,0,3,0,0]}],adaptiveDisplay:{initialTolerance:.12,requestedQuality:'standard'},bounds:{min:[0,0,0],max:[3,1,0]}};
 const v=Object.create(CADViewport.prototype);Object.assign(v,{objects:new Map(),scene:new THREE.Scene(),modelRoot:new THREE.Group(),camera:new THREE.PerspectiveCamera(35,1,.1,100),host:{clientHeight:500},callbacks,mode:'edges',selectionMode:'body',selected:[],hidden:[],temporaryDisplay:'normal',clipPlanes:[],displayPreferences:{defaultColor:'#aac4d9',themeColor:'#155e75'},partColors:{},partFinishes:{},metals:{apply(){},setSelected(){}},clearRoundGuide(){},clearProgressiveMesh(){},clearScopeOverlay(){},setDisplay(){},setMetalFinish(){},updateHud(){},syncGizmo(){}});
 v.camera.position.set(1.5,0,10);v.camera.lookAt(1.5,0,0);v.camera.updateMatrixWorld();v.scene.add(v.modelRoot);v.exactDisplayDetail=new ExactDisplayDetail(v);v.setBodies([body]);v.scene.updateMatrixWorld(true);return {v,body,entry:v.objects.get(body.id)};
}
test('adaptive surfaces and edges batch without changing original indices or transformed picking',()=>{
 const {v,body,entry}=fixture(),original=[...body.indices];v.exactDisplayDetail.update(false);entry.edgeBatch.sync();
 assert.equal(entry.exactDisplay.surfaceBatch,true);assert.equal(entry.exactDisplay.group.children.length,1);assert.equal(entry.edges.parent,null);assert.equal(entry.edgeBatch.root.children.length,1);
 assert.equal(entry.edges.children[0].material,entry.edges.children[1].material);assert.deepEqual([...entry.exactDisplay.coarse.geometry.index.array],original);
 const ray=new THREE.Raycaster(new THREE.Vector3(.2,.2,1),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObject(entry.mesh,false)[0].faceIndex,0);
 entry.root.position.x=4;const targets=v.edgePickTargets(entry);ray.set(new THREE.Vector3(4.5,0,1),new THREE.Vector3(0,0,-1));ray.params.Line.threshold=.01;assert.equal(ray.intersectObjects(targets,false)[0].object.userData.edgeId,20);
 v.setSelection(['part'],{type:'edge',bodyId:'part',ids:[20]});entry.edgeBatch.sync();assert.equal(entry.edgeBatch.root.children.length,2);assert.equal(entry.edges.children[0].material.color.getHex(),0xf08e2b);assert.notEqual(entry.edges.children[0].material,entry.edges.children[1].material);
 v.clipPlanes=[new THREE.Plane(new THREE.Vector3(1,0,0),0)];v.applyClipping();assert.equal(entry.edgeMaterial.clippingPlanes,v.clipPlanes);assert.equal(entry.selectedEdgeMaterial.clippingPlanes,v.clipPlanes);
 assert.deepEqual([...body.indices],original);v.setBodies([]);
});
test('refinement replaces only its original face and moving restores the full original draw',async()=>{
 let calls=0;const {v,body,entry}=fixture({onRefineDisplay:async input=>{calls++;return {...input,patches:[{faceId:10,positions:new Float32Array([0,0,0,.5,0,0,1,0,0,0,1,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),indices:new Uint32Array([0,1,3,1,2,3])}]};}});
 const indices=body.indices;v.exactDisplayDetail.update(false);await new Promise(setImmediate);v.exactDisplayDetail.update(false);
 const coarse=entry.exactDisplay.coarse.geometry,buffer=coarse.index.array;assert.equal(coarse.drawRange.count,3);assert.deepEqual([...buffer.subarray(0,3)],[3,4,5]);assert.equal(entry.exactDisplay.group.children.length,2);assert.equal(entry.exactDisplay.patches[0].fine.index.count,6);
 v.exactDisplayDetail.update(true);assert.equal(coarse.index.array,buffer);assert.equal(coarse.drawRange.count,6);assert.deepEqual([...buffer],[...indices]);assert.equal(entry.exactDisplay.patches[0].piece.visible,false);assert.equal(body.indices,indices);
 v.exactDisplayDetail.update(false);assert.equal(coarse.drawRange.count,3);assert.equal(calls,1);
 v.exactDisplayDetail.update(true);let target='original',renders=0;const occlusion={value:1};v.metals.getOcclusionUniforms=()=>({webcadOcclusionEnabled:occlusion});
 v.renderer={autoClear:false,outputColorSpace:THREE.SRGBColorSpace,getContext:()=>({isContextLost:()=>false}),getRenderTarget:()=>target,setRenderTarget:x=>target=x,getViewport:x=>x.set(0,0,100,100),setViewport(){},getScissor:x=>x.set(0,0,100,100),setScissor(){},getScissorTest:()=>true,setScissorTest(){},clear(){},render(scene){let triangles=0;scene.traverseVisible(o=>{if(o.isMesh)triangles+=Math.min(o.geometry.drawRange.count,o.geometry.index.count)/3;});assert.equal(triangles,3,'capture must not draw the refined face twice');renders++;},readRenderTargetPixels(){throw Error('controlled readback failure');}};
 assert.throws(()=>captureEvidence(v,{maxWidth:64,viewId:'front',format:'png'}),/controlled readback failure/);assert.equal(renders,1);assert.equal(target,'original');assert.equal(coarse.drawRange.count,6);assert.equal(entry.exactDisplay.patches[0].piece.visible,false);assert.equal(occlusion.value,1);v.setBodies([]);
});
test('stationary views reuse visibility and busy geometry does not schedule display refinement',()=>{
 const {v,entry}=fixture();const detail=v.exactDisplayDetail;detail.update(false);
 const patch=entry.exactDisplay.patches[0],sphere=patch.base.boundingSphere;let reads=0;
 Object.defineProperty(patch.base,'boundingSphere',{configurable:true,get(){reads++;return sphere;}});
 for(let i=0;i<20;i++)detail.update(false);assert.equal(reads,0,'idle frames must not rescan every face');
 v.camera.position.x+=1;v.camera.updateMatrixWorld();detail.update(false);assert.ok(reads>0);
 let requests=0;v.callbacks.onRefineDisplay=()=>{requests++;};v.busy=true;detail.update(false);assert.equal(requests,0);v.setBodies([]);
});
