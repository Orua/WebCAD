import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { validateRegions } from './logo-model.js';

const allowedTags=new Set(['svg','g','path','rect','circle','ellipse','polygon']);
const common=new Set(['id','transform','fill','fill-rule','stroke','opacity','style']);
const attributes={svg:new Set(['width','height','viewBox','preserveAspectRatio','xmlns','version']),g:new Set(),path:new Set(['d']),rect:new Set(['x','y','width','height','rx','ry']),circle:new Set(['cx','cy','r']),ellipse:new Set(['cx','cy','rx','ry']),polygon:new Set(['points'])};
const styles=new Set(['fill','fill-rule','stroke','opacity']);
const mmPerUnit={mm:1,cm:10,in:25.4,pt:25.4/72,px:25.4/96};
const fail=message=>{throw new Error(`SVG 不可安全转换：${message}`);};
const solidColor=value=>/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)||/^[a-z]+$/i.test(value)&&value.toLowerCase()!=='transparent'&&CSS.supports('color',value)||/^rgb\(\s*\d{1,3}(?:\s*,\s*|\s+)\d{1,3}(?:\s*,\s*|\s+)\d{1,3}\s*\)$/i.test(value);
function lengthMm(value){const m=/^\s*(\d+(?:\.\d+)?)(mm|cm|in|pt|px)\s*$/i.exec(value||'');if(!m)fail('请给出带 mm/cm/in/pt/px 单位的正尺寸，或填写目标宽度');const n=Number(m[1])*mmPerUnit[m[2].toLowerCase()];if(!Number.isFinite(n)||n<=0)fail('尺寸必须大于 0');return n;}
function validateTransform(value){
  const pattern=/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;let rest=value,match,count=0;
  while((match=pattern.exec(value))){rest=rest.replace(match[0],' ');count++;const nums=match[2].trim().split(/[\s,]+/).map(Number),kind=match[1];
    if(nums.some(n=>!Number.isFinite(n))||!({matrix:[6],translate:[1,2],scale:[1,2],rotate:[1,3],skewX:[1],skewY:[1]}[kind].includes(nums.length)))fail('二维变换参数无效');
    if(kind==='matrix'&&Math.abs(nums[0]*nums[3]-nums[1]*nums[2])<1e-12||kind==='scale'&&Math.abs(nums[0]*(nums[1]??nums[0]))<1e-12)fail('二维变换必须可逆');
  }
  if(!count||rest.replace(/[\s,]+/g,''))fail('只支持 matrix/translate/scale/rotate/skewX/skewY 二维变换');
}
function validateSvg(text){
  if(typeof text!=='string'||text.length>20*1024*1024)fail('源文件必须不超过 20 MiB');
  if(/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text))fail('不允许 DTD、实体或外部样式');
  const doc=new DOMParser().parseFromString(text,'image/svg+xml');
  if(doc.querySelector('parsererror')||doc.documentElement?.localName!=='svg')fail('需要完整有效的 SVG');
  let visible=0,color=null;
  function walk(node,inherited={fill:'#000000',opacity:1,fillRule:'nonzero',stroke:'none'}){
    const tag=node.localName;if(!allowedTags.has(tag))fail(`不支持 ${tag} 元素`);
    const next={...inherited};
    for(const attr of node.attributes){const name=attr.localName,value=attr.value.trim();if(attr.name.startsWith('on')||attr.name.includes(':')&&attr.name!=='xmlns')fail('不允许事件、链接或命名空间属性');if(!common.has(name)&&!attributes[tag].has(name))fail(`不支持 ${name} 属性`);if(name==='style')for(const item of value.split(';').filter(Boolean)){const parts=item.split(':');if(parts.length!==2||!styles.has(parts[0].trim()))fail('只支持纯色填充样式');next[parts[0].trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=parts[1].trim();}else if(name==='fill')next.fill=value;else if(name==='fill-rule')next.fillRule=value;else if(name==='stroke')next.stroke=value;else if(name==='opacity')next.opacity=Number(value);else if(name==='transform')validateTransform(value);
      else if(tag==='path'&&name==='d'){if(value.replace(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]+/g,''))fail('路径含不支持的命令或语法');}
      else if(['rect','circle','ellipse'].includes(tag)&&!common.has(name)&&!/^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?$/.test(value))fail('图形尺寸只接受有限数值，不接受百分比或 CSS 单位');
      else if(tag==='polygon'&&name==='points'&&value.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]+/g,''))fail('多边形坐标无效');
    }
    if(!Number.isFinite(Number(next.opacity))||Number(next.opacity)!==1)fail('只支持完全不透明的填充');
    if(next.stroke!=='none')fail('本地导入不支持描边，请转为闭合填充轮廓');
    if(!['nonzero','evenodd'].includes(next.fillRule))fail('填充规则必须为 nonzero 或 evenodd');
    if(!['svg','g'].includes(tag)){
      if(!next.fill||next.fill==='none'||!solidColor(next.fill))fail('只支持单一纯色填充');
      if(color!==null&&color!==next.fill)fail('一个 LOGO 只支持一种填充颜色');
      color=next.fill;visible++;
    }
    for(const child of node.children)walk(child,next);
  }
  walk(doc.documentElement);if(!visible)fail('没有可加工的闭合填充区域');
  return {root:doc.documentElement,color};
}
const xy=p=>[p.x,p.y];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
const lineDistance=(p,a,b)=>{const d=dist(a,b);return d<1e-12?dist(p,a):Math.abs((b[0]-a[0])*(a[1]-p[1])-(a[0]-p[0])*(b[1]-a[1]))/d;};
function flattenBezier(points,tol,out,depth=0){
  const a=points[0],b=points.at(-1);
  if(depth>18)fail('曲线超过安全细分深度');
  if(points.slice(1,-1).every(p=>lineDistance(p,a,b)<=tol)&&points.slice(1,-1).every(p=>{const ab=[b[0]-a[0],b[1]-a[1]],den=ab[0]*ab[0]+ab[1]*ab[1];const t=den?((p[0]-a[0])*ab[0]+(p[1]-a[1])*ab[1])/den:0;return t>=0&&t<=1;})){out.push(b);return;}
  let row=points,left=[row[0]],right=[row.at(-1)];while(row.length>1){row=row.slice(1).map((p,i)=>midpoint(row[i],p));left.push(row[0]);right.unshift(row.at(-1));}
  flattenBezier(left,tol,out,depth+1);flattenBezier(right,tol,out,depth+1);
}
function flattenCurve(curve,tol,out){
  if(curve.isLineCurve){out.push(xy(curve.v2));return;}
  if(curve.isQuadraticBezierCurve){flattenBezier([xy(curve.v0),xy(curve.v1),xy(curve.v2)],tol,out);return;}
  if(curve.isCubicBezierCurve){flattenBezier([xy(curve.v0),xy(curve.v1),xy(curve.v2),xy(curve.v3)],tol,out);return;}
  if(curve.isEllipseCurve){let sweep=Math.abs(curve.aEndAngle-curve.aStartAngle);if(sweep<1e-10)sweep=2*Math.PI;const radius=Math.max(Math.abs(curve.xRadius),Math.abs(curve.yRadius));const segments=Math.max(4,Math.ceil(sweep/Math.max(1e-5,2*Math.acos(Math.max(-1,1-tol/Math.max(radius,tol))))));if(segments>12000)fail('圆弧细分超过顶点预算');for(let i=1;i<=segments;i++)out.push(xy(curve.getPoint(i/segments)));return;}
  fail('不支持的路径曲线');
}
function flattenPath(path,tol){const out=[];for(const curve of path.curves){if(!out.length)out.push(xy(curve.getPoint(0)));flattenCurve(curve,tol,out);if(out.length>12001)fail('单个轮廓超过 2000 顶点');}if(out.length>1&&dist(out[0],out.at(-1))<1e-7)out.pop();return out;}
function area(ring){return ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0);}
export function parseLocalLogoSvg(text,{name='local.svg',targetWidthMm}={}){
  const source=text.trim().startsWith('<')?text:`<svg xmlns="http://www.w3.org/2000/svg"><path d="${text.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')}"/></svg>`;
  const parsed=validateSvg(source),root=parsed.root,viewBox=root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if(viewBox&&(viewBox.length!==4||viewBox.some(v=>!Number.isFinite(v))||viewBox[2]<=0||viewBox[3]<=0))fail('viewBox 无效');
  const width=root.hasAttribute('width')?lengthMm(root.getAttribute('width')):null,height=root.hasAttribute('height')?lengthMm(root.getAttribute('height')):null;
  if((width===null)!==(height===null))fail('SVG 宽高应同时给出');
  if(targetWidthMm!==undefined&&(!Number.isFinite(targetWidthMm)||targetWidthMm<=0))fail('目标宽度必须大于 0');
  if(width===null&&targetWidthMm===undefined)fail('请填写目标宽度（mm）');
  const preserve=root.getAttribute('preserveAspectRatio')||'xMidYMid meet';
  if(!['xMidYMid meet','xMidYMid','none'].includes(preserve))fail('只支持 xMidYMid meet 或 none');
  const loader=new SVGLoader(),paths=loader.parse(source).paths;
  const raw=[];for(const path of paths){for(const sub of path.subPaths){if(!sub.curves.length)continue;const a=xy(sub.curves[0].getPoint(0)),b=xy(sub.curves.at(-1).getPoint(1));if(!sub.autoClose&&dist(a,b)>1e-7)fail('开放路径不能作为填充区域');}for(const shape of SVGLoader.createShapes(path))raw.push({outer:shape,holes:shape.holes});}
  if(!raw.length)fail('没有可用的填充轮廓');
  let bounds=viewBox;if(!bounds){const pts=raw.flatMap(r=>[r.outer,...r.holes].flatMap(p=>p.getPoints(48)));const minX=Math.min(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y)),maxX=Math.max(...pts.map(p=>p.x)),maxY=Math.max(...pts.map(p=>p.y));bounds=[minX,minY,maxX-minX,maxY-minY];}
  if(bounds[2]<=0||bounds[3]<=0)fail('轮廓尺寸无效');
  const outputWidth=targetWidthMm??width,outputHeight=targetWidthMm!==undefined?targetWidthMm*bounds[3]/bounds[2]:height;
  const sx=outputWidth/bounds[2],sy=outputHeight/bounds[3],scale=Math.min(sx,sy);
  const tx=preserve==='none'?sx:scale,ty=preserve==='none'?sy:scale,tol=0.004/Math.max(tx,ty),marginX=(outputWidth-bounds[2]*tx)/2,marginY=(outputHeight-bounds[3]*ty)/2;
  const convert=p=>[(p[0]-bounds[0])*tx+marginX-outputWidth/2,outputHeight/2-((p[1]-bounds[1])*ty+marginY)];
  const regions=raw.map(r=>({outer:flattenPath(r.outer,tol).map(convert),holes:r.holes.map(h=>flattenPath(h,tol).map(convert))})).map(r=>({outer:area(r.outer)>0?r.outer:r.outer.reverse(),holes:r.holes.map(h=>area(h)<0?h:h.reverse())}));
  validateRegions({regions});
  return {type:'webcad-logo',version:1,units:'mm',name,source:{kind:'local-svg',name,fillColor:parsed.color,approximationToleranceMm:0.005,reviewed:false},sizeMm:[outputWidth,outputHeight],regions};
}
