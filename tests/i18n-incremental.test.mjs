import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Static guard: mutation batches must not re-walk the whole DOM (agent batch hot path).
test('translation observer is incremental and a no-op in the source language',()=>{
  const source=readFileSync(new URL('../src/i18n.js',import.meta.url),'utf8');
  assert.match(source,/if\(incremental&&language==='zh'\)return;/);
  assert.match(source,/record\.addedNodes/);
  assert.match(source,/translate:\(\)=>translate\(\)/);
});
