import test from 'node:test';
import assert from 'node:assert/strict';
import {listPublicToolCards} from '../src/page-api-docs.js';
import {ADD_STEP_SCHEMA} from '../src/page-input-contracts.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {assertAutomationParity} from '../src/automation-parity.js';

test('published minimal and normal examples contain no doc-only fields',()=>{
  const polluted=[];
  for(const card of listPublicToolCards()){
    for(const field of ['minimalExample','normalExample']){
      const text=JSON.stringify(card[field]??null);
      if(text.includes('referenceInstructions')||/"validation"/.test(text))polluted.push(`${card.id}.${field}`);
      if(card[field]?.op&&!['page-method','file','command'].includes(card.category))validateSchema(ADD_STEP_SCHEMA,card[field],`${card.id}.${field}`);
    }
  }
  assert.deepEqual(polluted,[]);
});
test('files.read example requires as and run states partial commit',async()=>{
  const {listPublicToolCards:cardsOf}=await import('../src/page-api-docs.js');
  const read=cardsOf().find(card=>card.id==='files.read');
  validateSchema(read.inputSchema,read.minimalExample);
  assert.throws(()=>validateSchema(read.inputSchema,{resourceId:'abc'}));
  const run=cardsOf().find(card=>card.id==='run');
  assert.equal(run.atomic,false);
  assert.match(run.description,/atomic:false|atomic:true/);
  assert.match(run.description,/feature\.addMany/);
});

test('release parity rejects missing required fields, ranges and enums in published examples',()=>{
  const cards=listPublicToolCards();
  assert.doesNotThrow(()=>assertAutomationParity(cards));
  for(const [id,field,change] of [
    ['prepareOperation','minimalExample',example=>delete example.context],
    ['torus','minimalExample',example=>example.params.minorRadius=-1],
    ['files.read','minimalExample',example=>example.as='json'],
  ]){
    const broken=structuredClone(cards),card=broken.find(card=>card.id===id);
    change(card[field]);
    assert.throws(()=>assertAutomationParity(broken),/Automation parity failed/);
  }
});
