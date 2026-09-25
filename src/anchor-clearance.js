// Move a work point only when its current vertical column is occupied by a
// closed solid. The intersections use the committed CAD body's render mesh;
// this is a display-clearance decision, never a source for feature geometry.
const EPS=1e-7;

function crossings(body,x,y){
  const {positions,indices}=body,zs=[];
  if(!positions?.length||!indices?.length)return zs;
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
    const ax=positions[a],ay=positions[a+1],bx=positions[b],by=positions[b+1],cx=positions[c],cy=positions[c+1];
    const det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
    if(Math.abs(det)<EPS)continue;
    const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/det;
    const v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/det;
    const w=1-u-v;
    // A half-open triangle rule avoids counting the shared diagonal twice.
    if(u<-EPS||v<-EPS||w<-EPS)continue;
    zs.push(u*positions[a+2]+v*positions[b+2]+w*positions[c+2]);
  }
  zs.sort((a,b)=>a-b);
  return zs.filter((z,i)=>i===0||Math.abs(z-zs[i-1])>1e-5);
}

export function clearOccupiedAnchor(origin,bodies,{clearance=0.05}={}){
  if(!Array.isArray(origin)||origin.length!==3||origin.some(n=>!Number.isFinite(n)))throw new Error('Invalid anchor origin');
  const [x,y,z]=origin,intervals=[];
  for(const body of bodies){
    if(!body?.solidCount||!body.bounds||x<body.bounds.min[0]-clearance||x>body.bounds.max[0]+clearance||y<body.bounds.min[1]-clearance||y>body.bounds.max[1]+clearance)continue;
    const zs=crossings(body,x,y);
    for(let i=0;i+1<zs.length;i+=2)if(zs[i+1]-zs[i]>EPS)intervals.push([zs[i],zs[i+1]]);
  }
  intervals.sort((a,b)=>a[0]-b[0]);
  let next=z,occupied=false;
  for(const [low,high] of intervals){
    if(low>next+clearance)break;
    if(high>=next-clearance){occupied=true;next=Math.max(next,high+clearance);}
  }
  return occupied&&next>z+EPS?[x,y,next]:origin;
}
