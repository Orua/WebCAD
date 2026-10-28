// Photo relief v2 (立体 v4): volume/envelope, depth ordering, 丝滑 transitions (no terraces, C1 edges),
// stability (determinism, NaN, big images, worker/fallback/cancel) and settings-hash compatibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import {convertRgbaToHeightGrid,normalizeConvertSettings,convertSettingsHash,defaultPhotoReliefParams,PHOTO_RELIEF_V2_DEFAULTS} from '../src/relief-source/convert.js';
import {photoReliefFromLuminance,normalizePhotoReliefParams,blurFast,distanceTransform} from '../src/relief-source/photo-relief.js';
import {createReliefHeightSource} from '../src/relief-source/source.js';
import {encodeHeightGrid} from '../src/relief-source/convert.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
import {convertInBackground,decodeTargetSize,downscaleRgba,runSourceConvertJob} from '../src/relief-source/convert-client.js';
import {sourceConvertWorkerParams} from '../src/services/relief-pipeline.js';
import {heightPanelRequest} from '../src/ui/forms/relief-design-height-panel.js';

// Synthetic "temple + clouds" scene: textured shaded subject disc (strong), soft cloud band (weak), flat background.
function scene(n=160){
 const L=new Float64Array(n*n),rgba=new Uint8ClampedArray(n*n*4),c=n/2;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  let v=0.25;// background
  const r=Math.hypot(x-c,y-c*0.9);
  if(r<n*0.22){const nx=(x-c)/(n*0.22),ny=(y-c*0.9)/(n*0.22);v=0.55+0.3*(-0.6*nx-0.5*ny)+0.08*Math.sin(x*0.9)*Math.sin(y*0.7);}// subject, side-lit + texture
  else if(y>n*0.78&&y<n*0.92)v=0.25+0.12*Math.sin(x*0.15)*Math.sin((y-n*0.78)/(n*0.14)*Math.PI);// clouds
  L[y*n+x]=v;const b=Math.round(255*Math.min(1,Math.max(0,v)));rgba.set([b,b,b,255],(y*n+x)*4);
 }
 return {L,rgba,n,c};
}
const mean=(a,f)=>{let s=0,k=0;for(let i=0;i<a.length;i++)if(f(i)){s+=a[i];k++;}return s/k;};

test('v1 hash unchanged; v2 adds algorithm keys and a different hash',()=>{
 const v1=convertSettingsHash(normalizeConvertSettings({columns:64,rows:64,mode:'photoRelief'}));
 const v1b=convertSettingsHash(normalizeConvertSettings({columns:64,rows:64,mode:'photoRelief',photo:{}}));
 assert.equal(v1,v1b);
 const p1=normalizePhotoReliefParams({});assert.equal(p1.algorithm,undefined);assert.equal(p1.volume,undefined);
 const p2=defaultPhotoReliefParams();assert.equal(p2.algorithm,2);for(const k of Object.keys(PHOTO_RELIEF_V2_DEFAULTS))assert.ok(k in p2,k);
 const v2=convertSettingsHash(normalizeConvertSettings({columns:64,rows:64,mode:'photoRelief',photo:p2}));
 assert.notEqual(v1,v2);
 assert.throws(()=>normalizePhotoReliefParams({volume:0.5}),/volume|未知|unknown/i);// v2 keys need algorithm 2
 assert.throws(()=>defaultPhotoReliefParams({volume:2}),/range|volume|范围/i);
});

test('v2 deterministic, finite, in [0,1]; constant and NaN input do not explode',()=>{
 const {L,n}=scene(96),p=defaultPhotoReliefParams();
 const a=photoReliefFromLuminance(L,n,n,p).values,b=photoReliefFromLuminance(L,n,n,p).values;
 assert.equal(binaryHash(new Uint8Array(a.buffer)),binaryHash(new Uint8Array(b.buffer)));
 for(const v of a)assert.ok(Number.isFinite(v)&&v>=0&&v<=1);
 const flat=photoReliefFromLuminance(new Float64Array(64*64).fill(0.5),64,64,p);
 for(const v of flat.values)assert.ok(Number.isFinite(v));
 const nan=Float64Array.from(L);for(let i=0;i<nan.length;i+=7)nan[i]=NaN;
 for(const v of photoReliefFromLuminance(nan,n,n,p).values)assert.ok(Number.isFinite(v));
 assert.equal(photoReliefFromLuminance(L,n,n,p).version,2);
});

