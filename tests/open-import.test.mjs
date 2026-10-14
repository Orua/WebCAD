import test from 'node:test';import assert from 'node:assert/strict';
import {classifyFile,assertOpenAllowed,assertInsertable,assertOpenable,dropDecision,FILE_MENU_LABELS} from '../src/open-import-policy.js';
import {UI_LAYOUT} from '../src/ui/config/ui-layout.js';
import {FILE_ARGUMENT_KEYS} from '../src/browser-file-contracts.js';
const f=name=>({name});
test('classifies project, model and IGES files',()=>{assert.equal(classifyFile('a.webcad'),'project');assert.equal(classifyFile('a.STEP'),'model');assert.equal(classifyFile('a.stl'),'model');assert.equal(classifyFile('a.igs'),'iges');assert.equal(classifyFile('a.txt'),null);});
test('open requires an explicit unsaved decision and never discards silently',()=>{
  assert.throws(()=>assertOpenAllowed({dirty:false}),e=>e.code==='PARAM_SCHEMA_INVALID'&&e.path==='unsaved'&&/从不合并/.test(e.message));
  assert.throws(()=>assertOpenAllowed({unsaved:'merge',dirty:false}),{code:'PARAM_SCHEMA_INVALID'});
  assert.throws(()=>assertOpenAllowed({unsaved:'fail',dirty:true}),e=>e.code==='UNSAVED_REPLACEMENT'&&/未保存/.test(e.message));
  assert.doesNotThrow(()=>assertOpenAllowed({unsaved:'fail',dirty:false}));assert.doesNotThrow(()=>assertOpenAllowed({unsaved:'discard',dirty:true}));});
test('insert refuses project files; open accepts projects and models',()=>{assert.throws(()=>assertInsertable('a.webcad'),{code:'FORMAT_UNSUPPORTED'});assert.doesNotThrow(()=>assertInsertable('a.step'));assert.throws(()=>assertInsertable('a.iges'),{code:'CAPABILITY_UNAVAILABLE'});assert.doesNotThrow(()=>assertOpenable('a.stp'));assert.doesNotThrow(()=>assertOpenable('a.webcad'));assert.throws(()=>assertOpenable('a.doc'),{code:'FORMAT_UNSUPPORTED'});});
test('drag-drop opens only into an empty clean document; otherwise asks with Cancel default',()=>{
  assert.deepEqual(dropDecision({files:[f('a.step')],documentEmpty:true,dirty:false}),{mode:'open'});
  const ask=dropDecision({files:[f('a.step')],documentEmpty:false,dirty:false});assert.equal(ask.mode,'ask');assert.equal(ask.defaultChoice,'cancel');assert.deepEqual(ask.choices,['open','insert','cancel']);
  assert.deepEqual(dropDecision({files:[f('a.webcad')],documentEmpty:false,dirty:true}).choices,['open','cancel']);
  assert.deepEqual(dropDecision({files:[f('a.step'),f('b.stl')],documentEmpty:true,dirty:false}).choices,['insert','cancel']);
  assert.equal(dropDecision({files:[f('a.webcad'),f('b.step')],documentEmpty:true,dirty:false}).mode,'reject');
  assert.equal(dropDecision({files:[f('a.igs')],documentEmpty:true,dirty:false}).mode,'reject');});
test('file menu labels state replace vs insert; files.open accepts unsaved',()=>{const menu=Object.fromEntries(UI_LAYOUT.fileMenu.map(i=>[i.action,i.label]));assert.equal(menu.open,FILE_MENU_LABELS.open);assert.equal(menu.importAtFrame,FILE_MENU_LABELS.importAtFrame);assert.ok(FILE_ARGUMENT_KEYS.open.includes('unsaved'));});
