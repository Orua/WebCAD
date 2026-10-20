import test from 'node:test';
import assert from 'node:assert/strict';
import {createLogoReviewSession,logoReviewArtifacts} from '../src/logo-vector-review.js';
import {parseLocalLogoDxf} from '../src/dxf-logo-input.js';
import {logoDXF} from '../src/logo-dxf.js';
import {fitLogoWidth,readBrowserLogo,getLogoWizardState,actLogoWizard} from '../src/browser-logo-input.js';

const packet=()=>({type:'webcad-logo',version:1,units:'mm',name:'ring',sizeMm:[10,10],regions:[{outer:[[-5,-5],[5,-5],[5,5],[-5,5]],holes:[[[-2,-2],[-2,2],[2,2],[2,-2]]]}],source:{kind:'raster',sha256:'source-original',reviewed:false,reviewRequired:true,conversion:{geometryHash:'original-geometry',reviewRequired:true},rasterFrame:{pixelWidth:100,pixelHeight:100,mmPerPixel:.1,xMm:-5,yMm:-5,widthMm:10,heightMm:10}}});
test('review selection and edits preserve source, holes and physical coordinates; explicit confirmation gates machining',()=>{
 const original=packet(),session=createLogoReviewSession(original);
 let s=session.act({action:'select',expectedRevision:0,regionIndex:0,holeIndex:0,pointIndex:1});
 s=session.act({action:'setPoint',expectedRevision:s.revision,pointMm:[-2,2.5]});
 assert.deepEqual(s.logo.regions[0].holes[0][1],[-2,2.5]);assert.equal(s.logo.source.sha256,'source-original');assert.deepEqual(s.logo.source.rasterFrame,original.source.rasterFrame);assert.equal(s.reviewRequired,true);assert.deepEqual(original,packet());
 assert.throws(()=>session.act({action:'confirm',expectedRevision:s.revision}),{code:'LOGO_REVIEW_REQUIRED'});
 s=session.act({action:'confirm',expectedRevision:s.revision,confirmed:true});assert.equal(s.reviewRequired,false);assert.equal(s.logo.source.conversion.reviewRequired,true);assert.equal(s.logo.source.contourReview.edited,true);
 s=session.act({action:'setPoint',expectedRevision:s.revision,pointMm:[-2,2.6]});assert.equal(s.reviewRequired,true);
});
test('invalid topology and stale actions fail atomically without losing valid draft or undo',()=>{
 const session=createLogoReviewSession(packet()),before=session.get();
 assert.throws(()=>session.act({action:'setPoint',expectedRevision:0,pointMm:[4,4]}),{code:'LOGO_CONTOUR_INVALID'});
 assert.deepEqual(session.get(),before);
 assert.throws(()=>session.act({action:'deleteContour',expectedRevision:0}),{code:'LOGO_EMPTY'});
 session.act({action:'select',expectedRevision:0,regionIndex:0,holeIndex:0,pointIndex:0});
 assert.throws(()=>session.act({action:'deletePoint',expectedRevision:0}),{code:'LOGO_REVIEW_STALE'});
 let s=session.act({action:'deleteContour',expectedRevision:1});assert.equal(s.logo.regions[0].holes.length,0);
 s=session.act({action:'undo',expectedRevision:s.revision});assert.equal(s.logo.regions[0].holes.length,1);assert.equal(s.logo.source.sha256,'source-original');
});
test('review get is read-only and export artifacts retain review requirement and contour size',()=>{
 const session=createLogoReviewSession(packet()),before=session.get();assert.deepEqual(session.act({action:'get'}),before);assert.deepEqual(session.get(),before);
 const artifacts=logoReviewArtifacts(before.logo);assert.deepEqual(artifacts.map(a=>a.kind),['contours','preview','drawing','report']);
 assert.match(artifacts.find(a=>a.kind==='preview').text,/width="10mm"/);assert.equal(JSON.parse(artifacts.find(a=>a.kind==='report').text).reviewRequired,true);
 assert.match(artifacts.find(a=>a.kind==='drawing').text,/LOGO_HOLE/);
});
test('local exact DXF round-trip preserves holes and mm without uploading',async()=>{
 const dxf=logoDXF(packet()),logo=parseLocalLogoDxf(dxf);assert.deepEqual(logo.sizeMm,[10,10]);assert.equal(logo.regions[0].holes.length,1);
 const result=await readBrowserLogo(new File([dxf],'ring.dxf'),x=>x,{client:{capabilities:()=>{throw new Error('must stay local');}}});
 assert.equal(result.source.kind,'local-dxf');assert.equal(result.source.reviewed,false);assert.equal(result.regions[0].holes.length,1);
 assert.throws(()=>parseLocalLogoDxf(dxf.replace('70\r\n4','70\r\n0')),{code:'LOCAL_VECTOR_UNSUPPORTED'});
 assert.throws(()=>parseLocalLogoDxf(dxf.replace('90\r\n4','39\r\n2\r\n90\r\n4')),{code:'LOCAL_VECTOR_UNSUPPORTED'});
});
test('image frame scales with exact contour width and remains aligned to original pixels',()=>{
 const resized=fitLogoWidth(packet(),20);assert.deepEqual(resized.source.rasterFrame,{pixelWidth:100,pixelHeight:100,mmPerPixel:.2,xMm:-10,yMm:-10,widthMm:20,heightMm:20});assert.deepEqual(resized.sizeMm,[20,20]);
});
test('UI automation reports closed wizard explicitly; standalone review session remains available',async()=>{
 assert.deepEqual(getLogoWizardState(),{open:false});await assert.rejects(actLogoWizard({action:'get'}),{code:'LOGO_WIZARD_CLOSED'});assert.equal(createLogoReviewSession(packet()).get().reviewRequired,true);
});
test('unsupported vector rendering retains original job and explicitly blocks unavailable raster fallback',async()=>{
 const original=Object.assign(new Error('PDF images unsupported'),{code:'UNSUPPORTED_RENDER_FEATURE',jobId:'original-convert-job'});let converts=0;
 const client={capabilities:async()=>({logo:{enabled:true}}),upload:async()=>({assetId:'source'}),submit:async route=>{if(route==='logo/convert')converts++;return route;},wait:async route=>{if(route==='logo/inspect')return {result:{pageCount:1}};throw original;}};
 await assert.rejects(readBrowserLogo(new File(['pdf'],'image.pdf'),x=>x,{client,allowUpload:true,sizeConfirmed:true,targetWidthMm:20,page:1}),error=>{assert.equal(error,original);assert.equal(error.jobId,'original-convert-job');assert.equal(error.details.rasterFallback.enabled,false);assert.match(error.message,/未自动改成位图/);return true;});assert.equal(converts,1);
});
test('PDF inspect rejection exposes the same unavailable raster route and never starts conversion',async()=>{
 const original=Object.assign(new Error('PDF contains images'),{code:'UNSUPPORTED_RENDER_FEATURE',jobId:'original-inspect-job',details:{stage:'inspect'}}),routes=[];
 const client={capabilities:async()=>({logo:{enabled:true}}),upload:async()=>({assetId:'source'}),submit:async route=>{routes.push(route);return route;},wait:async()=>{throw original;}};
 await assert.rejects(readBrowserLogo(new File(['pdf'],'image.pdf'),x=>x,{client,allowUpload:true,sizeConfirmed:true,targetWidthMm:20,page:1}),error=>{assert.equal(error,original);assert.equal(error.jobId,'original-inspect-job');assert.equal(error.details.stage,'inspect');assert.equal(error.details.rasterFallback.enabled,false);return true;});assert.deepEqual(routes,['logo/inspect']);
});
test('PDF join tolerance validates before routing and stays identical across inspect and convert',async()=>{
 const logo=packet();for(const invalid of [-.001,.101,'0.01',null,NaN,Infinity])await assert.rejects(readBrowserLogo(new File([JSON.stringify(logo)],'local.logo.json'),x=>x,{pdfJoinToleranceMm:invalid}),{code:'PARAM_SCHEMA_INVALID'});
 for(const value of [0,.02,.1]){const local=await readBrowserLogo(new File([JSON.stringify(logo)],'local.logo.json'),x=>x,{pdfJoinToleranceMm:value});assert.equal(local.source.sha256,logo.source.sha256);}
 const routes=[],client={capabilities:async()=>({logo:{enabled:true}}),upload:async()=>({assetId:'source'}),submit:async(route,request)=>{routes.push({route,request});return route;},wait:async route=>route==='logo/inspect'?{result:{pageCount:1}}:{result:{geometryValid:true,status:'needsReview',logoDocument:packet(),reviewRequired:true},manifest:{jobId:'same-job'}}};
 await readBrowserLogo(new File(['pdf'],'ring.pdf'),x=>x,{client,allowUpload:true,sizeConfirmed:true,targetWidthMm:10,page:1,pdfJoinToleranceMm:.02});
 assert.equal(routes[0].request.options.pdfJoinToleranceMm,.02);assert.equal(routes[0].request.options.targetWidthMm,10);assert.equal(routes[1].request.options.pdfJoinToleranceMm,.02);
});
