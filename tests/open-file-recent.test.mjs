import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('file open uses the native picker without a persisted recent-file list',()=>{
  assert.match(main,/window\.showOpenFilePicker/);
  assert.doesNotMatch(main,/listRecentFiles|rememberOpenedFile|openedFileHandles|store\.put\(entry,'recent:'/);
  const open=main.slice(main.indexOf("if(action==='open'){"),main.indexOf("if(action==='importAtFrame'){"));
  assert.match(open,/chooseFile\(undefined,false\)/);
});

test('file replacement still confirms unsaved work and drop still routes through openDocument',()=>{
  assert.match(main,/confirmReplaceUnsaved\(\)/);
  assert.match(main,/if\(choice==='open'\)return openDocument\(files\[0\]\)/);
});
