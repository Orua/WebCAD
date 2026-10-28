// Image -> editable height grid. Pure functions: decoded RGBA in, normalized 0..1 grid out.
// Every result carries the hash of its normalized settings so the conversion is reproducible.
import {contractHash,binaryHash} from '../contracts/operation-schema.js';
import {photoReliefFromLuminance,normalizePhotoReliefParams,PHOTO_RELIEF_VERSION,detectPhotoLikeImage} from './photo-relief.js';
export {detectPhotoLikeImage,PHOTO_RELIEF_VERSION,PHOTO_RELIEF_DEFAULTS,normalizePhotoReliefParams} from './photo-relief.js';
const fail=(code,message,path)=>{throw Object.assign(new Error(message),{code,...(path?{path}:{})});};
export const RELIEF_CONVERT_VERSION=1;
export const RELIEF_CONVERT_LIMITS=Object.freeze({minSide:2,maxSide:2049,maxBlurPx:32,maxSourcePixels:16777216});
const num=(v,d,min,max,path)=>{const x=v??d;if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)fail('PARAM_RANGE_INVALID',`${path} 需要 ${min}–${max}`,path);return x;};
// Default import grid (relief.source-convert-1 settings are always explicit; this only picks them).
// Long side = clamp(physical need = ceil(max(W,H)/precision)+1, 129, 1025), never denser than the (cropped)
// source pixels; aspect follows the cropped image so grid cells stay square.
export const RELIEF_AUTO_GRID=Object.freeze({minSide:129,maxSide:1025});
// Height-grid node budget shared with Services (NativeAdapter.MaxGridNodes = 1025²). Over-budget (or >1025 side) requests are
// downsampled (aspect kept: floor-scale, then trim the longer side) instead of failing — same rule on both sides.
export const RELIEF_GRID_NODE_BUDGET=1025*1025;
export const RELIEF_GRID_MAX_SIDE=1025;
export function budgetGridSize(columns,rows,max=RELIEF_GRID_NODE_BUDGET,maxSide=RELIEF_GRID_MAX_SIDE){
 if(columns*rows<=max&&columns<=maxSide&&rows<=maxSide)return {columns,rows,downsampled:false};
 const k=Math.min(Math.sqrt(max/(columns*rows)),maxSide/Math.max(columns,rows));let c=Math.min(maxSide,Math.max(2,Math.floor(columns*k))),r=Math.min(maxSide,Math.max(2,Math.floor(rows*k)));
 while(c*r>max){if(c>=r)c--;else r--;}
 return {columns:c,rows:r,downsampled:true};
}
export function autoGridSize({width,height,crop={width:1,height:1},sizeMm,precisionMm=.05}){
 const pw=width*(crop.width??1),ph=height*(crop.height??1);if(!(pw>=2&&ph>=2))fail('PARAM_RANGE_INVALID','图像尺寸无效','image');
 const A=RELIEF_AUTO_GRID,px=Math.floor(Math.max(pw,ph)),need=sizeMm&&precisionMm>0?Math.ceil(Math.max(sizeMm[0],sizeMm[1])/precisionMm)+1:A.maxSide;
 const L=Math.max(2,Math.min(px,A.maxSide,Math.max(A.minSide,need))),k=L/Math.max(pw,ph);
 return {columns:Math.max(2,Math.min(L,Math.round(pw*k))),rows:Math.max(2,Math.min(L,Math.round(ph*k)))};
}
export function normalizeConvertSettings(s={}){
 if(!s||typeof s!=='object'||Array.isArray(s))fail('PARAM_SCHEMA_INVALID','转换设置需要对象','settings');
 const allowed=['version','columns','rows','crop','levels','gamma','blurPx','invert','mode','photo'];
 for(const k of Object.keys(s))if(!allowed.includes(k))fail('PARAM_SCHEMA_INVALID','未知转换设置：'+k,'settings.'+k);
 if(s.version!==undefined&&s.version!==RELIEF_CONVERT_VERSION)fail('PARAM_SCHEMA_INVALID','不支持的转换设置版本','settings.version');
 const mode=s.mode??'luminance';
 if(mode!=='luminance'&&mode!=='photoRelief')fail('PARAM_SCHEMA_INVALID','mode 仅支持 luminance 或 photoRelief','settings.mode');
 if(mode==='luminance'&&s.photo!==undefined)fail('PARAM_SCHEMA_INVALID','luminance 模式不接受 photo 参数','settings.photo');
 const L=RELIEF_CONVERT_LIMITS,int=(v,path)=>{const x=num(v,undefined,L.minSide,L.maxSide,path);if(!Number.isInteger(x))fail('PARAM_RANGE_INVALID',path+' 需要整数',path);return x;};
 const c=s.crop??{x:0,y:0,width:1,height:1};
 if(!c||typeof c!=='object'||Object.keys(c).some(k=>!['x','y','width','height'].includes(k)))fail('PARAM_SCHEMA_INVALID','crop 需要 {x,y,width,height}（0–1）','settings.crop');
 const crop={x:num(c.x,0,0,1,'crop.x'),y:num(c.y,0,0,1,'crop.y'),width:num(c.width,1,1e-6,1,'crop.width'),height:num(c.height,1,1e-6,1,'crop.height')};
 if(crop.x+crop.width>1+1e-12||crop.y+crop.height>1+1e-12)fail('PARAM_RANGE_INVALID','裁剪框超出图像','settings.crop');
 const l=s.levels??{black:0,white:1};
 if(!l||typeof l!=='object'||Object.keys(l).some(k=>!['black','white'].includes(k)))fail('PARAM_SCHEMA_INVALID','levels 需要 {black,white}','settings.levels');
 const levels={black:num(l.black,0,0,1,'levels.black'),white:num(l.white,1,0,1,'levels.white')};
 if(levels.white<=levels.black)fail('PARAM_RANGE_INVALID','白点必须高于黑点','settings.levels');
 if(s.invert!==undefined&&typeof s.invert!=='boolean')fail('PARAM_SCHEMA_INVALID','invert 需要布尔值','settings.invert');
 // Keep luminance defaults bit-identical to pre-photoRelief (no mode/photo keys) so settingsHash stays stable.
 const base={version:RELIEF_CONVERT_VERSION,columns:int(s.columns,'columns'),rows:int(s.rows,'rows'),crop,levels,gamma:num(s.gamma,1,.1,10,'gamma'),blurPx:num(s.blurPx,0,0,L.maxBlurPx,'blurPx'),invert:s.invert??false};
 if(mode==='luminance')return base;
 return {...base,mode:'photoRelief',photo:normalizePhotoReliefParams(s.photo)};
}
export const convertSettingsHash=settings=>contractHash(normalizeConvertSettings(settings));
function blur(values,w,h,sigma){
 if(!(sigma>0))return values;
 const r=Math.ceil(sigma*3),k=Array.from({length:2*r+1},(_,i)=>Math.exp(-((i-r)**2)/(2*sigma*sigma))),sum=k.reduce((a,b)=>a+b,0),kn=k.map(v=>v/sum);
 const pass=(src,horizontal)=>{const out=new Float64Array(src.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let acc=0;for(let t=-r;t<=r;t++){const xx=horizontal?Math.min(w-1,Math.max(0,x+t)):x,yy=horizontal?y:Math.min(h-1,Math.max(0,y+t));acc+=kn[t+r]*src[yy*w+xx];}out[y*w+x]=acc;}return out;};
 return pass(pass(values,true),false);
}
function areaAverageLuminance(rgba,width,height,s){
 const x0=s.crop.x*width,y0=s.crop.y*height,cw=s.crop.width*width,ch=s.crop.height*height,{columns:C,rows:R}=s;
 const g=new Float64Array(C*R);
 for(let j=0;j<R;j++){const ya=y0+j*ch/R,yb=y0+(j+1)*ch/R;for(let i=0;i<C;i++){const xa=x0+i*cw/C,xb=x0+(i+1)*cw/C;let acc=0,area=0;
  for(let y=Math.floor(ya);y<Math.ceil(yb)&&y<height;y++){const wy=Math.min(yb,y+1)-Math.max(ya,y);if(wy<=0)continue;for(let x=Math.floor(xa);x<Math.ceil(xb)&&x<width;x++){const wx=Math.min(xb,x+1)-Math.max(xa,x);if(wx<=0)continue;const k=(y*width+x)*4,a=rgba[k+3]/255,lum=(.2126*rgba[k]+.7152*rgba[k+1]+.0722*rgba[k+2])/255;acc+=(lum*a+(1-a))*wx*wy;area+=wx*wy;}}
  g[j*C+i]=area?acc/area:1;}}
 return g;
}
/** rgba: Uint8(Clamped)Array width*height*4, row 0 = image top. Returns values in [0,1], row 0 = image top. */
export function convertRgbaToHeightGrid(rgba,width,height,settings){
 const s=normalizeConvertSettings(settings);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>RELIEF_CONVERT_LIMITS.maxSourcePixels)fail('RELIEF_LIMIT','图像尺寸无效或超过 16M 像素');
 if(!rgba||rgba.length!==width*height*4)fail('PARAM_SCHEMA_INVALID','RGBA 数据长度与尺寸不符');
 const {columns:C,rows:R}=s;
 let g=areaAverageLuminance(rgba,width,height,s);
 if(s.mode==='photoRelief'){
  // Photo relief operates on the cropped/resampled luminance grid; levels/gamma/blur still apply as post-tone.
  const pr=photoReliefFromLuminance(g,C,R,s.photo);
  g=Float64Array.from(pr.values);
 }else{
  g=blur(g,C,R,s.blurPx);
 }
 const out=new Float32Array(C*R);
 for(let k=0;k<g.length;k++){let v=(g[k]-s.levels.black)/(s.levels.white-s.levels.black);v=Math.min(1,Math.max(0,v));v=v**(1/s.gamma);out[k]=s.invert?1-v:v;}
 return {columns:C,rows:R,values:out,settings:s,settingsHash:contractHash(s),...(s.mode==='photoRelief'?{photoReliefVersion:PHOTO_RELIEF_VERSION}:{})};
}
const b64=bytes=>typeof Buffer!=='undefined'?Buffer.from(bytes).toString('base64'):btoa(Array.from(bytes,c=>String.fromCharCode(c)).join(''));
const unb64=text=>typeof Buffer!=='undefined'?new Uint8Array(Buffer.from(text,'base64')):Uint8Array.from(atob(text),c=>c.charCodeAt(0));
export function encodeHeightGrid({columns,rows,values}){
 const bytes=new Uint8Array(columns*rows*2);
 for(let k=0;k<columns*rows;k++){const v=Math.round(Math.min(1,Math.max(0,values[k]))*65535);bytes[k*2]=v&255;bytes[k*2+1]=v>>8;}
 return {columns,rows,encoding:'u16le',data:b64(bytes),sha256:binaryHash(bytes).slice(7)};
}
export function decodeHeightGrid(grid){
 if(!grid||grid.encoding!=='u16le'||!Number.isInteger(grid.columns)||!Number.isInteger(grid.rows))fail('PARAM_SCHEMA_INVALID','高度网格需要 u16le 编码');
 const bytes=unb64(grid.data);
 if(bytes.length!==grid.columns*grid.rows*2)fail('PARAM_SCHEMA_INVALID','高度网格数据长度不符');
 if(binaryHash(bytes).slice(7)!==grid.sha256)fail('MACHINING_SOURCE_CONFLICT','高度网格哈希与记录不符，数据已被修改');
 const out=new Float32Array(grid.columns*grid.rows);for(let k=0;k<out.length;k++)out[k]=(bytes[k*2]|bytes[k*2+1]<<8)/65535;return out;
}
/** Bilinear sample at normalized (u right, v down from image top), both in [0,1]; grid cell centres. */
export function sampleHeightGrid({columns:C,rows:R},values,u,v){
 const x=Math.min(C-1,Math.max(0,u*C-.5)),y=Math.min(R-1,Math.max(0,v*R-.5)),i=Math.floor(x),j=Math.floor(y),i1=Math.min(C-1,i+1),j1=Math.min(R-1,j+1),fx=x-i,fy=y-j;
 return (values[j*C+i]*(1-fx)+values[j*C+i1]*fx)*(1-fy)+(values[j1*C+i]*(1-fx)+values[j1*C+i1]*fx)*fy;
}
