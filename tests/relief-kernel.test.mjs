import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildRelief} from '../src/modeling/manufacturing/relief.js';
import {CadKernel} from '../src/cad-kernel.js';
import {fitContour} from '../src/modeling/manufacturing/relief-curves.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=x=>{try{x?.delete?.();}catch{}};
const values=Array.from({length:9},(_,y)=>Array.from({length:9},(_,x)=>Math.max(0,1-Math.hypot(x-4,y-4)/4)));
const mask=[{outer:[[-.3,-.3],[.3,-.3],[.3,.3],[-.3,.3]],holes:[[[-.1,-.1],[-.1,.1],[.1,.1],[.1,-.1]]]}];
test('contour fitting preserves source corners between sparse vertices',()=>{
 const segments=fitContour([[0,0,0],[10,0,0],[10,10,0],[0,10,0]],[0,0,1],.005);
 assert.equal(segments.length,4);assert.ok(segments.every(s=>s.type==='line'));
});
test('layered relief preserves lower fill inside upper details and one original host frame',()=>{
 const source=cad.makeBox([-10,-10,-3],[10,10,0]);let result;
 try{
  result=buildRelief(source,{faceId:faceIndex(source,[0,0,1]),widthMm:10,heightMm:10,depthMm:1,curveToleranceMm:.005,layers:[{name:'lower filled body',heightMm:.4,regions:[{outer:mask[0].outer}]},{name:'upper detail with shallow recess',heightMm:1,regions:mask}]},oc,cad);
  valid(result);assert.equal(result.reliefReport.layerCount,2);
  for(const [p,expected] of [[[0,0,.4],0],[[2,0,1],0],[[4,0,0],0]]){const v=cad.makeVertex(p);try{assert.ok(cad.measureDistanceBetween(result,v)<1e-6);}finally{dispose(v);}}
 }finally{dispose(result);dispose(source);}
});
test('open-stroke relief cuts round-ended lines on planar and cylindrical hosts',()=>{
 for(const curved of [false,true]){
  const source=curved?cad.makeCylinder(100,20).rotate(-90,[0,0,0],[1,0,0]).translate([0,-10,-100]):cad.makeBox([-10,-10,-3],[10,10,0]);let result;
  try{result=buildRelief(source,{faceId:curved?0:faceIndex(source,[0,0,1]),...(curved?{point:[0,0,0]}:{}),widthMm:10,heightMm:10,depthMm:.2,mode:'engrave',strokes:[{points:[[-.3,0],[.3,0]],widthMm:.4}],values:Array.from({length:4},()=>Array(4).fill(1)),curveToleranceMm:.005},oc,cad);valid(result);const point=cad.makeVertex([0,0,0]);try{assert.ok(cad.measureDistanceBetween(result,point)>.19);}finally{dispose(point);}}
  finally{dispose(result);dispose(source);}
 }
});
test('intersecting and overlapping relief strokes produce one clean engraved junction',()=>{
 const source=cad.makeCylinder(100,20).rotate(-90,[0,0,0],[1,0,0]).translate([0,-10,-100]);let result;
 try{
  const strokes=[{points:[[-.35,0],[.35,0]],widthMm:.4},{points:[[0,-.35],[0,.35]],widthMm:.4},{points:[[-.1,.01],[.3,.01]],widthMm:.4}];
  result=buildRelief(source,{faceId:0,point:[0,0,0],widthMm:10,heightMm:10,depthMm:.2,mode:'engrave',strokes,values:Array.from({length:4},()=>Array(4).fill(1)),curveToleranceMm:.005},oc,cad);
  valid(result);
  for(const p of [[0,0,0],[2,0,-.02],[0,2,0]]){const v=cad.makeVertex(p);try{assert.ok(cad.measureDistanceBetween(result,v)>.18,'junction and both branches remain engraved');}finally{dispose(v);}}
 }finally{dispose(result);dispose(source);}
});
test('actual masked footprint permits blank margins and protected holes on both supported surfaces',()=>{
 for(const cylindrical of [false,true]){
  const base=cylindrical?cad.makeCylinder(20,20):cad.makeBox([-10,-10,-4],[10,10,0]);
  const bore=cylindrical?cad.makeCylinder(2,10,[0,16,10],[0,1,0]):cad.makeCylinder(2,5,[0,0,-4]);
  const pierced=base.cut(bore);let result;
  try{
   const faceId=cylindrical?0:faceIndex(pierced,[0,0,1]);
   const params={faceId,...(cylindrical?{point:[0,20,17],offsetY:-7}:{}),widthMm:cylindrical?10:30,heightMm:cylindrical?10:30,depthMm:.4,surfaceMode:'smooth',values:Array.from({length:4},()=>Array(4).fill(1)),regions:[{outer:[[-.3,-.3],[.3,-.3],[.3,.3],[-.3,.3]],holes:[[[-.25,-.25],[-.25,.25],[.25,.25],[.25,-.25]]]}]};
   result=buildRelief(pierced,params,oc,cad);valid(result);assert.equal(result.reliefReport.background,'unchanged-host');
   const before=pierced.serialize();
   assert.throws(()=>buildRelief(pierced,{...params,regions:[{outer:[[-.3,-.3],[.3,-.3],[.3,.3],[-.3,.3]]}]},oc,cad),e=>e.code==='RELIEF_OUTSIDE_FACE');
   assert.equal(pierced.serialize(),before);
  }finally{[result,pierced,bore,base].forEach(dispose);}
 }
});

