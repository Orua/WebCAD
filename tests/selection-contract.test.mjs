import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { mechanicalIds, mechanicalRefRange } from '../src/mechanical-tool-contracts.js';

function feature(op, params, topology) {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function featureDocument(');
  const end = source.indexOf('\nasync function addFeature', start);
  const context = {clone:structuredClone, crypto:{randomUUID}, documentModel:{features:[],imports:{},hidden:[]},
    bodies:[{id:'body'}], selectedIds:['body'], selectedTopology:topology, labels:{},mechanicalIds,mechanicalRefRange};
  vm.createContext(context);
  vm.runInContext(source.slice(start,end)+'\nthis.build=featureDocument;',context);
  return context.build(op, params, ['body']).next.features[0];
}
test('explicit edge IDs survive a different UI selection',()=>{
  const f=feature('fillet',{radius:1,edgeIds:[2]},{bodyId:'body',type:'edge',ids:[7]});
  assert.deepEqual(Array.from(f.params.edgeIds),[2]);
});
test('explicit shell face IDs survive a different UI selection',()=>{
  const f=feature('shell',{thickness:1,faceIds:[2]},{bodyId:'body',type:'face',ids:[4]});
  assert.deepEqual(Array.from(f.params.faceIds),[2]);
});
test('allEdges and explicit indices are rejected rather than silently discarded',()=>{
  assert.throws(()=>feature('chamfer',{distance:1,allEdges:true,edgeIds:[2]},null));
});
test('core cannot obtain missing edge parameters from UI selection',()=>{
  assert.throws(()=>feature('fillet',{radius:1},{bodyId:'body',type:'edge',ids:[7]}));
});

test('mechanical surface face ID remains explicit when the UI inspects a different face',()=>{
  const f=feature('offsetSurface',{distanceMm:1,faceId:2},{bodyId:'body',type:'face',ids:[4]});
  assert.equal(f.params.faceId,2);
  assert.deepEqual(Array.from(f.refs),['body']);
});

test('mechanical draft face scope is not replaced by the current UI face selection',()=>{
  const params={faceIds:[0,2],neutralPoint:[0,0,0],neutralNormal:[0,0,1],pullDirection:[0,0,1],angleDeg:2};
  const f=feature('draftByPlane',params,{bodyId:'body',type:'face',ids:[4]});
  assert.deepEqual(Array.from(f.params.faceIds),[0,2]);
  assert.deepEqual(Array.from(f.refs),['body']);
  assert.deepEqual(params.faceIds,[0,2]);
});
