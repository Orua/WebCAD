import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('agent rebuilds retain valid user body and topology selection',()=>{
  assert.match(main,/retainedSelection=origin==='agent'\?/);
  assert.match(main,/selectedIds=origin==='agent'\?retainedSelection\.ids\.filter/);
  assert.match(main,/selectedTopology=origin==='agent'&&retainedSelection\.topology/);
  assert.match(main,/viewport\.setSelection\(selectedIds,selectedTopology\)/);
});

