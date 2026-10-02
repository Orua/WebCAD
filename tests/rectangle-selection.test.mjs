import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {rectangleCandidates,installRectangleSelection} from '../src/viewport/rectangle-selection.js';

const entry=(min,max,visible=true)=>({root:{visible},body:{bounds:{min,max}}});
test('crossing selection clips box edges at near/far depth planes in both projections',()=>{
 for(const camera of [new THREE.OrthographicCamera(-2,2,2,-2,1,10),new THREE.PerspectiveCamera(90,1,1,10)]){
  camera.updateProjectionMatrix();
  const viewport={camera,objects:new Map([
   ['through',entry([-.2,-.2,-20],[.2,.2,0])],['inside',entry([-.1,-.1,-4],[.1,.1,-3])],
   ['behind',entry([-.2,-.2,1],[.2,.2,3])],['beforeNear',entry([-.2,-.2,-.5],[.2,.2,-.1])],
   ['beyondFar',entry([-.2,-.2,-20],[.2,.2,-12])],['hidden',entry([-.2,-.2,-20],[.2,.2,0],false)]])};
  assert.deepEqual(rectangleCandidates(viewport,{rect:[.4,.4,.6,.6],mode:'crossing'}),['through','inside']);
  assert.deepEqual(rectangleCandidates(viewport,{rect:[0,0,1,1],mode:'window'}),['inside'],'window still requires the entire object depth and footprint');
 }
});
test('perspective crossing uses near-plane intersections rather than only distant surviving corners',()=>{
 const camera=new THREE.PerspectiveCamera(90,1,1,10);camera.updateProjectionMatrix();
 const viewport={camera,objects:new Map([['near',entry([.5,-.2,-2],[1,.2,0])]])};
 assert.deepEqual(rectangleCandidates(viewport,{rect:[.85,.3,.95,.7],mode:'crossing'}),['near']);
 assert.deepEqual(rectangleCandidates(viewport,{rect:[.05,.3,.15,.7],mode:'crossing'}),[]);
 camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 assert.deepEqual(rectangleCandidates(viewport,{rect:[.85,.3,.95,.7],mode:'crossing'}),[],'reads the current camera, not cached projected bounds');
});

class Events{
 listeners=new Map();captured=new Set();
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 fire(type,event={}){for(const fn of this.listeners.get(type)||[])fn(event);}
 getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
 setPointerCapture(id){this.captured.add(id);}
 hasPointerCapture(id){return this.captured.has(id);}
 releasePointerCapture(id){this.captured.delete(id);this.fire('lostpointercapture',{pointerId:id});}
 count(){return [...this.listeners.values()].reduce((n,set)=>n+set.size,0);}
}
test('rectangle gesture cancellation preserves other controls, tracks its pointer and releases listeners',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,keys=new Events(),canvas=new Events(),calls=[],boxes=[];
 globalThis.window=keys;globalThis.document={createElement:()=>({style:{},remove(){this.removed=true;}})};
 const viewport={renderer:{domElement:canvas},controls:{enabled:false},selectionMode:'body',gizmoMode:'off',host:{append:box=>boxes.push(box)},callbacks:{onRectangleSelect:input=>calls.push(input)}};
 const pointer=(pointerId,clientX=10,clientY=10,extra={})=>({pointerId,clientX,clientY,button:0,...extra});
 const dispose=installRectangleSelection(viewport);
 try{
  keys.fire('keydown',{key:'Escape'});assert.equal(viewport.controls.enabled,false,'unrelated Escape must not enable another tool controls');
  canvas.fire('pointerdown',pointer(1));keys.fire('keydown',{key:'Escape'});assert.equal(viewport.controls.enabled,false);assert.equal(canvas.captured.size,0);
  viewport.controls.enabled=true;canvas.fire('pointerdown',pointer(2));canvas.releasePointerCapture(2);assert.equal(viewport.controls.enabled,true);assert.equal(calls.length,0);
  canvas.fire('pointerdown',pointer(3,80,20,{ctrlKey:true}));canvas.fire('pointermove',pointer(4,10,80));assert.equal(boxes.length,0);
  canvas.fire('pointercancel',pointer(4));canvas.fire('pointerup',pointer(4,10,80));assert.equal(viewport.controls.enabled,false);
  canvas.fire('pointermove',pointer(3,20,80));assert.equal(boxes.length,1);canvas.fire('pointerup',pointer(3,20,80));
  assert.deepEqual(calls,[{rect:[.2,.2,.8,.8],mode:'crossing',additive:true}]);assert.equal(viewport.controls.enabled,true);assert.equal(canvas.captured.size,0);assert.equal(boxes[0].removed,true);
  canvas.fire('pointerdown',pointer(5));canvas.fire('pointermove',pointer(5,90,90));keys.fire('keydown',{key:'Escape'});assert.equal(calls.length,1);assert.equal(boxes[1].removed,true);
  canvas.fire('pointerdown',pointer(6));dispose();assert.equal(viewport.controls.enabled,true);assert.equal(canvas.count(),0);assert.equal(keys.count(),0);assert.equal(canvas.captured.size,0);
 }finally{dispose();globalThis.window=oldWindow;globalThis.document=oldDocument;}
});
