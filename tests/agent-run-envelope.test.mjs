import test from 'node:test';
import assert from 'node:assert/strict';
import {getTool,readDocs} from '../src/page-api-docs.js';
import {validatePageInput} from '../src/page-input-contracts.js';

test('published MCP example separates host envelope from the validated page run arguments',()=>{
  const card=getTool({id:'run'}), example=structuredClone(card.mcpExample);
  assert.equal(example.method,'run');
  assert.equal(typeof example.requestKey,'string');
  assert.equal(typeof example.args.idempotencyKey,'string');
  assert.doesNotThrow(()=>validatePageInput('run',example.args));
  assert.throws(()=>validatePageInput('run',example));
  assert.throws(()=>validatePageInput('run',{...example.args,requestKey:example.requestKey}));
  const doc=readDocs({docId:'api.run',limitChars:16000});
  assert.match(doc.text,/外层 requestKey 不会代替 args.idempotencyKey/);
  assert.match(doc.text,/error.details.path/);
});
