import test from 'node:test';
import assert from 'node:assert/strict';
import {getOperation} from '../src/operation-registry.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {legacyReliefParams} from '../src/relief-param-migration.js';
import {reliefOperations} from '../src/modeling/manufacturing/relief-contracts.js';
import {assertPatternExecution} from '../src/machining-intent.js';

test('declared layered relief survives public canonical fields and Worker legacy validation',()=>{
  const params={faceId:0,sizeXMm:46,sizeYMm:46,reliefHeightMm:.7,schemaVersion:2,mode:'emboss',
    layers:[{name:'lotus',reliefHeightMm:.25,regions:[{outer:[[-.4,-.4],[.4,-.4],[0,.4]],holes:[]}]}],
    machiningIntent:{version:1,requestedGeometry:'layeredRelief',sourceInterpretation:'reviewedVectors',userIntentEvidence:'Continue the user-authorized original layered design on the existing plate',specifiedDepthsMm:[.25],dimensionsMm:{width:46,height:46},direction:'emboss'}};
  const before=structuredClone(params);
  assert.doesNotThrow(()=>assertPatternExecution('relief',params,{required:true}));
  validateSchema(getOperation('relief').inputSchema,params);
  const runtime=legacyReliefParams('relief',params);
  assert.doesNotThrow(()=>validateSchema(reliefOperations.relief.paramsSchema,runtime));
  assert.deepEqual(runtime.machiningIntent,params.machiningIntent);assert.deepEqual(params,before);
  assert.throws(()=>validateSchema(reliefOperations.relief.paramsSchema,{...runtime,machiningIntent:{...runtime.machiningIntent,unknown:true}}),{code:'PARAM_SCHEMA_INVALID'});
  assert.throws(()=>validateSchema(reliefOperations.relief.paramsSchema,{...runtime,unknown:true}),{code:'PARAM_SCHEMA_INVALID'});
});
