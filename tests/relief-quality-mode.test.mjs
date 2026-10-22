// Relief quality mode (fit.quality v1): browser target reference == native relief_quality.hxx (golden fixture),
// precision semantics, draft/plan wiring and independent verification of a Services result.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {decodeQualitySource,buildQualityTarget,finestControlSpacing,evaluateQualitySurface} from '../src/relief-design-core/quality-target.mjs';
import {reliefQualityParams,verifyServicesQualityFit} from '../src/services/relief-pipeline.js';
import {validateReliefDesign} from '../src/relief-design-drafts.js';
const fx=JSON.parse(fs.readFileSync(new URL('./fixtures/relief-quality-small.json',import.meta.url)));
const f64=b=>{const u=Buffer.from(b,'base64');return Array.from({length:u.length/8},(_,i)=>u.readDoubleLE(i*8));};
const P=fx.params,q=P.quality,W=P.field.widthMm,H=P.field.heightMm;
const target=spacing=>buildQualityTarget({source:decodeQualitySource(q),domain:P.domain,widthMm:W,heightMm:H,baselineMm:0,upperMm:q.depthMm,precisionMm:q.machiningPrecisionMm,controlSpacingMm:spacing});
test('browser quality target reproduces the native target bit-for-bit (golden)',()=>{
 const t=target(fx.target0_25.spacingMm),g=fx.target0_25,h=f64(g.hF64LE);
 assert.equal(t.C,g.C);assert.equal(t.R,g.R);let max=0;
 for(let k=0;k<h.length;k++){max=Math.max(max,Math.abs(t.h[k]-h[k]));assert.equal(t.active[k],+g.active[k]);assert.equal(t.fixed[k],+g.fixed[k]);}
 assert.ok(max<1e-9,'max diff '+max);
});
test('precision filter: detail below precision fades, detail above precision is kept, baseline zones stay exact',()=>{
 const t=target(.25),at=(x,y)=>{const i=Math.round((x+W/2)/t.pitchX),j=Math.round((y+H/2)/t.pitchY);return t.h[j*t.C+i];};
 const dome=(x,y)=>(at(x-1.2,y)+at(x+1.2,y))/2;
 assert.ok(at(-4,0)-dome(-4,0)>.17,'0.2 mm ridge kept: '+(at(-4,0)-dome(-4,0)));   // >= precision: kept
 assert.ok(Math.abs(at(4,0)-dome(4,0))<.018,'0.02 mm ridge attenuated: '+(at(4,0)-dome(4,0)));  // < precision on a slope: attenuated (only isolated extrema are levelled fully)
 const j=Math.round((-5+H/2)/t.pitchY),i=Math.round(W/2/t.pitchX);assert.equal(t.fixed[j*t.C+i],1);assert.equal(t.h[j*t.C+i],0);
 // smooth transition: no step larger than the slope allows between neighbours
 let jump=0;for(let jj=1;jj<t.R;jj++)for(let ii=1;ii<t.C;ii++){const k=jj*t.C+ii;if(t.active[k]&&t.active[k-1])jump=Math.max(jump,Math.abs(t.h[k]-t.h[k-1]));}
 assert.ok(jump<.2,'max neighbour jump '+jump);
});
test('finest spacing derives from size, capacity, source pixels and precision',()=>{
 const s=decodeQualitySource(q);assert.equal(finestControlSpacing({widthMm:W,heightMm:H,source:s,precisionMm:.05,maxControlSide:48}),24/45);
 assert.equal(finestControlSpacing({widthMm:W,heightMm:H,source:s,precisionMm:.2,maxControlSide:513}),.2);
 assert.equal(finestControlSpacing({widthMm:W,heightMm:H,source:{columns:4000,rows:3000},precisionMm:.01,maxControlSide:513}),24/510);
 assert.equal(finestControlSpacing({widthMm:W,heightMm:H,source:{columns:4000,rows:3000},precisionMm:.01,maxControlSide:1025}),24/1022);
});

