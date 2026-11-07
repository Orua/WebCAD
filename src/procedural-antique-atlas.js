// Original deterministic grain and pitting for the existing antique finishes.
// No photograph, external pixels, browser storage or network input is sampled.
export function createProceduralAntiqueAtlas(){
 const width=512,height=342,half=width/2,field=new Float32Array(width*height),data=new Uint8Array(width*height*4);
 const hash=(x,y,seed)=>{let n=Math.imul(x+seed,374761393)^Math.imul(y+seed,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
 const noise=(x,y,seed)=>{
  const ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
  const a=hash(ix,iy,seed),b=hash(ix+1,iy,seed),c=hash(ix,iy+1,seed),d=hash(ix+1,iy+1,seed);
  return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
 };
 for(let panel=0;panel<2;panel++){
  const mean=panel===0?.34:.57,seed=panel===0?173:941;
  for(let y=0;y<height;y++)for(let x=0;x<half;x++){
   const fine=hash(x,y,seed)-.5;
   field[y*width+panel*half+x]=mean+(noise(x/42,y/42,seed)-.5)*.10+(noise(x/9,y/9,seed+1)-.5)*.065+fine*.16;
  }
  const pits=panel===0?1000:2400;
  for(let i=0;i<pits;i++){
   const cx=hash(i,1,seed)*half,cy=hash(i,2,seed)*height,radius=.65+hash(i,3,seed)*1.8,depth=.065+hash(i,4,seed)*.15;
   for(let y=Math.max(0,Math.floor(cy-radius-1));y<=Math.min(height-1,Math.ceil(cy+radius+1));y++)for(let x=Math.max(0,Math.floor(cx-radius-1));x<=Math.min(half-1,Math.ceil(cx+radius+1));x++){
    const distance=Math.hypot(x-cx,(y-cy)*(.8+hash(i,5,seed)*.45))/radius;
    const bowl=Math.max(0,1-distance*distance),rim=Math.max(0,1-Math.abs(distance-1)*4);
    field[y*width+panel*half+x]+=-depth*bowl+.022*rim;
   }
  }
  let total=0;for(let y=0;y<height;y++)for(let x=0;x<half;x++)total+=field[y*width+panel*half+x];
  const offset=mean-total/(half*height);
  for(let y=0;y<height;y++)for(let x=0;x<half;x++){
   const index=y*width+panel*half+x,value=Math.round(Math.max(0,Math.min(1,field[index]+offset))*255);
   data[index*4]=data[index*4+1]=data[index*4+2]=value;data[index*4+3]=255;
  }
 }
 return {width,height,data,recipeVersion:'procedural-antique-atlas-1'};
}
