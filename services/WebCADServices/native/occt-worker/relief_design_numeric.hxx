// relief.source-convert-1 / relief.design-fit-brep-1 numerical core (261022-04).
// Port of the browser reference modules; golden tests compare both:
//   src/relief-source/convert.js            -> convertRgba
//   src/relief-design-field.js (precision)  -> applyMachiningPrecision
//   src/relief-design-core/masked-bspline-fit.mjs -> fitMasked
// Pure C++17 (no OCCT, no Windows API) so it can be unit-built anywhere.
#pragma once
#include <nlohmann/json.hpp>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>

namespace webcad { namespace relief_design {
using json=nlohmann::json;
struct Failure:std::runtime_error{std::string code;json details;Failure(std::string c,const std::string& m,json d=json::object()):std::runtime_error(m),code(std::move(c)),details(std::move(d)){}};
[[noreturn]] inline void fail(const std::string& code,const std::string& m,json d=json::object()){throw Failure(code,m,std::move(d));}

// ---------- sha256 / base64 (raw-byte integrity, same as browser binaryHash) ----------
inline std::string sha256Hex(const std::vector<uint8_t>& data){
 static const uint32_t K[64]={0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
 uint32_t h[8]={0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
 std::vector<uint8_t> m(data);uint64_t bits=uint64_t(data.size())*8;m.push_back(0x80);while(m.size()%64!=56)m.push_back(0);for(int i=7;i>=0;i--)m.push_back(uint8_t(bits>>(i*8)));
 auto r=[](uint32_t x,int n){return (x>>n)|(x<<(32-n));};
 for(size_t o=0;o<m.size();o+=64){uint32_t w[64];for(int i=0;i<16;i++)w[i]=uint32_t(m[o+4*i])<<24|uint32_t(m[o+4*i+1])<<16|uint32_t(m[o+4*i+2])<<8|m[o+4*i+3];
  for(int i=16;i<64;i++){uint32_t s0=r(w[i-15],7)^r(w[i-15],18)^(w[i-15]>>3),s1=r(w[i-2],17)^r(w[i-2],19)^(w[i-2]>>10);w[i]=w[i-16]+s0+w[i-7]+s1;}
  uint32_t a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
  for(int i=0;i<64;i++){uint32_t S1=r(e,6)^r(e,11)^r(e,25),ch=(e&f)^(~e&g),t1=hh+S1+ch+K[i]+w[i],S0=r(a,2)^r(a,13)^r(a,22),mj=(a&b)^(a&c)^(b&c),t2=S0+mj;hh=g;g=f;f=e;e=d+t1;d=c;c=b;b=a;a=t1+t2;}
  h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=hh;}
 static const char* x="0123456789abcdef";std::string out;for(uint32_t v:h)for(int i=28;i>=0;i-=4)out+=x[(v>>i)&15];return out;
}
inline std::string base64(const std::vector<uint8_t>& b){static const char* t="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";std::string o;size_t i=0;for(;i+2<b.size();i+=3){uint32_t v=b[i]<<16|b[i+1]<<8|b[i+2];o+=t[v>>18];o+=t[(v>>12)&63];o+=t[(v>>6)&63];o+=t[v&63];}
 if(i<b.size()){uint32_t v=b[i]<<16|(i+1<b.size()?b[i+1]<<8:0);o+=t[v>>18];o+=t[(v>>12)&63];o+=i+1<b.size()?t[(v>>6)&63]:'=';o+='=';}return o;}
inline std::vector<uint8_t> unbase64(const std::string& s){std::vector<uint8_t> o;uint32_t v=0;int n=0;for(char c:s){int d=c>='A'&&c<='Z'?c-'A':c>='a'&&c<='z'?c-'a'+26:c>='0'&&c<='9'?c-'0'+52:c=='+'?62:c=='/'?63:-1;if(d<0)continue;v=v<<6|d;n+=6;if(n>=8){n-=8;o.push_back(uint8_t(v>>n));}}return o;}
inline std::vector<uint8_t> f64bytes(const std::vector<double>& v){std::vector<uint8_t> o(v.size()*8);for(size_t k=0;k<v.size();k++){uint64_t u;std::memcpy(&u,&v[k],8);for(int i=0;i<8;i++)o[k*8+i]=uint8_t(u>>(8*i));}return o;}

// ---------- precision smoothing (relief-design-field.js applyMachiningPrecision) ----------
inline double smoothstep(double t){return t<=0?0:t>=1?1:t*t*(3-2*t);}
inline double softKnee(double d,double p){return d*smoothstep(std::abs(d)/(2*p));}
inline json applyMachiningPrecision(std::vector<double>& h,const std::vector<uint8_t>& active,const std::vector<uint8_t>& fixed,int columns,int rows,double lower,double upper,double p){
 if(!(p>0))return {{"machiningPrecisionMm",p},{"changedNodeCount",0},{"maxChangeMm",0}};
 const int n=columns*rows;const std::vector<double> before(h);auto freeNode=[&](int k){return active[k]&&!fixed[k];};
 auto average=[&](const std::vector<double>& src){std::vector<double> out(src);for(int j=0;j<rows;j++)for(int i=0;i<columns;i++){int k=j*columns+i;if(!freeNode(k))continue;double s=src[k];int c=1;const int d[4][2]={{1,0},{-1,0},{0,1},{0,-1}};for(auto& q:d){int x=i+q[0],y=j+q[1];if(x<0||y<0||x>=columns||y>=rows)continue;int t=y*columns+x;if(!active[t])continue;s+=src[t];c++;}out[k]=s/c;}return out;};
 const auto s=average(average(before));int changed=0;double maxChange=0;
 for(int k=0;k<n;k++){if(!freeNode(k))continue;double v=s[k]+softKnee(before[k]-s[k],p);v=lower+softKnee(v-lower,p);v=std::min(upper,std::max(lower,v));double c=std::abs(v-before[k]);if(c>1e-12){changed++;maxChange=std::max(maxChange,c);}h[k]=v;}
 return {{"machiningPrecisionMm",p},{"method","detail-soft-knee+baseline-dead-band-C1"},{"changedNodeCount",changed},{"maxChangeMm",maxChange}};
}

// ---------- photoRelief (photo-relief.js) — keep in sync with browser PHOTO_RELIEF_DEFAULTS ----------
inline std::vector<double> blurSep(const std::vector<double>& src,int w,int h,double sigma){
 if(!(sigma>0))return src;int r=std::max(1,int(std::ceil(sigma*3)));std::vector<double> k(2*r+1);double sum=0;
 for(int i=-r;i<=r;i++){k[i+r]=std::exp(-double(i*i)/(2*sigma*sigma));sum+=k[i+r];}for(double& v:k)v/=sum;
 std::vector<double> tmp(src.size()),out(src.size());
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){double acc=0;for(int t=-r;t<=r;t++)acc+=k[t+r]*src[size_t(y)*w+std::min(w-1,std::max(0,x+t))];tmp[size_t(y)*w+x]=acc;}
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){double acc=0;for(int t=-r;t<=r;t++)acc+=k[t+r]*tmp[size_t(std::min(h-1,std::max(0,y+t)))*w+x];out[size_t(y)*w+x]=acc;}
 return out;
}
inline double percentileSorted(std::vector<double> a,double p){if(a.empty())return 0;std::sort(a.begin(),a.end());double i=std::min(double(a.size()-1),std::max(0.0,(p/100.0)*double(a.size()-1)));size_t lo=size_t(std::floor(i)),hi=size_t(std::ceil(i));return lo==hi?a[lo]:a[lo]*(hi-i)+a[hi]*(i-lo);}
inline json defaultPhoto(){return {{"lightingFrac",0.14},{"bodyFrac",0.07},{"midFrac",0.022},{"fineFrac",0.007},{"denoisePx",1.2},{"bodyWeight",0.5},{"midWeight",0.28},{"fineWeight",0.08},{"edgeFadeFrac",0.05},{"percentileLow",2.0},{"percentileHigh",98.0},{"massWeight",0.45},{"massFrac",0.1}};}
inline json normalizePhoto(const json& p){
 json d=defaultPhoto();if(p.is_null())return d;if(!p.is_object())fail("PARAM_SCHEMA_INVALID","photo 需要对象");
 static const char* keys[]={"lightingFrac","bodyFrac","midFrac","fineFrac","denoisePx","bodyWeight","midWeight","fineWeight","edgeFadeFrac","percentileLow","percentileHigh","massWeight","massFrac","algorithm"};
 static const char* keys2[]={"volume","volumeFrac","maskFrac","backgroundLevel","detailWeight","smoothness"};
 int algorithm=1;
 if(p.contains("algorithm")){const auto& a=p.at("algorithm");if(!a.is_number_integer()||(a.get<int>()!=1&&a.get<int>()!=2))fail("PARAM_SCHEMA_INVALID","photo.algorithm 仅支持 1 或 2");algorithm=a.get<int>();}
 for(auto it=p.begin();it!=p.end();++it){bool ok=false;for(auto k:keys)if(it.key()==k)ok=true;if(algorithm==2)for(auto k:keys2)if(it.key()==k)ok=true;if(!ok)fail("PARAM_SCHEMA_INVALID","未知照片浮雕参数："+it.key());}
 auto clamp=[&](const char* k,double lo,double hi){double v=p.value(k,d.at(k).get<double>());if(!(v>=lo&&v<=hi))fail("PARAM_RANGE_INVALID",std::string(k)+" out of range");d[k]=v;};
 clamp("lightingFrac",0.02,0.5);clamp("bodyFrac",0.01,0.4);clamp("midFrac",0.002,0.2);clamp("fineFrac",0.0005,0.1);clamp("denoisePx",0,8);
 clamp("bodyWeight",0,2);clamp("midWeight",0,2);clamp("fineWeight",0,2);clamp("edgeFadeFrac",0,0.25);clamp("percentileLow",0,20);clamp("percentileHigh",80,100);
 clamp("massWeight",0,2);clamp("massFrac",0.01,0.4);if(d.at("percentileHigh").get<double>()<=d.at("percentileLow").get<double>())fail("PARAM_RANGE_INVALID","percentileHigh 须高于 percentileLow");
 if(algorithm==2){
  d["algorithm"]=2;d["volume"]=0.8;d["volumeFrac"]=0.25;d["maskFrac"]=0.025;d["backgroundLevel"]=0.06;d["detailWeight"]=0.45;d["smoothness"]=0.7;
  clamp("volume",0,1);clamp("volumeFrac",0.01,0.3);clamp("maskFrac",0.005,0.15);clamp("backgroundLevel",0,0.3);clamp("detailWeight",0,1.5);clamp("smoothness",0,1);
 }else if(p.contains("algorithm"))d["algorithm"]=1;
 return d;
}
// ---------- photoRelief algorithm 2 (立体 v4) — mirrors photo-relief.js photoReliefV2 ----------
inline std::vector<double> blurFast(const std::vector<double>& src,int w,int h,double sigma){
 if(!(sigma>0))return src;if(sigma<2)return blurSep(src,w,h,sigma);
 const int n=3;double wIdeal=std::sqrt((12*sigma*sigma/n)+1);int wl=int(std::floor(wIdeal));if(wl%2==0)wl--;int wu=wl+2;
 int m=int(std::floor((12*sigma*sigma-n*wl*wl-4*n*wl-3*n)/(-4.0*wl-4)+0.5));/* JS Math.round */
 std::vector<double> a=src,b(src.size());
 for(int pass=0;pass<n;pass++){int r=((pass<m?wl:wu)-1)/2;if(r<1)continue;double inv=1.0/(2*r+1);
  for(int y=0;y<h;y++){size_t row=size_t(y)*w;double acc=0;for(int t=-r;t<=r;t++)acc+=a[row+std::min(w-1,std::max(0,t))];
   for(int x=0;x<w;x++){b[row+x]=acc*inv;acc+=a[row+std::min(w-1,x+r+1)]-a[row+std::max(0,x-r)];}}
  for(int x=0;x<w;x++){double acc=0;for(int t=-r;t<=r;t++)acc+=b[size_t(std::min(h-1,std::max(0,t)))*w+x];
   for(int y=0;y<h;y++){a[size_t(y)*w+x]=acc*inv;acc+=b[size_t(std::min(h-1,y+r+1))*w+x]-b[size_t(std::max(0,y-r))*w+x];}}}
 return a;
}
inline double smoothstepD(double e0,double e1,double x){double d=e1-e0;double t=(x-e0)/(d!=0?d:1e-12);t=t<0?0:t>1?1:t;return t*t*(3-2*t);}
inline double softClamp01(double x,double k){
 if(k<=0)return x<0?0:x>1?1:x;if(x<=-k)return 0;if(x<k)return (x+k)*(x+k)/(4*k);if(x<=1-k)return x;if(x<1+k){double u=1+k-x;return 1-u*u/(4*k);}return 1;
}
inline double otsuThreshold(const std::vector<double>& a){
 double mn=INFINITY,mx=-INFINITY;for(double v:a){if(v<mn)mn=v;if(v>mx)mx=v;}if(!(mx>mn))return mn;
 std::vector<double> bins(256,0.0);double sc=255/(mx-mn);for(double v:a)bins[std::min(255,int(std::floor((v-mn)*sc)))]++;
 double total=double(a.size()),sumAll=0;for(int i=0;i<256;i++)sumAll+=i*bins[i];
 double wB=0,sumB=0,best=-1;int bi=0;
 for(int i=0;i<256;i++){wB+=bins[i];if(!wB)continue;double wF=total-wB;if(!wF)break;sumB+=i*bins[i];double mB=sumB/wB,mF=(sumAll-sumB)/wF,v=wB*wF*(mB-mF)*(mB-mF);if(v>best){best=v;bi=i;}}
 return mn+(bi+0.5)/sc;
}
inline void edt1d(const std::vector<double>& f,int n,std::vector<double>& d,std::vector<int>& v,std::vector<double>& z){
 int k=0;v[0]=0;z[0]=-INFINITY;z[1]=INFINITY;
 for(int q=1;q<n;q++){int r=v[k];double sx=((f[q]+double(q)*q)-(f[r]+double(r)*r))/(2.0*q-2.0*r);
  while(sx<=z[k]){k--;r=v[k];sx=((f[q]+double(q)*q)-(f[r]+double(r)*r))/(2.0*q-2.0*r);}
  k++;v[k]=q;z[k]=sx;z[k+1]=INFINITY;}
 k=0;for(int q=0;q<n;q++){while(z[k+1]<q)k++;int r=v[k];d[q]=double(q-r)*(q-r)+f[r];}
}
inline std::vector<double> distanceTransform(const std::vector<uint8_t>& inside,int w,int h){
 const double INF=1e20;std::vector<double> g(size_t(w)*h);int m=std::max(w,h);std::vector<double> f(m),d(m),z(m+1);std::vector<int> v(m);
 for(int x=0;x<w;x++){for(int y=0;y<h;y++)f[y]=inside[size_t(y)*w+x]?INF:0;edt1d(f,h,d,v,z);for(int y=0;y<h;y++)g[size_t(y)*w+x]=d[y];}
 for(int y=0;y<h;y++){for(int x=0;x<w;x++)f[x]=g[size_t(y)*w+x];edt1d(f,w,d,v,z);for(int x=0;x<w;x++)g[size_t(y)*w+x]=std::sqrt(d[x]);}
 return g;
}
inline std::vector<double> photoReliefV2(const std::vector<double>& Lin,int C,int R,const json& p){
 auto P=[&](const char* k){return p.at(k).get<double>();};
 size_t n=size_t(C)*R;double side=double(std::max(C,R));
 std::vector<double> L(n);for(size_t i=0;i<n;i++)L[i]=std::isfinite(Lin[i])?Lin[i]:0;
 auto lighting=blurFast(L,C,R,P("lightingFrac")*side);
 std::vector<double> flat(n);for(size_t i=0;i<n;i++)flat[i]=L[i]-lighting[i];
 double den=std::max(P("denoisePx"),0.0035*side*P("smoothness"));
 if(den>0)flat=blurFast(flat,C,R,den);
 std::vector<double> Ld=den>0?blurFast(L,C,R,den):L;
 auto body=blurFast(flat,C,R,P("bodyFrac")*side);
 auto midb=blurFast(flat,C,R,P("midFrac")*side);
 auto fineb=blurFast(flat,C,R,std::max(0.6,P("fineFrac")*side)*(1+0.6*P("smoothness")));
 bool mass=P("massWeight")>0;std::vector<double> massb;if(mass)massb=blurFast(Ld,C,R,P("massFrac")*side);
 std::vector<double> D(n),energy(n);
 for(size_t i=0;i<n;i++){double mid=midb[i]-body[i],fine=fineb[i]-midb[i];
  D[i]=0.3*P("bodyWeight")*body[i]+P("midWeight")*mid+0.7*P("fineWeight")*fine+(mass?0.3*P("massWeight")*std::abs(Ld[i]-massb[i]):0);
  energy[i]=std::abs(mid)+0.5*std::abs(fine)+std::abs(Ld[i]-lighting[i])*0.5;}
 auto E=blurFast(energy,C,R,P("maskFrac")*side);
 auto Ls=blurFast(L,C,R,P("maskFrac")*side);
 std::vector<double> border;int bw=std::max(1,int(std::round(0.03*side)));
 for(int j=0;j<R;j++)for(int i=0;i<C;i++)if(i<bw||j<bw||i>=C-bw||j>=R-bw)border.push_back(Ls[size_t(j)*C+i]);
 double bgTone=percentileSorted(border,50);
 std::vector<double> tdist(n);for(size_t i=0;i<n;i++)tdist[i]=std::abs(Ls[i]-bgTone);
 double T=otsuThreshold(tdist),eT=otsuThreshold(E);
 std::vector<double> M(n);for(size_t i=0;i<n;i++)M[i]=std::max(smoothstepD(0.6*eT,1.4*eT,E[i])*0.8,smoothstepD(0.6*T,1.4*T,tdist[i]));
 {auto Mc=blurFast(M,C,R,P("maskFrac")*side*1.5);for(size_t i=0;i<n;i++)M[i]=std::max(M[i],smoothstepD(0.35,0.75,Mc[i]));}
 M=blurFast(M,C,R,(0.004+0.02*P("smoothness"))*side);
 std::vector<uint8_t> inside(n);
 for(int j=0;j<R;j++)for(int i=0;i<C;i++){size_t k=size_t(j)*C+i;inside[k]=(M[k]>=0.5&&i>0&&j>0&&i<C-1&&j<R-1)?1:0;}
 auto dist=distanceTransform(inside,C,R);double maxD=0;for(double v:dist)if(v>maxD)maxD=v;
 double cap=std::max(2.0,std::min(P("volumeFrac")*side,0.9*maxD));
 std::vector<double> B(n);for(size_t i=0;i<n;i++){double d=std::min(1.0,dist[i]/cap);B[i]=std::sqrt(std::max(0.0,1-(1-d)*(1-d)));}
 B=blurFast(B,C,R,std::max(1.0,cap*(0.15+0.25*P("smoothness"))));
 for(size_t i=0;i<n;i++)B[i]=0.85*B[i]+0.15*M[i];
 double pl=P("percentileLow"),ph=P("percentileHigh");
 double dLo=percentileSorted(D,pl),dHi=percentileSorted(D,ph),dMed=percentileSorted(D,50),dSpan=std::max(1e-12,dHi-dLo);
 std::vector<double> H(n),Dt(n);
 for(size_t i=0;i<n;i++)Dt[i]=std::tanh(2*(D[i]-dMed)/dSpan)/2;
 double feather=(0.004+0.02*P("smoothness"))*side;
 if(P("smoothness")>0){/* 丝滑: soften detail along large-scale tonal edges (|∇Ls|) */
  auto Db=blurFast(Dt,C,R,std::max(1.0,1.5*feather));std::vector<double> G(n);
  for(int j=0;j<R;j++)for(int i=0;i<C;i++){double gx=Ls[size_t(j)*C+std::min(C-1,i+1)]-Ls[size_t(j)*C+std::max(0,i-1)],gy=Ls[size_t(std::min(R-1,j+1))*C+i]-Ls[size_t(std::max(0,j-1))*C+i];G[size_t(j)*C+i]=std::hypot(gx,gy);}
  auto Gs=blurFast(G,C,R,std::max(1.0,feather));double gsMax=0;for(double v:Gs)if(v>gsMax)gsMax=v;
  if(gsMax>1e-12)for(size_t i=0;i<n;i++){double w=std::min(1.0,1.6*P("smoothness"))*smoothstepD(0,0.5*gsMax,Gs[i]);Dt[i]=Dt[i]+w*(Db[i]-Dt[i]);}
 }
 for(size_t i=0;i<n;i++)H[i]=P("volume")*B[i]+P("detailWeight")*Dt[i]*(0.25+0.75*M[i]);
 double lo=percentileSorted(H,std::max(0.5,pl/2)),hi=percentileSorted(H,std::min(99.8,(ph+100)/2)),span=hi-lo;
 std::vector<double> out(n,0.0);if(!(span>1e-12))return out;
 double knee=0.02+0.1*P("smoothness"),bg=P("backgroundLevel");
 for(size_t i=0;i<n;i++)out[i]=float(bg+(1-bg)*softClamp01((H[i]-lo)/span,knee));
 double ef=P("edgeFadeFrac");
 if(ef>0)for(int j=0;j<R;j++)for(int i=0;i<C;i++){double u=double(i)/std::max(1,C-1),v=double(j)/std::max(1,R-1);out[size_t(j)*C+i]=float(out[size_t(j)*C+i]*smoothstepD(0,1,std::min(std::min(u,1-u),std::min(v,1-v))/ef));}
 for(double& v:out)if(!std::isfinite(v))v=0;
 return out;
}
inline std::vector<double> photoReliefFromLuminance(const std::vector<double>& L,int C,int R,const json& photo){
 json p=normalizePhoto(photo);double side=double(std::max(C,R));
 if(p.value("algorithm",1)==2)return photoReliefV2(L,C,R,p);
 auto lighting=blurSep(L,C,R,p.at("lightingFrac").get<double>()*side);
 std::vector<double> flat(L.size());for(size_t i=0;i<L.size();i++)flat[i]=L[i]-lighting[i];
 if(p.at("denoisePx").get<double>()>0)flat=blurSep(flat,C,R,p.at("denoisePx").get<double>());
 auto body=blurSep(flat,C,R,p.at("bodyFrac").get<double>()*side);
 auto midb=blurSep(flat,C,R,p.at("midFrac").get<double>()*side);
 auto fineb=blurSep(flat,C,R,p.at("fineFrac").get<double>()*side);
 std::vector<double> h(L.size());
 for(size_t i=0;i<L.size();i++)h[i]=p.at("bodyWeight").get<double>()*body[i]+p.at("midWeight").get<double>()*(midb[i]-body[i])+p.at("fineWeight").get<double>()*(fineb[i]-midb[i]);
 if(p.at("massWeight").get<double>()>0){auto mb=blurSep(L,C,R,p.at("massFrac").get<double>()*side);for(size_t i=0;i<L.size();i++)h[i]+=p.at("massWeight").get<double>()*std::abs(L[i]-mb[i]);}
 double lo=percentileSorted(h,p.at("percentileLow").get<double>()),hi=percentileSorted(h,p.at("percentileHigh").get<double>()),span=hi-lo;
 std::vector<double> out(h.size(),0.0);
 if(span>1e-12)for(size_t i=0;i<h.size();i++){double v=(h[i]-lo)/span;out[i]=v<0?0:v>1?1:v;}
 double ef=p.at("edgeFadeFrac").get<double>();
 if(ef>0)for(int j=0;j<R;j++)for(int i=0;i<C;i++){double u=C>1?double(i)/(C-1):0,v=R>1?double(j)/(R-1):0;double m=std::min(std::min(u,1-u),std::min(v,1-v))/ef;m=m<0?0:m>1?1:m;m=m*m*(3-2*m);out[size_t(j)*C+i]*=m;}
 return out;
}

// ---------- relief.source-convert-1 (convert.js convertRgbaToHeightGrid) ----------
struct Grid{int columns=0,rows=0;std::vector<double> values;};
inline Grid convertRgba(const std::vector<uint8_t>& rgba,int width,int height,const json& s){
 if(width<1||height<1||int64_t(width)*height>16777216)fail("RELIEF_LIMIT","图像尺寸无效或超过 16M 像素");
 if(rgba.size()!=size_t(width)*height*4)fail("PARAM_SCHEMA_INVALID","RGBA 数据长度与尺寸不符");
 const int C=s.at("columns"),R=s.at("rows");if(C<2||R<2||C>2049||R>2049)fail("PARAM_RANGE_INVALID","columns/rows 需要 2–2049");
 const std::string mode=s.value("mode",std::string("luminance"));
 if(mode!="luminance"&&mode!="photoRelief")fail("PARAM_SCHEMA_INVALID","mode 仅支持 luminance 或 photoRelief");
 if(mode=="luminance"&&s.contains("photo"))fail("PARAM_SCHEMA_INVALID","luminance 模式不接受 photo 参数");
 const auto& cr=s.at("crop");const double x0=cr.at("x").get<double>()*width,y0=cr.at("y").get<double>()*height,cw=cr.at("width").get<double>()*width,ch=cr.at("height").get<double>()*height;
 std::vector<double> g(size_t(C)*R);
 for(int j=0;j<R;j++){double ya=y0+j*ch/R,yb=y0+(j+1)*ch/R;for(int i=0;i<C;i++){double xa=x0+i*cw/C,xb=x0+(i+1)*cw/C,acc=0,area=0;
  for(int y=int(std::floor(ya));y<std::ceil(yb)&&y<height;y++){double wy=std::min(yb,double(y+1))-std::max(ya,double(y));if(wy<=0)continue;for(int x=int(std::floor(xa));x<std::ceil(xb)&&x<width;x++){double wx=std::min(xb,double(x+1))-std::max(xa,double(x));if(wx<=0)continue;size_t k=(size_t(y)*width+x)*4;double a=rgba[k+3]/255.0,lum=(.2126*rgba[k]+.7152*rgba[k+1]+.0722*rgba[k+2])/255.0;acc+=(lum*a+(1-a))*wx*wy;area+=wx*wy;}}
  g[size_t(j)*C+i]=area?acc/area:1;}}
 if(mode=="photoRelief"){
  g=photoReliefFromLuminance(g,C,R,s.value("photo",json::object()));
 }else{
  const double sigma=s.at("blurPx");
  if(sigma>0){int r=int(std::ceil(sigma*3));std::vector<double> k(2*r+1);double sum=0;for(int i=0;i<2*r+1;i++){k[i]=std::exp(-double((i-r)*(i-r))/(2*sigma*sigma));}for(double v:k)sum+=v;for(double& v:k)v/=sum;
   auto pass=[&](const std::vector<double>& src,bool hz){std::vector<double> out(src.size());for(int y=0;y<R;y++)for(int x=0;x<C;x++){double acc=0;for(int t=-r;t<=r;t++){int xx=hz?std::min(C-1,std::max(0,x+t)):x,yy=hz?y:std::min(R-1,std::max(0,y+t));acc+=k[t+r]*src[size_t(yy)*C+xx];}out[size_t(y)*C+x]=acc;}return out;};
   g=pass(pass(g,true),false);}
 }
 const double black=s.at("levels").at("black"),white=s.at("levels").at("white"),gamma=s.at("gamma");const bool inv=s.at("invert");
 Grid out;out.columns=C;out.rows=R;out.values.resize(g.size());
 for(size_t k=0;k<g.size();k++){double v=(g[k]-black)/(white-black);v=std::min(1.0,std::max(0.0,v));v=std::pow(v,1/gamma);float f=float(inv?1-v:v);out.values[k]=f;}
 return out;
}
inline json encodeGrid(const Grid& g){std::vector<uint8_t> b(g.values.size()*2);for(size_t k=0;k<g.values.size();k++){int v=int(std::lround(std::min(1.0,std::max(0.0,g.values[k]))*65535));b[k*2]=v&255;b[k*2+1]=v>>8;}
 return {{"columns",g.columns},{"rows",g.rows},{"encoding","u16le"},{"data",base64(b)},{"sha256",sha256Hex(b)}};}

// ---------- masked baseline B-spline fit (masked-bspline-fit.mjs) ----------
struct B{int index;double weight;};
struct Limits{int side=257,controlSide=129;double work=4e11;int iterations=200000;};
struct Work{double work=0,max;void charge(double n){if(work+n>max)fail("FIT_WORK_BUDGET","Numerical total work budget reached",{{"work",work},{"maxWork",max}});work+=n;}};
inline std::vector<B> basis(int count,double t){
 const int degree=std::min(3,count-1),end=count-degree;const double u=t*end;const int span=u>=end?count-1:int(std::floor(u))+degree;
 std::vector<double> knots;for(int i=0;i<=degree;i++)knots.push_back(0);for(int i=1;i<end;i++)knots.push_back(i);for(int i=0;i<=degree;i++)knots.push_back(end);
 std::vector<double> b(degree+1),left(degree+1),right(degree+1);b[0]=1;
 for(int j=1;j<=degree;j++){left[j]=u-knots[span+1-j];right[j]=knots[span+j]-u;double saved=0;for(int r=0;r<j;r++){double term=b[r]/(right[r+1]+left[j-r]);b[r]=saved+right[r+1]*term;saved=left[j-r]*term;}b[j]=saved;}
 std::vector<B> out;for(int k=0;k<=degree;k++)out.push_back({span-degree+k,b[k]});return out;
}
inline double axisCoordinate(int n,double t,double span){double s=0;for(auto& b:basis(n,t))s+=b.weight*(double(b.index)/(n-1)-.5)*span;return s;}
inline std::vector<B> atPhysical(int n,double x,double span,Work* w){
 if(x< -span/2||x>span/2)fail("FIT_PARAMETER_OUTSIDE","Physical position is outside the design field");
 if(w)w->charge(54.0*(n+64));if(x==-span/2)return basis(n,0);if(x==span/2)return basis(n,1);
 double lo=0,hi=1;for(int i=0;i<54;i++){double mid=(lo+hi)/2;if(axisCoordinate(n,mid,span)<x)lo=mid;else hi=mid;}return basis(n,(lo+hi)/2);
}
inline std::vector<std::array<double,2>> axisSupports(int n,double span,Work& w){
 const int end=n-3;std::vector<double> k={0,0,0,0};for(int i=1;i<end;i++)k.push_back(i);for(int i=0;i<4;i++)k.push_back(end);w.charge(n*64.0);
 std::vector<std::array<double,2>> o;for(int i=0;i<n;i++)o.push_back({axisCoordinate(n,k[i]/end,span),axisCoordinate(n,k[i+4]/end,span)});return o;
}
struct Shape{bool circle;double cx,cy,r,w,h;};
inline Shape shapeOf(const json& s){Shape o{};o.circle=s.at("kind")=="circle";o.cx=s.at("centerMm")[0];o.cy=s.at("centerMm")[1];if(o.circle)o.r=s.at("radiusMm");else{if(s.at("kind")!="rect")fail("FIT_DOMAIN_UNSUPPORTED","Only explicit circle/rect domains are supported");o.w=s.at("widthMm");o.h=s.at("heightMm");}return o;}
inline bool contains(const Shape& s,double x,double y){double dx=std::abs(x-s.cx),dy=std::abs(y-s.cy);return s.circle?std::hypot(dx,dy)<=s.r:dx<=s.w/2&&dy<=s.h/2;}
inline bool intersects(const Shape& s,double a,double b,double c,double d,bool boundary){
 const double x=s.cx,y=s.cy,e=1e-10*std::max({1.0,std::abs(a),std::abs(b),std::abs(c),std::abs(d),std::abs(x),std::abs(y)});
 if(s.circle){double nearD=std::hypot(std::max({a-x,0.0,x-c}),std::max({b-y,0.0,y-d})),farD=std::hypot(std::max(std::abs(a-x),std::abs(c-x)),std::max(std::abs(b-y),std::abs(d-y)));return nearD<=s.r+e&&(!boundary||farD+e>=s.r);}
 const double l=x-s.w/2,r=x+s.w/2,lo=y-s.h/2,hi=y+s.h/2;if(a>r+e||c<l-e||b>hi+e||d<lo-e)return false;return !boundary||a<=l+e||c>=r-e||b<=lo+e||d>=hi-e;
}
struct Metric{int count=0;double maxMm=0,sum=0;json worst=nullptr;void add(double a,double e,double x,double y){double d=std::abs(a-e);count++;sum+=d*d;if(d>maxMm){maxMm=d;worst={{"xMm",x},{"yMm",y},{"actualMm",a},{"expectedMm",e}};}}json finish()const{return {{"count",count},{"maxMm",maxMm},{"rmsMm",count?std::sqrt(sum/count):0.0},{"worst",worst}};}};
struct Fit{int nx,ny;double widthMm,heightMm,baselineMm;int sign;std::vector<double> deltas,poles;std::vector<uint8_t> locked;json report;};
inline double valueAt(const std::vector<double>& poles,int nx,const std::vector<B>& bx,const std::vector<B>& by){double z=0;for(auto& y:by)for(auto& x:bx)z+=poles[size_t(y.index)*nx+x.index]*x.weight*y.weight;return z;}
namespace quality{inline Fit fitQuality(const json& field,const json& domain,double baselineMm,const json& o);} // defined in relief_quality.hxx

// field: {columns,rows,widthMm,heightMm,heightsMm,active,fixedMask}; domain: centred support/throughHoles/protectedZones.
inline Fit fitMasked(const json& field,const json& domain,double baselineMm,const json& o,const Limits& L={}){
 const std::string policy=o.value("deviationPolicy",std::string("strict"));if(policy!="strict"&&policy!="candidate")fail("FIT_INPUT_INVALID","Unknown deviationPolicy");const bool candidate=policy=="candidate";
 Work work{0,std::min(L.work,o.value("maxWork",L.work))};work.charge(1);
 const int columns=field.at("columns"),rows=field.at("rows"),count=columns*rows;
 if(columns<2||rows<2||columns>L.side||rows>L.side)fail("FIT_CAPACITY","Too many authored samples");
 const double widthMm=field.at("widthMm"),heightMm=field.at("heightMm");
 if(o.contains("quality"))return quality::fitQuality(field,domain,baselineMm,o); // relief_quality.hxx: full-resolution source, adaptive net
 const int nx=o.at("controlColumns"),ny=o.at("controlRows"),n=nx*ny;
 if(nx<4||ny<4||nx>L.controlSide||ny>L.controlSide)fail("FIT_CAPACITY","Control net outside server capacity (4–"+std::to_string(L.controlSide)+")");
 if(nx>columns||ny>rows)fail("FIT_UNDERSAMPLED","Authored grid must not be smaller than the control net");
 const std::string mode=o.at("mode");if(mode!="emboss"&&mode!="engrave")fail("FIT_INPUT_INVALID","Explicit emboss/engrave mode is required");
 const int sign=mode=="emboss"?1:-1;
 std::vector<double> heights(count);std::vector<uint8_t> active(count),fixed(count);
 const auto& H=field.at("heightsMm");const auto& A=field.at("active");const auto& F=field.at("fixedMask");
 if(int(H.size())!=count||int(A.size())!=count||int(F.size())!=count)fail("FIT_INPUT_INVALID","field arrays have the wrong length");
 double maximum=0;int activeCount=0;work.charge(count*8.0);
 for(int k=0;k<count;k++){heights[k]=H[k];active[k]=A[k].get<int>();fixed[k]=F[k].get<int>();if(!std::isfinite(heights[k]))fail("FIT_INPUT_INVALID","authored height must be finite");
  if(fixed[k]&&heights[k]!=baselineMm)fail("FIT_CONSTRAINT_CONFLICT","Only the declared constant baseline can be protected",{{"index",k}});
  if(!active[k])continue;activeCount++;double delta=(heights[k]-baselineMm)*sign;if(delta<0)fail("FIT_DIRECTION_CONFLICT","Authored height relative to baseline conflicts with mode",{{"index",k}});maximum=std::max(maximum,delta);}
 if(!activeCount)fail("FIT_DOMAIN_EMPTY","No active authored samples");
 const double envelope=o.contains("controlMaxMm")?o.at("controlMaxMm").get<double>():maximum;
 if(envelope<maximum||envelope<0||envelope>20)fail("FIT_INPUT_INVALID","Control envelope must cover signed delta magnitudes and remain <=20 mm");
 const int maxIterations=std::min(L.iterations,o.value("maxIterations",12000));const double tolerance=o.value("toleranceMm",1e-9),acceptance=o.at("acceptanceToleranceMm");
 const Shape support=shapeOf(domain.at("support"));std::vector<Shape> holes,zones;for(auto& s:domain.value("throughHoles",json::array()))holes.push_back(shapeOf(s));for(auto& s:domain.value("protectedZones",json::array()))zones.push_back(shapeOf(s));
 std::vector<double> xs(columns),ys(rows);for(int i=0;i<columns;i++)xs[i]=(double(i)/(columns-1)-.5)*widthMm;for(int j=0;j<rows;j++)ys[j]=(double(j)/(rows-1)-.5)*heightMm;
 std::vector<std::vector<B>> bx(columns),by(rows);for(int i=0;i<columns;i++)bx[i]=atPhysical(nx,xs[i],widthMm,&work);for(int j=0;j<rows;j++)by[j]=atPhysical(ny,ys[j],heightMm,&work);
 const auto sx=axisSupports(nx,widthMm,work),sy=axisSupports(ny,heightMm,work);std::vector<uint8_t> locked(n);
 for(int j=0;j<ny;j++)for(int i=0;i<nx;i++){work.charge((2.0+holes.size()+zones.size())*16);const double a=sx[i][0],b=sy[j][0],c=sx[i][1],d=sy[j][1];bool l=intersects(support,a,b,c,d,true);for(auto& s:holes)l=l||intersects(s,a,b,c,d,true);for(auto& s:zones)l=l||intersects(s,a,b,c,d,false);if(l)locked[size_t(j)*nx+i]=1;}
 struct Sample{std::vector<int> ids;std::vector<double> w;double target,x,y;};std::vector<Sample> samples;std::vector<double> columnSum(n);
 for(int j=0;j<rows;j++)for(int i=0;i<columns;i++){const int k=j*columns+i;if(!active[k])continue;work.charge((holes.size()+zones.size()+1)*8.0+32);
  bool bad=!contains(support,xs[i],ys[j]);for(auto& s:holes)bad=bad||contains(s,xs[i],ys[j]);if(bad)fail("FIT_DOMAIN_CONFLICT","Active sample contradicts declared support/hole",{{"index",k}});
  for(auto& s:zones)if(contains(s,xs[i],ys[j])&&heights[k]!=baselineMm)fail("FIT_CONSTRAINT_CONFLICT","Protected domain must retain the authored baseline",{{"index",k}});
  Sample sm;for(auto& y:by[j])for(auto& x:bx[i]){int id=y.index*nx+x.index;double w=x.weight*y.weight;sm.ids.push_back(id);sm.w.push_back(w);columnSum[id]+=w;if(fixed[k]&&w>0)locked[id]=1;}
  sm.target=(heights[k]-baselineMm)*sign;sm.x=xs[i];sm.y=ys[j];samples.push_back(std::move(sm));}
 int fixedCellCount=0;
 for(int j=0;j<rows-1;j++)for(int i=0;i<columns-1;i++){const int k=j*columns+i;int ids[4]={k,k+1,k+columns,k+columns+1};bool all=true;for(int id:ids)all=all&&active[id]&&fixed[id];if(!all)continue;
  fixedCellCount++;work.charge(double(nx+ny+n));const double guard=1e-10*std::max({1.0,widthMm,heightMm});
  for(int y=0;y<ny;y++)if(sy[y][0]<=ys[j+1]+guard&&sy[y][1]>=ys[j]-guard)for(int x=0;x<nx;x++)if(sx[x][0]<=xs[i+1]+guard&&sx[x][1]>=xs[i]-guard)locked[size_t(y)*nx+x]=1;}
 for(int k=0;k<n;k++)if(columnSum[k]==0)locked[k]=1;
 int lockedCount=0;for(auto v:locked)lockedCount+=v;const int freeCount=n-lockedCount;
 if(!freeCount&&maximum>0)fail("FIT_NO_FREEDOM","Protection leaves no free observed control poles",{{"controlPoints",n}});
 for(auto& s:samples){if(candidate||s.target<=acceptance)continue;bool all=true;for(size_t t=0;t<s.ids.size();t++)all=all&&(locked[s.ids[t]]||s.w[t]==0);if(all){double spacing=std::max(widthMm/std::max(1,nx-3),heightMm/std::max(1,ny-3));fail("FIT_CONSTRAINT_CONFLICT","Requested relief lies entirely in locked basis support",{{"xMm",s.x},{"yMm",s.y},{"controlSpacingMm",spacing},{"suggestedMarginMm",2*spacing}});}}
 double Lc=1;for(double v:columnSum)Lc=std::max(Lc,v);
 auto project=[&](double v,int k){return locked[k]?0.0:std::max(0.0,std::min(envelope,v));};
 auto gradient=[&](const std::vector<double>& v,std::vector<double>& out){work.charge(samples.size()*32.0+n);std::fill(out.begin(),out.end(),0.0);for(auto& s:samples){double z=0;for(size_t t=0;t<s.ids.size();t++)z+=v[s.ids[t]]*s.w[t];const double r=z-s.target;for(size_t t=0;t<s.ids.size();t++)out[s.ids[t]]+=r*s.w[t];}};
 std::vector<double> c(n,0.0),acc(c),g(n),next(n),check(n);double momentum=1,residual=INFINITY;int iterations=0;
 for(;iterations<maxIterations;iterations++){
  gradient(acc,g);for(int k=0;k<n;k++)next[k]=project(acc[k]-g[k]/Lc,k);gradient(next,check);
  work.charge(n*8.0);residual=0;for(int k=0;k<n;k++)residual=std::max(residual,std::abs(next[k]-project(next[k]-check[k]/Lc,k)));
  if(residual<=tolerance){c=next;iterations++;break;}
  const double m=(1+std::sqrt(1+4*momentum*momentum))/2;for(int k=0;k<n;k++)acc[k]=next[k]+(momentum-1)/m*(next[k]-c[k]);c=next;momentum=m;}
 if(!candidate&&residual>tolerance)fail("FIT_NOT_CONVERGED","Projected residual did not converge",{{"iterations",iterations},{"projectedResidualMm",residual}});
 Fit out{nx,ny,widthMm,heightMm,baselineMm,sign,{},{},locked,{}};out.deltas.resize(n);out.poles.resize(n);for(int k=0;k<n;k++){out.deltas[k]=c[k]*sign;out.poles[k]=baselineMm+out.deltas[k];}
 Metric training,independent,protection;
 auto sample=[&](double x,double y){work.charge(32);return valueAt(out.poles,nx,atPhysical(nx,x,widthMm,nullptr),atPhysical(ny,y,heightMm,nullptr));};
 { // training samples reuse grid bases (identical to cache in JS)
  for(int j=0,s=0;j<rows;j++)for(int i=0;i<columns;i++){int k=j*columns+i;if(!active[k])continue;training.add(valueAt(out.poles,nx,bx[i],by[j]),baselineMm+sign*samples[s].target,xs[i],ys[j]);s++;}
 }
 const double fr[2]={.2113248654051871,.7886751345948129};
 std::vector<std::vector<B>> qx(2*(columns-1)),qy(2*(rows-1));
 for(int i=0;i<columns-1;i++)for(int a=0;a<2;a++)qx[2*i+a]=atPhysical(nx,xs[i]+fr[a]*(xs[i+1]-xs[i]),widthMm,&work);
 for(int j=0;j<rows-1;j++)for(int a=0;a<2;a++)qy[2*j+a]=atPhysical(ny,ys[j]+fr[a]*(ys[j+1]-ys[j]),heightMm,&work);
 for(int j=0;j<rows-1;j++)for(int i=0;i<columns-1;i++){const int k=j*columns+i;if(!(active[k]&&active[k+1]&&active[k+columns]&&active[k+columns+1]))continue;
  const bool allFixed=fixed[k]&&fixed[k+1]&&fixed[k+columns]&&fixed[k+columns+1];
  for(int a=0;a<2;a++)for(int b=0;b<2;b++){const double u=fr[a],v=fr[b];double x=xs[i]+u*(xs[i+1]-xs[i]),y=ys[j]+v*(ys[j+1]-ys[j]);double e=(1-v)*((1-u)*heights[k]+u*heights[k+1])+v*((1-u)*heights[k+columns]+u*heights[k+columns+1]);work.charge(32);double z=valueAt(out.poles,nx,qx[2*i+a],qy[2*j+b]);independent.add(z,e,x,y);if(allFixed)protection.add(z,baselineMm,x,y);}}
 auto inspect=[&](double x,double y){if(x>=-widthMm/2&&x<=widthMm/2&&y>=-heightMm/2&&y<=heightMm/2)protection.add(sample(x,y),baselineMm,x,y);};
 std::vector<std::pair<Shape,bool>> all={{support,false}};for(auto& s:holes)all.push_back({s,false});for(auto& s:zones)all.push_back({s,true});
 for(auto& [s,zone]:all){if(s.circle)for(int k=0;k<67;k++){double t=2*M_PI*(k+.371)/67;inspect(s.cx+s.r*std::cos(t),s.cy+s.r*std::sin(t));}
  else for(int k=0;k<67;k++){double t=(k+.371)/67;inspect(s.cx-s.w/2+t*s.w,s.cy-s.h/2);inspect(s.cx-s.w/2+t*s.w,s.cy+s.h/2);inspect(s.cx-s.w/2,s.cy-s.h/2+t*s.h);inspect(s.cx+s.w/2,s.cy-s.h/2+t*s.h);}
  if(zone)for(double u:{.173,.431,.793})for(double v:{.219,.617,.887}){double px=s.cx+(u-.5)*(s.circle?s.r*2:s.w),py=s.cy+(v-.5)*(s.circle?s.r*2:s.h);if(contains(s,px,py))inspect(px,py);}}
 json metrics={{"training",training.finish()},{"independent",independent.finish()},{"protection",protection.finish()}};const double roundoff=1e-10*std::max(1.0,std::abs(baselineMm));
 if(protection.maxMm>roundoff)fail("FIT_PROTECTION_FAILED","Independent protection samples do not retain baseline",{{"metrics",metrics}});
 const bool withinTolerance=std::max(training.maxMm,independent.maxMm)<=acceptance,converged=residual<=tolerance;
 if(!candidate&&!withinTolerance)fail("FIT_DEVIATION","Fit exceeds explicitly accepted sampled deviation",{{"metrics",metrics},{"acceptanceToleranceMm",acceptance}});
 json warnings=json::array();if(!withinTolerance)warnings.push_back("FIT_DEVIATION");if(!converged)warnings.push_back("FIT_NOT_CONVERGED");
 out.report={{"status",withinTolerance&&converged?"numerically-accepted":"approximation-candidate"},{"deviationPolicy",policy},{"withinTolerance",withinTolerance},{"converged",converged},{"warnings",warnings},{"method","masked-bounded-accelerated-projected-gradient"},{"implementation","native-cpp-port-of-masked-bspline-fit.mjs"},{"iterations",iterations},{"projectedResidualMm",residual},{"estimatedWork",work.work},{"maxWork",work.max},{"controlPoints",n},{"freeControlPoints",freeCount},{"lockedControlPoints",lockedCount},{"fixedCellCount",fixedCellCount},{"acceptanceToleranceMm",acceptance},{"metrics",metrics},{"deviationKind","sampled-not-global"}};
 return out;
}
}}
