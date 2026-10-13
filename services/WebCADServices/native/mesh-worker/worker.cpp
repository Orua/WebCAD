#include <manifold/manifold.h>
#include <nlohmann/json.hpp>
#include <windows.h>
#include <bcrypt.h>
#include <psapi.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <unordered_map>
#include <vector>
using json=nlohmann::json;
namespace fs=std::filesystem;
constexpr size_t SourceLimit=128ull*1024*1024;
constexpr uint32_t FaceLimit=2000000;
struct Failure:std::runtime_error {std::string code;Failure(std::string c,std::string m):std::runtime_error(m),code(c){}};
std::vector<uint8_t> read(const fs::path& p,size_t limit){std::ifstream f(p,std::ios::binary|std::ios::ate);if(!f)throw Failure("MESH_SOURCE_INVALID","Cannot read controlled asset");auto n=f.tellg();if(n<=0||uint64_t(n)>limit)throw Failure("MESH_SIZE_LIMIT","Asset exceeds byte budget");std::vector<uint8_t> b(size_t(n),0);f.seekg(0);f.read((char*)b.data(),b.size());if(!f)throw Failure("MESH_SOURCE_INVALID","Truncated asset read");return b;}
std::string sha(const std::vector<uint8_t>& b){BCRYPT_ALG_HANDLE alg=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;DWORD size=0,returned=0;std::array<uint8_t,32> digest{};
 if(BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0)throw Failure("HASH_FAILED","SHA provider unavailable");
 BCryptGetProperty(alg,BCRYPT_OBJECT_LENGTH,(PUCHAR)&size,sizeof(size),&returned,0);std::vector<uint8_t> object(size);
 const bool ok=BCryptCreateHash(alg,&hash,object.data(),size,nullptr,0,0)>=0&&BCryptHashData(hash,(PUCHAR)b.data(),ULONG(b.size()),0)>=0&&BCryptFinishHash(hash,digest.data(),digest.size(),0)>=0;
 if(hash)BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(alg,0);if(!ok)throw Failure("HASH_FAILED","Asset hash failed");std::ostringstream s;for(auto x:digest)s<<std::hex<<std::setw(2)<<std::setfill('0')<<int(x);return s.str();}
