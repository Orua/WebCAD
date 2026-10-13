// Independent analytic target used only by acceptance tests, never product code.
export const shoulder=r=>r<=2?1:r>=4?0:1-3*((r-2)/2)**2+2*((r-2)/2)**3;
export const targetHeight=(x,y,left=1)=>left*shoulder(Math.hypot(x+10,y))+.8*shoulder(Math.hypot(x-10,y));
export function reliefFixture({left=1.4,step=1,thickness=2.5}={}){
 const positions=[],indices=[],nx=Math.round(50/step),ny=Math.round(40/step),row=nx+1,count=row*(ny+1);
 for(let side=0;side<2;side++)for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const x=-25+i*step,y=-20+j*step;positions.push(x,y,side?-thickness:targetHeight(x,y,left));}
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*row+i,b=a+1,c=a+row,d=c+1;indices.push(a,b,d,a,d,c,count+a,count+d,count+b,count+a,count+c,count+d);}
 const rim=[];for(let i=0;i<nx;i++)rim.push(i);for(let j=0;j<ny;j++)rim.push(j*row+nx);for(let i=nx;i>0;i--)rim.push(ny*row+i);for(let j=ny;j>0;j--)rim.push(j*row);
 for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length];indices.push(a,count+a,count+b,a,count+b,b);}
 return {positions:new Float64Array(positions),indices:new Uint32Array(indices)};
}
export function oracle(mesh,left){let maxHeightErrorMm=0,backErrorMm=0;const p=mesh.positions;for(let i=0;i<p.length;i+=3){const expected=p[i+2]<-1?-2.5:targetHeight(p[i],p[i+1],left),error=Math.abs(p[i+2]-expected);if(p[i+2]<-1)backErrorMm=Math.max(backErrorMm,error);else maxHeightErrorMm=Math.max(maxHeightErrorMm,error);}return {maxHeightErrorMm,backErrorMm,passed:maxHeightErrorMm<1e-9&&backErrorMm<1e-9};}
