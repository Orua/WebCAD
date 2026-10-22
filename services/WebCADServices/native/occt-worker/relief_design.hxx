// relief.design-fit-brep-1: solved field -> masked B-spline fit -> exact face replacement BRep (+ STEP).
// Exact trimming: the fitted surface REPLACES the selected planar face (or the part of it inside the
// declared analytic support outline). The trimmed face keeps the host's own boundary edges (outer
// rim, real holes), so there is no grid-cell staircase seam. Locked boundary controls guarantee the
// surface lies on the host plane along every retained boundary edge; this is verified, never assumed.
// Included by worker.cpp after measure()/keys(); requires OCCT 7.8.1.
#pragma once
#include "relief_design_numeric.hxx"
#include "relief_quality.hxx"
#include <Geom_BSplineSurface.hxx>
#include <TColgp_Array2OfPnt.hxx>
#include <TColStd_Array1OfReal.hxx>
#include <TColStd_Array1OfInteger.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepAlgoAPI_Splitter.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepTools_ReShape.hxx>
#include <BRepLib.hxx>
#include <BRep_Tool.hxx>
#include <BRepTools.hxx>
#include <ShapeFix_Edge.hxx>
#include <ShapeFix_Face.hxx>
#include <ShapeFix_Shape.hxx>
#include <ShapeFix_Wire.hxx>
#include <ShapeAnalysis_Surface.hxx>
#include <GC_MakeCircle.hxx>
#include <gp_Circ.hxx>
#include <gp_Ax2.hxx>
#include <TopoDS.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#ifdef WEBCAD_RELIEF_STEP
#include <STEPControl_Writer.hxx>
#include <Interface_Static.hxx>
#endif
#include <Precision.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <Poly_Triangulation.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <Geom2dAPI_PointsToBSpline.hxx>
#include <TColgp_Array1OfPnt2d.hxx>
#include <Geom2d_BSplineCurve.hxx>
#include <Message.hxx>
#include <Message_Messenger.hxx>
#include <functional>
#include <set>
#include <chrono>
#include <fstream>
#include <iterator>

