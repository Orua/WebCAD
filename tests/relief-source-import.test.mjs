// Stage 1: image -> conversion -> height source (photos need explicit confirmation) -> design field
// -> numerical fit -> exact BRep on the real kernel (flat and round supports) -> STEP round trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {convertRgbaToHeightGrid,encodeHeightGrid,decodeHeightGrid,normalizeConvertSettings,convertSettingsHash} from '../src/relief-source/convert.js';
import {createReliefHeightSource,validateReliefHeightSource,PHOTO_HEIGHTMAP_CONFIRMATION} from '../src/relief-source/source.js';
import {validateReliefDesign} from '../src/relief-design-drafts.js';
import {solveReliefDesign} from '../src/relief-design-field.js';
import {fitReliefDesignField} from '../src/relief-design-fit.js';
import {prepareReliefDesignRelief} from '../src/relief-design-brep.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);

// Minimal decoder for the 8-bit RGBA, non-interlaced PNG fixtures (keeps tests free of image libraries).
function readPng(file){
 const b=fs.readFileSync(file);let p=8,w,h,idat=[];
 while(p<b.length){const len=b.readUInt32BE(p),type=b.toString('latin1',p+4,p+8),data=b.subarray(p+8,p+8+len);p+=12+len;
  if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);assert.equal(data[12],0);}else if(type==='IDAT')idat.push(data);else if(type==='IEND')break;}
 const raw=zlib.inflateSync(Buffer.concat(idat)),out=new Uint8Array(w*h*4),stride=w*4;
 for(let y=0;y<h;y++){const f=raw[y*(stride+1)],row=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1));
  for(let x=0;x<stride;x++){const a=x>=4?out[y*stride+x-4]:0,up=y?out[(y-1)*stride+x]:0,c=x>=4&&y?out[(y-1)*stride+x-4]:0;let v=row[x];
   if(f===1)v+=a;else if(f===2)v+=up;else if(f===3)v+=(a+up)>>1;else if(f===4){const pp=a+up-c,pa=Math.abs(pp-a),pb=Math.abs(pp-up),pc=Math.abs(pp-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?up:c;}
   out[y*stride+x]=v&255;}}
 return {bytes:new Uint8Array(b),rgba:out,width:w,height:h};
}
const fixture=name=>readPng(new URL('./fixtures/relief-images/'+name,import.meta.url));
const SETTINGS={columns:129,rows:129,blurPx:4};
function sourceFor(name,interpretation,confirmation){
 const img=fixture(name),g=convertRgbaToHeightGrid(img.rgba,img.width,img.height,SETTINGS);
 return createReliefHeightSource({original:{sha256:binaryHash(img.bytes).slice(7),name},interpretation,settings:g.settings,grid:encodeHeightGrid(g),confirmation});
}
const confirm=()=>({text:PHOTO_HEIGHTMAP_CONFIRMATION,confirmedAt:'2026-10-22T02:00:00.000Z'});
const draftWith=(support,source)=>({schemaVersion:1,name:'图片导入',support,throughHoles:[],protectedZones:[],heightRangeMm:[0,1.2],points:[],fieldSettings:{columns:33,rows:33},heightSource:{source,depthMm:1,edgeKeepoutMm:5,edgeFadeMm:3}});
const FIT={mode:'emboss',controlColumns:25,controlRows:25,acceptanceToleranceMm:.25,controlMaxMm:1.2};
const intent={version:1,requestedGeometry:'continuousRelief',sourceInterpretation:'authoredHeightMap',userIntentEvidence:'测试：图片导入高度图后生成精确浮雕'};
const topFace=s=>{const f=s.faces;try{return f.findIndex(x=>{if(x.geomType!=='PLANE')return false;const c=x.center,n=x.normalAt(c);try{return n.z>.99;}finally{c.delete();n.delete();}});}finally{f.forEach(x=>x.delete());}};

