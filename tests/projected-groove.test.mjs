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
  assert.ok(route.keywords.includes('跨面刻槽'));
  assert.ok(route.keywords.includes('变槽宽'));
  assert.deepEqual(route.tools,['projectedGroove','measure']);
  const guide=MODELING_DOCS['api.modeling.methods.projected-groove'];
  for(const term of ['一张面','surface-normal-spine','不是平面','NOT_REVIEWED','kind:"region"','0.1','depthLaw','切入量','完整截面高度','zeroEndDepth','widthLaw','完整槽宽','zeroEndWidth','不是半宽','faceIds','共享边','不是测地线'])assert.ok(guide.includes(term),term);
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

const planeFaceAt=(shape,axis,value,label)=>{
  const faces=shape.faces;
  try{
    const id=faces.findIndex(face=>{
      if(face.geomType!=='PLANE')return false;
      const c=face.center;
      try{return Math.abs(c.toTuple()[axis]-value)<1e-6;}finally{dispose(c);}
    });
    assert.ok(id>=0,label||`${axis}=${value}`);
    return id;
  }finally{faces.forEach(dispose);}
};

test('projected groove can continue across a shared box edge without cutting the interior chord',()=>{
  const stock=cad.makeBox([0,0,0],[20,20,20]);
  const top=planeFaceAt(stock,2,20,'top');
  const side=planeFaceAt(stock,0,20,'side');
  const bottom=planeFaceAt(stock,2,0,'bottom');
  const points=[[5,10,20],[20,10,10]];
  let result,explicit;
  try{
    result=buildProjectedGroove(stock,{faceIds:[top,side],pointsMm:points,widthMm:2,depthMm:0.8},cad);
    const report=result.projectedGrooveReport;
    assert.equal(report.crossingCount,1);
    assert.equal(report.crossingMethod,'shared-edge-shortest-polyline');
    assert.deepEqual(report.faceIds.slice().sort((a,b)=>a-b),[top,side].sort((a,b)=>a-b));
    assert.ok(Math.hypot(...report.crossings[0].point.map((v,i)=>v-[20,10,20][i]))<0.2,JSON.stringify(report.crossings));
    const topCut=measureRegionVolume(result,[9,9,19],[11,11,20.2],cad);
    const topStock=measureRegionVolume(stock,[9,9,19],[11,11,20.2],cad);
    const sideCut=measureRegionVolume(result,[19,9,9],[20.2,11,11],cad);
    const sideStock=measureRegionVolume(stock,[19,9,9],[20.2,11,11],cad);
    const interior=measureRegionVolume(result,[11.5,9,14],[13.5,11,16],cad);
    const interiorStock=measureRegionVolume(stock,[11.5,9,14],[13.5,11,16],cad);
    assert.ok(topCut.volume<topStock.volume-0.2,JSON.stringify({topCut:topCut.volume,topStock:topStock.volume}));
    assert.ok(sideCut.volume<sideStock.volume-0.2,JSON.stringify({sideCut:sideCut.volume,sideStock:sideStock.volume}));
    assert.ok(Math.abs(interior.volume-interiorStock.volume)<1e-6,JSON.stringify({interior:interior.volume,interiorStock:interiorStock.volume}));
    explicit=buildProjectedGroove(stock,{faceId:top,faceIds:[top,side],pointsMm:[[5,10,20],[15,10,20],[20,10,15],[20,10,10]],widthMm:2,depthMm:0.8},cad);
    assert.equal(explicit.projectedGrooveReport.crossingCount,1);
    assert.throws(()=>buildProjectedGroove(stock,{faceIds:[top,bottom],pointsMm:[[5,10,20],[5,10,0]],widthMm:2,depthMm:0.8},cad),/不相邻|跨面跳跃|投影刻槽失败/);
    assert.throws(()=>buildProjectedGroove(stock,{faceId:top,pointsMm:[[5,10,20],[20,10,10]],widthMm:2,depthMm:0.8},cad),/距所选面|离开所选面|投影刻槽失败/);
  }finally{[result,explicit,stock].forEach(dispose);}
});