test('constant dense source grids build the same exact crest with four kernel controls',()=>{
 const base=cad.makeBox([-10,-10,-4],[10,10,0]);let result;
 const params={faceId:faceIndex(base,[0,0,1]),widthMm:10,heightMm:10,depthMm:.8,surfaceMode:'flat',values:Array.from({length:65},()=>Array(65).fill(1)),regions:[{outer:[[-.3,-.3],[.3,-.3],[.3,.3],[-.3,.3]]}]};
 try{result=buildRelief(base,params,oc,cad);valid(result);assert.equal(result.reliefReport.rows,65);assert.deepEqual(result.reliefReport.kernelGrid,{rows:4,columns:4});assert.equal(params.values.length,65);const faces=result.faces;try{assert.ok(faces.some(f=>f.geomType==='PLANE'&&Math.abs(f.center.z-.8)<1e-6));}finally{faces.forEach(dispose);}}
 finally{dispose(result);dispose(base);}
});

test('shallow cylindrical engraving covers a contour away from the tangent crown',()=>{
 const R=100,base=cad.makeCylinder(R,30).rotate(-90,[0,0,0],[1,0,0]).translate([0,-15,-R]);let result;
 try{
  result=buildRelief(base,{faceId:0,point:[0,0,0],widthMm:56,heightMm:10,depthMm:.2,surfaceMode:'smooth',mode:'engrave',values:Array.from({length:4},()=>Array(4).fill(1)),regions:[{outer:[[.42,-.3],[.47,-.3],[.47,.3],[.42,.3]]}]},oc,cad);valid(result);
  const u=25,vertex=cad.makeVertex([R*Math.sin(u/R),0,R*(Math.cos(u/R)-1)]);
  try{assert.ok(cad.measureDistanceBetween(result,vertex)>.19,'original curved surface at the far contour must be engraved');}finally{dispose(vertex);}
 }finally{dispose(result);dispose(base);}
});
test('flat mode uses analytic planes on planar hosts in both directions',()=>{
 for(const mode of ['emboss','engrave']){
  const base=cad.makeBox([-20,-20,-5],[20,20,0]);let result;
  try{result=buildRelief(base,{faceId:faceIndex(base,[0,0,1]),values,widthMm:12,heightMm:12,depthMm:1,surfaceMode:'flat',regions:mask,mode},oc,cad);valid(result);const faces=result.faces;try{assert.ok(faces.some(f=>f.geomType==='PLANE'&&Math.abs(f.center.z-(mode==='emboss'?1:-1))<1e-6));}finally{faces.forEach(dispose);}}
  finally{dispose(result);dispose(base);}
 }
});
test('contour relief preserves cylindrical background and holes and creates an exact flat crest',()=>{
 const source=cad.makeCylinder(270.166666666666,60).rotate(-90,[0,0,0],[1,0,0]).translate([0,-30,-270.166666666666]);
 const before=source.serialize();let result;
 const distance=(shape,point)=>{const vertex=cad.makeVertex(point);try{return cad.measureDistanceBetween(shape,vertex);}finally{dispose(vertex);}};
 try{
  result=buildRelief(source,{faceId:0,point:[0,0,0],values,widthMm:40,heightMm:40,depthMm:2.2,surfaceMode:'flat',regions:mask},oc,cad);valid(result);
  assert.equal(source.serialize(),before);
  const faces=result.faces;
  try{assert.ok(faces.some(f=>f.geomType==='PLANE'&&Math.abs(f.center.z-2.2)<1e-6),'crest is a real analytic plane');}finally{faces.forEach(dispose);}
  assert.ok(distance(result,[8,0,2.2])<1e-6,'letter interior has full requested height');
  assert.ok(distance(result,[0,0,.002])>.0019,'hole has no hidden rectangular base');
  const r=270.166666666666,z=Math.sqrt(r*r-18*18)-r;
  assert.ok(distance(result,[18,0,z+.002])>.0019,'blank image margin has no added material');
  assert.equal(result.reliefReport.background,'unchanged-host');
 }finally{dispose(result);dispose(source);}
});
test('masked smooth relief keeps holes and blank margins on planar and cylindrical hosts',()=>{
 for(const cylinder of [false,true])for(const mode of ['emboss','engrave']){
  const source=cylinder?cad.makeCylinder(20,40):cad.makeBox([-20,-20,-5],[20,20,0]);let result;
  const params={faceId:cylinder?0:faceIndex(source,[0,0,1]),...(cylinder?{point:[0,20,20]}:{}),values,widthMm:10,heightMm:10,depthMm:1,surfaceMode:'smooth',regions:mask,mode};
  try{result=buildRelief(source,params,oc,cad);valid(result);assert.equal(result.reliefReport.background,'unchanged-host');}
  finally{dispose(result);dispose(source);}
 }
});
function faceIndex(source,n){const faces=source.faces;try{return faces.findIndex(f=>{if(f.geomType!=='PLANE')return false;const normal=f.normalAt();try{return normal.toTuple().every((v,i)=>Math.abs(v-n[i])<1e-7);}finally{dispose(normal);}});}finally{faces.forEach(dispose);}}
function valid(s){const a=new oc.BRepCheck_Analyzer(s.wrapped,true,false,false),solids=s.solids;try{assert.ok(a.IsValid());assert.equal(solids.length,1);}finally{dispose(a);solids.forEach(dispose);}}
test('smooth multilevel relief and engraving on top, bottom and side preserve the source',()=>{
 for(const normal of [[0,0,1],[0,0,-1],[1,0,0]])for(const mode of ['emboss','engrave']){
  const source=cad.makeBox([0,0,0],[20,20,20]),before=source.serialize();let result;
  try{result=buildRelief(source,{faceId:faceIndex(source,normal),values,widthMm:10,heightMm:8,depthMm:1,mode,angleDeg:17},oc,cad);valid(result);assert.equal(source.serialize(),before);assert.ok(mode==='emboss'?cad.measureVolume(result)>8000:cad.measureVolume(result)<8000);assert.ok(result.reliefReport.valid);const faces=result.faces;try{assert.ok(faces.some(f=>f.geomType==='BSPLINE_SURFACE'));}finally{faces.forEach(dispose);}}
  finally{dispose(result);dispose(source);}
 }
});
test('outside face, face holes, curved targets and zero patterns reject without source changes',()=>{
 const cylinder=cad.makeCylinder(10,4),box=cad.makeBox([0,0,0],[20,20,4]),hole=cad.makeCylinder(2,5,[10,10,0]);let pierced=box.cut(hole);
 try{
  for(const [source,params,code]of [[box,{faceId:faceIndex(box,[0,0,1]),widthMm:24},'RELIEF_OUTSIDE_FACE'],[pierced,{faceId:faceIndex(pierced,[0,0,1])},'RELIEF_OUTSIDE_FACE'],[cylinder,{faceId:0},'RELIEF_UNSUPPORTED'],[box,{faceId:faceIndex(box,[0,0,1]),values:values.map(r=>r.map(()=>0))},'RELIEF_NO_CHANGE']]){
   const before=source.serialize();assert.throws(()=>buildRelief(source,{values,widthMm:10,heightMm:10,depthMm:1,...params},oc,cad),e=>e.code===code);assert.equal(source.serialize(),before);
  }
 }finally{[pierced,hole,box,cylinder].forEach(dispose);}
});

