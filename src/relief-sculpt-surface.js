// Same open uniform cubic basis as the planar CAD relief. This only samples
// the display surface; it does not increase the model's editing resolution.
export function cubicBasis(count,t){
 const degree=Math.min(3,count-1),end=count-degree,u=Math.max(0,Math.min(1,t))*end,span=u>=end?count-1:Math.floor(u)+degree;
 const knots=[...Array(degree+1).fill(0),...Array.from({length:end-1},(_,i)=>i+1),...Array(degree+1).fill(end)];
 const basis=[1],left=[],right=[];
 for(let j=1;j<=degree;j++){left[j]=u-knots[span+1-j];right[j]=knots[span+j]-u;let saved=0;for(let r=0;r<j;r++){const term=basis[r]/(right[r+1]+left[j-r]);basis[r]=saved+right[r+1]*term;saved=left[j-r]*term;}basis[j]=saved;}
 return basis.map((weight,k)=>({index:span-degree+k,weight}));
}
export function sampleReliefSurface(heights,samples=97){
 const rows=heights.length,cols=heights[0].length,xBasis=Array.from({length:samples},(_,i)=>cubicBasis(cols,i/(samples-1))),yBasis=Array.from({length:samples},(_,j)=>cubicBasis(rows,j/(samples-1)));
 const xs=xBasis.map(b=>b.reduce((s,v)=>s+v.weight*(v.index/(cols-1)-.5),0)),ys=yBasis.map(b=>b.reduce((s,v)=>s+v.weight*(v.index/(rows-1)-.5),0));
 const horizontal=heights.map(row=>xBasis.map(b=>b.reduce((s,v)=>s+row[v.index]*v.weight,0)));
 const values=yBasis.map(b=>xs.map((_,i)=>b.reduce((s,v)=>s+horizontal[v.index][i]*v.weight,0)));
 return {xs,ys,values};
}
