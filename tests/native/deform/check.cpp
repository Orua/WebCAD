#include <BRepCheck_Analyzer.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepFilletAPI_MakeFillet.hxx>
#include <BRepGProp.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Geom_Surface.hxx>
#include <Geom_Curve.hxx>
#include <GeomAdaptor_Curve.hxx>
#include <GeomAbs_CurveType.hxx>
#include <GProp_GProps.hxx>
#include <TopTools_FormatVersion.hxx>
#include <TopoDS_Shape.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <nlohmann/json.hpp>
#include <gp_Ax2.hxx>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include "../../../services/WebCADServices/native/occt-worker/deform.hxx"

using json = nlohmann::json;

static void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
static void solid(const TopoDS_Shape& shape, const char* label) {
  require(!shape.IsNull(), label);
  require(BRepCheck_Analyzer(shape, true).IsValid(), label);
  int count = 0; for (TopExp_Explorer ex(shape, TopAbs_SOLID); ex.More(); ex.Next()) ++count;
  require(count == 1, label);
}
static std::pair<gp_Pnt2d, int> bottomFaceMidpoint(const TopoDS_Shape& shape) {
  TopTools_IndexedMapOfShape faces; TopExp::MapShapes(shape, TopAbs_FACE, faces);
  for (int i = 1; i <= faces.Extent(); ++i) {
    const auto face=TopoDS::Face(faces(i));TopLoc_Location location;const auto surface=BRep_Tool::Surface(face,location);double u0,u1,v0,v1;BRepTools::UVBounds(face,u0,u1,v0,v1);
    const gp_Pnt2d uv((u0+u1)/2,(v0+v1)/2);if(std::abs(surface->Value(uv.X(),uv.Y()).Transformed(location.Transformation()).Z())<1e-8)return {uv,i};
  }
  throw std::runtime_error("Could not locate the bottom surface fixture sample");
}
static gp_Pnt facePoint(const TopoDS_Shape& shape,int index,const gp_Pnt2d& uv){
  TopTools_IndexedMapOfShape faces;TopExp::MapShapes(shape,TopAbs_FACE,faces);TopLoc_Location location;const auto surface=BRep_Tool::Surface(TopoDS::Face(faces(index)),location);return surface->Value(uv.X(),uv.Y()).Transformed(location.Transformation());
}

