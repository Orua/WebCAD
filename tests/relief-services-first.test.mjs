// 261022-05: Services-first image conversion and first fit (browser keeps preview/fine-tune + fallback).
import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionalServicesFit} from '../src/relief-design-fit.js';
import {convertSourceOnServices,reliefServicesReady,sourceConvertLocal,sourceConvertWorkerParams,servicesControlResolution} from '../src/services/relief-pipeline.js';
import {designCase} from './fixtures/relief-services/cases.mjs';

test('provisional services-first net: no browser fit, locked controls are zero, never claims fit metrics',()=>{
 for(const name of ['box','disc']){
  const c=designCase(name),r=provisionalServicesFit(c.draft,c.solved,{mode:'emboss',controlColumns:9,controlRows:9,controlMaxMm:1.5,acceptanceToleranceMm:.1});
  assert.equal(r.provisional,true);assert.equal(r.fit.report.status,'services-first-provisional');
  assert.equal(r.fit.controlDeltasMm.length,33*33);
  r.fit.lockedControlMask.forEach((l,k)=>{if(l)assert.equal(r.fit.controlDeltasMm[k],0);});
  assert.ok(r.fit.lockedControlMask.some(Boolean)&&r.fit.controlDeltasMm.some(v=>v>0));
  assert.ok(r.fit.controlDeltasMm.every(v=>v>=0&&v<=1.5));
 }
});
const rgba=(w,h)=>{const a=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=(y*w+x)*4,v=Math.round(255*x/(w-1));a[k]=a[k+1]=a[k+2]=v;a[k+3]=255;}return a;};
function fakeClient(transform=r=>r){
 const calls=[];return {calls,upload:async(file,{kind})=>{calls.push(['upload',kind,file.size]);return {assetId:'a1',sha256:'s'};},
  submit:async(kind,payload)=>{calls.push(['submit',payload.operation,payload.semanticVersion,payload.strategy,payload.requiredResultFormat]);calls.payload=payload;return {jobId:'j1'};},
  wait:async()=>({manifest:{timings:{totalMs:1}},result:transform({grid:sourceConvertLocal(calls.rgba,calls.payload.params).grid})})};
}
test('source-convert on Services: raster upload, exact operation tuple, grid hash re-verified; tampering rejected',async()=>{
 const img=rgba(37,23),params=sourceConvertWorkerParams({width:37,height:23,settings:{version:1,columns:29,rows:17,crop:{x:0,y:0,width:1,height:1},levels:{black:0,white:1},gamma:1,blurPx:0,invert:false},depthMm:1.2,machiningPrecisionMm:.2});
 const ctx={documentId:'d',documentInstanceId:'i',revision:3};
 const c=fakeClient();c.calls.rgba=img;
 const out=await convertSourceOnServices({rgba:img,params,context:ctx,imageSha256:'f'.repeat(64),client:c});
 assert.deepEqual(c.calls[0],['upload','raster',37*23*4]);
 assert.deepEqual(c.calls[1],['submit','reliefSourceConvert','relief.source-convert-1','rgba-area-average','relief-height-grid-u16le-v1']);
 assert.equal(out.grid.sha256,sourceConvertLocal(img,params).grid.sha256);
 const bad=fakeClient(r=>({grid:{...r.grid,sha256:'0'.repeat(64)}}));bad.calls.rgba=img;
 await assert.rejects(convertSourceOnServices({rgba:img,params,context:ctx,imageSha256:'f'.repeat(64),client:bad}),e=>e.code==='SERVICES_RESPONSE_INVALID');
 const wrong=fakeClient(r=>({grid:{...r.grid,columns:28}}));wrong.calls.rgba=img;
 await assert.rejects(convertSourceOnServices({rgba:img,params,context:ctx,imageSha256:'f'.repeat(64),client:wrong}),e=>e.code==='SERVICES_RESPONSE_INVALID');
});
test('readiness: unconfigured or failing Services means browser fallback',async()=>{
 assert.equal(await reliefServicesReady('reliefSourceConvert',{config:{configured:false}}),false);
 assert.equal(await reliefServicesReady('reliefSourceConvert',{config:{configured:true},client:{capabilities:async()=>{throw new Error('down');}}}),false);
 assert.equal(await reliefServicesReady('reliefSourceConvert',{config:{configured:true},client:{capabilities:async()=>({operations:[{operation:'reliefSourceConvert'}]})}}),true);
 assert.equal(await reliefServicesReady('reliefDesign',{config:{configured:true},client:{capabilities:async()=>({operations:[{operation:'reliefDesign',kernelBuildId:'native-occt@7.8.1:sha256:'+'0'.repeat(64)}]})}}),false,'unverified kernel -> fallback');
 assert.equal(servicesControlResolution(33,21),21);
});
