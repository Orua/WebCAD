import test from 'node:test';
import assert from 'node:assert/strict';
import {fitProfilePoints} from '../src/profile-fitting.js';

test('circle candidate recovers offset radius and reports supplied threshold separately',()=>{
  const points=Array.from({length:9},(_,i)=>{const t=i*Math.PI/4;return [12+5*Math.cos(t),-3+5*Math.sin(t)];});
  const fit=fitProfilePoints({kind:'circle',plane:'XY',points,maxResidualMm:0.001});
  assert(Math.abs(fit.model.center[0]-12)<1e-10);
  assert(Math.abs(fit.model.center[1]+3)<1e-10);
  assert(Math.abs(fit.model.radiusMm-5)<1e-10);
  assert(Math.abs(fit.model.sampledSweepDeg-360)<1e-8);
  assert.equal(fit.withinLimit,true);
  assert.equal(fit.source,'provided-sample-points');
});

test('line fit uses orthogonal residuals and rejects degenerate circle data',()=>{
  const line=fitProfilePoints({kind:'line',plane:'XZ',points:[[0,1],[1,3],[2,5],[3,7]]});
  assert(line.residual.maxMm<1e-10);
  assert(Math.abs(line.model.lengthMm-Math.hypot(3,6))<1e-10);
  assert.throws(()=>fitProfilePoints({kind:'circle',points:[[0,0],[1,0],[2,0],[3,0]]}),{code:'FIT_DEGENERATE'});
});
