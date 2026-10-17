import test from 'node:test';
import assert from 'node:assert/strict';
import {floorGridZ} from '../src/floor-grid.js';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('ground grid stays below the lowest committed body and preserves world ground',()=>{
  assert.equal(floorGridZ([]),-0.01);
  assert.ok(Math.abs(floorGridZ([{bounds:{min:[0,0,-5.78]}},{bounds:{min:[0,0,-6.986]}}])+6.996)<1e-10);
  assert.equal(floorGridZ([{bounds:{min:[0,0,2]}}]),-0.01);
});

test('invalid or incomplete body bounds do not poison the grid position',()=>{
  assert.equal(floorGridZ([{}, {bounds:{min:[0,0,NaN]}}]),-0.01);
});

test('落地 command saves dynamic bounds alignment rather than a measured fixed shift',()=>{
  assert.match(main,/const dz=-body\.bounds\.min\[2\]/);
  assert.match(main,/addFeature\('transform',\{align:\{axis:'z',to:'min',valueMm:0\}\}/);
});
