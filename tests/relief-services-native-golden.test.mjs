// 261022-04 golden tests: Services occt-worker output vs the browser reference modules.
// Committed fixtures were produced by the native worker; when WEBCAD_SERVICES_OCCT_WORKER (and
// RELIEF_SOURCE_DIR with box.brep/disc.brep) are set, the worker is also re-run live.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
import {fitMaskedReliefBSpline} from '../src/relief-design-core/masked-bspline-fit.mjs';
import {verifyServicesFit,controlDeltasSha256,sourceConvertLocal,designFitWorkerParams,RELIEF_SERVICES_OPERATIONS} from '../src/services/relief-pipeline.js';
import {designCase} from './fixtures/relief-services/cases.mjs';
const F=p=>JSON.parse(fs.readFileSync(new URL('./fixtures/relief-services/'+p,import.meta.url),'utf8'));
const golden=F('golden-design-33.json'),convert=F('golden-convert.json'),quality=F('quality-129-257.json');
const browserFit=params=>fitMaskedReliefBSpline({...params.fit,field:params.field,domain:params.domain,baselineMm:params.baselineMm,maxControlPoints:4225,maxWork:200000000});

test('design-fit-brep @33: native control deltas equal the browser fit bit-for-bit (box / disc+hole / circle-on-box)',()=>{
 for(const g of golden.cases){
  const {params}=designCase(g.name),b=browserFit(params);
  assert.equal(b.controlDeltasMm.length,g.controlDeltasMm.length,g.name);
  let max=0;b.controlDeltasMm.forEach((v,k)=>{max=Math.max(max,Math.abs(v-g.controlDeltasMm[k]));});
  assert.equal(max,0,g.name+' max control diff '+max);
  assert.deepEqual(Array.from(b.lockedControlMask),g.lockedControlMask,g.name+' locks');
  assert.equal(b.report.iterations,g.iterations,g.name+' iterations');
  assert.equal(controlDeltasSha256(b.controlDeltasMm),g.controlDeltasSha256,g.name+' control hash');
  // browser re-verification accepts the native result
  const v=verifyServicesFit(params,{reliefDesign:{fit:{columns:params.fit.controlColumns,rows:params.fit.controlRows,widthMm:params.field.widthMm,heightMm:params.field.heightMm,controlDeltasMm:g.controlDeltasMm,lockedControlMask:g.lockedControlMask,controlDeltasSha256:g.controlDeltasSha256}}});
  assert.ok(v.verified&&v.resampledMaxMm<=.1,g.name);
  // exact trimming: host boundary edges kept, fitted surface on the plane at every retained boundary
  assert.equal(g.boundaryDeviationMm,0,g.name);assert.ok(g.quality.consistent,g.name);assert.ok(g.validation.valid&&g.validation.solidCount===1);
 }
 assert.deepEqual(golden.cases.map(c=>c.trim),['whole-selected-face-host-boundary','whole-selected-face-host-boundary','analytic-support-outline-plus-host-boundary']);
 assert.deepEqual(golden.cases[1].boundaryEdgeKinds,['circle'],'disc: outer rim + real hole are exact circles, no staircase');
});

test('browser re-verification rejects tampered Services results',()=>{
 const g=golden.cases[0],{params}=designCase('box'),base={columns:33,rows:33,widthMm:30,heightMm:30,controlDeltasMm:[...g.controlDeltasMm],lockedControlMask:g.lockedControlMask,controlDeltasSha256:g.controlDeltasSha256};
 const tampered={...base,controlDeltasMm:base.controlDeltasMm.map((v,k)=>k===500?v+.3:v)};
 assert.throws(()=>verifyServicesFit(params,{reliefDesign:{fit:tampered}}),e=>e.code==='SERVICES_RESPONSE_INVALID');
 params.fit.deviationPolicy='strict';
 const rehashed={...tampered,controlDeltasSha256:controlDeltasSha256(tampered.controlDeltasMm)};
 assert.throws(()=>verifyServicesFit(params,{reliefDesign:{fit:rehashed}}),/复核偏差|锁定/);
 assert.throws(()=>verifyServicesFit(params,{reliefDesign:{fit:{...base,columns:17}}}),e=>e.code==='SERVICES_RESPONSE_INVALID');
});

