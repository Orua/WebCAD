// LogoVector uses byte luminance, unlike the normalized relief height-map reader.
export const LOGO_RASTER_SCHEMA = Object.freeze({
  type:'object', additionalProperties:false,
  properties:{
    mode:{type:'string',enum:['auto','manual'],description:'Omitted raster or mode:auto uses automatic bitmap analysis. A supplied legacy raster object without mode keeps manual settings.'},
    threshold:{type:'integer',minimum:0,maximum:255,default:128,description:'8-bit luminance; dark pixels below this value are foreground unless invert is true. Not a 0–1 relief threshold.'},
    smoothingPx:{type:'number',minimum:0,maximum:0.5,default:0,description:'Explicit bounded smoothing in source pixels; 0 keeps pixel contours. Preserves regions/holes and rejects invalid topology. This is not an image reconstruction error guarantee.'},
    invert:{type:'boolean',default:false},
    alphaThreshold:{type:'integer',minimum:0,maximum:255,default:1}
  }
});

export function validateLogoRasterOptions(raster){
  if(raster===undefined)return;
  const fail=(message,path)=>{throw Object.assign(new Error(message),{code:'PARAM_SCHEMA_INVALID',path});};
  if(!raster||typeof raster!=='object'||Array.isArray(raster))fail('raster 必须为位图阈值选项对象。','raster');
  for(const key of Object.keys(raster))if(!Object.hasOwn(LOGO_RASTER_SCHEMA.properties,key))fail(`未知位图选项 raster.${key}。`,`raster.${key}`);
  if(Object.hasOwn(raster,'mode')&&!['auto','manual'].includes(raster.mode))fail('raster.mode 必须为 auto 或 manual。','raster.mode');
  if(raster.mode==='auto'&&Object.keys(raster).some(key=>key!=='mode'))fail('自动识别不能同时指定手动阈值或平滑参数。','raster');
  for(const key of ['threshold','alphaThreshold']){
    if(Object.hasOwn(raster,key)&&(!Number.isInteger(raster[key])||raster[key]<0||raster[key]>255))fail(`raster.${key} 必须是 0–255 整数；LOGO 默认 threshold=128、alphaThreshold=1，不使用浮雕的 0–1 阈值。`,`raster.${key}`);
  }
  if(Object.hasOwn(raster,'invert')&&typeof raster.invert!=='boolean')fail('raster.invert 必须为布尔值，默认 false。','raster.invert');
  if(Object.hasOwn(raster,'smoothingPx')&&(!Number.isFinite(raster.smoothingPx)||raster.smoothingPx<0||raster.smoothingPx>0.5))fail('raster.smoothingPx 必须为 0–0.5 源像素数值，0 关闭平滑。','raster.smoothingPx');
  // Preserve the supplied request exactly; do not add defaults that change a job fingerprint.
}
