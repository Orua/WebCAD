import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';

const base={version:2,features:[{id:'box',op:'box',params:{width:30,depth:30,height:10},refs:[]}],imports:{}};
const common={diameterMm:4,depthMm:6,through:false,x:15,y:15,z:10,axis:'Z',direction:-1};

test('hole wizard cuts one exact blind or through feature and rejects accidental breakthrough',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const run=async params=>{
    await kernel.rebuild({...base,features:[...base.features,{id:'hole',op:'holeWizard',params:{...common,...params},refs:['box']}]});
    return kernel.activeShape('hole');
  };
  try{
    await run({kind:'plain'});
    assert.ok(Math.abs(kernel.measure('hole').volume-(9000-24*Math.PI))<1e-5);
    await run({kind:'counterbore',recessDiameterMm:7,recessDepthMm:2});
    assert.ok(Math.abs(kernel.measure('hole').volume-(9000-24*Math.PI-2*Math.PI*(3.5**2-2**2)))<1e-5);
    await run({kind:'countersink',recessDiameterMm:7,includedAngleDeg:90});
    assert.ok(Math.abs(kernel.measure('hole').volume-(9000-24*Math.PI-Math.PI*1.5*(3.5**2+3.5*2+2**2)/3+Math.PI*2**2*1.5))<1e-5);
    await run({kind:'plain',through:true});
    assert.ok(Math.abs(kernel.measure('hole').volume-(9000-40*Math.PI))<1e-5);
    await assert.rejects(run({kind:'plain',depthMm:10}),/盲孔深度/);
    await assert.rejects(run({kind:'counterbore',recessDiameterMm:4,recessDepthMm:2}),/大直径/);
    await run({kind:'countersink',recessDiameterMm:8,includedAngleDeg:90});
    assert.ok(Math.abs(kernel.measure('hole').volume-(9000-24*Math.PI-32*Math.PI/3))<1e-5,'J8 includes a 2 mm deep countersink at 90 degrees included angle');
    const cavity={id:'cavity',op:'box',params:{width:20,depth:20,height:6},refs:[]};
    const moved={id:'moved',op:'transform',params:{x:5,y:5,z:2},refs:['cavity']};
    const hollow={id:'hollow',op:'cut',params:{},refs:['box','moved']};
    await kernel.rebuild({...base,features:[...base.features,cavity,moved,hollow,{id:'hole',op:'holeWizard',params:{...common,kind:'plain',through:true},refs:['hollow']}]});
    assert.ok(Math.abs(kernel.measure('hole').volume-(6600-16*Math.PI))<1e-5,'through mode cuts both walls across the cavity');
  }finally{kernel.dispose();}
});
