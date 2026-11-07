// Standalone evaluator. Reads actual STEP bytes; does not call the WebCAD page or Services.
// Shares the OpenCASCADE algorithm family, not an independent CAD algorithm implementation.
#define _USE_MATH_DEFINES
#include <cmath>
#include <STEPControl_Reader.hxx>
#include <STEPControl_Writer.hxx>
#include <STEPControl_StepModelType.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepBndLib.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <GC_MakeArcOfCircle.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <GProp_GProps.hxx>
#include <Bnd_Box.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Shape.hxx>
#include <Standard_Version.hxx>
#include <Standard_Failure.hxx>
#include <TColStd_SequenceOfAsciiString.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>
#include <gp_Ax2.hxx>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <array>
#include <cmath>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
using json=nlohmann::json;
constexpr double pi=3.1415926535897932384626433832795;
constexpr double linearTolerance=.01;
constexpr double booleanVolumeTolerance=1e-5;
static bool nearValue(double a,double b,double t=linearTolerance){return std::isfinite(a)&&std::abs(a-b)<=t;}
static double volume(const TopoDS_Shape& s){if(s.IsNull())return 0;GProp_GProps p;BRepGProp::VolumeProperties(s,p);return std::abs(p.Mass());}
static json bounds(const TopoDS_Shape& s){Bnd_Box b;BRepBndLib::AddOptimal(s,b,false,false);double x0,y0,z0,x1,y1,z1;b.Get(x0,y0,z0,x1,y1,z1);return {{"minX",x0},{"minY",y0},{"minZ",z0},{"maxX",x1},{"maxY",y1},{"maxZ",z1}};}
static TopoDS_Shape cut(const TopoDS_Shape& a,const TopoDS_Shape& b){BRepAlgoAPI_Cut op(a,b);op.Build();if(!op.IsDone()||op.HasErrors())throw std::runtime_error("BOOLEAN_REFERENCE_CHECK_FAILED");return op.Shape();}
static TopoDS_Shape reference(const std::string& id,const std::string& variant){
 if(variant!="reference"&&!((id=="B01"&&(variant=="wrong-size"||variant=="wrong-hole"||variant=="blind-hole"))||(id=="B02"&&(variant=="wrong-size"||variant=="wrong-hole"))||(id=="B03"&&variant=="wrong-radius")))throw std::runtime_error("CASE_VARIANT_NOT_IMPLEMENTED");
 if(id=="B01"){
  const double width=variant=="wrong-size"?41:40,radius=variant=="wrong-hole"?2.5:2;
  TopoDS_Shape stock=BRepPrimAPI_MakeBox(gp_Pnt(-20,-15,0),width,30,4).Shape();
  for(double x:{-12.,12.}){const bool blind=variant=="blind-hole";auto drill=BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x,0,blind?2:0),gp_Dir(0,0,1)),radius,blind?2:4).Shape();stock=cut(stock,drill);}
  return stock;
 }
 if(id=="B02")return cut(BRepPrimAPI_MakeCylinder(variant=="wrong-size"?6.5:6,20).Shape(),BRepPrimAPI_MakeCylinder(variant=="wrong-hole"?3:4,20).Shape());
 if(id=="B03"){
  const double r=variant=="wrong-radius"?2:1,a=15-r,b=10-r,k=std::sqrt(.5);
  BRepBuilderAPI_MakeWire wire;
  const auto line=[&](gp_Pnt p,gp_Pnt q){wire.Add(BRepBuilderAPI_MakeEdge(p,q).Edge());};
  const auto arc=[&](gp_Pnt p,gp_Pnt m,gp_Pnt q){wire.Add(BRepBuilderAPI_MakeEdge(GC_MakeArcOfCircle(p,m,q).Value()).Edge());};
  line({-a,-10,0},{a,-10,0});arc({a,-10,0},{a+r*k,-b-r*k,0},{15,-b,0});
  line({15,-b,0},{15,b,0});arc({15,b,0},{a+r*k,b+r*k,0},{a,10,0});
  line({a,10,0},{-a,10,0});arc({-a,10,0},{-a-r*k,b+r*k,0},{-15,b,0});
  line({-15,b,0},{-15,-b,0});arc({-15,-b,0},{-a-r*k,-b-r*k,0},{-a,-10,0});
  return BRepPrimAPI_MakePrism(BRepBuilderAPI_MakeFace(wire.Wire()).Face(),gp_Vec(0,0,5)).Shape();
 }
 throw std::runtime_error("CASE_NOT_IMPLEMENTED");
}
static json check(bool pass,json evidence){return {{"checkerId","native-occt-step-1"},{"pass",pass},{"evidence",evidence}};}
static json materialSamples(const TopoDS_Shape& solid,const std::vector<gp_Pnt>& points,TopAbs_State expected){
 json samples=json::array();bool all=true;
 for(const auto& point:points){BRepClass3d_SolidClassifier classifier(solid,point,1e-7);const auto state=classifier.State();all=all&&state==expected;samples.push_back({{"point",{point.X(),point.Y(),point.Z()}},{"classification",state==TopAbs_IN?"inside":state==TopAbs_OUT?"outside":state==TopAbs_ON?"boundary":"unknown"}});}
 return {{"pass",all},{"samples",samples}};
}
static json cylinders(const TopoDS_Shape& shape){
 json result=json::array();
 for(TopExp_Explorer e(shape,TopAbs_FACE);e.More();e.Next()){
  const auto face=TopoDS::Face(e.Current());BRepAdaptor_Surface s(face,true);if(s.GetType()!=GeomAbs_Cylinder)continue;
  const auto c=s.Cylinder();const auto axis=c.Axis();const auto p=axis.Location();const auto d=axis.Direction();
  result.push_back({{"x",p.X()},{"y",p.Y()},{"radius",c.Radius()},{"axis",{d.X(),d.Y(),d.Z()}},{"vertical",std::abs(d.Z())>1-1e-8},{"bounds",bounds(face)}});
 }
 return result;
}
static json inspect(const TopoDS_Shape& shape,const std::string& id){
 if(shape.IsNull())throw std::runtime_error("EMPTY_STEP_SHAPE");
 TopTools_IndexedMapOfShape solids,shells;TopExp::MapShapes(shape,TopAbs_SOLID,solids);TopExp::MapShapes(shape,TopAbs_SHELL,shells);
 const bool valid=BRepCheck_Analyzer(shape,true).IsValid();
 json geometry={{"reader",{{"independent",true},{"source","standalone STEP reader plus independent reference construction"},{"engine","OpenCASCADE"},{"version",OCC_VERSION_COMPLETE},{"sharedKernelFamily",true},{"algorithmIndependence",false}}},{"brepValid",valid},{"targetType",solids.Extent()?"solid":"surface"},{"units","mm"},{"solidCount",solids.Extent()},{"shellCount",shells.Extent()},{"bounds",bounds(shape)},{"volume",volume(shape)},{"checks",json::object()}};
 if(!valid||solids.Extent()!=1)return geometry;
 const auto solid=solids.FindKey(1),expected=reference(id,"reference");
 const double missing=volume(cut(expected,solid)),extra=volume(cut(solid,expected));
 const bool equivalent=missing<=booleanVolumeTolerance&&extra<=booleanVolumeTolerance;
 geometry["referenceDifference"]={{"missingMaterialMm3",missing},{"extraMaterialMm3",extra},{"toleranceMm3",booleanVolumeTolerance},{"withinTolerance",equivalent}};
 const auto cs=cylinders(solid);geometry["cylinders"]=cs;
 if(id=="B01"){
  json holes=json::array();
  for(const auto& c:cs){
   if(!c.at("vertical").get<bool>())continue;
   bool duplicate=false;
   for(auto& hole:holes)if(nearValue(hole.at("x"),c.at("x"),1e-7)&&nearValue(hole.at("y"),c.at("y"),1e-7)&&nearValue(hole.at("diameter"),2*c.at("radius").get<double>(),1e-7)){
    hole["minZ"]=std::min(hole.at("minZ").get<double>(),c.at("bounds").at("minZ").get<double>());hole["maxZ"]=std::max(hole.at("maxZ").get<double>(),c.at("bounds").at("maxZ").get<double>());duplicate=true;break;
   }
   if(!duplicate)holes.push_back({{"x",c.at("x")},{"y",c.at("y")},{"diameter",2*c.at("radius").get<double>()},{"minZ",c.at("bounds").at("minZ")},{"maxZ",c.at("bounds").at("maxZ")}});
  }
  geometry["holes"]=holes;
  const auto voids=materialSamples(solid,{{-12,0,.5},{-12,0,2},{-12,0,3.5},{12,0,.5},{12,0,2},{12,0,3.5}},TopAbs_OUT);
  const auto kept=materialSamples(solid,{{0,0,2},{-19,-14,2},{19,14,2}},TopAbs_IN);
  geometry["checks"]["through"]=check(equivalent&&voids.at("pass").get<bool>(),{{"voidSamples",voids},{"referenceDifference",geometry["referenceDifference"]}});
  geometry["checks"]["retainedMaterial"]=check(equivalent&&kept.at("pass").get<bool>(),{{"materialSamples",kept},{"referenceDifference",geometry["referenceDifference"]}});
 }else if(id=="B02"){
  bool radii=false,coaxial=true;int inner=0,outer=0;
  for(const auto& c:cs){if(nearValue(c.at("radius"),4))++inner;if(nearValue(c.at("radius"),6))++outer;coaxial=coaxial&&c.at("vertical").get<bool>()&&nearValue(c.at("x"),0)&&nearValue(c.at("y"),0);}
  radii=inner>0&&outer>0&&cs.size()==static_cast<std::size_t>(inner+outer);
  geometry["checks"]["diameters"]=check(radii,{{"cylinders",cs}});geometry["checks"]["coaxial"]=check(coaxial&&!cs.empty(),{{"cylinders",cs}});
  geometry["checks"]["height"]=check(nearValue(geometry["bounds"]["minZ"],0)&&nearValue(geometry["bounds"]["maxZ"],20),geometry["bounds"]);
  const auto bore=materialSamples(solid,{{0,0,.1},{0,0,5},{0,0,10},{0,0,19.9}},TopAbs_OUT);
  geometry["checks"]["through"]=check(equivalent&&bore.at("pass").get<bool>(),{{"boreSamples",bore},{"referenceDifference",geometry["referenceDifference"]}});
 }else if(id=="B03"){
  bool radius=cs.size()==4,vertical=radius;
  for(const auto& c:cs){radius=radius&&nearValue(c.at("radius"),1);vertical=vertical&&c.at("vertical").get<bool>()&&nearValue(std::abs(c.at("x").get<double>()),14)&&nearValue(std::abs(c.at("y").get<double>()),9);}
  geometry["checks"]["radius"]=check(radius,{{"cylinders",cs}});geometry["checks"]["edgeScope"]=check(vertical&&equivalent,{{"cylinders",cs},{"referenceDifference",geometry["referenceDifference"]}});
  geometry["checks"]["thickness"]=check(nearValue(geometry["bounds"]["minZ"],0)&&nearValue(geometry["bounds"]["maxZ"],5),geometry["bounds"]);
  // Undo is a live application assertion, never inferred from STEP geometry.
 }
 return geometry;
}
int main(int argc,char** argv){
 json report;std::ostringstream vendor;auto* original=std::cout.rdbuf(vendor.rdbuf());
 int exitCode=0;
 try{
  std::map<std::string,std::string> args;
  for(int i=1;i<argc;i+=2){if(i+1>=argc)throw std::runtime_error("KEY_VALUE_ARGUMENTS_REQUIRED");const std::string key=argv[i];if(key!="--case"&&key!="--input"&&key!="--write-reference"&&key!="--variant")throw std::runtime_error("UNKNOWN_ARGUMENT");if(args.count(key))throw std::runtime_error("DUPLICATE_ARGUMENT");args[key]=argv[i+1];}
  const auto id=args.at("--case");if(id!="B01"&&id!="B02"&&id!="B03")throw std::runtime_error("CASE_NOT_IMPLEMENTED");
  const auto variant=args.count("--variant")?args.at("--variant"):"reference";
  if(variant!="reference"&&variant!="wrong-size"&&variant!="wrong-hole"&&variant!="blind-hole"&&variant!="wrong-radius")throw std::runtime_error("VARIANT_NOT_IMPLEMENTED");
  if(variant!="reference"&&!args.count("--write-reference"))throw std::runtime_error("NEGATIVE_VARIANT_REQUIRES_EXPLICIT_OUTPUT");
  if(args.count("--write-reference")){
   std::ifstream existing(args.at("--write-reference"),std::ios::binary);if(existing.good())throw std::runtime_error("REFERENCE_OUTPUT_ALREADY_EXISTS");
   const auto shape=reference(id,variant);if(!BRepCheck_Analyzer(shape,true).IsValid())throw std::runtime_error("INVALID_REFERENCE_BREP");
   STEPControl_Writer writer;if(writer.Transfer(shape,STEPControl_AsIs)!=IFSelect_RetDone||writer.Write(args.at("--write-reference").c_str())!=IFSelect_RetDone)throw std::runtime_error("REFERENCE_STEP_WRITE_FAILED");
   report={{"recordType","REFERENCE_OR_NEGATIVE_FIXTURE"},{"caseId",id},{"variant",variant},{"geometry",inspect(shape,id)}};
  }
  if(args.count("--input")){
   std::ifstream input(args.at("--input"),std::ios::binary|std::ios::ate);if(!input||input.tellg()<=0||input.tellg()>128*1024*1024)throw std::runtime_error("STEP_INPUT_MISSING_OR_OVERSIZED");
   STEPControl_Reader reader;if(reader.ReadFile(args.at("--input").c_str())!=IFSelect_RetDone)throw std::runtime_error("STEP_PARSE_FAILED");
   TColStd_SequenceOfAsciiString length,angle,solidAngle;reader.FileUnits(length,angle,solidAngle);reader.SetSystemLengthUnit(1.0);
   if(reader.TransferRoots()<1)throw std::runtime_error("STEP_TRANSFER_FAILED");
   json units=json::array();for(int i=1;i<=length.Length();++i)units.push_back(length.Value(i).ToCString());
   report={{"recordType","INDEPENDENT_STEP_GEOMETRY_OBSERVATION"},{"caseId",id},{"sourceLengthUnits",units},{"normalizedLengthUnit","mm"},{"geometry",inspect(reader.OneShape(),id)}};
  }else if(!args.count("--write-reference"))throw std::runtime_error("STEP_INPUT_OR_REFERENCE_OUTPUT_REQUIRED");
 }catch(const Standard_Failure&){report={{"status","ERROR"},{"error","OCCT_OPERATION_FAILED"}};exitCode=2;}
 catch(const std::exception& e){report={{"status","ERROR"},{"error",e.what()}};exitCode=2;}
 std::cout.rdbuf(original);std::cout<<report.dump()<<std::endl;return exitCode;
}
