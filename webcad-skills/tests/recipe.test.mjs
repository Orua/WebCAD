import assert from 'node:assert/strict';
import {recipe} from '../scripts/recipes.mjs';
const c=recipe('finish',{bodyId:'current-test',edgeIds:[1,2],kind:'chamfer',distanceMm:0.5});assert.equal(c[0].args.op,'chamfer');assert.deepEqual(c[0].args.params,{distance:0.5,edgeIds:[1,2]});
const f=recipe('finish',{bodyId:'current-test',edgeIds:[1,2],kind:'fillet',radiusMm:0.5});assert.equal(f[0].args.op,'fillet');
assert.throws(()=>recipe('finish',{bodyId:'test',edgeIds:[1]}),/Explicit/);assert.throws(()=>recipe('export',{bodyId:'test'}),/Explicit/);
assert.equal(recipe('export',{bodyId:'test',format:'stl'})[0].args.format,'stl');
assert.equal(recipe('blind-hole')[1].args.params.depth,1);assert.equal(recipe('plate-two-holes')[1].args.params.points.length,2);
console.log('PASS: distinct C/R and STEP/STL recipes; missing binding rejected');
