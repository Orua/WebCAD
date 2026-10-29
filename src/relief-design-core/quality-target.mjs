// Relief quality mode (fit.quality v1) — browser reference of the precision-filtered target that the native core
// (services/WebCADServices/native/occt-worker/relief_quality.hxx buildTarget) fits. Pure, mm units, row 0 = -Y.
// Used to re-verify Services results independently and as the golden reference in tests.
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const smoothstep=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
export const softKnee=(d,p)=>d*smoothstep(Math.abs(d)/(2*p));
export const RELIEF_QUALITY_LIMITS=Object.freeze({maxControlSide:1025,minControlSide:16,maxSourceSide:4097});
const b64=t=>typeof Buffer!=='undefined'?new Uint8Array(Buffer.from(t,'base64')):Uint8Array.from(atob(t),c=>c.charCodeAt(0));
export function decodeQualitySource(q){
 const g=q?.source;if(!g||!Number.isInteger(g.columns)||!Number.isInteger(g.rows)||g.columns<2||g.rows<2||g.columns>RELIEF_QUALITY_LIMITS.maxSourceSide||g.rows>RELIEF_QUALITY_LIMITS.maxSourceSide)fail('FIT_INPUT_INVALID','quality.source 尺寸无效');
 const b=b64(g.data);if(b.length!==g.columns*g.rows*2)fail('FIT_INPUT_INVALID','quality.source 数据长度不符');
 const v=new Float64Array(g.columns*g.rows);for(let k=0;k<v.length;k++)v[k]=(b[2*k]|b[2*k+1]<<8)/65535;
 return {columns:g.columns,rows:g.rows,v,depthMm:q.depthMm,keepoutMm:q.edgeKeepoutMm??0,fadeMm:q.edgeFadeMm??0};
}
// Same rule as native fitQuality: finest admissible control spacing from size, capacity, source pixels and precision.
export function finestControlSpacing({widthMm,heightMm,source,precisionMm,maxControlSide=1025}){
 const srcPitch=Math.max(widthMm/source.columns,heightMm/source.rows);
 return Math.max(Math.max(widthMm,heightMm)/(Math.min(1025,maxControlSide)-3),.5*srcPitch,precisionMm);
}
function sourceAt(s,u,v){const x=Math.min(s.columns-1,Math.max(0,u*s.columns-.5)),y=Math.min(s.rows-1,Math.max(0,v*s.rows-.5)),i=Math.floor(x),j=Math.floor(y),i1=Math.min(s.columns-1,i+1),j1=Math.min(s.rows-1,j+1),fx=x-i,fy=y-j,V=s.v,C=s.columns;
 return (V[j*C+i]*(1-fx)+V[j*C+i1]*fx)*(1-fy)+(V[j1*C+i]*(1-fx)+V[j1*C+i1]*fx)*fy;}
