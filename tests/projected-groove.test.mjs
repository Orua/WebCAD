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
  assert.ok(route.keywords.includes('就近推断面号'));
  assert.deepEqual(route.tools,['projectedGroove','measure']);
  const guide=MODELING_DOCS['api.modeling.methods.projected-groove'];
  for(const term of ['一张面','surface-normal-spine','不是平面','NOT_REVIEWED','kind:"region"','0.1','depthLaw','切入量','完整截面高度','zeroEndDepth','widthLaw','完整槽宽','zeroEndWidth','不是半宽','faceIds','共享边','不是测地线','就近推断','faceIdsInferred','不会自动寻路'])assert.ok(guide.includes(term),term);
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
    assert.equal(report.faceIdsInferred,false);
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

test('projected groove can infer adjacent faces from path points without face ids',()=>{
  const stock=cad.makeBox([0,0,0],[20,20,20]);
  const top=planeFaceAt(stock,2,20,'top');
  const side=planeFaceAt(stock,0,20,'side');
  const bottom=planeFaceAt(stock,2,0,'bottom');
  const points=[[5,10,20],[20,10,10]];
  let result,withCorner;
  try{
    result=buildProjectedGroove(stock,{pointsMm:points,widthMm:2,depthMm:0.8},cad);
    const report=result.projectedGrooveReport;
    assert.equal(report.faceIdsInferred,true);
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
    withCorner=buildProjectedGroove(stock,{pointsMm:[[5,10,20],[20,10,20],[20,10,10]],widthMm:2,depthMm:0.8},cad);
    assert.equal(withCorner.projectedGrooveReport.faceIdsInferred,true);
    assert.equal(withCorner.projectedGrooveReport.crossingCount,1);
    assert.throws(()=>buildProjectedGroove(stock,{pointsMm:[[5,10,20],[5,10,0]],widthMm:2,depthMm:0.8},cad),/不相邻|跨面跳跃|投影刻槽失败/);
    assert.throws(()=>buildProjectedGroove(stock,{pointsMm:[[20,10,20],[5,10,20]],widthMm:2,depthMm:0.8},cad),/同时靠近|无法就近|投影刻槽失败/);
  }finally{[result,withCorner,stock].forEach(dispose);}
});

test('kernel projectedGroove infers faceIds from world points',async()=>{
  const blank=await run([f('box','box',{width:20,depth:20,height:20})]);
  const topStock=kernel.measureRegion('box',[9,9,19],[11,11,20.2]);
  const sideStock=kernel.measureRegion('box',[19,9,9],[20.2,11,11]);
  const interiorStock=kernel.measureRegion('box',[11.5,9,14],[13.5,11,16]);
  const cut=await run([
    f('box','box',{width:20,depth:20,height:20}),
    f('groove','projectedGroove',{pointsMm:[[5,10,20],[20,10,10]],widthMm:2,depthMm:0.8},['box'])
  ]);
  assert.equal(cut.stats.solids,1);
  const report=cut.bodies[0].projectedGrooveReport;
  assert.equal(report.faceIdsInferred,true);
  assert.equal(report.crossingCount,1);
  assert.ok(blank.stats.volume-cut.stats.volume>0.5);
  const topCut=kernel.measureRegion(cut.bodies[0].id,[9,9,19],[11,11,20.2]);
  const sideCut=kernel.measureRegion(cut.bodies[0].id,[19,9,9],[20.2,11,11]);
  const interior=kernel.measureRegion(cut.bodies[0].id,[11.5,9,14],[13.5,11,16]);
  assert.ok(topCut.volume<topStock.volume-0.2,JSON.stringify({topCut:topCut.volume,topStock:topStock.volume}));
  assert.ok(sideCut.volume<sideStock.volume-0.2,JSON.stringify({sideCut:sideCut.volume,sideStock:sideStock.volume}));
  assert.ok(Math.abs(interior.volume-interiorStock.volume)<1e-6,JSON.stringify({interior:interior.volume,interiorStock:interiorStock.volume}));
});

test('shared-edge crossing refines between coarse grid samples instead of bending the path sideways',()=>{
  const stock=cad.makeBox([0,0,0],[20,20,20]);let result;
  try{
    result=buildProjectedGroove(stock,{pointsMm:[[3.7,7.3,20],[20,7.3,6.2]],widthMm:1.2,depthMm:.5},cad);
    const report=result.projectedGrooveReport,crossing=report.crossings[0].point;
    assert.equal(report.crossingCount,1);
    assert.ok(Math.abs(crossing[0]-20)<1e-6,JSON.stringify(crossing));
    assert.ok(Math.abs(crossing[1]-7.3)<2e-6,JSON.stringify(crossing));
    assert.ok(Math.abs(crossing[2]-20)<1e-6,JSON.stringify(crossing));
    assert.equal(solidCountForTest(result),1);
    assert.ok(cad.measureVolume(stock)-cad.measureVolume(result)>.2);
  }finally{[result,stock].forEach(dispose);}
});

