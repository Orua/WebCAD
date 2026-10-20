import test from 'node:test';
import assert from 'node:assert/strict';
import {logoDXF} from '../src/logo-dxf.js';
import {parseDxf} from '../src/vector-import.js';

test('LOGO DXF round-trips every millimetre coordinate and closed hole without fitting',()=>{
  const logo={regions:[{outer:[[0,0],[50,0],[50,2.2421524659709315],[0,2.2421524659709315]],holes:[[[10,.2],[11,.2],[11,1],[10,1]]]}],source:{reviewed:false}},before=structuredClone(logo);
  const text=logoDXF(logo),entities=parseDxf(text);
  assert.match(text,/\$INSUNITS\r\n70\r\n4/);assert.match(text,/reviewRequired=true/);
  assert.equal(entities.length,2);assert.ok(entities.every(e=>e.type==='LWPOLYLINE'&&e.closed));
  assert.deepEqual(entities[0].vertices.map(p=>[p.x,p.y]),logo.regions[0].outer);
  assert.deepEqual(entities[1].vertices.map(p=>[p.x,p.y]),logo.regions[0].holes[0]);
  assert.deepEqual(entities.map(e=>e.layer),['LOGO_OUTER','LOGO_HOLE']);assert.deepEqual(logo,before);
});

test('LOGO export rejects malformed contours instead of silently repairing source geometry',()=>{
  assert.throws(()=>logoDXF({regions:[{outer:[[0,0],[10,10],[0,10],[10,0]],holes:[]}]}));
});