test('stored height controls rebuild without the image, edits recompute and a failed edit preserves cached geometry',async()=>{
 const kernel=new CadKernel(oc);
 const document={version:1,name:'Relief reconstruction test',features:[{id:'base',op:'box',params:{width:20,depth:20,height:4},refs:[]}],hidden:[],imports:{}};
 let stored,expected;
 try{
  await kernel.rebuild(document);
  const faceId=faceIndex(kernel.activeShape('base'),[0,0,1]);
  document.features.push({id:'relief',op:'relief',refs:['base'],params:{faceId,values,widthMm:12,heightMm:10,depthMm:1,source:{name:'no-longer-needed.svg',format:'svg'}}});
  const result=await kernel.rebuild(document),body=result.bodies[0];
  assert.equal(result.bodies.length,1);assert.equal(body.solidCount,1);
  assert.ok(Math.abs(body.volume-1600-body.reliefReport.addedMm3)<1e-7);
  stored=JSON.stringify(document);expected=body.volume;
  const edited=JSON.parse(stored);edited.features[1].params.depthMm=.5;
  const changed=await kernel.rebuild(edited);assert.ok(changed.bodies[0].volume>1600&&changed.bodies[0].volume<expected);
  const before=kernel.activeShape('relief').serialize(),invalid=structuredClone(edited);invalid.features[1].params.widthMm=40;
  await assert.rejects(kernel.rebuild(invalid),e=>e.code==='RELIEF_OUTSIDE_FACE');
  assert.equal(kernel.activeShape('relief').serialize(),before,'rejected edit leaves committed BREP intact');
 }finally{kernel.dispose();}
 const reopened=new CadKernel(oc);
 try{
  const result=await reopened.rebuild(JSON.parse(stored));
  assert.equal(result.bodies.length,1);assert.equal(result.bodies[0].solidCount,1);
  assert.ok(Math.abs(result.bodies[0].volume-expected)<1e-7,'JSON heightfield alone reproduces the solid');
 }finally{reopened.dispose();}
});