test('kernel projectedGroove accepts faceIds and reports the shared-edge crossing',async()=>{
  const blank=await run([f('box','box',{width:20,depth:20,height:20})]);
  const faces=(await kernel.queryGeometry('box','face',{})).items;
  const top=faces.find(face=>face.geomType==='PLANE'&&Math.abs(face.center[2]-20)<1e-6);
  const side=faces.find(face=>face.geomType==='PLANE'&&Math.abs(face.center[0]-20)<1e-6);
  assert.ok(top&&side,JSON.stringify(faces.map(f=>({id:f.faceId,c:f.center,g:f.geomType}))));
  const topStock=kernel.measureRegion('box',[9,9,19],[11,11,20.2]);
  const sideStock=kernel.measureRegion('box',[19,9,9],[20.2,11,11]);
  const interiorStock=kernel.measureRegion('box',[11.5,9,14],[13.5,11,16]);
  const cut=await run([
    f('box','box',{width:20,depth:20,height:20}),
    f('groove','projectedGroove',{faceIds:[top.faceId,side.faceId],pointsMm:[[5,10,20],[20,10,10]],widthMm:2,depthMm:0.8},['box'])
  ]);
  assert.equal(cut.stats.solids,1);
  assert.ok(blank.stats.volume-cut.stats.volume>0.5);
  const report=cut.bodies[0].projectedGrooveReport;
  assert.equal(report.crossingCount,1);
  const topCut=kernel.measureRegion(cut.bodies[0].id,[9,9,19],[11,11,20.2]);
  const sideCut=kernel.measureRegion(cut.bodies[0].id,[19,9,9],[20.2,11,11]);
  const interior=kernel.measureRegion(cut.bodies[0].id,[11.5,9,14],[13.5,11,16]);
  assert.ok(topCut.volume<topStock.volume-0.2,JSON.stringify({topCut:topCut.volume,topStock:topStock.volume}));
  assert.ok(sideCut.volume<sideStock.volume-0.2,JSON.stringify({sideCut:sideCut.volume,sideStock:sideStock.volume}));
  assert.ok(Math.abs(interior.volume-interiorStock.volume)<1e-6,JSON.stringify({interior:interior.volume,interiorStock:interiorStock.volume}));
});

test('widthLaw varies full groove width and leaves a narrow-end shoulder uncut',()=>{
  const plate=cad.makeBox([0,0,0],[24,16,8]);
  const topId=planeFaceAt(plate,2,8,'top');
  const points=[[2,8,8],[22,8,8]];
  const shoulderMin=[1.5,6.2,7],shoulderMax=[3.5,6.8,8.2];
  const narrowMin=[20.5,6.2,7],narrowMax=[22.5,6.8,8.2];
  let faded,constant;
  try{
    faded=buildProjectedGroove(plate,{faceId:topId,pointsMm:points,widthLaw:{kind:'spline',samples:[[0,4],[1,1]]},depthMm:0.8},cad);
    const report=faded.projectedGrooveReport;
    assert.equal(report.variableWidth,true);
    assert.ok(Math.abs(report.startWidthMm-4)<1e-9);
    assert.ok(Math.abs(report.endWidthMm-1)<1e-9);
    assert.equal(report.zeroEndWidth.end,false);
    assert.equal(report.zeroEndDepth.end,false);
    const wideShoulder=measureRegionVolume(faded,shoulderMin,shoulderMax,cad);
    const stockShoulder=measureRegionVolume(plate,shoulderMin,shoulderMax,cad);
    const narrowShoulder=measureRegionVolume(faded,narrowMin,narrowMax,cad);
    const stockNarrow=measureRegionVolume(plate,narrowMin,narrowMax,cad);
    const wideCenter=measureRegionVolume(faded,[1.5,7.5,7],[3.5,8.5,8.2],cad);
    const narrowCenter=measureRegionVolume(faded,[20.5,7.5,7],[22.5,8.5,8.2],cad);
    const stockWideCenter=measureRegionVolume(plate,[1.5,7.5,7],[3.5,8.5,8.2],cad);
    const stockNarrowCenter=measureRegionVolume(plate,[20.5,7.5,7],[22.5,8.5,8.2],cad);
    assert.ok(wideShoulder.volume<stockShoulder.volume-0.05,JSON.stringify({wideShoulder:wideShoulder.volume,stockShoulder:stockShoulder.volume}));
    assert.ok(Math.abs(narrowShoulder.volume-stockNarrow.volume)<1e-6,JSON.stringify({narrowShoulder:narrowShoulder.volume,stockNarrow:stockNarrow.volume}));
    assert.ok(wideCenter.volume<stockWideCenter.volume-0.05,JSON.stringify({wideCenter:wideCenter.volume,stockWideCenter:stockWideCenter.volume}));
    assert.ok(narrowCenter.volume<stockNarrowCenter.volume-0.02,JSON.stringify({narrowCenter:narrowCenter.volume,stockNarrowCenter:stockNarrowCenter.volume}));
    constant=buildProjectedGroove(plate,{faceId:topId,pointsMm:points,widthMm:1,depthMm:0.8},cad);
    const constantShoulder=measureRegionVolume(constant,shoulderMin,shoulderMax,cad);
    assert.ok(Math.abs(constantShoulder.volume-stockShoulder.volume)<1e-6,JSON.stringify({constantShoulder:constantShoulder.volume,stockShoulder:stockShoulder.volume}));
  }finally{[faded,constant,plate].forEach(dispose);}
});

