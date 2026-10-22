import test from 'node:test';
import assert from 'node:assert/strict';
import {RELIEF_PIPELINE_CONTRACTS,sourceConvertRequest,designFitBrepRequest,validatePipelineResponse,routeReliefPipeline,runSourceConvertLocally,runDesignFitLocally,runReliefPipeline} from '../src/services/relief-pipeline.js';
import {convertRgbaToHeightGrid} from '../src/relief-source/convert.js';
const sha='a'.repeat(64);
const draft=p=>({schemaVersion:1,name:'d',support:{kind:'rect',centerMm:[0,0],widthMm:20,heightMm:20},throughHoles:[],protectedZones:[],heightRangeMm:[0,1],points:[],fieldSettings:{columns:17,rows:17,machiningPrecisionMm:p,edits:[{mode:'raise',centerMm:[0,0],radiusMm:4,amountMm:.6,strength:1}]}});
const fitOptions={mode:'emboss',controlColumns:9,controlRows:9,controlMaxMm:1,acceptanceToleranceMm:.2};

test('contracts: stable hashed requests; precision bounds 0.01–0.5 enforced; response must match',()=>{
 const a=sourceConvertRequest({sha256:sha,width:4,height:4,settings:{columns:4,rows:4}}),b=sourceConvertRequest({sha256:sha,width:4,height:4,settings:{rows:4,columns:4}});
 assert.equal(a.contract,RELIEF_PIPELINE_CONTRACTS.sourceConvert);assert.equal(a.requestHash,b.requestHash);
 const r1=designFitBrepRequest({draft:draft(.05),fitOptions}),r2=designFitBrepRequest({draft:draft(.2),fitOptions});
 assert.equal(r1.contract,'relief.design-fit-brep-1');assert.notEqual(r1.requestHash,r2.requestHash);assert.equal(r2.machiningPrecisionMm,.2);
 assert.throws(()=>designFitBrepRequest({draft:draft(.6),fitOptions}));
 assert.throws(()=>validatePipelineResponse(r1,{contract:r1.contract,requestHash:'x',status:'completed',result:{}}),/requestHash/);
});

test('routing: Services first; fine-tune stays in browser; fallback runs the same pure modules',async()=>{
 assert.equal(routeReliefPipeline({servicesAvailable:true}).target,'services');
 assert.equal(routeReliefPipeline({servicesAvailable:false}).target,'browser-fallback');
 assert.equal(routeReliefPipeline({servicesAvailable:true,stage:'fine-tune'}).target,'browser');
 const req=designFitBrepRequest({draft:draft(.05),fitOptions});
 const local=runDesignFitLocally(req);assert.equal(local.result.fit.fit.precision.machiningPrecisionMm,.05);
 const out=await runReliefPipeline(req,{local:runDesignFitLocally});assert.equal(out.executedOn,'browser-fallback');assert.match(out.fallbackReason,/Services/);
 // A (simulated) server that runs the same module produces an accepted response.
 const served=await runReliefPipeline(req,{submit:async r=>({...runDesignFitLocally(r),executedOn:'services'}),local:runDesignFitLocally});
 assert.equal(served.executedOn,'services');assert.deepEqual(served.result.fit.fit.controlDeltasMm,local.result.fit.fit.controlDeltasMm);
 // Server down -> explicit fallback, never silent.
 const down=await runReliefPipeline(req,{submit:async()=>{throw new Error('offline');},local:runDesignFitLocally});assert.equal(down.executedOn,'browser-fallback');assert.match(down.fallbackReason,/offline/);
 const rgba=new Uint8Array(4*4*4).fill(255),creq=sourceConvertRequest({sha256:sha,width:4,height:4,settings:{columns:4,rows:4}});
 assert.deepEqual(Array.from(runSourceConvertLocally(creq,rgba).result.values),Array.from(convertRgbaToHeightGrid(rgba,4,4,{columns:4,rows:4}).values));
});

test('04 wiring: fitted relief compiles as relief.design-fit-brep-1 and stale drafts never reach Services',async()=>{
 const {compiledSemanticVersion,assertCompilableFeature}=await import('../src/services/geometry-exchange.js');
 const {reliefDesignServicesPlan,servicesControlResolution}=await import('../src/services/relief-pipeline.js');
 const feature={id:'r',op:'relief',refs:['b'],params:{designBinding:{audit:{designId:'d',draftFingerprint:'sha256:x'},controls:{mode:'emboss'},placement:{originMm:[0,0,10],xDirection:[1,0,0]},support:{normal:[0,0,1]}}}};
 assert.equal(compiledSemanticVersion(feature),'relief.design-fit-brep-1');
 assert.equal(assertCompilableFeature(feature),feature.params);
 assert.equal(servicesControlResolution(33),17);assert.equal(servicesControlResolution(129),65);assert.equal(servicesControlResolution(257),129);
 assert.throws(()=>reliefDesignServicesPlan({reliefDesigns:[]},feature),e=>e.code==='RELIEF_DESIGN_STALE');
});

test('高级配置: design constraints live in one collapsed section with defaults; essentials stay visible',async()=>{
 const fs=await import('node:fs');const src=fs.readFileSync(new URL('../src/ui/forms/relief-design-dialog.js',import.meta.url),'utf8'),brep=fs.readFileSync(new URL('../src/ui/forms/relief-design-brep-panel.js',import.meta.url),'utf8');
 assert.match(src,/element\('details',\{class:'relief-advanced'/);assert.doesNotMatch(src,/advanced\.open=true/);
 for(const s of ["numeric('数值场每轴采样（9–129）',9,129,advancedForm)","',.01,.5,advancedForm)","numeric('网格底厚 mm',.001,100,advancedForm)","advanced.append(wrap)","advanced.append(editsPanel)","advanced.append(referencePanel)"])assert.ok(src.includes(s),s);
 assert.ok(src.includes('precision.value=.05'));assert.ok(brep.includes("evidence.value='按当前设计")&&brep.includes('baseCheck.checked=true'));
 assert.ok(brep.includes("xx=num('X方向 x',advGrid)")&&brep.includes('advBox.addEventListener(type,event=>event.stopPropagation())'));
});

test('04 wiring: Services face intent point lies on material even when the pattern centre is in a hole',async()=>{
 const {faceIntentPoint}=await import('../src/services/relief-pipeline.js');
 const n=9,active=new Uint8Array(n*n).fill(1);for(let j=3;j<=5;j++)for(let i=3;i<=5;i++)active[j*n+i]=0; // hole at centre
 const b64=u=>Buffer.from(u).toString('base64');
 const p=faceIntentPoint({field:{columns:n,rows:n,widthMm:8,heightMm:8,active:b64(active),fixedMask:b64(new Uint8Array(n*n))},placement:{originMm:[12,0,5],xDirection:[1,0,0]},support:{normal:[0,0,1]}});
 assert.equal(p[2],5);assert.ok(Math.hypot(p[0]-12,p[1])>=2-1e-9,'point must avoid the central hole: '+p);
});