test('a compound with one solid plus unrelated loose geometry is not accepted as a closed target',()=>{
 const box=cad.makeBox([0,0,0],[20,20,4]),face=cad.makePolygon([[30,0,0],[32,0,0],[32,2,0],[30,2,0]]),compound=cad.makeCompound([box,face]);
 try{
  const before=compound.serialize();
  assert.throws(()=>buildRelief(compound,{faceId:0,values,widthMm:10,heightMm:10,depthMm:1},oc,cad),e=>e.code==='RELIEF_UNSUPPORTED');
  assert.equal(compound.serialize(),before);
 }finally{[compound,face,box].forEach(dispose);}
});

test('cylindrical relief uses the actual face and preserves one solid under rigid transforms',()=>{
 const base=cad.makeCylinder(20,40),moved=cad.deserializeShape(base.serialize()).rotate(31,[0,0,0],[1,2,0]).translate([23,-17,12]);
 const mapping=new cad.Transformation().rotate(31,[0,0,0],[1,2,0]);
 const mapped=mapping.transformPoint([0,20,20]),point=[mapped.X()+23,mapped.Y()-17,mapped.Z()+12];dispose(mapped);dispose(mapping);
 try{
  for(const mode of ['emboss','engrave']){
   const volumes=[];
   for(const [shape,anchor]of [[base,[0,20,20]],[moved,point]]){
    const faces=shape.faces;let faceId;try{faceId=faces.findIndex(f=>f.geomType==='CYLINDRE');}finally{faces.forEach(dispose);}
    const before=shape.serialize();let result;
    try{result=buildRelief(shape,{faceId,point:anchor,baseMm:.02,values,widthMm:20,heightMm:20,depthMm:1,mode},oc,cad);valid(result);assert.equal(shape.serialize(),before);assert.equal(result.reliefReport.kind,'cylindrical-bspline-heightfield');assert.equal(result.reliefReport.baseMm,.02);assert.ok((result.reliefReport.addedMm3||result.reliefReport.removedMm3)>0);volumes.push(result.reliefReport.addedMm3||result.reliefReport.removedMm3);}
    finally{dispose(result);}
   }
   assert.ok(Math.abs(volumes[0]-volumes[1])<.001,'rigid transform preserves material within 0.001 mm3');
  }
  for(const [extra,code]of [[{point:[20,0,20]},'RELIEF_OUTSIDE_FACE'],[{point:[0,20,39]},'RELIEF_OUTSIDE_FACE'],[{angleDeg:10},'RELIEF_UNSUPPORTED'],[{widthMm:40},'RELIEF_LIMIT'],[{baseMm:undefined},'RELIEF_LIMIT']]){
   const params={faceId:0,point:[0,20,20],baseMm:.02,values,widthMm:20,heightMm:20,depthMm:1,...extra};if(params.baseMm===undefined)delete params.baseMm;
   assert.throws(()=>buildRelief(base,params,oc,cad),e=>e.code===code);
  }
 }finally{dispose(moved);dispose(base);}
});

test('constant cylindrical height agrees with the analytic annular-sector volume across radii',()=>{
 const flat=Array.from({length:9},()=>Array(9).fill(1));
 for(const radius of [2,10,100])for(const mode of ['emboss','engrave']){
  const source=cad.makeCylinder(radius,4*radius),depthMm=radius*.05,baseMm=.005,heightMm=radius,widthMm=.8*radius,h=depthMm+baseMm,sign=mode==='engrave'?-1:1;
  const expected=Math.abs(.5*(widthMm/radius)*heightMm*((radius+sign*h)**2-radius**2));let result;
  try{
   result=buildRelief(source,{faceId:0,point:[0,radius,2*radius],values:flat,baseMm,depthMm,widthMm,heightMm,offsetX:.1*radius,offsetY:.1*radius,mode},oc,cad);valid(result);
   const actual=result.reliefReport.addedMm3||result.reliefReport.removedMm3;
   assert.ok(Math.abs(actual-expected)<Math.max(1e-6,expected*1e-8),`R${radius} ${mode}: ${actual} vs analytic ${expected}`);
  }finally{dispose(result);dispose(source);}
 }
});
