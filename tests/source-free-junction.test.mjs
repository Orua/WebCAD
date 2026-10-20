import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {checkpointReports,restoreCheckpointReports} from '../src/local-checkpoint-reports.js';
import {bodyState} from '../src/body-state.js';

test('source 1 fixed-R junction preserves the real source R and supports independent frame dimensions',async()=>{
 const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
 const params={kind:'sliderBuckle',section:'round',sectionSize:4,barDiameter:4,innerWidth:42,innerHeight:22,innerRadius:.5,barOffset:0,gapWidth:0,jointStyle:'sourceFixedR'};
 const rebuild=p=>kernel.rebuild({version:1,features:[{id:'fixed',op:'quickModel',params:p,refs:[]}],imports:{},hidden:[]});
 try{
  const result=await rebuild(params),body=result.bodies[0],shape=kernel.activeShape('fixed'),report=body.sourceJunctionReport;
  assert.equal(result.bodies.length,1);assert.equal(body.solidCount,1);assert.ok(Math.abs(body.volume-2293.108203790787)<1e-4,`volume ${body.volume}`);
  assert.equal(report.fixedRadius,true);assert.equal(report.radiusMm,1);assert.equal(report.sourceFile,'1.stp');assert.equal(report.radiusRule,'wireDiameter/4');
  assert.deepEqual(bodyState(body).sourceJunctionReport,report);
  assert.deepEqual(restoreCheckpointReports({},checkpointReports(shape)).sourceJunctionReport,report);
  if(process.env.WEBCAD_JUNCTION_EVIDENCE_DIR)fs.writeFileSync(process.env.WEBCAD_JUNCTION_EVIDENCE_DIR+'/source1-reconstructed.brep',shape.serialize());
  const changed=await rebuild({...params,innerWidth:54,innerHeight:34,sectionSize:3,barDiameter:3,innerRadius:1.2,barOffset:1});
  assert.equal(changed.bodies[0].solidCount,1);assert.equal(changed.bodies[0].sourceJunctionReport.radiusMm,.75);
 }finally{kernel.dispose();}
});

test('source 3 junction retains the real NURBS blend, source datum and local bulge',async()=>{
 const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
 const params={kind:'sliderBuckle',section:'round',sectionSize:4,barDiameter:4,innerWidth:42,innerHeight:22,innerRadius:.5,barOffset:0,gapWidth:0,jointStyle:'sourceFree',jointRadius:1};
 const feature=p=>({id:'source3',op:'quickModel',params:p,refs:[],placement:{version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'},sourcePoint:null,frameSnapshot:{origin:[0,0,0],quaternion:[0,0,0,1]}}});
 const rebuild=p=>kernel.rebuild({version:1,features:[feature(p)],imports:{},hidden:[]});
 const size=shape=>{const box=shape.boundingBox;try{return box.bounds[1].map((v,i)=>v-box.bounds[0][i]);}finally{box.delete();}};
 try{
  const result=await rebuild(params),body=result.bodies[0],shape=kernel.activeShape('source3'),bounds=size(shape),report=body.sourceFreeJunctionReport;
  assert.equal(result.bodies.length,1);assert.equal(body.solidCount,1);
  // Adaptive integration of the supplied STEP, not the original coarse default.
  assert.ok(Math.abs(body.volume-2300.8015142076515)<1e-4,`volume ${body.volume}`);
  assert.ok(Math.abs(bounds[0]-50)<1e-5&&Math.abs(bounds[1]-30)<1e-5&&Math.abs(bounds[2]-4.147562449632122)<1e-5);
  assert.equal(report.sourceSha256,'6c52ade3d2c584f32bdc86ad66fdf17fe91f85c3aabcfe3024379fb8a5464250');
  assert.equal(report.fixedRadius,false);assert.equal(report.sourceBlendFaceCount,8);assert.equal(report.sourceFrameOffsetYmm,-.07889635053);
  assert.deepEqual(bodyState(body).sourceFreeJunctionReport,report);
  const saved=checkpointReports(shape),restored=restoreCheckpointReports({},saved);assert.deepEqual(restored.sourceFreeJunctionReport,report);
  // One related full-product trial: change W/H, wire, corner R and bar offset;
  // a uniform whole-sample scale could not satisfy these independent dimensions.
  const changed=await rebuild({...params,innerWidth:54,innerHeight:34,sectionSize:3,barDiameter:3,innerRadius:1.2,barOffset:1}),changedBody=changed.bodies[0],changedSize=size(kernel.activeShape('source3'));
  assert.equal(changedBody.solidCount,1);assert.ok(Math.abs(changedSize[0]-60)<1e-5&&Math.abs(changedSize[1]-40)<1e-5&&Math.abs(changedSize[2]-4.147562449632122*.75)<1e-5);
  assert.equal(changedBody.sourceFreeJunctionReport.uniformWireScale,.75);
  assert.equal(changedBody.sourceFreeJunctionReport.barOffsetRelativeToFrameCenterMm,1+.07889635053*.75);
  await assert.rejects(rebuild({...params,barDiameter:3}),/等径/);
  await assert.rejects(rebuild({...params,innerHeight:8}),/容纳不下/);
 }finally{kernel.dispose();}
});
