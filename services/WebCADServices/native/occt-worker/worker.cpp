#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepClass_FaceClassifier.hxx>
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
  if (solids!=1) throw std::runtime_error("Native bridge requires one valid solid per operand and result");
  GProp_GProps props; BRepGProp::VolumeProperties(shape,props); const double volume=std::abs(props.Mass());
  if(!std::isfinite(volume)||volume<=0) throw std::runtime_error("Invalid material volume");
  Bnd_Box bounds; BRepBndLib::AddOptimal(shape,bounds,false,false); double x0,y0,z0,x1,y1,z1; bounds.Get(x0,y0,z0,x1,y1,z1);
  return {{"valid",true},{"solidCount",solids},{"volumeMm3",volume},{"bounds",{{"min",{x0,y0,z0}},{"max",{x1,y1,z1}}}}};
}
#include "relief_plan.hxx"
#include "boolean_plan.hxx"
#include "face_boundary_round.hxx"
#include "relief_shoulder.hxx"
static TopoDS_Face bindPlanarRoundFace(const TopoDS_Shape& source,const json& intent,double radius) {
 keys(intent,{"kind","point","normal"});
 if(intent.at("kind")!="planar-face-geometric-intent")throw std::runtime_error("Expected explicit planar-face geometric intent");
 const auto point=planPoint(intent.at("point")),normalPoint=planPoint(intent.at("normal"));
 const gp_Vec normal(normalPoint.X(),normalPoint.Y(),normalPoint.Z());
 if(std::abs(normal.Magnitude()-1)>1e-9)throw std::runtime_error("Selected face outward normal must have unit length");
 const auto vertex=BRepBuilderAPI_MakeVertex(point).Vertex();TopoDS_Face selected;int matches=0;
 for(TopExp_Explorer ex(source,TopAbs_FACE);ex.More();ex.Next()){
  const auto face=TopoDS::Face(ex.Current());BRepAdaptor_Surface surface(face,true);if(surface.GetType()!=GeomAbs_Plane)continue;
  gp_Vec outward(surface.Plane().Axis().Direction());if(face.Orientation()==TopAbs_REVERSED)outward.Reverse();
  if(outward.Dot(normal)<1-1e-9)continue;
  BRepExtrema_DistShapeShape distance(vertex,face);distance.Perform();
  if(!distance.IsDone()||distance.NbSolution()<1||distance.Value()>1e-7)continue;
  BRepClass_FaceClassifier domain(face,point,1e-7);if(domain.State()!=TopAbs_IN)continue;
  selected=face;++matches;
 }
 if(matches!=1)throw std::runtime_error("Selected planar face is missing or ambiguous; choose an interior point on one current face");
 const double step=std::max(16e-7,std::min(radius*.001,.001));
 const BRepClass3d_SolidClassifier inside(source,point.Translated(normal.Multiplied(-step)),1e-7),outside(source,point.Translated(normal.Multiplied(step)),1e-7);
 if(inside.State()!=TopAbs_IN||outside.State()!=TopAbs_OUT)throw std::runtime_error("Selected face normal is not outward from the current source material");
 return selected;
}
int main(int argc,char** argv) {
  if(argc!=2) return 2;
  std::string reportPath,stage="read-request";
  json supportBinding,roundBoundary,shoulderReport;
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
    const bool booleanCut=request.at("operation")=="cut"&&request.at("semanticVersion")=="boolean.cut-1.0"&&request.at("strategy")=="multi-source-boolean";
    const bool faceRound=request.at("operation")=="round"&&request.at("semanticVersion")=="round.planar-boundary-1.0"&&request.at("strategy")=="planar-boundary-cutter";
    const bool shoulder=request.at("operation")=="reliefShoulder"&&request.at("semanticVersion")=="relief.central-shoulder-1.0"&&request.at("strategy")=="source-boundary-replacement";
    if(!translation&&!relief&&!booleanCut&&!faceRound&&!shoulder)throw std::runtime_error("Unsupported operation semantics");
    const auto& params=request.at("params");
    stage="read-brep";std::ifstream source(request.at("sourcePath").get<std::string>(),std::ios::binary|std::ios::ate);
    if(!source||source.tellg()>20*1024*1024)throw std::runtime_error("Source BRep exceeds bridge budget");source.seekg(0);
    TopoDS_Shape input;BRep_Builder builder;BRepTools::Read(input,source,builder);const auto before=measure(input);
    TopoDS_Shape result;json stages=json::array();
    if(translation){
     keys(params,{"x","y","z"});double shift[3];for(int i=0;i<3;i++){shift[i]=params.at(std::string(1,"xyz"[i])).get<double>();if(!std::isfinite(shift[i])||std::abs(shift[i])>100000)throw std::runtime_error("Invalid translation parameter");}
     stage="exact-transform";gp_Trsf transform;transform.SetTranslation(gp_Vec(shift[0],shift[1],shift[2]));BRepBuilderAPI_Transform maker(input,transform,true);if(!maker.IsDone())throw std::runtime_error("Native transform did not complete");result=maker.Shape();
    }else if(booleanCut)result=runBooleanCut(input,params,stages,stage,progress);
    else if(faceRound){
     keys(params,{"radius","faceIntent"});const double radius=params.at("radius").get<double>();if(!std::isfinite(radius)||radius<=0||radius>10000)throw std::runtime_error("Round boundary requires a bounded positive radius");
     stage="bind-planar-face";progress();const auto face=bindPlanarRoundFace(input,params.at("faceIntent"),radius);
     stage="round-planar-boundary";progress();const auto rounded=webcad_face_round::run(input,face,radius);result=rounded.shape;roundBoundary=rounded.report;
     const auto corners=roundBoundary.at("cornerSemantics");if(corners.at("isolatedSharpTerminationVertices")!=4)throw std::runtime_error("Round corner termination evidence is incomplete");
     roundBoundary["radiusMm"]=roundBoundary.at("requestedRadiusMm");roundBoundary["cornerDetails"]=corners;roundBoundary["cornerSemantics"]="smooth-freeform-patches";roundBoundary["isolatedCornerTerminations"]=corners.at("isolatedSharpTerminationVertices");
    }
    else if(shoulder){
     keys(params,{"widthMm","endProtectionMm","endPolicy","faceIntent"});
     if(params.at("endPolicy")!="retained-step-with-planar-caps")throw std::runtime_error("Shoulder requires explicit retained end-cap policy");
     const double width=params.at("widthMm").get<double>(),protection=params.at("endProtectionMm").get<double>();
     if(!std::isfinite(width)||!std::isfinite(protection)||width<=0||protection<=0||width>10000||protection>10000)throw std::runtime_error("Invalid shoulder dimensions");
     stage="bind-shoulder-step";progress();const auto face=bindPlanarRoundFace(input,params.at("faceIntent"),width);
     TopExp_Explorer solids(input,TopAbs_SOLID);const auto solid=TopoDS::Solid(solids.Current());
     
     stage="replace-central-shoulder";progress();const auto replacement=webcad::relief_shoulder::run(solid,face,width,protection);
     const auto& spec=replacement.spec;result=replacement.shape;
     const double removed=before.at("volumeMm3").get<double>()-measure(result).at("volumeMm3").get<double>();
     const double expected=(replacement.coreEnd-replacement.coreStart)*width/2*(spec.radiusMm*spec.layerHeightMm+22*spec.layerHeightMm*spec.layerHeightMm/35);
     if(removed<=0||std::abs(removed-expected)>std::max(1e-6,expected*1e-6))throw std::runtime_error("Shoulder material removal differs from analytic transition");
     shoulderReport={{"kind","central-cylindrical-shoulder"},{"mechanism",replacement.mechanism},{"fixedRadius",false},{"centralContinuity","G1"},{"endCapContinuity","G0"},{"endPolicy",params.at("endPolicy")},{"widthMm",width},{"endProtectionMm",protection},{"radiusMm",spec.radiusMm},{"layerHeightMm",spec.layerHeightMm},{"retainedSourceFaces",replacement.retainedFaces},{"frameNormalized",replacement.frameNormalized},{"retentionMeaning","unchanged geometry under rigid world pose"},{"removedVolumeMm3",removed},{"expectedRemovedVolumeMm3",expected}};
    }
    else result=runReliefPlan(input,params,request.at("strategy"),stages,stage,progress,request.at("semanticVersion")=="relief.compiled-contours-strokes-1.2",supportBinding);
    stage="validate-result";const auto after=measure(result);
    stage="write-brep";const auto path=request.at("outputPath").get<std::string>(),partial=path+".partial";
    {std::ofstream output(partial,std::ios::binary);BRepTools::Write(result,output,false,false,TopTools_FormatVersion_VERSION_3);output.flush();if(!output)throw std::runtime_error("Precise result write failed");if((booleanCut||faceRound||shoulder)&&output.tellp()>20*1024*1024)throw BooleanFailure("RESULT_TOO_LARGE_FOR_CLIENT","Native result exceeds the accepted 20 MiB client import budget");}
    if(std::rename(partial.c_str(),path.c_str())!=0)throw std::runtime_error("Precise result atomic publication failed");
    PROCESS_MEMORY_COUNTERS_EX counters{};counters.cb=sizeof(counters);const bool hasMemory=GetProcessMemoryInfo(GetCurrentProcess(),reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&counters),sizeof(counters));
    json report={{"ok",true},{"operation",request.at("operation")},{"semanticVersion",request.at("semanticVersion")},{"strategy",request.at("strategy")},{"stages",stages},{"kernelVersion",OCC_VERSION_COMPLETE},{"codec","occt-text-brep-v1"},{"brepVersion",3},{"units","mm"},{"coordinateSystem","world-xyz-right-handed"},{"inputFingerprint",request.at("inputFingerprint")},{"featureId",request.at("featureId")},{"expectedRevision",request.at("expectedRevision")},{"topologyBinding",{{"kind",translation?"whole-source":params.contains("supportIntent")?"outer-cylinder-geometric-intent":"private-prototype-boundary"},{"matchCount",1},{"numericIndicesTransferred",false}}},{"before",before},{"validation",after},{"timings",{{"totalMs",std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-began).count()},{"peakWorkingSetBytes",hasMemory?json(counters.PeakWorkingSetSize):json("unavailable")}}}};
    if(booleanCut)report["topologyBinding"]={{"kind","whole-sources"},{"matchCount",params.at("toolPaths").size()+1},{"numericIndicesTransferred",false}};
    if(faceRound){report["topologyBinding"]={{"kind","planar-face-geometric-intent"},{"matchCount",1},{"numericIndicesTransferred",false}};report["roundBoundary"]=roundBoundary;}
    if(shoulder){report["topologyBinding"]={{"kind","planar-face-geometric-intent"},{"matchCount",1},{"numericIndicesTransferred",false}};report["shoulderReport"]=shoulderReport;}
    if(!supportBinding.is_null()){report["supportBinding"]=supportBinding;report["topologyBinding"]["matchCount"]=supportBinding.at("counts").at("matchCount");}
    std::ofstream reportFile(reportPath,std::ios::binary);reportFile<<report.dump();reportFile.flush();if(!reportFile)throw std::runtime_error("Report write failed");return 0;
  } catch(const webcad_face_round::Failure& error) {
    if(!reportPath.empty()){std::ofstream report(reportPath);report<<json({{"ok",false},{"code",error.code},{"stage",stage},{"message",std::string(error.what()).substr(0,1024)}}).dump();}return 4;
  } catch(const BooleanFailure& error) {
    if(!reportPath.empty()){std::ofstream report(reportPath);report<<json({{"ok",false},{"code",error.code},{"stage",stage},{"message",std::string(error.what()).substr(0,1024)}}).dump();}return 4;
  } catch(const Standard_Failure& error) {
    if(!reportPath.empty()){json failure={{"ok",false},{"code","OCCT_FAILURE"},{"stage",stage},{"message",std::string(error.GetMessageString()?error.GetMessageString():"OCCT failure").substr(0,1024)}};if(!supportBinding.is_null())failure["supportBinding"]=supportBinding;std::ofstream report(reportPath);report<<failure.dump();}return 3;
  } catch(const std::exception& error) {
    if(!reportPath.empty()){json failure={{"ok",false},{"code","NATIVE_BRIDGE_FAILED"},{"stage",stage},{"message",std::string(error.what()).substr(0,1024)}};if(!supportBinding.is_null())failure["supportBinding"]=supportBinding;std::ofstream report(reportPath);report<<failure.dump();}return 4;
  }
}