function solidCountForTest(shape){const solids=shape.solids;try{return solids.length;}finally{solids.forEach(dispose);}}

test('public Page API complex dragon probe commits, reads crossing reports and reopens the exact solid',async()=>{
  const {mkdtemp,readFile,rm}=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path'),{spawnSync}=await import('node:child_process');
  const dir=await mkdtemp(path.join(os.tmpdir(),'webcad-dragon-'));
  try{
    const run=spawnSync(process.execPath,['scripts/probes/dragon-public.mjs',dir],{encoding:'utf8',timeout:120000});
    assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
    const evidence=JSON.parse(await readFile(path.join(dir,'evidence.json'),'utf8'));
    const {decodeProject}=await import('../src/project-container.js'),saved=await decodeProject(await readFile(path.join(dir,'dragon.webcad')));
    assert.ok(saved.features.filter(feature=>feature.placement).every(feature=>feature.semanticsVersion===2));
    assert.equal(evidence.visualStatus,'NOT_REVIEWED');assert.equal(evidence.zeroDepthExperiment,false);
    assert.equal(evidence.steps.length,14);assert.equal(evidence.failures.length,0);
    assert.ok(evidence.steps.every(step=>step.result.status==='committed'));
    const groove=evidence.steps.find(step=>step.op==='projectedGroove');
    assert.equal(groove.projectedGrooveReport.crossingSearch.method,'sampled-basin-golden-section');
    assert.equal(groove.projectedGrooveReport.faceIdsInferred,true);
    assert.equal(evidence.final.valid,true);assert.equal(evidence.final.measure.solidCount,1);
    assert.equal(evidence.reopen.solidCount,1);
    assert.ok(Math.abs(evidence.reopen.volumeMm3-evidence.final.measure.volume)<.001);
  }finally{await rm(dir,{recursive:true,force:true});}
});


test('projected pattern repeats a caller contour at staggered surface-row arclengths without adding floating bodies',()=>{
 const stock=cad.makeBox([0,0,0],[60,24,8]),before=cad.measureVolume(stock);let result;
 try{
  result=buildProjectedGroove(stock,{pointsMm:[[5,12,8],[55,12,8]],widthMm:.6,depthMm:.4,pattern:{spacingMm:10,rowOffsetsMm:[-4,0,4],points2dMm:[[-2,-2],[0,2],[2,-2]],maxCount:18}},cad);
  const report=result.projectedGrooveReport;
  assert.equal(report.method,'surface-projected-staggered-pattern');assert.equal(report.rows.length,3);assert.ok(report.instanceCount>=12);
  for(const row of report.rows){for(let i=1;i<row.centers.length;i++)assert.ok(Math.abs(row.centers[i].arcLengthMm-row.centers[i-1].arcLengthMm-10)<1e-7);for(const c of row.centers)assert.ok(Math.abs(c.point[2]-8)<1e-7);}
  assert.equal(report.rows[0].phaseFraction,0);assert.equal(report.rows[1].phaseFraction,.5);
  assert.ok(cad.measureVolume(result)<before);assert.equal(cad.measureVolume(stock),before);
  const check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);try{assert.equal(check.IsValid(),true);}finally{check.delete();}
  const solids=result.solids;try{assert.equal(solids.length,1);}finally{solids.forEach(dispose);}
 }finally{dispose(result);dispose(stock);}
});

test('projected pattern rejects insufficient detail budgets before altering source geometry',()=>{
 const stock=cad.makeBox([0,0,0],[60,24,8]),before=cad.measureVolume(stock);
 try{assert.throws(()=>buildProjectedGroove(stock,{pointsMm:[[5,12,8],[55,12,8]],widthMm:.6,depthMm:.4,pattern:{spacingMm:10,rowOffsetsMm:[0],points2dMm:[[-2,-2],[0,2],[2,-2]],maxCount:1}},cad),/预算|budget/);assert.equal(cad.measureVolume(stock),before);}finally{dispose(stock);}
});


