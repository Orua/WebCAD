// Headless diagnostic only; does not substitute for public API or visual acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildCurveSweep} from '../../src/curve-sweep.js';

if(process.argv.length!==3)throw new Error('Usage: node scripts/probes/fade-groove.mjs <new-output-directory>');
const output=path.resolve(process.argv[2]);
await fs.mkdir(output,{recursive:false});
const oc=await init({wasmBinary:await fs.readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
cad.setOC(oc);
const law=samples=>({kind:'spline',samples});
let zeroError;
try{buildCurveSweep({pathType:'spine',spine:{kind:'polyline',pointsMm:[[2,3,8],[18,3,8]]},stations:{count:6},widthLaw:1,depthLaw:law([[0,1.6],[1,0]]),rollMode:'absolute',section:'ellipse'},cad);}
catch(error){zeroError=String(error.message||error);}
assert.match(zeroError||'',/正深度/);
const stock=cad.makeBox([0,0,0],[20,6,8]);
const cutter=buildCurveSweep({pathType:'spine',spine:{kind:'polyline',pointsMm:[[2,3,8],[18,3,8]]},stations:{count:8},widthLaw:1,depthLaw:law([[0,1.6],[1,0.2]]),rollMode:'absolute',section:'ellipse'},cad);
const result=stock.cut(cutter),startProbe=cad.makeBox([1,2,7],[3,4,8]),endProbe=cad.makeBox([17,2,7],[19,4,8]);
const startRemain=result.intersect(startProbe),endRemain=result.intersect(endProbe);
const evidence={kind:'headless-kernel-probe',visualStatus:'NOT_REVIEWED',units:'mm',zeroEndRejected:zeroError,stockVolumeMm3:cad.measureVolume(stock),cutterVolumeMm3:cad.measureVolume(cutter),resultVolumeMm3:cad.measureVolume(result),deepEndRemainingMm3:cad.measureVolume(startRemain),shallowEndRemainingMm3:cad.measureVolume(endRemain)};
assert.ok(evidence.deepEndRemainingMm3<evidence.shallowEndRemainingMm3-0.05);
for(const [name,shape] of [['stock',stock],['cutter',cutter],['result',result]])await fs.writeFile(path.join(output,name+'.brep'),shape.serialize());
await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
[endRemain,startRemain,endProbe,startProbe,result,cutter,stock].forEach(s=>s.delete());
