import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLoadingTracker,progressFraction,LOADING_TEXT} from '../src/loading-progress.js';
const rebuild=(phase,extra={})=>({kind:'rebuild',phase,...extra});
test('loading names the current phase and ignores reused history in its denominator',()=>{
 assert.equal(LOADING_TEXT,'准备模型');assert.equal(progressFraction(rebuild('feature',{completed:537,total:564,reused:537})),0);
 assert.equal(progressFraction(rebuild('feature',{completed:9,total:27,reused:537,pendingOnly:true})),1/3);
 const tracker=createLoadingTracker();tracker.update(rebuild('feature',{completed:0,total:27,pendingOnly:true}));assert.equal(tracker.value,0);assert.equal(tracker.state.label,'计算实体');
 tracker.update(rebuild('surface-mesh',{completed:5,total:10}));assert.equal(tracker.value,.5);assert.equal(tracker.state.label,'生成显示');
 tracker.update(rebuild('save-snapshot'));assert.equal(tracker.value,null);assert.equal(tracker.state.label,'准备保存');
 tracker.update(rebuild('snapshot-ready'));assert.notEqual(tracker.value,1);
 tracker.update(rebuild('rendered',{revision:5}));assert.equal(tracker.value,1);assert.equal(tracker.state.revision,5);
 tracker.reset();assert.equal(tracker.value,null);
});
test('unmeasured synchronous phases are indeterminate',()=>{
 assert.equal(progressFraction(rebuild('validation')),null);assert.equal(progressFraction(rebuild('feature',{total:0,completed:0})),null);
 const tracker=createLoadingTracker();tracker.update(rebuild('feature',{total:1,completed:1}));assert.equal(tracker.value,null);assert.equal(tracker.state.indeterminate,true);
});
test('existing overlay has elapsed time and optional details without blocking canvas interaction',()=>{
 const ui=readFileSync(new URL('../src/ui.js',import.meta.url),'utf8'),css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 assert.match(ui,/class="busy-elapsed"/);assert.match(ui,/<details class="busy-details">/);assert.match(ui,/setBusyProgress\(fraction,progress\)/);assert.match(css,/\.busy-overlay\{pointer-events:none\}/);
});
