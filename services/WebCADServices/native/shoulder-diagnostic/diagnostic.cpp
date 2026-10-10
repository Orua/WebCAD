#include <BRepTools.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepCheck_Wire.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <ShapeAnalysis_Wire.hxx>
#include <ShapeExtend_WireData.hxx>
#include <Geom2dAPI_InterCurveCurve.hxx>
#include <Geom2d_TrimmedCurve.hxx>
#include <Geom_Surface.hxx>
#include <Geom_Curve.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <Standard_Version.hxx>
#include <IntRes2d_IntersectionPoint.hxx>
#include <IntRes2d_IntersectionSegment.hxx>
#include <IntRes2d_SequenceOfIntersectionPoint.hxx>
#include <TColgp_SequenceOfPnt.hxx>
#include <TColStd_SequenceOfReal.hxx>
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
#include <vector>
#include <cmath>
using json=nlohmann::json;
json xyz(const gp_Pnt& p){return {p.X(),p.Y(),p.Z()};}
json uv(const gp_Pnt2d& p){return {p.X(),p.Y()};}
const char* orient(TopAbs_Orientation o){switch(o){case TopAbs_FORWARD:return "FORWARD";case TopAbs_REVERSED:return "REVERSED";case TopAbs_INTERNAL:return "INTERNAL";default:return "EXTERNAL";}}
const char* status(BRepCheck_Status s){switch(s){case BRepCheck_NoError:return "NoError";case BRepCheck_SelfIntersectingWire:return "SelfIntersectingWire";case BRepCheck_UnorientableShape:return "UnorientableShape";case BRepCheck_NotClosed:return "NotClosed";case BRepCheck_NotConnected:return "NotConnected";case BRepCheck_BadOrientationOfSubshape:return "BadOrientationOfSubshape";default:return "OtherStatus";}}
const char* surfaceType(GeomAbs_SurfaceType s){switch(s){case GeomAbs_Plane:return "PLANE";case GeomAbs_Cylinder:return "CYLINDER";case GeomAbs_BSplineSurface:return "BSPLINE";default:return "OTHER";}}
TopoDS_Shape read(const std::string& path){BRep_Builder b;TopoDS_Shape s;if(!BRepTools::Read(s,path.c_str(),b)||s.IsNull())throw std::runtime_error("Cannot read "+path);return s;}
json statuses(const Handle(BRepCheck_Result)& r,const TopoDS_Shape* context=nullptr){json a=json::array();const auto& ls=context?r->StatusOnShape(*context):r->Status();for(BRepCheck_ListIteratorOfListOfStatus it(ls);it.More();it.Next())a.push_back({{"code",int(it.Value())},{"name",status(it.Value())}});return a;}
json faceReport(const TopoDS_Face& f,int index,const TopTools_IndexedMapOfShape& edges,const TopTools_IndexedMapOfShape& vertices){
 BRepAdaptor_Surface surf(f,false);BRepCheck_Analyzer analyzer(f,true);json out={{"faceIndex",index},{"surfaceType",surfaceType(surf.GetType())},{"orientation",orient(f.Orientation())},{"valid",bool(analyzer.IsValid())},{"status",statuses(analyzer.Result(f))}};
 double u0,u1,v0,v1;BRepTools::UVBounds(f,u0,u1,v0,v1);out["uvBounds"]={u0,u1,v0,v1};
 GProp_GProps props;BRepGProp::SurfaceProperties(f,props);out["area"]=props.Mass();out["center"]=xyz(props.CentreOfMass());
 if(surf.GetType()==GeomAbs_Cylinder)out["radius"]=surf.Cylinder().Radius();
 out["wires"]=json::array();int wi=0;
 for(TopExp_Explorer we(f,TopAbs_WIRE);we.More();we.Next()){
  auto w=TopoDS::Wire(we.Current());BRepCheck_Wire check(w);TopoDS_Edge a,b;auto si=check.SelfIntersect(f,a,b);ShapeAnalysis_Wire sa(w,f,1e-7);
  json wr={{"wireIndex",++wi},{"orientation",orient(w.Orientation())},{"selfIntersect",status(si)},{"selfIntersectCode",int(si)},{"firstFailureEdgePair",{a.IsNull()?0:edges.FindIndex(a),b.IsNull()?0:edges.FindIndex(b)}},{"closed",status(check.Closed())},{"closed2d",status(check.Closed2d(f))},{"orientationCheck",status(check.Orientation(f))},{"shapeAnalysis",{{"orderIssue",bool(sa.CheckOrder())},{"connectedIssue",bool(sa.CheckConnected())},{"edgeCurveIssue",bool(sa.CheckEdgeCurves())},{"adjacentSelfIntersection",bool(sa.CheckSelfIntersection())},{"selfIntersectionDone",bool(sa.StatusSelfIntersection(ShapeExtend_DONE))},{"selfIntersectionFail",bool(sa.StatusSelfIntersection(ShapeExtend_FAIL))}}}};
  std::vector<TopoDS_Edge> ordered;for(BRepTools_WireExplorer it(w,f);it.More();it.Next())ordered.push_back(it.Current());wr["orderedCount"]=ordered.size();int total=0;for(TopExp_Explorer it(w,TopAbs_EDGE);it.More();it.Next())++total;wr["rawCoedgeCount"]=total;
  wr["coedges"]=json::array();
  for(size_t i=0;i<ordered.size();++i){auto e=ordered[i];double cf,cl,pf,pl;TopLoc_Location loc;auto c=BRep_Tool::Curve(e,loc,cf,cl);auto pc=BRep_Tool::CurveOnSurface(e,f,pf,pl);auto s=BRep_Tool::Surface(f);TopoDS_Vertex vs,vt;TopExp::Vertices(e,vs,vt,true);
   json er={{"order",i+1},{"edgeId",edges.FindIndex(e)},{"orientation",orient(e.Orientation())},{"sameParameter",bool(BRep_Tool::SameParameter(e))},{"sameRange",bool(BRep_Tool::SameRange(e))},{"tolerance",BRep_Tool::Tolerance(e)},{"degenerated",bool(BRep_Tool::Degenerated(e))},{"curveRange",{cf,cl}},{"pcurveRange",{pf,pl}},{"vertexIds",{vertices.FindIndex(vs),vertices.FindIndex(vt)}}};
   if(!c.IsNull())er["curveType"]=c->DynamicType()->Name();if(!pc.IsNull())er["pcurveType"]=pc->DynamicType()->Name();
   if(!vs.IsNull()&&!vt.IsNull()){er["vertices"]={xyz(BRep_Tool::Pnt(vs)),xyz(BRep_Tool::Pnt(vt))};auto next=ordered[(i+1)%ordered.size()];TopoDS_Vertex ns,nt;TopExp::Vertices(next,ns,nt,true);if(!ns.IsNull()){er["nextVertexShared"]=bool(vt.IsSame(ns));er["next3dGap"]=BRep_Tool::Pnt(vt).Distance(BRep_Tool::Pnt(ns));}}
   if(!pc.IsNull()){
    double ps=e.Orientation()==TopAbs_REVERSED?pl:pf,pt=e.Orientation()==TopAbs_REVERSED?pf:pl;er["orientedUVEndpoints"]={uv(pc->Value(ps)),uv(pc->Value(pt))};er["surfaceEndpoints"]={xyz(s->Value(pc->Value(ps).X(),pc->Value(ps).Y())),xyz(s->Value(pc->Value(pt).X(),pc->Value(pt).Y()))};
    if(!vs.IsNull()&&!vt.IsNull())er["vertexSurfaceEndpointErrors"]={BRep_Tool::Pnt(vs).Distance(s->Value(pc->Value(ps).X(),pc->Value(ps).Y())),BRep_Tool::Pnt(vt).Distance(s->Value(pc->Value(pt).X(),pc->Value(pt).Y()))};
    json samples=json::array();for(double t:{0.,0.25,0.5,0.75,1.}){double p=pf+(pl-pf)*t;auto q=pc->Value(p);json sample={{"p",p},{"uv",uv(q)}};if(!c.IsNull())sample["curveSurfaceGap"]=c->Value(p).Transformed(loc.Transformation()).Distance(s->Value(q.X(),q.Y()));samples.push_back(sample);}er["finiteSamples"]=samples;
   }wr["coedges"].push_back(er);
  }
  // ShapeAnalysis advanced checks use its own raw wire order, recorded explicitly.
  wr["shapeAnalysisPairs"]=json::array();auto data=sa.WireData();for(int i=1;i<=data->NbEdges();++i){for(int j=i;j<=data->NbEdges();++j){IntRes2d_SequenceOfIntersectionPoint p2;TColgp_SequenceOfPnt p3;TColStd_SequenceOfReal errors;bool hit=i==j?sa.CheckSelfIntersectingEdge(i,p2,p3):sa.CheckIntersectingEdges(i,j,p2,p3,errors);if(hit||sa.LastCheckStatus(ShapeExtend_FAIL)){json r={{"rawIndices",{i,j}},{"edgeIds",{edges.FindIndex(data->Edge(i)),edges.FindIndex(data->Edge(j))}},{"hit",hit},{"failed",bool(sa.LastCheckStatus(ShapeExtend_FAIL))},{"points",json::array()}};for(int k=1;k<=p2.Length();++k){auto p=p2.Value(k);r["points"].push_back({{"uv",uv(p.Value())},{"params",{p.ParamOnFirst(),p.ParamOnSecond()}}});}wr["shapeAnalysisPairs"].push_back(r);}}}
  // Complete pairwise trimmed-PCurve intersection, including non-adjacent overlaps.
  wr["intersections"]=json::array();for(size_t i=0;i<ordered.size();++i)for(size_t j=i+1;j<ordered.size();++j){double af,al,bf,bl;auto ac=BRep_Tool::CurveOnSurface(ordered[i],f,af,al);auto bc=BRep_Tool::CurveOnSurface(ordered[j],f,bf,bl);if(ac.IsNull()||bc.IsNull()||al<=af||bl<=bf)continue;try{Handle(Geom2d_Curve) at=new Geom2d_TrimmedCurve(ac,af,al),bt=new Geom2d_TrimmedCurve(bc,bf,bl);Geom2dAPI_InterCurveCurve inter(at,bt,1e-7);if(!inter.Intersector().IsDone()){wr["intersections"].push_back({{"orders",{i+1,j+1}},{"error","intersector not done"}});continue;}if(!inter.NbPoints()&&!inter.NbSegments())continue;json pair={{"orders",{i+1,j+1}},{"edgeIds",{edges.FindIndex(ordered[i]),edges.FindIndex(ordered[j])}},{"points",json::array()},{"overlaps",json::array()}};for(int k=1;k<=inter.NbPoints();++k){auto p=inter.Intersector().Point(k);pair["points"].push_back({{"uv",uv(p.Value())},{"params",{p.ParamOnFirst(),p.ParamOnSecond()}}});}for(int k=1;k<=inter.NbSegments();++k){auto seg=inter.Intersector().Segment(k);json r={{"hasFirst",bool(seg.HasFirstPoint())},{"hasLast",bool(seg.HasLastPoint())}};if(seg.HasFirstPoint()){auto p=seg.FirstPoint();r["first"]={{"uv",uv(p.Value())},{"params",{p.ParamOnFirst(),p.ParamOnSecond()}}};}if(seg.HasLastPoint()){auto p=seg.LastPoint();r["last"]={{"uv",uv(p.Value())},{"params",{p.ParamOnFirst(),p.ParamOnSecond()}}};}pair["overlaps"].push_back(r);}wr["intersections"].push_back(pair);}catch(const Standard_Failure& ex){wr["intersections"].push_back({{"orders",{i+1,j+1}},{"error",ex.GetMessageString()}});}}
  out["wires"].push_back(wr);
 }return out;
}
json report(const std::string& path){auto s=read(path);TopTools_IndexedMapOfShape fs,es,vs,solids;TopExp::MapShapes(s,TopAbs_FACE,fs);TopExp::MapShapes(s,TopAbs_EDGE,es);TopExp::MapShapes(s,TopAbs_VERTEX,vs);TopExp::MapShapes(s,TopAbs_SOLID,solids);GProp_GProps props;BRepGProp::VolumeProperties(s,props);BRepCheck_Analyzer a(s,true);json o={{"path",path},{"valid",bool(a.IsValid())},{"solids",solids.Extent()},{"faces",fs.Extent()},{"edges",es.Extent()},{"volume",props.Mass()},{"faceReports",json::array()}};for(int i=1;i<=fs.Extent();++i)o["faceReports"].push_back(faceReport(TopoDS::Face(fs(i)),i-1,es,vs));return o;}
int main(int argc,char** argv){try{if(argc!=3){std::cerr<<"ShoulderDiagnostic INPUT_DIRECTORY REPORT_JSON\n";return 2;}json o={{"occtVersion",OCC_VERSION_COMPLETE},{"mode","read-only persisted BRep; no Cut/Fuse/Sew/healing"},{"indexScope","faceIndex zero-based; edgeId/vertexId one-based within each loaded file"},{"intersectionTolerance",1e-7},{"endpointEvidence","finite samples; not a strict whole-curve guarantee"},{"shapes",json::object()}};for(const char* name:{"baseline","cutter","invalid-result","invalid-face"}){o["shapes"][name]=report(std::string(argv[1])+"/"+name+".brep");std::cout<<name<<": valid="<<o["shapes"][name]["valid"]<<" solids="<<o["shapes"][name]["solids"]<<" faces="<<o["shapes"][name]["faces"]<<"\n";}std::ofstream out(argv[2]);out<<o.dump(2)<<"\n";if(!out)throw std::runtime_error("Cannot write report");return 0;}catch(const Standard_Failure& e){std::cerr<<e.GetMessageString()<<"\n";return 3;}catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 4;}}
