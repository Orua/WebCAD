import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mergeSurfaceOverride,normalizeSurfaceTexture,applyDesignSurface} from '../src/surface-overrides.js';
import {prepareSurfaceTexture,validateSurfaceAssets} from '../src/surface-textures.js';
import {projectedTextureUV} from '../src/surface-rendering.js';
import {finalStateProject} from '../src/project-final-state.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
import {recordTimeline,restoreTimeline} from '../src/document-timeline.js';
import {encodeMesh} from '../src/mesh/mesh-codec.js';
const dataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMuQAAAAASUVORK5CYII=';
const prepared=()=>prepareSurfaceTexture({}, {dataUrl,mapping:'xy',sizeMm:[10,20]});
test('appearance validates transparency and preserves independent overrides',()=>{
 assert.deepEqual(mergeSurfaceOverride({roughness:.9,opacity:.4},{opacity:null}),{roughness:.9});
 for(const patch of [{opacity:2},{transmission:-1},{ior:.5},{thicknessMm:-1},{texture:{dataUrl:'https://example.test/a.png'}}])assert.throws(()=>mergeSurfaceOverride({},patch));
 const m=new THREE.MeshPhysicalMaterial();applyDesignSurface(m,'design',{opacity:.3,transmission:.8,ior:1.6,thicknessMm:2});assert.equal(m.opacity,.3);assert.equal(m.transmission,.8);assert.equal(m.metalness,0);applyDesignSurface(m,'design',{});assert.equal(m.opacity,1);assert.equal(m.transmission,0);m.dispose();
});
test('texture projection uses explicit millimetres and preview origin',()=>{
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,5,10,0],3));
 projectedTextureUV(g,normalizeSurfaceTexture({dataUrl,mapping:'xy',sizeMm:[10,20]}),{min:[100,200,0]},[100,200,0]);
 assert.deepEqual([...g.getAttribute('uv').array],[0,0,.5,.5]);g.dispose();
});
test('final-state save retains exactly one texture image and no data URL in metadata',async()=>{
 const p=prepared(),geometry=encodeMesh({positions:new Float64Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2])});
 const doc={version:4,documentId:'texture-doc',name:'Texture',features:[{id:'b',op:'box',params:{width:1,depth:1,height:1},refs:[]}],imports:{[p.importKey]:p.importEntry},binaryAssets:{[p.texture.assetHash]:p.bytes},surface:{b:{opacity:.7,texture:p.texture}},hidden:[],appearance:{},colors:{}};
 const saved=finalStateProject(doc,[{id:'b',format:'mesh',data:geometry}]);validateSurfaceAssets(saved);assert(!JSON.stringify({...saved,binaryAssets:undefined}).includes('data:image'));
 const decoded=await decodeProject(encodeProjectV4(saved));validateSurfaceAssets(decoded);assert.deepEqual(decoded.surface,doc.surface);assert.deepEqual(decoded.binaryAssets[p.texture.assetHash],p.bytes);assert.equal(Object.values(decoded.imports).filter(i=>i.format==='reference-image').length,1);
});
test('history retains a texture image while a prior state references it',()=>{
 const p=prepared(),base={version:4,documentId:'history-texture',name:'Texture',features:[],imports:{},binaryAssets:{},hidden:[],appearance:{},colors:{}};
 const textured={...base,surface:{b:{texture:p.texture}},imports:{[p.importKey]:p.importEntry},binaryAssets:{[p.texture.assetHash]:p.bytes}};recordTimeline(base,textured);
 const removed={...textured,surface:{}};recordTimeline(textured,removed);assert(removed.binaryAssets[p.texture.assetHash]);const id=removed.timeline.entries.at(-2)?.id||removed.timeline.baseId;const restored=restoreTimeline(removed,id);assert.equal(restored.surface.b.texture.assetHash,p.texture.assetHash);validateSurfaceAssets(restored);
});
