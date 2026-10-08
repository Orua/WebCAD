import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';

const colorsIn = bytes => [...new TextDecoder().decode(bytes).matchAll(/COLOUR_RGB\('[^']*',([^)]*)\)/g)]
  .map(match => match[1].split(',').map(Number).map(value => Math.round(value * 255)));

test('STEP stores selected body colors and uses fresh appearance without rebuilding geometry', async () => {
  const oc = await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url))});
  const kernel = new CadKernel(oc);
  try {
    await kernel.rebuild({version:2, imports:{}, features:[
      {id:'casting', name:'Casting', op:'box', params:{width:2, depth:2, height:2}, refs:[]},
      {id:'infill', name:'Epoxy', op:'box', params:{width:1, depth:1, height:1}, refs:[]},
    ]});
    const appearance = {colors:{casting:'#cbb675', infill:'#ba1919'}, defaultColor:'#aac4d9'};
    const first = await kernel.export('step', ['casting', 'infill'], appearance);
    assert.deepEqual(colorsIn(first.data), [[203,182,117],[186,25,25]]);
    appearance.colors.infill = '#f0eee0';
    const next = await kernel.export('step', ['infill'], appearance);
    assert.deepEqual(colorsIn(next.data), [[240,238,224]]);
    assert.deepEqual(colorsIn((await kernel.export('step', ['casting'])).data), [[170,196,217]]);
    assert.deepEqual(colorsIn((await kernel.export('step', ['casting'], {colors:{},defaultColor:'#112233'})).data), [[17,34,51]]);
    await kernel.rebuild({version:2,imports:{},features:[
      {id:'casting',op:'box',params:{width:2,depth:2,height:2},refs:[]},
      {id:'identical',op:'copy',params:{},refs:['casting']},
    ]});
    assert.deepEqual(colorsIn((await kernel.export('step',['casting','identical'],{colors:{casting:'#cbb675',identical:'#ba1919'}})).data),[[203,182,117],[186,25,25]]);
  } finally { kernel.dispose(); }
});
