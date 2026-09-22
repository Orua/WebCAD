import assert from 'node:assert/strict';import fs from 'node:fs';import init from 'replicad-opencascadejs';import * as cad from 'replicad';import {buildAdvancedLoft} from '../src/advanced-loft.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const sections=[{z:0,points:[[-8,-5],[8,-5],[7,5],[-7,5]]},{z:6,points:[[-6,-4],[10,-4],[9,4],[-5,4]]},{z:14,points:[[-4,-3],[6,-3],[5,3],[-3,3]]}];
const shape=buildAdvancedLoft({sections},cad);assert.equal(shape.solids.length,1);assert.ok(cad.measureVolume(shape)>0);assert.ok(shape.faces.length>0);const step=await cad.exportSTEP([{shape}]);assert.ok(step instanceof Blob);const imported=await cad.importSTEP(step);assert.equal(imported.solids.length,1);assert.ok(cad.measureVolume(imported)>0);imported.delete();
for(const bad of [{sections:[sections[0]]},{sections:[{z:0,points:[[0,0],[1,0],[0,1]]},{z:0,points:[[0,0],[1,0],[0,1]]}]},{sections:[{z:0,points:[[0,0],[2,2],[0,2],[2,0]]},{z:1,points:[[0,0],[1,0],[1,1]]}]},{sections:[{z:0,points:[[0,0],[1,0],[0,0]]},{z:1,points:[[0,0],[1,0],[0,1]]}]},{sections,output:'bad'}])assert.throws(()=>buildAdvancedLoft(bad,cad));
assert.throws(()=>buildAdvancedLoft({sections:sections.map((s,i)=>({...s,z:i===0?'0':s.z}))},cad));
const shell=buildAdvancedLoft({sections,output:'shell'},cad);assert.equal(shell.solids.length,0);assert.ok(shell.faces.length>0);shell.delete();
shape.delete();console.log('advanced loft checks passed');
