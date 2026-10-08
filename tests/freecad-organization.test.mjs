import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {getOperation,normalizeOperationParams} from '../src/operation-registry.js';
import {createReferenceSystem,resolvePlacement} from '../src/work-frame.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
const box={id:'box',op:'box',params:{width:10,depth:6,height:4},refs:[]};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
const run=(kernel,op,params)=>kernel.rebuild({version:2,features:[box,{id:'result',op,params,refs:['box']}],imports:{}});

test('offset mirror planes preserve dimensions and use the positive coordinate axis for all three planes',async()=>{
  const kernel=new CadKernel(oc);
  try {
    for(const [plane,axis] of [['YZ',0],['XZ',1],['XY',2]]) {
      await run(kernel,'mirror',{plane,offsetMm:20,keepOriginal:false});
      const result=kernel.measure('result'),bounds=kernel.activeShape('result').boundingBox;
      try {
        near(result.volume,240);
        near(bounds.bounds[0][axis],40-[10,6,4][axis]);near(bounds.bounds[1][axis],40);
      }finally{bounds.delete();}
    }
    await run(kernel,'mirror',{plane:'YZ'});
    const bounds=kernel.activeShape('result').boundingBox;
    try {assert.deepEqual(bounds.bounds,[[-10,0,0],[0,6,4]]);}finally{bounds.delete();}
  }finally{kernel.dispose();}
});

test('patterns keep legacy compounds and explicit fusion unions overlapping copies exactly',async()=>{
  const kernel=new CadKernel(oc);
  try {
    await run(kernel,'linearPattern',{count:3,dx:8,outputMode:'fuse'});
    near(kernel.measure('result').volume,26*6*4);assert.equal(kernel.measure('result').solidCount,1);
    await run(kernel,'linearPattern',{count:3,dx:20});
    assert.equal(kernel.measure('result').solidCount,3);near(kernel.measure('result').volume,720);
    await assert.rejects(run(kernel,'linearPattern',{count:3,dx:20,outputMode:'fuse'}),/单一实体/);
    await run(kernel,'circularPattern',{count:2,angle:90,axis:'Z',cx:5,cy:3,outputMode:'fuse'});
    near(kernel.measure('result').volume,(60+60-36)*4);assert.equal(kernel.measure('result').solidCount,1);
  }finally{kernel.dispose();}
});

test('new offset mirror and fused pattern honor frozen rotated placement',async()=>{
  const kernel=new CadKernel(oc),referenceSystem=createReferenceSystem(),frame={kind:'snapshot',origin:[10,0,0],quaternion:[0,0,Math.SQRT1_2,Math.SQRT1_2]};
  try{
    const params={plane:'YZ',offsetMm:20,keepOriginal:false},placement=resolvePlacement({version:1,frame},referenceSystem,'mirror',params);
    const document={version:2,imports:{},referenceSystem,features:[box,{id:'result',op:'mirror',params,placement,refs:['box']}]};
    let result=await kernel.rebuild(document),body=result.bodies.find(body=>body.id==='result');
    body.bounds.min.forEach((v,i)=>near(v,[0,34,0][i]));body.bounds.max.forEach((v,i)=>near(v,[10,40,4][i]));
    document.referenceSystem={...referenceSystem,workFrame:{...referenceSystem.workFrame,origin:[500,500,500]}};
    result=await kernel.rebuild(document);body=result.bodies.find(body=>body.id==='result');body.bounds.min.forEach((v,i)=>near(v,[0,34,0][i]));
    const p={count:2,dx:4,outputMode:'fuse'},placed=resolvePlacement({version:1,frame},referenceSystem,'linearPattern',p);
    await kernel.rebuild({...document,features:[box,{id:'result',op:'linearPattern',params:p,placement:placed,refs:['box']}]});near(kernel.measure('result').volume,400);assert.equal(kernel.measure('result').solidCount,1);
  }finally{kernel.dispose();}
});

test('organization tools have executable strict contracts, unit annotations and bounded defaults',()=>{
  for(const op of ['mirror','linearPattern','circularPattern']) {
    const card=getOperation(op);assert.equal(card.strictContract,true);assert.equal(card.v2Executable,true);
    assert.throws(()=>normalizeOperationParams(op,{unknown:true}),{code:'PARAM_SCHEMA_INVALID'});
  }
  assert.equal(getOperation('mirror').inputSchema.properties.offsetMm.unit,'mm');
  assert.throws(()=>normalizeOperationParams('linearPattern',{}),{code:'PARAM_RANGE_INVALID'});
  assert.throws(()=>normalizeOperationParams('circularPattern',{count:101}),{code:'PARAM_RANGE_INVALID'});
  assert.equal(normalizeOperationParams('linearPattern',{dx:8}).outputMode,'compound');
});