test('conversion core: crop/levels/gamma/blur/invert are deterministic and hashed; limits enforced',()=>{
 const rgba=new Uint8Array(4*4*4);for(let k=0;k<16;k++){const v=k*16;rgba.set([v,v,v,255],k*4);}
 const a=convertRgbaToHeightGrid(rgba,4,4,{columns:4,rows:4}),b=convertRgbaToHeightGrid(rgba,4,4,{columns:4,rows:4,invert:true});
 assert.ok(Math.abs(a.values[0]-0)<1e-6&&Math.abs(a.values[15]-240/255)<1e-6);assert.ok(Math.abs(a.values[5]+b.values[5]-1)<1e-6);
 const lv=convertRgbaToHeightGrid(rgba,4,4,{columns:4,rows:4,levels:{black:.5,white:1}});assert.equal(lv.values[0],0);assert.ok(lv.values[15]>.85);
 const crop=convertRgbaToHeightGrid(rgba,4,4,{columns:2,rows:2,crop:{x:.5,y:.5,width:.5,height:.5}});assert.ok(Math.abs(crop.values[0]-160/255)<1e-6);
 assert.equal(convertSettingsHash({columns:4,rows:4}),convertSettingsHash({version:1,columns:4,rows:4,gamma:1,blurPx:0,invert:false}));
 assert.notEqual(a.settingsHash,b.settingsHash);
 const e=encodeHeightGrid(a);assert.ok(Math.max(...decodeHeightGrid(e).map((v,k)=>Math.abs(v-a.values[k])))<1/65535);
 assert.throws(()=>normalizeConvertSettings({columns:4096,rows:4}),{code:'PARAM_RANGE_INVALID'});
 assert.throws(()=>normalizeConvertSettings({columns:4,rows:4,levels:{black:.6,white:.5}}),{code:'PARAM_RANGE_INVALID'});
 assert.throws(()=>decodeHeightGrid({...e,data:encodeHeightGrid(b).data}),{code:'MACHINING_SOURCE_CONFLICT'});
});

test('photos 01-04: unconfirmed -> MACHINING_SOURCE_CONFLICT; confirmed -> authored height map with derivedFrom; tampering rejected',()=>{
 for(const name of ['01-campiglia-marble.png','02-marble-unknown.png','03-coin-trostianets.png','04-dragon-relief.png']){
  assert.throws(()=>sourceFor(name,'shadedReference'),{code:'MACHINING_SOURCE_CONFLICT'},name);
  assert.throws(()=>sourceFor(name,'shadedReference',{text:'确认',confirmedAt:'2026-10-22T02:00:00Z'}),{code:'MACHINING_SOURCE_CONFLICT'});
  assert.throws(()=>sourceFor(name,'rasterArtwork'),{code:'MACHINING_SOURCE_CONFLICT'});
  const s=sourceFor(name,'shadedReference',confirm());
  assert.equal(s.interpretation,'authoredHeightMap');assert.equal(s.derivedFrom.kind,'shadedReference');
  assert.equal(s.derivedFrom.sourceSha256,s.original.sha256);assert.equal(s.derivedFrom.settingsHash,s.settingsHash);assert.equal(s.derivedFrom.confirmation.text,PHOTO_HEIGHTMAP_CONFIRMATION);
  // Changing conversion settings after confirmation, or dropping the confirmation, invalidates it.
  const changed=structuredClone(s);changed.settings.gamma=2;changed.settingsHash=convertSettingsHash(changed.settings);
  assert.throws(()=>validateReliefHeightSource(changed),{code:'MACHINING_SOURCE_CONFLICT'});
  const unconfirmed=structuredClone(s);delete unconfirmed.derivedFrom.confirmation;
  assert.throws(()=>validateReliefDesign(draftWith({kind:'rect',centerMm:[0,0],widthMm:40,heightMm:40},unconfirmed)),{code:'MACHINING_SOURCE_CONFLICT'});
  const relabeled=structuredClone(s);relabeled.interpretation='shadedReference';
  assert.throws(()=>validateReliefHeightSource(relabeled),{code:'MACHINING_SOURCE_CONFLICT'});
 }
});

