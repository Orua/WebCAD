import test from 'node:test';
import assert from 'node:assert/strict';
import {solveProfileConstraints,prepareConstraintProfile} from '../src/modeling/profiles/profile-constraints.js';
import {constraintsSchema,profileConstraintOperations} from '../src/modeling/profiles/profile-constraint-contracts.js';
import {validateProfile} from '../src/modeling/profiles/profile-model.js';

const near=(actual,expected,tolerance=2e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const point=(entityId,name)=>({entityId,point:name});
const line=(id,startMm,endMm)=>({id,type:'line',startMm,endMm});
const circle=(id,centerMm,diameterMm)=>({id,type:'circle',centerMm,diameterMm});
const wire=entities=>({profileVersion:1,output:'wire',entities,loops:[],chains:entities.map(entity=>({id:`path_${entity.id}`,edges:[{entityId:entity.id,reversed:false}]})),regions:[]});
const rectangle=()=>({profileVersion:1,output:'face',source:{assetId:'original',reviewed:true},entities:[line('bottom',[0,0],[30,1]),line('right',[30,1],[31,20]),line('top',[31,20],[1,21]),line('left',[1,21],[0,0])],loops:[{id:'outer',edges:['bottom','right','top','left'].map(entityId=>({entityId,reversed:false}))}],chains:[],regions:[{id:'r',outerLoopId:'outer',holeLoopIds:[]}]});
const rectangleConstraints=(width=40,height=25)=>[
  {type:'fixPoint',point:point('bottom','start'),positionMm:[0,0]},
  {type:'horizontal',entityId:'bottom'}, {type:'vertical',entityId:'right'},
  {type:'horizontal',entityId:'top'}, {type:'vertical',entityId:'left'},
  {type:'length',entityId:'bottom',lengthMm:width}, {type:'length',entityId:'right',lengthMm:height},
];

test('dimensions drive a closed rectangle without changing IDs, paths, regions or source',()=>{
  const source=rectangle(),before=structuredClone(source),constraints=rectangleConstraints(),originalConstraints=structuredClone(constraints);
  const result=solveProfileConstraints(source,constraints);
  assert.equal(result.status,'solved',JSON.stringify(result));assert.equal(result.success,true);validateProfile(result.profile);
  assert.equal(result.diagnostics.variableCount,8);assert.equal(result.diagnostics.rank,8);assert.equal(result.diagnostics.degreesOfFreedom,0);assert.equal(result.diagnostics.underconstrained,false);
  near(result.profile.entities[0].startMm[0],0);near(result.profile.entities[0].startMm[1],0);near(result.profile.entities[0].endMm[0],40);near(result.profile.entities[0].endMm[1],0);
  near(result.profile.entities[1].endMm[0],40);near(result.profile.entities[1].endMm[1],25);
  assert.deepEqual(result.profile.loops,source.loops);assert.deepEqual(result.profile.regions,source.regions);assert.deepEqual(result.profile.source,source.source);
  assert.deepEqual(result.profile.entities.map(e=>e.id),source.entities.map(e=>e.id));assert.deepEqual(source,before);assert.deepEqual(constraints,originalConstraints);
  const resized=solveProfileConstraints(result.profile,rectangleConstraints(55,12));assert.equal(resized.success,true);near(resized.profile.entities[0].endMm[0],55);near(resized.profile.entities[1].endMm[1],12);
});

test('default rectangle primitive explicitly derives edges and retains rectangular shape on subsequent solves without secretly fixing its origin',()=>{
  const source={profileVersion:1,output:'face',entities:[{id:'base',type:'rectangle',originMm:[5,7],widthMm:30,heightMm:20}],loops:[{id:'outer',edges:[{entityId:'base',reversed:false}]}],chains:[],regions:[{id:'r',outerLoopId:'outer',holeLoopIds:[]}]},before=structuredClone(source);
  const prepared=prepareConstraintProfile(source);assert.deepEqual(prepared.primitiveConversion,[{sourceId:'base',sourceType:'rectangle',entityIds:['base_0','base_1','base_2','base_3']}]);
  const result=solveProfileConstraints(source,[{type:'length',entityId:'base_0',lengthMm:40}]);
  assert.equal(result.success,true,JSON.stringify(result));assert.equal(result.diagnostics.degreesOfFreedom,3);assert.equal(result.intrinsicConstraints.length,4);assert.equal(result.diagnostics.constraintResiduals.filter(item=>item.origin==='intrinsic').length,4);
  assert.deepEqual(result.profile.loops[0].edges.map(item=>item.entityId),['base_0','base_1','base_2','base_3']);
  near(Math.hypot(...result.profile.entities[2].endMm.map((v,i)=>v-result.profile.entities[2].startMm[i])),40);
  const next=solveProfileConstraints(result.profile,[{type:'length',entityId:'base_0',lengthMm:55},{type:'length',entityId:'base_1',lengthMm:25}]);
  assert.equal(next.success,true,JSON.stringify(next));assert.equal(next.diagnostics.degreesOfFreedom,2);assert.equal(next.intrinsicConstraints.length,4);assert.deepEqual(next.primitiveConversion,result.primitiveConversion);
  near(next.profile.entities[0].endMm[0]-next.profile.entities[0].startMm[0],55);near(next.profile.entities[1].endMm[1]-next.profile.entities[1].startMm[1],25);assert.deepEqual(source,before);
  // Explicit locations can move the primitive origin because it is not pinned.
  const relocated=solveProfileConstraints(next.profile,[{type:'length',entityId:'base_0',lengthMm:55},{type:'length',entityId:'base_1',lengthMm:25},{type:'fixPoint',point:point('base_0','start'),positionMm:[100,200]}]);
  assert.equal(relocated.success,true,JSON.stringify(relocated));near(relocated.profile.entities[0].startMm[0],100);near(relocated.profile.entities[0].startMm[1],200);assert.equal(relocated.diagnostics.degreesOfFreedom,0);
});

test('free and underconstrained states report numerical rank and remaining degrees of freedom',()=>{
  const source=wire([line('a',[0,0],[10,2])]);
  const free=solveProfileConstraints(source,[]);assert.equal(free.success,true);assert.equal(free.diagnostics.degreesOfFreedom,4);assert.equal(free.diagnostics.rank,0);
  const partial=solveProfileConstraints(source,[{type:'horizontal',entityId:'a'},{type:'length',entityId:'a',lengthMm:12}]);
  assert.equal(partial.success,true,JSON.stringify(partial));assert.equal(partial.diagnostics.rank,2);assert.equal(partial.diagnostics.degreesOfFreedom,2);assert.equal(partial.diagnostics.underconstrained,true);
  near(partial.profile.entities[0].endMm[1]-partial.profile.entities[0].startMm[1],0);
});

test('conflicting lengths fail explicitly and return no commit-ready profile',()=>{
  const source=wire([line('a',[0,0],[10,0])]),before=structuredClone(source);
  const result=solveProfileConstraints(source,[{id:'ten',type:'length',entityId:'a',lengthMm:10},{id:'twenty',type:'length',entityId:'a',lengthMm:20}]);
  assert.equal(result.status,'failed');assert.equal(result.error.code,'PROFILE_CONSTRAINT_UNSATISFIED');assert.equal(result.profile,undefined);
  assert.ok(result.diagnostics.maxResidualMm>1);assert.ok(result.diagnostics.unsatisfiedConstraintIds.length);assert.deepEqual(source,before);
  const bounded=solveProfileConstraints(rectangle(),rectangleConstraints(100,60),{maxIterations:1});assert.equal(bounded.success,false);assert.equal(bounded.profile,undefined);
});

test('circle radius/diameter and finite-side line tangency solve with fixed centers',()=>{
  const source=wire([line('base',[-20,0],[20,0]),circle('c',[2,7],6)]);
  const result=solveProfileConstraints(source,[{type:'fixEntity',entityId:'base'},{type:'fixPoint',point:point('c','center'),positionMm:[2,5]},{type:'radius',entityId:'c',radiusMm:5},{type:'tangent',lineId:'base',circleId:'c',side:'left'}]);
  assert.equal(result.success,true,JSON.stringify(result));near(result.profile.entities[1].centerMm[1],5);near(result.profile.entities[1].diameterMm,10);assert.equal(result.diagnostics.degreesOfFreedom,0);
  const right=solveProfileConstraints(source,[{type:'fixEntity',entityId:'base'},{type:'distance',first:point('base','start'),second:point('c','center'),axis:'x',distanceMm:22},{type:'diameter',entityId:'c',diameterMm:8},{type:'tangent',lineId:'base',circleId:'c',side:'right'}]);
  assert.equal(right.success,true,JSON.stringify(right));near(right.profile.entities[1].centerMm[1],-4);near(right.profile.entities[1].diameterMm,8);
});

test('parallel, perpendicular, equal length, angle and signed distances use actual line vectors',()=>{
  const source=wire([line('a',[0,0],[10,0]),line('b',[20,0],[24,8]),line('c',[0,15],[5,19])]);
  const result=solveProfileConstraints(source,[{type:'fixEntity',entityId:'a'},{type:'fixPoint',point:point('b','start'),positionMm:[20,0]},{type:'perpendicular',firstId:'a',secondId:'b'},{type:'equalLength',firstId:'a',secondId:'b'},{type:'fixPoint',point:point('c','start'),positionMm:[0,15]},{type:'angle',firstId:'a',secondId:'c',angleDeg:30},{type:'length',entityId:'c',lengthMm:10}]);
  assert.equal(result.success,true,JSON.stringify(result));near(result.profile.entities[1].endMm[0],20);near(result.profile.entities[1].endMm[1],10);near(result.profile.entities[2].endMm[0],10*Math.cos(Math.PI/6));near(result.profile.entities[2].endMm[1],20);
  const parallel=solveProfileConstraints(source,[{type:'fixEntity',entityId:'a'},{type:'parallel',firstId:'a',secondId:'b'},{type:'equalLength',firstId:'a',secondId:'b'},{type:'distance',first:point('a','start'),second:point('b','start'),axis:'y',distanceMm:-3}]);
  assert.equal(parallel.success,true,JSON.stringify(parallel));near(parallel.profile.entities[1].startMm[1],-3);near(parallel.profile.entities[1].endMm[1],-3);
});

test('coincident, point distance and equal radius handle independent entities and share path endpoints',()=>{
  const source=wire([line('a',[0,0],[10,0]),line('b',[12,2],[18,4]),circle('c',[0,20],4),circle('d',[10,20],8)]);
  const result=solveProfileConstraints(source,[{type:'fixEntity',entityId:'a'},{type:'coincident',first:point('a','end'),second:point('b','start')},{type:'distance',first:point('b','start'),second:point('b','end'),distanceMm:6},{type:'radius',entityId:'c',radiusMm:3},{type:'equalRadius',firstId:'c',secondId:'d'}]);
  assert.equal(result.success,true,JSON.stringify(result));near(result.profile.entities[1].startMm[0],10);near(result.profile.entities[1].startMm[1],0);near(Math.hypot(...result.profile.entities[1].endMm.map((v,i)=>v-result.profile.entities[1].startMm[i])),6);near(result.profile.entities[2].diameterMm,6);near(result.profile.entities[3].diameterMm,6);
  const continuous=wire([line('a',[0,0],[10,0]),line('b',[10,0],[10,10])]);continuous.chains=[{id:'joined',edges:[{entityId:'a',reversed:false},{entityId:'b',reversed:false}]}];
  const connected=solveProfileConstraints(continuous,[{type:'fixPoint',point:point('a','start'),positionMm:[0,0]},{type:'horizontal',entityId:'a'},{type:'vertical',entityId:'b'},{type:'length',entityId:'a',lengthMm:20},{type:'length',entityId:'b',lengthMm:15}]);
  assert.equal(connected.success,true);assert.deepEqual(connected.profile.entities[0].endMm,connected.profile.entities[1].startMm);validateProfile(connected.profile);
});

test('redundant consistent constraints are reported separately from conflict',()=>{
  const result=solveProfileConstraints(rectangle(),[...rectangleConstraints(),{type:'length',entityId:'top',lengthMm:40}]);
  assert.equal(result.success,true,JSON.stringify(result));assert.equal(result.diagnostics.rank,8);assert.equal(result.diagnostics.redundantEquationCount,1);assert.equal(result.diagnostics.degreesOfFreedom,0);
});

test('initially perpendicular parallel constraints and initially parallel perpendicular constraints do not stall at a folded residual cusp',()=>{
  const source=wire([line('a',[0,0],[10,0]),line('b',[20,0],[20,10])]);
  for(const [type,initial,end] of [['parallel',source,[30,0]],['perpendicular',wire([line('a',[0,0],[10,0]),line('b',[20,0],[30,0])]),[20,10]]]) {
    const result=solveProfileConstraints(initial,[{type:'fixEntity',entityId:'a'},{type:'fixPoint',point:point('b','start'),positionMm:[20,0]},{type,firstId:'a',secondId:'b'},{type:'equalLength',firstId:'a',secondId:'b'}]);
    assert.equal(result.success,true,JSON.stringify(result));near(result.profile.entities[1].endMm[0],end[0]);near(result.profile.entities[1].endMm[1],end[1]);
    assert.equal(result.diagnostics.rank,8);assert.equal(result.diagnostics.degreesOfFreedom,0);
  }
});

test('zero length demanded by incompatible axis constraints and resource limits never return usable geometry',()=>{
  const source=wire([line('a',[0,0],[10,4])]),before=structuredClone(source);
  const collapsed=solveProfileConstraints(source,[{type:'horizontal',entityId:'a'},{type:'vertical',entityId:'a'}]);
  assert.equal(collapsed.success,false,JSON.stringify(collapsed));assert.equal(collapsed.profile,undefined);assert.deepEqual(source,before);
  const tooMany=wire(Array.from({length:33},(_,i)=>line(`line_${i}`,[0,i*2],[10,i*2])));
  const bounded=solveProfileConstraints(tooMany,[]);assert.equal(bounded.success,false);assert.equal(bounded.error.code,'PROFILE_CONSTRAINT_LIMIT');
});

test('unsupported, malformed, unsafe bounds and invalid resulting regions are explicit failures',()=>{
  const source=wire([line('a',[0,0],[10,0]),circle('c',[0,5],4)]);
  for(const constraints of [[{type:'length',entityId:'missing',lengthMm:3}],[{type:'radius',entityId:'a',radiusMm:2}],[{type:'fixPoint',point:point('c','start'),positionMm:[0,0]}],[{type:'length',entityId:'a',lengthMm:NaN}],[{type:'length',entityId:'a',lengthMm:2,extra:true}],[{type:'distance',first:point('a','start'),second:point('a','end'),distanceMm:-1}],[{type:'tangent',lineId:'a',circleId:'c',side:'up'}]]) {
    const result=solveProfileConstraints(source,constraints);assert.equal(result.success,false);assert.equal(result.profile,undefined);assert.ok(result.error.code);
  }
  const arc=wire([{id:'arc',type:'arc3',startMm:[0,0],midMm:[2,3],endMm:[4,0]}]);assert.equal(solveProfileConstraints(arc,[]).error.code,'PROFILE_CONSTRAINT_UNSUPPORTED');
  assert.equal(solveProfileConstraints(source,[],{maxIterations:201}).success,false);
  const target={profileVersion:1,output:'face',entities:[circle('outer',[0,0],20),circle('hole',[0,0],4)],loops:[{id:'outside',edges:[{entityId:'outer',reversed:false}]},{id:'inside',edges:[{entityId:'hole',reversed:false}]}],chains:[],regions:[{id:'r',outerLoopId:'outside',holeLoopIds:['inside']}]};
  const invalid=solveProfileConstraints(target,[{type:'fixEntity',entityId:'outer'},{type:'fixPoint',point:point('hole','center'),positionMm:[30,0]}]);assert.equal(invalid.success,false);assert.equal(invalid.error.code,'PROFILE_CONSTRAINT_GEOMETRY_INVALID');assert.equal(invalid.profile,undefined);
});

test('large translated coordinates retain tight residuals and serializable discoverable contracts',()=>{
  const source=rectangle();for(const entity of source.entities)for(const field of ['startMm','endMm'])entity[field]=entity[field].map(value=>value+900000);
  const constraints=rectangleConstraints(50,30);constraints[0].positionMm=[900000,900000];
  const result=solveProfileConstraints(source,constraints);assert.equal(result.success,true,JSON.stringify(result));near(result.profile.entities[0].endMm[0],900050);near(result.profile.entities[1].endMm[1],900030);
  assert.deepEqual(JSON.parse(JSON.stringify(constraintsSchema)),constraintsSchema);assert.equal(profileConstraintOperations.profileConstraints.refs,1);
  assert.equal(new Set(constraintsSchema.items.oneOf.map(item=>item.properties.type.const)).size,15);
});

test('clockwise angles, reversed saved chains and short-line tangency preserve meaningful rank',()=>{
  const clockwise=solveProfileConstraints(wire([line('a',[0,0],[10,0]),line('b',[20,0],[24,-8])]),[{type:'fixEntity',entityId:'a'},{type:'fixPoint',point:point('b','start'),positionMm:[20,0]},{type:'length',entityId:'b',lengthMm:10},{type:'angle',firstId:'a',secondId:'b',angleDeg:60,direction:'cw'}]);
  assert.equal(clockwise.success,true,JSON.stringify(clockwise));near(clockwise.profile.entities[1].endMm[0],25);near(clockwise.profile.entities[1].endMm[1],-Math.sqrt(75));assert.equal(clockwise.diagnostics.rank,8);
  const reversed=wire([line('a',[10,0],[0,0]),line('b',[10,0],[10,10])]);reversed.chains=[{id:'joined',edges:[{entityId:'a',reversed:true},{entityId:'b',reversed:false}]}];
  const joined=solveProfileConstraints(reversed,[{type:'fixPoint',point:point('a','end'),positionMm:[0,0]},{type:'horizontal',entityId:'a'},{type:'vertical',entityId:'b'},{type:'length',entityId:'a',lengthMm:20},{type:'length',entityId:'b',lengthMm:15}]);
  assert.equal(joined.success,true,JSON.stringify(joined));assert.deepEqual(joined.profile.entities[0].startMm,joined.profile.entities[1].startMm);validateProfile(joined.profile);
  const tiny=solveProfileConstraints(wire([line('a',[0,0],[1e-6,0]),circle('c',[0,1],2)]),[{type:'tangent',lineId:'a',circleId:'c'}]);
  assert.equal(tiny.success,true,JSON.stringify(tiny));assert.equal(tiny.diagnostics.rank,1);assert.equal(tiny.diagnostics.degreesOfFreedom,6);
});
