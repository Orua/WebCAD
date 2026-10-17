import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('supported browsers use File System Access and retain up to five recent handles',()=>{
  assert.match(main,/window\.showOpenFilePicker/);
  assert.match(main,/indexedDB\.open\('webcad-local',1\)/);
  assert.match(main,/store\.put\(entry,'recent:'\+entry\.id\)/);
  assert.match(main,/rows\.slice\(5\)/);
  assert.match(main,/item\.handle\.getFile\(\)/);
});

test('file replacement still confirms unsaved work and drop still routes through openDocument',()=>{
  assert.match(main,/confirmReplaceUnsaved\(\)/);
  assert.match(main,/if\(choice==='open'\)return openDocument\(files\[0\]\)/);
});