test('capacity retry metadata cannot change the requested precision target arbitrarily',()=>{
 const report={reliefDesign:{fit:structuredClone(fx.fit),qualityCapacityRetry:{fromMaxControlSide:q.maxControlSide,toMaxControlSide:513,reason:'RELIEF_QUALITY_CHECK_FAILED'}}};
 assert.throws(()=>verifyServicesQualityFit(P,report),/容量重试记录/);
});
test('Services quality result is re-verified independently; tampering is rejected',()=>{
 const report={reliefDesign:{fit:structuredClone(fx.fit)}},params={...P};
 const v=verifyServicesQualityFit(params,report);assert.equal(v.verified,true);assert.ok(v.checkedSamples>1000);assert.ok(v.resampledMaxMm<=fx.fit.report.metrics.training.maxMm+1e-6);
 const bad=structuredClone(report);bad.reliefDesign.fit.report.metrics.training.maxMm=v.resampledMaxMm/4;assert.throws(()=>verifyServicesQualityFit(params,bad),/大于服务器报告值/);
 const bad2=structuredClone(report);const d=f64(bad2.reliefDesign.fit.controlDeltasF64LE);d[d.length>>1]+=.5;bad2.reliefDesign.fit.controlDeltasF64LE=Buffer.from(new Float64Array(d).buffer).toString('base64');assert.throws(()=>verifyServicesQualityFit(params,bad2),/哈希/);
 const z=evaluateQualitySurface(f64(fx.fit.controlDeltasF64LE),fx.fit.columns,fx.fit.rows,W,H,[-W/2,0,W/2],[-H/2,0,H/2]);assert.equal(z[0],0);assert.equal(z[8],0);
});
test('draft wiring: quality block only for pure image reliefs; advanced setting can switch it off',()=>{
 const base={schemaVersion:1,name:'q',support:{kind:'rect',centerMm:[0,0],widthMm:W,heightMm:H},throughHoles:[],protectedZones:[],heightRangeMm:[0,2],points:[],fieldSettings:{columns:33,rows:33,machiningPrecisionMm:.08}};
 assert.equal(reliefQualityParams(base),null);
 const hs={source:{version:1,interpretation:'authoredHeightMap',original:{sha256:'a'.repeat(64),name:'x.png'},settings:null,settingsHash:'',grid:null},depthMm:1.6};
 // build a valid height source through the real constructor
 return import('../src/relief-source/source.js').then(async({createReliefHeightSource})=>{const {encodeHeightGrid,normalizeConvertSettings}=await import('../src/relief-source/convert.js');
  const s=normalizeConvertSettings({columns:8,rows:6}),grid=encodeHeightGrid({columns:8,rows:6,values:new Float32Array(48).fill(.5)});
  hs.source=createReliefHeightSource({original:{sha256:'a'.repeat(64),name:'x.png'},interpretation:'authoredHeightMap',settings:s,grid});
  const d=validateReliefDesign({...base,heightSource:hs});const r=reliefQualityParams(d);
  assert.equal(r.version,1);assert.equal(r.machiningPrecisionMm,.08);assert.equal(r.maxControlSide,1025);assert.equal(r.source.columns,8);assert.equal(r.depthMm,1.6);
  assert.equal(reliefQualityParams({...d,fieldSettings:{...d.fieldSettings,servicesQuality:{mode:'off'}}}),null);
  assert.equal(reliefQualityParams({...d,points:[{id:'p',pointMm:[0,0],heightMm:1}]}),null);
  assert.equal(reliefQualityParams({...d,fieldSettings:{...d.fieldSettings,servicesQuality:{maxControlSide:200}}}).maxControlSide,200);
  assert.throws(()=>validateReliefDesign({...d,fieldSettings:{...d.fieldSettings,servicesQuality:{maxControlSide:1100}}}),/16–1025/);
 });
});
test('import grid auto-size: physical need clamped 129–1025, never denser than source pixels, aspect kept',async()=>{
 const {autoGridSize}=await import('../src/relief-source/convert.js'),{heightPanelRequest}=await import('../src/ui/forms/relief-design-height-panel.js');
 assert.deepEqual(autoGridSize({width:900,height:720,sizeMm:[50,40],precisionMm:.05}),{columns:900,rows:720});      // source-pixel bound
 assert.deepEqual(autoGridSize({width:4000,height:2000,sizeMm:[50,25],precisionMm:.05}),{columns:1001,rows:500});    // physical need
 assert.deepEqual(autoGridSize({width:4000,height:4000,sizeMm:[200,200],precisionMm:.05}),{columns:1025,rows:1025}); // capacity
 assert.deepEqual(autoGridSize({width:4000,height:3000,sizeMm:[5,4],precisionMm:.05}),{columns:129,rows:97});        // floor 129
 assert.deepEqual(autoGridSize({width:60,height:40,sizeMm:[50,40],precisionMm:.05}),{columns:60,rows:40});           // tiny image: never upsample
 const base={black:'0',white:'1',gamma:'1',blur:'0',invert:false,depth:'1',keepout:'0',fade:'0'};
 assert.deepEqual(heightPanelRequest({...base,columns:''},{image:{width:900,height:720},sizeMm:[50,40],precisionMm:.05}).settings.columns,900);
 const o=heightPanelRequest({...base,columns:'300'},{image:{width:900,height:720}}).settings;assert.equal(o.columns,300);assert.equal(o.rows,240);
 assert.throws(()=>heightPanelRequest({...base,columns:''}),/自动网格/);
});
