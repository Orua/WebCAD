import test from 'node:test';
import assert from 'node:assert/strict';
import {compactWriteReceipt} from '../src/receipt-compact.js';

test('a box receipt keeps nextContext once and does not repeat context eight times',()=>{
  const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1};
  const requestContext={sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1};
  const facts={context,nextContext:requestContext,createdBodyIds:['b']};
  const step={status:'committed',context,requestContext,facts:{...facts},createdBodyIds:['b'],error:{message:'raw',userMessage:'raw。请保留当前工程。',recovery:{reason:'raw',userMessage:'raw。请保留当前工程。',next:'继续'}}};
  const receipt=compactWriteReceipt({status:'completed',context,requestContext,facts:{...facts},results:[{id:'box',result:step}],error:step.error});
  assert.equal(receipt.requestContext.expectedRevision,1);
  assert.equal(receipt.facts.nextContext.expectedRevision,1);
  assert.equal(receipt.facts.context,undefined);
  assert.equal(receipt.facts.contextRef,'context');
  assert.equal(receipt.results[0].result.contextRef,'batch');
  assert.equal(receipt.results[0].result.facts.nextContext,undefined);
  assert.equal(receipt.error.userMessage,'raw。请保留当前工程。');
  assert.equal(receipt.error.recovery.userMessage,'raw。请保留当前工程。');
  assert.equal(receipt.error.recovery.reason,undefined);
  assert.equal(receipt.error.recovery.reasonRef,'userMessage');
  const copies=(JSON.stringify(receipt).match(/"sessionId":"s"/g)||[]).length;
  assert.ok(copies<=3,`context copies ${copies}`);
});
