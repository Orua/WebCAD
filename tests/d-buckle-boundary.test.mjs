import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';

cad.setOC(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));

test('a D buckle at the tangent height keeps its requested envelope and survives editable replay',async()=>{
 const document={version:1,features:[{id:'d',op:'quickModel',params:{kind:'dBuckle',section:'round',sectionSize:3,innerWidth:44,innerHeight:24,innerRadius:2,gapWidth:0},refs:[]}],imports:{}};
 const kernel=new CadKernel(cad.getOC()),reopened=new CadKernel(cad.getOC());
 try{
  const result=await kernel.rebuild(document);
  assert.equal(result.bodies.length,1);
  const shape=kernel.activeShape('d'),solids=shape.solids;
  try{assert.equal(solids.length,1);}finally{solids.forEach(s=>s.delete());}
  const check=new (cad.getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,false);
  try{assert(check.IsValid());}finally{check.delete();}
  const [minimum,maximum]=shape.boundingBox.bounds;
  for(const [axis,size]of [[0,50],[1,30],[2,3]])assert(Math.abs(maximum[axis]-minimum[axis]-size)<1e-5);
  const saved=await reopened.rebuild(JSON.parse(JSON.stringify(document)));
  assert.equal(saved.bodies.length,1);
  assert(Math.abs(saved.bodies[0].volume-result.bodies[0].volume)<1e-7);
  const tooShort=structuredClone(document);tooShort.features[0].params.innerHeight=23.9;
  await assert.rejects(kernel.rebuild(tooShort),/内高 ≥/);
 }finally{kernel.dispose();reopened.dispose();}
});
