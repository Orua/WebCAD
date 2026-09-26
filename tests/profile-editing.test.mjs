import test from 'node:test';
import assert from 'node:assert/strict';
import {profileIntersections,editProfileEndpoint,filletProfileLines,trimProfileCircle} from '../src/profile-editing.js';

const base={profileVersion:1,output:'face',entities:[
  {id:'a',type:'line',startMm:[0,0],endMm:[40,0]},
  {id:'b',type:'line',startMm:[40,0],endMm:[40,30]},
  {id:'c',type:'line',startMm:[40,30],endMm:[0,30]},
  {id:'d',type:'line',startMm:[0,30],endMm:[0,0]},
],loops:[{id:'outer',edges:['a','b','c','d'].map(entityId=>({entityId,reversed:false}))}],chains:[],regions:[{id:'r',outerLoopId:'outer',holeLoopIds:[]}]};

test('two-line fillet keeps old IDs and inserts a tangent arc',()=>{
  const result=filletProfileLines(base,{firstId:'a',secondId:'b',radiusMm:2,arcId:'corner'});
  assert.deepEqual(base.entities[0].endMm,[40,0]);
  assert.deepEqual(result.entities[0].endMm,[38,0]);
  assert.ok(Math.hypot(result.entities[1].startMm[0]-40,result.entities[1].startMm[1]-2)<1e-9);
  assert.deepEqual(result.loops[0].edges.map(e=>e.entityId),['a','corner','b','c','d']);
  assert.equal(result.entities.at(-1).type,'arc3');
  assert.throws(()=>filletProfileLines(base,{firstId:'a',secondId:'b',radiusMm:31,arcId:'bad'}),/超过/);
});

test('line-circle intersections and explicit endpoint trim',()=>{
  const circle={id:'target',type:'circle',centerMm:[5,0],diameterMm:4};
  const line={id:'source',type:'line',startMm:[0,0],endMm:[10,0]};
  const intersections=profileIntersections(line,circle);
  assert.deepEqual(intersections.map(c=>c.point),[[3,0],[7,0]]);
  const wire={profileVersion:1,output:'wire',entities:[line,circle],loops:[],chains:[{id:'chain',edges:[{entityId:'source',reversed:false}]}],regions:[]};
  const trimmed=editProfileEndpoint(wire,{mode:'trim',entityId:'source',targetId:'target',candidateId:'intersection-2',end:'end'});
  assert.deepEqual(trimmed.entities[0].endMm,[7,0]);
  assert.deepEqual(wire.entities[0].endMm,[10,0]);
  assert.throws(()=>editProfileEndpoint(wire,{mode:'extend',entityId:'source',targetId:'target',candidateId:'intersection-2',end:'end'}),/不会延伸/);
});
test('finite line targets and two explicit circle crossings do not choose random trim intervals',()=>{
  const circle={id:'circle',type:'circle',centerMm:[0,0],diameterMm:10},line={id:'line',type:'line',startMm:[-10,0],endMm:[10,0]};
  assert.deepEqual(profileIntersections(line,{id:'vertical',type:'line',startMm:[2,-2],endMm:[2,2]})[0].point,[2,0]);
  assert.equal(profileIntersections(line,{id:'miss',type:'line',startMm:[2,1],endMm:[2,2]}).length,0);
  const profile={profileVersion:1,output:'wire',entities:[circle,{...line,construction:true}],loops:[],chains:[{id:'path',edges:[{entityId:'circle',reversed:false}]}],regions:[]};
  const trimmed=trimProfileCircle(profile,{entityId:'circle',targetId:'line',startCandidateId:'intersection-1',endCandidateId:'intersection-2',keepSide:'ccw'});
  assert.equal(trimmed.entities[0].type,'arc3');assert.equal(trimmed.entities[0].id,'circle');assert.ok(Math.abs(Math.hypot(...trimmed.entities[0].midMm)-5)<1e-8);
  assert.throws(()=>trimProfileCircle(profile,{entityId:'circle',targetId:'line',startCandidateId:'intersection-1',endCandidateId:'intersection-1'}),/两个不同/);
});