namespace webcad { namespace relief_design {
inline gp_Pnt P3(const json& a){return gp_Pnt(a.at(0).get<double>(),a.at(1).get<double>(),a.at(2).get<double>());}
inline gp_Vec V3(const json& a){return gp_Vec(a.at(0).get<double>(),a.at(1).get<double>(),a.at(2).get<double>());}

struct Frame{gp_Pnt origin;gp_Vec x,y,n;gp_Pnt at(double u,double v,double h)const{return origin.Translated(x*u+y*v+n*h);}};

// Unique planar face containing point with outward normal (same rule as bindPlanarRoundFace).
inline TopoDS_Face bindPlanarFace(const TopoDS_Shape& solid,const json& intent){
 if(intent.at("kind")!="planar-face-geometric-intent")fail("SELECTION_UNSUPPORTED","Expected explicit planar-face geometric intent");
 const gp_Pnt p=P3(intent.at("point"));const gp_Vec n=V3(intent.at("normal"));
 if(std::abs(n.Magnitude()-1)>1e-9)fail("PARAM_SCHEMA_INVALID","Selected face normal must have unit length");
 TopoDS_Face sel;int matches=0;
 for(TopExp_Explorer ex(solid,TopAbs_FACE);ex.More();ex.Next()){
  const auto f=TopoDS::Face(ex.Current());BRepAdaptor_Surface s(f,true);if(s.GetType()!=GeomAbs_Plane)continue;
  gp_Vec out(s.Plane().Axis().Direction());if(f.Orientation()==TopAbs_REVERSED)out.Reverse();if(out.Dot(n)<1-1e-9)continue;
  if(std::abs(gp_Vec(s.Plane().Location(),p).Dot(out))>1e-6)continue;
  BRepClass_FaceClassifier c(f,p,1e-7);if(c.State()!=TopAbs_IN&&c.State()!=TopAbs_ON)continue;sel=f;++matches;}
 if(matches!=1)fail("RELIEF_DESIGN_SUPPORT_MISMATCH","选面缺失或不唯一：请在当前实体上重新选择一个平面");
 return sel;
}

inline Handle(Geom_BSplineSurface) fittedSurface(const Fit& fit,const Frame& fr){
 const int cols=fit.nx,rows=fit.ny;TColgp_Array2OfPnt poles(1,cols,1,rows);
 for(int j=0;j<rows;j++)for(int i=0;i<cols;i++){
  const double h=fit.deltas[size_t(j)*cols+i]; // signed: emboss >0 outward, engrave <0 inward
  poles.SetValue(i+1,j+1,fr.at((double(i)/(cols-1)-.5)*fit.widthMm,(double(j)/(rows-1)-.5)*fit.heightMm,h));}
 auto knots=[](int n,int d,TColStd_Array1OfReal*& k,TColStd_Array1OfInteger*& m){const int c=n-d+1;k=new TColStd_Array1OfReal(1,c);m=new TColStd_Array1OfInteger(1,c);for(int i=1;i<=c;i++){k->SetValue(i,i-1);m->SetValue(i,i==1||i==c?d+1:1);}};
 const int du=std::min(3,cols-1),dv=std::min(3,rows-1);TColStd_Array1OfReal *uk,*vk;TColStd_Array1OfInteger *um,*vm;knots(cols,du,uk,um);knots(rows,dv,vk,vm);
 Handle(Geom_BSplineSurface) s=new Geom_BSplineSurface(poles,*uk,*vk,*um,*vm,du,dv,false,false);delete uk;delete vk;delete um;delete vm;return s;
}

// Analytic support outline (design coords centred at placement origin) as a planar face, slightly lifted? No: exactly on the plane.
inline TopoDS_Face supportOutlineFace(const Shape& s,const Frame& fr){
 if(s.circle){gp_Ax2 ax(fr.at(s.cx,s.cy,0),gp_Dir(fr.n),gp_Dir(fr.x));return BRepBuilderAPI_MakeFace(BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(gp_Circ(ax,s.r))).Wire(),true).Face();}
 const gp_Pnt a=fr.at(s.cx-s.w/2,s.cy-s.h/2,0),b=fr.at(s.cx+s.w/2,s.cy-s.h/2,0),c=fr.at(s.cx+s.w/2,s.cy+s.h/2,0),d=fr.at(s.cx-s.w/2,s.cy+s.h/2,0);
 BRepBuilderAPI_MakeWire w;w.Add(BRepBuilderAPI_MakeEdge(a,b));w.Add(BRepBuilderAPI_MakeEdge(b,c));w.Add(BRepBuilderAPI_MakeEdge(c,d));w.Add(BRepBuilderAPI_MakeEdge(d,a));return BRepBuilderAPI_MakeFace(w.Wire(),true).Face();
}
// Exact inverse of the separable physical mapping x(u) used for the poles (same bisection as atPhysical).
inline double paramOf(int n,double x,double span){const int d=std::min(3,n-1),end=n-d;if(x<=-span/2)return 0;if(x>=span/2)return end;double lo=0,hi=1;for(int i=0;i<60;i++){double m=(lo+hi)/2;if(axisCoordinate(n,m,span)<x)lo=m;else hi=m;}return (lo+hi)/2*end;}
inline void local(const Frame& fr,const gp_Pnt& p,double& u,double& v,double& h){gp_Vec d(fr.origin,p);u=d.Dot(fr.x);v=d.Dot(fr.y);h=d.Dot(fr.n);}

// Independent quality checks (GProp on trimmed high-knot B-spline faces can be off by ~0.1 %% of the
// host-plane term, so material change is cross-checked with a triangulation and the analytic field).
inline double meshVolume(const TopoDS_Shape& original,double deflection){const TopoDS_Shape s=BRepBuilderAPI_Copy(original,true,false).Shape();BRepMesh_IncrementalMesh m(s,deflection,false,0.05);double v=0;for(TopExp_Explorer x(s,TopAbs_FACE);x.More();x.Next()){const TopoDS_Face& f=TopoDS::Face(x.Current());TopLoc_Location L;auto t=BRep_Tool::Triangulation(f,L);if(t.IsNull())return NAN;for(int i=1;i<=t->NbTriangles();i++){int a,b,c;t->Triangle(i).Get(a,b,c);if(f.Orientation()==TopAbs_REVERSED)std::swap(b,c);const gp_XYZ p=t->Node(a).Transformed(L).XYZ(),q=t->Node(b).Transformed(L).XYZ(),r=t->Node(c).Transformed(L).XYZ();v+=p.Dot(q.Crossed(r))/6;}}return v;}
struct DesignResult{TopoDS_Shape shape;json report;};
inline DesignResult build(const TopoDS_Shape& input,const json& params,double beforeVolume,const std::function<void(const char*)>& outerStage){
 const auto began=std::chrono::steady_clock::now();auto ms=[&]{return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-began).count();};
 json stageMs=json::object();std::string current;double mark=0;
 auto stage=[&](const char* name){const double t=ms();if(!current.empty())stageMs[current]=t-mark;current=name;mark=t;outerStage(name);};
 const auto& pl=params.at("placement");Frame fr;fr.origin=P3(pl.at("originMm"));
 stage("bind-planar-face");TopExp_Explorer solids(input,TopAbs_SOLID);if(!solids.More())fail("RELIEF_DESIGN_SUPPORT_INVALID","浮雕需要实体支撑面");const TopoDS_Shape solid=solids.Current();
 TopoDS_Face face=bindPlanarFace(solid,params.at("faceIntent"));
 {BRepAdaptor_Surface s(face,true);gp_Vec out(s.Plane().Axis().Direction());if(face.Orientation()==TopAbs_REVERSED)out.Reverse();fr.n=out;}
 fr.x=V3(pl.at("xDirection"));if(std::abs(fr.x.Magnitude()-1)>1e-9||std::abs(fr.x.Dot(fr.n))>1e-9)fail("RELIEF_DESIGN_PLACEMENT_INVALID","图案X方向必须是支撑面内的单位切向");
 fr.y=fr.n.Crossed(fr.x);
 {BRepAdaptor_Surface s(face,true);if(std::abs(gp_Vec(s.Plane().Location(),fr.origin).Dot(fr.n))>1e-6)fail("RELIEF_DESIGN_PLACEMENT_INVALID","图案中心必须位于支撑平面上");}
 const Shape support=shapeOf(params.at("domain").at("support"));
 stage("fit-masked-bspline");const double fitStart=ms();
 Fit fit=fitMasked(params.at("field"),params.at("domain"),params.at("baselineMm").get<double>(),params.at("fit"));const double fitMs=ms()-fitStart;
 const auto surface=fittedSurface(fit,fr);
 // 1) Does the analytic support cover the whole face? Sample every boundary edge.
 auto edgeInside=[&](const TopoDS_Edge& e,double pad){BRepAdaptor_Curve c(e);for(int k=0;k<=64;k++){double u,v,h;local(fr,c.Value(c.FirstParameter()+(c.LastParameter()-c.FirstParameter())*k/64),u,v,h);
   if(std::abs(u)>fit.widthMm/2+1e-9||std::abs(v)>fit.heightMm/2+1e-9)return false;double dx=std::abs(u-support.cx),dy=std::abs(v-support.cy);if(support.circle?std::hypot(dx,dy)>support.r+pad:dx>support.w/2+pad||dy>support.h/2+pad)return false;}return true;};
 bool covered=true;for(TopExp_Explorer ex(face,TopAbs_EDGE);ex.More()&&covered;ex.Next())covered=edgeInside(TopoDS::Edge(ex.Current()),1e-6);
 TopoDS_Shape host=solid;std::vector<TopoDS_Face> targets;std::string trim;
 if(covered){targets.push_back(face);trim="whole-selected-face-host-boundary";}
 else{
  stage("split-face-by-analytic-support");
  BRepAlgoAPI_Splitter sp;TopTools_ListOfShape args,tools;args.Append(solid);tools.Append(supportOutlineFace(support,fr));sp.SetArguments(args);sp.SetTools(tools);sp.SetFuzzyValue(1e-7);sp.Build();
  if(!sp.IsDone()||sp.HasErrors())fail("RELIEF_INVALID","按支撑轮廓分割选面失败");
  TopExp_Explorer s2(sp.Shape(),TopAbs_SOLID);if(!s2.More())fail("RELIEF_INVALID","分割后没有实体");host=s2.Current();
  for(TopExp_Explorer ex(host,TopAbs_FACE);ex.More();ex.Next()){const auto f=TopoDS::Face(ex.Current());BRepAdaptor_Surface s(f,true);if(s.GetType()!=GeomAbs_Plane)continue;
   gp_Vec out(s.Plane().Axis().Direction());if(f.Orientation()==TopAbs_REVERSED)out.Reverse();if(out.Dot(fr.n)<1-1e-9||std::abs(gp_Vec(fr.origin,s.Plane().Location()).Dot(fr.n))>1e-6)continue;
   bool in=true;for(TopExp_Explorer e(f,TopAbs_EDGE);e.More()&&in;e.Next())in=edgeInside(TopoDS::Edge(e.Current()),1e-5);if(in)targets.push_back(f);}
  if(targets.empty())fail("RELIEF_OUTSIDE_FACE","设计支撑轮廓不在选面内：请对齐图案中心或缩小尺寸");
  trim="analytic-support-outline-plus-host-boundary";
 }
 // 2) Every retained boundary edge must lie on the fitted surface (locked controls => exactly on the plane).
 stage("verify-boundary-on-surface");double boundaryDev=0;int boundaryEdges=0;std::set<std::string> edgeKinds;
 for(auto& f:targets)for(TopExp_Explorer ex(f,TopAbs_EDGE);ex.More();ex.Next()){BRepAdaptor_Curve c(TopoDS::Edge(ex.Current()));boundaryEdges++;edgeKinds.insert(c.GetType()==GeomAbs_Line?"line":c.GetType()==GeomAbs_Circle?"circle":"other");
  for(int k=0;k<=32;k++){double u,v,h;local(fr,c.Value(c.FirstParameter()+(c.LastParameter()-c.FirstParameter())*k/32),u,v,h);const auto bx=atPhysical(fit.nx,std::max(-fit.widthMm/2,std::min(fit.widthMm/2,u)),fit.widthMm,nullptr),by=atPhysical(fit.ny,std::max(-fit.heightMm/2,std::min(fit.heightMm/2,v)),fit.heightMm,nullptr);boundaryDev=std::max(boundaryDev,std::abs(valueAt(fit.deltas,fit.nx,bx,by)));}}
 if(boundaryDev>1e-7)fail("RELIEF_OUTSIDE_FACE","选面边界（外轮廓/真实孔）处拟合曲面不在原平面上（偏差 "+std::to_string(boundaryDev)+" mm）：图案保留域与边界相交，请对齐圆孔或移动图案中心",{{"boundaryDeviationMm",boundaryDev}});
 // 3) Replace each target face by the fitted surface trimmed with the SAME edges.
 stage("replace-face-exact-trim");double edgeTolMax=0;BRepTools_ReShape reshape;BRep_Builder bb;
 for(auto& f:targets){
  TopoDS_Face nf;bb.MakeFace(nf,surface,Precision::Confusion());
  const TopoDS_Face fwd=TopoDS::Face(f.Oriented(TopAbs_FORWARD));
  for(TopExp_Explorer w(fwd,TopAbs_WIRE);w.More();w.Next())bb.Add(nf,w.Current());
  // Orientation: plane outward normal vs surface normal (x cross y == n).
  BRepAdaptor_Surface ps(fwd,true);const bool planeForward=gp_Vec(ps.Plane().Axis().Direction()).Dot(fr.n)>0;if(!planeForward)nf.Reverse();
  // Exact pcurves: invert the separable XY mapping of the fitted surface at dense edge samples.
  for(TopExp_Explorer e(nf,TopAbs_EDGE);e.More();e.Next()){const auto edge=TopoDS::Edge(e.Current());BRepAdaptor_Curve c(edge);const int N=129;
   TColgp_Array1OfPnt2d pts(1,N);TColStd_Array1OfReal prm(1,N);
   for(int k=0;k<N;k++){const double t=c.FirstParameter()+(c.LastParameter()-c.FirstParameter())*k/(N-1);double u,v,h;local(fr,c.Value(t),u,v,h);pts.SetValue(k+1,gp_Pnt2d(paramOf(fit.nx,u,fit.widthMm),paramOf(fit.ny,v,fit.heightMm)));prm.SetValue(k+1,t);}
   Geom2dAPI_PointsToBSpline approx(pts,prm,3,8,GeomAbs_C2,1e-10);if(!approx.IsDone())fail("RELIEF_INVALID","边界参数曲线构造失败");
   bb.UpdateEdge(edge,approx.Curve(),nf,BRep_Tool::Tolerance(edge));bb.Range(edge,nf,c.FirstParameter(),c.LastParameter());}
  BRepLib::SameParameter(nf,1e-7,false);
  {double mt=0;for(TopExp_Explorer e(nf,TopAbs_EDGE);e.More();e.Next())mt=std::max(mt,BRep_Tool::Tolerance(TopoDS::Edge(e.Current())));if(mt>1e-5)fail("RELIEF_INVALID","精确裁剪边界容差超限："+std::to_string(mt)+" mm");edgeTolMax=std::max(edgeTolMax,mt);}
  reshape.Replace(fwd,nf);
 }
 TopoDS_Shape result=reshape.Apply(host);
 {TopExp_Explorer rs(result,TopAbs_SOLID);if(!rs.More())fail("RELIEF_INVALID","替换后没有实体");TopoDS_Solid so=TopoDS::Solid(rs.Current());BRepLib::OrientClosedSolid(so);result=so;}
 stage("validate-result");
 json after;try{after=measure(result);}catch(const std::exception&){
  // Repairing an invalid dense face invokes OCCT's quadratic surface sampling
  // (over 1 GiB at ~1000 controls). Enter the existing, reported capacity retry
  // before repair; never raise the controlled process budget or accept invalid BRep.
  if(params.at("fit").contains("quality")&&std::max(fit.nx,fit.ny)>513)
   fail("RELIEF_QUALITY_CHECK_FAILED","Dense face needs repair beyond the controlled worker capacity");
  ShapeFix_Shape fix(result);fix.Perform();result=fix.Shape();after=measure(result);
 }
 const double delta=(after.at("volumeMm3").get<double>()-beforeVolume)*fit.sign;
 stage("quality-check");
 // Target faces as 2D polygons in pattern coords (ordered wire traversal, 48 samples per edge).
 std::vector<std::vector<std::vector<std::pair<double,double>>>> polys;
 for(auto& f:targets){std::vector<std::vector<std::pair<double,double>>> loops;for(TopExp_Explorer w(f,TopAbs_WIRE);w.More();w.Next()){std::vector<std::pair<double,double>> L;for(BRepTools_WireExplorer we(TopoDS::Wire(w.Current()));we.More();we.Next()){BRepAdaptor_Curve c(we.Current());const bool rev=we.Current().Orientation()==TopAbs_REVERSED;for(int k=0;k<48;k++){double t=k/48.0;if(rev)t=1-t;double u,v,h;local(fr,c.Value(c.FirstParameter()+(c.LastParameter()-c.FirstParameter())*t),u,v,h);L.push_back({u,v});}}loops.push_back(L);}polys.push_back(loops);}
 double fieldIntegral=0;{const int M=std::max(160,fit.nx*4);const double dx=fit.widthMm/M,dy=fit.heightMm/M;std::vector<std::vector<B>> bxs(M),bys(M);for(int i=0;i<M;i++)bxs[i]=atPhysical(fit.nx,-fit.widthMm/2+(i+.5)*dx,fit.widthMm,nullptr);for(int j=0;j<M;j++)bys[j]=atPhysical(fit.ny,-fit.heightMm/2+(j+.5)*dy,fit.heightMm,nullptr);
  for(int j=0;j<M;j++)for(int i=0;i<M;i++){const double h=valueAt(fit.deltas,fit.nx,bxs[i],bys[j]);if(h==0)continue;const gp_Pnt q=fr.at(-fit.widthMm/2+(i+.5)*dx,-fit.heightMm/2+(j+.5)*dy,0);bool in=false;const double qu=-fit.widthMm/2+(i+.5)*dx,qv=-fit.heightMm/2+(j+.5)*dy;(void)q;for(auto& loops:polys){bool odd=false;for(auto& L:loops)for(size_t a=0,b=L.size()-1;a<L.size();b=a++){if((L[a].second>qv)!=(L[b].second>qv)&&qu<(L[b].first-L[a].first)*(qv-L[a].second)/(L[b].second-L[a].second)+L[a].first)odd=!odd;}if(odd){in=true;break;}}if(in)fieldIntegral+=std::abs(h)*dx*dy;}}
 // GProp versus an independently integrated fitted field is already a complete check.
 // Triangulate only for the known high-knot trimmed-face disagreement case.
 const double relG=fieldIntegral>0?std::abs(delta-fieldIntegral)/fieldIntegral:0;
 const bool candidate=params.at("fit").value("deviationPolicy",std::string("strict"))=="candidate";
 const bool meshChecked=!candidate&&relG>.02;
 const double meshDelta=meshChecked?(meshVolume(result,.01)-meshVolume(input,.01))*fit.sign:0;
 // Two independent kernel measurements; each has a known weak case (GProp: curved trims on high-knot
 // surfaces; mesh: steep fields). Consistent when either agrees with the analytic field integral.
 const double relM=meshChecked&&fieldIntegral>0?std::abs(meshDelta-fieldIntegral)/fieldIntegral:INFINITY,relBest=std::min(relG,relM),material=relG<=relM?delta:meshDelta;
 if(!(delta>1e-7))fail("RELIEF_DESIGN_NO_CHANGE","没有可测量的材料变化");
 // Expected volume from the fitted field (independent check, midpoint rule on the field grid).
 if(!candidate&&fieldIntegral>0&&relBest>.05)fail("RELIEF_QUALITY_CHECK_FAILED","浮雕实体体积与拟合曲面积分不一致（>5%），拒绝发布结果",{{"meshDeltaMm3",meshDelta},{"fieldIntegralMm3",fieldIntegral}});
 stage("report");
 json report={{"kind","relief-design-fit-brep-1"},{"trim",trim},{"replacedFaceCount",targets.size()},{"boundaryEdges",boundaryEdges},{"boundaryEdgeKinds",std::vector<std::string>(edgeKinds.begin(),edgeKinds.end())},{"boundaryDeviationMm",boundaryDev},{"maxTrimEdgeToleranceMm",edgeTolMax},{"seam","none-inside-face; trimmed by host edges"+std::string(covered?"":" + analytic support outline")},
  {"mode",fit.sign>0?"emboss":"engrave"},{"quality",{{"status",relBest>.05?"candidate-volume-unverified":"volume-checked"},{"warnings",relBest>.05?json::array({"RELIEF_VOLUME_UNVERIFIED"}):json::array()},{"geometryValid",true},{"fieldIntegralMm3",fieldIntegral},{"meshChecked",meshChecked},{"meshDeltaMm3",meshChecked?json(meshDelta):json(nullptr)},{"gpropDeltaMm3",delta},{"meshVsFieldRel",relM},{"gpropVsFieldRel",relG},{"bestRel",relBest},{"consistent",fieldIntegral>0&&relBest<.02}}},{"addedMm3",fit.sign>0?material:0.0},{"removedMm3",fit.sign<0?material:0.0},{"materialMetric","kernel volume delta closest to the analytic field integral (GProp or triangulation)"},
  {"fit",{{"columns",fit.nx},{"rows",fit.ny},{"widthMm",fit.widthMm},{"heightMm",fit.heightMm},{"baselineMm",fit.baselineMm},{"controlDeltasMm",fit.deltas},{"controlDeltasF64LE",base64(f64bytes(fit.deltas))},{"lockedControlMask",fit.locked},{"controlDeltasSha256",sha256Hex(f64bytes(fit.deltas))},{"report",fit.report}}},
  {"timingsMs",{{"fit",fitMs},{"total",ms()},{"stages",stageMs}}}};
 return {result,report};
}
#ifdef WEBCAD_RELIEF_STEP
inline void writeStep(const TopoDS_Shape& shape,const std::string& path){
 Message::DefaultMessenger()->ChangePrinters().Clear();STEPControl_Writer w;Interface_Static::SetCVal("write.step.unit","MM");Interface_Static::SetCVal("write.step.schema","AP214IS");
 if(w.Transfer(shape,STEPControl_AsIs)!=IFSelect_RetDone)fail("STEP_EXPORT_FAILED","STEP 转换失败");
 const std::string partial=path+".partial";if(w.Write(partial.c_str())!=IFSelect_RetDone)fail("STEP_EXPORT_FAILED","STEP 写入失败");
 if(std::rename(partial.c_str(),path.c_str())!=0)fail("STEP_EXPORT_FAILED","STEP 原子发布失败");
}
#endif
// relief.source-convert-1: raw RGBA asset -> u16le grid (+ optional mm precision smoothing).
inline json sourceConvert(const std::string& rgbaPath,const json& params){
 std::ifstream f(rgbaPath,std::ios::binary);if(!f)fail("SOURCE_MISSING","RGBA 源数据缺失");std::vector<uint8_t> rgba((std::istreambuf_iterator<char>(f)),std::istreambuf_iterator<char>());
 const int w=params.at("width"),h=params.at("height");if(sha256Hex(rgba)!=params.at("sourceSha256").get<std::string>())fail("SOURCE_HASH_MISMATCH","RGBA 源哈希与请求不符");
 const auto began=std::chrono::steady_clock::now();Grid g=convertRgba(rgba,w,h,params.at("settings"));json precision=nullptr;
 if(params.contains("depthMm")){const double depth=params.at("depthMm"),p=params.value("machiningPrecisionMm",.05);if(!(depth>0&&depth<=20))fail("PARAM_RANGE_INVALID","depthMm 需要 0–20");if(!(p>=.01&&p<=.5))fail("PARAM_RANGE_INVALID","machiningPrecisionMm 须在 0.01–0.5 mm");
  std::vector<double> mm(g.values.size());for(size_t k=0;k<mm.size();k++)mm[k]=g.values[k]*depth;std::vector<uint8_t> act(mm.size(),1),fx(mm.size(),0);precision=applyMachiningPrecision(mm,act,fx,g.columns,g.rows,0,depth,p);for(size_t k=0;k<mm.size();k++)g.values[k]=mm[k]/depth;}
 return {{"ok",true},{"grid",encodeGrid(g)},{"precision",precision},{"timingsMs",{{"total",std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-began).count()}}}};
}
}}