test('projected pattern follows a translated variable-radius bending solid including the contour arms',async()=>{
 const {buildCurveSweep}=await import('../src/curve-sweep.js');
 const make=(scale,shift)=>{
  const transform=v=>v.map((x,i)=>x*scale+shift[i]);
  const source=buildCurveSweep({pathType:'sections',loftDegree:2,autoAlign:false,stations:[
   {centerMm:[0,0,0],widthMm:18,depthMm:18},{centerMm:[14,0,5],widthMm:26,depthMm:24},{centerMm:[30,0,12],widthMm:15,depthMm:16},{centerMm:[46,0,10],widthMm:11,depthMm:12}
  ].map(v=>({...v,centerMm:transform(v.centerMm),normal:[1,0,0],widthDirection:[0,1,0],widthMm:v.widthMm*scale,depthMm:v.depthMm*scale})),tolerance:.01*scale},cad);
  return {source,params:{pointsMm:[[7,0,15],[14,0,17],[24,0,19],[33,0,19]].map(transform),widthMm:.65*scale,depthMm:.55*scale,pattern:{spacingMm:8*scale,rowOffsetsMm:[-3*scale,0,3*scale],points2dMm:[[-2.4,-2],[0,2],[2.4,-2]].map(v=>v.map(x=>x*scale)),maxCount:12,maxProjectionMm:5,layoutToleranceMm:.03*scale}}};
 };
 let first;
 for(const [scale,shift]of [[1,[0,0,0]],[1.4,[125,-48,23]]]){
  const {source,params}=make(scale,shift);let result;
  try{
   result=buildProjectedGroove(source,params,cad);const r=result.projectedGrooveReport;
   assert.ok(r.maxSeedProjectionMm>.1*scale,'fixture must distinguish tangent-plane placements from actual surface');assert.ok(r.maxFootprintResidualMm<1e-5);assert.ok(r.maxAcceptedChordSagMm<=params.pattern.layoutToleranceMm);assert.equal(r.verifiedCutSampleCount,3*r.instanceCount);assert.equal(solidCountForTest(result),1);
   if(!first)first=r;else{assert.equal(r.instanceCount,first.instanceCount);assert.ok(Math.abs(r.removedVolumeMm3/scale**3-first.removedVolumeMm3)<.05);for(let i=0;i<r.rows.length;i++)assert.ok(Math.abs(r.rows[i].lengthMm/scale-first.rows[i].lengthMm)<.03);}
  }finally{dispose(result);dispose(source);}
 }
});

test('projected pattern rejects boundary crossings and invalid phase/law contracts without changing stock',()=>{
 const stock=cad.makeBox([0,0,0],[60,24,8]),before=cad.measureVolume(stock),base={pointsMm:[[5,12,8],[55,12,8]],widthMm:.6,depthMm:.4,pattern:{spacingMm:10,rowOffsetsMm:[0],points2dMm:[[-2,-2],[0,2],[2,-2]],maxCount:8}};
 try{
  for(const params of [{...base,pattern:{...base.pattern,rowOffsetsMm:[-12]}},{...base,pattern:{...base.pattern,phaseFractions:[1]}},{...base,widthLaw:1},{...base,pattern:{...base.pattern,points2dMm:[[0,0],[0,0]]}}])assert.throws(()=>buildProjectedGroove(stock,params,cad));
  assert.equal(cad.measureVolume(stock),before);
 }finally{dispose(stock);}
});


test('public Page API surface pattern commits via current tool card and restores native checkpoint reports',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path'),{spawnSync}=await import('node:child_process');
 const dir=await mkdtemp(path.join(os.tmpdir(),'webcad-pattern-'));
 try{
  const run=spawnSync(process.execPath,['scripts/probes/surface-pattern-public.mjs',dir],{encoding:'utf8',timeout:120000});assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
  const e=JSON.parse(await readFile(path.join(dir,'probe-evidence.json'),'utf8'));assert.equal(e.failures.length,0);assert.equal(e.steps.length,2);assert.ok(e.steps.every(s=>s.result.status==='committed'));assert.equal(e.pattern.method,'surface-projected-staggered-pattern');assert.equal(e.final.bodies,1);assert.equal(e.reopen.sameVolumes,true);assert.equal(e.visualStatus,'NOT_REVIEWED');
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('projected pattern handles cylindrical rows but refuses the actual periodic seam',()=>{
 const stock=cad.makeCylinder(10,40),faceId=faceIdOf(stock,'CYLINDRE');let result;
 try{
  const params={faceId,pointsMm:[[0,10,5],[0,10,32]],widthMm:.5,depthMm:.4,pattern:{spacingMm:10,rowOffsetsMm:[-2,0,2],points2dMm:[[-1.5,-1],[0,1],[1.5,-1]],maxCount:9}};
  result=buildProjectedGroove(stock,params,cad);assert.equal(solidCountForTest(result),1);const r=result.projectedGrooveReport;assert.equal(r.rows.length,3);assert.equal(r.verifiedCutSampleCount,3*r.instanceCount);assert.ok(r.details.every(d=>d.path.every(p=>Math.abs(Math.hypot(p[0],p[1])-10)<1e-5)));
  assert.throws(()=>buildProjectedGroove(stock,{...params,pointsMm:[[10,0,5],[10,0,32]]},cad),/边界|接缝/);
 }finally{dispose(result);dispose(stock);}
});
