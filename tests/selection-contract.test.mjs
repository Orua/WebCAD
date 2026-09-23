import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

function feature(op, params, topology) {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function featureDocument(');
  const end = source.indexOf('\nasync function addFeature', start);
  const context = {clone:structuredClone, crypto:{randomUUID}, documentModel:{features:[],imports:{},hidden:[]},
    bodies:[{id:'body'}], selectedIds:['body'], selectedTopology:topology, labels:{}};
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
