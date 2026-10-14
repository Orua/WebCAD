import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import init from 'replicad-opencascadejs';import {CadKernel} from '../src/cad-kernel.js';
import {heightfieldReliefExample} from '../src/mesh/heightfield-relief.js';
import {closedMeshVolume} from '../src/mesh/mesh-volume.js';
import {MeshShape} from '../src/mesh/mesh-shape.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
import initManifold from 'manifold-3d';import {setManifoldLoader} from '../src/mesh/mesh-boolean.js';
setManifoldLoader(()=>initManifold());
const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const flat=(c,r,v)=>({encoding:'u8',data:Buffer.from(new Uint8Array(c*r).fill(v)).toString('base64')});
const doc=features=>({version:4,documentId:'d',name:'t',features,imports:{},hidden:[]});
test('closed mesh metrics report volume; open mesh reports null',()=>{
 const cube={positions:new Float64Array([0,0,0,1,0,0,1,1,0,0,1,0,0,0,1,1,0,1,1,1,1,0,1,1]),indices:new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7])};
 const v=closedMeshVolume(cube);assert.equal(v.closed,true);assert.ok(Math.abs(v.volume-1)<1e-12);
 assert.equal(closedMeshVolume({positions:cube.positions,indices:cube.indices.slice(0,33)}).volume,null);
 const m=new MeshShape(cube).metrics();assert.ok(Math.abs(m.volume-1)<1e-12);assert.equal(m.meshReport.closed,true);
});
test('heightfield relief unions with an exact box via manifold-3d; volume adds without overlap',async()=>{
 const relief={id:'r',op:'meshHeightfieldRelief',params:{...heightfieldReliefExample,widthMm:20,depthMm:20,baseMm:1,heightMm:1,columns:41,rows:41,heights:flat(41,41,255)},refs:[]};
 const box={id:'b',op:'box',params:{width:10,depth:10,height:5},refs:[]};
 const before=await kernel.rebuild(doc([relief,box]));const vr=before.bodies.find(b=>b.id==='r').volume,vb=before.bodies.find(b=>b.id==='b').volume;
 assert.ok(Math.abs(vr-20*20*2)<1e-6,`relief volume ${vr}`);
 const merged=await kernel.rebuild(doc([relief,box,{id:'u',op:'meshBoolean',params:{version:1,operation:'union',toleranceMm:.05},refs:['r','b']}]));
 assert.equal(merged.bodies.length,1);const u=merged.bodies[0];assert.equal(u.meshReport.closed,true);
 const bb=before.bodies.find(b=>b.id==='b').bounds,overlapZ=Math.max(0,Math.min(2,bb.max[2])-Math.max(0,bb.min[2])),overlapXY=Math.min(10,20)**2;
 const expected=vr+vb-overlapXY*overlapZ;assert.ok(Math.abs(u.volume-expected)/expected<1e-3,`union ${u.volume} vs ${expected}`);
 const sub=await kernel.rebuild(doc([relief,box,{id:'s',op:'meshBoolean',params:{version:1,operation:'subtract'},refs:['r','b']}]));
 assert.ok(Math.abs(sub.bodies[0].volume-(vr-overlapXY*overlapZ))<1e-2);
});
test('sculpt strokes replay deterministically and change volume',async()=>{
 const base={...heightfieldReliefExample,widthMm:20,depthMm:20,baseMm:1,heightMm:1,columns:81,rows:81,heights:flat(81,81,0)};
 const s=[{mode:'raise',radiusMm:3,strength:.5,points:[0,0,1,0]},{mode:'smooth',radiusMm:2,strength:1,points:[0,0]}];
 const a=await kernel.rebuild(doc([{id:'r',op:'meshHeightfieldRelief',params:{...base,sculpt:s},refs:[]}]));
 const b=await kernel.rebuild(doc([{id:'r',op:'meshHeightfieldRelief',params:{...base,sculpt:structuredClone(s)},refs:[]}]));
 assert.equal(a.bodies[0].meshReport.geometryHash,b.bodies[0].meshReport.geometryHash);assert.ok(a.bodies[0].volume>400+1);
 const flatten=await kernel.rebuild(doc([{id:'r',op:'meshHeightfieldRelief',params:{...base,sculpt:[...s,{mode:'flatten',radiusMm:30,strength:1,targetMm:0,points:[0,0]}]},refs:[]}]));
 assert.ok(flatten.bodies[0].volume<a.bodies[0].volume);
});
test('heightmap samples stored as binary asset survive project save/open',async()=>{
 const bytes=new Uint8Array(9).fill(128),hash=binaryHash(bytes).slice(7),key='heightmap-'+hash.slice(0,16);
 const d={...doc([{id:'r',op:'meshHeightfieldRelief',params:{...heightfieldReliefExample,heights:{encoding:'u8',importKey:key}},refs:[]}]),imports:{[key]:{format:'heightmap',assetHash:hash,name:'h.png'}},binaryAssets:{[hash]:bytes}};
 const opened=await decodeProject(encodeProjectV4(d));assert.deepEqual([...opened.binaryAssets[hash]],[...bytes]);
 const r=await kernel.rebuild(opened);assert.ok(Math.abs(r.bodies[0].volume-(400+400*1.5*128/255))<1);
});
