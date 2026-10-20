import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('agent rebuilds retain body selection but discard stale topology indices',()=>{
  assert.match(main,/retainedSelection=origin==='agent'\?/);
  assert.match(main,/selectedIds=origin==='agent'\?retainedSelection\.ids\.filter/);
  assert.match(main,/const retainedSelection=origin==='agent'\?\{ids:\[\.\.\.selectedIds\]\}/);
  assert.match(main,/Numeric face\/edge indices belong to the old body revision[^\n]*\n\s*selectedTopology=null/);
  assert.match(main,/viewport\.setSelection\(selectedIds,selectedTopology\)/);
});