test('source-convert: native grid sha256 equals the browser modules (plain, precision 0.05, precision 0.2)',()=>{
 const rgba=new Uint8Array(Buffer.from(convert.rgbaBase64,'base64'));
 for(const c of convert.cases){const local=sourceConvertLocal(rgba,c.params);assert.equal(local.grid.sha256,c.nativeGridSha256,c.name);if(c.nativePrecision)assert.equal(local.precision.changedNodeCount,c.nativePrecision.changedNodeCount,c.name);}
 assert.notEqual(convert.cases[1].nativeGridSha256,convert.cases[2].nativeGridSha256,'precision value changes the grid');
});

test('quality @129 and @257 (native, recorded on the box): within tolerance, exact trim, consistent volume, timing targets',()=>{
 for(const q of quality.cases){
  assert.ok(q.ok&&q.valid&&q.solidCount===1,q.case);
  assert.ok(q.independentMaxMm<=q.acceptanceToleranceMm&&q.trainingMaxMm<=q.acceptanceToleranceMm,q.case);
  assert.ok(q.protectionMaxMm<=1e-9&&q.boundaryDeviationMm===0&&q.maxTrimEdgeToleranceMm<=1e-6,q.case);
  assert.ok(q.quality.consistent,q.case);
  const side=+q.case.split('-')[1];assert.ok(q.timingsMs.total<=(side<=129?8000:20000),q.case+' '+q.timingsMs.total+' ms');
 }
});

const worker=process.env.WEBCAD_SERVICES_OCCT_WORKER,sources=process.env.RELIEF_SOURCE_DIR;
test('live native worker re-run @33 (skipped without WEBCAD_SERVICES_OCCT_WORKER)',{skip:!(worker&&sources&&fs.existsSync(worker))},()=>{
 for(const name of ['box','disc']){
  const c=designCase(name),dir=fs.mkdtempSync(path.join(os.tmpdir(),'relief-live-')),req={...RELIEF_SERVICES_OPERATIONS.designFitBrep,params:{...c.params,faceIntent:c.params.faceIntent},sourcePath:path.join(sources,c.source),outputPath:dir+'/g.brep',reportPath:dir+'/r.json',inputFingerprint:'live',featureId:'f',expectedRevision:1};
  fs.writeFileSync(dir+'/q.json',JSON.stringify(req));try{execFileSync(worker,[dir+'/q.json']);}catch{}
  const rep=JSON.parse(fs.readFileSync(dir+'/r.json','utf8'));assert.ok(rep.ok,rep.message);
  assert.equal(rep.reliefDesign.fit.controlDeltasSha256,golden.cases.find(g=>g.name===name).controlDeltasSha256);
  assert.ok(fs.readFileSync(dir+'/g.brep.step','latin1').includes('B_SPLINE_SURFACE'));
 }
});

test('f64le controls retain tiny values across .NET JSON decimal rounding; tampered bytes reject',()=>{
 const g=golden.cases[0],{params}=designCase('box'),values=[...g.controlDeltasMm];
 const k=values.findIndex((v,i)=>!g.lockedControlMask[i]&&v>0);values[k]=2.2782947378101902e-105;
 const encoded=Buffer.from(new Float64Array(values).buffer).toString('base64');
 const fit={columns:33,rows:33,widthMm:30,heightMm:30,controlDeltasMm:values.map(v=>Number(v.toPrecision(16))),lockedControlMask:g.lockedControlMask,controlDeltasSha256:controlDeltasSha256(values),controlDeltasF64LE:encoded};
 assert.ok(verifyServicesFit(params,{reliefDesign:{fit}}).verified);
 const bytes=Buffer.from(encoded,'base64');bytes[0]^=1;
 assert.throws(()=>verifyServicesFit(params,{reliefDesign:{fit:{...fit,controlDeltasF64LE:bytes.toString('base64')}}}),e=>e.code==='SERVICES_RESPONSE_INVALID');
});
