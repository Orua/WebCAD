// Marching triangles at the image threshold. Shared grid-edge keys close loops
// without welding nearby features. Contours remain independent of height poles.
const area=r=>r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
const inside=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
function simplify(points,tolerance){
 if(points.length<=2)return points;
 const a=points[0],b=points.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
 let max=0,index=0;
 for(let i=1;i<points.length-1;i++){const p=points[i],t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0,d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(d>max){max=d;index=i;}}
 return max<=tolerance?[a,b]:[...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)];
}
export function reliefContours(values,threshold=.5){
 const h=values.length,w=values[0]?.length;
 if(h<4||w<4||h>257||w>257||values.some(r=>r.length!==w)||!Number.isFinite(threshold)||threshold<=0||threshold>=1)throw Object.assign(Error('轮廓采样或阈值无效'),{code:'RELIEF_IMAGE_INVALID'});
 const links=new Map(),coordinates=new Map();
 const value=(x,y)=>x<0||y<0||x>=w||y>=h?0:values[y][x];
 const id=(x,y)=>(y+1)*(w+2)+x+1;
 const cut=(a,b)=>{const ia=id(...a),ib=id(...b),key=ia<ib?`${ia}:${ib}`:`${ib}:${ia}`;if(!coordinates.has(key)){const va=value(...a),vb=value(...b),t=(threshold-va)/(vb-va);coordinates.set(key,[(a[0]+t*(b[0]-a[0])+.5)/w-.5,(a[1]+t*(b[1]-a[1])+.5)/h-.5].map(v=>Math.max(-.5,Math.min(.5,v))));}return key;};
 const edge=(a,b)=>{if(!links.has(a))links.set(a,[]);links.get(a).push(b);};
 for(let y=-1;y<h;y++)for(let x=-1;x<w;x++){
  const a=[x,y],b=[x+1,y],c=[x+1,y+1],d=[x,y+1];
  for(const tri of [[a,b,c],[a,c,d]]){const cuts=[];for(let k=0;k<3;k++){const p=tri[k],q=tri[(k+1)%3];if((value(...p)>=threshold)!==(value(...q)>=threshold))cuts.push(cut(p,q));}if(cuts.length===2){edge(cuts[0],cuts[1]);edge(cuts[1],cuts[0]);}}
 }
 const rings=[],visited=new Set();
 for(const start of links.keys()){
  if(visited.has(start))continue;let current=start,previous=null;const points=[];
  do{visited.add(current);points.push(coordinates.get(current));const next=links.get(current)?.find(k=>k!==previous);previous=current;current=next;if(!current||points.length>200000)throw Object.assign(Error('图案轮廓无法闭合'),{code:'RELIEF_IMAGE_INVALID'});}while(current!==start&&!visited.has(current));
  // Split the closed ring into two open chains before bounded simplification.
  const mid=Math.floor(points.length/2),tol=.2/Math.max(w,h),ring=[...simplify(points.slice(0,mid+1),tol).slice(0,-1),...simplify([...points.slice(mid),points[0]],tol).slice(0,-1)];
  const unique=ring.filter((p,i)=>!i||Math.hypot(p[0]-ring[i-1][0],p[1]-ring[i-1][1])>1e-10);
  if(unique.length>2&&Math.hypot(unique[0][0]-unique.at(-1)[0],unique[0][1]-unique.at(-1)[1])<1e-10)unique.pop();
  if(unique.length>=3&&Math.abs(area(unique))>1e-12)rings.push(unique);
 }
 rings.sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)));
 const regions=[],parents=[];
 for(let i=0;i<rings.length;i++){let parent=-1;for(let j=i-1;j>=0;j--)if(inside(rings[i][0],rings[j])){parent=j;break;}const depth=parent<0?0:parents[parent].depth+1;const entry={depth,region:null};if(depth%2===0){entry.region={outer:rings[i],holes:[]};regions.push(entry.region);}else{entry.region=parents[parent].region;entry.region.holes.push(rings[i]);}parents.push(entry);}
 if(!regions.length||regions.length>150||regions.some(r=>[r.outer,...r.holes].some(p=>p.length>2000))||regions.reduce((n,r)=>n+r.outer.length+r.holes.reduce((m,h)=>m+h.length,0),0)>12000)throw Object.assign(Error('轮廓为空或过于复杂，请使用清晰图案并调整阈值'),{code:'RELIEF_LIMIT'});
 return regions;
}