test('立体: depth ordering subject > clouds > background, and volume slider raises the subject',()=>{
 const {L,n,c}=scene(160);
 const run=o=>photoReliefFromLuminance(L,n,n,defaultPhotoReliefParams(o)).values;
 const h=run({});
 const subj=mean(h,i=>Math.hypot(i%n-c,(i/n|0)-c*0.9)<n*0.12);
 const cloud=mean(h,i=>{const y=i/n|0;return y>n*0.82&&y<n*0.88&&i%n>n*0.15&&i%n<n*0.85;});
 const bg=mean(h,i=>{const x=i%n,y=i/n|0;return y<n*0.12&&x>n*0.15&&x<n*0.85;});
 assert.ok(subj>cloud+0.15,`subject ${subj} vs clouds ${cloud}`);
 assert.ok(cloud>=bg-0.02,`clouds ${cloud} vs bg ${bg}`);
 assert.ok(bg<0.2,'background stays low '+bg);
 const lo=run({volume:0.2}),loSubj=mean(lo,i=>Math.hypot(i%n-c,(i/n|0)-c*0.9)<n*0.12),loBg=mean(lo,i=>(i/n|0)<n*0.12);
 assert.ok(subj-bg>loSubj-loBg,'higher 立体度 → more subject relief');
});

test('丝滑: no terraces/plateaus, C1 falloff at the subject edge, gentle feathering',()=>{
 const {L,n,c}=scene(200),h=photoReliefFromLuminance(L,n,n,defaultPhotoReliefParams()).values;
 // no clipped plateau: < 1% of nodes at the top
 let top=0;for(const v of h)if(v>=0.999)top++;assert.ok(top/h.length<0.01,'top plateau '+top/h.length);
 // no stair-steps: the height histogram (64 bins) has no big empty gaps between occupied levels
 const bins=new Uint32Array(64);for(const v of h)bins[Math.min(63,Math.floor(v*64))]++;
 let first=bins.findIndex(b=>b>0),last=63-[...bins].reverse().findIndex(b=>b>0),gap=0,maxGap=0;
 for(let i=first;i<=last;i++){if(bins[i]===0){gap++;maxGap=Math.max(maxGap,gap);}else gap=0;}
 assert.ok(maxGap<=2,'terrace gaps '+maxGap);
 // radial profile across the subject edge, averaged over angles: monotone-ish, bounded 1st/2nd differences (C1, no cliff)
 const R=Math.floor(n*0.45),prof=[];
 for(let r=0;r<R;r++){let s=0,k=0;for(let a=0;a<64;a++){const t=a/64*2*Math.PI,x=Math.round(c+r*Math.cos(t)),y=Math.round(c*0.9+r*Math.sin(t));if(x>=0&&y>=0&&x<n&&y<n&&!(y>n*0.75)){s+=h[y*n+x];k++;}}prof.push(s/k);}
 let d1=0,d2=0;for(let r=1;r<R-1;r++){d1=Math.max(d1,Math.abs(prof[r+1]-prof[r]));d2=Math.max(d2,Math.abs(prof[r+1]-2*prof[r]+prof[r-1]));}
 assert.ok(d1<0.06,'max slope per node '+d1);// a hard cliff would be ~0.5 in one node
 assert.ok(d2<0.02,'max curvature per node '+d2);
 // feathering: the falloff spans several percent of the side, not 1–2 nodes
 const hi=prof[Math.floor(n*0.1)],lo=prof[R-1],span=prof.findIndex((v,i)=>i>n*0.1&&v<lo+0.1*(hi-lo))-prof.findIndex((v,i)=>i>n*0.1&&v<lo+0.9*(hi-lo));
 assert.ok(span>=n*0.04,'feather width '+span);
 // higher 丝滑度 → smoother (lower mean |laplacian|)
 const lap=a=>{let s=0;for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){const i=y*n+x;s+=Math.abs(4*a[i]-a[i-1]-a[i+1]-a[i-n]-a[i+n]);}return s/((n-2)*(n-2));};
 const rough=photoReliefFromLuminance(L,n,n,defaultPhotoReliefParams({smoothness:0})).values,silk=photoReliefFromLuminance(L,n,n,defaultPhotoReliefParams({smoothness:1})).values;
 assert.ok(lap(silk)<lap(rough),`laplacian silk ${lap(silk)} rough ${lap(rough)}`);
});

test('helpers: blurFast is mass-preserving; EDT exact on a 3-4-5 triangle',()=>{
 const w=50,h=40,a=new Float64Array(w*h);a[20*w+25]=1;const b=blurFast(a,w,h,4);let s=0;for(const v of b)s+=v;assert.ok(Math.abs(s-1)<1e-9);
 const ins=new Uint8Array(10*10).fill(1);ins[0]=0;assert.ok(Math.abs(distanceTransform(ins,10,10)[4*10+3]-5)<1e-12);
});

