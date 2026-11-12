import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resultDisplayNames} from '../src/boolean-naming.js';
import {pruneHiddenIds} from '../src/hidden-ids.js';
import {bodyState,deferredMetricFields} from '../src/body-state.js';
import {getOperation} from '../src/operation-registry.js';

test('cut/union/intersect keep the target display name; renameTarget restores the step name (R7-005/R6-019)',()=>{
  const names=resultDisplayNames([
    {id:'f1',op:'box',name:'fuselage',params:{}},{id:'t1',op:'box',name:'tool',params:{}},
    {id:'c1',op:'cut',name:'cut intake',refs:['f1','t1'],params:{}},
    {id:'u1',op:'union',name:'join fin',refs:['c1','t1'],params:{}},
    {id:'i1',op:'intersect',name:'trim',refs:['u1','t1'],params:{renameTarget:true}},
    {id:'x1',op:'cut',name:'orphan',refs:['missing'],params:{}},
  ]);
  assert.equal(names.get('c1'),'fuselage');assert.equal(names.get('u1'),'fuselage');
  assert.equal(names.get('i1'),'trim');assert.equal(names.get('x1'),'orphan');
  for(const op of ['union','cut','intersect'])assert.equal(getOperation(op).inputSchema.properties.renameTarget.type,'boolean');
});

test('deferred metrics never look like volume 0 in any projection (R7-009)',()=>{
  assert.deepEqual(deferredMetricFields({metricsDeferred:true,volume:0,measurementStatus:'on-demand-exact-brep'}),{metricsDeferred:true,volume:null,measurementStatus:'on-demand-exact-brep'});
  assert.equal(bodyState({id:'a',metricsDeferred:true,volume:0}).volume,null);
  assert.equal(bodyState({id:'b',metricsDeferred:false,volume:12}).volume,12);
  assert.equal(bodyState({id:'c',metricsDeferred:true,volume:23308.56,area:5400}).volume,23308.56);
  assert.equal(bodyState({id:'c',metricsDeferred:true,volume:23308.56,area:5400}).area,5400);
  const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),service=fs.readFileSync(new URL('../src/command-service.js',import.meta.url),'utf8');
  assert.match(main,/solidCount:body\.solidCount,\.\.\.deferredMetricFields\(body\)\}\)\)/);
  assert.match(service,/metricsDeferred===true\?\{metricsDeferred:true\}:\{\}/);
});

test('hidden only lists bodies that still exist after a rebuild (R7-013)',()=>{
  assert.deepEqual(pruneHiddenIds(['a','gone','c'],[{id:'a'},{id:'c'}]),['a','c']);
  const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/next\.hidden=pruneHiddenIds\(next\.hidden,result\.bodies\)/);
});
