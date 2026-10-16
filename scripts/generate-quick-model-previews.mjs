import {mkdir,writeFile} from 'node:fs/promises';
import fs from 'node:fs';
import {resolve} from 'node:path';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS,QUICK_MODEL_VISIBLE_KINDS} from '../src/quick-models.js';
// Authoring only. Writes disposable meshes outside the source tree; the product
// and normal npm build consume committed images without computing previews.
const output=resolve(process.argv[2]||'G:/CAD-Workspace/WebCAD/temp/quick-model-previews');await mkdir(output,{recursive:true});
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc),results=[];
try{for(const kind of QUICK_MODEL_VISIBLE_KINDS){const start=performance.now(),def=QUICK_MODELS[kind];try{const result=await kernel.rebuild({version:1,features:[{id:'preview',op:'quickModel',params:{kind,...def.defaults},refs:[]}],imports:{},hidden:[]});const bodies=result.bodies.map(b=>({positions:Array.from(b.positions),normals:Array.from(b.normals),indices:Array.from(b.indices),edges:b.edges,bounds:b.bounds}));await writeFile(resolve(output,kind+'.json'),JSON.stringify({kind,label:def.label,defaults:def.defaults,fields:def.fields,bodies,style:kind==='threadedSleeve'?'transparent-edges':'solid'}));results.push({kind,volume:result.stats.volume,solids:result.stats.solids,ms:performance.now()-start});console.log(kind+' '+Math.round(performance.now()-start)+'ms');}catch(error){throw Error(kind+': '+error.message,{cause:error});}}}finally{kernel.dispose();}
await writeFile(resolve(output,'manifest.json'),JSON.stringify(results,null,2)+'\n');