test('performance: 1025² v2 conversion finishes well inside the fit budget',()=>{
 const n=1025,{L}=scene(n),t=performance.now();
 const out=photoReliefFromLuminance(L,n,n,defaultPhotoReliefParams(),{onProgress:()=>{}}).values;
 const ms=performance.now()-t;assert.equal(out.length,n*n);assert.ok(ms<20000,'1025² took '+ms+' ms');
});

test('big images: decode target ≤4096 px / ≤16M px, deterministic area-average downscale',()=>{
 assert.deepEqual(decodeTargetSize(800,600),{width:800,height:600,scale:1,downscaled:false});
 const t=decodeTargetSize(5184,3456);assert.ok(t.downscaled&&t.width<=4096&&t.height<=4096&&t.width*t.height<=16*1024*1024);
 assert.equal(t.width,4096);assert.equal(t.height,2730);
 const t2=decodeTargetSize(4160,3120);assert.ok(t2.width===4096&&t2.height===3072);
 const w=9,h=6,rgba=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++)rgba.set([i*4%256,100,200,255],i*4);
 const a=downscaleRgba(rgba,w,h,4,3),b=downscaleRgba(rgba,w,h,4,3);assert.deepEqual(a,b);
 for(let i=0;i<12;i++){assert.equal(a[i*4+1],100);assert.equal(a[i*4+3],255);}
 assert.throws(()=>decodeTargetSize(0,10),/尺寸/);
});

test('import → convert → source: v2 derivedFrom version 2; panel defaults to v2',()=>{
 const {rgba,n}=scene(64);
 const g=convertRgbaToHeightGrid(rgba,n,n,{columns:n,rows:n,mode:'photoRelief',photo:defaultPhotoReliefParams()});
 assert.equal(g.photoReliefVersion,2);
 const src=createReliefHeightSource({original:{sha256:'a'.repeat(64),name:'s.png'},interpretation:'shadedReference',settings:g.settings,grid:encodeHeightGrid(g)});
 assert.equal(src.derivedFrom.photoReliefVersion,2);
 const r=heightPanelRequest({columns:'32',black:0,white:1,gamma:1,blur:0,depth:3,keepout:0,fade:0,use:'shadedReference'},{image:{width:64,height:64}});
 assert.equal(r.settings.photo.algorithm,2);assert.ok(r.settings.photo.volume>=0.7,'high 立体度 default');
});

test('worker client: progress, result equals main thread, cancel and error are clear',async()=>{
 const {rgba,n}=scene(48);
 const params=sourceConvertWorkerParams({width:n,height:n,settings:{columns:n,rows:n,mode:'photoRelief',photo:defaultPhotoReliefParams()},depthMm:3,machiningPrecisionMm:.05});
 const direct=runSourceConvertJob(rgba,params);
 // fake worker running the job synchronously on postMessage
 const fake=()=>{const w={terminated:false,terminate(){w.terminated=true;},postMessage(m){queueMicrotask(()=>{if(w.terminated)return;try{const o=runSourceConvertJob(new Uint8ClampedArray(m.rgba),m.params,(f,s)=>w.onmessage({data:{id:m.id,type:'progress',fraction:f,stage:s}}));w.onmessage({data:{id:m.id,type:'result',grid:o.grid,precision:o.precision}});}catch(e){w.onmessage({data:{id:m.id,type:'error',code:e.code,message:e.message}});}});}};return w;};
 const stages=[];const out=await convertInBackground(rgba,params,{workerFactory:fake,onProgress:(f,s)=>stages.push(s)});
 assert.equal(out.where,'worker');assert.deepEqual(out.grid,direct.grid);assert.ok(stages.includes('envelope')&&stages.at(-1)==='done');
 assert.equal(rgba.length,n*n*4,'caller keeps its RGBA');
 const main=await convertInBackground(rgba,params,{workerFactory:()=>null});assert.equal(main.where,'main');assert.deepEqual(main.grid,direct.grid);
 const ac=new AbortController();const hang=()=>({terminate(){},postMessage(){}});
 const p=convertInBackground(rgba,params,{workerFactory:hang,signal:ac.signal});ac.abort();
 await assert.rejects(p,e=>e.code==='RELIEF_CONVERT_CANCELLED');
 await assert.rejects(convertInBackground(rgba,params,{workerFactory:hang,timeoutMs:20}),e=>e.code==='RELIEF_CONVERT_TIMEOUT'&&/超时/.test(e.message));
 await assert.rejects(convertInBackground(rgba,{...params,width:0},{workerFactory:()=>null}),e=>e.code==='PARAM_SCHEMA_INVALID');
});
