import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAutomationParity} from '../src/automation-parity.js';
import {listPublicToolCards} from '../src/page-api-docs.js';
import {BATCH_METHODS} from '../src/page-batch.js';
import {getOperation} from '../src/operation-registry.js';

test('every tool card batchCapable matches the runtime batch allowlist',()=>{
  const report=assertAutomationParity();
  assert.ok(report.toolCount>=287);
  const cards=listPublicToolCards();
  assert.deepEqual(BATCH_METHODS.filter(name=>!cards.some(card=>card.id===name)).sort(),['add','addMany']);
  assert.equal(cards.filter(card=>card.batchCapable).length,BATCH_METHODS.length-2);
  assert.equal(cards.find(card=>card.id==='getDebugReport').batchCapable,false);
  assert.equal(cards.find(card=>card.id==='files.read').batchCapable,false);
  assert.equal(cards.find(card=>card.id==='files.save').batchCapable,true);
  assert.equal(cards.find(card=>card.id==='run').batchCapable,false);
  assert.equal(cards.some(card=>card.id==='add'),false);
});
test('unknown modeling names point at the real operation',()=>{
  for(const [id,fragment] of [['scale','transform'],['move','transform'],['rotate','transform'],['offsetFace','thickenFace'],['deleteFace','remove']]){
    assert.throws(()=>getOperation(id),error=>error.code==='UNKNOWN_OPERATION'&&error.message.includes(fragment));
  }
});
