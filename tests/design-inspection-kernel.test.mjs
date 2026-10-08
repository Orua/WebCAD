import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';

const evidence={kind:'drawing',reference:'fixture drawing: 10 x 8 x 4, central through hole radius 1'};
test('exact design checks catch missing material and blocked openings despite unchanged bounds and one valid solid',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
  const kernel=new CadKernel(oc);
  try{
    await kernel.rebuild({version:2,features:[
      {id:'stock',op:'box',params:{width:10,depth:8,height:4},refs:[]},
      {id:'drill',op:'cylinder',params:{radius:1,height:4},refs:[]},
      {id:'positioned',op:'transform',params:{x:5,y:4,z:0},refs:['drill']},
      {id:'part',op:'cut',params:{},refs:['stock','positioned']},
    ],imports:{}});
    const bodyId='part',before=kernel.activeShape(bodyId).serialize(),history=JSON.stringify(kernel.historySignature),renderVersion=kernel.renderVersion;
    const requirements=[
      {id:'size',bodyId,kind:'bounds',sizeMm:[10,8,4],toleranceMm:0.001,evidence},
      {id:'oneSolid',bodyId,kind:'solidCount',count:1,evidence},
      {id:'stockKept',bodyId,kind:'material',points:[[2,2,2],[8,6,2]],expected:'inside',evidence},
      {id:'holeOpen',bodyId,kind:'material',points:[[5,4,1],[5,4,3]],expected:'outside',evidence},
    ];
    const checked=kernel.inspectDesign({requirements});
    assert.equal(checked.verdict,'pass');assert.equal(checked.summary.pass,4);assert.equal(checked.sourceEvidenceVerified,false);
    assert.equal(checked.results[3].actual.samples[0].classification,'outside');
    assert.equal(kernel.inspectDesign({requirements:[{...requirements[3],expected:'inside'}]}).verdict,'fail','missing connection material must fail even with one solid and correct bounds');
    assert.equal(kernel.inspectDesign({requirements:[{...requirements[2],expected:'outside'}]}).verdict,'fail','blocked opening must fail');
    assert.equal(kernel.inspectDesign({requirements:[{...requirements[0],sizeMm:[9,8,4]}]}).verdict,'fail');
    assert.equal(kernel.inspectDesign({requirements:[{...requirements[1],count:2}]}).verdict,'fail');
    const boundary=kernel.inspectDesign({requirements:[{...requirements[2],points:[[0,2,2]]}]});
    assert.equal(boundary.verdict,'unverified');assert.equal(boundary.results[0].matches,null);
    const guessed=kernel.inspectDesign({requirements:[{...requirements[3],evidence:{kind:'assumption',reference:'Unconfirmed seam width'}}]});
    assert.equal(guessed.verdict,'unverified');assert.equal(guessed.results[0].matches,true);
    const repeated=kernel.inspectDesign({requirements:[{...requirements[2],points:[[2,2,2],[2,2,2]]},{...requirements[3],points:[[5,4,1],[5,4,1]]}]});
    assert.equal(repeated.verdict,'pass');assert.equal(repeated.results[0].actual.samples.length,2);
    const near=kernel.inspectDesign({requirements:[{...requirements[2],id:'fine',points:[[1e-4,2,2]],toleranceMm:1e-5},{...requirements[2],id:'coarse',points:[[1e-4,2,2]],toleranceMm:1e-3}]});
    assert.equal(near.results[0].verdict,'pass');assert.equal(near.results[1].verdict,'unverified');
    const close=kernel.inspectDesign({requirements:[{...requirements[2],points:[[2,2,2],[2+1e-8,2,2]]}]});
    assert.equal(close.verdict,'pass');
    assert.equal(kernel.activeShape(bodyId).serialize(),before);assert.equal(JSON.stringify(kernel.historySignature),history);assert.equal(kernel.renderVersion,renderVersion);
  }finally{kernel.dispose();}
});
