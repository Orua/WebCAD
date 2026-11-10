import test from 'node:test';
import assert from 'node:assert/strict';
import {chainSectionEdges,sectionSampleParameters,PLANE_SECTION_RESULTS} from '../src/reference-curves.js';
import {slimQueryItems} from '../src/command-service.js';
import {referenceOperations} from '../src/reference-tool-fields.js';

test('section edges chain into one closed loop regardless of order and direction',()=>{
  const square=[[0,0,0],[1,0,0],[1,1,0],[0,1,0]];
  const items=square.map((p,i)=>({edge:i,start:p,end:square[(i+1)%4]}));
  const shuffled=[items[2],{...items[0],start:items[0].end,end:items[0].start},items[3],items[1]];
  const chains=chainSectionEdges(shuffled,1e-6);
  assert.equal(chains.length,1);assert.equal(chains[0].closed,true);assert.equal(chains[0].items.length,4);
  const open=chainSectionEdges([{edge:0,start:[0,0,0],end:[1,0,0]},{edge:1,start:[5,5,5],end:[6,5,5]}],1e-6);
  assert.equal(open.length,2);assert.ok(open.every(c=>!c.closed));
});

test('polyline sample budget follows edge length',()=>{
  assert.deepEqual(sectionSampleParameters([1,3],8),[2,6]);
  assert.ok(sectionSampleParameters([0.0001,10],8)[0]>=1);
});

test('planeSection schema keeps edges as the compatible default',()=>{
  assert.deepEqual(PLANE_SECTION_RESULTS,['edges','wire','polyline']);
  const props=referenceOperations.planeSection.paramsSchema.properties;
  assert.equal(props.result.default,'edges');assert.equal(props.samples.maximum,512);
});

test('queryGeometry projection drops spline summary and unlisted fields only',()=>{
  const items=[{kind:'edge',topologyId:3,edgeId:3,startPoint:[0,0,0],endPoint:[1,0,0],lengthMm:1,spline:{degree:3,poleCount:70,knotCount:9}}];
  assert.deepEqual(slimQueryItems(items,undefined,true),items);
  assert.deepEqual(slimQueryItems(items,undefined,false)[0],{kind:'edge',topologyId:3,edgeId:3,startPoint:[0,0,0],endPoint:[1,0,0],lengthMm:1,poleCount:70});
  assert.deepEqual(slimQueryItems(items,['startPoint','endPoint'],false)[0],{kind:'edge',topologyId:3,startPoint:[0,0,0],endPoint:[1,0,0]});
});
