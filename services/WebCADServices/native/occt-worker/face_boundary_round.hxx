#pragma once
// Bounded rectangular face-rim operation. Side sections retain the requested R;
// corner patches are explicit freeform G1 patches, not spheres or all-direction R.
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Curve2d.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepGProp.hxx>
#include <BRepGProp_Face.hxx>
#include <BRepLib.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRep_Tool.hxx>
#include <GC_MakeArcOfCircle.hxx>
#include <Geom_BSplineSurface.hxx>
#include <GProp_GProps.hxx>
#include <TColgp_Array2OfPnt.hxx>
#include <TColStd_Array2OfReal.hxx>
#include <TColStd_Array1OfReal.hxx>
#include <TColStd_Array1OfInteger.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Ax2.hxx>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace webcad_face_round {
using Json=nlohmann::json;
struct Failure:std::runtime_error {std::string code;Failure(const std::string& c,const std::string& message):std::runtime_error(message),code(c){}};
struct Result {TopoDS_Shape shape;Json report;};
constexpr double tolerance=1e-6;
constexpr double pi=3.1415926535897932384626433832795;
inline void require(bool value,const char* message,const char* code="FACE_ROUND_UNSUPPORTED_GEOMETRY") {if(!value)throw Failure(code,message);}
inline TopTools_IndexedMapOfShape map(const TopoDS_Shape& s,TopAbs_ShapeEnum kind){TopTools_IndexedMapOfShape m;TopExp::MapShapes(s,kind,m);return m;}
inline double volume(const TopoDS_Shape& s){GProp_GProps p;BRepGProp::VolumeProperties(s,p);return p.Mass();}
inline double area(const TopoDS_Shape& s){GProp_GProps p;BRepGProp::SurfaceProperties(s,p);return p.Mass();}
inline bool close(double a,double b,double rel=1e-8){return std::abs(a-b)<=std::max(tolerance,std::max(std::abs(a),std::abs(b))*rel);}
inline bool inside(const TopoDS_Shape& s,const gp_Pnt& p){BRepClass3d_SolidClassifier c(s,p,1e-7);return c.State()==TopAbs_IN||c.State()==TopAbs_ON;}
inline void validSolid(const TopoDS_Shape& s){require(!s.IsNull()&&BRepCheck_Analyzer(s,true).IsValid()&&map(s,TopAbs_SOLID).Extent()==1&&volume(s)>0,"Face rim result is not one valid positive solid","FACE_ROUND_INVALID_RESULT");}
struct Frame {
 gp_Pnt origin;gp_Dir x,y,z;double width=0,depth=0,height=0,radius=0;int cylinderAxis=-1;bool lowSide=false;
 gp_Pnt point(double a,double b,double c)const{return origin.Translated(gp_Vec(x)*a+gp_Vec(y)*b+gp_Vec(z)*c);}
 std::array<double,3> local(const gp_Pnt& p)const{const gp_Vec v(origin,p);return {v.Dot(gp_Vec(x)),v.Dot(gp_Vec(y)),v.Dot(gp_Vec(z))};}
};
inline Json xyz(const gp_Pnt& p){return {p.X(),p.Y(),p.Z()};}
inline Json xyz(const gp_Dir& p){return {p.X(),p.Y(),p.Z()};}
inline Frame inspect(const TopoDS_Shape& source,const TopoDS_Face& requested,double radius) {
 require(std::isfinite(radius)&&radius>tolerance&&radius<=10000,"Requested radius must be finite and positive","FACE_ROUND_INVALID_RADIUS");
 validSolid(source);const auto fs=map(source,TopAbs_FACE);require(fs.Extent()==7,"This version requires six planar supports and one existing same-radius fillet");
 TopoDS_Face selected,cylinder;int planes=0,cylinders=0;
 for(int i=1;i<=fs.Extent();++i){const auto f=TopoDS::Face(fs(i));BRepAdaptor_Surface s(f,true);if(f.IsSame(requested))selected=f;if(s.GetType()==GeomAbs_Plane)++planes;else if(s.GetType()==GeomAbs_Cylinder){++cylinders;cylinder=f;}else require(false,"Only planar box supports and one analytic cylinder are supported");}
 require(!selected.IsNull()&&planes==6&&cylinders==1,"Selection must belong to this source with exactly one existing fillet");
 BRepAdaptor_Surface faceSurface(selected,true);require(faceSurface.GetType()==GeomAbs_Plane,"Selected boundary must be a true plane");
 const auto selectedEdges=map(selected,TopAbs_EDGE);require(selectedEdges.Extent()==4&&map(selected,TopAbs_WIRE).Extent()==1,"Selected face must have four straight edges and no holes");
 for(int i=1;i<=4;++i)require(BRepAdaptor_Curve(TopoDS::Edge(selectedEdges(i))).GetType()==GeomAbs_Line,"Selected face is not rectangular");
 const auto cylinderEdges=map(cylinder,TopAbs_EDGE);int common=0;for(int i=1;i<=4;++i)if(cylinderEdges.Contains(selectedEdges(i)))++common;
 require(common==1,"Selected plane must share exactly one tangent boundary with the existing fillet");
 Frame out;out.radius=radius;out.z=faceSurface.Plane().Axis().Direction();GProp_GProps selectedProps;BRepGProp::SurfaceProperties(selected,selectedProps);const auto center=selectedProps.CentreOfMass();
 const double probe=std::max(1e-5,std::min(.001,radius*.01));bool minus=inside(source,center.Translated(gp_Vec(out.z)*-probe)),plus=inside(source,center.Translated(gp_Vec(out.z)*probe));
 if(plus&&!minus){out.z.Reverse();std::swap(plus,minus);}require(minus&&!plus,"Selected plane outward normal is ambiguous");
 out.x=BRepAdaptor_Curve(TopoDS::Edge(selectedEdges(1))).Line().Direction();require(std::abs(out.x.Dot(out.z))<1e-9,"Selected edge is not in its plane");out.y=gp_Dir(gp_Vec(out.z).Crossed(gp_Vec(out.x)));
 const auto anchor=faceSurface.Plane().Location();const std::array<gp_Dir,3> axes{out.x,out.y,out.z};std::array<std::vector<double>,3> limits;
 for(int i=1;i<=fs.Extent();++i){BRepAdaptor_Surface s(TopoDS::Face(fs(i)),true);if(s.GetType()!=GeomAbs_Plane)continue;const auto p=s.Plane();int axis=-1;for(int a=0;a<3;++a)if(std::abs(p.Axis().Direction().Dot(axes[a]))>1-1e-9)axis=a;require(axis>=0,"Support planes are not mutually perpendicular");limits[axis].push_back(gp_Vec(anchor,p.Location()).Dot(gp_Vec(axes[axis])));}
 for(auto& values:limits){require(values.size()==2,"Expected exactly two opposite support planes per direction");std::sort(values.begin(),values.end());require(values[1]-values[0]>tolerance,"Support planes are coincident");}
 require(std::abs(limits[2][1])<tolerance,"Selected face must bound the source on its outward side");
 out.origin=anchor.Translated(gp_Vec(out.x)*limits[0][0]+gp_Vec(out.y)*limits[1][0]+gp_Vec(out.z)*limits[2][0]);out.width=limits[0][1]-limits[0][0];out.depth=limits[1][1]-limits[1][0];out.height=limits[2][1]-limits[2][0];
 require(out.width>4*radius+tolerance&&out.depth>4*radius+tolerance&&out.height>radius+tolerance,"Requested R leaves no supported rectangular rim; radius is not reduced","FACE_ROUND_INVALID_RADIUS");
 require(std::max({out.width,out.depth,out.height})<=200000,"Source dimensions exceed face rim budget");
 for(int i=1;i<=4;++i){const auto direction=BRepAdaptor_Curve(TopoDS::Edge(selectedEdges(i))).Line().Direction();require(std::abs(direction.Dot(out.x))>1-1e-9||std::abs(direction.Dot(out.y))>1-1e-9,"Face edges are not orthogonal rectangle sides");}
 BRepAdaptor_Surface cylindrical(cylinder,true);const auto c=cylindrical.Cylinder();require(std::abs(c.Radius()-radius)<=tolerance,"Existing fillet radius must equal the requested R; mixed radii are unsupported");
 if(std::abs(c.Axis().Direction().Dot(out.x))>1-1e-9)out.cylinderAxis=0;else if(std::abs(c.Axis().Direction().Dot(out.y))>1-1e-9)out.cylinderAxis=1;
 require(out.cylinderAxis>=0,"Existing cylinder must run along a selected rectangle side");const auto cp=out.local(c.Location());const int cross=1-out.cylinderAxis;const double crossSize=cross==0?out.width:out.depth;
 require(std::abs(cp[2]-(out.height-radius))<=tolerance,"Existing cylinder is not a convex top-rim R");out.lowSide=std::abs(cp[cross]-radius)<=tolerance;require(out.lowSide||std::abs(cp[cross]-(crossSize-radius))<=tolerance,"Existing cylinder center does not match a source support side");
 const double span=out.cylinderAxis==0?out.width:out.depth;const auto verts=map(cylinder,TopAbs_VERTEX);double lo=std::numeric_limits<double>::max(),hi=-lo;
 for(int i=1;i<=verts.Extent();++i){const auto v=out.local(BRep_Tool::Pnt(TopoDS::Vertex(verts(i))));lo=std::min(lo,v[out.cylinderAxis]);hi=std::max(hi,v[out.cylinderAxis]);}
 require(std::abs(lo)<tolerance&&std::abs(hi-span)<tolerance&&close(area(cylinder),pi*.5*radius*span),"Existing fillet must be one complete quarter-cylinder along the entire source side");
 const double lostArea=(1-pi/4)*radius*radius;require(close(volume(source),out.width*out.depth*out.height-lostArea*span),"Source material is not the supported box with one existing quarter-cylinder");
 require(close(selectedProps.Mass(),span*(crossSize-radius)),"Selected plane does not match the expected trimmed rectangle");
 for(int i=1;i<=fs.Extent();++i){const auto f=TopoDS::Face(fs(i));BRepAdaptor_Surface s(f,true);if(s.GetType()!=GeomAbs_Plane)continue;const auto local=out.local(s.Plane().Location());int ax=-1;for(int a=0;a<3;++a)if(std::abs(s.Plane().Axis().Direction().Dot(axes[a]))>1-1e-9)ax=a;double expected;
  if(ax==2)expected=out.width*out.depth-(std::abs(local[2]-out.height)<tolerance?radius*span:0);
  else if(ax==out.cylinderAxis)expected=crossSize*out.height-lostArea;
  else {const bool affected=out.lowSide?std::abs(local[ax])<tolerance:std::abs(local[ax]-crossSize)<tolerance;expected=span*(out.height-(affected?radius:0));}
  require(close(area(f),expected),"A planar support contains unrequested material changes");
 }
 const auto allVertices=map(source,TopAbs_VERTEX);for(int i=1;i<=allVertices.Extent();++i){const auto p=out.local(BRep_Tool::Pnt(TopoDS::Vertex(allVertices(i))));require(p[0]>=-tolerance&&p[0]<=out.width+tolerance&&p[1]>=-tolerance&&p[1]<=out.depth+tolerance&&p[2]>=-tolerance&&p[2]<=out.height+tolerance,"Source extends beyond verified supports");}
 return out;
}

