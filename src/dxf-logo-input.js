import {parseDxf} from './vector-import.js';
import {validateRegions} from './logo-model.js';
import {logoContourBounds} from './logo-vector-review.js';

const fail=message=>{throw Object.assign(new Error(message),{code:'LOCAL_VECTOR_UNSUPPORTED'});};
const inside=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
/** Exact closed, zero-width 2D polylines. Curves and unsupported variants go to Services. */
export function parseLocalLogoDxf(text,{name='logo.dxf',targetWidthMm}={}){
 if(typeof text!=='string'||!/(?:^|\n)\s*0\s*\r?\n\s*EOF\s*$/.test(text)||!(/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*AC10(?:15|18|21|24|27|32)\s*(?:\r?\n|$)/.test(text)))fail('此 DXF 结构或版本需后台识别。');
 // parseDxf intentionally serves many vector tools; LOGO must reject ignored 3D/stroke data.
 const lines=text.split(/\r?\n/);let section='';
 for(let i=0;i+1<lines.length;i+=2){const code=Number(lines[i].trim()),value=lines[i+1].trim();if(!Number.isInteger(code))fail('DXF 组码无效。');if(code===2&&lines[i-1]?.trim()==='SECTION')section=value;if(code===0&&value==='ENDSEC')section='';if(section==='ENTITIES'&&[30,31,38,39,40,41,42,43].includes(code)&&Number(value)!==0)fail('DXF 含三维坐标、凸度或线宽，需要后台提取。');}
 const unit=/\$INSUNITS\s*\r?\n\s*70\s*\r?\n\s*(\d+)/.exec(text),scale=({1:25.4,2:304.8,4:1,5:10,6:1000})[unit?.[1]];
 if(!scale&&!(Number.isFinite(targetWidthMm)&&targetWidthMm>0))fail('DXF 未声明可靠单位，请填写图案实际宽度。');
 const entities=parseDxf(text);if(!entities.length)fail('DXF 没有可读取的闭合轮廓。');
 const rings=entities.map(e=>{
  if(e.type!=='LWPOLYLINE'||!e.closed||e.isInPaperSpace||e.elevation||e.constantWidth||e.extrusionDirection.x||e.extrusionDirection.y||e.extrusionDirection.z!==1)fail('当前 DXF 需要后台提取；本地支持平面闭合直线折线。');
  if(e.vertices.some(v=>v.bulge||v.startWidth||v.endWidth||!Number.isFinite(v.x)||!Number.isFinite(v.y)))fail('当前 DXF 含曲线或线宽，需要后台提取。');
  return e.vertices.map(v=>[v.x*(scale||1),v.y*(scale||1)]);
 });
 const containers=rings.map((ring,i)=>rings.flatMap((outer,j)=>i!==j&&inside(ring[0],outer)?[j]:[])),regions=[];
 for(let i=0;i<rings.length;i++)if(containers[i].length%2===0)regions.push({outer:rings[i],holes:rings.filter((_,j)=>containers[j].length===containers[i].length+1&&containers[j].includes(i))});
 const logo={type:'webcad-logo',version:1,units:'mm',name,regions,source:{kind:'local-dxf',fileName:name,mmPerSourceUnit:scale||null,coordinateSystem:'x-right-y-up',origin:'bounds-center',reviewed:false,reviewRequired:true}};
 validateRegions(logo);const [a,b,c,d]=logoContourBounds(logo),cx=(a+c)/2,cy=(b+d)/2;
 for(const region of regions)for(const ring of [region.outer,...region.holes])for(const p of ring){p[0]-=cx;p[1]-=cy;}logo.sizeMm=[c-a,d-b];return logo;
}
