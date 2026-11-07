import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {s05Recipe} from './bent-section-cases.mjs';
import {validateSchema} from '../../../src/contracts/operation-schema.js';
test('varying rectangular stations keep radial width and Z height through the existing public contract',async()=>{
 const step=s05Recipe()[0],card=JSON.parse(await readFile(new URL('../../../public/automation/tools/curveSweep.json',import.meta.url),'utf8'));
 assert.doesNotThrow(()=>validateSchema(card.inputSchema,step.args.params));
 assert.equal(step.args.params.stations.length,17);
 const middle=step.args.params.stations[8];assert.equal(middle.widthMm,5);assert.equal(middle.depthMm,3.5);assert.equal(middle.profile.interpolation,'polyline');
 assert(Math.abs(middle.normal[0]+Math.SQRT1_2)<1e-12);assert.equal(step.args.params.autoAlign,false);
});
