// Hand-entered polygon sections lofted into a measured solid.
const fail=(ok,msg)=>{if(!ok)throw new Error(msg);};
const finite=(n,msg)=>{fail(typeof n==='number'&&Number.isFinite(n),msg);return n;};
const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const between=(a,b,c)=>Math.min(a[0],b[0])-1e-9<=c[0]&&c[0]<=Math.max(a[0],b[0])+1e-9&&Math.min(a[1],b[1])-1e-9<=c[1]&&c[1]<=Math.max(a[1],b[1])+1e-9;
function validPolygon(points){
  fail(Array.isArray(points)&&points.length>=3&&points.length<=64,'每个截面需要 3–64 个点');
  const p=points.map(x=>{fail(Array.isArray(x)&&x.length===2,'截面点必须为 [x,y]');return [finite(x[0],'截面坐标必须为有限数'),finite(x[1],'截面坐标必须为有限数')];});
  if(p[0][0]===p.at(-1)[0]&&p[0][1]===p.at(-1)[1])throw new Error('截面末点不得重复首点');
  for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++)fail(p[i][0]!==p[j][0]||p[i][1]!==p[j][1],'截面不能含重复点');
  let area=0;for(let i=0;i<p.length;i++)area+=p[i][0]*p[(i+1)%p.length][1]-p[(i+1)%p.length][0]*p[i][1];fail(Math.abs(area)>1e-9,'截面面积必须非零');
  for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){if(j===i+1||(i===0&&j===p.length-1))continue;const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length],o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);fail(!((o1*o2<0&&o3*o4<0)||(o1===0&&between(a,b,c))||(o2===0&&between(a,b,d))||(o3===0&&between(c,d,a))||(o4===0&&between(c,d,b))),'截面多边形不能自交');}
  return p;
}
const dispose=o=>{try{o?.delete();}catch{}};
export function buildAdvancedLoft(params,cad){
  const sections=params?.sections;fail(Array.isArray(sections)&&sections.length>=2&&sections.length<=12,'截面数量必须为 2–12');
  const ruled=params?.ruled===true;fail(params?.ruled===undefined||typeof params.ruled==='boolean','ruled 必须为布尔值');
  fail(params?.output===undefined||params.output==='solid'||params.output==='shell','output 必须为 solid 或 shell');
  const prepared=[];let count,winding;
  for(const section of sections){
    const z=finite(section?.z,'截面 z 必须为有限数');
    const points=validPolygon(section?.points);
    if(count===undefined)count=points.length; else fail(points.length===count,'所有截面必须有相同点数');
    const area=points.reduce((s,p,i)=>s+p[0]*points[(i+1)%points.length][1]-points[(i+1)%points.length][0]*p[1],0);
    if(winding===undefined)winding=Math.sign(area); else fail(Math.sign(area)===winding,'所有截面必须保持相同绕序');
    prepared.push({z,points});
  }
  for(let i=1;i<prepared.length;i++)fail(prepared[i].z>prepared[i-1].z,'截面 z 必须严格递增且间距非零');
  const wires=[],resources=[];try{
    for(const section of prepared){
      const pen=cad.draw(section.points[0]);
      resources.push(pen);
      for(const point of section.points.slice(1))pen.lineTo(point);
      const drawing=pen.close();
      resources.push(drawing);
      const plane=new cad.Plane([0,0,section.z],[1,0,0],[0,0,1]);
      resources.push(plane);
      const sketch=drawing.sketchOnPlane(plane);
      resources.push(sketch);
      wires.push(sketch.wire);
    }
    return cad.loft(wires,{ruled},params.output==='shell');
  }finally{resources.reverse().forEach(dispose);}
}
