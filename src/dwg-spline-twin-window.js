// Build two closed window outlines from four sampled, top-to-bottom DWG side curves.
// Sampling the source spline is a separate, source-specific step; no curve is invented here.
const fail=(message)=>{throw Object.assign(new Error(message),{code:'PARAM_SCHEMA_INVALID'});};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function curve(value,name){
  if(!Array.isArray(value)||value.length<3||value.length>2000)fail(`${name} requires 3–2000 sampled XY points`);
  const points=value.map(point=>{
    if(!Array.isArray(point)||point.length!==2||!point.every(finite))fail(`${name} requires finite XY points`);
    return [...point];
  });
  for(let i=1;i<points.length;i++)if(points[i][1]>=points[i-1][1]-1e-9)fail(`${name} must descend strictly in Y`);
  return points;
}
function atY(points,y){
  if(y>points[0][1]+1e-7||y<points.at(-1)[1]-1e-7)fail('Bar edge lies outside inner side curve');
  if(Math.abs(y-points[0][1])<1e-7)return [...points[0]];
  if(Math.abs(y-points.at(-1)[1])<1e-7)return [...points.at(-1)];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(a[1]>=y&&b[1]<=y){const t=(a[1]-y)/(a[1]-b[1]);return [a[0]+(b[0]-a[0])*t,y];}
  }
  fail('Bar edge does not cross side curve');
}
const segment=(points,high,low)=>[atY(points,high),...points.filter(p=>p[1]<high-1e-7&&p[1]>low+1e-7),atY(points,low)];
const area=points=>Math.abs(points.reduce((sum,p,i)=>sum+p[0]*points[(i+1)%points.length][1]-p[1]*points[(i+1)%points.length][0],0)/2);
function pointDistance(point,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
  const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length2));
  return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);
}
function simplifyCurve(points,tolerance){
  if(!tolerance)return {points,deviation:0};
  const minX=points.reduce((index,p,i)=>p[0]<points[index][0]?i:index,0);
  const maxX=points.reduce((index,p,i)=>p[0]>points[index][0]?i:index,0);
  const keep=new Set([0,points.length-1,minX,maxX]);
  const anchors=[...keep].sort((a,b)=>a-b),stack=[];
  for(let i=1;i<anchors.length;i++)stack.push([anchors[i-1],anchors[i]]);
  while(stack.length){
    const [start,end]=stack.pop();let farthest=start,best=tolerance;
    for(let i=start+1;i<end;i++){const distance=pointDistance(points[i],points[start],points[end]);if(distance>best){best=distance;farthest=i;}}
    if(farthest!==start){keep.add(farthest);stack.push([start,farthest],[farthest,end]);}
  }
  const indices=[...keep].sort((a,b)=>a-b);let deviation=0;
  for(let k=1;k<indices.length;k++)for(let i=indices[k-1]+1;i<indices[k];i++)deviation=Math.max(deviation,pointDistance(points[i],points[indices[k-1]],points[indices[k]]));
  return {points:indices.map(i=>points[i]),deviation};
}
export function traceTwinWindowProfile(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['outerLeft','outerRight','innerLeft','innerRight','barTopY','barBottomY','simplifyToleranceMm'].includes(k)))fail('Expected four side curves and two bar Y coordinates');
  const tolerance=input.simplifyToleranceMm??0;
  if(!finite(tolerance)||tolerance<0||tolerance>0.2)fail('simplifyToleranceMm must be 0..0.2 mm');
  const originals=[curve(input.outerLeft,'outerLeft'),curve(input.outerRight,'outerRight'),curve(input.innerLeft,'innerLeft'),curve(input.innerRight,'innerRight')];
  const simplified=originals.map(points=>simplifyCurve(points,tolerance));
  const [outerLeft,outerRight,innerLeft,innerRight]=simplified.map(result=>result.points);
  const top=input.barTopY,bottom=input.barBottomY;
  if(!finite(top)||!finite(bottom)||top<=bottom)fail('barTopY must exceed barBottomY');
  if(Math.abs(outerLeft[0][1]-outerRight[0][1])>0.01||Math.abs(outerLeft.at(-1)[1]-outerRight.at(-1)[1])>0.01||Math.abs(innerLeft[0][1]-innerRight[0][1])>0.01||Math.abs(innerLeft.at(-1)[1]-innerRight.at(-1)[1])>0.01)fail('Left and right curve ends must meet horizontal edges within 0.01 mm');
  if(!(outerLeft[0][1]>innerLeft[0][1]&&innerLeft[0][1]>top&&top>bottom&&bottom>innerLeft.at(-1)[1]&&innerLeft.at(-1)[1]>outerLeft.at(-1)[1]))fail('Outer, inner and bar Y ranges must be nested');
  const outer=[...outerLeft,...outerRight.toReversed()];
  const upper=[...segment(innerLeft,innerLeft[0][1],top),...segment(innerRight,innerRight[0][1],top).toReversed()];
  const lower=[...segment(innerLeft,bottom,innerLeft.at(-1)[1]),...segment(innerRight,bottom,innerRight.at(-1)[1]).toReversed()];
  const minX=Math.min(...outer.map(p=>p[0])),maxX=Math.max(...outer.map(p=>p[0]));
  if(Math.max(...innerLeft.map(p=>p[0]))>=Math.min(...innerRight.map(p=>p[0]))||Math.min(...innerLeft.map(p=>p[0]))<=minX||Math.max(...innerRight.map(p=>p[0]))>=maxX)fail('Inner curves cross each other or the outer envelope');
  if(![outer,upper,lower].every(p=>area(p)>1e-4))fail('Closed contours require positive area');
  const bounds={min:[minX,outerLeft.at(-1)[1]],max:[maxX,outerLeft[0][1]]};
  const center=[(bounds.min[0]+bounds.max[0])/2,(bounds.min[1]+bounds.max[1])/2];
  const normalized=points=>points.map(([x,y])=>[x-center[0],y-center[1]]);
  return {status:'read',source:'sampled-dwg-splines',units:'mm',bounds,size:[maxX-minX,bounds.max[1]-bounds.min[1]],
    simplifyToleranceMm:tolerance,maxObservedDeviationMm:Math.max(...simplified.map(result=>result.deviation)),
    sourcePointCounts:originals.map(points=>points.length),sidePointCounts:simplified.map(result=>result.points.length),
    pointCounts:[outer.length,upper.length,lower.length],regions:[{outer:normalized(outer),holes:[normalized(upper),normalized(lower)]}]};
}
