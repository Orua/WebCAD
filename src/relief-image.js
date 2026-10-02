// Local image preparation shared by the UI and public readRelief API.
// No network requests or model mutation. Only normalized height samples persist.
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function heightValuesFromRgba(data,width,height,{whiteHigh=false,style='grayscale',threshold=.5}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<4||height<4||width>65||height>65||data.length!==width*height*4)fail('RELIEF_IMAGE_INVALID','采样网格必须为 4–65 行/列');
 if(typeof whiteHigh!=='boolean'||!['grayscale','rounded'].includes(style)||!Number.isFinite(threshold)||threshold<0||threshold>1)fail('PARAM_SCHEMA_INVALID','图片处理参数无效');
 const values=Array.from({length:height},(_,j)=>Array.from({length:width},(_,i)=>{
  const k=((height-1-j)*width+i)*4;const l=(.2126*data[k]+.7152*data[k+1]+.0722*data[k+2])/255;
  return Math.max(0,Math.min(1,(whiteHigh?l:1-l)*data[k+3]/255));
 }));
 if(style==='rounded'){
  // Distance to silhouette background yields a rounded ridge instead of a
  // flat text extrusion. A padded zero ring closes shapes touching the image.
  const w=width+2,h=height+2,d=Array.from({length:h},(_,j)=>Array.from({length:w},(_,i)=>j&&i&&j<h-1&&i<w-1&&values[j-1][i-1]>threshold?1e6:0));
  const root2=Math.SQRT2;
  for(let j=1;j<h-1;j++)for(let i=1;i<w-1;i++)d[j][i]=Math.min(d[j][i],d[j][i-1]+1,d[j-1][i]+1,d[j-1][i-1]+root2,d[j-1][i+1]+root2);
  for(let j=h-2;j>0;j--)for(let i=w-2;i>0;i--)d[j][i]=Math.min(d[j][i],d[j][i+1]+1,d[j+1][i]+1,d[j+1][i+1]+root2,d[j+1][i-1]+root2);
  let max=0;for(let j=0;j<height;j++)for(let i=0;i<width;i++)max=Math.max(max,d[j+1][i+1]);
  for(let j=0;j<height;j++)for(let i=0;i<width;i++)values[j][i]=max?Math.sin(d[j+1][i+1]/max*Math.PI/2):0;
 }
 return values.map(r=>r.map(v=>Math.round(v*1e6)/1e6));
}

