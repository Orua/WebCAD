import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createProceduralAntiqueAtlas} from '../src/procedural-antique-atlas.js';
test('original antique grain is deterministic and keeps the two existing shader luminance bands',()=>{
 const atlas=createProceduralAntiqueAtlas(),again=createProceduralAntiqueAtlas();
 assert.deepEqual(atlas.data,again.data);
 assert.equal(atlas.data.length,atlas.width*atlas.height*4);
 const texture=new THREE.DataTexture(atlas.data,atlas.width,atlas.height,THREE.RGBAFormat);
 assert.equal(texture.image.data,atlas.data);
 for(let panel=0;panel<2;panel++){
  let total=0,min=255,max=0,count=0;
  for(let y=0;y<atlas.height;y++)for(let x=panel*atlas.width/2;x<(panel+1)*atlas.width/2;x++){
   const index=(y*atlas.width+x)*4,value=atlas.data[index];
   assert.equal(atlas.data[index+1],value);assert.equal(atlas.data[index+2],value);assert.equal(atlas.data[index+3],255);
   total+=value;min=Math.min(min,value);max=Math.max(max,value);count++;
  }
  assert(Math.abs(total/count/255-(panel===0?.34:.57))<.002);
  assert(max-min>35,'pitting must retain visible luminance detail');
 }
 texture.dispose();
});