function gauss(src,C,R,sigma){
 if(!(sigma>.3))return src;const r=Math.max(1,Math.ceil(3*sigma)),k=[];let s=0;for(let i=-r;i<=r;i++){k.push(Math.exp(-.5*i*i/(sigma*sigma)));s+=k[k.length-1];}for(let i=0;i<k.length;i++)k[i]/=s;
 const refl=(x,n)=>{if(n===1)return 0;while(x<0||x>=n){if(x<0)x=-x-1;if(x>=n)x=2*n-x-1;}return x;};
 const a=new Float64Array(src.length),b=new Float64Array(src.length);
 for(let j=0;j<R;j++)for(let i=0;i<C;i++){let v=0;for(let t=-r;t<=r;t++)v+=k[t+r]*src[j*C+refl(i+t,C)];a[j*C+i]=v;}
 for(let j=0;j<R;j++)for(let i=0;i<C;i++){let v=0;for(let t=-r;t<=r;t++)v+=k[t+r]*a[refl(j+t,R)*C+i];b[j*C+i]=v;}
 return b;
}
// Morphological reconstruction by dilation (8-connected, Vincent hybrid) — identical to relief_quality.hxx.
function reconstruct(g,f,C,R){
 for(let j=0;j<R;j++)for(let i=0;i<C;i++){let m=g[j*C+i];if(i>0)m=Math.max(m,g[j*C+i-1]);if(j>0)for(let a=Math.max(0,i-1);a<=Math.min(C-1,i+1);a++)m=Math.max(m,g[(j-1)*C+a]);g[j*C+i]=Math.min(m,f[j*C+i]);}
 const q=[];
 for(let j=R-1;j>=0;j--)for(let i=C-1;i>=0;i--){const k=j*C+i;let m=g[k];if(i<C-1)m=Math.max(m,g[k+1]);if(j<R-1)for(let a=Math.max(0,i-1);a<=Math.min(C-1,i+1);a++)m=Math.max(m,g[(j+1)*C+a]);g[k]=Math.min(m,f[k]);
  let push=false;if(i<C-1){const t=k+1;push=push||(g[t]<g[k]&&g[t]<f[t]);}if(j<R-1)for(let a=Math.max(0,i-1);a<=Math.min(C-1,i+1);a++){const t=(j+1)*C+a;push=push||(g[t]<g[k]&&g[t]<f[t]);}if(push)q.push(k);}
 for(let h=0;h<q.length;h++){const k=q[h],i=k%C,j=(k-i)/C;for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++){if(!a&&!b)continue;const x=i+a,y=j+b;if(x<0||y<0||x>=C||y>=R)continue;const t=y*C+x;if(g[t]<g[k]&&g[t]<f[t]){g[t]=Math.min(g[k],f[t]);q.push(t);}}}
}
// Regional maxima with prominence < p levelled (h-maxima, h=p), p/2..p faded, >= p kept exactly.
function levelBelowPrecision(f,C,R,p){
 const N=f.length,g=new Float64Array(N);for(let k=0;k<N;k++)g[k]=f[k]-p;reconstruct(g,f,C,R);
 const label=new Int32Array(N).fill(-1),prom=[],st=[];
 for(let s0=0;s0<N;s0++){if(label[s0]>=0||!(f[s0]-g[s0]>1e-12))continue;const id=prom.length;prom.push(0);st.length=0;st.push(s0);label[s0]=id;
  while(st.length){const k=st.pop();prom[id]=Math.max(prom[id],f[k]-g[k]);const i=k%C,j=(k-i)/C;
   for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++){const x=i+a,y=j+b;if(x<0||y<0||x>=C||y>=R)continue;const t=y*C+x;if(label[t]<0&&f[t]-g[t]>1e-12){label[t]=id;st.push(t);}}}}
 const keep=prom.map(v=>smoothstep((v-.5*p)/(.5*p-1e-12*p)));
 for(let k=0;k<N;k++)if(label[k]>=0)f[k]=g[k]+(f[k]-g[k])*keep[label[k]];
}
const contains=(s,x,y)=>{const dx=Math.abs(x-s.centerMm[0]),dy=Math.abs(y-s.centerMm[1]);return s.kind==='circle'?Math.hypot(dx,dy)<=s.radiusMm:dx<=s.widthMm/2&&dy<=s.heightMm/2;};
const gapTo=(s,x,y,outside)=>{const dx=x-s.centerMm[0],dy=y-s.centerMm[1];if(s.kind==='circle'){const r=Math.hypot(dx,dy);return outside?r-s.radiusMm:s.radiusMm-r;}const ex=Math.abs(dx)-s.widthMm/2,ey=Math.abs(dy)-s.heightMm/2;return outside?(ex>0||ey>0?Math.hypot(Math.max(ex,0),Math.max(ey,0)):Math.max(ex,ey)):Math.min(-ex,-ey);};
/** domain: centred {support,throughHoles,protectedZones}. Returns {C,R,pitchX,pitchY,h(mm),active,fixed}. */
export function buildQualityTarget({source:src,domain,widthMm:W,heightMm:H,baselineMm,upperMm,precisionMm:p,controlSpacingMm}){
 const pitch=controlSpacingMm/2,C=Math.max(2,Math.ceil(W/pitch)+1),R=Math.max(2,Math.ceil(H/pitch)+1),px=W/(C-1),py=H/(R-1),N=C*R;
 const srcPitch=Math.max(W/src.columns,H/src.rows),sub=Math.max(1,Math.min(8,Math.ceil(pitch/srcPitch)));let v=new Float64Array(N);
 for(let j=0;j<R;j++)for(let i=0;i<C;i++){let acc=0;for(let b=0;b<sub;b++)for(let a=0;a<sub;a++){const x=(i-.5+(a+.5)/sub)*px-W/2,y=(j-.5+(b+.5)/sub)*py-H/2;acc+=sourceAt(src,x/W+.5,.5-y/H);}v[j*C+i]=acc/(sub*sub);}
 v=gauss(v,C,R,Math.max(.35*controlSpacingMm,.5*srcPitch)/pitch);for(let k=0;k<N;k++)v[k]*=src.depthMm;
 // multiscale precision trilateral (tangent-plane bilateral), identical to relief_quality.hxx buildTarget.
 const sigmaS=Math.max(pitch,.5*srcPitch),LUT=4096,lmax=p,wr=new Float64Array(LUT+1);for(let k=0;k<=LUT;k++){const d=lmax*k/LUT;wr[k]=1-smoothstep((d-.25*p)/(.75*p));}
 let out=Float64Array.from(v);
 for(let sg=sigmaS;sg<=Math.max(sigmaS,p)+1e-9;sg*=2){const inp=Float64Array.from(out),sm=gauss(inp,C,R,sg/pitch),step=Math.max(1,Math.floor(sg/(2.5*pitch))),taps=Math.max(1,Math.ceil(2.5*sg/(pitch*step))),ws=new Float64Array(2*taps+1);
  for(let a=-taps;a<=taps;a++){const dd=a*step*pitch;ws[a+taps]=Math.exp(-.5*dd*dd/(sg*sg));}
  for(let j=0;j<R;j++)for(let i=0;i<C;i++){const k=j*C+i,c0=inp[k],i0=Math.max(0,i-1),i1=Math.min(C-1,i+1),j0=Math.max(0,j-1),j1=Math.min(R-1,j+1);
   const gx=(sm[j*C+i1]-sm[j*C+i0])/((i1-i0)*pitch),gy=(sm[j1*C+i]-sm[j0*C+i])/((j1-j0)*pitch);let acc=0,wsum=0;
   for(let b=-taps;b<=taps;b++){const y=j+b*step;if(y<0||y>=R)continue;const wy=ws[b+taps],py=gy*b*step*pitch,ro=y*C;
    for(let a=-taps;a<=taps;a++){const x=i+a*step;if(x<0||x>=C)continue;const val=inp[ro+x],d=Math.abs(val-c0);if(d>=lmax)continue;const w=wy*ws[a+taps]*wr[Math.trunc(d*(LUT/lmax))];acc+=w*val;wsum+=w;}}
   out[k]=acc/wsum;}}
 levelBelowPrecision(out,C,R,0.5*p);for(let k=0;k<N;k++)out[k]=-out[k];levelBelowPrecision(out,C,R,0.5*p);for(let k=0;k<N;k++)out[k]=-out[k];
 // Band-limit to cubic B-spline capacity (~1 control spacing). Bilateral cliffs ≥2p are unfittable otherwise.
 const aaMm=Math.max(.35*controlSpacingMm,.5*srcPitch),bandMm=Math.max(.85*controlSpacingMm,aaMm);out=gauss(out,C,R,bandMm/pitch);
 // Auto edge fade when author left 0/0: locked rim controls sit at baseline.
 let keep=src.keepoutMm,fade=src.fadeMm;if(!(keep>0)&&!(fade>0))fade=Math.max(2,4*controlSpacingMm);
 const h=new Float64Array(N),active=new Uint8Array(N),fixed=new Uint8Array(N),holes=domain.throughHoles??[],zones=domain.protectedZones??[];
 for(let j=0;j<R;j++)for(let i=0;i<C;i++){const k=j*C+i,x=i*px-W/2,y=j*py-H/2;
  if(!contains(domain.support,x,y)||holes.some(s=>contains(s,x,y))){h[k]=baselineMm;continue;}active[k]=1;
  if(zones.some(s=>contains(s,x,y))){fixed[k]=1;h[k]=baselineMm;continue;}
  let e=1;if(keep>0||fade>0){const g=Math.min(gapTo(domain.support,x,y,false),...holes.map(s=>gapTo(s,x,y,true)),...zones.map(s=>gapTo(s,x,y,true)));e=g<=keep?0:fade>0?smoothstep(Math.min(1,(g-keep)/fade)):1;}
  let z=softKnee(out[k]*e,p);z=Math.min(upperMm-baselineMm,Math.max(0,z));h[k]=baselineMm+z;}
 return {C,R,pitchX:px,pitchY:py,h,active,fixed};
}
// Clamped uniform cubic over n controls with the physical mapping x(t)=Σ N_i(t)·x_i (x_i uniform), as atPhysical.
function basis(n,t){const d=Math.min(3,n-1),end=n-d,u=t*end,span=u>=end?n-1:Math.floor(u)+d,kn=[];for(let i=0;i<=d;i++)kn.push(0);for(let i=1;i<end;i++)kn.push(i);for(let i=0;i<=d;i++)kn.push(end);
 const b=new Float64Array(d+1),left=new Float64Array(d+1),right=new Float64Array(d+1);b[0]=1;
 for(let j=1;j<=d;j++){left[j]=u-kn[span+1-j];right[j]=kn[span+j]-u;let saved=0;for(let r=0;r<j;r++){const term=b[r]/(right[r+1]+left[j-r]);b[r]=saved+right[r+1]*term;saved=left[j-r]*term;}b[j]=saved;}
 return {first:span-d,w:b};}
