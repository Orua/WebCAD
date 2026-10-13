#include "fixture.hxx"
#include "../../../services/WebCADServices/native/occt-worker/relief_shoulder.hxx"
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <Standard_Version.hxx>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <chrono>
#include <fstream>
#include <iostream>

using json=nlohmann::json;
namespace rf=webcad::relief_fixture;
namespace rs=webcad::relief_shoulder;
namespace rt=webcad::relief_topology;

static json checkSeam(const char* name,const TopoDS_Edge& edge,const TopoDS_Face& shoulder,const TopoDS_Face& support) {
  double first,last,a,b;
  auto p1=BRep_Tool::CurveOnSurface(edge,shoulder,first,last),p2=BRep_Tool::CurveOnSurface(edge,support,a,b);
  rt::require(!p1.IsNull()&&!p2.IsNull(),"Missing seam PCurve");
  const auto s1=BRep_Tool::Surface(shoulder),s2=BRep_Tool::Surface(support);
  double maxGap=0,minDot=1;
  for(int i=0;i<=32;++i) {
    const double t=first+(last-first)*i/32;const auto q1=p1->Value(t),q2=p2->Value(t);
    gp_Pnt x1,x2;gp_Vec u1,v1,u2,v2;
    s1->D1(q1.X(),q1.Y(),x1,u1,v1);s2->D1(q2.X(),q2.Y(),x2,u2,v2);
    auto n1=u1.Crossed(v1),n2=u2.Crossed(v2);
    rt::require(n1.Magnitude()>1e-15&&n2.Magnitude()>1e-15,"Singular normal");
    if(shoulder.Orientation()==TopAbs_REVERSED)n1.Reverse();if(support.Orientation()==TopAbs_REVERSED)n2.Reverse();
    maxGap=std::max(maxGap,x1.Distance(x2));minDot=std::min(minDot,n1.Normalized().Dot(n2.Normalized()));
  }
  return {{"name",name},{"sharedEdge",true},{"finiteSamples",33},{"maxG0Gap",maxGap},{"minSignedNormalDot",minDot},
    {"passed",maxGap<rt::validationTolerance&&minDot>1-1e-8},
    {"analyticG1Basis","Revolved cubic has dr/dv=0 and dz/dv=width>0 at each end; end-cap joins excluded"}};
}

