import source from './chain-source.js';
const cache=new Map(),N=384;
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function sampleNet(net,sx,sy,sz){
 const p=net.vDegree,knots=net.vKnots.flatMap((k,i)=>Array(net.vMults[i]).fill(k)),controls=net.poles[0].map((q,v)=>q.map((x,k)=>(x+net.poles.at(-1)[v][k])/2*[sx,sy,sz][k]));
 // All source centreline weights are 1. Derivative control hull bounds the
 // distance from any curve point to its nearest uniform-parameter sample.
 let speed=0;for(let i=0;i<controls.length-1;i++)speed=Math.max(speed,p*distance(controls[i],controls[i+1])/(knots[i+p+1]-knots[i+1]));
 const points=[];for(let s=0;s<N;s++){const t=s/N;let span=p;while(span<controls.length-1&&knots[span+1]<=t)span++;const d=Array.from({length:p+1},(_,j)=>[...controls[span-p+j]]);for(let r=1;r<=p;r++)for(let j=p;j>=r;j--){const k=span-p+j,alpha=(t-knots[k])/(knots[k+p-r+1]-knots[k]);d[j]=d[j].map((v,i)=>(1-alpha)*d[j-1][i]+alpha*v);}points.push(d[p]);}
 return {points,error:speed/(2*N)};
}
export function chainClearance(kind,w,l,d,pitch,angle,twistFactor=1){
 const key=JSON.stringify([kind,w,l,d,pitch,angle,twistFactor]);if(cache.has(key))return cache.get(key);
 let points,error,radius;
 if(kind==='oChain'){
  const a=(w-2*d)/2,b=(l-2*d)/2;if(a<=0||b<=0)throw Error('链条内孔尺寸无效');
  points=Array.from({length:2*N},(_,i)=>{const t=i*Math.PI/N,x=a*Math.cos(t),y=b*Math.sin(t),nx=Math.cos(t)/a,ny=Math.sin(t)/b,q=Math.hypot(nx,ny);return [x+nx/q*d/2,y+ny/q*d/2,0];});
  error=Math.PI/N*(Math.max(a,b)+d/2*Math.max(a,b)/Math.min(a,b))/2;radius=d/2;
 }else{
  const halves=source.nets.slice(0,2).map(net=>sampleNet(net,(w-d)/8,(l-d)/12,d/3*twistFactor));points=halves.flatMap(x=>x.points);error=Math.max(...halves.map(x=>x.error));radius=1.686069*d/3;
 }
 const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),other=points.map(([x,y,z])=>[c*x+s*z,y+pitch,-s*x+c*z]);
 let min=Infinity,linking=0;
 for(let i=0;i<points.length;i++){
  const p=points[i],next=points[(i+1)%points.length],da=next.map((v,k)=>v-p[k]);
  for(let j=0;j<other.length;j++){
   const q=other[j];min=Math.min(min,distance(p,q));const end=other[(j+1)%other.length],db=end.map((v,k)=>v-q[k]),r=p.map((v,k)=>v+da[k]/2-q[k]-db[k]/2),cross=[da[1]*db[2]-da[2]*db[1],da[2]*db[0]-da[0]*db[2],da[0]*db[1]-da[1]*db[0]];linking+=cross.reduce((v,x,k)=>v+x*r[k],0)/Math.hypot(...r)**3;
  }
 }
 const result={clearanceLowerBoundMm:min-2*error-2*radius,linkingNumber:linking/(4*Math.PI)};
 if(cache.size>100)cache.clear();cache.set(key,result);return result;
}
