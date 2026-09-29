import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const kernel=new CadKernel(oc);
const run=params=>kernel.rebuild({version:1,features:[{id:'eyelet',op:'quickModel',refs:[],params,name:'eyelet'}],imports:{},hidden:[]});
const dispose=value=>{try{value?.delete?.();}catch{}};
const near=(actual,expected,label,tol=1e-5)=>assert.ok(Math.abs(actual-expected)<tol,`${label}: ${actual} != ${expected}`);
const bounds=shape=>{const box=shape.boundingBox;try{return box.bounds.map(values=>[...values]);}finally{dispose(box);}};
const defaults=QUICK_MODELS.twoPieceEyelet.defaults;
assert.ok(quickModelIconKinds.includes('twoPieceEyelet'));

const exploded=await run({kind:'twoPieceEyelet',...defaults});
assert.equal(exploded.stats.solids,2);
assert.equal(exploded.bodies[0].solidCount,2);
assert.equal(exploded.bodies[0].shellCount,2);
[42,18,7].forEach((value,index)=>near(exploded.bodies[0].bounds.max[index]-exploded.bodies[0].bounds.min[index],value,`exploded bounds ${index}`));
const compound=kernel.activeShape('eyelet'),parts=compound.solids;
try{
  assert.equal(parts.length,2);
  const ordered=parts.map(part=>({shape:part,box:bounds(part),volume:cad.measureVolume(part)})).sort((a,b)=>b.volume-a.volume);
  const [a,b]=ordered;
  assert.ok(a.volume>0&&b.volume>0&&a.volume>b.volume,'both individual exact part volumes are positive and independently measured');
  near(a.box[0][0],-9,'A bounds min x');near(a.box[1][0],9,'A bounds max x');near(a.box[0][1],-9,'A bounds min y');near(a.box[1][1],9,'A bounds max y');
  near(b.box[0][0],15,'B bounds min x');near(b.box[1][0],33,'B bounds max x');near(b.box[0][1],-9,'B bounds min y');near(b.box[1][1],9,'B bounds max y');
  near(a.box[0][2],0,'A min z');near(a.box[1][2],7,'A max z');near(b.box[0][2],0,'B min z');near(b.box[1][2],2,'B max z');
  const flangeProbe=cad.makeCylinder(.04,.2,[7,0,0]);let material;
  try{material=a.shape.intersect(flangeProbe);assert.ok(cad.measureVolume(material)>1e-4,'flange has material at r=7,z=.1');}finally{dispose(material);dispose(flangeProbe);}
  const flangeVoid=cad.makeCylinder(.04,.1,[7,0,.3]);
  try{material=a.shape.intersect(flangeVoid);near(cad.measureVolume(material),0,'no flange material at r=7,z=.3',1e-8);}finally{dispose(material);dispose(flangeVoid);}
  const tubeProbe=cad.makeCylinder(.04,.1,[5.6,0,6.85]);
  try{material=a.shape.intersect(tubeProbe);assert.ok(cad.measureVolume(material)>1e-4,'A tube wall at r=5.6,z=6.9');}finally{dispose(material);dispose(tubeProbe);}
  const faces=a.shape.faces;
  try{
    let torusCount=0;
    // WASM exposes surface type but does not bind gp_Torus. Exact radii
    // are independently checked from the exported STEP with OCP.
    for(const face of faces){let adaptor;try{adaptor=new oc.BRepAdaptor_Surface(face.wrapped,true);if(adaptor.GetType()===oc.GeomAbs_SurfaceType.GeomAbs_Torus)torusCount++;}finally{dispose(adaptor);}}
    assert.equal(torusCount,4,'four real torus surfaces, not a solid stepped flange');
  }finally{faces.forEach(dispose);}
}finally{parts.forEach(dispose);}

const zero=await run({kind:'twoPieceEyelet',...defaults,explodedOffsetMm:0}),zeroParts=kernel.activeShape('eyelet').solids;
try{
  assert.equal(zero.stats.solids,2);assert.equal(zeroParts.length,2);
  const common=zeroParts[0].intersect(zeroParts[1]);
  try{near(cad.measureVolume(common),0,'coaxial actual common volume',1e-8);}finally{dispose(common);}
  const zBounds=zeroParts.map(bounds).sort((x,y)=>x[0][2]-y[0][2]);
  const ordered=zeroParts.map(shape=>({shape,box:bounds(shape),volume:cad.measureVolume(shape)})).sort((x,y)=>y.volume-x.volume);
  near(ordered[0].box[0][2],0,'A starts at z0');near(ordered[0].box[1][2],7,'A ends z7');
  near(ordered[1].box[0][2],5.8,'B short end z5.8');near(ordered[1].box[1][2],7.8,'B top z7.8');
}finally{zeroParts.forEach(dispose);}

const variant={...defaults,aFlangeDiameterMm:20,aBoreDiameterMm:8,aTubeOuterDiameterMm:8.4,aTubeLengthMm:4,aFlangeDepthMm:1.4,aBendRadiusMm:.7,bFlangeDiameterMm:19,bBoreDiameterMm:9,bTubeOuterDiameterMm:9.6,bOverallDepthMm:2.5,bFlangeDepthMm:1.4,bBendRadiusMm:.75,explodedOffsetMm:0};
const custom=await run({kind:'twoPieceEyelet',...variant});
assert.equal(custom.stats.solids,2);assert.ok(custom.stats.volume>0);
await assert.rejects(run({kind:'twoPieceEyelet',...defaults,aTubeOuterDiameterMm:10.9}),/双件鸡眼/);
await assert.rejects(run({kind:'twoPieceEyelet',...defaults,explodedOffsetMm:10}),/双件鸡眼/);
await assert.rejects(run({kind:'twoPieceEyelet',...defaults,aBendRadiusMm:.2}),/双件鸡眼/);
await assert.rejects(run({kind:'twoPieceEyelet',...defaults,aFlangeDiameterMm:13}),/双件鸡眼/);
await assert.rejects(run({kind:'twoPieceEyelet',...defaults,explodedOffsetMm:0,bBoreDiameterMm:11}),/同轴静态配合/);

kernel.dispose();
console.log('PASS twoPieceEyelet: true thin-wall revolved profile, torus bends, exact section/material probes, independent part bounds/volumes, coaxial zero overlap and generic dimensions');
