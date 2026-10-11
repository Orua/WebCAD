#pragma once
#include <BRepAlgoAPI_Cut.hxx>
#include <TopTools_ListOfShape.hxx>
#include <functional>
#include <vector>

struct BooleanFailure : std::runtime_error {
 const std::string code;
 BooleanFailure(const char* code,const char* message):std::runtime_error(message),code(code){}
};

// This contract is deliberately bounded to positive-volume single-solid
// operands/results. No shape healing, fuzzy tolerance or strategy fallback.
static TopoDS_Shape runBooleanCut(const TopoDS_Shape& source,const json& params,
 json& stages,std::string& stage,const std::function<void()>& progress) {
 keys(params,{"toolPaths"});
 const auto& paths=params.at("toolPaths");
 if(!paths.is_array()||paths.empty()||paths.size()>32)
  throw BooleanFailure("BOOLEAN_INPUT_LIMIT","Boolean Cut requires 1 to 32 ordered tools");
 TopTools_ListOfShape arguments,tools;arguments.Append(source);
 std::vector<TopoDS_Shape> ownedTools;
 stage="read-boolean-tools";progress();
 for(const auto& path:paths){
  if(!path.is_string())throw BooleanFailure("BOOLEAN_INPUT_INVALID","Expected a server-bound tool path");
  std::ifstream file(path.get<std::string>(),std::ios::binary|std::ios::ate);
  if(!file||file.tellg()<=0||file.tellg()>20*1024*1024)
   throw BooleanFailure("BOOLEAN_INPUT_LIMIT","Missing or oversized Boolean tool BRep");
  file.seekg(0);TopoDS_Shape tool;BRep_Builder builder;BRepTools::Read(tool,file,builder);
  // measure rejects invalid, empty, multiple-solid or non-positive inputs.
  measure(tool);ownedTools.push_back(tool);tools.Append(tool);
 }
 stage="boolean-cut";progress();const auto began=std::chrono::steady_clock::now();
 BRepAlgoAPI_Cut operation;operation.SetArguments(arguments);operation.SetTools(tools);
 operation.SetNonDestructive(true);operation.SetRunParallel(false);operation.Build();
 if(!operation.IsDone()||operation.HasErrors())
  throw BooleanFailure("BOOLEAN_BUILD_FAILED","Native Boolean Cut did not complete; source is retained");
 const auto result=operation.Shape();
 if(result.IsNull())throw BooleanFailure("BOOLEAN_EMPTY_RESULT","Boolean Cut removed all source material; empty results are not accepted");
 int solids=0;for(TopExp_Explorer ex(result,TopAbs_SOLID);ex.More();ex.Next())++solids;
 if(solids==0)throw BooleanFailure("BOOLEAN_EMPTY_RESULT","Boolean Cut removed all source material; empty results are not accepted");
 if(solids!=1)throw BooleanFailure("BOOLEAN_MULTIPLE_SOLIDS","Boolean Cut split the source into multiple solids; this accepted version requires one result solid");
 stage="validate-boolean-material";progress();
 const auto before=measure(source),after=measure(result);
 const double sourceVolume=before.at("volumeMm3").get<double>(),resultVolume=after.at("volumeMm3").get<double>();
 if(resultVolume>sourceVolume+1e-7+sourceVolume*1e-8)
  throw BooleanFailure("BOOLEAN_MATERIAL_INVALID","Boolean Cut added material beyond source volume");
 stages.push_back({{"stage","boolean-cut"},{"inputCount",paths.size()+1},{"toolCount",paths.size()},
  {"nonDestructive",true},{"parallel",false},{"sourceVolumeMm3",sourceVolume},{"resultVolumeMm3",resultVolume},
  {"elapsedMs",std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-began).count()}});
 return result;
}
