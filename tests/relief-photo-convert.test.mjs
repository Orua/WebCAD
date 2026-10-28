// Photo-relief conversion: mode photoRelief, hash stability for luminance, detection, height source derivedFrom.
import test from 'node:test';
import assert from 'node:assert/strict';
import {convertRgbaToHeightGrid,normalizeConvertSettings,convertSettingsHash,detectPhotoLikeImage,PHOTO_RELIEF_VERSION} from '../src/relief-source/convert.js';
import {createReliefHeightSource,PHOTO_HEIGHTMAP_CONFIRMATION} from '../src/relief-source/source.js';
import {encodeHeightGrid} from '../src/relief-source/convert.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
import {heightPanelRequest,DEFAULT_RELIEF_DEPTH_MM} from '../src/ui/forms/relief-design-height-panel.js';

function rampRgba(n=16){
 const rgba=new Uint8Array(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=Math.round(255*x/(n-1));rgba.set([v,v,v,255],(y*n+x)*4);}
 return rgba;
}
function shadeLikeRgba(n=64){
 // Synthetic side-lit blob (warm tone + directional gradient)
 const rgba=new Uint8Array(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const u=x/(n-1),v=y/(n-1);
  const d=Math.hypot(u-0.45,v-0.5);
  const h=Math.max(0,1-d*2.2);
  const light=0.25+0.75*Math.max(0, (u*0.7+v*0.2+h*0.5));
  const r=Math.min(255,Math.round(light*240)),g=Math.min(255,Math.round(light*210)),b=Math.min(255,Math.round(light*180));
  rgba.set([r,g,b,255],(y*n+x)*4);
 }
 return rgba;
}

test('luminance settingsHash unchanged when mode omitted or luminance',()=>{
 assert.equal(convertSettingsHash({columns:8,rows:8}), convertSettingsHash({columns:8,rows:8,mode:'luminance'}));
 const a=normalizeConvertSettings({columns:8,rows:8});
 assert.equal(a.mode, undefined);
 assert.equal(a.photo, undefined);
});

test('photoRelief settings include mode+photo and change hash',()=>{
 const a=convertSettingsHash({columns:8,rows:8});
 const b=convertSettingsHash({columns:8,rows:8,mode:'photoRelief'});
 assert.notEqual(a,b);
 const s=normalizeConvertSettings({columns:8,rows:8,mode:'photoRelief'});
 assert.equal(s.mode,'photoRelief');
 assert.equal(typeof s.photo.bodyWeight,'number');
 assert.throws(()=>normalizeConvertSettings({columns:8,rows:8,mode:'luminance',photo:{}}),{code:'PARAM_SCHEMA_INVALID'});
});

test('photoRelief flattens lighting vs raw luminance on side-lit blob',()=>{
 const rgba=shadeLikeRgba(48);
 const lum=convertRgbaToHeightGrid(rgba,48,48,{columns:48,rows:48});
 const photo=convertRgbaToHeightGrid(rgba,48,48,{columns:48,rows:48,mode:'photoRelief'});
 assert.equal(photo.settings.mode,'photoRelief');
 assert.equal(photo.photoReliefVersion,1);// no photo.algorithm → legacy v1 (hash-stable)
 // Photo result should use more of the [0,1] range in the interior than a left-lit luminance ramp.
 const interior=i=>i%48>8&&i%48<40&&(i/48|0)>8&&(i/48|0)<40;
 const vals=[...photo.values].filter((_,i)=>interior(i));
 const span=Math.max(...vals)-Math.min(...vals);
 assert.ok(span>0.35, 'photo span '+span);
 assert.ok(Math.max(...photo.values)>0.7);
});

test('detectPhotoLikeImage flags shaded blob, not flat gray ramp',()=>{
 const ramp=detectPhotoLikeImage(rampRgba(32),32,32);
 const shade=detectPhotoLikeImage(shadeLikeRgba(64),64,64);
 assert.equal(ramp.photoLike,false);
 assert.equal(shade.photoLike,true);
});

test('createReliefHeightSource photoRelief needs no confirmation checkbox',()=>{
 const rgba=shadeLikeRgba(32);
 const g=convertRgbaToHeightGrid(rgba,32,32,{columns:32,rows:32,mode:'photoRelief'});
 const bytes=new Uint8Array(32); // fake identity
 const sha=binaryHash(bytes).slice(7);
 const src=createReliefHeightSource({original:{sha256:sha,name:'blob.png'},interpretation:'shadedReference',settings:g.settings,grid:encodeHeightGrid(g)});
 assert.equal(src.interpretation,'authoredHeightMap');
 assert.equal(src.derivedFrom.kind,'photoRelief');
 assert.equal(src.derivedFrom.photoReliefVersion,1);
});

test('legacy shadedReference luminance still requires confirmation',()=>{
 const rgba=rampRgba(16);
 const g=convertRgbaToHeightGrid(rgba,16,16,{columns:16,rows:16});
 const sha=binaryHash(new Uint8Array(8)).slice(7);
 assert.throws(()=>createReliefHeightSource({original:{sha256:sha,name:'a.png'},interpretation:'shadedReference',settings:g.settings,grid:encodeHeightGrid(g)}),{code:'MACHINING_SOURCE_CONFLICT'});
 const ok=createReliefHeightSource({original:{sha256:sha,name:'a.png'},interpretation:'shadedReference',settings:g.settings,grid:encodeHeightGrid(g),confirmation:{text:PHOTO_HEIGHTMAP_CONFIRMATION,confirmedAt:'2026-10-28T00:00:00.000Z'}});
 assert.equal(ok.derivedFrom.kind,'shadedReference');
});

test('heightPanelRequest: photo use → mode photoRelief; default depth is high-relief',()=>{
 assert.equal(DEFAULT_RELIEF_DEPTH_MM,3);
 const img={width:64,height:64};
 const r=heightPanelRequest({columns:'32',black:0,white:1,gamma:1,blur:0,depth:3,keepout:0,fade:0,use:'shadedReference'},{image:img});
 assert.equal(r.settings.mode,'photoRelief');
 assert.equal(r.interpretation,'shadedReference');
 assert.equal(r.depthMm,3);
 const h=heightPanelRequest({columns:'32',black:0,white:1,gamma:1,blur:0,depth:1,keepout:0,fade:0,use:'authoredHeightMap'},{image:img});
 assert.equal(h.settings.mode,undefined);
 assert.equal(h.interpretation,'authoredHeightMap');
});
