import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {rankEdgeHits,worldUnitsPerPixel} from '../src/viewport/edge-picking.js';
test('closest screen edge wins over a nearer but off-cursor body; zoom uses pixels',()=>{
 const camera=new THREE.PerspectiveCamera(35,1,.01,1000);camera.position.set(0,0,20);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const center=new THREE.Vector3(),scale=worldUnitsPerPixel(camera,center,1000);
 const needle={point:center,distance:20},frame={point:new THREE.Vector3(scale*5,0,1),distance:19};
 assert.equal(rankEdgeHits([frame,needle],camera,new THREE.Vector2(),1000,1000)[0],needle);
 assert.equal(rankEdgeHits([{point:new THREE.Vector3(scale*9,0,0),distance:20}],camera,new THREE.Vector2(),1000,1000).length,0);
 camera.position.z=10;camera.updateMatrixWorld();assert(Math.abs(worldUnitsPerPixel(camera,center,1000)-scale/2)<1e-12);
});
test('orthographic pixel tolerance follows zoom',()=>{
 const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,100);camera.zoom=2;camera.updateProjectionMatrix();
 assert.equal(worldUnitsPerPixel(camera,new THREE.Vector3(),1000),.01);
});
