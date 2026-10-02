import test from 'node:test';
import assert from 'node:assert/strict';
import {getOperation,normalizeOperationParams,normalizeOperationPatch} from '../src/operation-registry.js';
import {adaptUISelection} from '../src/ui-selection-adapter.js';
import {deriveAutomaticPolishingScale} from '../src/modeling/rounding/automatic-polishing.js';

test('automatic polishing needs current edges and no numerical radius',()=>{
  const card=getOperation('rounding');assert.equal(card.version,'3.0.0');
  assert.deepEqual(Object.keys(card.inputSchema.properties),['specVersion','strength','scope']);
  const request={specVersion:3,scope:{kind:'edges',edgeIds:[2]}};
  assert.deepEqual(normalizeOperationParams('rounding',request),{strength:1,...request});
  assert.throws(()=>normalizeOperationParams('rounding',{...request,sizeMm:.2}),error=>error.code==='PARAM_SCHEMA_INVALID');
  for(const strength of [0,-1,1.1])assert.throws(()=>normalizeOperationParams('rounding',{...request,strength}));
  assert.equal(normalizeOperationPatch('rounding',request,{strength:.6}).strength,.6);
});

test('UI defaults to v3 and historical size input remains v2',()=>{
  const selection={bodyId:'part',type:'edge',ids:[2,4]};
  assert.deepEqual(adaptUISelection('rounding',{strength:.5},['part'],selection),
    {specVersion:3,strength:.5,scope:{kind:'edges',edgeIds:[2,4]}});
  assert.deepEqual(adaptUISelection('rounding',{sizeMm:.5},['part'],selection),
    {specVersion:2,sizeMm:.5,scope:{kind:'edges',edgeIds:[2,4]}});
  const old={specVersion:2,sizeMm:.2,scope:{kind:'edges',edgeIds:[2]}};
  assert.deepEqual(normalizeOperationParams('rounding',old),old);
  assert.deepEqual(normalizeOperationPatch('rounding',old,{sizeMm:.3}),{...old,sizeMm:.3});
});

test('source dimensions determine the scale and strength changes its plan',()=>{
  const data={edgeLengthsMm:[20],supportDiagonalsMm:[10,20],bodyDimensionsMm:[8,8,12]};
  const full=deriveAutomaticPolishingScale(data),half=deriveAutomaticPolishingScale({...data,strength:.5});
  assert.equal(full.constructionScaleMm,.8);assert.equal(half.constructionScaleMm,.4);
  assert.equal(full.method,'source-edge-length-support-bounds-and-body-thickness');
  assert.throws(()=>deriveAutomaticPolishingScale({...data,edgeLengthsMm:[NaN]}));
  assert.throws(()=>deriveAutomaticPolishingScale({...data,strength:0}));
});
