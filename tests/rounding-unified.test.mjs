import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {getOperation,normalizeOperationParams,normalizeOperationPatch} from '../src/operation-registry.js';
import {adaptUISelection} from '../src/ui-selection-adapter.js';
import {searchTools,getTool} from '../src/page-api-docs.js';
import {buildRounding} from '../src/modeling/rounding/index.js';
import {topologyDetails} from '../src/modeling/rounding/topology.js';
import {CadKernel} from '../src/cad-kernel.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=value=>{try{value?.delete?.();}catch{}};
const request=(ids,sizeMm=.5)=>({specVersion:2,sizeMm,scope:{kind:'edges',edgeIds:ids}});
function topCircle(source){const edges=source.edges;try{return topologyDetails(source).find(r=>r.sharp&&edges[r.edgeId].geomType==='CIRCLE'&&r.midpoint[2]>7.9);}finally{edges.forEach(dispose);}}

test('current polishing card preserves the explicit historical size contract',()=>{
 const card=getOperation('rounding');assert.equal(card.version,'3.0.0');
 assert.deepEqual(Object.keys(card.historicalInputSchemas[2].properties),['specVersion','sizeMm','scope']);
 assert.deepEqual(normalizeOperationParams('rounding',request([0])),request([0]));
 assert.throws(()=>normalizeOperationParams('rounding',{...request([0]),mode:'constant'}),e=>e.code==='PARAM_SCHEMA_INVALID');
 assert.throws(()=>normalizeOperationParams('rounding',request([0],0)),e=>e.code==='PARAM_RANGE_INVALID');
 assert.equal(normalizeOperationPatch('rounding',request([0]),{sizeMm:.8}).sizeMm,.8);
 const legacy={specVersion:1,mode:'constant',radiusMm:.5,scope:{kind:'edges',edgeIds:[0]},propagation:'selected-only',boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}};
 assert.deepEqual(normalizeOperationParams('rounding',legacy),legacy);
 assert.deepEqual(normalizeOperationParams('fillet',{radius:.5,edgeIds:[0]}),{radius:.5,edgeIds:[0]});
});

test('UI preserves historical size input and discovery distinguishes fillet from polishing',()=>{
 assert.deepEqual(adaptUISelection('rounding',{sizeMm:.5},['part'],{bodyId:'part',type:'edge',ids:[2,4]}),request([2,4]));
 assert.throws(()=>adaptUISelection('rounding',{sizeMm:.5},['part'],{bodyId:'part',type:'face',ids:[2]}),/选择/);
 const found=searchTools({query:'圆角',limit:50});assert(found.items.some(tool=>tool.id==='fillet'));
 assert(searchTools({query:'打磨',limit:50}).items.some(tool=>tool.id==='rounding'));
 assert(searchTools({query:'圆润',limit:50}).items.some(tool=>tool.id==='round'));
 assert(getTool({id:'fillet'}));
});

test('size changes real geometry; oversized failure preserves the source',()=>{
 const source=cad.makeCylinder(4,8),saved=source.serialize();let small,large;
 try{
  const row=topCircle(source);assert(row);
  small=buildRounding(source,request([row.edgeId],.3));large=buildRounding(source,request([row.edgeId],.6));
  assert(cad.measureVolume(large)<cad.measureVolume(small));
  assert.equal(small.roundingReport.specVersion,2);assert.equal(small.roundingReport.requestedSpec.sizeMm,.3);
  assert.equal(small.roundingReport.constructionKind,'constant-radius');assert.equal(large.roundingReport.constructionKind,'constant-radius');
  assert.equal(small.roundingReport.selectionSignatures.length,1);
  assert.throws(()=>buildRounding(source,request([row.edgeId],100)));
  assert.equal(source.serialize(),saved);
 }finally{dispose(small);dispose(large);dispose(source);}
});

test('v2 history size edit, document replay and BREP readback agree',async()=>{
 const kernel=new CadKernel(oc);let reopened;
 try{
  const source={id:'source',op:'cylinder',params:{radius:4,height:8},refs:[]};
  await kernel.rebuild({version:1,features:[source],imports:{}});
  const row=topCircle(kernel.shapes.get('source'));
  const document={version:1,features:[source,{id:'rounded',op:'rounding',params:request([row.edgeId],.3),refs:['source']}],imports:{}};
  const first=await kernel.rebuild(document);assert.equal(first.bodies[0].solidCount,1);
  const before=kernel.measure('rounded','body').volume;
  document.features[1].params=normalizeOperationPatch('rounding',document.features[1].params,{sizeMm:.6});
  await kernel.rebuild(document);const expected=kernel.measure('rounded','body').volume;assert(expected<before);
  reopened=new CadKernel(oc);await reopened.rebuild(JSON.parse(JSON.stringify(document)));
  assert(Math.abs(reopened.measure('rounded','body').volume-expected)<1e-7);
  const exact=reopened.shapes.get('rounded'),restored=cad.deserializeShape(exact.serialize());
  try{assert(Math.abs(cad.measureVolume(exact)-cad.measureVolume(restored))<1e-7);}finally{dispose(restored);}
 }finally{reopened?.dispose();kernel.dispose();}
});
