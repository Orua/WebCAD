// Global tensor B-spline interpolation of an explicitly uniformly sampled grid.
// Standard clamped averaged knots; only the interpolation linear systems live here.
function axis(count){
 const degree=Math.min(3,count-1),parameters=Array.from({length:count},(_,i)=>i/(count-1));
 const knots=[...Array(degree+1).fill(0)];
 for(let j=1;j<count-degree;j++)knots.push(parameters.slice(j,j+degree).reduce((a,b)=>a+b,0)/degree);
 knots.push(...Array(degree+1).fill(1));
 const basis=(i,p,t)=>p===0?(knots[i]<=t&&t<knots[i+1]?1:0):
  (knots[i+p]>knots[i]?(t-knots[i])/(knots[i+p]-knots[i])*basis(i,p-1,t):0)+
  (knots[i+p+1]>knots[i+1]?(knots[i+p+1]-t)/(knots[i+p+1]-knots[i+1])*basis(i+1,p-1,t):0);
 const matrix=parameters.map((t,row)=>Array.from({length:count},(_,i)=>row===count-1?(i===count-1?1:0):basis(i,degree,t)));
 const unique=[...new Set(knots)],multiplicities=unique.map(k=>knots.filter(v=>v===k).length);
 return {degree,knots:unique,multiplicities,matrix};
}
function solve(matrix,values){
 const a=matrix.map((row,i)=>[...row,...values[i]]),n=matrix.length,channels=values[0].length;
 for(let col=0;col<n;col++){
  let pivot=col;for(let i=col+1;i<n;i++)if(Math.abs(a[i][col])>Math.abs(a[pivot][col]))pivot=i;
  if(Math.abs(a[pivot][col])<1e-12)throw Error('Uniform surface interpolation system is singular');
  [a[pivot],a[col]]=[a[col],a[pivot]];
  const divisor=a[col][col];for(let j=col;j<n+channels;j++)a[col][j]/=divisor;
  for(let i=0;i<n;i++)if(i!==col){const weight=a[i][col];for(let j=col;j<n+channels;j++)a[i][j]-=weight*a[col][j];}
 }
 return a.map(row=>row.slice(n));
}
export function uniformSurfaceGrid(points){
 const rows=points.length,cols=points[0].length,u=axis(rows),v=axis(cols);
 const first=Array.from({length:rows},()=>Array(cols));
 for(let j=0;j<cols;j++){const column=solve(u.matrix,points.map(row=>row[j]));for(let i=0;i<rows;i++)first[i][j]=column[i];}
 return {u,v,poles:first.map(row=>solve(v.matrix,row))};
}
