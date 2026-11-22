import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {buildProjectedGroove} from '../src/projected-groove.js';
import {measureRegionVolume} from '../src/modeling/inspection/region-volume.js';
import {operationCatalog} from '../src/operation-catalog.js';
import {MODELING_DOCS,MODELING_ROUTES} from '../src/modeling-guidance.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
cad.setOC(oc);
const kernel=new CadKernel(oc);
const f=(id,op,params={},refs=[])=>({id,op,params,refs,name:id});
const run=features=>kernel.rebuild({version:1,features,imports:{},hidden:[]});
const dispose=s=>{try{s?.delete?.();}catch{}};
const faceIdOf=(shape,type)=>{
  const faces=shape.faces;
  try{const id=faces.findIndex(face=>face.geomType===type);assert.ok(id>=0,type);return id;}
  finally{faces.forEach(dispose);}
};
const arcPoints=(radius,z,startDeg,endDeg,count)=>{
  return Array.from({length:count},(_,i)=>{
    const a=(startDeg+(endDeg-startDeg)*i/(count-1))*Math.PI/180;
    return [radius*Math.cos(a),radius*Math.sin(a),z];
  });
};

test('projected groove follows a cylindrical arc and does not cut the chord interior',()=>{
  const stock=cad.makeCylinder(10,20);
  const faceId=faceIdOf(stock,'CYLINDRE');
  const points=arcPoints(10,10,-40,40,9);
  let result;
  try{
    result=buildProjectedGroove(stock,{faceId,pointsMm:points,widthMm:2,depthMm:0.8},cad);
    const report=result.projectedGrooveReport;
    assert.equal(report.method,'surface-normal-spine');
    assert.equal(report.source,'exact-brep-face-projection');
    assert.equal(report.faceGeomType,'CYLINDRE');
    assert.equal(report.penetrationMm,0.8);
    assert.ok(report.stationCount>=9);
    assert.ok(cad.measureVolume(stock)-cad.measureVolume(result)>0.5);
    const surface=measureRegionVolume(result,[8.6,-1.2,9],[10.2,1.2,11],cad);
    const stockSurface=measureRegionVolume(stock,[8.6,-1.2,9],[10.2,1.2,11],cad);
    const chord=measureRegionVolume(result,[7.1,-1.2,9],[8.3,1.2,11],cad);
    const stockChord=measureRegionVolume(stock,[7.1,-1.2,9],[8.3,1.2,11],cad);
    assert.ok(surface.volume<stockSurface.volume-0.2,JSON.stringify({surface:surface.volume,stockSurface:stockSurface.volume}));
    assert.ok(Math.abs(chord.volume-stockChord.volume)<1e-6,JSON.stringify({chord:chord.volume,stockChord:stockChord.volume}));
  }finally{[result,stock].forEach(dispose);}
});

test('projected groove rejects points that miss the selected face',()=>{
  const stock=cad.makeCylinder(10,20);
  const faceId=faceIdOf(stock,'CYLINDRE');
  try{
    assert.throws(()=>buildProjectedGroove(stock,{faceId,pointsMm:[[0,0,10],[0,0,15]],widthMm:2,depthMm:0.8},cad),/距所选面|投影刻槽失败/);
  }finally{dispose(stock);}
});

test('kernel projectedGroove on a cylinder exposes the report and keeps one solid',async()=>{
  const stock=await run([f('cyl','cylinder',{radius:10,height:20})]);
  const side=(await kernel.queryGeometry('cyl','face',{})).items.find(face=>face.geomType==='CYLINDRE');
  assert.ok(side,JSON.stringify((await kernel.queryGeometry('cyl','face',{})).items));
  const stockSurface=kernel.measureRegion('cyl',[8.6,-1.2,9],[10.2,1.2,11]);
  const stockChord=kernel.measureRegion('cyl',[7.1,-1.2,9],[8.3,1.2,11]);
  const points=arcPoints(10,10,-40,40,9);
  const cut=await run([
    f('cyl','cylinder',{radius:10,height:20}),
    f('groove','projectedGroove',{faceId:side.faceId,pointsMm:points,widthMm:2,depthMm:0.8},['cyl'])
  ]);
  assert.equal(cut.stats.solids,1);
  assert.ok(stock.stats.volume-cut.stats.volume>0.5);
  const report=cut.bodies[0].projectedGrooveReport;
  assert.equal(report.method,'surface-normal-spine');
  const surface=kernel.measureRegion(cut.bodies[0].id,[8.6,-1.2,9],[10.2,1.2,11]);
  const chord=kernel.measureRegion(cut.bodies[0].id,[7.1,-1.2,9],[8.3,1.2,11]);
  assert.ok(surface.volume<stockSurface.volume-0.2,JSON.stringify({surface:surface.volume,stock:stockSurface.volume}));
  assert.ok(Math.abs(chord.volume-stockChord.volume)<1e-6,JSON.stringify({chord:chord.volume,stock:stockChord.volume}));
  assert.equal(operationCatalog.operations.projectedGroove.refs,1);
});

test('guidance routes surface-follow queries to the scoped projectedGroove card',()=>{
  const route=MODELING_ROUTES.find(item=>item.id==='modeling.projected-groove');
  assert.ok(route);
  assert.ok(route.keywords.includes('沿面渐浅'));
  assert.deepEqual(route.tools,['projectedGroove','measure']);
  const guide=MODELING_DOCS['api.modeling.methods.projected-groove'];
  for(const term of ['一张面','surface-normal-spine','不是平面','NOT_REVIEWED','kind:"region"','0.1','depthLaw','切入量','完整截面高度','zeroEndDepth','槽宽仍是常数'])assert.ok(guide.includes(term),term);
  const fading=MODELING_DOCS['api.modeling.methods.fading-recess'];
  assert.ok(fading.includes('不是自动曲面投影'));
  assert.ok(fading.includes('projectedGroove'));
  assert.ok(!fading.includes('仍是能力缺口'));
});

