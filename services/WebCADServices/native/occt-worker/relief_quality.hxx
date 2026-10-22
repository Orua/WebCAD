// relief quality mode (relief.design-fit-brep-1, fit.quality v1): full-resolution height source -> precision-
// filtered target at an adaptive physical pitch -> bounded masked cubic B-spline whose control spacing is chosen
// from the physical size and the machining precision. Pure C++17 (no OCCT); same Fit contract as fitMasked.
// Browser reference for the target: src/relief-design-core/quality-target.mjs (golden-compared in tests).
#pragma once
#include "relief_design_numeric.hxx"
#include <chrono>
#include <cstddef>
#include <functional>
#include <thread>
namespace webcad { namespace relief_design { namespace quality {

struct Axis{int n;std::vector<double> pos;std::vector<std::array<int,4>> id;std::vector<std::array<double,4>> w;};
// Basis of an n-control clamped uniform cubic at every physical position (same mapping as atPhysical).
inline Axis axisTable(int n,double span,const std::vector<double>& pos){Axis a;a.n=n;a.pos=pos;a.id.resize(pos.size());a.w.resize(pos.size());
 for(size_t k=0;k<pos.size();k++){auto b=atPhysical(n,std::max(-span/2,std::min(span/2,pos[k])),span,nullptr);for(int t=0;t<4;t++){a.id[k][t]=t<int(b.size())?b[t].index:0;a.w[k][t]=t<int(b.size())?b[t].weight:0;}}return a;}
// Deterministic parallel loop over [0,n): contiguous chunks, each element computed by exactly one thread with the
// same arithmetic order as the serial loop, so results are bit-identical for any thread count.
inline void parallelFor(int n,const std::function<void(int,int)>& body){
 const int T=std::max(1,std::min<int>({int(std::thread::hardware_concurrency()),8,n/16}));if(T<=1){body(0,n);return;}
 std::vector<std::thread> th;for(int t=0;t<T;t++){const int a=int(int64_t(n)*t/T),b=int(int64_t(n)*(t+1)/T);th.emplace_back([&body,a,b]{body(a,b);});}for(auto& x:th)x.join();
}
// z(samples) = By * C * Bx^T  (C: ny x nx, row-major), separable.
inline void forward(const std::vector<double>& c,const Axis& ax,const Axis& ay,std::vector<double>& z,std::vector<double>& tmp){
 const int nx=ax.n,C=int(ax.pos.size()),R=int(ay.pos.size());tmp.assign(size_t(R)*nx,0.0);z.assign(size_t(R)*C,0.0);
 parallelFor(R,[&](int j0,int j1){for(int j=j0;j<j1;j++){double* t=&tmp[size_t(j)*nx];for(int b=0;b<4;b++){const double w=ay.w[j][b];if(w==0)continue;const double* r=&c[size_t(ay.id[j][b])*nx];for(int i=0;i<nx;i++)t[i]+=w*r[i];}
  double* zz=&z[size_t(j)*C];for(int i=0;i<C;i++){double s=0;for(int a=0;a<4;a++)s+=ax.w[i][a]*t[ax.id[i][a]];zz[i]=s;}}});
}
inline void adjoint(const std::vector<double>& z,const Axis& ax,const Axis& ay,std::vector<double>& g,std::vector<double>& tmp){
 const int nx=ax.n,ny=ay.n,C=int(ax.pos.size()),R=int(ay.pos.size());tmp.assign(size_t(R)*nx,0.0);g.assign(size_t(ny)*nx,0.0);
 parallelFor(R,[&](int j0,int j1){for(int j=j0;j<j1;j++){double* t=&tmp[size_t(j)*nx];const double* zz=&z[size_t(j)*C];for(int i=0;i<C;i++){const double v=zz[i];if(v==0)continue;for(int a=0;a<4;a++)t[ax.id[i][a]]+=ax.w[i][a]*v;}}});
 // second pass split by control columns: each g element accumulates over j in serial order.
 parallelFor(nx,[&](int i0,int i1){for(int j=0;j<R;j++){const double* t=&tmp[size_t(j)*nx];for(int b=0;b<4;b++){const double w=ay.w[j][b];if(w==0)continue;double* r=&g[size_t(ay.id[j][b])*nx];for(int i=i0;i<i1;i++)r[i]+=w*t[i];}}});
}
inline double smooth01(double t){return smoothstep(t);}
// Separable Gaussian on a node grid, reflected borders.
inline std::vector<double> gauss(const std::vector<double>& src,int C,int R,double sigmaNodes){
 if(!(sigmaNodes>0.3))return src;const int r=std::max(1,int(std::ceil(3*sigmaNodes)));std::vector<double> k(2*r+1);double s=0;for(int i=-r;i<=r;i++)s+=k[i+r]=std::exp(-.5*i*i/(sigmaNodes*sigmaNodes));for(double& v:k)v/=s;
 auto refl=[](int x,int n){if(n==1)return 0;while(x<0||x>=n){if(x<0)x=-x-1;if(x>=n)x=2*n-x-1;}return x;};
 std::vector<double> a(src.size()),b(src.size());
 for(int j=0;j<R;j++)for(int i=0;i<C;i++){double v=0;for(int t=-r;t<=r;t++)v+=k[t+r]*src[size_t(j)*C+refl(i+t,C)];a[size_t(j)*C+i]=v;}
 for(int j=0;j<R;j++)for(int i=0;i<C;i++){double v=0;for(int t=-r;t<=r;t++)v+=k[t+r]*a[size_t(refl(j+t,R))*C+i];b[size_t(j)*C+i]=v;}
 return b;
}
// Morphological reconstruction by dilation of marker g under mask f (8-connected, Vincent's hybrid algorithm). Exact.
inline void reconstruct(std::vector<double>& g,const std::vector<double>& f,int C,int R){
 auto idx=[C](int i,int j){return size_t(j)*C+i;};
 for(int j=0;j<R;j++)for(int i=0;i<C;i++){double m=g[idx(i,j)];if(i>0)m=std::max(m,g[idx(i-1,j)]);if(j>0){for(int a=std::max(0,i-1);a<=std::min(C-1,i+1);a++)m=std::max(m,g[idx(a,j-1)]);}g[idx(i,j)]=std::min(m,f[idx(i,j)]);}
 std::vector<size_t> q;
 for(int j=R-1;j>=0;j--)for(int i=C-1;i>=0;i--){double m=g[idx(i,j)];if(i<C-1)m=std::max(m,g[idx(i+1,j)]);if(j<R-1){for(int a=std::max(0,i-1);a<=std::min(C-1,i+1);a++)m=std::max(m,g[idx(a,j+1)]);}const size_t k=idx(i,j);g[k]=std::min(m,f[k]);
  bool push=false;if(i<C-1){size_t t=idx(i+1,j);push=push||(g[t]<g[k]&&g[t]<f[t]);}if(j<R-1)for(int a=std::max(0,i-1);a<=std::min(C-1,i+1);a++){size_t t=idx(a,j+1);push=push||(g[t]<g[k]&&g[t]<f[t]);}if(push)q.push_back(k);}
 for(size_t h=0;h<q.size();h++){const size_t k=q[h];const int i=int(k%C),j=int(k/C);for(int b=-1;b<=1;b++)for(int a=-1;a<=1;a++){if(!a&&!b)continue;const int x=i+a,y=j+b;if(x<0||y<0||x>=C||y>=R)continue;const size_t t=idx(x,y);if(g[t]<g[k]&&g[t]<f[t]){g[t]=std::min(g[k],f[t]);q.push_back(t);}}}
}
// Amplitude filter: every regional maximum whose prominence (dynamic) is below the machining precision p is levelled
// (h-maxima transform with h=p); prominence between p/2 and p fades smoothly; prominence >= p is kept exactly,
// whatever its width. Applied to peaks, then to pits (on -f). Returns the number of levelled components.
inline int levelBelowPrecision(std::vector<double>& f,int C,int R,double p){
 const size_t N=f.size();std::vector<double> g(N);for(size_t k=0;k<N;k++)g[k]=f[k]-p;reconstruct(g,f,C,R);
 std::vector<int> label(N,-1);std::vector<double> prom;std::vector<size_t> st;
 for(size_t s0=0;s0<N;s0++){if(label[s0]>=0||!(f[s0]-g[s0]>1e-12))continue;const int id=int(prom.size());prom.push_back(0);st.assign(1,s0);label[s0]=id;
  while(!st.empty()){const size_t k=st.back();st.pop_back();prom[id]=std::max(prom[id],f[k]-g[k]);const int i=int(k%C),j=int(k/C);
   for(int b=-1;b<=1;b++)for(int a=-1;a<=1;a++){const int x=i+a,y=j+b;if(x<0||y<0||x>=C||y>=R)continue;const size_t t=size_t(y)*C+x;if(label[t]<0&&f[t]-g[t]>1e-12){label[t]=id;st.push_back(t);}}}}
 int levelled=0;std::vector<double> keep(prom.size());for(size_t c=0;c<prom.size();c++){keep[c]=smoothstep((prom[c]-.5*p)/(.5*p-1e-12*p));if(keep[c]<1)levelled++;}
 for(size_t k=0;k<N;k++)if(label[k]>=0)f[k]=g[k]+(f[k]-g[k])*keep[label[k]];
 return levelled;
}
struct Source{int columns,rows;std::vector<double> v;double depthMm,keepoutMm,fadeMm;};
inline Source sourceOf(const json& q){Source s;const auto& g=q.at("source");s.columns=g.at("columns");s.rows=g.at("rows");
 if(s.columns<2||s.rows<2||s.columns>4097||s.rows>4097)fail("FIT_INPUT_INVALID","quality.source 尺寸无效（2–4097）");
 if(g.value("encoding",std::string("u16le"))!="u16le")fail("FIT_INPUT_INVALID","quality.source 仅支持 u16le");
 const auto b=unbase64(g.at("data").get<std::string>());if(b.size()!=size_t(s.columns)*s.rows*2)fail("FIT_INPUT_INVALID","quality.source 数据长度不符");
 if(g.contains("sha256")&&sha256Hex(b)!=g.at("sha256").get<std::string>())fail("FIT_INPUT_INVALID","quality.source 哈希不符");
 s.v.resize(size_t(s.columns)*s.rows);for(size_t k=0;k<s.v.size();k++)s.v[k]=(b[2*k]|b[2*k+1]<<8)/65535.0;
 s.depthMm=q.at("depthMm");s.keepoutMm=q.value("edgeKeepoutMm",0.0);s.fadeMm=q.value("edgeFadeMm",0.0);
 if(!(s.depthMm>0&&s.depthMm<=20))fail("FIT_INPUT_INVALID","quality.depthMm 需要 0–20");return s;}
// Height-source value at physical (x,y): bilinear in pixel centres (sampleHeightGrid convention, image top = +Y)
// averaged over a box of the sample pitch when the pitch is coarser than a source pixel (area-average, no aliasing).
inline double sourceAt(const Source& s,double u,double v){const double x=std::min(s.columns-1.0,std::max(0.0,u*s.columns-.5)),y=std::min(s.rows-1.0,std::max(0.0,v*s.rows-.5));
 const int i=int(x),j=int(y),i1=std::min(s.columns-1,i+1),j1=std::min(s.rows-1,j+1);const double fx=x-i,fy=y-j;const auto& V=s.v;const int C=s.columns;
 return (V[size_t(j)*C+i]*(1-fx)+V[size_t(j)*C+i1]*fx)*(1-fy)+(V[size_t(j1)*C+i]*(1-fx)+V[size_t(j1)*C+i1]*fx)*fy;}
struct Domain{Shape support;std::vector<Shape> holes,zones;};
inline double gapTo(const Shape& s,double x,double y,bool outside){const double dx=x-s.cx,dy=y-s.cy;if(s.circle){const double r=std::hypot(dx,dy);return outside?r-s.r:s.r-r;}
 const double ex=std::abs(dx)-s.w/2,ey=std::abs(dy)-s.h/2;return outside?(ex>0||ey>0?std::hypot(std::max(ex,0.0),std::max(ey,0.0)):std::max(ex,ey)):std::min(-ex,-ey);}
struct Target{int C,R;double widthMm,heightMm,pitchX,pitchY;std::vector<double> h,raw;std::vector<uint8_t> active,fixed;json report;};
// Target: anti-alias at the representable bandwidth, precision-range bilateral (below), edge fade, baseline dead band.
inline Target buildTarget(const Source& src,const Domain& d,double W,double H,double baseline,double upper,double p,double controlSpacing){
 Target t;t.widthMm=W;t.heightMm=H;const double pitch=controlSpacing/2;t.C=std::max(2,int(std::ceil(W/pitch))+1);t.R=std::max(2,int(std::ceil(H/pitch))+1);t.pitchX=W/(t.C-1);t.pitchY=H/(t.R-1);
 const int C=t.C,R=t.R;const size_t N=size_t(C)*R;std::vector<double> v(N);
 const double srcPitch=std::max(W/src.columns,H/src.rows);const int sub=std::max(1,std::min(8,int(std::ceil(pitch/srcPitch))));
 for(int j=0;j<R;j++)for(int i=0;i<C;i++){double acc=0;for(int b=0;b<sub;b++)for(int a=0;a<sub;a++){const double x=(i-.5+(a+.5)/sub)*t.pitchX-W/2,y=(j-.5+(b+.5)/sub)*t.pitchY-H/2;acc+=sourceAt(src,x/W+.5,.5-y/H);}v[size_t(j)*C+i]=acc/(sub*sub);}
 t.raw=v;for(double& x:t.raw)x=baseline+src.depthMm*x;
 // anti-alias: the cubic net cannot carry wavelengths below ~2 control spacings; upsampled sources keep no pixel steps.
 const double aaMm=std::max(.35*controlSpacing,.5*srcPitch);v=gauss(v,C,R,aaMm/pitch);
 for(double& x:v)x*=src.depthMm;
 // precision filter: bilateral passes at spatial scales sigmaS..max(sigmaS,p): amplitude-selective, no blur beyond the precision scale.
 // Each sample is averaged with neighbours whose height differs from the sample's local tangent plane (gradient from
 // the same scale) by less than p/2, with weight falling smoothly (C1 smoothstep) to 0 at 2p. Hence ripples, noise,
 // compression blocks and small plateaus whose height deviates by less than the machining precision are averaged away
 // (no new steps); slopes are not terraced (the plane absorbs them); cliffs, grooves, stripes and eyelids that deviate
 // by >= 2p receive no weight from across them and stay; gentle form wider than the largest scale is never touched.
 // Large kernels are sampled every ~sigma/2.5 (<= 13x13 taps), so cost does not grow with scale.
 const double sigmaS=std::max(pitch,.5*srcPitch),sr=p;std::vector<double> out(v);int scales=0;
 {const int LUT=4096;const double lmax=sr;std::vector<double> wr(LUT+1);for(int k=0;k<=LUT;k++){const double d=lmax*k/LUT;wr[k]=1-smoothstep((d-.25*sr)/(.75*sr));}
  for(double sg=sigmaS;sg<=std::max(sigmaS,p)+1e-9;sg*=2){scales++;const std::vector<double> in(out);const auto sm=gauss(in,C,R,sg/pitch);
   const int step=std::max(1,int(std::floor(sg/(2.5*pitch)))),taps=std::max(1,int(std::ceil(2.5*sg/(pitch*step))));
   std::vector<double> ws(2*taps+1);for(int a=-taps;a<=taps;a++){const double dd=a*step*pitch;ws[a+taps]=std::exp(-.5*dd*dd/(sg*sg));}
   for(int j=0;j<R;j++)for(int i=0;i<C;i++){const size_t k=size_t(j)*C+i;const double c0=in[k];
    const double gx=(sm[size_t(j)*C+std::min(C-1,i+1)]-sm[size_t(j)*C+std::max(0,i-1)])/((std::min(C-1,i+1)-std::max(0,i-1))*pitch),gy=(sm[size_t(std::min(R-1,j+1))*C+i]-sm[size_t(std::max(0,j-1))*C+i])/((std::min(R-1,j+1)-std::max(0,j-1))*pitch);
    double acc=0,wsum=0;
    for(int b=-taps;b<=taps;b++){const int y=j+b*step;if(y<0||y>=R)continue;const double wy=ws[b+taps],py=gy*b*step*pitch;const double* row=&in[size_t(y)*C];
     for(int a=-taps;a<=taps;a++){const int x=i+a*step;if(x<0||x>=C)continue;const double val=row[x],d=std::abs(val-c0);if(d>=lmax)continue;const double w=wy*ws[a+taps]*wr[int(d*(LUT/lmax))];acc+=w*val;wsum+=w;}}
    out[k]=acc/wsum;}}}
 int levelled=levelBelowPrecision(out,C,R,0.5*p);{for(double& x:out)x=-x;levelled+=levelBelowPrecision(out,C,R,0.5*p);for(double& x:out)x=-x;}
 out=gauss(out,C,R,0.5); // C1 transitions at levelled rims (sigma = one sample pitch, below the representable band)
 double removedSq=0,detailSq=0;for(size_t k=0;k<N;k++){const double dd=v[k]-out[k];removedSq+=dd*dd;detailSq+=v[k]*v[k];}
 t.h.resize(N);t.active.assign(N,0);t.fixed.assign(N,0);int changed=0;double maxChange=0;
 for(int j=0;j<R;j++)for(int i=0;i<C;i++){const size_t k=size_t(j)*C+i;const double x=i*t.pitchX-W/2,y=j*t.pitchY-H/2;
  bool in=contains(d.support,x,y);for(auto& s:d.holes)in=in&&!contains(s,x,y);if(!in){t.h[k]=baseline;continue;}t.active[k]=1;
  bool zone=false;for(auto& s:d.zones)zone=zone||contains(s,x,y);if(zone){t.fixed[k]=1;t.h[k]=baseline;continue;}
  double e=1;if(src.keepoutMm>0||src.fadeMm>0){double g=gapTo(d.support,x,y,false);for(auto& s:d.holes)g=std::min(g,gapTo(s,x,y,true));for(auto& s:d.zones)g=std::min(g,gapTo(s,x,y,true));e=g<=src.keepoutMm?0:src.fadeMm>0?smooth01(std::min(1.0,(g-src.keepoutMm)/src.fadeMm)):1;}
  double z=out[k]*e;z=softKnee(z,p);z=std::min(upper-baseline,std::max(0.0,z));t.h[k]=baseline+z;
  const double c=std::abs(t.h[k]-t.raw[k]);if(c>1e-12){changed++;maxChange=std::max(maxChange,c);}}
 t.report={{"sampleColumns",C},{"sampleRows",R},{"samplePitchMm",{t.pitchX,t.pitchY}},{"sourcePitchMm",srcPitch},{"antiAliasSigmaMm",aaMm},{"trilateralSigmaSMm",sigmaS},{"trilateralScales",scales},{"levelledComponents",levelled},{"bilateralSigmaRMm",sr},
  {"removedRmsMm",std::sqrt(removedSq/N)},{"changedSampleCount",changed},{"maxChangeVsSourceMm",maxChange},{"method","aa-gauss+precision-trilateral+h-extrema-levelling+baseline-dead-band-C1"}};
 return t;
}
struct Solved{Fit fit;double trainMax,trainP99,trainRms;};
// Bounded masked least squares: CG on free controls (warm start), then accelerated projected gradient for bounds.
inline Solved solve(const Target& t,const Domain& d,int nx,int ny,int sign,double baseline,double envelope,double pr,double tolerance,int maxIter,Work& work){
 const double W=t.widthMm,H=t.heightMm;std::vector<double> xs(t.C),ys(t.R);for(int i=0;i<t.C;i++)xs[i]=i*t.pitchX-W/2;for(int j=0;j<t.R;j++)ys[j]=j*t.pitchY-H/2;
 const Axis ax=axisTable(nx,W,xs),ay=axisTable(ny,H,ys);const size_t n=size_t(nx)*ny,N=size_t(t.C)*t.R;
 Work tmpw{0,1e300};const auto sx=axisSupports(nx,W,tmpw),sy=axisSupports(ny,H,tmpw);std::vector<uint8_t> locked(n,0);
 for(int j=0;j<ny;j++)for(int i=0;i<nx;i++){const double a=sx[i][0],b=sy[j][0],c=sx[i][1],e=sy[j][1];bool l=intersects(d.support,a,b,c,e,true);for(auto& s:d.holes)l=l||intersects(s,a,b,c,e,true);for(auto& s:d.zones)l=l||intersects(s,a,b,c,e,false);if(l)locked[size_t(j)*nx+i]=1;}
 std::vector<double> wt(N),tg(N);for(size_t k=0;k<N;k++){wt[k]=t.active[k]?1.0:0.0;tg[k]=(t.h[k]-baseline)*sign;if(t.active[k]&&tg[k]< -1e-12)fail("FIT_DIRECTION_CONFLICT","Authored height relative to baseline conflicts with mode");tg[k]=std::max(0.0,tg[k]);}
 {std::vector<double> tmp,colsum;adjoint(wt,ax,ay,colsum,tmp);for(size_t k=0;k<n;k++)if(colsum[k]==0)locked[k]=1;}
 std::vector<double> tmp,z,g;auto A=[&](const std::vector<double>& c,std::vector<double>& out){work.charge(double(N)*20+double(n)*8);forward(c,ax,ay,z,tmp);for(size_t k=0;k<N;k++)z[k]*=wt[k];adjoint(z,ax,ay,out,tmp);for(size_t k=0;k<n;k++)if(locked[k])out[k]=0;};
 std::vector<double> b;{std::vector<double> wtg(N);for(size_t k=0;k<N;k++)wtg[k]=wt[k]*tg[k];adjoint(wtg,ax,ay,b,tmp);for(size_t k=0;k<n;k++)if(locked[k])b[k]=0;}
 // Jacobi-free CG (B-spline Gram matrices are well conditioned); tiny ridge keeps unobserved-but-free poles defined.
 std::vector<double> c(n,0.0),r(b),pv(b),Ap(n);double rr=0;for(double v:r)rr+=v*v;const double rr0=rr;int cg=0;
 for(;cg<400&&rr>rr0*1e-20&&rr>0;cg++){A(pv,Ap);double pAp=0;for(size_t k=0;k<n;k++){Ap[k]+=1e-9*pv[k];pAp+=pv[k]*Ap[k];}if(!(pAp>0))break;const double al=rr/pAp;double nr=0;for(size_t k=0;k<n;k++){c[k]+=al*pv[k];r[k]-=al*Ap[k];nr+=r[k]*r[k];}const double be=nr/rr;rr=nr;for(size_t k=0;k<n;k++)pv[k]=r[k]+be*pv[k];}
 // Lipschitz constant by power iteration (upper-bounded by 1.05x).
 double L=1;{std::vector<double> q(n,1.0),Aq(n);for(size_t k=0;k<n;k++)if(locked[k])q[k]=0;for(int it=0;it<30;it++){A(q,Aq);double nq=0;for(double v:Aq)nq+=v*v;nq=std::sqrt(nq);if(!(nq>0))break;L=nq;for(size_t k=0;k<n;k++)q[k]=Aq[k]/nq;}L*=1.05;}
 // Variation-diminishing bounds: every control stays within the target range over its basis support (+/- half the
 // precision). The cubic surface is a convex combination of controls, so it cannot ring/overshoot beyond what the
 // target does locally (no Gibbs ripples beside cliffs), while all detail within the range is still fitted.
 std::vector<double> lo(n,0.0),hi(n,envelope);
 {auto range=[&](double a,double b,double pitch,double origin,int count,int& s0,int& s1){s0=std::max(0,int(std::floor((a-origin)/pitch)));s1=std::min(count-1,int(std::ceil((b-origin)/pitch)));};
  for(int j=0;j<ny;j++){int r0,r1;range(sy[j][0],sy[j][1],t.pitchY,-H/2,t.R,r0,r1);for(int i=0;i<nx;i++){int c0,c1;range(sx[i][0],sx[i][1],t.pitchX,-W/2,t.C,c0,c1);
   double mn=INFINITY,mx=-INFINITY;for(int y=r0;y<=r1;y++)for(int x=c0;x<=c1;x++){const size_t k=size_t(y)*t.C+x;if(!t.active[k])continue;mn=std::min(mn,tg[k]);mx=std::max(mx,tg[k]);}
   const size_t k=size_t(j)*nx+i;if(mn<=mx){lo[k]=std::max(0.0,mn-pr/2);hi[k]=std::min(envelope,mx+pr/2);}}}}
 auto project=[&](double v,size_t k){return locked[k]?0.0:std::max(lo[k],std::min(hi[k],v));};
 std::vector<double> x(n),y(n),nxt(n),grad(n);for(size_t k=0;k<n;k++)x[k]=y[k]=project(c[k],k);double mom=1,residual=INFINITY;int it=0;
 for(;it<maxIter;it++){A(y,grad);for(size_t k=0;k<n;k++){grad[k]-=b[k];nxt[k]=project(y[k]-grad[k]/L,k);}
  residual=0;for(size_t k=0;k<n;k++)residual=std::max(residual,std::abs(nxt[k]-y[k]));if(residual<=tolerance){x=nxt;it++;break;}
  const double m=(1+std::sqrt(1+4*mom*mom))/2;for(size_t k=0;k<n;k++){const double nv=nxt[k];y[k]=nv+(mom-1)/m*(nv-x[k]);x[k]=nv;}mom=m;}
 Solved s;s.fit=Fit{nx,ny,W,H,baseline,sign,{},{},locked,{}};s.fit.deltas.resize(n);s.fit.poles.resize(n);for(size_t k=0;k<n;k++){s.fit.deltas[k]=x[k]*sign;s.fit.poles[k]=baseline+s.fit.deltas[k];}
 forward(x,ax,ay,z,tmp);std::vector<double> e;e.reserve(N);double sq=0;for(size_t k=0;k<N;k++)if(t.active[k]){const double v=std::abs(z[k]-tg[k]);e.push_back(v);sq+=v*v;}
 std::sort(e.begin(),e.end());s.trainMax=e.empty()?0:e.back();s.trainP99=e.empty()?0:e[size_t(.99*(e.size()-1))];s.trainRms=e.empty()?0:std::sqrt(sq/e.size());
 s.fit.report={{"cgIterations",cg},{"projectedIterations",it},{"projectedResidualMm",residual},{"lipschitz",L}};
 return s;
}
inline Domain domainOf(const json& domain){Domain d;d.support=shapeOf(domain.at("support"));for(auto& s:domain.value("throughHoles",json::array()))d.holes.push_back(shapeOf(s));for(auto& s:domain.value("protectedZones",json::array()))d.zones.push_back(shapeOf(s));return d;}
// Entry: fit options carry {quality:{version:1,machiningPrecisionMm,source,depthMm,edgeKeepoutMm,edgeFadeMmmaxControlSide?}}.
inline Fit fitQuality(const json& field,const json& domainJson,double baselineMm,const json& o){
 const auto began=std::chrono::steady_clock::now();auto ms=[&]{return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-began).count();};
 const json& q=o.at("quality");if(q.value("version",0)!=1)fail("FIT_INPUT_INVALID","fit.quality.version 需要 1");
 const double W=field.at("widthMm"),H=field.at("heightMm"),p=q.at("machiningPrecisionMm");if(!(p>=.01&&p<=.5))fail("PARAM_RANGE_INVALID","machiningPrecisionMm 须在 0.01–0.5 mm");
 const std::string mode=o.at("mode");if(mode!="emboss"&&mode!="engrave")fail("FIT_INPUT_INVALID","Explicit emboss/engrave mode is required");const int sign=mode=="emboss"?1:-1;
 const int maxSide=std::min(1025,q.value("maxControlSide",1025));if(maxSide<16)fail("FIT_CAPACITY","maxControlSide 需要 16–1025");
 const Source src=sourceOf(q);const Domain d=domainOf(domainJson);
 const double envelope=o.contains("controlMaxMm")?o.at("controlMaxMm").get<double>():src.depthMm;if(!(envelope>0&&envelope<=20))fail("FIT_INPUT_INVALID","Control envelope must remain <=20 mm");
 const double upper=baselineMm+std::max(envelope,src.depthMm);
 // Spacing ladder: coarse -> fine; stop at the first spacing whose p99 deviation from the precision-filtered
 // target meets the stop rule; the ladder starts at 2x finest (at most 3 rungs) to bound time. The finest rung is bounded by capacity and source pixels.
 const double srcPitch=std::max(W/src.columns,H/src.rows),finest=std::max({std::max(W,H)/(maxSide-3),.5*srcPitch,p});
 std::vector<double> ladder;for(double s=std::max(finest,std::min(std::max(W,H)/128,2*finest));s>finest*1.0001;s/=std::sqrt(2.0))ladder.push_back(s);ladder.push_back(finest);
 Work work{0,std::min(4e12,o.value("maxWork",4e12))};json tried=json::array();Solved best;bool have=false;Target bestT;
 // quality mode owns its solver tolerance (legacy fit.toleranceMm targets the 129-control fit)
 const double tol=std::max(1e-6,p*1e-2);const int maxIter=std::min(20000,o.value("maxIterations",2000));
 // One resolution-independent target (built at the finest admissible spacing); every rung is judged against it.
 const double t0=ms();bestT=buildTarget(src,d,W,H,baselineMm,upper,p,finest);const double targetMs=ms()-t0;
 for(size_t li=0;li<ladder.size();li++){const double s=ladder[li];const int nx=std::max(4,int(std::lround(W/s))+3),ny=std::max(4,int(std::lround(H/s))+3);if(nx>maxSide||ny>maxSide)continue;
  const double t1=ms();Solved sv=solve(bestT,d,nx,ny,sign,baselineMm,envelope,p,tol,maxIter,work);const double t2=ms();
  tried.push_back({{"controlSpacingMm",s},{"controls",{nx,ny}},{"trainP99Mm",sv.trainP99},{"trainMaxMm",sv.trainMax},{"trainRmsMm",sv.trainRms},{"fitMs",t2-t1},{"cgIterations",sv.fit.report.value("cgIterations",0)},{"projectedIterations",sv.fit.report.value("projectedIterations",0)}});
  best=std::move(sv);have=true;if(best.trainP99<=.5*p&&best.trainMax<=p)break;
  // far from the stop rule (max > 2p): one sqrt2 step cannot close it, go straight to the finest rung.
  if(best.trainMax>2*p&&li+2<ladder.size())li=ladder.size()-2;}
 if(!have)fail("FIT_CAPACITY","没有满足容量的控制网");
 Fit fit=std::move(best.fit);const Target& t=bestT;
 // Independent checks: 2x2 Gauss points of every fully active target cell vs the bilinear target; protection on rims/zones.
 Metric training,independent,protection;{const int nx=fit.nx;std::vector<double> xs,ys;const double fr[2]={.2113248654051871,.7886751345948129};
  for(int i=0;i<t.C-1;i++)for(double u:fr)xs.push_back((i+u)*t.pitchX-W/2);for(int j=0;j<t.R-1;j++)for(double v:fr)ys.push_back((j+v)*t.pitchY-H/2);
  const Axis ax=axisTable(nx,W,xs),ay=axisTable(fit.ny,H,ys);std::vector<double> z,tmp;forward(fit.deltas,ax,ay,z,tmp);const int Cq=int(xs.size());
  for(int j=0;j<t.R-1;j++)for(int i=0;i<t.C-1;i++){const size_t k=size_t(j)*t.C+i;if(!(t.active[k]&&t.active[k+1]&&t.active[k+t.C]&&t.active[k+t.C+1]))continue;
   for(int a=0;a<2;a++)for(int b=0;b<2;b++){const double u=fr[a],v=fr[b],e=(1-v)*((1-u)*t.h[k]+u*t.h[k+1])+v*((1-u)*t.h[k+t.C]+u*t.h[k+t.C+1]);independent.add(baselineMm+z[size_t(2*j+b)*Cq+2*i+a],e,xs[2*i+a],ys[2*j+b]);}}
  std::vector<double> xs2(t.C),ys2(t.R);for(int i=0;i<t.C;i++)xs2[i]=i*t.pitchX-W/2;for(int j=0;j<t.R;j++)ys2[j]=j*t.pitchY-H/2;const Axis bx=axisTable(nx,W,xs2),by=axisTable(fit.ny,H,ys2);forward(fit.deltas,bx,by,z,tmp);
  for(size_t k=0;k<z.size();k++)if(t.active[k])training.add(baselineMm+z[k],t.h[k],xs2[k%t.C],ys2[k/t.C]);
  auto inspect=[&](double x,double y){if(x>=-W/2&&x<=W/2&&y>=-H/2&&y<=H/2)protection.add(baselineMm+valueAt(fit.deltas,nx,atPhysical(nx,x,W,nullptr),atPhysical(fit.ny,y,H,nullptr)),baselineMm,x,y);};
  std::vector<std::pair<Shape,bool>> all={{d.support,false}};for(auto& s:d.holes)all.push_back({s,false});for(auto& s:d.zones)all.push_back({s,true});
  for(auto& [s,zone]:all){if(s.circle)for(int k=0;k<67;k++){double a=2*M_PI*(k+.371)/67;inspect(s.cx+s.r*std::cos(a),s.cy+s.r*std::sin(a));}
   else for(int k=0;k<67;k++){double a=(k+.371)/67;inspect(s.cx-s.w/2+a*s.w,s.cy-s.h/2);inspect(s.cx-s.w/2+a*s.w,s.cy+s.h/2);inspect(s.cx-s.w/2,s.cy-s.h/2+a*s.h);inspect(s.cx+s.w/2,s.cy-s.h/2+a*s.h);}
   if(zone)for(double u:{.173,.431,.793})for(double v:{.219,.617,.887}){double px=s.cx+(u-.5)*(s.circle?s.r*2:s.w),py=s.cy+(v-.5)*(s.circle?s.r*2:s.h);if(contains(s,px,py))inspect(px,py);}}}
 json metrics={{"training",training.finish()},{"independent",independent.finish()},{"protection",protection.finish()}};
 if(protection.maxMm>1e-10*std::max(1.0,std::abs(baselineMm)))fail("FIT_PROTECTION_FAILED","Independent protection samples do not retain baseline",{{"metrics",metrics}});
 const double acceptance=o.value("acceptanceToleranceMm",std::max(.1,2*p));const bool within=std::max(training.maxMm,independent.maxMm)<=acceptance;
 const std::string policy=o.value("deviationPolicy",std::string("candidate"));
 if(policy=="strict"&&!within)fail("FIT_DEVIATION","Fit exceeds explicitly accepted sampled deviation",{{"metrics",metrics},{"acceptanceToleranceMm",acceptance}});
 int lockedCount=0;for(auto v:fit.locked)lockedCount+=v;
 json warnings=json::array();if(!within)warnings.push_back("FIT_DEVIATION");if(best.trainP99>p)warnings.push_back("RELIEF_PRECISION_NOT_REACHED");
 fit.report={{"status",within?"numerically-accepted":"approximation-candidate"},{"method","quality-adaptive-cg+bounded-fista"},{"implementation","native-cpp relief_quality.hxx"},{"deviationPolicy",policy},{"withinTolerance",within},{"warnings",warnings},
  {"solver",fit.report},{"controlPoints",fit.nx*fit.ny},{"freeControlPoints",fit.nx*fit.ny-lockedCount},{"lockedControlPoints",lockedCount},{"acceptanceToleranceMm",acceptance},{"metrics",metrics},{"deviationKind","sampled-not-global"},
  {"quality",{{"version",1},{"machiningPrecisionMm",p},{"controlSpacingMm",{W/(fit.nx-3),H/(fit.ny-3)}},{"finestAllowedSpacingMm",finest},{"ladder",tried},{"trainP99Mm",best.trainP99},{"target",t.report},{"targetMs",targetMs},{"estimatedWork",work.work},{"totalMs",ms()}}}};
 return fit;
}
// Worker params carry quality beside fit (C# schema); the numeric core reads it from the fit options.
inline json withQuality(const json& params){if(!params.contains("quality"))return params;json p=params;p["fit"]["quality"]=p["quality"];p.erase("quality");return p;}
}}}
