import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {readBrowserLogo,fitLogoWidth,logoInputKind} from '../src/browser-logo-input.js';
import {getServicesConfig,saveServicesConfig} from '../src/services/settings.js';
import {createServicesClient} from '../src/services/client.js';
import {READ_METHODS,HOST_ONLY_METHODS} from '../src/agent/protocol.js';

test('LAN worker topology queries and LOGO target do not require SubtleCrypto',async()=>{
 const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
 const cryptoBefore=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 try{
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{}});
  await kernel.rebuild({version:1,features:[{id:'plate',op:'box',params:{width:50,depth:50,height:3},refs:[]}],imports:{},hidden:[]});
  const query=await kernel.queryGeometry('plate','face',{});
  assert.equal(query.items.length,6);
  const expected='brep-sha256:'+createHash('sha256').update(kernel.activeShape('plate').serialize()).digest('hex');
  assert.equal(query.geometryFingerprint,expected);
  const target=await kernel.logoTarget('plate',0);assert.equal(target.geometryFingerprint,expected);assert.equal(target.geomType,'PLANE');
 }finally{if(cryptoBefore)Object.defineProperty(globalThis,'crypto',cryptoBefore);else delete globalThis.crypto;kernel.dispose();}
});

test('JPG conversion requires physical width and consent and returns unreviewed contours',async()=>{
 assert.equal(logoInputKind('shape.logo.json'),'local');assert.equal(logoInputKind('LOGO.SVG'),'local');assert.equal(logoInputKind('LOGO.JPG'),'raster');assert.equal(logoInputKind('sheet.pdf'),'paged-vector');assert.equal(logoInputKind('drawing.dwg'),'unsupported');
 const logo={type:'webcad-logo',version:1,units:'mm',name:'artwork',sizeMm:[10,10],source:{kind:'raster'},regions:[{outer:[[0,0],[10,0],[0,10]],holes:[]}]};
 let uploads=0;const requests=[];
 const client={capabilities:async()=>({logo:{enabled:true}}),upload:async()=>{uploads++;return {assetId:'asset'};},submit:async(kind,payload)=>{requests.push({kind,payload});return {kind};},wait:async job=>job.kind==='logo/inspect'?{result:{pageCount:1}}:{result:{geometryValid:true,logoDocument:logo,status:'needsReview',reviewRequired:true},manifest:{jobId:'job'}}};
 const file=new File(['selected source bytes'],'artwork.jpg');
 await assert.rejects(readBrowserLogo(file,x=>x,{client,sizeConfirmed:true,allowUpload:true}),{code:'SIZE_REQUIRED'});assert.equal(uploads,0);
 await assert.rejects(readBrowserLogo(file,x=>x,{client,targetWidthMm:10,sizeConfirmed:true}),{code:'UPLOAD_AUTH_REQUIRED'});assert.equal(uploads,0);
 const result=await readBrowserLogo(file,x=>x,{client,targetWidthMm:10,sizeConfirmed:true,allowUpload:true});
 assert.equal(uploads,1);assert.equal(result.source.reviewed,false);assert.equal(requests[1].payload.options.mode,'raster');assert.equal(requests[1].payload.options.targetWidthMm,10);
 const resized=fitLogoWidth(logo,30);assert.equal(resized.sizeMm[0],30);assert.equal(Math.max(...resized.regions[0].outer.map(p=>p[0]))-Math.min(...resized.regions[0].outer.map(p=>p[0])),30);assert.equal(resized.source.widthNormalization.scale,3);
});

test('source 2 slider junction is built with exact R1 profile and a full round 4 mm section',async()=>{
 const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
 try{
  const params={kind:'sliderBuckle',section:'round',sectionSize:4,barDiameter:4,innerWidth:42,innerHeight:22,innerRadius:.5,barOffset:0,gapWidth:0,jointStyle:'profileRound',jointRadius:1};
  const result=await kernel.rebuild({version:1,features:[{id:'slider',op:'quickModel',params,refs:[]}],imports:{},hidden:[]});
  assert.equal(result.bodies.length,1);assert.ok(Math.abs(result.bodies[0].volume-2298.706240867346)<1e-5);
  const bounds=kernel.activeShape('slider').boundingBox.bounds,size=bounds[1].map((v,i)=>v-bounds[0][i]);assert.ok(Math.abs(size[0]-50)<1e-5&&Math.abs(size[1]-30)<1e-5&&Math.abs(size[2]-4)<1e-5);
  await assert.rejects(kernel.rebuild({version:1,features:[{id:'bad',op:'quickModel',params:{...params,barDiameter:3},refs:[]}],imports:{},hidden:[]}),/等径/);
 }finally{kernel.dispose();}
});

test('formal website defaults survive a new tab without storing or exposing the backend secret',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'location');
 const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
 try{
  Object.defineProperty(globalThis,'location',{configurable:true,value:new URL('https://goldenfu.cn/webcad/')});globalThis.localStorage=memory();globalThis.sessionStorage=memory();
  const config=getServicesConfig();assert.equal(config.enabled,true);assert.equal(config.authMode,'siteSession');assert.equal(config.url,'https://goldenfu.cn/AI/WebCAD/WebCADCompute.ashx');assert.equal(config.hasCredential,false);
  let options;const client=createServicesClient({fetchImpl:async(url,input)=>{options=input;return new Response(JSON.stringify({protocolVersion:'1.0',supportedClientProtocolRange:['1.0']}));}});
  await client.capabilities();assert.equal(options.credentials,'include');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['X-WebCAD-Compute'],'1');
  globalThis.sessionStorage=memory();assert.equal(getServicesConfig().configured,true);
  localStorage.setItem('webcad.services.v1',JSON.stringify({enabled:true,url:'https://goldenfu.cn/cadservices/api.ashx',localTimeoutMs:90000,serverWaitMs:240000}));
  const restored=getServicesConfig();assert.equal(restored.authorizationRestored,true);assert.equal(restored.authMode,'siteSession');assert.equal(restored.serverWaitMs,240000);assert.match(localStorage.getItem('webcad.services.v1'),/cadservices/);
  assert.throws(()=>saveServicesConfig({url:'https://other.invalid/api.ashx',authMode:'siteSession'}),{code:'PARAM_SCHEMA_INVALID'});
  saveServicesConfig({enabled:false,url:config.url,authMode:'siteSession'});assert.equal(getServicesConfig().enabled,false);
 }finally{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;delete globalThis.localStorage;delete globalThis.sessionStorage;}
 for(const method of ['readLogo','getServices','getServicesCapabilities','getServicesRouting'])assert.ok(READ_METHODS.has(method));
 assert.ok(HOST_ONLY_METHODS.setServices);assert.equal(HOST_ONLY_METHODS.getServices,undefined);
});
