import test from 'node:test';
import assert from 'node:assert/strict';
import { assertHistoryEditSafe } from '../src/history-edit-safety.js';
import { getOperation } from '../src/operation-registry.js';

const document=()=>({features:[
  {id:'a',op:'box',params:{width:10,depth:10,height:2},refs:[]},
  {id:'b',op:'box',params:{width:5,depth:5,height:2},refs:[]},
  {id:'bhole',op:'hole',params:{radius:1,depth:2},refs:['b']},
  {id:'bround',op:'fillet',params:{radius:0.2,edgeIds:[1]},refs:['bhole']},
]});

test('unrelated topology on a separate part does not freeze edits or placement',()=>{
  const old=document(),next=structuredClone(old);next.features[0].params.width=12;
  assert.doesNotThrow(()=>assertHistoryEditSafe(old,next));
  next.features[0].placement={frameSnapshot:{origin:[0,0,2],quaternion:[0,0,0,1]}};
  assert.doesNotThrow(()=>assertHistoryEditSafe(old,next));assert.equal(old.features[0].params.width,10);
});

test('transitive indexed descendants return the actual affected features and leave input intact',()=>{
  const old=document(),next=structuredClone(old);next.features[1].params.width=6;
  const snapshot=structuredClone(next);
  assert.throws(()=>assertHistoryEditSafe(old,next),error=>{
    assert.equal(error.code,'UNSAFE_LEGACY_REFERENCE');assert.equal(error.featureId,'b');
    assert.deepEqual(error.affectedFeatureIds,['bround']);assert.equal(error.recoveryAction,'RESELECT_TOPOLOGY');return true;
  });assert.deepEqual(next,snapshot);
});

test('placement changes use the same guard; rename, no-op and own radius edit do not invalidate source selectors',()=>{
  const old=document(),next=structuredClone(old);next.features[1].placement={frameSnapshot:{origin:[1,0,0]}};
  assert.throws(()=>assertHistoryEditSafe(old,next),{code:'UNSAFE_LEGACY_REFERENCE'});
  const rename=structuredClone(old);rename.features[1].name='New name';rename.features[3].params.radius=0.3;
  assert.doesNotThrow(()=>assertHistoryEditSafe(old,rename));assert.doesNotThrow(()=>assertHistoryEditSafe(old,old));
});

test('units and exact-input policy are published from the hashed operation contracts',()=>{
  for(const [op,field,unit,kind]of [['box','width','mm','length'],['profileExtrude','distanceMm','mm','length'],['helix','radiusMm','mm','length'],['profileRevolve','angleDeg','deg','angle'],['profileRevolve','axisDirection','1','direction'],['fillet','edgeIds','1','index']]){
    const card=getOperation(op),schema=card.inputSchema.properties[field];
    assert.equal(schema.unit,unit);assert.equal(schema.quantityKind,kind);assert.equal(schema.quantizationPolicy,'none');
    assert.equal(card.numericInputPolicy.explicitValues,'exact');assert.equal(card.numericInputPolicy.displayPreferencesAffectGeometry,false);
  }
});
