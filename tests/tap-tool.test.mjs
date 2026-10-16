import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';

test('tap creates real blind threads on top, side and oblique faces; invalid cuts preserve source',async()=>{
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
 const base={version:2,features:[{id:'box',op:'box',params:{width:12,depth:12,height:10},refs:[]}],imports:{}};
 const dispose=x=>{try{x?.delete?.();}catch{}};
 const findFace=(shape,point)=>{const faces=shape.faces,vertex=cad.makeVertex(point);try{return faces.findIndex(face=>face.geomType==='PLANE'&&cad.measureDistanceBetween(face,vertex)<1e-6);}finally{faces.forEach(dispose);dispose(vertex);}};
 try{
  for(const [threadSize,point,pitch] of [['M2',[6,6,10],.4],['M2.5',[12,6,5],.45],['M3',[6,6,0],.5]]){
   await kernel.rebuild(base);const faceId=findFace(kernel.activeShape('box'),point);assert.ok(faceId>=0);
   const doc={...base,features:[...base.features,{id:'tap',op:'tap',params:{faceId,point,threadSize,depthMm:2},refs:['box']}]};
   await kernel.rebuild(doc);const shape=kernel.activeShape('tap'),r=shape.threadReport,volume=kernel.measure('tap').volume;
   assert.equal(r.nominalMetricSize,threadSize);assert.equal(r.pitchMm,pitch);assert.equal(r.tappingDepthMm,2);
   const diameter=Number(threadSize.slice(1)),pilot=Math.PI*(diameter/2-.54*pitch)**2*2,major=Math.PI*(diameter/2)**2*2;
   assert.ok(1440-volume>pilot+1e-3,'helical groove removes more than plain pilot bore');assert.ok(1440-volume<major,'thread teeth remain');
   const check=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);assert.ok(check.IsValid());check.delete();
   // JSON roundtrip models save/open, and changed depth models history edit.
   await kernel.rebuild(JSON.parse(JSON.stringify(doc)));assert.ok(Math.abs(kernel.measure('tap').volume-volume)<1e-6);
   doc.features[1].params.depthMm=3;await kernel.rebuild(doc);assert.ok(kernel.measure('tap').volume<volume);
   if(threadSize==='M2'){
    const tapped=kernel.activeShape('tap'),probeRadius=.008,probeVolume=4*Math.PI*probeRadius**3/3;
    // Probe both sides of turn boundaries. A per-turn axial clip loses the
    // overlapping caps and would leave material in these nominal V grooves.
    for(const z of [.375,.425,.775,.825,2.975])for(const tooth of [false,true]){
     const angle=2*Math.PI*z/pitch+(tooth?Math.PI:0),probe=cad.makeSphere(probeRadius).translate([6+.92*Math.cos(angle),6-.92*Math.sin(angle),10-z]);
     let common;try{common=tapped.intersect(probe);const material=cad.measureVolume(common);assert.ok(tooth?Math.abs(material-probeVolume)<probeVolume*.01:material<probeVolume*.01,`continuous thread material at depth ${z}, tooth=${tooth}`);}finally{dispose(common);dispose(probe);}
    }
    const bottom=cad.makeSphere(probeRadius).translate([6.92,6,6.975]);let common;
    try{common=tapped.intersect(bottom);assert.ok(Math.abs(cad.measureVolume(common)-probeVolume)<probeVolume*.01,'material past requested blind depth is preserved');}finally{dispose(common);dispose(bottom);}
   }

  }
  const rotated={...base,features:[...base.features,{id:'rot',op:'transform',params:{ry:30},refs:['box']}]};
  await kernel.rebuild(rotated);const point=[6*Math.cos(Math.PI/6)+10*Math.sin(Math.PI/6),6,-6*Math.sin(Math.PI/6)+10*Math.cos(Math.PI/6)],faceId=findFace(kernel.activeShape('rot'),point);
  await kernel.rebuild({...rotated,features:[...rotated.features,{id:'tap',op:'tap',params:{faceId,point,threadSize:'M3',depthMm:2},refs:['rot']}]});
  assert.ok(Math.abs(kernel.activeShape('tap').threadReport.axisDirection[0]+.5)<1e-6);
  await kernel.rebuild(base);const top=findFace(kernel.activeShape('box'),[6,6,10]);
  for(const params of [{point:[6,6,10],depthMm:11},{point:[.2,6,10],depthMm:2},{point:[6,6,11],depthMm:2}]){
   await assert.rejects(kernel.rebuild({...base,features:[...base.features,{id:'tap',op:'tap',params:{faceId:top,threadSize:'M3',...params},refs:['box']}]}),/攻牙/);
   await kernel.rebuild(base);assert.ok(Math.abs(kernel.measure('box').volume-1440)<1e-6);
  }
 }finally{kernel.dispose();}
});