export function validateReliefSvg(text){
 if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('RELIEF_IMAGE_INVALID','SVG 不支持外部实体');
 const doc=new DOMParser().parseFromString(text,'image/svg+xml'),root=doc.documentElement;
 if(doc.querySelector('parsererror')||root.localName!=='svg')fail('RELIEF_IMAGE_INVALID','SVG 格式无效');
 const tags=new Set(['svg','g','path','rect','circle','ellipse','polygon','polyline','line','defs','linearGradient','radialGradient','stop','title','desc']);
 const attrs=new Set(['xmlns','id','version','viewBox','width','height','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','fx','fy','fr','d','points','transform','fill','fill-rule','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-miterlimit','opacity','offset','stop-color','stop-opacity','gradientUnits','gradientTransform','spreadMethod','preserveAspectRatio','style']);
 const styles=new Set(['fill','fill-rule','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-miterlimit','opacity','stop-color','stop-opacity']);
 const nodes=[root,...root.querySelectorAll('*')];if(nodes.length>10000)fail('RELIEF_LIMIT','SVG 图元超过 10000 个');
 for(const node of nodes){
  if(node.namespaceURI&&node.namespaceURI!=='http://www.w3.org/2000/svg'||!tags.has(node.localName))fail('RELIEF_IMAGE_INVALID',`SVG 不支持 ${node.localName}；文字请先转路径，外部图片请用 JPG/PNG`);
  for(const a of node.attributes){
   if(!attrs.has(a.name)||/javascript:|data:|https?:|@import|expression\s*\(/i.test(a.value.replace(/\s/g,''))&&a.name!=='xmlns')fail('RELIEF_IMAGE_INVALID',`SVG 不支持属性 ${a.name} 或外部资源`);
   if(a.value.includes('\\'))fail('RELIEF_IMAGE_INVALID','SVG 不支持转义样式');
   const cleaned=a.value.replace(/url\(\s*['"]?#[\w.-]+['"]?\s*\)/g,'');if(/url\s*\(/i.test(cleaned))fail('RELIEF_IMAGE_INVALID','SVG 只允许本地渐变引用');
   if(a.name==='style')for(const entry of a.value.split(';').filter(x=>x.trim())){const i=entry.indexOf(':');if(i<0||!styles.has(entry.slice(0,i).trim()))fail('RELIEF_IMAGE_INVALID','SVG 仅支持填充、描边、透明度和渐变颜色样式');}
  }
 }
 const viewBox=root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
 if(viewBox&&(viewBox.length!==4||viewBox.some(v=>!Number.isFinite(v))||viewBox[2]<=0||viewBox[3]<=0))fail('RELIEF_IMAGE_INVALID','SVG viewBox 无效');
 if(viewBox){const ratio=viewBox[2]/viewBox[3];if(ratio<1/64||ratio>64)fail('RELIEF_LIMIT','图像长宽比超过 64:1');root.setAttribute('width',String(Math.round(1024*Math.min(1,ratio))));root.setAttribute('height',String(Math.round(1024*Math.min(1,1/ratio))));}
 else if(!root.hasAttribute('width')||!root.hasAttribute('height'))fail('RELIEF_IMAGE_INVALID','SVG 需要 viewBox 或明确宽高');
 root.setAttribute('xmlns','http://www.w3.org/2000/svg');
 return new XMLSerializer().serializeToString(root);
}

export async function readReliefImage(blob,{name='image.jpg',samples=33,whiteHigh=false,style='grayscale',threshold=.5}={}){
 if(typeof name!=='string'||name.length>255||!Number.isInteger(samples)||samples<4||samples>65||typeof whiteHigh!=='boolean'||!['grayscale','rounded'].includes(style)||!Number.isFinite(threshold)||threshold<0||threshold>1)fail('PARAM_SCHEMA_INVALID','图片名称、采样或明暗参数无效');
 if(!(blob instanceof Blob)||!blob.size||blob.size>8*1024*1024)fail('RELIEF_LIMIT','图片须为非空文件且不超过 8 MiB');
 const format=/\.jpe?g$/i.test(name)?'jpg':/\.png$/i.test(name)?'png':/\.svg$/i.test(name)?'svg':null;
 if(!format)fail('FORMAT_UNSUPPORTED','浮雕支持 JPG、PNG 和 SVG');
 const bytes=await blob.arrayBuffer(),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 const imageBlob=format==='svg'?new Blob([validateReliefSvg(new TextDecoder().decode(bytes))],{type:'image/svg+xml'}):new Blob([bytes],{type:format==='jpg'?'image/jpeg':'image/png'});
 let bitmap,url;
 try{
  if(format==='svg'){url=URL.createObjectURL(imageBlob);bitmap=new Image();bitmap.decoding='async';await new Promise((resolve,reject)=>{bitmap.onload=resolve;bitmap.onerror=()=>reject(Object.assign(new Error('SVG 无法渲染'),{code:'RELIEF_IMAGE_INVALID'}));bitmap.src=url;});}
  else{try{bitmap=await createImageBitmap(imageBlob,{imageOrientation:'from-image'});}catch{fail('RELIEF_IMAGE_INVALID','无法解码图片；请使用有效 JPG 或 PNG');}}
  const originalWidth=bitmap.width,originalHeight=bitmap.height,ratio=originalWidth/originalHeight;
  if(!originalWidth||!originalHeight||originalWidth*originalHeight>16777216||ratio<1/64||ratio>64)fail('RELIEF_LIMIT','图片最多 1600 万像素，长宽比不超过 64:1');
  const width=Math.max(4,Math.round(samples*Math.min(1,ratio))),height=Math.max(4,Math.round(samples*Math.min(1,1/ratio)));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)fail('CAPABILITY_UNAVAILABLE','当前浏览器无法处理图片');
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,width,height);
  const values=heightValuesFromRgba(ctx.getImageData(0,0,width,height).data,width,height,{whiteHigh,style,threshold});
  if(!values.some(r=>r.some(v=>v>0)))fail('RELIEF_NO_CHANGE','图像没有可用高度，请反转明暗或调整阈值');
  return {values,aspectRatio:ratio,rows:height,columns:width,source:{name,sha256,format,style,whiteHigh,threshold,originalWidth,originalHeight},interpretation:style==='rounded'?'图形按到背景的距离逐渐鼓起；不是平顶凸字':'亮度映射为高度并平滑；不是照片的真实三维深度'};
 }finally{bitmap?.close?.();if(url)URL.revokeObjectURL(url);}
}