int main(int argc, char** argv) {
  try {
    std::cout.precision(17);
    if (argc != 3) throw std::runtime_error("Pass one existing WebCAD BRep candidate path and an evidence directory");
    std::ifstream source(argv[1], std::ios::binary); BRep_Builder brepBuilder; TopoDS_Shape candidate;
    require(bool(source), "Existing WebCAD BRep candidate could not be opened"); BRepTools::Read(candidate, source, brepBuilder);
    require(!candidate.IsNull(), "Existing WebCAD BRep candidate could not be read");
    solid(candidate, "Real candidate is not one valid solid");
    std::filesystem::create_directories(argv[2]);
    { std::ofstream out(std::string(argv[2]) + "/candidate.brep", std::ios::binary); BRepTools::Write(candidate, out, false, false, TopTools_FormatVersion_VERSION_3); require(bool(out), "Could not write candidate test BRep"); }
    const double before = webcad::deform::volume(candidate);
    json report;
    const auto scaled = webcad::deform::run(candidate, {{"kind", "scaleXYZ"}, {"scaleXYZ", {1.25, 0.8, 1.1}}}, "deform", before, report);
    solid(scaled, "scaleXYZ did not produce one valid solid");
    const double scaleRatio = webcad::deform::volume(scaled) / before;
    require(std::abs(scaleRatio - 1.25 * 0.8 * 1.1) < 1e-7, "scaleXYZ volume differs from determinant");
    std::cout << "realCandidateScaleXYZ={\"sourceVolumeMm3\":" << before << ",\"resultVolumeMm3\":" << webcad::deform::volume(scaled) << ",\"ratio\":" << scaleRatio << "}\n";
    const auto candidateBounds = webcad::deform::bounds(candidate);
    json candidateBend{{"kind", "bend"}, {"axis", "x"}, {"angleDeg", 15}, {"rangeMm", {candidateBounds[0][0], candidateBounds[1][0]}}, {"center", {(candidateBounds[0][0] + candidateBounds[1][0]) / 2, (candidateBounds[0][1] + candidateBounds[1][1]) / 2, (candidateBounds[0][2] + candidateBounds[1][2]) / 2}}};
    try {
      const auto bentCandidate = webcad::deform::run(candidate, candidateBend, "deform", before, report); solid(bentCandidate, "Real candidate bend did not preserve one valid solid");
      std::cout << "realCandidateBend={\"ok\":true,\"beforeVolumeMm3\":" << before << ",\"resultVolumeMm3\":" << webcad::deform::volume(bentCandidate) << ",\"mapping\":" << report.dump() << "}\n";
    } catch (const std::exception& error) {
      require(std::abs(webcad::deform::volume(candidate) - before) < 1e-9, "Failed deformation changed the source candidate");
      std::cout << "realCandidateBend={\"ok\":false,\"sourcePreserved\":true,\"reason\":\"" << error.what() << "\"}\n";
    }

    const TopoDS_Shape unitSphere = BRepPrimAPI_MakeSphere(1.0).Shape();
    solid(unitSphere, "Unit sphere fixture is invalid");
    { std::ofstream out(std::string(argv[2]) + "/unit-sphere.brep", std::ios::binary); BRepTools::Write(unitSphere, out, false, false, TopTools_FormatVersion_VERSION_3); require(bool(out), "Could not write sphere test BRep"); }
    const auto ellipsoid = webcad::deform::run(unitSphere, {{"kind", "ellipsoid"}, {"radiiMm", {2.0, 3.0, 4.0}}}, "deform", webcad::deform::volume(unitSphere), report);
    solid(ellipsoid, "Ellipsoid did not produce one valid solid");
    const double expectedEllipsoid = 4.0 * webcad::deform::pi * 2 * 3 * 4 / 3;
    const double ellipsoidRelativeError = std::abs(webcad::deform::volume(ellipsoid) - expectedEllipsoid) / expectedEllipsoid;
    require(ellipsoidRelativeError < 0.005, "Ellipsoid volume error exceeded 0.5 percent");
    std::cout << "ellipsoid={\"integration\":\"BRepGProp::VolumeProperties (adaptive Gauss-Kronrod)\",\"expectedVolumeMm3\":" << expectedEllipsoid << ",\"resultVolumeMm3\":" << webcad::deform::volume(ellipsoid) << ",\"relativeError\":" << ellipsoidRelativeError << "}\n";

    auto box = BRepPrimAPI_MakeBox(10, 20, 30).Shape(); solid(box, "NURBS mechanism fixture is invalid");
    { std::ofstream out(std::string(argv[2]) + "/box.brep", std::ios::binary); BRepTools::Write(box, out, false, false, TopTools_FormatVersion_VERSION_3); require(bool(out), "Could not write NURBS test BRep"); }
    const double boxVolume = webcad::deform::volume(box);
    std::vector<json> cases;
    cases.push_back(json{{"kind", "bend"}, {"axis", "x"}, {"angleDeg", 15}, {"rangeMm", {0, 10}}, {"center", {0, 10, 15}}});
    cases.push_back(json{{"kind", "twist"}, {"axis", "x"}, {"angleDeg", 15}, {"rangeMm", {0, 10}}, {"center", {0, 10, 15}}});
    cases.push_back(json{{"kind", "taper"}, {"axis", "x"}, {"scaleStart", 0.95}, {"scaleEnd", 1.05}, {"rangeMm", {0, 10}}, {"center", {0, 10, 15}}});
    json ffd{{"kind", "ffd"}};
    ffd["lattice"] = json{{"dims", {3, 3, 3}}, {"boundsMm", {{-0.01, -0.01, -0.01}, {10.01, 20.01, 30.01}}}};
    ffd["displacements"] = json::array({json{{"i", 1}, {"j", 1}, {"k", 0}, {"dMm", {0, 0, 0.5}}}});
    cases.push_back(ffd);
    const auto ffdSample=bottomFaceMidpoint(box);
    TopoDS_Shape postDeformation;
    for (const auto& params : cases) {
      const auto result = webcad::deform::run(box, params, "deform", boxVolume, report); solid(result, "NURBS deformation did not preserve a valid solid");
      if (params.at("kind") == "twist") postDeformation = result;
      if(params.at("kind")=="ffd"){
        const gp_Pnt original=facePoint(box,ffdSample.second,ffdSample.first),actual=facePoint(result,ffdSample.second,ffdSample.first);
        const gp_Pnt expected=webcad::deform::from(webcad::deform::parse(ffd).map(webcad::deform::toArray(original)));
        const double x=(original.X()+0.01)/10.02,y=(original.Y()+0.01)/20.02,z=(original.Z()+0.01)/30.02;
        const double wx=2*x*(1-x),wy=2*y*(1-y),wz=(1-z)*(1-z),weight=wx*wy*wz;
        const double expectedMotion=original.Distance(expected),error=actual.Distance(expected),relativeError=error/expectedMotion;
        require(expectedMotion>0&&relativeError<=0.10,"FFD sampled BRep surface differs from the mathematical displacement field by more than 10%");
        report["samplePointWorldMm"]={original.X(),original.Y(),original.Z()};report["bernsteinWeights"]={{"x",wx},{"y",wy},{"z",wz},{"combined",weight}};
        report["expectedSurfaceDisplacementMm"]=expectedMotion;report["actualSurfaceDisplacementMm"]=original.Distance(actual);
        report["surfaceMapErrorMm"]=error;report["surfaceMapRelativeError"]=relativeError;
      }
      std::cout << params.at("kind").get<std::string>() << "={\"beforeVolumeMm3\":" << boxVolume << ",\"resultVolumeMm3\":" << webcad::deform::volume(result) << ",\"mapping\":" << report.dump() << "}\n";
    }
    require(!postDeformation.IsNull(), "No twisted BRep was retained for downstream operation checks");
    const auto cutter=BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(5,10,-10),gp_Dir(0,0,1)),2.0,60.0).Shape();
    BRepAlgoAPI_Cut cut(postDeformation,cutter);cut.Build();require(cut.IsDone(),"Boolean cut after deformation did not complete");
    const TopoDS_Shape cutShape=cut.Shape();solid(cutShape,"Boolean cut after deformation did not return one valid solid");
    BRepFilletAPI_MakeFillet fillet(cutShape);TopoDS_Edge selectedEdge;double longest=0;
    TopTools_IndexedDataMapOfShapeListOfShape edgeFaces;TopExp::MapShapesAndAncestors(cutShape,TopAbs_EDGE,TopAbs_FACE,edgeFaces);
    for(int edgeIndex=1;edgeIndex<=edgeFaces.Extent();++edgeIndex){
      const auto edge=TopoDS::Edge(edgeFaces.FindKey(edgeIndex));if(BRep_Tool::Degenerated(edge))continue;
      TopTools_IndexedMapOfShape adjacentFaces;for(TopTools_ListIteratorOfListOfShape it(edgeFaces.FindFromIndex(edgeIndex));it.More();it.Next())adjacentFaces.Add(it.Value());
      if(adjacentFaces.Extent()!=2)continue;
      GProp_GProps length;BRepGProp::LinearProperties(edge,length);const double measured=length.Mass();
      if(std::isfinite(measured)&&measured>longest){longest=measured;selectedEdge=edge;}
    }
    require(!selectedEdge.IsNull()&&longest>1.0,"Boolean result has no bounded edge for the fillet check");
    fillet.Add(0.25,selectedEdge);fillet.Build();require(fillet.IsDone(),"Fillet after deformation and Boolean did not complete");
    const TopoDS_Shape filleted=fillet.Shape();solid(filleted,"Fillet after deformation and Boolean did not return one valid solid");
    std::cout<<"postDeformBooleanFillet={\"deformedKind\":\"twist\",\"boolean\":\"cut\",\"booleanValid\":true,\"filletRadiusMm\":0.25,\"filletValid\":true,\"selectedEdgeLengthMm\":"<<longest<<",\"volumeMm3\":"<<webcad::deform::volume(filleted)<<"}\n";
    return 0;
  } catch (const Standard_Failure& error) {
    std::cerr << "OCCT_FAILURE: " << (error.GetMessageString() ? error.GetMessageString() : "unknown") << "\n"; return 2;
  } catch (const std::exception& error) { std::cerr << "FAIL: " << error.what() << "\n"; return 1; }
}
