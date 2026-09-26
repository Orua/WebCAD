import test from 'node:test';
import assert from 'node:assert/strict';
import {quantizeModelParams,roundToPrecision} from '../src/modeling/interaction/modeling-precision.js';
import {validateDisplayPreferences,DISPLAY_DEFAULTS} from '../src/display-preferences.js';
test('manufacturing increments round dimensions and angles without corrupting ratios or references',()=>{
 assert.equal(roundToPrecision(-0.019325,0.01),-0.02);
 assert.deepEqual(quantizeModelParams({x:1.234,rx:2.2596,width:3.456,scale:1.234567,faceId:13,axisVector:[0.123456,0,1],points:[[1.234,2.345]],origin:[0,0,1.055]}),{x:1.23,rx:2.3,width:3.46,scale:1.234567,faceId:13,axisVector:[0.123456,0,1],points:[[1.23,2.35]],origin:[0,0,1.06]});
 assert.deepEqual(quantizeModelParams({x:1.234,angleDeg:12.34},{dimensionPrecisionMm:0.1,anglePrecisionDeg:1}),{x:1.2,angleDeg:12});
});
test('precision settings are positive finite persisted preferences',()=>{
 assert.equal(DISPLAY_DEFAULTS.dimensionPrecisionMm,0.01);assert.equal(DISPLAY_DEFAULTS.anglePrecisionDeg,0.1);
 assert.deepEqual(validateDisplayPreferences({dimensionPrecisionMm:0.001,anglePrecisionDeg:0.01}),{dimensionPrecisionMm:0.001,anglePrecisionDeg:0.01});
 for(const value of [0,-1,NaN,Infinity])assert.throws(()=>validateDisplayPreferences({dimensionPrecisionMm:value}));
});
