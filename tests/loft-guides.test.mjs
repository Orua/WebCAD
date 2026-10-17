import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildCurveSweep} from '../src/curve-sweep.js';
import {getOperation} from '../src/operation-registry.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
test('UP-25 unsupported guide/G1/G2 and cross-feature matching fail explicitly',()=>{
 const stations=[0,1].map(z=>({centerMm:[0,0,z*5],normal:[0,0,1],widthDirection:[1,0,0],widthMm:2,depthMm:2}));
 assert.throws(()=>buildCurveSweep({pathType:'sections',stations,guides:[{pointsMm:[[1,0,0],[1,0,5]]}]},cad),e=>e.code==='LOFT_GUIDE_UNSUPPORTED');
 for(const condition of ['G1','G2'])assert.throws(()=>buildCurveSweep({pathType:'sections',stations,startCondition:condition},cad),e=>e.code==='CONTINUITY_UNSUPPORTED'&&e.report.curvatureContinuity===false);
 assert.throws(()=>buildCurveSweep({pathType:'sections',stations,matchTo:{featureId:'prior',end:'end'}},cad),e=>e.code==='CONTINUITY_UNSUPPORTED');
 const schema=getOperation('curveSweep').inputSchema.properties;assert.ok(schema.guides);assert.ok(schema.startCondition);assert.ok(schema.matchTo);
});