inline Handle(Geom_BSplineSurface) surface(const std::vector<std::vector<gp_Pnt>>& grid,const std::vector<std::vector<double>>& weights,int du,int dv){
 const int nu=static_cast<int>(grid.size()),nv=static_cast<int>(grid[0].size());TColgp_Array2OfPnt p(1,nu,1,nv);TColStd_Array2OfReal w(1,nu,1,nv);for(int i=0;i<nu;++i)for(int j=0;j<nv;++j){p.SetValue(i+1,j+1,grid[i][j]);w.SetValue(i+1,j+1,weights[i][j]);}
 TColStd_Array1OfReal uk(1,2),vk(1,2);TColStd_Array1OfInteger um(1,2),vm(1,2);uk(1)=vk(1)=0;uk(2)=vk(2)=1;um(1)=um(2)=du+1;vm(1)=vm(2)=dv+1;return new Geom_BSplineSurface(p,w,uk,vk,um,vm,du,dv,false,false);
}
inline TopoDS_Shape difference(const TopoDS_Shape& a,const TopoDS_Shape& b){BRepAlgoAPI_Cut op;TopTools_ListOfShape args,tools;args.Append(a);tools.Append(b);op.SetArguments(args);op.SetTools(tools);op.SetNonDestructive(true);op.Build();require(op.IsDone()&&!op.HasErrors()&&!op.Shape().IsNull(),"Bounded face rim Boolean failed","FACE_ROUND_CONSTRUCTION_FAILED");return op.Shape();}
inline gp_Vec outwardNormal(const TopoDS_Shape& solid,const TopoDS_Edge& edge,const TopoDS_Face& face,double station,double probe){
 BRepAdaptor_Curve2d curve(edge,face);const auto uv=curve.Value(curve.FirstParameter()+station*(curve.LastParameter()-curve.FirstParameter()));gp_Pnt p;gp_Vec n;BRepGProp_Face(face,false).Normal(uv.X(),uv.Y(),p,n);require(n.Magnitude()>1e-12,"Regular corner seam has undefined normal","FACE_ROUND_INVALID_RESULT");n.Normalize();const bool plus=inside(solid,p.Translated(n*probe)),minus=inside(solid,p.Translated(n*-probe));require(plus!=minus,"Cannot certify corner seam outward normal","FACE_ROUND_INVALID_RESULT");if(plus)n.Reverse();return n;
}
inline Result run(const TopoDS_Shape& source,const TopoDS_Face& selected,double radius){
 const auto began=std::chrono::steady_clock::now();const auto f=inspect(source,selected,radius);const double w=f.width,d=f.depth,h=f.height,r=radius,z0=h-r;const std::array<double,3> ds{0,0,r},zs{z0,h,h},tw{1,std::sqrt(.5),1};
 std::vector<TopoDS_Face> generated;std::vector<Handle(Geom_BSplineSurface)> straight;
 for(int side=0;side<4;++side){std::vector<std::vector<gp_Pnt>> p;std::vector<std::vector<double>> weights;
  for(int i=0;i<3;++i){const double a=ds[i],z=zs[i];if(side==0)p.push_back({f.point(2*a,a,z),f.point(w-2*a,a,z)});if(side==1)p.push_back({f.point(w-a,2*a,z),f.point(w-a,d-2*a,z)});if(side==2)p.push_back({f.point(2*a,d-a,z),f.point(w-2*a,d-a,z)});if(side==3)p.push_back({f.point(a,2*a,z),f.point(a,d-2*a,z)});weights.push_back({tw[i],tw[i]});}
  const auto s=surface(p,weights,2,1);straight.push_back(s);BRepBuilderAPI_MakeFace face(s,1e-7);require(face.IsDone(),"Side R surface failed","FACE_ROUND_CONSTRUCTION_FAILED");generated.push_back(face.Face());
 }
 const std::array<std::array<double,2>,3> cv{{{1,2},{1,1},{2,1}}};
 for(int corner=0;corner<4;++corner){std::vector<std::vector<gp_Pnt>> p;std::vector<std::vector<double>> weights;const bool right=corner==1||corner==2,back=corner==2||corner==3;
  for(int i=0;i<3;++i){std::vector<gp_Pnt> row;std::vector<double> wr;for(int j=0;j<3;++j){const double x=ds[i]*cv[j][0],y=ds[i]*cv[j][1];row.push_back(f.point(right?w-x:x,back?d-y:y,zs[i]));wr.push_back(tw[i]*tw[j]);}p.push_back(row);weights.push_back(wr);}
  BRepBuilderAPI_MakeFace face(surface(p,weights,2,2),1e-7);require(face.IsDone(),"Corner patch failed","FACE_ROUND_CONSTRUCTION_FAILED");generated.push_back(face.Face());
 }
 BRepBuilderAPI_MakeWire top;const double a=2*r,s=r/std::sqrt(2.);const auto P=[&](double x,double y){return f.point(x,y,h);};
 const auto line=[&](const gp_Pnt& p,const gp_Pnt& q){BRepBuilderAPI_MakeEdge e(p,q);require(e.IsDone(),"Top boundary line failed","FACE_ROUND_CONSTRUCTION_FAILED");top.Add(e.Edge());};
 const auto arc=[&](const gp_Pnt& p,const gp_Pnt& m,const gp_Pnt& q){GC_MakeArcOfCircle c(p,m,q);require(c.IsDone(),"Top corner arc failed","FACE_ROUND_CONSTRUCTION_FAILED");top.Add(BRepBuilderAPI_MakeEdge(c.Value()).Edge());};
 line(P(a,r),P(w-a,r));arc(P(w-a,r),P(w-a+s,a-s),P(w-r,a));line(P(w-r,a),P(w-r,d-a));arc(P(w-r,d-a),P(w-a+s,d-a+s),P(w-a,d-r));line(P(w-a,d-r),P(a,d-r));arc(P(a,d-r),P(a-s,d-a+s),P(r,d-a));line(P(r,d-a),P(r,a));arc(P(r,a),P(a-s,a-s),P(a,r));require(top.IsDone(),"Top closed boundary failed","FACE_ROUND_CONSTRUCTION_FAILED");
 BRepBuilderAPI_MakeFace topFace(top.Wire());require(topFace.IsDone(),"Top face failed","FACE_ROUND_CONSTRUCTION_FAILED");generated.push_back(topFace.Face());
 const gp_Ax2 placement(f.origin,f.z,f.x);const auto lower=BRepPrimAPI_MakeBox(placement,w,d,z0).Shape();BRepBuilderAPI_Sewing sewing(1e-7);
 for(TopExp_Explorer ex(lower,TopAbs_FACE);ex.More();ex.Next()){const auto face=TopoDS::Face(ex.Current());BRepAdaptor_Surface ss(face);const auto n=ss.Plane().Axis().Direction();if(std::abs(n.Dot(f.z))>1-1e-9&&std::abs(f.local(ss.Plane().Location())[2]-z0)<tolerance)continue;sewing.Add(face);}
 for(const auto& face:generated)sewing.Add(face);sewing.Perform();require(sewing.NbFreeEdges()==0&&sewing.NbMultipleEdges()==0,"Corner shell did not close with shared edges","FACE_ROUND_CONSTRUCTION_FAILED");const auto shells=map(sewing.SewedShape(),TopAbs_SHELL);require(shells.Extent()==1,"Corner shell count invalid","FACE_ROUND_CONSTRUCTION_FAILED");auto envelope=BRepBuilderAPI_MakeSolid(TopoDS::Shell(shells(1))).Solid();require(BRepLib::OrientClosedSolid(envelope),"Corner solid orientation failed","FACE_ROUND_CONSTRUCTION_FAILED");validSolid(envelope);
 const auto cutter=difference(BRepPrimAPI_MakeBox(placement,w,d,h).Shape(),envelope);BRepBuilderAPI_Copy copy(source,true,false);const auto result=difference(copy.Shape(),cutter);validSolid(result);require(volume(result)<volume(source)&&close(volume(result),volume(envelope)),"Corner Boolean material mismatch","FACE_ROUND_INVALID_RESULT");
 // Certify the exact side-circle sections; corner surfaces have a separate contract.
 double maxRadiusError=0;for(int side=0;side<4;++side)for(double u:{0.,.1,.25,.5,.75,.9,1.}){const auto p=f.local(straight[side]->Value(u,.5));const double inset=side==0?p[1]:side==1?w-p[0]:side==2?d-p[1]:p[0];maxRadiusError=std::max(maxRadiusError,std::abs(std::hypot(inset-r,p[2]-z0)-r));}require(maxRadiusError<1e-7,"Requested R was not retained","FACE_ROUND_INVALID_RESULT");
 Json probes=Json::array();const auto material=[&](double x,double y,double z,bool expected,const char* role){const auto p=f.point(x,y,z);const bool actual=inside(result,p);probes.push_back({{"point",xyz(p)},{"expected",expected},{"actual",actual},{"role",role}});require(actual==expected,"Corner material acceptance failed","FACE_ROUND_INVALID_RESULT");};const double eps=std::min(r*.05,z0*.05);
 for(double z:{eps,z0*.5,z0-eps})for(const auto& xy:std::array<std::array<double,2>,4>{{{eps,eps},{w-eps,eps},{w-eps,d-eps},{eps,d-eps}}})material(xy[0],xy[1],z,true,"lower-sharp-rib-retained");
 for(int side=0;side<4;++side){const auto sample=[&](double inset,double z,bool keep){if(side==0)material(w*.5,inset,z,keep,"side-R");if(side==1)material(w-inset,d*.5,z,keep,"side-R");if(side==2)material(w*.5,d-inset,z,keep,"side-R");if(side==3)material(inset,d*.5,z,keep,"side-R");};sample(.05*r,h-.05*r,false);sample(.5*r,h-.5*r,true);}
 material(w*.5,d*.5,h-.05*r,true,"top-retained");for(int c=0;c<4;++c){const bool right=c==1||c==2,back=c==2||c==3;material(right?w-.75*r:.75*r,back?d-.75*r:.75*r,h-.05*r,false,"local-corner-removal");material(right?w-.75*r:.75*r,back?d-1.35*r:1.35*r,h-.05*r,true,"local-corner-retained");}
 const auto resultFaces=map(result,TopAbs_FACE),resultEdges=map(result,TopAbs_EDGE);Json seams=Json::array();double maxAngle=0;std::vector<TopTools_IndexedMapOfShape> faceEdges;for(int i=1;i<=resultFaces.Extent();++i)faceEdges.push_back(map(resultFaces(i),TopAbs_EDGE));
 for(int e=1;e<=resultEdges.Extent();++e){const auto edge=TopoDS::Edge(resultEdges(e));if(BRep_Tool::Degenerated(edge))continue;std::vector<int> adjacent;for(int i=1;i<=resultFaces.Extent();++i)if(faceEdges[i-1].Contains(edge))adjacent.push_back(i);require(adjacent.size()==2,"Result boundary is not manifold","FACE_ROUND_INVALID_RESULT");const auto fa=TopoDS::Face(resultFaces(adjacent[0])),fb=TopoDS::Face(resultFaces(adjacent[1]));if(BRepAdaptor_Surface(fa).GetType()==GeomAbs_Plane&&BRepAdaptor_Surface(fb).GetType()==GeomAbs_Plane)continue;double angle=0;for(double st:{.01,.1,.25,.5,.75,.9,.99}){const auto n1=outwardNormal(result,edge,fa,st,std::min(1e-4,r*.001)),n2=outwardNormal(result,edge,fb,st,std::min(1e-4,r*.001));angle=std::max(angle,std::acos(std::clamp(n1.Dot(n2),-1.,1.))*180/pi);}maxAngle=std::max(maxAngle,angle);seams.push_back({{"localEdge",e-1},{"maxOutwardNormalAngleDeg",angle}});}
 require(maxAngle<.1,"Corner regular seams are not G1","FACE_ROUND_INVALID_RESULT");
 const auto resultVertices=map(result,TopAbs_VERTEX);int terminations=0;Json terminationPoints=Json::array();
 for(const auto& xy:std::array<std::array<double,2>,4>{{{0,0},{w,0},{w,d},{0,d}}}){const auto expected=f.point(xy[0],xy[1],z0);int matched=0;TopoDS_Vertex vertex;
  for(int i=1;i<=resultVertices.Extent();++i)if(BRep_Tool::Pnt(TopoDS::Vertex(resultVertices(i))).Distance(expected)<tolerance){vertex=TopoDS::Vertex(resultVertices(i));++matched;}
  require(matched==1,"A sharp-rib termination is missing or ambiguous","FACE_ROUND_INVALID_RESULT");int planar=0,curved=0;
  for(int i=1;i<=resultFaces.Extent();++i)if(map(resultFaces(i),TopAbs_VERTEX).Contains(vertex)){if(BRepAdaptor_Surface(TopoDS::Face(resultFaces(i))).GetType()==GeomAbs_Plane)++planar;else ++curved;}
  require(planar==2&&curved>=3,"A sharp-rib termination has unexpected topology","FACE_ROUND_INVALID_RESULT");++terminations;terminationPoints.push_back(xyz(expected));
 }
 Json report={{"kind","rectangular-planar-rim-corner-patch-v1"},{"requestedRadiusMm",r},{"attemptCount",1},{"scope","selected-planar-rectangular-boundary"},{"sourceBoundary",{{"origin",xyz(f.origin)},{"x",xyz(f.x)},{"y",xyz(f.y)},{"normal",xyz(f.z)},{"widthMm",w},{"depthMm",d},{"heightMm",h},{"existingFilletCount",1},{"existingRadiusMm",r}}},{"materialScope",{{"normalCoordinateMinMm",z0},{"normalCoordinateMaxMm",h},{"belowBandPreserved",true},{"materialProbes",probes}}},{"sideSections",{{"requestedRadiusMm",r},{"maxRadiusErrorMm",maxRadiusError},{"sampleCount",28}}},{"regularSeams",{{"maxOutwardNormalAngleDeg",maxAngle},{"sampleCountPerEdge",7},{"edges",seams}}},{"cornerSemantics",{{"kind","exact-rational-freeform-G1-patches"},{"constantRadiusInEveryDirection",false},{"isolatedSharpTerminationVertices",terminations},{"terminationWorldPoints",terminationPoints},{"terminationVertexUniqueNormalClaimed",false}}},{"validation",{{"valid",true},{"solidCount",1},{"sourceVolumeMm3",volume(source)},{"resultVolumeMm3",volume(result)}}},{"elapsedMs",std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-began).count()}};return {result,report};
}
} // namespace webcad_face_round