template<class T>T number(const std::vector<uint8_t>& b,size_t off){T n;std::memcpy(&n,b.data()+off,sizeof(T));return n;}
struct Point {double x,y,z;bool operator==(const Point& b)const{return x==b.x&&y==b.y&&z==b.z;}};
struct PointHash {size_t operator()(const Point& p)const{const auto h=std::hash<double>{};return h(p.x)^(h(p.y)<<1)^(h(p.z)<<2);}};
struct Mesh {std::vector<Point> points;std::vector<uint32_t> indices;uint32_t degenerate=0;};
Mesh stl(const std::vector<uint8_t>& b,double scale){
 if(b.size()<84)throw Failure("MESH_SOURCE_INVALID","Binary STL header missing");const auto count=number<uint32_t>(b,80);
 if(!count||count>FaceLimit||84ull+50ull*count!=b.size())throw Failure("MESH_SOURCE_INVALID","Complete bounded binary STL required");
 Mesh m;m.indices.reserve(size_t(count)*3);std::unordered_map<Point,uint32_t,PointHash> map;map.reserve(size_t(count));
 for(uint32_t f=0;f<count;f++){
  Point tri[3];for(size_t j=0;j<3;j++){
   const size_t at=84+size_t(f)*50+12+j*12;Point p{double(number<float>(b,at))*scale,double(number<float>(b,at+4))*scale,double(number<float>(b,at+8))*scale};
   if(!std::isfinite(p.x)||!std::isfinite(p.y)||!std::isfinite(p.z))throw Failure("MESH_NONFINITE","Nonfinite STL coordinates");tri[j]=p;
   auto added=map.emplace(p,uint32_t(m.points.size()));if(added.second)m.points.push_back(p);m.indices.push_back(added.first->second);
  }
  Point u{tri[1].x-tri[0].x,tri[1].y-tri[0].y,tri[1].z-tri[0].z},v{tri[2].x-tri[0].x,tri[2].y-tri[0].y,tri[2].z-tri[0].z};
  if(std::hypot(u.y*v.z-u.z*v.y,u.z*v.x-u.x*v.z,u.x*v.y-u.y*v.x)==0)m.degenerate++;
 }
 return m;
}
json bounds(const Mesh& m){std::array<double,3> low{INFINITY,INFINITY,INFINITY},high{-INFINITY,-INFINITY,-INFINITY};for(auto p:m.points){std::array<double,3> a{p.x,p.y,p.z};for(size_t k=0;k<3;k++){low[k]=std::min(low[k],a[k]);high[k]=std::max(high[k],a[k]);}}return {{"min",low},{"max",high}};}
json topology(const Mesh& m){
 struct Edge {uint64_t id;int direction;};std::vector<Edge> edges;edges.reserve(m.indices.size());
 for(size_t i=0;i<m.indices.size();i+=3)for(size_t j=0;j<3;j++){auto a=m.indices[i+j],b=m.indices[i+(j+1)%3];edges.push_back({uint64_t(std::min(a,b))<<32|std::max(a,b),a<b?1:-1});}
 std::sort(edges.begin(),edges.end(),[](const Edge&a,const Edge&b){return a.id<b.id;});size_t boundary=0,nonmanifold=0,inconsistent=0;
 for(size_t i=0;i<edges.size();){size_t end=i+1;int balance=edges[i].direction;while(end<edges.size()&&edges[end].id==edges[i].id)balance+=edges[end++].direction;auto n=end-i;if(n==1)boundary++;else if(n!=2)nonmanifold++;else if(balance!=0)inconsistent++;i=end;}
 const bool closed=boundary==0&&nonmanifold==0&&inconsistent==0&&m.degenerate==0;
 int status=-1;size_t manifoldFaces=0;
 if(closed){manifold::MeshGL64 input;input.numProp=3;input.vertProperties.reserve(m.points.size()*3);for(auto p:m.points){input.vertProperties.push_back(p.x);input.vertProperties.push_back(p.y);input.vertProperties.push_back(p.z);}input.triVerts.assign(m.indices.begin(),m.indices.end());manifold::Manifold derived(input);status=int(derived.Status());manifoldFaces=derived.NumTri();}
 return {{"boundaryEdges",boundary},{"nonmanifoldEdges",nonmanifold},{"inconsistentEdges",inconsistent},{"closedOrientedEdgeTopology",closed},{"manifoldStatus",status},{"manifoldTriangleCount",manifoldFaces},{"manifoldConstructorChangedTriangleCount",closed&&manifoldFaces!=m.indices.size()/3},{"selfIntersection","not-checked"},{"solidEligibility","blocked: self-intersection not independently verified"}};
}
std::vector<uint8_t> codec(const Mesh& m){
 const size_t total=64+m.points.size()*24+m.indices.size()*4;if(total>384ull*1024*1024)throw Failure("MESH_SIZE_LIMIT","Typed mesh result exceeds byte budget");std::vector<uint8_t> b(total,0);const uint8_t magic[8]={'W','C','M','E','S','H','1',0};std::memcpy(b.data(),magic,8);
 auto put32=[&](size_t off,uint32_t v){std::memcpy(b.data()+off,&v,4);};put32(8,1);put32(12,64);put32(16,uint32_t(m.points.size()));put32(20,uint32_t(m.indices.size()/3));put32(24,8);put32(28,4);put32(32,1);
 size_t at=64;for(auto p:m.points){std::array<double,3> xyz{p.x,p.y,p.z};std::memcpy(b.data()+at,xyz.data(),24);at+=24;}std::memcpy(b.data()+at,m.indices.data(),m.indices.size()*4);return b;
}
void atomic(const fs::path& path,const std::vector<uint8_t>& b){auto partial=path;partial+=L".partial";{std::ofstream f(partial,std::ios::binary);f.write((const char*)b.data(),b.size());if(!f)throw Failure("MESH_OUTPUT_FAILED","Could not write complete artifact");}if(fs::exists(path))throw Failure("MESH_OUTPUT_EXISTS","Refuse to overwrite a prior result");fs::rename(partial,path);}
int main(int argc,char** argv){
 if(argc!=2){std::cerr<<"One controlled request file is required\n";return 2;}const auto requestPath=fs::u8path(argv[1]);auto began=std::chrono::steady_clock::now();
 try{
  auto rb=read(requestPath,1024*1024);auto r=json::parse(rb);const auto op=r.at("operation").get<std::string>();if(op!="mesh.inspect"&&op!="mesh.translate")throw Failure("MESH_OPERATION_UNSUPPORTED","This worker only inspects or translates source geometry");
  auto bytes=read(fs::u8path(r.at("sourcePath").get<std::string>()),SourceLimit);const auto hash=sha(bytes);if(hash!=r.at("sourceSha256").get<std::string>())throw Failure("SOURCE_HASH_MISMATCH","Source bytes differ from the accepted asset");
  const auto unit=r.at("units").get<std::string>();const std::unordered_map<std::string,double> scales{{"mm",1},{"cm",10},{"m",1000},{"in",25.4}};if(!scales.count(unit))throw Failure("MESH_UNITS_REQUIRED","Explicit source units required");
  auto mesh=stl(bytes,scales.at(unit));const auto originalBounds=bounds(mesh);auto report=topology(mesh);
  std::array<double,3> delta{0,0,0};if(op=="mesh.translate"){delta=r.at("translationMm").get<std::array<double,3>>();for(auto d:delta)if(!std::isfinite(d)||std::abs(d)>100000)throw Failure("MESH_TRANSFORM_INVALID","Bounded mm translation required");for(auto& p:mesh.points){p.x+=delta[0];p.y+=delta[1];p.z+=delta[2];}}
  auto binary=codec(mesh);atomic(requestPath.parent_path()/"geometry.mesh",binary);
  PROCESS_MEMORY_COUNTERS memory{};memory.cb=sizeof(memory);GetProcessMemoryInfo(GetCurrentProcess(),&memory,sizeof(memory));
  json result{{"status","succeeded"},{"codec","webcad-mesh-f64-u32-v1"},{"geometryType","rawMesh"},{"sourceHash",hash},{"sourceBytes",bytes.size()},{"unitsDeclared",unit},{"unitScaleMm",scales.at(unit)},{"triangleCount",mesh.indices.size()/3},{"vertexCount",mesh.points.size()},{"degenerateTriangles",mesh.degenerate},{"sourceBounds",originalBounds},{"bounds",bounds(mesh)},{"translationMm",delta},{"rawBytesChanged",false},{"indexing","exact-coordinate reversible triangle-corner mapping; no nearest weld"},{"topology",report},{"artifactSha256",sha(binary)},{"artifactBytes",binary.size()},{"manifoldVersion","3.5.4"},{"elapsedMs",std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-began).count()},{"peakWorkingSetBytes",memory.PeakWorkingSetSize}};
  auto text=result.dump();atomic(requestPath.parent_path()/"result.json",std::vector<uint8_t>(text.begin(),text.end()));std::cout<<"stage=complete triangles="<<mesh.indices.size()/3<<"\n";return 0;
 }catch(const Failure& e){std::cerr<<e.code<<": "<<e.what()<<"\n";return 1;}catch(const std::exception& e){std::cerr<<"MESH_REQUEST_INVALID: "<<e.what()<<"\n";return 1;}
}
