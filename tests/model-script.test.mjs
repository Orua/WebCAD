import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {createModelLibrary} from '../src/model-library.js';
import {validateModelScript} from '../src/quick-models/model-script.js';
import {QUICK_MODELS} from '../src/quick-models.js';
const script=[
  {id:'plate',op:'box',params:{width:'$params.innerDiameter',depth:'$params.innerDiameter',height:'$params.sectionSize'}},
  {id:'hole',op:'cylinder',params:{radius:'$params.sectionSize',height:'$params.sectionSize'}},
  {id:'centeredHole',op:'transform',params:{x:12,y:12},refs:['hole']},
  {id:'result',op:'cut',refs:['plate','centeredHole']},
];
const memory=new Map(),library=createModelLibrary(()=>({getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}));
const entry={id:'scriptPlate',kind:'ring',label:'脚本开孔板',defaults:QUICK_MODELS.ring.defaults,script};
library.update({expectedLibraryRevision:0,operation:'upsert',entry});
const recipe=library.resolve({id:entry.id,expectedLibraryRevision:1}),frozen=structuredClone(recipe);
assert.deepEqual(library.contracts().entries.at(-1).execution.args.params.modelScript,script);
library.update({expectedLibraryRevision:1,operation:'remove',id:entry.id});assert.deepEqual(recipe,frozen);
for(const invalid of [[{id:'x',op:'eval',params:{}}],[{id:'x',op:'box',params:{width:0,depth:1,height:1}}],[{id:'x',op:'cut',refs:['future','future']}],[{id:'x',op:'sphere',params:{radius:'$params.missing'}}]])assert.throws(()=>validateModelScript(invalid,entry.defaults,QUICK_MODELS),/建模脚本/);
const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
try{
  const doc={version:1,features:[{id:'script',...recipe}],imports:{},hidden:[]};
  const first=await kernel.rebuild(doc);assert.equal(first.stats.solids,1);assert.ok(Math.abs(first.stats.volume-(24*24*3-Math.PI*3*3*3))<1e-5);
  const reopened=await kernel.rebuild(JSON.parse(JSON.stringify(doc)));assert.ok(Math.abs(reopened.stats.volume-first.stats.volume)<1e-5);
}finally{kernel.dispose();}
console.log('PASS finite script: validation, library persistence, frozen recipe, real boolean geometry and recipe reopen');
