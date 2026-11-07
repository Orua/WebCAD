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
