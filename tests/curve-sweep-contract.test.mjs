import test from 'node:test';
import assert from 'node:assert/strict';
import {getOperation,validateOperationExample} from '../src/operation-registry.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
const points=[[20,0,0],[Math.SQRT2*10,Math.SQRT2*10,0],[0,20,0]];
test('round sweep missing radius is a parameter error at the exact field, not a kernel failure',()=>{
 const original={pathType:'arc',points,section:'round',sectionSize:2.5};
 assert.throws(()=>validateOperationExample('curveSweep',original),error=>error.code==='PARAM_SCHEMA_INVALID'&&error.path==='params.radius'&&error.message.includes('sectionSize'));
 assert.throws(()=>validateSchema(getOperation('curveSweep').inputSchema,original));
 assert.doesNotThrow(()=>validateOperationExample('curveSweep',{pathType:'arc',points,radius:3}));
 assert.throws(()=>validateOperationExample('curveSweep',{pathType:'arc',points,radius:0}),error=>error.code==='PARAM_RANGE_INVALID');
});
test('round-radius condition does not constrain explicit stations, spine profiles or nonround sections',()=>{
 const schema=getOperation('curveSweep').inputSchema;
 assert.doesNotThrow(()=>validateSchema(schema,{pathType:'sections'}));
 assert.doesNotThrow(()=>validateSchema(schema,{pathType:'spine'}));
 assert.doesNotThrow(()=>validateSchema(schema,{pathType:'arc',points,section:'chamferedSquare',sectionSize:2,sectionChamfer:.2}));
 assert.match(schema.properties.radius.description,/Required/);
});


test('spine law sampling is a public budgeted contract, not an ignored shaping promise',()=>{
 const base={pathType:'spine',spine:{pointsMm:[[0,0,0],[30,0,0]]},stations:{count:3},widthLaw:{kind:'spline',samples:[[0,3.5],[.17,11],[.4,6],[1,2]]},depthLaw:3};
 for(const lawSampling of [undefined,'stations'])assert.doesNotThrow(()=>validateOperationExample('curveSweep',{...base,...(lawSampling?{lawSampling}:{})}));
 assert.throws(()=>validateOperationExample('curveSweep',{...base,lawSampling:'preserveKnots'}),e=>e.code==='PARAM_SCHEMA_INVALID'&&e.path==='params.stations.count'&&/4/.test(e.message));
 assert.doesNotThrow(()=>validateOperationExample('curveSweep',{...base,stations:{count:4},lawSampling:'preserveKnots'}));
 assert.throws(()=>validateOperationExample('curveSweep',{...base,lawSampling:'automatic'}),e=>e.code==='PARAM_SCHEMA_INVALID');
 assert.throws(()=>validateOperationExample('curveSweep',{pathType:'arc',points,radius:3,lawSampling:'preserveKnots'}),e=>e.code==='PARAM_SCHEMA_INVALID'&&e.path==='params.lawSampling');
 for(const count of [1,65])assert.throws(()=>validateOperationExample('curveSweep',{...base,stations:{count},lawSampling:'preserveKnots'}));
});
