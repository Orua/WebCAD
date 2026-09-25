// Algebraic circle fit follows the source project's section-candidate workflow.
// These are numerical candidates from supplied points, not exact CAD recognition.
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
function solve3(matrix,rhs){
  const a=matrix.map((row,i)=>[...row,rhs[i]]);
  for(let col=0;col<3;col++){
    let pivot=col;for(let row=col+1;row<3;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    if(Math.abs(a[pivot][col])<1e-10)fail('FIT_DEGENERATE','Points do not determine a stable circle');
    [a[col],a[pivot]]=[a[pivot],a[col]];
    const d=a[col][col];for(let k=col;k<4;k++)a[col][k]/=d;
    for(let row=0;row<3;row++)if(row!==col){const f=a[row][col];for(let k=col;k<4;k++)a[row][k]-=f*a[col][k];}
  }
  return a.map(row=>row[3]);
}
export function fitProfilePoints({kind,points,plane='XY',maxResidualMm}={}){
  if(!['circle','line'].includes(kind)||!['XY','XZ','YZ'].includes(plane))fail('PARAM_SCHEMA_INVALID','kind must be circle or line; plane must be XY, XZ or YZ');
  if(!Array.isArray(points)||points.length<3||points.length>1000||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n))))
    fail('PARAM_SCHEMA_INVALID','Provide 3–1000 finite [u,v] sample points');
  if(maxResidualMm!==undefined&&(!Number.isFinite(maxResidualMm)||maxResidualMm<=0))fail('PARAM_RANGE_INVALID','maxResidualMm must be positive');
  const mean=[0,1].map(axis=>points.reduce((sum,p)=>sum+p[axis],0)/points.length);
  const centered=points.map(p=>[p[0]-mean[0],p[1]-mean[1]]);
  const scale=Math.max(...centered.map(p=>Math.hypot(...p)));
  if(!(scale>1e-9))fail('FIT_DEGENERATE','Point extent is too small');
  const q=centered.map(p=>p.map(v=>v/scale));
  let model,residuals;
  if(kind==='circle'){
    const matrix=Array.from({length:3},()=>[0,0,0]),rhs=[0,0,0];
    for(const [x,y] of q){const row=[2*x,2*y,1],target=x*x+y*y;
      for(let i=0;i<3;i++){rhs[i]+=row[i]*target;for(let j=0;j<3;j++)matrix[i][j]+=row[i]*row[j];}
    }
    const [cx,cy,c]=solve3(matrix,rhs),r2=c+cx*cx+cy*cy;
    if(!(r2>0))fail('FIT_DEGENERATE','Fitted circle has no positive radius');
    const center=[mean[0]+cx*scale,mean[1]+cy*scale],radius=Math.sqrt(r2)*scale;
    residuals=points.map(p=>Math.abs(Math.hypot(p[0]-center[0],p[1]-center[1])-radius));
    let angle=0,min=0,max=0;for(let i=1;i<points.length;i++){
      const prev=Math.atan2(points[i-1][1]-center[1],points[i-1][0]-center[0]);
      const next=Math.atan2(points[i][1]-center[1],points[i][0]-center[0]);
      let step=next-prev;while(step>Math.PI)step-=2*Math.PI;while(step< -Math.PI)step+=2*Math.PI;
      angle+=step;min=Math.min(min,angle);max=Math.max(max,angle);
    }
    model={center,radiusMm:radius,sampledSweepDeg:(max-min)*180/Math.PI};
  }else{
    let xx=0,xy=0,yy=0;for(const [x,y] of q){xx+=x*x;xy+=x*y;yy+=y*y;}
    const theta=.5*Math.atan2(2*xy,xx-yy),direction=[Math.cos(theta),Math.sin(theta)];
    const projection=centered.map(p=>p[0]*direction[0]+p[1]*direction[1]);
    const extent=Math.max(...projection)-Math.min(...projection);
    if(extent<1e-9)fail('FIT_DEGENERATE','Points do not determine a line');
    residuals=centered.map(p=>Math.abs(p[0]*direction[1]-p[1]*direction[0]));
    model={point:mean,direction,lengthMm:extent};
  }
  const max=Math.max(...residuals),rms=Math.hypot(...residuals)/Math.sqrt(residuals.length);
  return {kind,plane,pointCount:points.length,source:'provided-sample-points',model,
    residual:{maxMm:max,rmsMm:rms},...(maxResidualMm===undefined?{}:{maxResidualMm,withinLimit:max<=maxResidualMm}),
    warning:'Numerical fit only; compare with the source drawing and full contour before modeling.'};
}
