import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {validateModelScript} from '../src/quick-models/model-script.js';
import {QUICK_MODELS} from '../src/quick-models.js';
const script=[
  {id:'plate',op:'box',params:{width:'$params.innerDiameter',depth:'$params.innerDiameter',height:'$params.sectionSize'}},
  {id:'hole',op:'cylinder',params:{radius:'$params.sectionSize',height:'$params.sectionSize'}},
  {id:'centeredHole',op:'transform',params:{x:12,y:12},refs:['hole']},
  {id:'result',op:'cut',refs:['plate','centeredHole']},
];
// Compatibility only: old projects retain their frozen finite recipe.
const entry={defaults:QUICK_MODELS.ring.defaults};
const recipe={op:'quickModel',refs:[],params:{kind:'ring',...entry.defaults,modelScript:script}};
for(const invalid of [[{id:'x',op:'eval',params:{}}],[{id:'x',op:'box',params:{width:0,depth:1,height:1}}],[{id:'x',op:'cut',refs:['future','future']}],[{id:'x',op:'sphere',params:{radius:'$params.missing'}}]])assert.throws(()=>validateModelScript(invalid,entry.defaults,QUICK_MODELS),/建模脚本/);
const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
try{
  const doc={version:1,features:[{id:'script',...recipe}],imports:{},hidden:[]};
  const first=await kernel.rebuild(doc);assert.equal(first.stats.solids,1);assert.ok(Math.abs(first.stats.volume-(24*24*3-Math.PI*3*3*3))<1e-5);
  const reopened=await kernel.rebuild(JSON.parse(JSON.stringify(doc)));assert.ok(Math.abs(reopened.stats.volume-first.stats.volume)<1e-5);
}finally{kernel.dispose();}
console.log('PASS finite script: validation, library persistence, frozen recipe, real boolean geometry and recipe reopen');
