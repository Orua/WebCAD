import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS, QUICK_MODEL_VISIBLE_KINDS} from '../src/quick-models.js';
import {getTool, searchTools} from '../src/page-api-docs.js';

const oc = await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url))});
const kernel = new CadKernel(oc);
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-4, `${a} != ${b}`);
const run = params => kernel.rebuild({version:1,features:[{id:'plate',op:'quickModel',params:{kind:'rectBadge',...params},refs:[]}],imports:{}});
try {
  assert.ok(QUICK_MODEL_VISIBLE_KINDS.includes('rectBadge'));
  const card = getTool({id:'template.rectBadge'});
  assert.deepEqual(card.defaults, QUICK_MODELS.rectBadge.defaults);
  for (const query of ['牌仔','牌子','方牌']) assert.ok(searchTools({query,limit:50}).items.some(x=>x.id==='template.rectBadge'));
  for (const radius of [0,2]) {
    for (const [front,back] of [[0,0],[0.5,0],[0,0.5],[0.5,0.5],[0.3,0.7]]) {
      const result = await run({length:40,width:20,cornerRadius:radius,thickness:3,frontChamfer:front,backChamfer:back});
      const body = result.bodies[0];
      assert.equal(result.bodies.length,1); assert.equal(body.solidCount,1);
      [40,20,3].forEach((size,i)=>near(body.bounds.max[i]-body.bounds.min[i],size));
      const removed = c => radius ? (60-(4-Math.PI)*radius)*c*c-Math.PI*c*c*c/3 : 60*c*c-4*c*c*c/3;
      near(body.volume,(800-(4-Math.PI)*radius*radius)*3-removed(front)-removed(back));
      // Independent end faces must shrink on the requested side only.
      for (const [z,chamfer] of [[0,back],[3,front]]) {
        const xs=[];
        for(let i=0;i<body.positions.length;i+=3) if(Math.abs(body.positions[i+2]-z)<1e-5) xs.push(body.positions[i]);
        near(Math.max(...xs),20-chamfer); near(Math.min(...xs),-20+chamfer);
      }
      console.log(`PASS R${radius}, front C${front}, back C${back}: volume ${body.volume}`);
    }
  }
  const before=(await kernel.export('brep')).data;
  for(const params of [{cornerRadius:11},{frontChamfer:2,backChamfer:1},{length:0},{frontChamfer:-1}]) {
    await assert.rejects(run(params));
    assert.equal((await kernel.export('brep')).data,before);
  }
  console.log('PASS invalid parameters preserve last committed shape; discovery and exact dimensions verified');
} finally { kernel.dispose(); }