async function buildOn(hostFeatures,bodyId,draft){
 const solved=solveReliefDesign(draft);assert.equal(solved.report.sourceKind,'authored-heightmap-observations');
 const r=fitReliefDesignField(draft,solved,FIT);
 const f={solved:{status:'solved',...solved},fit:{status:'fitted',designId:'img',draftRevision:1,...r,sourceBinding:{draftRevision:1,...r.source}},entry:{id:'img',revision:1,draft}};
 const kernel=new CadKernel(oc),doc={version:1,name:'h',features:hostFeatures,hidden:[],imports:{}};
 try{
  await kernel.rebuild(doc);const before=(await kernel.rebuild(doc)).bodies[0].volume,faceId=topFace(kernel.activeShape(bodyId)),sup=kernel.reliefDesignSupport(bodyId,faceId);
  const p=prepareReliefDesignRelief({...f,expectedDraftRevision:1,support:sup,target:{bodyId,faceId,expectedSourceSha256:sup.sourceSha256},placement:{originMm:sup.centerMm,xDirection:[1,0,0]},datum:{kind:'authoredBaselineOnSelectedFace',baselineMm:0},machiningIntent:intent});
  assert.equal(p.status,'prepared',JSON.stringify(p.blockers));
  doc.features.push({id:'relief',op:'relief',refs:[bodyId],params:p.previewArgs.params});
  const body=(await kernel.rebuild(doc)).bodies.find(b=>b.id==='relief');
  assert.equal(body.solidCount,1);assert.ok(body.reliefReport.addedMm3>1);assert.ok(Math.abs(body.volume-before-body.reliefReport.addedMm3)<1e-5);
  const step=await kernel.export('step',['relief']),round=(await cad.importSTEP(new Blob([step.data]))).asShape3D();
  try{assert.equal(round.solids.length,1);assert.ok(Math.abs(cad.measureVolume(round)-body.volume)/body.volume<1e-5,'STEP volume');}finally{round.delete();}
  const cold=new CadKernel(oc);try{assert.ok(Math.abs((await cold.rebuild(JSON.parse(JSON.stringify(doc)))).bodies.find(b=>b.id==='relief').volume-body.volume)<1e-6);}finally{cold.dispose();}
  return {body,fit:r};
 }finally{kernel.dispose();}
}

test('swirl 05 (authored height map): field -> fit -> exact BRep on a flat face and a round support, STEP round trip, cold reopen',async()=>{
 const src=sourceFor('05-function-swirl.png','authoredHeightMap');assert.equal(src.derivedFrom,undefined);
 const flat=await buildOn([{id:'base',op:'box',params:{width:60,depth:60,height:5},refs:[]}],'base',draftWith({kind:'rect',centerMm:[0,0],widthMm:40,heightMm:40},src));
 const round=await buildOn([{id:'disk',op:'cylinder',params:{radius:25,height:5},refs:[]}],'disk',draftWith({kind:'circle',centerMm:[0,0],radiusMm:20},src));
 assert.ok(flat.body.reliefReport.addedMm3>round.body.reliefReport.addedMm3);
});

test('confirmed photo 01 generates a solid whose recipe still carries the derived source identity',async()=>{
 const src=sourceFor('01-campiglia-marble.png','shadedReference',confirm()),draft=draftWith({kind:'rect',centerMm:[0,0],widthMm:40,heightMm:40},src);
 assert.equal(validateReliefDesign(draft).heightSource.source.derivedFrom.confirmation.text,PHOTO_HEIGHTMAP_CONFIRMATION);
 const {fit}=await buildOn([{id:'base',op:'box',params:{width:60,depth:60,height:5},refs:[]}],'base',draft);
 assert.match(fit.source.draftFingerprint,/^sha256:/);
});

test('legacy designs without heightSource solve exactly as before',()=>{
 const d={schemaVersion:1,name:'旧设计',support:{kind:'rect',centerMm:[0,0],widthMm:16,heightMm:16},throughHoles:[],protectedZones:[],heightRangeMm:[0,.4],points:[],fieldSettings:{columns:33,rows:33,edits:[{mode:'raise',centerMm:[1,1],radiusMm:4,amountMm:.2,strength:1}]}};
 const s=solveReliefDesign(d);assert.equal(s.report.sourceKind,'authored-design-not-image-depth');assert.equal(s.report.heightSource,undefined);
 assert.deepEqual(Object.keys(validateReliefDesign(d)).sort(),['fieldSettings','heightRangeMm','name','points','protectedZones','schemaVersion','support','throughHoles']);
});

test('UI panel request helper validates numeric fields and maps to normalized settings',async()=>{
 const {heightPanelRequest}=await import('../src/ui/forms/relief-design-height-panel.js');
 const r=heightPanelRequest({columns:'129',black:'0.1',white:'0.9',gamma:'1.2',blur:'2',invert:true,depth:'1',keepout:'2',fade:'2'});
 assert.deepEqual(r.settings,{columns:129,rows:129,levels:{black:.1,white:.9},gamma:1.2,blurPx:2,invert:true});assert.equal(r.depthMm,1);
 assert.throws(()=>heightPanelRequest({columns:'',black:0,white:1,gamma:1,blur:0,depth:1,keepout:0,fade:0}));
});