test('widthLaw may close a zero tip but rejects a mid-path zero or a missing width',()=>{
  const plate=cad.makeBox([0,0,0],[24,16,8]);
  const topId=planeFaceAt(plate,2,8,'top');
  const points=[[2,8,8],[22,8,8]];
  let tip;
  try{
    tip=buildProjectedGroove(plate,{faceId:topId,pointsMm:points,widthLaw:{kind:'spline',samples:[[0,3],[1,0]]},depthMm:0.8},cad);
    const report=tip.projectedGrooveReport;
    assert.equal(report.zeroEndWidth.end,true);
    assert.equal(report.zeroEndWidth.start,false);
    assert.equal(report.zeroEndDepth.end,false);
    assert.ok(Math.hypot(...report.tipPoints.end.map((v,i)=>v-[22,8,8][i]))<1e-4,JSON.stringify(report.tipPoints));
    const wide=measureRegionVolume(tip,[1.5,7.5,7],[3.5,8.5,8.2],cad);
    const stockWide=measureRegionVolume(plate,[1.5,7.5,7],[3.5,8.5,8.2],cad);
    const tipShoulder=measureRegionVolume(tip,[20.5,6.2,7],[22.5,6.8,8.2],cad);
    const stockShoulder=measureRegionVolume(plate,[20.5,6.2,7],[22.5,6.8,8.2],cad);
    assert.ok(wide.volume<stockWide.volume-0.05,JSON.stringify({wide:wide.volume,stockWide:stockWide.volume}));
    assert.ok(Math.abs(tipShoulder.volume-stockShoulder.volume)<1e-6,JSON.stringify({tipShoulder:tipShoulder.volume,stockShoulder:stockShoulder.volume}));
    assert.throws(()=>buildProjectedGroove(plate,{faceId:topId,pointsMm:points,widthLaw:{kind:'spline',samples:[[0,3],[0.5,0],[1,3]]},depthMm:0.8},cad),/路径内部/);
    assert.throws(()=>buildProjectedGroove(plate,{faceId:topId,pointsMm:points,depthMm:0.8},cad),/widthMm 或 widthLaw/);
    const both=buildProjectedGroove(plate,{faceId:topId,pointsMm:points,widthLaw:{kind:'spline',samples:[[0,3],[1,1]]},depthLaw:{kind:'spline',samples:[[0,0.8],[1,0.3]]}},cad);
    try{
      assert.equal(both.projectedGrooveReport.variableWidth,true);
      assert.equal(both.projectedGrooveReport.variableDepth,true);
      assert.ok(Math.abs(both.projectedGrooveReport.endWidthMm-1)<1e-9);
      assert.ok(Math.abs(both.projectedGrooveReport.endPenetrationMm-0.3)<1e-9);
    }finally{dispose(both);}
  }finally{[tip,plate].forEach(dispose);}
});

test('kernel projectedGroove accepts widthLaw without widthMm',async()=>{
  const blank=await run([f('box','box',{width:24,depth:16,height:8})]);
  const faces=(await kernel.queryGeometry('box','face',{})).items;
  const top=faces.find(face=>face.geomType==='PLANE'&&Math.abs(face.center[2]-8)<1e-6);
  assert.ok(top,JSON.stringify(faces.map(item=>({id:item.faceId,c:item.center,g:item.geomType}))));
  const stockShoulder=kernel.measureRegion('box',[1.5,6.2,7],[3.5,6.8,8.2]);
  const stockNarrow=kernel.measureRegion('box',[20.5,6.2,7],[22.5,6.8,8.2]);
  const cut=await run([
    f('box','box',{width:24,depth:16,height:8}),
    f('groove','projectedGroove',{faceId:top.faceId,pointsMm:[[2,8,8],[22,8,8]],widthLaw:{kind:'spline',samples:[[0,4],[1,1]]},depthMm:0.8},['box'])
  ]);
  assert.equal(cut.stats.solids,1);
  const report=cut.bodies[0].projectedGrooveReport;
  assert.equal(report.variableWidth,true);
  assert.ok(Math.abs(report.startWidthMm-4)<1e-9);
  assert.ok(Math.abs(report.endWidthMm-1)<1e-9);
  const wideShoulder=kernel.measureRegion(cut.bodies[0].id,[1.5,6.2,7],[3.5,6.8,8.2]);
  const narrowShoulder=kernel.measureRegion(cut.bodies[0].id,[20.5,6.2,7],[22.5,6.8,8.2]);
  assert.ok(wideShoulder.volume<stockShoulder.volume-0.05,JSON.stringify({wideShoulder:wideShoulder.volume,stockShoulder:stockShoulder.volume}));
  assert.ok(Math.abs(narrowShoulder.volume-stockNarrow.volume)<1e-6,JSON.stringify({narrowShoulder:narrowShoulder.volume,stockNarrow:stockNarrow.volume}));
  assert.ok(blank.stats.volume-cut.stats.volume>0.2);
});
