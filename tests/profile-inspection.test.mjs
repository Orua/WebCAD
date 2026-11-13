import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectProfileModel} from '../src/profile-inspection.js';
import {repairProfile} from '../src/profile-repair.js';
import {validateProfile} from '../src/profile-model.js';

test('J4 diagnostic identifies the exact 0.02 mm endpoint gap without mutation',()=>{
  const profile={output:'face',entities:[
    {id:'a',type:'line',startMm:[0,0],endMm:[20,0]},
    {id:'b',type:'line',startMm:[20,0],endMm:[20,10]},
    {id:'c',type:'line',startMm:[20,10],endMm:[0,10]},
    {id:'d',type:'line',startMm:[0,10],endMm:[0,0.02]},
  ],loops:[{id:'outer',edges:['a','b','c','d'].map(entityId=>({entityId,reversed:false}))}],regions:[{id:'r',outerLoopId:'outer',holeLoopIds:[]}]};
  const original=structuredClone(profile),result=inspectProfileModel(profile);
  assert.deepEqual(profile,original);
  assert.equal(result.summary.blockingCount,1);
  assert.equal(result.issues[0].kind,'endpointGap');
  assert.ok(Math.abs(result.issues[0].distanceMm-0.02)<1e-9);
  assert.equal(result.summary.canMakeFace,false);
});

test('J4 explicit endpoint repair accepts 0.03 mm and rejects 0.01 mm without changing source',()=>{
  const source={profileVersion:1,output:'wire',entities:[
    {id:'a',type:'line',startMm:[0,0],endMm:[20,0]},
    {id:'b',type:'line',startMm:[20,0],endMm:[20,10]},
    {id:'c',type:'line',startMm:[20,10],endMm:[0,10]},
    {id:'d',type:'line',startMm:[0,10],endMm:[0,0.02]},
  ],loops:[],chains:[{id:'outline',edges:['a','b','c','d'].map(entityId=>({entityId,reversed:false}))}],regions:[]};
  const copy=structuredClone(source),issue=inspectProfileModel(source).issues.find(item=>item.kind==='closureGap');
  assert.ok(Math.abs(issue.distanceMm-0.02)<1e-9);
  assert.throws(()=>repairProfile(source,{issueId:issue.issueId,maxEndpointMoveMm:0.01}),/超过允许值/);
  const repaired=repairProfile(source,{issueId:issue.issueId,maxEndpointMoveMm:0.03});
  assert.deepEqual(source,copy);
  assert.equal(repaired.profile.output,'face');
  assert.deepEqual(repaired.profile.entities.at(-1).endMm,[0,0]);
  assert.equal(repaired.receipt.actualMoveMm,0.02);
});

test('circle hole outside its outer ring is a blocking diagnostic',()=>{
  const profile={output:'face',entities:[{id:'outer',type:'circle',centerMm:[0,0],diameterMm:20},{id:'hole',type:'circle',centerMm:[9,0],diameterMm:4}],loops:[{id:'outer-loop',edges:[{entityId:'outer',reversed:false}]},{id:'hole-loop',edges:[{entityId:'hole',reversed:false}]}],regions:[{id:'r',outerLoopId:'outer-loop',holeLoopIds:['hole-loop']}]};
  const result=inspectProfileModel(profile);
  assert.equal(result.summary.canMakeFace,false);
  assert.equal(result.issues.find(item=>item.kind==='holeOutside')?.issueId,'region:0:hole:hole-loop');
  assert.throws(()=>validateProfile({profileVersion:1,...profile}),/孔环/);
});

import {expandProfilePrimitives,primitiveEntities} from '../src/profile-primitives.js';

test('valid rounded rectangles at translated origins are not false self-intersections (D-01)',()=>{
  const cases=[
    {originMm:[90,0],widthMm:30,heightMm:20,cornerRadiusMm:4},
    {originMm:[0,0],widthMm:30,heightMm:20,cornerRadiusMm:1},
    {originMm:[12.5,7.25],widthMm:30,heightMm:20,cornerRadiusMm:1},
    {originMm:[1000,1000],widthMm:80,heightMm:50,cornerRadiusMm:8},
    {originMm:[-40,15],widthMm:16,heightMm:16,cornerRadiusMm:3.9},
    {originMm:[1e-4,2e-4],widthMm:10,heightMm:6,cornerRadiusMm:0.5},
  ];
  for(const entity of cases){
    const profile=expandProfilePrimitives({output:'face',entities:[{id:'rr',type:'roundedRectangle',...entity}],loops:[{id:'outer',edges:[{entityId:'rr',reversed:false}]}],regions:[{id:'r',outerLoopId:'outer',holeLoopIds:[]}]});
    const result=inspectProfileModel(profile);
    const crossings=result.issues.filter(item=>item.kind==='selfIntersection');
    assert.equal(crossings.length,0,`${JSON.stringify(entity)} ${JSON.stringify(crossings)}`);
    assert.equal(result.summary.canMakeFace,true,JSON.stringify(entity));
    assert.equal(primitiveEntities({id:'rr',type:'roundedRectangle',...entity}).length,8);
  }
});

test('a mid-curve line/arc crossing still reports self-intersection',()=>{
  const profile={output:'wire',entities:[
    {id:'a',type:'line',startMm:[0,0],endMm:[10,0]},
    {id:'b',type:'arc3',startMm:[5,-4],midMm:[9,0],endMm:[5,4]},
  ],loops:[],chains:[{id:'c',edges:[{entityId:'a',reversed:false},{entityId:'b',reversed:false}]}],regions:[]};
  const result=inspectProfileModel(profile);
  assert.ok(result.issues.some(item=>item.kind==='selfIntersection'));
});
