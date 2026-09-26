import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProfileRecipe,constrainProfileRecipe,freezeEntityConstraints} from '../src/modeling/profiles/profile-constraint-history.js';
const near=(actual,expected,tolerance=2e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
const rectangle=(width=30,height=20)=>({profileVersion:1,output:'face',entities:[{id:'base',type:'rectangle',originMm:[5,7],widthMm:width,heightMm:height}],loops:[{id:'outer',edges:[{entityId:'base',reversed:false}]}],chains:[],regions:[{id:'r',outerLoopId:'outer',holeLoopIds:[]}],source:{name:'read-only source'}});
const feature=(id,op,params,refs=[])=>({id,op,params,refs,placement:{frameSnapshot:{originMm:[3,4,5],quaternion:[0,0,0,1]}}});

test('existing rectangle dimensions and intrinsic shape relations accumulate without changing source recipes',()=>{
  const features=[feature('source','sketchProfile',rectangle()),feature('width','profileConstraints',{constraints:[{type:'length',entityId:'base_0',lengthMm:40}]},['source']),feature('height','profileConstraints',{constraints:[{type:'length',entityId:'base_1',lengthMm:25}]},['width'])],before=structuredClone(features);
  const solved=resolveProfileRecipe(features,'height');
  assert.equal(solved.constraints.length,2);assert.equal(solved.sourceId,'source');assert.equal(solved.intrinsicConstraints.length,4);assert.equal(solved.diagnostics.degreesOfFreedom,2);
  near(solved.profile.entities[0].endMm[0]-solved.profile.entities[0].startMm[0],40);near(solved.profile.entities[1].endMm[1]-solved.profile.entities[1].startMm[1],25);
  assert.deepEqual(features,before);assert.deepEqual(solved.placement,features[0].placement);
  const positioned=constrainProfileRecipe(solved,[{type:'fixPoint',point:{entityId:'base_0',point:'start'},positionMm:[100,200]}]);
  near(positioned.profile.entities[0].startMm[0],100);near(positioned.profile.entities[0].startMm[1],200);assert.equal(positioned.constraints.length,3);assert.equal(positioned.diagnostics.degreesOfFreedom,0);assert.deepEqual(features,before);
  assert.equal(solved.constraints.length,2);assert.ok(solved.constraints.every(item=>!Object.hasOwn(item,'id')));
});

test('fixEntity freezes explicit original point/radius values and preserves user IDs only once',()=>{
  const source={profileVersion:1,output:'wire',entities:[{id:'a',type:'line',startMm:[2,3],endMm:[12,3]},{id:'circle',type:'circle',centerMm:[20,15],diameterMm:8}],loops:[],chains:[{id:'line_path',edges:[{entityId:'a',reversed:false}]},{id:'circle_path',edges:[{entityId:'circle',reversed:false}]}],regions:[]},before=structuredClone(source);
  const frozen=freezeEntityConstraints(source,[{id:'fixed-line',type:'fixEntity',entityId:'a'},{type:'fixEntity',entityId:'circle'}]);
  assert.deepEqual(frozen,[{id:'fixed-line',type:'fixPoint',point:{entityId:'a',point:'start'},positionMm:[2,3]},{type:'fixPoint',point:{entityId:'a',point:'end'},positionMm:[12,3]},{type:'fixPoint',point:{entityId:'circle',point:'center'},positionMm:[20,15]},{type:'radius',entityId:'circle',radiusMm:4}]);assert.deepEqual(source,before);
  const base={profile:source,constraints:[],placement:{},sourceId:'source'},fixed=constrainProfileRecipe(base,[{type:'fixEntity',entityId:'a'}]);
  const moved=structuredClone(fixed);moved.profile.entities[0].startMm=[200,300];moved.profile.entities[0].endMm=[210,300];
  const next=constrainProfileRecipe(moved,[{type:'diameter',entityId:'circle',diameterMm:10}]);
  near(next.profile.entities[0].startMm[0],2);near(next.profile.entities[0].startMm[1],3);near(next.profile.entities[0].endMm[0],12);near(next.profile.entities[1].diameterMm,10);
  assert.deepEqual(next.constraints.slice(0,2),fixed.constraints);assert.deepEqual(source,before);
});

test('changing an unconstrained base dimension recomputes the full chain while driving dimensions remain authoritative',()=>{
  const features=[feature('source','sketchProfile',rectangle()),feature('width','profileConstraints',{constraints:[{type:'length',entityId:'base_0',lengthMm:40}]},['source'])];
  const old=resolveProfileRecipe(features,'width');near(old.profile.entities[1].endMm[1]-old.profile.entities[1].startMm[1],20,1e-3);
  features[0].params.entities[0].heightMm=35;features[0].params.entities[0].widthMm=60;const before=structuredClone(features);
  const rebuilt=resolveProfileRecipe(features,'width');near(rebuilt.profile.entities[0].endMm[0]-rebuilt.profile.entities[0].startMm[0],40);
  // Height is still a free DOF, so only the explicitly constrained width has
  // solver tolerance guarantees. The rebuilt free height follows the changed
  // base within a tighter tolerance than the UI's ordinary 0.01 mm precision.
  near(rebuilt.profile.entities[1].endMm[1]-rebuilt.profile.entities[1].startMm[1],35,1e-3);assert.deepEqual(features,before);
});

test('conflicts fail without mutating history or returning a derived recipe',()=>{
  const features=[feature('source','sketchProfile',rectangle()),feature('width','profileConstraints',{constraints:[{type:'length',entityId:'base_0',lengthMm:40}]},['source']),feature('conflict','profileConstraints',{constraints:[{type:'length',entityId:'base_0',lengthMm:50}]},['width'])],before=structuredClone(features);
  assert.throws(()=>resolveProfileRecipe(features,'conflict'),error=>error.code==='PROFILE_CONSTRAINT_UNSATISFIED'&&error.diagnostics.unsatisfiedConstraintIds.length>0);assert.deepEqual(features,before);
});

test('missing/unsupported sources, invalid refs, cycles and depth bounds reject explicitly',()=>{
  assert.throws(()=>resolveProfileRecipe([], 'missing'),/找不到/);
  assert.throws(()=>resolveProfileRecipe([feature('extrusion','extrude',{height:5})],'extrusion'),/来源须为/);
  assert.throws(()=>resolveProfileRecipe([feature('bad','profileConstraints',{constraints:[]},['one','two'])],'bad'),/来源须为/);
  const cycle=[feature('a','profileConstraints',{constraints:[]},['b']),feature('b','profileConstraints',{constraints:[]},['a'])];assert.throws(()=>resolveProfileRecipe(cycle,'a'),/循环/);
  const deep=[feature('base','sketchProfile',rectangle())];for(let i=0;i<130;i++)deep.push(feature(`step${i}`,'profileConstraints',{constraints:[]},[i?`step${i-1}`:'base']));assert.throws(()=>resolveProfileRecipe(deep,'step129'),/128/);
  const arc={profileVersion:1,output:'wire',entities:[{id:'arc',type:'arc3',startMm:[0,0],midMm:[2,3],endMm:[4,0]}],loops:[],chains:[{id:'p',edges:[{entityId:'arc',reversed:false}]}],regions:[]};
  assert.throws(()=>resolveProfileRecipe([feature('arc','sketchProfile',arc),feature('try','profileConstraints',{constraints:[{type:'length',entityId:'arc',lengthMm:2}]},['arc'])],'try'),error=>error.code==='PROFILE_CONSTRAINT_UNSUPPORTED');
  assert.throws(()=>freezeEntityConstraints(arc,[{type:'fixEntity',entityId:'arc'}]),/直线和圆/);
});