function axisCoordinate(n,t,span){const {first,w}=basis(n,t);let s=0;for(let k=0;k<w.length;k++)s+=w[k]*((first+k)/(n-1)-.5)*span;return s;}
function atPhysical(n,x,span){if(x<=-span/2)return basis(n,0);if(x>=span/2)return basis(n,1);let lo=0,hi=1;for(let i=0;i<54;i++){const m=(lo+hi)/2;if(axisCoordinate(n,m,span)<x)lo=m;else hi=m;}return basis(n,(lo+hi)/2);}
/** Separable evaluation of the fitted delta surface at xs × ys (row-major over ys). */
export function evaluateQualitySurface(deltas,nx,ny,W,H,xs,ys){
 const bx=xs.map(x=>atPhysical(nx,x,W)),by=ys.map(y=>atPhysical(ny,y,H)),out=new Float64Array(xs.length*ys.length),tmp=new Float64Array(nx);
 by.forEach((b,j)=>{tmp.fill(0);for(let q=0;q<b.w.length;q++){const w=b.w[q];if(!w)continue;const o=(b.first+q)*nx;for(let i=0;i<nx;i++)tmp[i]+=w*deltas[o+i];}
  bx.forEach((a,i)=>{let s=0;for(let q=0;q<a.w.length;q++)s+=a.w[q]*tmp[a.first+q];out[j*xs.length+i]=s;});});
 return out;
}
