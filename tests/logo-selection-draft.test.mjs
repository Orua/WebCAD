import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');

test('choosing a face keeps the awaiting-face logo draft while the dialog is closed',()=>{
  assert.match(ui,/logoDraft\?\.awaitingFace&&!dialog\)return/);
  assert.match(ui,/logoDraft\?\.awaitingFace&&state\.selectedTopology\?\.type==='face'/);
});
