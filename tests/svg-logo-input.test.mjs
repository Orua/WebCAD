import test from 'node:test';
import assert from 'node:assert/strict';
import {closeVectorLoop,curveToVectorEntities,ellipseCurveSweep,svgRootLengthMm} from '../src/svg-logo-input.js';

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


function fakeEllipse({cx=0,cy=0,rx=10,ry=10,start=0,end=Math.PI/2,clockwise=false}={}){
  const curve={isEllipseCurve:true,aX:cx,aY:cy,xRadius:rx,yRadius:ry,aStartAngle:start,aEndAngle:end,aClockwise:clockwise};
  curve.getPoint=function(t){
    const twoPi=2*Math.PI;
    let delta=this.aEndAngle-this.aStartAngle;
    const same=Math.abs(delta)<1e-12;
    while(delta<0)delta+=twoPi;
    while(delta>twoPi)delta-=twoPi;
    if(delta<1e-12)delta=same?0:twoPi;
    if(this.aClockwise===true&&!same)delta=delta===twoPi?-twoPi:delta-twoPi;
    const a=this.aStartAngle+t*delta;
    return {x:this.aX+this.xRadius*Math.cos(a),y:this.aY+this.yRadius*Math.sin(a)};
  };
  return curve;
}
const ident=p=>[...p];
const flipY=p=>[p[0],-p[1]];

test('V-02 circular SVG ellipse curves stay exact arc3 or circle (including Y-flip)',()=>{
  const quarter=curveToVectorEntities(fakeEllipse({start:0,end:Math.PI/2}),ident);
  assert.equal(quarter.length,1);
  assert.equal(quarter[0].type,'arc3');
  assert.ok(Math.abs(quarter[0].startMm[0]-10)<1e-9 && Math.abs(quarter[0].startMm[1])<1e-9);
  assert.ok(Math.abs(quarter[0].endMm[0])<1e-9 && Math.abs(quarter[0].endMm[1]-10)<1e-9);
  const mid=quarter[0].midMm;
  assert.ok(Math.abs(mid[0]-10*Math.SQRT1_2)<1e-6 && Math.abs(mid[1]-10*Math.SQRT1_2)<1e-6);

  const flipped=curveToVectorEntities(fakeEllipse({start:0,end:Math.PI/2}),flipY);
  assert.equal(flipped[0].type,'arc3');
  assert.ok(Math.abs(flipped[0].midMm[1]+10*Math.SQRT1_2)<1e-6);

  const full=curveToVectorEntities(fakeEllipse({start:0,end:2*Math.PI,clockwise:false}),ident);
  assert.equal(full.length,1);
  assert.equal(full[0].type,'circle');
  assert.ok(Math.abs(full[0].diameterMm-20)<1e-6);
  assert.ok(Math.abs(full[0].centerMm[0])<1e-6 && Math.abs(full[0].centerMm[1])<1e-6);

  const nearFull=curveToVectorEntities(fakeEllipse({start:0,end:1e-6,clockwise:true}),ident);
  assert.equal(nearFull.length,1);
  assert.equal(nearFull[0].type,'arc3');
});

test('V-02 non-circular ellipses stay tessellated lines, lines stay lines',()=>{
  const oval=curveToVectorEntities(fakeEllipse({rx:10,ry:4,start:0,end:Math.PI}),ident);
  assert.ok(oval.length>1 && oval.every(e=>e.type==='line'));
  const line=curveToVectorEntities({isLineCurve:true,v1:{x:0,y:0},v2:{x:4,y:0},getPoint:t=>({x:4*t,y:0})},ident);
  assert.deepEqual(line,[{type:'line',startMm:[0,0],endMm:[4,0]}]);
});

test('V-02 open SVG path loops get an explicit closing line',()=>{
  const open=[{type:'line',startMm:[0,0],endMm:[4,0]},{type:'line',startMm:[4,0],endMm:[4,3]}];
  const closed=closeVectorLoop(open);
  assert.equal(closed.length,3);
  assert.deepEqual(closed[2],{type:'line',startMm:[4,3],endMm:[0,0]});
  const already=closeVectorLoop([...open,{type:'line',startMm:[4,3],endMm:[0,0]}]);
  assert.equal(already.length,3);
});
