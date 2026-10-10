#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepBndLib.hxx>
#include <GProp_GProps.hxx>
#include <Bnd_Box.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS_Shape.hxx>
#include <TopTools_FormatVersion.hxx>
#include <Standard_Version.hxx>
#include <gp_Trsf.hxx>
#include <gp_Vec.hxx>
#include <nlohmann/json.hpp>
#include <windows.h>
#include <psapi.h>
#include <fstream>
#include <iostream>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <stdexcept>
#include <string>
#include <set>

using json = nlohmann::json;
static void keys(const json& value, const std::set<std::string>& allowed) {
  if (!value.is_object()) throw std::runtime_error("Expected a strict request object");
  for (auto it=value.begin(); it!=value.end(); ++it) if (!allowed.count(it.key())) throw std::runtime_error("Unknown internal request field");
}
static json measure(const TopoDS_Shape& shape) {
  BRepCheck_Analyzer analyzer(shape, true);
  if (shape.IsNull() || !analyzer.IsValid()) throw std::runtime_error("Invalid precise BRep");
  int solids=0; for(TopExp_Explorer ex(shape,TopAbs_SOLID);ex.More();ex.Next()) ++solids;
  if (solids!=1) throw std::runtime_error("Translation bridge currently accepts one solid");
  GProp_GProps props; BRepGProp::VolumeProperties(shape,props); const double volume=std::abs(props.Mass());
  if(!std::isfinite(volume)||volume<=0) throw std::runtime_error("Invalid material volume");
  Bnd_Box bounds; BRepBndLib::AddOptimal(shape,bounds,false,false); double x0,y0,z0,x1,y1,z1; bounds.Get(x0,y0,z0,x1,y1,z1);
  return {{"valid",true},{"solidCount",solids},{"volumeMm3",volume},{"bounds",{{"min",{x0,y0,z0}},{"max",{x1,y1,z1}}}}};
}
#include "relief_plan.hxx"
int main(int argc,char** argv) {
  if(argc!=2) return 2;
  std::string reportPath,stage="read-request";
  json supportBinding;
  const auto began=std::chrono::steady_clock::now();
  try {
    std::ifstream file(argv[1],std::ios::binary|std::ios::ate);
    if(!file||file.tellg()>4*1024*1024) throw std::runtime_error("Missing or oversized internal request");
    file.seekg(0); json request; file>>request;
    keys(request,{"operation","semanticVersion","strategy","params","sourcePath","outputPath","reportPath","inputFingerprint","featureId","expectedRevision"});
    reportPath=request.at("reportPath").get<std::string>();
    const auto progress=[&](){
     PROCESS_MEMORY_COUNTERS_EX counters{};counters.cb=sizeof(counters);const bool memory=GetProcessMemoryInfo(GetCurrentProcess(),reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&counters),sizeof(counters));const auto destination=reportPath+".progress.json",partial=destination+".partial";
     {std::ofstream out(partial,std::ios::binary);out<<json({{"stage",stage},{"elapsedMs",std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-began).count()},{"peakWorkingSetBytes",memory?json(counters.PeakWorkingSetSize):json("unavailable")}}).dump();}
     if(!MoveFileExA(partial.c_str(),destination.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("Native progress publication failed");
    };
    const bool translation=request.at("operation")=="transform"&&request.at("semanticVersion")=="transform.translation-1.0"&&request.at("strategy")=="translation";
    const bool relief=request.at("operation")=="relief"&&(request.at("semanticVersion")=="relief.compiled-contours-1.0"||request.at("semanticVersion")=="relief.compiled-contours-local-patch-1.1"||request.at("semanticVersion")=="relief.compiled-contours-strokes-1.2");
    if(!translation&&!relief)throw std::runtime_error("Unsupported operation semantics");
    const auto& params=request.at("params");
    stage="read-brep";std::ifstream source(request.at("sourcePath").get<std::string>(),std::ios::binary|std::ios::ate);
    if(!source||source.tellg()>20*1024*1024)throw std::runtime_error("Source BRep exceeds bridge budget");source.seekg(0);
    TopoDS_Shape input;BRep_Builder builder;BRepTools::Read(input,source,builder);const auto before=measure(input);
    TopoDS_Shape result;json stages=json::array();
    if(translation){
     keys(params,{"x","y","z"});double shift[3];for(int i=0;i<3;i++){shift[i]=params.at(std::string(1,"xyz"[i])).get<double>();if(!std::isfinite(shift[i])||std::abs(shift[i])>100000)throw std::runtime_error("Invalid translation parameter");}
     stage="exact-transform";gp_Trsf transform;transform.SetTranslation(gp_Vec(shift[0],shift[1],shift[2]));BRepBuilderAPI_Transform maker(input,transform,true);if(!maker.IsDone())throw std::runtime_error("Native transform did not complete");result=maker.Shape();
    }else result=runReliefPlan(input,params,request.at("strategy"),stages,stage,progress,request.at("semanticVersion")=="relief.compiled-contours-strokes-1.2",supportBinding);
    stage="validate-result";const auto after=measure(result);
    stage="write-brep";const auto path=request.at("outputPath").get<std::string>(),partial=path+".partial";
    {std::ofstream output(partial,std::ios::binary);BRepTools::Write(result,output,false,false,TopTools_FormatVersion_VERSION_3);output.flush();if(!output)throw std::runtime_error("Precise result write failed");}
    if(std::rename(partial.c_str(),path.c_str())!=0)throw std::runtime_error("Precise result atomic publication failed");
    PROCESS_MEMORY_COUNTERS_EX counters{};counters.cb=sizeof(counters);const bool hasMemory=GetProcessMemoryInfo(GetCurrentProcess(),reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&counters),sizeof(counters));
    json report={{"ok",true},{"operation",request.at("operation")},{"semanticVersion",request.at("semanticVersion")},{"strategy",request.at("strategy")},{"stages",stages},{"kernelVersion",OCC_VERSION_COMPLETE},{"codec","occt-text-brep-v1"},{"brepVersion",3},{"units","mm"},{"coordinateSystem","world-xyz-right-handed"},{"inputFingerprint",request.at("inputFingerprint")},{"featureId",request.at("featureId")},{"expectedRevision",request.at("expectedRevision")},{"topologyBinding",{{"kind",translation?"whole-source":params.contains("supportIntent")?"outer-cylinder-geometric-intent":"private-prototype-boundary"},{"matchCount",1},{"numericIndicesTransferred",false}}},{"before",before},{"validation",after},{"timings",{{"totalMs",std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-began).count()},{"peakWorkingSetBytes",hasMemory?json(counters.PeakWorkingSetSize):json("unavailable")}}}};
    if(!supportBinding.is_null()){report["supportBinding"]=supportBinding;report["topologyBinding"]["matchCount"]=supportBinding.at("counts").at("matchCount");}
    std::ofstream reportFile(reportPath,std::ios::binary);reportFile<<report.dump();reportFile.flush();if(!reportFile)throw std::runtime_error("Report write failed");return 0;
  } catch(const Standard_Failure& error) {
    if(!reportPath.empty()){json failure={{"ok",false},{"code","OCCT_FAILURE"},{"stage",stage},{"message",std::string(error.GetMessageString()?error.GetMessageString():"OCCT failure").substr(0,1024)}};if(!supportBinding.is_null())failure["supportBinding"]=supportBinding;std::ofstream report(reportPath);report<<failure.dump();}return 3;
  } catch(const std::exception& error) {
    if(!reportPath.empty()){json failure={{"ok",false},{"code","NATIVE_BRIDGE_FAILED"},{"stage",stage},{"message",std::string(error.what()).substr(0,1024)}};if(!supportBinding.is_null())failure["supportBinding"]=supportBinding;std::ofstream report(reportPath);report<<failure.dump();}return 4;
  }
}
