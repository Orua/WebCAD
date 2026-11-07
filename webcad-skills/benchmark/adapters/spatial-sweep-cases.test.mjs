import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {s04Recipe} from './spatial-sweep-cases.mjs';
import {validateSchema} from '../../../src/contracts/operation-schema.js';
test('S04 samples the frozen cubic path rather than treating Bezier controls as interpolation points',async()=>{
 const step=s04Recipe()[0],card=JSON.parse(await readFile(new URL('../../../public/automation/tools/curveSweep.json',import.meta.url),'utf8'));
 assert.doesNotThrow(()=>validateSchema(card.inputSchema,step.args.params));
 const points=step.args.params.points;assert.equal(points.length,30);assert.deepEqual(points[0],[0,0,0]);assert.deepEqual(points.at(-1),[5,0,40]);
 assert(points.every(p=>p[0]>=-1e-10));assert(!points.some(p=>p[0]===-10&&p[1]===10&&p[2]===25));
 assert.equal(step.args.params.radius,2);assert.equal(step.args.placement.sourceAnchor.kind,'model-origin');
});