test('depthLaw fades actual penetration on a plane and a cylinder',()=>{
  const plate=cad.makeBox([0,0,0],[20,6,8]);
  const topId=(()=>{const faces=plate.faces;try{
    const id=faces.findIndex(face=>{if(face.geomType!=='PLANE')return false;const c=face.center;try{return Math.abs(c.toTuple()[2]-8)<1e-6;}finally{dispose(c);}});
    assert.ok(id>=0,'top face');return id;
  }finally{faces.forEach(dispose);}})();
  let plateCut;
  try{
    plateCut=buildProjectedGroove(plate,{faceId:topId,pointsMm:[[2,3,8],[18,3,8]],widthMm:1,depthLaw:{kind:'spline',samples:[[0,0.8],[1,0.2]]}},cad);
    const report=plateCut.projectedGrooveReport;
    assert.equal(report.variableDepth,true);
    assert.ok(Math.abs(report.startPenetrationMm-0.8)<1e-9);
    assert.ok(Math.abs(report.endPenetrationMm-0.2)<1e-9);
    assert.equal(report.zeroEndDepth.end,false);
    const deep=measureRegionVolume(plateCut,[1,2,7],[3,4,8],cad);
    const shallow=measureRegionVolume(plateCut,[17,2,7],[19,4,8],cad);
    assert.ok(deep.volume<shallow.volume-0.05,JSON.stringify({deep:deep.volume,shallow:shallow.volume}));
  }finally{[plateCut,plate].forEach(dispose);}

  const stock=cad.makeCylinder(10,20);
  const faceId=faceIdOf(stock,'CYLINDRE');
  const points=arcPoints(10,10,-40,40,9);
  let result;
  try{
    result=buildProjectedGroove(stock,{faceId,pointsMm:points,widthMm:2,depthLaw:{kind:'spline',samples:[[0,0.8],[1,0.2]]}},cad);
    const report=result.projectedGrooveReport;
    assert.equal(report.variableDepth,true);
    assert.ok(Math.abs(report.startPenetrationMm-0.8)<1e-9);
    assert.ok(Math.abs(report.endPenetrationMm-0.2)<1e-9);
    const deep=measureRegionVolume(result,[6.8,-7.6,9],[8.6,-5.2,11],cad);
    const shallow=measureRegionVolume(result,[6.8,5.2,9],[8.6,7.6,11],cad);
    const stockDeep=measureRegionVolume(stock,[6.8,-7.6,9],[8.6,-5.2,11],cad);
    const stockShallow=measureRegionVolume(stock,[6.8,5.2,9],[8.6,7.6,11],cad);
    const chord=measureRegionVolume(result,[7.1,-1.2,9],[8.3,1.2,11],cad);
    const stockChord=measureRegionVolume(stock,[7.1,-1.2,9],[8.3,1.2,11],cad);
    const deepLoss=stockDeep.volume-deep.volume,shallowLoss=stockShallow.volume-shallow.volume;
    assert.ok(deepLoss>shallowLoss+0.05,JSON.stringify({deepLoss,shallowLoss,deep:deep.volume,shallow:shallow.volume}));
    assert.ok(Math.abs(chord.volume-stockChord.volume)<1e-6,JSON.stringify({chord:chord.volume,stockChord:stockChord.volume}));
  }finally{[result,stock].forEach(dispose);}
});

test('depthLaw may close a zero tip but rejects a mid-path zero or a missing depth',()=>{
  const plate=cad.makeBox([0,0,0],[20,6,8]);
  const topId=(()=>{const faces=plate.faces;try{
    const id=faces.findIndex(face=>{if(face.geomType!=='PLANE')return false;const c=face.center;try{return Math.abs(c.toTuple()[2]-8)<1e-6;}finally{dispose(c);}});
    assert.ok(id>=0,'top face');return id;
  }finally{faces.forEach(dispose);}})();
  let tip;
  try{
    tip=buildProjectedGroove(plate,{faceId:topId,pointsMm:[[2,3,8],[18,3,8]],widthMm:1,depthLaw:{kind:'spline',samples:[[0,0.8],[1,0]]}},cad);
    const report=tip.projectedGrooveReport;
    assert.equal(report.zeroEndDepth.end,true);
    assert.equal(report.zeroEndDepth.start,false);
    assert.ok(Math.hypot(...report.tipPoints.end.map((v,i)=>v-[18,3,8][i]))<1e-4,JSON.stringify(report.tipPoints));
    const deep=measureRegionVolume(tip,[1,2,7],[3,4,8],cad);
    const shallow=measureRegionVolume(tip,[17,2,7],[19,4,8],cad);
    assert.ok(deep.volume<shallow.volume-0.05,JSON.stringify({deep:deep.volume,shallow:shallow.volume}));
    assert.throws(()=>buildProjectedGroove(plate,{faceId:topId,pointsMm:[[2,3,8],[18,3,8]],widthMm:1,depthLaw:{kind:'spline',samples:[[0,0.8],[0.5,0],[1,0.8]]}},cad),/路径内部/);
    assert.throws(()=>buildProjectedGroove(plate,{faceId:topId,pointsMm:[[2,3,8],[18,3,8]],widthMm:1},cad),/depthMm 或 depthLaw/);
  }finally{[tip,plate].forEach(dispose);}
});
