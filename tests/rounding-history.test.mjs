import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
const box={id:'box',op:'box',params:{width:20,depth:10,height:8},refs:[]};
const feature=(widthA,widthB)=>({id:'wide',op:'rounding',refs:['box'],params:{specVersion:1,mode:'width',scope:{kind:'edges',edgeIds:[8]},propagation:'selected-only',widthAMm:widthA,widthBMm:widthB,boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}}});
const document=rounding=>({version:1,features:[box,rounding],imports:{}});

test('real WASM width history rebuild starts from upstream source and reports effective widths',async()=>{
  const kernel=new CadKernel(oc),fresh=new CadKernel(oc);
  try{
    const before=await kernel.rebuild(document(feature(1,2)));
    assert.equal(before.bodies.length,1);
    assert.equal(before.bodies[0].roundingReport.mode,'width');
    assert.deepEqual(before.bodies[0].roundingReport.effectiveSpec,{widthAMm:1,widthBMm:2});
    const after=await kernel.rebuild(document(feature(1.5,2)));
    const direct=await fresh.rebuild(document(feature(1.5,2)));
    assert.equal(after.bodies[0].roundingReport.validation.solid,'passed');
    assert(Math.abs(after.bodies[0].volume-direct.bodies[0].volume)<1e-7,'edited feature equals a clean upstream rebuild');
    assert(Math.abs(after.bodies[0].volume-before.bodies[0].volume)>1e-4,'width edit changes the actual solid');
    assert.deepEqual(after.bodies[0].roundingReport.effectiveSpec,{widthAMm:1.5,widthBMm:2});
  }finally{kernel.dispose();fresh.dispose();}
});

test('real WASM body exclusion survives history edits and rebuilding the original request',async()=>{
  const kernel=new CadKernel(oc),fresh=new CadKernel(oc);
  try{
    await kernel.rebuild({version:1,features:[box],imports:{}});
    const query=await kernel.queryGeometry('box','edge',{});
    const chosen=query.items.find(edge=>edge.bounds&&Math.abs(edge.bounds[1][0]-edge.bounds[0][0])>19.9);
    assert(chosen,'source edge selected from current topology');
    const round=radius=>({id:'round',op:'rounding',refs:['box'],params:{specVersion:1,mode:'constant',scope:{kind:'body',excludeEdgeIds:[chosen.edgeId]},propagation:'selected-only',radiusMm:radius,boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}}});
    const first=await kernel.rebuild(document(round(.3)));
    const edited=await kernel.rebuild(document(round(.5)));
    const replay=await fresh.rebuild(document(round(.3)));
    assert.equal(first.bodies[0].roundingReport.validation.solid,'passed');
    assert.deepEqual(edited.bodies[0].roundingReport.excludedEdgeIds,[chosen.edgeId]);
    assert(!edited.bodies[0].roundingReport.processedEdgeIds.includes(chosen.edgeId));
    assert(Math.abs(edited.bodies[0].volume-first.bodies[0].volume)>1e-5);
    const restored=await kernel.rebuild(document(round(.3)));
    assert(Math.abs(restored.bodies[0].volume-replay.bodies[0].volume)<1e-7,'replayed feature equals clean upstream rebuild');
  }finally{kernel.dispose();fresh.dispose();}
});

test('real WASM multi-station variable history edit rebuilds the requested law from upstream',async()=>{
  const kernel=new CadKernel(oc),fresh=new CadKernel(oc);
  try{
    await kernel.rebuild({version:1,features:[box],imports:{}});
    const query=await kernel.queryGeometry('box','edge',{}),edge=query.items.find(item=>item.lengthMm>19.9&&Math.abs(item.midpoint[1])<1e-8&&Math.abs(item.midpoint[2])<1e-8);
    assert(edge);
    const round=end=>({id:'variable',op:'rounding',refs:['box'],params:{specVersion:1,mode:'variable',scope:{kind:'edges',edgeIds:[edge.edgeId]},propagation:'selected-only',laws:[{chainId:`edge:${edge.edgeId}`,direction:'forward',interpolation:'linear',stations:[{s:0,radiusMm:.5},{s:.4,radiusMm:1.2},{s:1,radiusMm:end}]}],boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}}});
    const first=await kernel.rebuild(document(round(1.5)));
    const edited=await kernel.rebuild(document(round(1.4)));
    const direct=await fresh.rebuild(document(round(1.4)));
    assert.equal(edited.bodies[0].roundingReport.validation.radius,'sampled-passed');
    assert.equal(edited.bodies[0].roundingReport.variable.stations.length,3);
    assert(Math.abs(edited.bodies[0].volume-direct.bodies[0].volume)<1e-7);
    assert(Math.abs(edited.bodies[0].volume-first.bodies[0].volume)>1e-4);
  }finally{kernel.dispose();fresh.dispose();}
});

test('real WASM collinear chain history edit preserves the whole-source arc law',async()=>{
  const source={id:'profile',op:'arcProfile',refs:[],params:{outer:[[[0,0],[7,0]],[[7,0],[20,0]],[[20,0],[20,10]],[[20,10],[0,10]],[[0,10],[0,0]]].map(points=>({type:'line',points})),height:8}};
  const kernel=new CadKernel(oc),fresh=new CadKernel(oc);
  try{
    await kernel.rebuild({version:1,features:[source],imports:{}});
    const query=await kernel.queryGeometry('profile','edge',{});
    const chain=query.items.filter(item=>item.lengthMm>1&&Math.abs(item.midpoint[1])<1e-8&&Math.abs(item.midpoint[2])<1e-8).sort((a,b)=>a.midpoint[0]-b.midpoint[0]);
    assert.equal(chain.length,2);const ids=chain.map(item=>item.edgeId);
    const variable=end=>({id:'chain',op:'rounding',refs:['profile'],params:{specVersion:1,mode:'variable',scope:{kind:'edges',edgeIds:ids},propagation:'selected-only',laws:[{chainId:`edges:${ids.join(',')}`,direction:'forward',interpolation:'linear',stations:[{s:0,radiusMm:.5},{s:1,radiusMm:end}]}],boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}}});
    const doc=feature=>({version:1,features:[source,feature],imports:{}});
    const initial=await kernel.rebuild(doc(variable(1.5)));
    const edited=await kernel.rebuild(doc(variable(1.4)));
    const direct=await fresh.rebuild(doc(variable(1.4)));
    assert.equal(edited.bodies[0].roundingReport.validation.radius,'sampled-passed');
    assert.deepEqual(edited.bodies[0].roundingReport.processedEdgeIds,ids);
    assert.equal(edited.bodies[0].roundingReport.variable.sourceLengthMm,20);
    assert(Math.abs(edited.bodies[0].volume-direct.bodies[0].volume)<1e-7);
    assert(Math.abs(initial.bodies[0].volume-edited.bodies[0].volume)>1e-4);
  }finally{kernel.dispose();fresh.dispose();}
});
