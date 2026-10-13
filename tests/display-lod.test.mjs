import test from 'node:test';
import assert from 'node:assert/strict';
import {createDisplayPatches,chooseDisplayLevel} from '../src/mesh/display-lod.js';
test('display patches preserve the full source triangle multiset and protected seams',()=>{
 const p=new Float32Array([0,0,0,4,0,0,0,4,0,4,4,0,2,2,1]),i=new Uint32Array([0,1,4,1,3,4,3,2,4,2,0,4]),before=p.slice(),indices=i.slice();
 const patches=createDisplayPatches(p,i,{threshold:1});assert(patches.length>1);
 assert.deepEqual(p,before);assert.deepEqual(i,indices);
 const triangles=a=>Array.from({length:a.length/3},(_,n)=>Array.from(a.subarray(n*3,n*3+3)).join(',')).sort();
 assert.deepEqual(patches.flatMap(c=>triangles(c.indices)).sort(),triangles(i));
 for(const patch of patches)for(const lod of patch.lods){assert.equal(lod.maxDisplacementMm,0);for(let k=0;k<lod.indices.length;k++){const a=lod.indices[k]*3,b=patch.indices[k]*3;assert.deepEqual(lod.positions.subarray(a,a+3),p.subarray(b,b+3));}}
});
test('moving display levels obey screen error; settled view always restores full detail',()=>{
 const levels=[{maxDisplacementMm:.01},{maxDisplacementMm:.2}];
 assert.equal(chooseDisplayLevel(levels,.05,true),1);assert.equal(chooseDisplayLevel(levels,.005,true),0);assert.equal(chooseDisplayLevel(levels,.0001,true),-1);
 assert.equal(chooseDisplayLevel(levels,.05,false),-1);assert.equal(chooseDisplayLevel(levels,0,true),-1);
});
