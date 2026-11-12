#pragma once
#include <BRepAlgoAPI_Cut.hxx>
#include <TopTools_ListOfShape.hxx>
#include <functional>
#include <vector>
#include <BRepClass3d_SolidClassifier.hxx>
#include <TopoDS.hxx>

struct BooleanFailure : std::runtime_error {
 const std::string code;
 json details=nullptr;
 BooleanFailure(const char* code,const char* message):std::runtime_error(message),code(code){}
};

static double booleanMaterialVolume(const TopoDS_Shape& shape){
 GProp_GProps props;const double error=BRepGProp::VolumePropertiesGK(shape,props,1e-9,true,true,false,false,false),volume=std::abs(props.Mass());
 if(!std::isfinite(error)||error<0||!std::isfinite(volume)||volume<=0)throw BooleanFailure("BOOLEAN_MATERIAL_INVALID","Adaptive exact material volume could not be measured");return volume;
}

// This contract is deliberately bounded to positive-volume single-solid
// operands/results. No shape healing, fuzzy tolerance or strategy fallback.
static TopoDS_Shape runBooleanCut(const TopoDS_Shape& source,const json& params,
 json& stages,std::string& stage,const std::function<void()>& progress) {
 keys(params,{"toolPaths","keepSolidAt","maxDiscardedVolumeMm3","toolExecution"});
 const bool select=params.contains("keepSolidAt");
 if(select!=params.contains("maxDiscardedVolumeMm3"))throw BooleanFailure("PARAM_SCHEMA_INVALID","Explicit solid selection requires a point and discard volume limit");
 const bool sequential=params.contains("toolExecution");
 if(sequential&&(!select||params.at("toolExecution")!="sequential"))throw BooleanFailure("PARAM_SCHEMA_INVALID","Explicit sequential tool execution requires result selection");
 gp_Pnt keepPoint;double discardLimit=0;
 if(select){const auto& p=params.at("keepSolidAt");if(!p.is_array()||p.size()!=3)throw BooleanFailure("PARAM_SCHEMA_INVALID","Expected world point");for(const auto& v:p)if(!v.is_number()||!std::isfinite(v.get<double>())||std::abs(v.get<double>())>100000)throw BooleanFailure("PARAM_SCHEMA_INVALID","Expected bounded finite world point");keepPoint=gp_Pnt(p[0].get<double>(),p[1].get<double>(),p[2].get<double>());if(!params.at("maxDiscardedVolumeMm3").is_number())throw BooleanFailure("PARAM_SCHEMA_INVALID","Expected explicit discard volume limit");discardLimit=params.at("maxDiscardedVolumeMm3").get<double>();if(!std::isfinite(discardLimit)||discardLimit<0||discardLimit>1e9)throw BooleanFailure("PARAM_SCHEMA_INVALID","Invalid discard volume limit");}
 const auto& paths=params.at("toolPaths");
 if(!paths.is_array()||paths.empty()||paths.size()>32)
  throw BooleanFailure("BOOLEAN_INPUT_LIMIT","Boolean Cut requires 1 to 32 ordered tools");
 TopTools_ListOfShape arguments,tools;arguments.Append(source);
 std::vector<TopoDS_Shape> ownedTools;double toolVolumeSum=0;
 stage="read-boolean-tools";progress();
 for(const auto& path:paths){
  if(!path.is_string())throw BooleanFailure("BOOLEAN_INPUT_INVALID","Expected a server-bound tool path");
  std::ifstream file(path.get<std::string>(),std::ios::binary|std::ios::ate);
  if(!file||file.tellg()<=0||file.tellg()>20*1024*1024)
   throw BooleanFailure("BOOLEAN_INPUT_LIMIT","Missing or oversized Boolean tool BRep");
  file.seekg(0);TopoDS_Shape tool;BRep_Builder builder;BRepTools::Read(tool,file,builder);
  // measure rejects invalid, empty, multiple-solid or non-positive inputs.
  measure(tool);toolVolumeSum+=booleanMaterialVolume(tool);ownedTools.push_back(tool);tools.Append(tool);
 }
 stage="boolean-cut";progress();const auto began=std::chrono::steady_clock::now();
 TopoDS_Shape result=source;
 const size_t passCount=sequential?ownedTools.size():1;
 for(size_t pass=0;pass<passCount;++pass){
  TopTools_ListOfShape currentArguments,currentTools;currentArguments.Append(result);
  if(sequential)currentTools.Append(ownedTools[pass]);else currentTools=tools;
  BRepAlgoAPI_Cut operation;operation.SetArguments(currentArguments);operation.SetTools(currentTools);
  operation.SetNonDestructive(true);operation.SetRunParallel(false);operation.Build();
  if(!operation.IsDone()||operation.HasErrors())throw BooleanFailure("BOOLEAN_BUILD_FAILED","Native Boolean Cut did not complete; source is retained");
  result=operation.Shape();
 }
 if(result.IsNull())throw BooleanFailure("BOOLEAN_EMPTY_RESULT","Boolean Cut removed all source material; empty results are not accepted");
 int solids=0;for(TopExp_Explorer ex(result,TopAbs_SOLID);ex.More();ex.Next())++solids;
 if(solids==0)throw BooleanFailure("BOOLEAN_EMPTY_RESULT","Boolean Cut removed all source material; empty results are not accepted");
 if(select){
  if(solids>128)throw BooleanFailure("BOOLEAN_RESULT_LIMIT","Explicit result selection supports at most 128 separated solids");
  TopoDS_Shape selected;int matches=0;double removed=0;json discarded=json::array(),classifications=json::array();
  for(TopExp_Explorer ex(result,TopAbs_SOLID);ex.More();ex.Next()){
   const auto solid=TopoDS::Solid(ex.Current());const auto info=measure(solid);BRepClass3d_SolidClassifier classifier(solid,keepPoint,1e-7);
   const auto pointState=classifier.State();classifier.PerformInfinitePoint(1e-7);
   if(classifications.size()<16)classifications.push_back({{"pointState",static_cast<int>(pointState)},{"infiniteState",static_cast<int>(classifier.State())},{"orientation",static_cast<int>(solid.Orientation())},{"geometry",info}});
   if(pointState==TopAbs_IN){selected=solid;++matches;}else{auto discardedInfo=info;const double volume=booleanMaterialVolume(solid);discardedInfo["volumeMm3"]=volume;removed+=volume;discarded.push_back(discardedInfo);}
  }
  if(matches!=1){BooleanFailure error("BOOLEAN_RESULT_POINT_INVALID","keepSolidAt must lie strictly inside exactly one result solid");error.details={{"keepSolidAt",params.at("keepSolidAt")},{"matchCount",matches},{"solidCount",solids},{"classifications",classifications}};throw error;}
  if(removed>discardLimit+1e-7)throw BooleanFailure("BOOLEAN_DISCARD_LIMIT","Discarded material exceeds explicit volume limit");
  stages.push_back({{"stage","boolean-result-selection"},{"keepSolidAt",params.at("keepSolidAt")},{"inputSolidCount",solids},{"discardedVolumeMm3",removed},{"discarded",discarded}});result=selected;
 }else if(solids!=1)throw BooleanFailure("BOOLEAN_MULTIPLE_SOLIDS","Boolean Cut split the source into multiple solids; this accepted version requires one result solid");
 stage="validate-boolean-material";progress();
 const auto before=measure(source),after=measure(result);
 const double sourceVolume=booleanMaterialVolume(source),resultVolume=booleanMaterialVolume(result);
 if(resultVolume>sourceVolume+1e-7+sourceVolume*1e-8||resultVolume+discardLimit<std::max(0.0,sourceVolume-toolVolumeSum)-1e-7-sourceVolume*1e-8)
  throw BooleanFailure("BOOLEAN_MATERIAL_INVALID","Boolean Cut violates source/tool material bounds");
 stages.push_back({{"stage","boolean-cut"},{"inputCount",paths.size()+1},{"toolCount",paths.size()},
  {"nonDestructive",true},{"parallel",false},{"volumeMethod","adaptive-gauss-kronrod-1e-9"},{"toolExecution",sequential?"sequential":"all-at-once"},{"passCount",passCount},{"sourceVolumeMm3",sourceVolume},{"resultVolumeMm3",resultVolume},
  {"elapsedMs",std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-began).count()}});
 return result;
}
