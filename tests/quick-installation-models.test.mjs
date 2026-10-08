import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {buildQuickModel,QUICK_MODELS} from '../src/quick-models/catalog.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';
import {dispose} from '../src/quick-models/installation-geometry.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const near=(a,b,label,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${label}: ${a} != ${b}`);
const probe=(shape,xyz,material)=>{const tool=cad.makeCylinder(.025,.05,xyz);let common;try{common=shape.intersect(tool);assert.equal(cad.measureVolume(common)>1e-8,material,`material at ${xyz}`);}finally{dispose(common);dispose(tool);}};
const bounds=(shape,expected)=>{const box=shape.boundingBox;try{box.bounds[0].forEach((v,i)=>near(v,expected[0][i],`min ${i}`));box.bounds[1].forEach((v,i)=>near(v,expected[1][i],`max ${i}`));}finally{dispose(box);}};
const timed=[];
const make=(params)=>{const started=performance.now(),shape=buildQuickModel(params,cad);timed.push({kind:params.kind,ms:performance.now()-started});return shape;};
for(const kind of ['frameEyelet','uStrapClip'])assert.ok(quickModelIconKinds.includes(kind));
let s;
try{
  s=make({kind:'frameEyelet'});bounds(s,[[-12.8,-15,0],[12.8,15,5]]);
  probe(s,[0,0,.5],false);probe(s,[6.15,0,3],true);probe(s,[6.4,0,3],false);
  probe(s,[3,11.3,4],false);probe(s,[3,11.3,2.5],true);probe(s,[4.7,11.3,4],true);
}finally{dispose(s);}
const round={kind:'frameEyelet',shape:'round',outerWidthMm:32,outerHeightMm:32,boreWidthMm:18,boreHeightMm:18,flangeThicknessMm:1.5,collarProjectionMm:3,collarWallMm:1,mountingCount:2,pitchYMm:26,bossDiameterMm:4,bossHeightMm:4,holeDiameterMm:2,holeDepthMm:3};
try{
  s=make(round);bounds(s,[[-16,-16,0],[16,16,5.5]]);
  const volume=Math.PI*(32**2-18**2)/4*1.5+Math.PI*(20**2-18**2)/4*3+2*Math.PI*4**2/4*4-2*Math.PI*2**2/4*3;
  near(cad.measureVolume(s),volume,'independent round frame + collar + posts - blind holes',1e-4);
  probe(s,[0,0,2],false);probe(s,[9.5,0,2],true);probe(s,[0,13,3],false);probe(s,[0,13,2],true);
}finally{dispose(s);}
try{
  s=make({...round,collarProjectionMm:0,bossHeightMm:0,holeDepthMm:0});bounds(s,[[-16,-16,0],[16,16,1.5]]);
  near(cad.measureVolume(s),Math.PI*(32**2-18**2)/4*1.5-2*Math.PI*2**2/4*1.5,'backplate through holes',1e-4);probe(s,[0,13,.4],false);
}finally{dispose(s);}
for(const p of [{holeDepthMm:5},{pitchXMm:2},{pitchYMm:10},{collarWallMm:10},{mountingCount:3},{shape:'round'},{flangeThicknessMm:'1.5'},{bogus:1}])assert.throws(()=>buildQuickModel({kind:'frameEyelet',...p},cad),/安装鸡眼/);
for(const r of [0,.2,1.5]){
  const p={...QUICK_MODELS.uStrapClip.defaults,innerBendRadiusMm:r,holeHeightMm:r+2.5,backHeightMm:6};
  try{
    s=make({kind:'uStrapClip',...p});bounds(s,[[-10,-2.8,0],[10,2.8,7]]);
    const area=p.wallThicknessMm*(p.frontHeightMm+p.backHeightMm+p.innerGapMm)-2*(1-Math.PI/4)*((r+p.wallThicknessMm)**2-r**2);
    near(cad.measureVolume(s),p.widthMm*area-2*Math.PI*p.holeDiameterMm**2/4*p.wallThicknessMm,`independent U section area r=${r}`,1e-4);
    probe(s,[0,0,4],false);probe(s,[7,2,p.holeHeightMm],false);probe(s,[7,-2.2,p.holeHeightMm],true);probe(s,[0,0,.1],true);
  }finally{dispose(s);}
}
try{s=make({kind:'uStrapClip',holeCount:1,holeHeightMm:3});probe(s,[0,2,3],false);probe(s,[7,2,3],true);}finally{dispose(s);}
for(const p of [{innerBendRadiusMm:1.6},{backHeightMm:1.4},{holeHeightMm:2},{holePitchMm:1},{holePitchMm:19},{holeCount:3},{widthMm:'20'},{bogus:1}])assert.throws(()=>buildQuickModel({kind:'uStrapClip',...p},cad),/U形带夹/);
// Exercise persisted feature rebuilding and editing through the real kernel.
const kernel=new CadKernel(oc);
try{
  const doc={version:1,features:[{id:'part',op:'quickModel',refs:[],params:{kind:'frameEyelet',...round},name:'installation'}],imports:{},hidden:[]};
  const first=await kernel.rebuild(JSON.parse(JSON.stringify(doc)));assert.equal(first.stats.solids,1);
  doc.features[0].params.holeDepthMm=0;const edited=await kernel.rebuild(doc);assert.equal(edited.stats.solids,1);assert.ok(edited.stats.volume<first.stats.volume);probe(kernel.activeShape('part'),[0,13,.3],false);
  doc.features[0].params={kind:'uStrapClip'};const clip=await kernel.rebuild(JSON.parse(JSON.stringify(doc)));assert.equal(clip.stats.solids,1);
}finally{kernel.dispose();}
console.log('PASS quick installation models: true open collar, blind floors, pierced backplate, exact U/semicircular bends, back-only holes, parameter rejection and persisted kernel edits');
console.log(JSON.stringify({timings:timed}));
