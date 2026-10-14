import test from 'node:test';import assert from 'node:assert/strict';
import {listOperations,normalizeOperationParams} from '../src/operation-registry.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {heightfieldReliefOperation} from '../src/mesh/heightfield-relief.js';
import {meshBooleanOperation} from '../src/mesh/mesh-boolean.js';
import {reliefPlateOperation} from '../src/mesh/relief-plate.js';
import {reliefEditOperation} from '../src/mesh/relief-edit-contract.js';
import {reliefOperations} from '../src/modeling/manufacturing/relief-contracts.js';
const strict=['meshHeightfieldRelief','meshBoolean','logo','union','cut','intersect','transform','copy'];
test('all operations carry source purpose, parameter metadata, limits, outputs and invalid examples',()=>{
 for(const card of listOperations()){
  const c=card.contract;assert.ok(c.purpose&&c.whenToUse.length&&c.whenNotToUse.length,card.id);
  assert.deepEqual(Object.keys(c.params).sort(),Object.keys(card.inputSchema.properties||{}).sort(),card.id);
  assert.ok(c.limits.length&&c.outputs.exportFormats.length&&c.errors.length&&c.examples.invalid.length&&c.related.length);
  assert.ok(c.limits.every(l=>Number.isFinite(l.value)&&l.source.startsWith('src/limits.js#')));
  for(const ex of c.examples.invalid){let error;try{card.strictContract?normalizeOperationParams(card.id,ex.params):validateSchema(card.inputSchema,ex.params);}catch(e){error=e;}assert.equal(error?.code,ex.errorCode,card.id);}
 }
 for(const id of strict)assert.equal(listOperations().find(c=>c.id===id).strictContract,true,id);
});
test('relief source modules publish their own canonical contract before registry assembly',()=>{
 for(const [id,source] of Object.entries({meshHeightfieldRelief:heightfieldReliefOperation,meshBoolean:meshBooleanOperation,meshReliefPlate:reliefPlateOperation,meshReliefEdit:reliefEditOperation,relief:reliefOperations.relief})){
  const c=source.contract;assert.ok(c.purpose&&c.whenToUse.length&&c.errors.length,id);
  assert.deepEqual(Object.keys(c.params).sort(),Object.keys(listOperations().find(card=>card.id===id).inputSchema.properties).sort(),id);
  assert.ok(c.examples.minimal.params&&c.related.length,id);
 }
});
