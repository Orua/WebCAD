import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {measureVolume,getOC} from 'replicad';
test('slider rolling-ball R is independent of wire diameter and retains one solid',async()=>{
 const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
 const params={kind:'sliderBuckle',section:'round',sectionSize:4,barDiameter:4,innerWidth:42,innerHeight:22,innerRadius:.5,barOffset:0,gapWidth:0,jointStyle:'rollingBall',jointRadius:1};
 const rebuild=p=>kernel.rebuild({version:1,features:[{id:'slider',op:'quickModel',params:p,refs:[]}],imports:{},hidden:[]});
 try{
  const first=await rebuild(params),body=first.bodies[0],report=body.sourceJunctionReport;
  assert.equal(body.solidCount,1);assert.equal(report.radiusMm,1);assert.equal(report.independentRadius,true);assert.ok(report.maxBallResidualMm<1e-7);
  const volume=measureVolume(kernel.activeShape('slider'));
  assert.ok(Math.abs(volume-2293.10812)<.001,`source1 volume ${volume}`);
  if(process.env.WEBCAD_JUNCTION_EVIDENCE_DIR)fs.writeFileSync(process.env.WEBCAD_JUNCTION_EVIDENCE_DIR+'/rolling-r1.brep',kernel.activeShape('slider').serialize());
  const second=await rebuild({...params,jointRadius:1.2});const secondVolume=measureVolume(kernel.activeShape('slider'));assert.equal(second.bodies[0].solidCount,1);assert.equal(second.bodies[0].sourceJunctionReport.radiusMm,1.2);assert.ok(secondVolume>volume);
  assert.equal(second.bodies[0].sourceJunctionReport.wireDiameterMm,4);
  if(process.env.WEBCAD_JUNCTION_EVIDENCE_DIR)fs.writeFileSync(process.env.WEBCAD_JUNCTION_EVIDENCE_DIR+'/rolling-r1_2.brep',kernel.activeShape('slider').serialize());
  console.log(JSON.stringify({r1:volume,r1_2:secondVolume,report:second.bodies[0].sourceJunctionReport}));
 }finally{kernel.dispose();}
});

test('rod-junction machining applies the same independent R to the real slider T joint',async()=>{
 const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
 const base={id:'base',op:'quickModel',params:{kind:'sliderBuckle',section:'round',sectionSize:4,barDiameter:4,innerWidth:42,innerHeight:22,innerRadius:.5,barOffset:0,gapWidth:0,jointStyle:'intersection'},refs:[]};
 try{
  await kernel.rebuild({version:1,features:[base],imports:{},hidden:[]});
  const oc=getOC(),faces=kernel.activeShape('base').faces;let main=-1,bar=-1;
  for(let i=0;i<faces.length;i++){const a=new oc.BRepAdaptor_Surface(faces[i].wrapped,true);try{if(a.GetType()!==oc.GeomAbs_SurfaceType.GeomAbs_Cylinder)continue;const c=a.Cylinder(),axis=c.Axis(),d=axis.Direction(),o=axis.Location();try{if(Math.abs(d.Y())>.99&&Math.abs(o.X()-23)<1e-6)main=i;if(Math.abs(d.X())>.99&&Math.abs(o.Y())<1e-6)bar=i;}finally{[c,axis,d,o].forEach(x=>x.delete());}}finally{a.delete();}}
  faces.forEach(x=>x.delete());assert.ok(main>=0&&bar>=0);const before=measureVolume(kernel.activeShape('base'));
  const result=await kernel.rebuild({version:1,features:[base,{id:'machined',op:'rodJunction',params:{faceIds:[main,bar],radiusMm:1.2},refs:['base']}],imports:{},hidden:[]});
  const body=result.bodies.find(b=>b.id==='machined');assert.equal(body.solidCount,1);assert.equal(body.sourceJunctionReport.radiusMm,1.2);assert.equal(body.sourceJunctionReport.junctionCount,1);assert.ok(measureVolume(kernel.activeShape('machined'))>before);
  console.log(JSON.stringify({tool:'rodJunction',faces:[main,bar],report:body.sourceJunctionReport}));
 }finally{kernel.dispose();}
});
