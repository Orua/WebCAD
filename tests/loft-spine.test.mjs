import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildCurveSweep} from '../src/curve-sweep.js';
import {getOperation} from '../src/operation-registry.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);

test('UP-32 straight spine creates a measured round solid with compact station laws',()=>{
 const shape=buildCurveSweep({pathType:'spine',spine:{kind:'bspline',pointsMm:[[0,0,0],[0,0,10]]},stations:{count:8},widthLaw:2,depthLaw:2},cad);
 try{assert.equal(shape.solids.length,1);assert.ok(Math.abs(cad.measureVolume(shape)-Math.PI*10)<.3);assert.equal(shape.loftReport.stationsResolved.length,8);}finally{shape.delete();}
});
test('UP-32 RMF follows an S spine without a frame flip and reports orthogonalization',()=>{
 const shape=buildCurveSweep({pathType:'spine',spine:{kind:'bspline',pointsMm:[[0,0,0],[5,.3,0],[10,-.3,0],[15,0,0]]},stations:{count:64,distribution:'uniform'},widthLaw:{kind:'spline',samples:[[0,.5],[.5,.6],[1,.45]]},depthLaw:{kind:'spline',samples:[[0,.4],[1,.4]]}},cad);
 try{const frames=shape.loftReport.spineFrames;assert.ok(frames.length===64);for(let i=1;i<frames.length;i++){const a=frames[i-1].widthDirection,b=frames[i].widthDirection;assert.ok(Math.acos(Math.max(-1,Math.min(1,a.reduce((s,v,j)=>s+v*b[j],0))))*180/Math.PI<2);}
  const stations=[];for(let i=0;i<3;i++)stations.push({centerMm:[0,0,i*5],normal:[0,0,1],widthDirection:[Math.cos(.5*Math.PI/180),0,Math.sin(.5*Math.PI/180)],widthMm:2,depthMm:1});
  const fixed=buildCurveSweep({pathType:'sections',stations,loftDegree:2},cad);try{assert.equal(fixed.loftReport.orthogonalizedStations.length,3);assert.ok(fixed.loftReport.orthogonalizedStations.every(s=>Math.abs(s.correctionDeg-.5)<.01));}finally{fixed.delete();}
 }finally{shape.delete();}
});

test('spine honors curveSweep radius instead of the implicit 10 mm section',()=>{
 const withRadius=buildCurveSweep({pathType:'spine',spine:{kind:'polyline',pointsMm:[[0,0,0],[0,0,10]]},stations:{count:8},radius:1.5},cad);
 try{
  assert.equal(withRadius.solids.length,1);
  assert.ok(Math.abs(cad.measureVolume(withRadius)-Math.PI*1.5*1.5*10)<.4, cad.measureVolume(withRadius));
 }finally{withRadius.delete();}
 const explicit=buildCurveSweep({pathType:'spine',spine:{kind:'polyline',pointsMm:[[0,0,0],[0,0,10]]},stations:{count:8},radius:1.5,widthLaw:2,depthLaw:2},cad);
 try{
  // widthLaw still wins when provided
  assert.ok(Math.abs(cad.measureVolume(explicit)-Math.PI*10)<.3, cad.measureVolume(explicit));
 }finally{explicit.delete();}
});

test('absolute spine roll is independent of station count; saved incremental recipes keep their orientation',()=>{
  const base={
    pathType:'spine',spine:{kind:'polyline',pointsMm:[[0,0,0],[0,0,10]]},
    upHint:[1,0,0],widthLaw:2,depthLaw:1,loftDegree:2
  };
  const verify=(options,mode,expected)=>{
    const shape=buildCurveSweep({...base,...options},cad);
    const analyzer=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);
    try{
      assert.ok(analyzer.IsValid());
      assert.equal(shape.loftReport.rollMode,mode);
      for(const frame of shape.loftReport.spineFrames){
        const rad=expected(frame)*Math.PI/180;
        assert.ok(Math.hypot(frame.widthDirection[0]-Math.sin(rad),frame.widthDirection[1]+Math.cos(rad))<1e-8);
      }
    }finally{analyzer.delete();shape.delete();}
  };
  for(const count of [8,16,32]){
    verify({stations:{count},rollMode:'absolute',rollLawDeg:30},'absolute',()=>30);
  }
  verify({stations:{count:8},rollMode:'absolute',rollLawDeg:{kind:'spline',samples:[[0,-15],[1,45]]}},'absolute',({t})=>-15+60*t);
  verify({stations:{count:8},rollLawDeg:30},'incremental',({i})=>30*(i+1));
  assert.deepEqual(getOperation('curveSweep').inputSchema.properties.rollMode.enum,['absolute','incremental']);
});

