// Loading UI: screen shows only 载入中 and, when genuinely known, a progress bar.
// Step names / counts / triangle numbers stay in kernelProgress for agents only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLoadingTracker,progressFraction,LOADING_TEXT} from '../src/loading-progress.js';

const rebuild=(phase,extra={})=>({kind:'rebuild',phase,label:'重建特征',...extra});

test('loading text is the fixed Chinese label',()=>{assert.equal(LOADING_TEXT,'载入中');});

test('fraction only for phases with a genuine completed/total',()=>{
  assert.equal(progressFraction(rebuild('feature',{completed:1,total:4})),0.25);
  assert.equal(progressFraction(rebuild('surface-mesh',{completed:5,total:10})),0.5);
  assert.equal(progressFraction(rebuild('validation')),null);
  assert.equal(progressFraction(rebuild('snap-points',{completed:3,total:9})),null);
  assert.equal(progressFraction(rebuild('feature',{completed:0,total:0})),null);
  assert.equal(progressFraction(null),null);
});

test('unknown progress stays indeterminate',()=>{
  const t=createLoadingTracker();
  assert.equal(t.update(rebuild('display-budget')),null);
  assert.equal(t.update(rebuild('validation')),null);
  assert.equal(t.update(rebuild('complete')),null);
  assert.equal(t.update({kind:'relief',phase:'relief-layer',completed:1,total:3}),null);
});

test('multi-feature project advances monotonically by feature',()=>{
  const t=createLoadingTracker();
  assert.equal(t.update(rebuild('feature',{completed:1,total:4})),0.25);
  assert.equal(t.update(rebuild('surface-mesh',{completed:9,total:10})),0.25,'mesh batches of one feature do not move the bar');
  assert.equal(t.update(rebuild('feature',{completed:3,total:4})),0.75);
  assert.equal(t.update(rebuild('feature',{completed:2,total:4})),0.75,'never goes backwards');
  assert.equal(t.update(rebuild('complete')),1);
  t.reset();assert.equal(t.value,null);
});

test('single imported model advances by meshed faces',()=>{
  const t=createLoadingTracker();
  assert.equal(t.update(rebuild('feature',{completed:0,total:1})),null);
  assert.equal(t.update(rebuild('surface-mesh',{completed:0,total:200})),0);
  assert.equal(t.update(rebuild('surface-mesh',{completed:100,total:200})),0.5);
  assert.equal(t.update(rebuild('complete')),1);
});

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');

test('main.js no longer renders step names, counts or triangles',()=>{
  assert.doesNotMatch(main,/p\.triangles\?/);
  assert.doesNotMatch(main,/\$\{p\.label\}/);
  assert.doesNotMatch(main,/setStatus\(`浮雕 /);
  assert.doesNotMatch(main,/ui\.setBusy\(true,text\)/);
  assert.match(main,/kernelProgress=\{\.\.\.result\.progress/,'agents keep detailed kernelProgress');
  assert.match(main,/withLoading\(\(\)=>openDocumentLoaded/);
  assert.match(main,/withLoading\(async\(\)=>\{await request\('ready'\)/);
});

test('overlay markup: 载入中 + hidden progressbar',()=>{
  assert.match(ui,/<span class="busy-message">载入中<\/span><div class="busy-progress" role="progressbar"/);
  assert.match(ui,/setBusyProgress\(fraction\)/);
});
