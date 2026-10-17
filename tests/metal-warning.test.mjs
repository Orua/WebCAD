import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('Agent custom colors ignored by a metal finish return a warning',()=>{
  assert.match(main,/origin==='agent'&&action==='body\.appearance'&&a\.color!==undefined&&a\.finish&&a\.finish!=='design'/);
  assert.match(main,/code:'COLOR_IGNORED_BY_METAL_FINISH'/);
});
