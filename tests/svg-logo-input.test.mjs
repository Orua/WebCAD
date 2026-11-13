import test from 'node:test';
import assert from 'node:assert/strict';
import {ellipseCurveSweep,svgRootLengthMm} from '../src/svg-logo-input.js';

const twoPi=2*Math.PI;
function fake(start,end,clockwise){return {aStartAngle:start,aEndAngle:end,aClockwise:clockwise};}

test('near-full SVG arcs keep a 2π-class sweep, including clockwise almost-closed cases',()=>{
  assert.ok(Math.abs(ellipseCurveSweep(fake(0,twoPi,false))-twoPi)<1e-9);
  const near=ellipseCurveSweep(fake(0,1e-4,true));
  assert.ok(near>twoPi-1e-3 && near<=twoPi, near);
  const almost=ellipseCurveSweep(fake(0,2*Math.PI-1e-3,true));
  // clockwise from 0 to ~2π is a tiny sweep the other way? three.js: delta almost 2π, clockwise subtracts 2π → tiny.
  // The bug is start≈end with clockwise (large-arc). M10 0 A10 10 0 1 1 9.999 0 → start and end nearly equal.
  const start=0,end=-1e-4; // or end slightly less than start after wrapping
  const large=ellipseCurveSweep(fake(0,1e-6,true));
  assert.ok(large>6, `expected nearly full turn, got ${large}`);
  const quarter=ellipseCurveSweep(fake(0,Math.PI/2,false));
  assert.ok(Math.abs(quarter-Math.PI/2)<1e-9);
  const half=ellipseCurveSweep(fake(0,Math.PI,false));
  assert.ok(Math.abs(half-Math.PI)<1e-9);
  const absOnly=Math.abs(1e-6-0);
  assert.ok(absOnly<1e-4 && large-absOnly>6,'regression: abs(end-start) must not be used as the sweep');
});

test('unitless SVG root lengths defer to targetWidthMm instead of throwing (V-01)',()=>{
  assert.equal(svgRootLengthMm('40',{allowUnitless:true}),null);
  assert.equal(svgRootLengthMm(' 30.5 ',{allowUnitless:true}),null);
  assert.equal(svgRootLengthMm('40mm',{allowUnitless:true}),40);
  assert.equal(svgRootLengthMm('2cm'),20);
  assert.equal(svgRootLengthMm('96px'),25.4);
  assert.throws(()=>svgRootLengthMm('40'),/目标宽度/);
  assert.throws(()=>svgRootLengthMm('40%'),/目标宽度/);
});
