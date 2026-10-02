import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOperationParams,getOperation} from '../src/operation-registry.js';
import {reliefExample} from '../src/modeling/manufacturing/relief-contracts.js';
import {heightValuesFromRgba} from '../src/relief-image.js';
import {UI_LAYOUT} from '../src/ui/config/ui-layout.js';
import {toolDisabledReason} from '../src/tool-state.js';

test('relief has a strict bounded heightfield contract and unique menu ownership',()=>{
 const card=getOperation('relief');assert.ok(card.strictContract);assert.ok(card.errorCodes.includes('RELIEF_OUTSIDE_FACE'));
 const actions=UI_LAYOUT.tabs.flatMap(t=>t.groups.flatMap(g=>g[1]));assert.equal(actions.filter(a=>a==='relief').length,1);
 assert.equal(UI_LAYOUT.tabs.find(t=>t.id==='machine').label,'面加工');assert.equal(UI_LAYOUT.tabs.find(t=>t.id==='solidMachine').label,'实体加工');
 assert.match(toolDisabledReason('relief',{kernelReady:true,busy:false,selectedIds:[]}),/选面/);
 assert.deepEqual(normalizeOperationParams('relief',reliefExample).values,reliefExample.values);
 for(const patch of [{depthMm:0},{widthMm:-1},{values:[[1]]},{values:reliefExample.values.map(r=>r.map(()=>2))},{unexpected:1}])assert.throws(()=>normalizeOperationParams('relief',{...reliefExample,...patch}));
});
test('RGBA preserves orientation, transparency and explicit brightness polarity',()=>{
 const pixels=new Uint8ClampedArray(4*4*4).fill(255);pixels.set([0,0,0,255],0);pixels.set([0,0,0,0],4);
 const v=heightValuesFromRgba(pixels,4,4);assert.equal(v[3][0],1);assert.equal(v[3][1],0);assert.equal(v[0][0],0);
 const inverse=heightValuesFromRgba(pixels,4,4,{whiteHigh:true});assert.equal(inverse[3][0],0);assert.equal(inverse[3][1],0);assert.equal(inverse[0][0],1);
});
test('rounded silhouette has continuously changing height controls instead of a flat plateau',()=>{
 const size=9,pixels=new Uint8ClampedArray(size*size*4).fill(255);for(let y=1;y<8;y++)for(let x=1;x<8;x++)pixels.set([0,0,0,255],(y*size+x)*4);
 const v=heightValuesFromRgba(pixels,size,size,{style:'rounded'});assert.equal(v[0][0],0);assert.equal(v[4][4],1);assert.ok(v[1][4]>0&&v[1][4]<v[3][4]);
 assert.throws(()=>heightValuesFromRgba(pixels,size,size,{threshold:2}),/参数/);
});
