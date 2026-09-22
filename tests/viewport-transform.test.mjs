import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CADViewport } from '../src/viewport.js';

function viewport(){
 const v=Object.create(CADViewport.prototype);
 Object.assign(v,{objects:new Map(),modelRoot:new THREE.Group(),selected:['a'],hidden:[],partFinishes:{},finishKey:'design',clipPlanes:[],mode:'edges',metals:{apply(){}},gizmo:{enabled:true},gizmoProxy:new THREE.Object3D(),gizmoOrigin:new THREE.Vector3(),callbacks:{},syncs:0});
 v.setDisplay=()=>{};v.setMetalFinish=()=>{};v.applyClipping=()=>{};v.updateHud=()=>{};v.syncGizmo=()=>{v.syncs++;};
 return v;
}
const body=(id,version)=>({id,name:id,renderVersion:version,positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],edges:[],bounds:{min:[0,0,0],max:[1,1,0]}});
const v=viewport();v.setBodies([body('a',1),body('b',2)]);
const a=v.objects.get('a'),b=v.objects.get('b');let disposed=false;
b.mesh.geometry.addEventListener('dispose',()=>{disposed=true;});
v.setBodies([body('a',1),body('b',2)],['b']);
assert.equal(v.objects.get('a'),a);assert.equal(v.objects.get('b'),b);assert.equal(disposed,false);assert.equal(b.root.visible,false);
let complete;v.callbacks.onTransform=()=>new Promise(resolve=>{complete=resolve;});
v.draggingGizmo=true;v.gizmoProxy.position.x=5;v.previewTransform();
const pending=v.finishTransform();
assert.equal(a.root.matrix.elements[12],5,'no snapback while worker is pending');assert.equal(v.gizmo.enabled,false);
v.setBusy(false);assert.equal(v.gizmo.enabled,false,'pending commit keeps gizmo disabled');
v.setBodies([body('moved',3),body('b',2)]);v.selected=['moved'];complete();await pending;
assert.equal(v.objects.get('b'),b);assert.equal(v.transformPending,false);assert.equal(v.gizmo.enabled,true);
const moved=v.objects.get('moved');let reported=false;
v.callbacks.onTransform=async()=>{throw new Error('test failure');};v.callbacks.onTransformError=()=>{reported=true;};
v.draggingGizmo=true;v.gizmoOrigin.set(0,0,0);v.gizmoProxy.position.set(9,0,0);v.previewTransform();await v.finishTransform();
assert.equal(reported,true);assert.equal(moved.root.matrix.elements[12],0,'failed transform rolls back display');
v.disposeObject(v.modelRoot);
console.log('PASS viewport object reuse, pending transform, failure rollback');
