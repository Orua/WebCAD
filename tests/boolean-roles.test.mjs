import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import * as cad from 'replicad';

test('explicit Boolean target can preserve or consume its tool',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const base=[{id:'target',op:'box',params:{width:10,depth:10,height:10},refs:[]},{id:'tool',op:'box',params:{width:10,depth:10,height:10},refs:[]},{id:'placedTool',op:'transform',params:{x:9,y:0,z:0,positionMode:'relative',rx:0,ry:0,rz:0,scale:1},refs:['tool']}];
  try{
    let result=await kernel.rebuild({version:2,features:[...base,{id:'result',op:'cut',params:{keepTools:true},refs:['target','placedTool']}],imports:{}});
    assert.deepEqual(result.bodies.map(body=>body.id),['placedTool','result']);
    assert.ok(Math.abs(result.bodies.find(body=>body.id==='result').volume-900)<1e-6);
    result=await kernel.rebuild({version:2,features:[...base,{id:'result',op:'cut',params:{keepTools:false},refs:['target','placedTool']}],imports:{}});
    assert.deepEqual(result.bodies.map(body=>body.id),['result']);
  }finally{kernel.dispose();}
});

test('intersection accepts ordinary common and rolls back a valid but oversized kernel result',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const base=[{id:'target',op:'box',params:{width:10,depth:10,height:10},refs:[]},{id:'tool',op:'box',params:{width:10,depth:10,height:10},refs:[]},{id:'placedTool',op:'transform',params:{x:9},refs:['tool']}];
  const common={id:'result',op:'intersect',params:{},refs:['target','placedTool']};
  try{
    const initial=await kernel.rebuild({version:1,features:base,imports:{}});
    let result=await kernel.rebuild({version:1,features:[...base,common],imports:{}});
    assert.ok(Math.abs(result.bodies[0].volume-100)<1e-6);
    // Complete containment is a legal intersection with unchanged volume.
    result=await kernel.rebuild({version:1,features:[...base,{...common,refs:['target','tool']}],imports:{}});
    assert.ok(Math.abs(result.bodies[0].volume-1000)<1e-6);
    await kernel.rebuild({version:1,features:base,imports:{}});
    const committedShapes=kernel.shapes,committedHistory=[...kernel.historySignature];
    const operation=kernel.operation.bind(kernel);
    kernel.operation=async(feature,shapes,...rest)=>{
      if(feature.op==='intersect'){
        // Inject a genuinely valid positive-volume BRep larger than either
        // operand, matching the OCCT failure without a customer-source fixture.
        const source=shapes.get(feature.refs[0]),clone=source.clone.bind(source);
        source.clone=()=>{const copy=clone();copy.intersect=()=>cad.makeBox([0,0,0],[11,11,11]);return copy;};
      }
      return operation(feature,shapes,...rest);
    };
    await assert.rejects(kernel.rebuild({version:1,features:[...base,common],imports:{}}),{code:'GEOMETRY_INVALID',featureId:'result'});
    assert.equal(kernel.shapes,committedShapes);
    assert.deepEqual(kernel.historySignature,committedHistory);
    assert.deepEqual([...kernel.active.keys()],initial.bodies.map(body=>body.id));
    assert.ok(Math.abs(cad.measureVolume(kernel.shapes.get('target'))-1000)<1e-6);
  }finally{kernel.dispose();}
});

test('fusion and cut reject valid wrong material without changing committed bodies',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const base=[{id:'target',op:'box',params:{width:10,depth:10,height:10},refs:[]},{id:'tool',op:'box',params:{width:2,depth:2,height:2},refs:[]}];
  const joined={id:'result',op:'union',params:{},refs:['target','tool']};
  try{
    const accepted=await kernel.rebuild({version:1,features:[...base,joined],imports:{}});
    assert.ok(Math.abs(accepted.bodies[0].volume-1000)<1e-6,'contained material is a legal union');
    for(const [op,side] of [['union',5],['union',11],['cut',11]]){
      await kernel.rebuild({version:1,features:base,imports:{}});
      const committed=kernel.shapes,signature=[...kernel.historySignature],operation=kernel.operation.bind(kernel);
      kernel.operation=async(feature,shapes,...rest)=>{
        if(feature.op===op){
          const source=shapes.get(feature.refs[0]),clone=source.clone.bind(source);
          source.clone=()=>{const copy=clone();copy[op==='union'?'fuse':'cut']=()=>cad.makeBox([0,0,0],[side,side,side]);return copy;};
        }
        return operation(feature,shapes,...rest);
      };
      await assert.rejects(kernel.rebuild({version:1,features:[...base,{...joined,op}],imports:{}}),{code:'GEOMETRY_INVALID',featureId:'result'});
      assert.equal(kernel.shapes,committed);assert.deepEqual(kernel.historySignature,signature);
      assert.ok(Math.abs(cad.measureVolume(kernel.shapes.get('target'))-1000)<1e-6);
      kernel.operation=operation;
    }
  }finally{kernel.dispose();}
});
