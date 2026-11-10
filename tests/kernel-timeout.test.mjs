import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rebuildHardTimeoutMs,kernelRequestTimers,REBUILD_HARD_TIMEOUT} from '../src/kernel-timeout.js';

test('ordinary rebuild gets a terminating deadline above the soft reminder',()=>{
  assert.equal(rebuildHardTimeoutMs(60000),180000);
  assert.equal(rebuildHardTimeoutMs(120000),360000);
  assert.equal(rebuildHardTimeoutMs(600000),REBUILD_HARD_TIMEOUT.maximumMs);
  assert.equal(rebuildHardTimeoutMs(undefined),180000);
  assert.deepEqual(kernelRequestTimers('rebuild',{localTimeoutMs:60000,hardTimeoutMs:180000}),{softMs:60000,startMs:null,hardMs:180000});
  assert.deepEqual(kernelRequestTimers('measure',{localTimeoutMs:60000}),{softMs:60000,startMs:null,hardMs:null});
  assert.deepEqual(kernelRequestTimers('rebuild',{localTimeoutMs:60000,hardTimeoutMs:30000}),{softMs:null,startMs:null,hardMs:30000});
  assert.deepEqual(kernelRequestTimers('ready',{localTimeoutMs:60000}),{softMs:null,startMs:45000,hardMs:null});
});

test('main rebuild passes the hard deadline and restores the committed kernel on timeout',()=>{
  const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/request\('rebuild',\{document:next\},\{hardTimeoutMs:hardTimeoutMs\?\?rebuildHardTimeoutMs\(getServicesConfig\(\)\.localTimeoutMs\)\}\)/);
  assert.match(main,/code:'KERNEL_TIMEOUT',commitState:'not_committed'/);
  assert.match(main,/clearTimeout\(job\.hardTimer\)/);
  assert.match(main,/if\(!committed&&kernelFailure\(error\)\)\{[\s\S]{0,200}restartWorker\(error\)/);
  // Large import keeps its own longer deadline and coarsen retry.
  assert.match(main,/rebuildLargeImport[\s\S]{0,120}Math\.max\(getServicesConfig\(\)\.localTimeoutMs,120000\)/);
});

test('rounding postconditions stay on both mill paths (R6-001 not regressed)',()=>{
  const blend=fs.readFileSync(new URL('../src/edge-blend.js',import.meta.url),'utf8');
  assert.ok((blend.match(/validateRoundingResult\(/g)||[]).length>=3);
});
