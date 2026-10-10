#pragma once
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepAlgoAPI_Fuse.hxx>
#include <BRepLib.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <GC_MakeArcOfCircle.hxx>
#include <ShapeFix_Face.hxx>
#include <TopoDS.hxx>
#include <TopTools_ListOfShape.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <functional>

// Internal, bounded compiled-contour plan. No executable scripts or numeric
// topology indices. Both kernels consume the same explicit line/arc primitives.
static gp_Pnt planPoint(const json& value) {
 if(!value.is_array()||value.size()!=3)throw std::runtime_error("Expected a world point");
 double v[3];for(int i=0;i<3;i++){v[i]=value.at(i).get<double>();if(!std::isfinite(v[i])||std::abs(v[i])>100000)throw std::runtime_error("Invalid world coordinate");}
 return gp_Pnt(v[0],v[1],v[2]);
}
static TopoDS_Wire planWire(const json& segments) {
 if(!segments.is_array()||segments.size()<3||segments.size()>64000)throw std::runtime_error("Invalid contour plan size");
 BRepBuilderAPI_MakeWire wire;
 for(const auto& segment:segments){
  keys(segment,{"type","start","mid","end"});
  const auto start=planPoint(segment.at("start")),end=planPoint(segment.at("end"));
  if(segment.at("type")=="line"){BRepBuilderAPI_MakeEdge edge(start,end);if(!edge.IsDone())throw std::runtime_error("Line failed");wire.Add(edge.Edge());}
  else if(segment.at("type")=="arc"){GC_MakeArcOfCircle arc(start,planPoint(segment.at("mid")),end);if(!arc.IsDone())throw std::runtime_error("Arc failed");BRepBuilderAPI_MakeEdge edge(arc.Value());if(!edge.IsDone())throw std::runtime_error("Arc edge failed");wire.Add(edge.Edge());}
  else throw std::runtime_error("Unknown contour primitive");
 }
 if(!wire.IsDone())throw std::runtime_error("Contour wire failed");
 const auto result=wire.Wire();if(!result.Closed()||!BRepCheck_Analyzer(result,true).IsValid())throw std::runtime_error("Contour is not a valid closed wire");return result;
}
static TopoDS_Shape planRead(const std::string& path) {
 std::ifstream file(path,std::ios::binary|std::ios::ate);if(!file||file.tellg()>20*1024*1024)throw std::runtime_error("Plan BRep exceeds budget");file.seekg(0);TopoDS_Shape shape;BRep_Builder builder;BRepTools::Read(shape,file,builder);if(shape.IsNull()||!BRepCheck_Analyzer(shape,true).IsValid())throw std::runtime_error("Plan BRep invalid");return shape;
}
template<class Operation> static TopoDS_Shape planBoolean(const TopoDS_Shape& a,const TopoDS_Shape& b) {
 Operation operation;TopTools_ListOfShape args,tools;args.Append(a);tools.Append(b);operation.SetArguments(args);operation.SetTools(tools);operation.SetFuzzyValue(1e-7);operation.SetNonDestructive(true);operation.Build();if(operation.HasErrors())throw std::runtime_error("Explicit relief boolean failed");const auto result=operation.Shape();if(result.IsNull()||!BRepCheck_Analyzer(result,true).IsValid())throw std::runtime_error("Relief boolean invalid");return result;
}
static TopoDS_Shape planPrism(const TopoDS_Face& face,const gp_Vec& vector) {
 BRepPrimAPI_MakePrism prism(face,vector,true);if(!prism.IsDone())throw std::runtime_error("Relief prism failed");auto result=prism.Shape();int count=0;for(TopExp_Explorer ex(result,TopAbs_SOLID);ex.More();ex.Next()){auto solid=TopoDS::Solid(ex.Current());if(!BRepLib::OrientClosedSolid(solid))throw std::runtime_error("Prism orientation failed");count++;}if(count!=1||!BRepCheck_Analyzer(result,true).IsValid())throw std::runtime_error("Relief prism must be valid single solid");return result;
}
static TopoDS_Shape planFusePieces(const TopoDS_Shape& source,const TopoDS_Shape& pieces) {
 BRepAlgoAPI_Fuse operation;TopTools_ListOfShape args,tools;args.Append(source);for(TopExp_Explorer ex(pieces,TopAbs_SOLID);ex.More();ex.Next())tools.Append(ex.Current());operation.SetArguments(args);operation.SetTools(tools);operation.SetFuzzyValue(1e-7);operation.SetNonDestructive(true);operation.Build();if(operation.HasErrors())throw std::runtime_error("Compiled members exact union failed");const auto result=operation.Shape();if(result.IsNull()||!BRepCheck_Analyzer(result,true).IsValid())throw std::runtime_error("Compiled members union invalid");return result;
}
static const char* supportState(TopAbs_State state) {
 switch(state){case TopAbs_IN:return "IN";case TopAbs_OUT:return "OUT";case TopAbs_ON:return "ON";default:return "UNKNOWN";}
}
// Keep the original geometric predicate and tolerances. Samples contain no
// topology indices and are diagnostics only; uniqueness uses every source face.
static TopoDS_Shape bindSupport(const TopoDS_Shape& source,const json& intent,json& diagnostic) {
 const auto began=std::chrono::steady_clock::now();
 diagnostic={{"version","support-binding-1"},{"status","validating-intent"},{"failureReason","invalid-intent"},{"numericIndicesTransferred",false},
  {"sampleLimit",16},{"samples",json::array()},{"truncated",false},{"counts",{{"sourceFaces",0},{"cylinderFaces",0},{"geometricCandidates",0},{"trimmedDistanceChecks",0},{"matchCount",0}}},
  {"rejections",{{"notCylinder",0},{"radiusMismatch",0},{"axisMismatch",0},{"distanceUnavailable",0},{"outsideTrimmedDomain",0}}},
  {"tolerances",{{"radiusMm",1e-7},{"axisDotError",1e-9},{"trimmedDistanceMm",1e-7},{"normalProbeMm",.001},{"classifierMm",1e-7}}}};
 const auto finish=[&](const char* status,const char* reason){diagnostic["status"]=status;diagnostic["failureReason"]=reason;diagnostic["elapsedMs"]=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-began).count();};
 keys(intent,{"kind","radiusMm","point","axis","normal"});if(intent.at("kind")!="outer-cylinder")throw std::runtime_error("Unsupported support intent");
 const auto point=planPoint(intent.at("point")),axisPoint=planPoint(intent.at("axis")),normalPoint=planPoint(intent.at("normal"));
 const gp_Vec axis(axisPoint.X(),axisPoint.Y(),axisPoint.Z()),normal(normalPoint.X(),normalPoint.Y(),normalPoint.Z());const double radius=intent.at("radiusMm").get<double>();
 if(!std::isfinite(radius)||radius<1||radius>10000||std::abs(axis.Magnitude()-1)>1e-9||std::abs(normal.Magnitude()-1)>1e-9)throw std::runtime_error("Invalid geometric support intent");
 diagnostic["intent"]=intent;diagnostic["status"]="matching";diagnostic["failureReason"]="native-query-failed";
 auto& counts=diagnostic["counts"];auto& rejections=diagnostic["rejections"];auto& samples=diagnostic["samples"];
 const auto increment=[](json& value){value=value.get<int>()+1;};
 TopoDS_Face selected;const auto vertex=BRepBuilderAPI_MakeVertex(point).Vertex();
 for(TopExp_Explorer ex(source,TopAbs_FACE);ex.More();ex.Next()){
  increment(counts["sourceFaces"]);const auto face=TopoDS::Face(ex.Current());BRepAdaptor_Surface surface(face,true);
  if(surface.GetType()!=GeomAbs_Cylinder){increment(rejections["notCylinder"]);continue;}
  increment(counts["cylinderFaces"]);const auto cylinder=surface.Cylinder();const double radiusError=std::abs(cylinder.Radius()-radius),axisDot=std::abs(gp_Vec(cylinder.Axis().Direction()).Dot(axis));
  json sample={{"radiusMm",cylinder.Radius()},{"radiusErrorMm",radiusError},{"axisDotAbs",axisDot}};const char* reason;
  if(radiusError>1e-7){reason="radiusMismatch";increment(rejections[reason]);}
  else if(std::abs(axisDot-1)>1e-9){reason="axisMismatch";increment(rejections[reason]);}
  else{
   increment(counts["geometricCandidates"]);increment(counts["trimmedDistanceChecks"]);BRepExtrema_DistShapeShape distance(face,vertex);
   if(!distance.IsDone()){reason="distanceUnavailable";increment(rejections[reason]);}
   else{sample["trimmedDistanceMm"]=distance.Value();if(distance.Value()<1e-7){reason="matched";increment(counts["matchCount"]);selected=face;}
    else{reason="outsideTrimmedDomain";increment(rejections[reason]);}}
  }
  sample["reason"]=reason;if(samples.size()<16)samples.push_back(sample);else diagnostic["truncated"]=true;
 }
 const int matches=counts["matchCount"].get<int>();
 if(matches!=1){finish("rejected",matches==0?"no-match":"ambiguous");throw std::runtime_error("Geometric support intent must match exactly one trimmed source face");}
 TopoDS_Solid solid;for(TopExp_Explorer ex(source,TopAbs_SOLID);ex.More();ex.Next())solid=TopoDS::Solid(ex.Current());
 BRepClass3d_SolidClassifier inside(solid,point.Translated(normal*(-.001)),1e-7),outside(solid,point.Translated(normal*.001),1e-7);
 diagnostic["normalProbe"]={{"minusNormalState",supportState(inside.State())},{"plusNormalState",supportState(outside.State())}};
 if(inside.State()!=TopAbs_IN||outside.State()!=TopAbs_OUT){finish("rejected","normal-not-outward");throw std::runtime_error("Support normal is not outward");}
 BRep_Builder builder;TopoDS_Compound boundary;builder.MakeCompound(boundary);for(TopExp_Explorer ex(selected,TopAbs_EDGE);ex.More();ex.Next())builder.Add(boundary,ex.Current());
 finish("bound","");return boundary;
}
static TopoDS_Shape runReliefPlan(const TopoDS_Shape& source,const json& params,const std::string& strategy,json& stages,std::string& stage,const std::function<void()>& progress,bool strokeSemantics,json& supportBinding) {
 stage="relief-plan";keys(params,{"layers","supportIntent"});const auto& layers=params.at("layers");if(!layers.is_array()||layers.empty()||layers.size()>32)throw std::runtime_error("Invalid relief layer plan");
 if(strategy!="faceWithHolesExtrude"&&strategy!="cutHoleSolids")throw std::runtime_error("Explicit mask strategy required");
 TopoDS_Shape selectedBoundary;
 if(params.contains("supportIntent")){
  stage="support-binding";progress();selectedBoundary=bindSupport(source,params.at("supportIntent"),supportBinding);
  stages.push_back({{"stage","support-binding"},{"status","bound"},{"matchCount",supportBinding.at("counts").at("matchCount")},{"elapsedMs",supportBinding.at("elapsedMs")}});
 }
 stage="relief-plan";
 auto current=source;
 for(size_t i=0;i<layers.size();i++){
  const auto& layer=layers[i];keys(layer,{"toolPath","boundaryPath","normal","spanMm","regions","memberLayerIds","cacheReadPath","checkpointPath","mode"});const std::string mode=layer.value("mode",std::string("emboss"));if(mode!="emboss"&&mode!="engrave"||layer.contains("mode")&&!strokeSemantics)throw std::runtime_error("Layer mode/semantic mismatch");
  if(layer.contains("cacheReadPath")){
   stage="relief-layer-"+std::to_string(i+1)+"-cache";progress();if(std::ifstream("cancel.flag").good())throw std::runtime_error("Cooperative cancellation requested");
   current=planRead(layer.at("cacheReadPath"));const auto validation=measure(current);
   stages.push_back({{"layer",i+1},{"cacheHit",true},{"maskStrategy",strategy},{"regions",layer.at("regions").size()},{"maskMs",0},{"fuseMs",0},{"validation",validation},{"memberLayerIds",layer.at("memberLayerIds")}});continue;
  }
  stage="relief-layer-"+std::to_string(i+1)+"-source-geometry";
  const auto normal=planPoint(layer.at("normal"));gp_Vec direction(normal.X(),normal.Y(),normal.Z());const double span=layer.at("spanMm").get<double>();if(std::abs(direction.Magnitude()-1)>1e-9||!std::isfinite(span)||span<=0||span>20000)throw std::runtime_error("Invalid extrusion vector");
  const auto tool=planRead(layer.at("toolPath"));measure(tool);const auto boundary=selectedBoundary.IsNull()?planRead(layer.at("boundaryPath")):selectedBoundary;
  const auto& regions=layer.at("regions");if(!regions.is_array()||regions.empty()||regions.size()>1024)throw std::runtime_error("Invalid region plan");
  TopoDS_Compound pieces;BRep_Builder compound;compound.MakeCompound(pieces);const auto began=std::chrono::steady_clock::now();
  for(size_t r=0;r<regions.size();r++){
   stage="relief-layer-"+std::to_string(i+1)+"-region-"+std::to_string(r+1)+"-mask";
   progress();if(std::ifstream("cancel.flag").good())throw std::runtime_error("Cooperative cancellation requested");
   const auto& region=regions[r];keys(region,{"outer","holes"});const auto outer=planWire(region.at("outer"));BRepBuilderAPI_MakeFace face(outer,true);if(!face.IsDone())throw std::runtime_error("Mask face failed");
   const auto& holes=region.at("holes");if(!holes.is_array()||holes.size()>1024)throw std::runtime_error("Invalid hole count");
   TopoDS_Shape mask;
   if(strategy=="faceWithHolesExtrude"){
    for(const auto& hole:holes)face.Add(planWire(hole));ShapeFix_Face fixer(face.Face());fixer.FixOrientation();const auto fixed=fixer.Face();if(!BRepCheck_Analyzer(fixed,true).IsValid())throw std::runtime_error("Face with supplied holes invalid; no strategy fallback");mask=planPrism(fixed,direction*span);
   }else{
    mask=planPrism(face.Face(),direction*span);
    if(!holes.empty()){TopoDS_Compound cuts;compound.MakeCompound(cuts);for(const auto& hole:holes){BRepBuilderAPI_MakeFace holeFace(planWire(hole),true);if(!holeFace.IsDone())throw std::runtime_error("Hole face failed");compound.Add(cuts,planPrism(holeFace.Face(),direction*span));}mask=planBoolean<BRepAlgoAPI_Cut>(mask,cuts);}
   }
   stage="relief-layer-"+std::to_string(i+1)+"-region-"+std::to_string(r+1)+"-common";progress();const auto piece=planBoolean<BRepAlgoAPI_Common>(tool,mask);int solids=0;for(TopExp_Explorer ex(piece,TopAbs_SOLID);ex.More();ex.Next())solids++;if(!solids)throw std::runtime_error("Relief region has no material");compound.Add(pieces,piece);
  }
  const double maskMs=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-began).count();stage="relief-boundary-check";BRepExtrema_DistShapeShape distance(pieces,boundary);if(!distance.IsDone()||distance.Value()<=.00101)throw std::runtime_error("Relief crosses original host face boundary");
  stage="relief-layer-"+std::to_string(i+1)+"-fuse";progress();const auto fuseBegan=std::chrono::steady_clock::now();current=mode=="engrave"?planBoolean<BRepAlgoAPI_Cut>(current,pieces):planFusePieces(current,pieces);const auto validation=measure(current);
  if(layer.contains("checkpointPath")){
   const auto path=layer.at("checkpointPath").get<std::string>(),partial=path+".partial";
   {std::ofstream output(partial,std::ios::binary);BRepTools::Write(current,output,false,false,TopTools_FormatVersion_VERSION_3);output.flush();if(!output)throw std::runtime_error("Layer checkpoint write failed");}
   if(!MoveFileExA(partial.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("Layer checkpoint publication failed");
  }
  stages.push_back({{"layer",i+1},{"cacheHit",false},{"maskStrategy",strategy},{"regions",regions.size()},{"maskMs",maskMs},{"fuseMs",std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-fuseBegan).count()},{"validation",validation},{"memberLayerIds",layer.at("memberLayerIds")}});
 }
 return current;
}
