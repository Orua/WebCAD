import test from 'node:test';
import assert from 'node:assert/strict';
import {readBrowserLogo,fitLogoWidth} from '../src/browser-logo-input.js';
import {validateLogoRasterOptions} from '../src/logo-raster-options.js';
import {getTool,readDocs} from '../src/page-api-docs.js';
test('local logo packets retain validation with no converter requests',async()=>{
  let called=0;const packet={version:1,regions:[{outer:[[0,0],[5,0],[0,5]],holes:[]}]};
  const result=await readBrowserLogo(new File([JSON.stringify(packet)],'part.logo.json'),data=>{called++;assert.deepEqual(data,packet);return data;});
  assert.deepEqual(result,packet);assert.equal(called,1);
  await assert.rejects(readBrowserLogo(new File(['unavailable'],'part.dxf'),()=>{throw new Error('must not run');}),{code:'CAPABILITY_UNAVAILABLE'});
  await assert.rejects(readBrowserLogo(new File([new Uint8Array(2*1024*1024+1)],'big.logo.json'),()=>{}),{code:'SIZE_LIMIT'});
  await assert.rejects(readBrowserLogo(new File(['{'],'bad.logo.json'),()=>{}),SyntaxError);
});

test('raster byte thresholds reject normalized relief values before any upload',async()=>{
  let calls=0;const client={capabilities:async()=>{calls++;throw new Error('must not request');}};
  for(const raster of [{threshold:0.5},{threshold:'128'},{alphaThreshold:256},{invert:1},{threshold:128,typo:true},null,[]]){
    await assert.rejects(readBrowserLogo(new File(['image'],'tiger.jpg'),()=>{},
      {targetWidthMm:30,sizeConfirmed:true,allowUpload:true,raster,client}),{code:'PARAM_SCHEMA_INVALID'});
  }
  assert.equal(calls,0);
  for(const raster of [undefined,{}, {threshold:0,invert:false,alphaThreshold:255},{threshold:128,invert:true,alphaThreshold:1}])assert.doesNotThrow(()=>validateLogoRasterOptions(raster));
});

test('raster reader preserves omitted defaults and explicit original conversion options',async()=>{
  for(const raster of [undefined,{threshold:128,invert:false,alphaThreshold:1}]){
    const submitted=[];
    const packet={version:1,regions:[{outer:[[0,0],[30,0],[0,20]],holes:[]}]};
    const client={capabilities:async()=>({logo:{enabled:true}}),upload:async()=>({assetId:'source'}),
      submit:async(route,request)=>{submitted.push({route,request});return route;},
      wait:async route=>route==='logo/inspect'?{result:{pageCount:1}}:{result:{geometryValid:true,status:'needsReview',logoDocument:structuredClone(packet),reviewRequired:true},manifest:{jobId:'original',inputFingerprint:'same',artifactSha256:'hash'}}};
    const result=await readBrowserLogo(new File(['image'],'tiger.jpg'),x=>x,{targetWidthMm:30,sizeConfirmed:true,allowUpload:true,raster,client});
    assert.equal(submitted.length,1);
    assert.equal(submitted[0].route,'logo/convert');
    const options=submitted[0].request.options;
    assert.equal(Object.hasOwn(options,'raster'),raster!==undefined);
    if(raster!==undefined)assert.deepEqual(options.raster,raster);
    assert.equal(result.source.reviewed,false);assert.equal(result.source.servicesEvidence.jobId,'original');
  }
});

test('public LOGO card exposes byte thresholds and the configured backend route',()=>{
  const card=getTool({id:'readLogo'}),raster=card.inputSchema.properties.raster;
  assert.equal(raster.additionalProperties,false);
  assert.deepEqual(raster.properties.threshold,{type:'integer',minimum:0,maximum:255,default:128,description:'8-bit luminance; dark pixels below this value are foreground unless invert is true. Not a 0–1 relief threshold.'});
  assert.deepEqual(card.rasterDefaults,{threshold:128,invert:false,alphaThreshold:1,smoothingPx:0});
  assert.match(JSON.stringify(readDocs({docId:'api.logo'})),/启用统一计算接口后/);
  assert.doesNotMatch(JSON.stringify(readDocs({docId:'api.logo'})),/静态版没有位图/);
});

test('failed raster conversion reports effective options and retains the original job without retry',async()=>{
  let converts=0;const original=Object.assign(new Error('No foreground'),{code:'NO_VECTOR_CONTENT',jobId:'original-failed-job',details:{stage:'worker'}});
  const client={capabilities:async()=>({logo:{enabled:true}}),upload:async()=>({assetId:'source'}),submit:async route=>{if(route==='logo/convert')converts++;return route;},
    wait:async route=>{if(route==='logo/inspect')return {result:{pageCount:1}};throw original;}};
  await assert.rejects(readBrowserLogo(new File(['image'],'tiger.jpg'),x=>x,{targetWidthMm:30,sizeConfirmed:true,allowUpload:true,client}),error=>{
    assert.equal(error,original);assert.equal(error.jobId,'original-failed-job');
    assert.deepEqual(error.details,{stage:'worker',logoFailure:{reason:'当前黑白阈值下没有识别到图案。',next:'请检查黑白阈值或反转前景后重新识别。'},rasterOptions:{threshold:128,invert:false,alphaThreshold:1,smoothingPx:0},rasterOptionsSupplied:false});return true;
  });
  assert.equal(converts,1);
});

test('smoothing remains explicit and scaling preserves the original proof frame',()=>{
 for(const smoothingPx of [null,'0.2',NaN,Infinity,-.1,.51])assert.throws(()=>validateLogoRasterOptions({smoothingPx}),{code:'PARAM_SCHEMA_INVALID'});
 for(const smoothingPx of [0,.2,.5])assert.doesNotThrow(()=>validateLogoRasterOptions({smoothingPx}));
 const original={type:'webcad-logo',version:1,units:'mm',sizeMm:[10,5],regions:[{outer:[[0,0],[10,0],[10,5],[0,5]],holes:[]}]};
 const logo={...structuredClone(original),source:{rasterTopology:{diagonalContacts:1,cornerTrimPx:.25,curveDistanceUpperBoundMm:.02},rasterOriginalContours:structuredClone(original),rasterSmoothing:{requestedTolerancePx:.5,requestedToleranceMm:.1,effectiveToleranceMm:.08,curveDistanceUpperBoundMm:.08,coordinateRoundingMm:1e-9,originalGeometryHash:'converter-proof'},conversion:{requestedToleranceMm:.1,approximationBoundMm:.08},conversionReport:{requestedToleranceMm:.1,approximationBoundMm:.08}}};
 const fitted=fitLogoWidth(logo,20);
 assert.deepEqual(fitted.source.rasterOriginalContours,original);assert.equal(fitted.source.rasterOriginalContoursToLogo.scale,2);
 assert.equal(fitted.source.rasterSmoothing.curveDistanceUpperBoundMm,.16);assert.equal(fitted.source.rasterTopology.curveDistanceUpperBoundMm,.04);assert.equal(fitted.source.rasterTopology.cornerTrimPx,.25);
 assert.equal(fitted.source.rasterSmoothing.requestedTolerancePx,.5);
 assert.equal(fitted.source.conversionReport.approximationBoundMm,.16);assert.equal(fitted.source.conversion.approximationBoundMm,.16);
 assert.equal(fitLogoWidth(fitted,40).source.rasterOriginalContoursToLogo.scale,4);
 assert.equal(logo.source.rasterSmoothing.curveDistanceUpperBoundMm,.08);
});