int main(int argc,char** argv) {
  if(argc!=2){std::cerr<<"output-directory\n";return 2;}
  const auto started=std::chrono::steady_clock::now();
  json r={{"accepted",false},{"kernel",OCC_VERSION_COMPLETE},{"selfContained",true},{"productionEnabled",false},
    {"physicalCandidates",1},{"scope","local replacement on saved existing source; planar end caps are positional only"}};
  try {
    const rf::Spec spec;
    // Prepare an independent existing source, with unsplit step boundaries and
    // an unrelated through-hole. Persist and reload before the edit begins.
    const auto raw=rf::Factory(spec).buildUnsplitSource();
    const auto tool=BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(10,0,-1),gp_Dir(0,0,1)),2,22).Shape();
    BRepAlgoAPI_Cut cut(raw,tool);cut.SetNonDestructive(true);cut.Build();
    rt::require(cut.IsDone()&&BRepCheck_Analyzer(cut.Shape(),true).IsValid(),"Invalid input fixture cut");
    const auto sourcePath=std::string(argv[1])+"/native-source-with-hole.brep";
    rt::require(BRepTools::Write(cut.Shape(),sourcePath.c_str()),"Could not save source");
    BRep_Builder reader;TopoDS_Shape stored;rt::require(BRepTools::Read(stored,sourcePath.c_str(),reader),"Could not reload source");
    std::vector<TopoDS_Solid> solids;
    for(TopExp_Explorer it(stored,TopAbs_SOLID);it.More();it.Next())solids.push_back(TopoDS::Solid(it.Current()));
    const auto source=rs::uniqueSource(solids,"Input must contain one solid");
    GProp_GProps originalVolume;BRepGProp::VolumeProperties(source,originalVolume);
    TopoDS_Face selected;int matches=0;for(const auto& f:rs::sourceFaces(source))if(rs::horizontalSource(f,7)&&f.Orientation()==TopAbs_REVERSED){selected=f;++matches;}
    rt::require(matches==1,"Expected unique test step");
    const auto inferred=rs::inferSpec(source,selected,.3,.3);
    rt::require(std::abs(inferred.radiusMm-spec.radiusMm)<1e-8&&std::abs(inferred.layerHeightMm-spec.layerHeightMm)<1e-8,"Source dimensions must be inferred");
    bool rejected=false;try{rs::inferSpec(source,selected,0,.3);}catch(const std::exception&){rejected=true;}rt::require(rejected,"Zero width must reject");
    TopoDS_Face upper;for(const auto& f:rs::sourceFaces(source))if(rs::horizontalSource(f,20))upper=f;
    rejected=false;try{rs::inferSpec(source,upper,.3,.3);}catch(const std::exception&){rejected=true;}rt::require(rejected,"Unrelated selected face must reject");
    const auto replacement=rs::LocalReplacement(inferred).apply(source);const auto& built=replacement.geometry;
    gp_Trsf pose;pose.SetRotation(gp_Ax1(gp_Pnt(0,0,0),gp_Dir(1,2,3)),.63);pose.SetTranslationPart(gp_Vec(13,-7,21));
    BRepBuilderAPI_Transform moved(source,pose,true);const auto movedSolid=TopoDS::Solid(moved.Shape());
    std::vector<TopoDS_Face> movedMatches;for(const auto& f:rs::sourceFaces(movedSolid))if(f.IsSame(moved.ModifiedShape(selected)))movedMatches.push_back(f);
    const auto rotated=rs::run(movedSolid,rs::uniqueSource(movedMatches,"Unique moved selection"),.3,.3);
    rt::require(rotated.frameNormalized,"Rotated frame must be normalized");
    BRepTools::Write(movedSolid,(std::string(argv[1])+"/rotated-source.brep").c_str());
    const auto movedPoint=gp_Pnt(0,50.2525,7).Transformed(pose);const auto movedNormal=gp_Vec(0,0,-1).Transformed(pose);
    std::ofstream intent(std::string(argv[1])+"/rotated-intent.json");intent<<json({{"kind","planar-face-geometric-intent"},{"point",{movedPoint.X(),movedPoint.Y(),movedPoint.Z()}},{"normal",{movedNormal.X(),movedNormal.Y(),movedNormal.Z()}}}).dump();intent.close();
    r["spec"]={{"radiusMm",spec.radiusMm},{"bodyHeightMm",spec.bodyHeightMm},{"layerHeightMm",spec.layerHeightMm},
      {"regionAngleStartRad",spec.regionAngleStartRad},{"regionAngleEndRad",spec.regionAngleEndRad},
      {"regionZStartMm",spec.regionZStartMm},{"regionZEndMm",spec.regionZEndMm},
      {"shoulderWidthMm",spec.shoulderWidthMm},{"endProtectionMm",spec.endProtectionMm},
      {"endPolicy","retained-step-with-planar-caps"}};
    r["brepValid"]=BRepCheck_Analyzer(built.candidate,true).IsValid();
    rt::Receipt receipt;rt::checkSharedUses(built.candidate,receipt);
    r["sharedEdgesOpposite"]=true;r["sharedNondegenerateEdges"]=receipt.sharedNondegenerateEdges;r["unchangedFaceTShapes"]=built.unchangedFaces;
    GProp_GProps base,candidate;BRepGProp::VolumeProperties(built.baseline,base);BRepGProp::VolumeProperties(built.candidate,candidate);
    const double R=spec.radiusMm,h=spec.layerHeightMm,H=R+h,w=spec.shoulderWidthMm,z0=spec.regionZStartMm,z1=spec.regionZEndMm;
    const double expectedBase=rf::pi*R*R*spec.bodyHeightMm+(built.angleEnd-built.angleStart)/2*(H*H-R*R)*(z1-z0)-rf::pi*4*spec.bodyHeightMm;
    const double expectedRemoved=(built.coreEnd-built.coreStart)*w/2*(R*h+22*h*h/35);
    const double volumeError=std::abs(base.Mass()-candidate.Mass()-expectedRemoved);
    r["volume"]={{"baseline",base.Mass()},{"candidate",candidate.Mass()},{"removed",base.Mass()-candidate.Mass()},
      {"expectedBaseline",expectedBase},{"expectedRemoved",expectedRemoved},{"analyticErrorMm3",volumeError}};
    bool outside=true;int mismatches=0,added=0,removed=0,outsideCount=0;r["materialSamples"]=json::array();
    for(double da:{-.08,-.059,-.057,-.05,0.,.05,.057,.059,.08})for(double z:{6.9,7.015,7.075,7.15,7.225,7.285,7.31,12.9,13.1})for(double radius:{R-.001,R+.005,R+.05,R+.26,R+.48,H+.001}) {
      const double angle=rf::pi/2+da;
      const bool within=built.angleStart<angle&&angle<built.angleEnd&&z0<z&&z<z1;
      const bool affected=built.coreStart<angle&&angle<built.coreEnd&&z0<z&&z<z0+w;
      const double t=(z-z0)/w,crest=affected?R+h*(3*t*t-2*t*t*t):H;
      const bool expectedOld=radius<R||(within&&radius<H),expectedNew=radius<R||(within&&radius<crest);
      gp_Pnt p(radius*std::cos(angle),radius*std::sin(angle),z);
      const auto a=BRepClass3d_SolidClassifier(built.baseline,p,rt::validationTolerance).State(),b=BRepClass3d_SolidClassifier(built.candidate,p,rt::validationTolerance).State();
      rt::require(BRepClass3d_SolidClassifier(rotated.shape,p.Transformed(pose),rt::validationTolerance).State()==b,"Rigid world result changed sampled material");
      if(!affected){++outsideCount;outside&=a==b;}
      added+=a==TopAbs_OUT&&b==TopAbs_IN;removed+=a==TopAbs_IN&&b==TopAbs_OUT;
      const bool matches=(a==TopAbs_IN)==expectedOld&&(b==TopAbs_IN)==expectedNew&&(a==TopAbs_IN||a==TopAbs_OUT)&&(b==TopAbs_IN||b==TopAbs_OUT);
      mismatches+=!matches;
      r["materialSamples"].push_back({{"point",{p.X(),p.Y(),p.Z()}},{"affectedBox",affected},{"baseline",int(a)},{"candidate",int(b)},
        {"expectedBaselineIn",expectedOld},{"expectedCandidateIn",expectedNew},{"matchesAnalytic",matches}});
    }
    r["outsideMaterialSamples"]=outsideCount;r["outsideSamplesUnchanged"]=outside;r["analyticMaterialMismatches"]=mismatches;
    r["addedMaterialSamples"]=added;r["removedMaterialSamples"]=removed;
    r["seams"]={checkSeam("low",built.lowSeam,built.shoulder,built.lowSupport),checkSeam("high",built.highSeam,built.shoulder,built.highSupport)};
    const auto sourceFaces=rs::sourceFaces(source),outputFaces=rs::sourceFaces(built.candidate);
    const auto retained=[&](const auto& f){return std::any_of(outputFaces.begin(),outputFaces.end(),[&](const auto& g){return f.IsSame(g);});};
    const bool facesPreserved=std::all_of(replacement.retained.begin(),replacement.retained.end(),retained);
    std::vector<TopoDS_Face> holeFaces,ends;
    for(const auto& f:sourceFaces){BRepAdaptor_Surface a(f);if(a.GetType()==GeomAbs_Cylinder&&rs::frameEqual(a.Cylinder().Radius(),2))holeFaces.push_back(f);if(rs::horizontalSource(f,0)||rs::horizontalSource(f,spec.bodyHeightMm))ends.push_back(f);}
    bool endpointsKept=true;
    for(const auto& v:replacement.reusedEndpoints) {
      bool found=false;for(TopExp_Explorer it(built.candidate,TopAbs_VERTEX);it.More();it.Next())found|=v.IsSame(it.Current());endpointsKept&=found;
    }
    const bool holeKept=holeFaces.size()==1&&retained(holeFaces.front()),endsKept=ends.size()==2&&std::all_of(ends.begin(),ends.end(),retained);
    r["sourceBinding"]={{"sourceFaceCount",sourceFaces.size()},{"resultFaceCount",outputFaces.size()},
      {"replacedSourceFaceCount",sourceFaces.size()-replacement.retained.size()},{"retainedSourceFaceCount",replacement.retained.size()},
      {"retainedFacesSameTShape",facesPreserved},{"holeCylinderSameTShape",holeKept},{"piercedBodyEndsSameTShape",endsKept},
      {"sourceEndpointTShapesReused",endpointsKept},{"sourceArcWasUnsplit",replacement.sourceArcWasUnsplit},
      {"sourceSurfacesPreservedForReplacedCylinderTrims",replacement.cylinderSurfacesPreserved},
      {"binding","source geometry, adjacency and exact endpoint identity; no source indices"}};
    bool holeSamplesPass=true;r["holeSamples"]=json::array();
    for(double z:{.1,10.,19.9})for(double radius:{0.,1.9,2.1,3.})for(double angle:{0.,rf::pi/2,rf::pi,3*rf::pi/2}) {
      gp_Pnt p(10+radius*std::cos(angle),radius*std::sin(angle),z);
      const auto a=BRepClass3d_SolidClassifier(source,p,rt::validationTolerance).State(),b=BRepClass3d_SolidClassifier(built.candidate,p,rt::validationTolerance).State();
      rt::require(BRepClass3d_SolidClassifier(rotated.shape,p.Transformed(pose),rt::validationTolerance).State()==b,"Rigid world result changed the through-hole");
      const bool passed=a==b&&((a==TopAbs_IN)==(radius>2))&&(a==TopAbs_IN||a==TopAbs_OUT);holeSamplesPass&=passed;
      r["holeSamples"].push_back({{"point",{p.X(),p.Y(),p.Z()}},{"source",int(a)},{"candidate",int(b)},{"expectedMaterial",radius>2},{"passed",passed}});
    }
    r["holeMaterialUnchanged"]=holeSamplesPass;
    r["rigidWorldMaterialChecks"]=534;r["rigidWorldMaterialPassed"]=true;
    r["sourceStillValid"]=BRepCheck_Analyzer(source,true).IsValid();
    r["sourceVolumeUnchanged"]=std::abs(base.Mass()-originalVolume.Mass())<1e-8;
    r["accepted"]=r["brepValid"].get<bool>()&&outside&&mismatches==0&&added==0&&volumeError<1e-6&&
      facesPreserved&&holeKept&&endsKept&&endpointsKept&&replacement.sourceArcWasUnsplit&&replacement.cylinderSurfacesPreserved&&holeSamplesPass&&
      r["sourceStillValid"].get<bool>()&&r["sourceVolumeUnchanged"].get<bool>()&&
      std::abs(base.Mass()-expectedBase)<1e-6&&std::all_of(r["seams"].begin(),r["seams"].end(),[](const auto& s){return s.at("passed").template get<bool>();});
    BRepTools::Write(built.candidate,(std::string(argv[1])+"/native-local-replacement.brep").c_str());
    r["limits"]="One tested saved source with unrelated through-hole. Canonical Z frame and +Y patch; no arbitrary frame/trim, curve corners, full-boundary G1, worker/API/page/save or production acceptance.";
  }catch(const Standard_Failure& ex){r["failure"]=ex.GetMessageString();}catch(const std::exception& ex){r["failure"]=ex.what();}
  r["elapsedMs"]=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-started).count();
  std::ofstream file(std::string(argv[1])+"/native-local-replacement-result.json");file<<r.dump(2)<<'\n';
  auto summary=r;summary.erase("materialSamples");summary.erase("holeSamples");std::cout<<summary.dump(2)<<'\n';return r.at("accepted").get<bool>()?0:1;
}