test('ordered ellipse stations retain material through the prepared curved fruit spine',()=>{
  const points=Array.from({length:13},(_,i)=>{
    const t=i/12,theta=(-69+139*t)*Math.PI/180,r=43+2.1*Math.sin(Math.PI*t);
    return [51+r*Math.sin(theta),1.25*Math.sin(Math.PI*t)+2.3*t*t,1.8+r*(1-Math.cos(theta))+2.5*t];
  });
  const law=samples=>({kind:'spline',samples});
  const shape=buildCurveSweep({
    pathType:'spine',spine:{kind:'bspline',pointsMm:points},stations:{count:24},
    widthLaw:law([[0,2.25],[.082,5.9],[.19,10.6],[.37,15.3],[.60,15.8],[.8,13.2],[.91,7.6],[1,3.4]]),
    depthLaw:law([[0,1.9],[.10,4.7],[.23,8.7],[.48,11.6],[.73,11.0],[.9,6.9],[1,2.8]]),
    rollLawDeg:law([[0,-17],[.32,-8],[.68,3],[1,18]]),rollMode:'absolute',autoAlign:false,loftDegree:3,volumeCheck:'error'
  },cad);
  try{
    const {ratio,diagnostics}=shape.loftReport;
    assert.ok(Math.abs(ratio-1)<.025,JSON.stringify({ratio,diagnostics}));
    assert.equal(diagnostics.correspondence,'explicit-order');
    assert.equal(diagnostics.solidCount,1);
  }finally{shape.delete();}
});


test('a fading spine cutter must keep a positive tip and removes more material at the deep end',()=>{
  const law=samples=>({kind:'spline',samples});
  assert.throws(()=>buildCurveSweep({pathType:'spine',spine:{kind:'polyline',pointsMm:[[2,3,8],[18,3,8]]},stations:{count:6},widthLaw:1,depthLaw:law([[0,1.6],[1,0]]),rollMode:'absolute',section:'ellipse'},cad),/正深度/);
  const stock=cad.makeBox([0,0,0],[20,6,8]);
  const cutter=buildCurveSweep({pathType:'spine',spine:{kind:'polyline',pointsMm:[[2,3,8],[18,3,8]]},stations:{count:8},widthLaw:1,depthLaw:law([[0,1.6],[1,0.2]]),rollMode:'absolute',section:'ellipse'},cad);
  let result,startProbe,endProbe,startRemain,endRemain;
  try{
    result=stock.cut(cutter);
    const analyzer=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);
    try{assert.ok(analyzer.IsValid());assert.equal(result.solids.length,1);}finally{analyzer.delete();}
    startProbe=cad.makeBox([1,2,7],[3,4,8]);endProbe=cad.makeBox([17,2,7],[19,4,8]);
    startRemain=result.intersect(startProbe);endRemain=result.intersect(endProbe);
    const startVol=cad.measureVolume(startRemain),endVol=cad.measureVolume(endRemain);
    assert.ok(startVol<endVol-0.05,JSON.stringify({startVol,endVol}));
    assert.ok(cad.measureVolume(stock)-cad.measureVolume(result)>0.2);
  }finally{[endRemain,startRemain,endProbe,startProbe,result,cutter,stock].forEach(s=>s?.delete?.());}
});
