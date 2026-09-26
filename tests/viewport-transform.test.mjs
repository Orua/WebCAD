import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CADViewport } from '../src/viewport.js';
import { DISPLAY_DEFAULTS } from '../src/display-preferences.js';

function viewport(){
 const v=Object.create(CADViewport.prototype);
 Object.assign(v,{objects:new Map(),modelRoot:new THREE.Group(),selected:['a'],hidden:[],partFinishes:{},partColors:{},displayPreferences:{...DISPLAY_DEFAULTS},finishKey:'design',clipPlanes:[],mode:'edges',metals:{apply(){}},gizmo:{enabled:true},gizmoProxy:new THREE.Object3D(),gizmoOrigin:new THREE.Vector3(),callbacks:{},syncs:0});
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
// Rotation around the displayed center must preserve that center in the
// exact transform, instead of rotating around the world origin.
let rotation;
v.callbacks.onTransform=async params=>{rotation=params;};
v.gizmoMode='rotate';v.draggingGizmo=true;v.gizmoOrigin.set(10,20,0);
v.gizmoProxy.position.copy(v.gizmoOrigin);v.gizmoProxy.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2);
await v.finishTransform();
assert.ok(Math.abs(rotation.rz-90)<1e-7);assert.ok(Math.abs(rotation.x-30)<1e-7);assert.ok(Math.abs(rotation.y-10)<1e-7);
v.gizmo.object=v.gizmoProxy;v.gizmoMode='translate';
assert.equal(v.getTransformState().canDrag,true);
v.selected=[];assert.equal(v.getTransformState().blocker,'NO_SELECTION');
v.selected=['moved','b'];assert.equal(v.getTransformState().blocker,'MULTIPLE_SELECTION');
v.selected=['moved'];moved.root.visible=false;assert.equal(v.getTransformState().blocker,'HIDDEN_SELECTION');
moved.root.visible=true;v.transformPending=true;assert.equal(v.getTransformState().blocker,'BUSY');
v.transformPending=false;v.gizmoMode='off';assert.equal(v.getTransformState().blocker,'MODE_OFF');
v.controls={enabled:false};v.draggingGizmo=true;v.gizmo.dragging=true;
v.gizmoOrigin.set(10,20,0);v.gizmoProxy.position.set(18,20,0);
v.gizmoProxy.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/4);
v.previewTransform();v.cancelTransform();
assert.equal(v.draggingGizmo,false);assert.equal(v.gizmo.dragging,false);assert.equal(v.controls.enabled,true);
assert.deepEqual(v.gizmoProxy.position.toArray(),[10,20,0]);assert.deepEqual(v.gizmoProxy.quaternion.toArray(),[0,0,0,1]);
assert.equal(moved.root.matrix.elements[12],0,'cancelling a live gesture restores the original geometry without committing');
// Selection is view state and can change while the asynchronous snap query is
// pending. The completed gesture must keep its original source and context.
v.selected=['moved'];v.gizmoMode='translate';v.snapEnabled=true;
v.callbacks.onTransformStart=()=>({revision:17,documentInstanceId:'test-instance'});
let releaseSnap,submittedGesture,submittedParams;
v.callbacks.onDragSnap=()=>new Promise(resolve=>{releaseSnap=resolve;});
v.callbacks.onTransform=async(params,gesture)=>{submittedParams=params;submittedGesture=gesture;return {bodyId:'moved'};};
v.gizmoProxy.position.set(0,0,0);v.beginTransform();v.gizmoProxy.position.x=7;v.previewTransform();
const changingSelection=v.finishTransform();assert.equal(v.transformPending,true);
v.selected=['b'];releaseSnap({delta:[1,0,0]});await changingSelection;
assert.equal(submittedGesture.bodyId,'moved');assert.equal(submittedGesture.context.revision,17);
assert.equal(submittedParams.x,8);assert.equal(moved.root.matrix.elements[12],0,'original source preview is restored after selection changes');
assert.equal(v.skipSnapBodyId,'moved','the next free adjustment belongs to the actual result, not the later selection');
assert.equal(v.objects.get('b').root.matrix.elements[12],0,'later selection receives no transform preview');
v.disposeObject(v.modelRoot);
console.log('PASS viewport object reuse, pending transform, failure rollback');
