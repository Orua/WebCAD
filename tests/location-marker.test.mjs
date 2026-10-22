import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLocationMarker} from '../src/location-marker.js';
import {CADViewport} from '../src/viewport.js';

test('location text is plain, preserves world coordinates and binds the current revision',()=>{
  const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:7};
  const marker=createLocationMarker({bodyId:'body-a',faceId:3,point:[1.234567,-2,4]},context,1);
  assert.deepEqual(marker.point,[1.234567,-2,4]);assert.deepEqual(marker.context,context);
  assert.equal(marker.source,'display-mesh');assert.equal(marker.precision,'approximate');
  assert.equal(marker.text,'【位置P1】');assert.match(marker.tooltip,/X=1.2346/);assert.doesNotMatch(marker.text,/\p{Extended_Pictographic}/u);
  context.revision=8;assert.equal(marker.context.revision,7);
  assert.throws(()=>createLocationMarker({bodyId:'a',point:[NaN,0,0]},context,2),{code:'LOCATION_NO_HIT'});
});

test('location picker hits the visible front surface and rejects background, clipped and hidden geometry',()=>{
  const viewport=Object.create(CADViewport.prototype),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
  mesh.userData={bodyId:'box',body:{faceGroups:[{faceId:9,start:0,count:36}]}};mesh.updateMatrixWorld();
  const camera=new THREE.PerspectiveCamera(45,1,.1,100);camera.position.z=5;camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const ray=new THREE.Raycaster();
  Object.assign(viewport,{renderer:{domElement:{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})}},objects:new Map([['box',{root:mesh,mesh}]]),isVisiblePoint:()=>true,ray:e=>{ray.setFromCamera(new THREE.Vector2(e.clientX/50-1,1-e.clientY/50),camera);return ray;}});
  const hit=viewport.pickLocation([.5,.5]);assert.equal(hit.bodyId,'box');assert.equal(hit.faceId,9);assert.ok(Math.abs(hit.point[2]-.5)<1e-10);
  assert.throws(()=>viewport.pickLocation([0,0]),{code:'LOCATION_NO_HIT'});
  viewport.isVisiblePoint=()=>false;assert.throws(()=>viewport.pickLocation([.5,.5]),{code:'LOCATION_NO_HIT'});
  viewport.isVisiblePoint=()=>true;mesh.visible=false;assert.throws(()=>viewport.pickLocation([.5,.5]),{code:'LOCATION_NO_HIT'});
});
