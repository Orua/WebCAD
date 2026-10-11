#pragma once
#include "relief_shoulder_construction.hxx"
#include <BRepAdaptor_Surface.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <algorithm>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepPrimAPI_MakeRevol.hxx>
#include <BRepAlgoAPI_Cut.hxx>

// Bounded source operation. Never reconstruct the caller's body from a fixture.
namespace webcad::relief_shoulder {
inline bool frameEqual(double a,double b) {return std::abs(a-b)<=1e-10;}
inline std::vector<TopoDS_Face> sourceFaces(const TopoDS_Shape& shape) {
  std::vector<TopoDS_Face> out;for(TopExp_Explorer e(shape,TopAbs_FACE);e.More();e.Next())out.push_back(TopoDS::Face(e.Current()));return out;
}
inline std::vector<TopoDS_Edge> sourceEdges(const TopoDS_Shape& shape) {
  std::vector<TopoDS_Edge> out;for(TopExp_Explorer e(shape,TopAbs_EDGE);e.More();e.Next())out.push_back(TopoDS::Edge(e.Current()));return out;
}
template<class T> inline T uniqueSource(const std::vector<T>& values,const char* reason) {
  rt::require(values.size()==1,reason);return values.front();
}
inline bool hasEdge(const TopoDS_Face& face,const TopoDS_Edge& edge) {
  for(const auto& e:sourceEdges(face))if(e.IsSame(edge))return true;return false;
}
inline bool canonicalCylinder(const TopoDS_Face& face,double radius) {
  BRepAdaptor_Surface a(face);if(a.GetType()!=GeomAbs_Cylinder)return false;
  const auto c=a.Cylinder();const auto p=c.Location();
  return frameEqual(c.Radius(),radius)&&frameEqual(p.X(),0)&&frameEqual(p.Y(),0)&&frameEqual(p.Z(),0)&&frameEqual(c.Axis().Direction().Z(),1)&&frameEqual(c.Position().XDirection().X(),1);
}
inline bool horizontalSource(const TopoDS_Face& face,double z) {
  BRepAdaptor_Surface a(face);if(a.GetType()!=GeomAbs_Plane)return false;const auto p=a.Plane();
  return frameEqual(p.Location().Z(),z)&&frameEqual(p.Axis().Direction().Z(),1)&&frameEqual(p.Position().XDirection().X(),1);
}
struct Replacement {
  Result geometry;
  std::vector<TopoDS_Face> retained;
  std::vector<TopoDS_Vertex> reusedEndpoints;
  bool sourceArcWasUnsplit, cylinderSurfacesPreserved;
};

// Infer all source dimensions from the explicitly selected current face. Only
// axial width and retained end-strip length are user construction parameters.
inline Spec inferSpec(const TopoDS_Solid& source,const TopoDS_Face& selected,
                      double width,double protection) {
  rt::require(std::isfinite(width)&&std::isfinite(protection)&&width>0&&protection>0,
    "shoulder: positive finite width and end protection required");
  const auto faces=sourceFaces(source);
  rt::require(std::any_of(faces.begin(),faces.end(),[&](const auto& f){return f.IsSame(selected);}),
    "shoulder: selected face does not belong to source");
  rt::require(selected.Location().IsIdentity()&&selected.Orientation()==TopAbs_REVERSED,
    "shoulder: select the lower horizontal layer step");
  const BRepAdaptor_Surface plane(selected);
  rt::require(plane.GetType()==GeomAbs_Plane&&horizontalSource(selected,plane.Plane().Location().Z()),
    "shoulder: canonical horizontal step required");
  const auto edges=sourceEdges(selected);
  rt::require(edges.size()==4,"shoulder: one unsplit four-edge step required");
  int wires=0;for(TopExp_Explorer e(selected,TopAbs_WIRE);e.More();e.Next())++wires;
  rt::require(wires==1,"shoulder: step holes are unsupported");
  std::vector<TopoDS_Edge> arcs;
  for(const auto& edge:edges){BRepAdaptor_Curve c(edge);if(c.GetType()==GeomAbs_Circle)arcs.push_back(edge);
    else rt::require(c.GetType()==GeomAbs_Line,"shoulder: unsupported step boundary");}
  rt::require(arcs.size()==2,"shoulder: two circular support boundaries required");
  std::sort(arcs.begin(),arcs.end(),[](const auto& a,const auto& b){return BRepAdaptor_Curve(a).Circle().Radius()<BRepAdaptor_Curve(b).Circle().Radius();});
  const double r=BRepAdaptor_Curve(arcs[0]).Circle().Radius(),h=BRepAdaptor_Curve(arcs[1]).Circle().Radius();
  std::vector<TopoDS_Face> supports;
  double angles[2][2];
  for(int i=0;i<2;++i){
    BRepAdaptor_Curve curve(arcs[i]);const auto c=curve.Circle();
    rt::require(frameEqual(c.Location().X(),0)&&frameEqual(c.Location().Y(),0)&&
      frameEqual(c.Location().Z(),plane.Plane().Location().Z())&&frameEqual(c.Axis().Direction().Z(),1)&&
      frameEqual(c.Position().XDirection().X(),1),"shoulder: unsupported circular frame");
    angles[i][0]=curve.FirstParameter();angles[i][1]=curve.LastParameter();
    std::vector<TopoDS_Face> adjacent;
    for(const auto& f:faces)if(!f.IsSame(selected)&&hasEdge(f,arcs[i]))adjacent.push_back(f);
    const auto support=uniqueSource(adjacent,"shoulder: ambiguous support adjacency");
    rt::require(canonicalCylinder(support,i?h:r)&&support.Orientation()==TopAbs_FORWARD,
      "shoulder: coaxial outward supports required");supports.push_back(support);
  }
  rt::require(frameEqual(angles[0][0],angles[1][0])&&frameEqual(angles[0][1],angles[1][1]),
    "shoulder: support angular ranges differ");
  const double z0=plane.Plane().Location().Z();std::vector<double> upper;
  for(const auto& edge:sourceEdges(supports[1])){BRepAdaptor_Curve c(edge);
    if(c.GetType()==GeomAbs_Circle&&c.Circle().Location().Z()>z0+rt::validationTolerance)
      upper.push_back(c.Circle().Location().Z());}
  rt::require(upper.size()==1,"shoulder: unique upper layer boundary required");
  Bnd_Box box;BRepBndLib::AddOptimal(source,box,false,false);double x0,y0,bz0,x1,y1,bz1;box.Get(x0,y0,bz0,x1,y1,bz1);
  rt::require(std::abs(bz0)<1e-6,"shoulder: canonical body base required");
  Spec spec;spec.radiusMm=r;spec.layerHeightMm=h-r;spec.bodyHeightMm=bz1;
  spec.regionZStartMm=z0;spec.regionZEndMm=upper.front();
  spec.regionAngleStartRad=angles[0][0]-pi/2;spec.regionAngleEndRad=angles[0][1]-pi/2;
  spec.shoulderWidthMm=width;spec.endProtectionMm=protection;
  return spec;
}

class LocalReplacement:private Construction {
  TopoDS_Edge circleBoundary(const TopoDS_Face& face,double radius,double z) {
    std::vector<TopoDS_Edge> found;
    for(auto e:sourceEdges(face)) {
      BRepAdaptor_Curve a(e);if(a.GetType()!=GeomAbs_Circle)continue;
      const auto c=a.Circle();const auto p=c.Location();
      if(frameEqual(c.Radius(),radius)&&frameEqual(p.X(),0)&&frameEqual(p.Y(),0)&&frameEqual(p.Z(),z))found.push_back(TopoDS::Edge(e.Oriented(TopAbs_FORWARD)));
    }
    return uniqueSource(found,"local replacement: ambiguous source circle");
  }
  TopoDS_Face replaceTrim(const TopoDS_Face& original,const TopoDS_Edge& old,const std::vector<Edge>& replacements,bool copySourcePCurve) {
    const auto forward=TopoDS::Face(original.Oriented(TopAbs_FORWARD));
    auto rebuilt=TopoDS::Face(forward.EmptyCopied());const auto outer=BRepTools::OuterWire(forward);int changed=0;
    for(const auto& e:replacements) {
      double first,last;auto pc=copySourcePCurve?BRep_Tool::CurveOnSurface(old,forward,first,last):pcurve(e,SurfaceKind::Cylinder);
      rt::require(!pc.IsNull(),"local replacement: missing source PCurve");
      builder.UpdateEdge(e.shape,pc,rebuilt,rt::validationTolerance);builder.Range(e.shape,rebuilt,e.first,e.last);
    }
    for(TopExp_Explorer it(forward,TopAbs_WIRE);it.More();it.Next()) {
      auto wire=TopoDS::Wire(it.Current());const auto oldEdges=sourceEdges(wire);
      const auto count=std::count_if(oldEdges.begin(),oldEdges.end(),[&](const auto& e){return e.IsSame(old);});
      if(count) {
        rt::require(count==1,"local replacement: cannot split periodic seam");
        TopoDS_Wire newWire;builder.MakeWire(newWire);
        for(const auto& e:oldEdges)if(!e.IsSame(old))builder.Add(newWire,e);
        for(const auto& e:replacements)builder.Add(newWire,e.shape);
        builder.Add(rebuilt,rt::orderedWire({newWire,wire.IsSame(outer)?rt::WireRole::Outer:rt::WireRole::Inner},rebuilt,receipt));++changed;
      }else builder.Add(rebuilt,wire); // Preserve unrelated wires, including periodic seams.
    }
    rt::require(changed==1,"local replacement: ambiguous trim");rebuilt.Orientation(original.Orientation());
    rt::require(BRepCheck_Analyzer(rebuilt,true).IsValid(),"local replacement: invalid rebuilt trim");return rebuilt;
  }
public:
  explicit LocalReplacement(const Spec& s):Construction(s){}
  Replacement apply(const TopoDS_Solid& source) {
    rt::require(BRepCheck_Analyzer(source,true).IsValid(),"local replacement: invalid source");
    const auto oldFaces=sourceFaces(source);std::vector<TopoDS_Face> lowMatches,highMatches;
    for(const auto& f:oldFaces) {
      rt::require(f.Location().IsIdentity(),"local replacement: nonidentity frame unsupported");
      if(canonicalCylinder(f,R))lowMatches.push_back(f);if(canonicalCylinder(f,H))highMatches.push_back(f);
    }
    const auto low=uniqueSource(lowMatches,"local replacement: ambiguous low cylinder"),high=uniqueSource(highMatches,"local replacement: ambiguous crest cylinder");
    rt::require(low.Orientation()==TopAbs_FORWARD&&high.Orientation()==TopAbs_FORWARD,"local replacement: unsupported material side");
    const auto le=circleBoundary(low,R,z0),he=circleBoundary(high,H,z0);
    std::vector<TopoDS_Face> stepMatches;
    for(const auto& f:oldFaces)if(horizontalSource(f,z0)&&hasEdge(f,le)&&hasEdge(f,he))stepMatches.push_back(f);
    const auto step=uniqueSource(stepMatches,"local replacement: ambiguous lower step");
    rt::require(step.Orientation()==TopAbs_REVERSED&&sourceEdges(step).size()==4,"local replacement: unsupported lower step");
    for(const auto& e:{le,he})rt::require(std::count_if(oldFaces.begin(),oldFaces.end(),[&](const auto& f){return hasEdge(f,e);})==2,"local replacement: source boundary not two-sided");
    std::vector<TopoDS_Vertex> reused;bool unsplit=true;
    for(const auto& pair:std::vector<std::pair<TopoDS_Edge,double>>{{le,R},{he,H}}) {
      double first,last;auto c=BRep_Tool::Curve(pair.first,first,last);
      rt::require(!c.IsNull()&&frameEqual(first,t0)&&frameEqual(last,t1),"local replacement: source arc parameter frame differs");
      unsplit&=frameEqual(last-first,t1-t0);
      TopoDS_Vertex va,vb;TopExp::Vertices(pair.first,va,vb,true);
      for(const auto& endpoint:std::vector<std::pair<double,TopoDS_Vertex>>{{t0,va},{t1,vb}}) {
        rt::require(BRep_Tool::Pnt(endpoint.second).Distance(c->Value(endpoint.first))<=rt::validationTolerance,"local replacement: source endpoint mismatch");
        vertexCache[{pair.second,endpoint.first,z0}]=endpoint.second;reused.push_back(endpoint.second);
      }
    }
    std::vector<Edge> radials;
    for(double t:{t0,t1}) {
      std::vector<TopoDS_Edge> matches;
      for(auto e:sourceEdges(step)) {
        if(e.IsSame(le)||e.IsSame(he)||BRepAdaptor_Curve(e).GetType()!=GeomAbs_Line)continue;
        TopoDS_Vertex va,vb;TopExp::Vertices(e,va,vb,true);bool match=true;
        for(const auto& v:{va,vb}){const auto p=BRep_Tool::Pnt(v);match&=frameEqual(p.Z(),z0)&&frameEqual(std::atan2(p.Y(),p.X()),t);}
        if(match)matches.push_back(TopoDS::Edge(e.Oriented(TopAbs_FORWARD)));
      }
      const auto e=uniqueSource(matches,"local replacement: ambiguous radial side");double a,b;BRep_Tool::Range(e,a,b);
      rt::require(frameEqual(a,R)&&frameEqual(b,H),"local replacement: noncanonical radial range");
      TopoDS_Vertex va,vb;TopExp::Vertices(e,va,vb,true);
      rt::require(va.IsSame(vertex(R,t,z0))&&vb.IsSame(vertex(H,t,z0)),"local replacement: source endpoint identity disconnected");
      radials.push_back({e,EdgeKind::Radial,a,b,0,t,z0});
    }
    auto split=[&](const TopoDS_Edge& original,double r) {
      double first,last;const auto c=BRep_Tool::Curve(original,first,last);std::vector<Edge> result;
      for(const auto& range:std::vector<std::pair<double,double>>{{t0,ta},{ta,tb},{tb,t1}})
        result.push_back(edge(EdgeKind::Arc,c,range.first,range.second,vertex(r,range.first,z0),vertex(r,range.second,z0),r,0,z0));
      return result;
    };
    const auto lo=split(le,R),hi=split(he,H);
    const auto rba=radial(ta,z0),rbb=radial(tb,z0),hsa=axial(H,ta,z0,zs),hsb=axial(H,tb,z0,zs),pa=profile(ta),pb=profile(tb),sh=arc(H,zs,ta,tb);
    const auto newLow=replaceTrim(low,le,lo,true),newHigh=replaceTrim(high,he,{hi[0],hsa,sh,hsb,hi[2]},false);
    std::vector<TopoDS_Face> retained;
    for(const auto& f:oldFaces)if(!f.IsSame(low)&&!f.IsSame(high)&&!f.IsSame(step))retained.push_back(f);
    const auto stepSurface=BRep_Tool::Surface(step);const auto outer=rt::WireRole::Outer;
    auto candidateFaces=retained;candidateFaces.push_back(newLow);candidateFaces.push_back(newHigh);
    candidateFaces.push_back(face(stepSurface,SurfaceKind::Horizontal,{{outer,{lo[0],rba,hi[0],radials[0]}}},step.Orientation()));
    candidateFaces.push_back(face(stepSurface,SurfaceKind::Horizontal,{{outer,{lo[2],radials[1],hi[2],rbb}}},step.Orientation()));
    candidateFaces.push_back(face(meridional(ta),SurfaceKind::Meridional,{{outer,{rba,hsa,pa}}},TopAbs_REVERSED));
    candidateFaces.push_back(face(meridional(tb),SurfaceKind::Meridional,{{outer,{rbb,hsb,pb}}}));
    const auto shoulder=face(shoulderSurface,SurfaceKind::Shoulder,{{outer,{lo[1],pb,sh,pa}}});candidateFaces.push_back(shoulder);
    const auto candidate=solid(candidateFaces);
    const bool surfacesKept=BRep_Tool::Surface(low)==BRep_Tool::Surface(newLow)&&BRep_Tool::Surface(high)==BRep_Tool::Surface(newHigh);
    return {{spec,source,candidate,newLow,newHigh,shoulder,lo[1].shape,sh.shape,t0,t1,ta,tb,retained.size()},retained,reused,unsplit,surfacesKept};
  }
};

struct SourceResult {
  TopoDS_Shape shape;
  Spec spec;
  double coreStart,coreEnd;
  std::size_t retainedFaces;
  bool frameNormalized;
  const char* mechanism;
};

// Projected rectangular contours have unequal angular ranges on the low and
// high cylinders. Cut only their common interior; retain both original ends.
inline SourceResult cutProjectedStep(const TopoDS_Solid& source,const TopoDS_Face& selected,
                                     double width,double protection) {
  rt::require(std::isfinite(width)&&std::isfinite(protection)&&width>=.02&&width<=10&&protection>0,
    "shoulder: invalid width or end protection");
  BRepAdaptor_Surface plane(selected);rt::require(plane.GetType()==GeomAbs_Plane,"shoulder: planar step required");
  const auto normal=plane.Plane().Axis().Direction();const double sign=selected.Orientation()==TopAbs_REVERSED?-1:1;
  rt::require(normal.Z()*sign<-.999999,"shoulder: select lower step");
  const auto edges=sourceEdges(selected);rt::require(edges.size()==4,"shoulder: one four-edge step required");
  std::vector<TopoDS_Edge> arcs;for(const auto& e:edges){BRepAdaptor_Curve c(e);if(c.GetType()==GeomAbs_Circle)arcs.push_back(e);else rt::require(c.GetType()==GeomAbs_Line,"shoulder: straight contour sides required");}
  rt::require(arcs.size()==2,"shoulder: two circular boundaries required");
  std::sort(arcs.begin(),arcs.end(),[](const auto& a,const auto& b){return BRepAdaptor_Curve(a).Circle().Radius()<BRepAdaptor_Curve(b).Circle().Radius();});
  const double R=BRepAdaptor_Curve(arcs[0]).Circle().Radius(),H=BRepAdaptor_Curve(arcs[1]).Circle().Radius(),z=plane.Plane().Location().Z();
  rt::require(R>=1&&H>R&&H-R<=20,"shoulder: unsupported radial height");
  double begin=-1e30,end=1e30,upper=0;TopoDS_Face high;
  for(int i=0;i<2;i++){
    BRepAdaptor_Curve curve(arcs[i]);const auto circle=curve.Circle();
    rt::require(std::hypot(circle.Location().X(),circle.Location().Y())<1e-7&&std::abs(circle.Location().Z()-z)<1e-7&&std::abs(circle.Axis().Direction().Z())>.999999,"shoulder: coaxial arcs required");
    const auto mid=curve.Value((curve.FirstParameter()+curve.LastParameter())/2);const double center=std::atan2(mid.Y(),mid.X());
    double ends[2];for(int j=0;j<2;j++){const auto p=curve.Value(j?curve.LastParameter():curve.FirstParameter());double t=std::atan2(p.Y(),p.X());while(t-center>pi)t-=2*pi;while(t-center<-pi)t+=2*pi;ends[j]=t;}
    const double a=std::min(ends[0],ends[1]),b=std::max(ends[0],ends[1]);
    rt::require(b-a>1e-6&&b-a<=pi/2,"shoulder: short unsplit arc required");begin=std::max(begin,a);end=std::min(end,b);
    std::vector<TopoDS_Face> supports;for(const auto& f:sourceFaces(source))if(!f.IsSame(selected)&&hasEdge(f,arcs[i]))supports.push_back(f);
    const auto support=uniqueSource(supports,"shoulder: ambiguous support");BRepAdaptor_Surface s(support);
    rt::require(s.GetType()==GeomAbs_Cylinder&&support.Orientation()==TopAbs_FORWARD,"shoulder: outward cylinder required");
    const auto c=s.Cylinder();rt::require(std::abs(c.Radius()-(i?H:R))<1e-7&&std::hypot(c.Location().X(),c.Location().Y())<1e-7&&c.Axis().Direction().Z()>.999999,"shoulder: coaxial support required");
    if(i)high=support;
  }
  std::vector<double> tops;for(const auto& e:sourceEdges(high)){BRepAdaptor_Curve c(e);if(c.GetType()==GeomAbs_Circle&&c.Circle().Location().Z()>z+1e-7)tops.push_back(c.Circle().Location().Z());}
  rt::require(tops.size()==1&&width<tops.front()-z,"shoulder: width exceeds crest");upper=tops.front();
  begin+=protection/R;end-=protection/R;rt::require(end>begin,"shoulder: end protection consumes boundary");
  auto point=[&](double r,double h){return gp_Pnt(r*std::cos(begin),r*std::sin(begin),h);};
  TColgp_Array1OfPnt poles(1,4);poles.SetValue(1,point(R,z));poles.SetValue(2,point(R,z+width/3));poles.SetValue(3,point(H,z+2*width/3));poles.SetValue(4,point(H,z+width));
  BRepBuilderAPI_MakeWire wire;wire.Add(BRepBuilderAPI_MakeEdge(new Geom_BezierCurve(poles)).Edge());
  const double margin=.1;const std::vector<gp_Pnt> closing={point(H,z+width),point(H+margin,z+width),point(H+margin,z-margin),point(R,z-margin),point(R,z)};
  for(std::size_t i=1;i<closing.size();i++)wire.Add(BRepBuilderAPI_MakeEdge(closing[i-1],closing[i]).Edge());
  const auto tool=BRepPrimAPI_MakeRevol(BRepBuilderAPI_MakeFace(wire.Wire()).Face(),gp_Ax1(gp_Pnt(),gp_Dir(0,0,1)),end-begin,true).Shape();
  BRepAlgoAPI_Cut cut;TopTools_ListOfShape args,tools;args.Append(source);tools.Append(tool);cut.SetArguments(args);cut.SetTools(tools);cut.SetNonDestructive(true);cut.Build();
  rt::require(cut.IsDone()&&BRepCheck_Analyzer(cut.Shape(),true).IsValid(),"shoulder: native cutter failed");
  int solids=0;for(TopExp_Explorer e(cut.Shape(),TopAbs_SOLID);e.More();e.Next())++solids;rt::require(solids==1,"shoulder: cutter must retain one solid");
  std::size_t retained=0;const auto resultFaces=sourceFaces(cut.Shape());for(const auto& f:sourceFaces(source))if(std::any_of(resultFaces.begin(),resultFaces.end(),[&](const auto& g){return f.IsSame(g);}))++retained;
  Spec spec;spec.radiusMm=R;spec.layerHeightMm=H-R;spec.regionZStartMm=z;spec.regionZEndMm=upper;spec.shoulderWidthMm=width;spec.endProtectionMm=protection;
  return {cut.Shape(),spec,begin,end,retained,false,"native-revolved-cutter"};
}
inline SourceResult run(const TopoDS_Solid& source,const TopoDS_Face& selected,double width,double protection){
  // Rigid normalization follows the actual low cylinder's parametric frame.
  // It changes neither model scale nor the caller's selected source topology.
  std::vector<TopoDS_Face> cylinders;
  for(const auto& f:sourceFaces(source)){
    if(BRepAdaptor_Surface(f).GetType()!=GeomAbs_Cylinder)continue;
    bool adjacent=false;for(const auto& edge:sourceEdges(selected))adjacent|=hasEdge(f,edge);
    if(adjacent)cylinders.push_back(f);
  }
  rt::require(cylinders.size()==2,"shoulder: exactly two adjacent cylindrical supports required");
  std::sort(cylinders.begin(),cylinders.end(),[](const auto& a,const auto& b){return BRepAdaptor_Surface(a).Cylinder().Radius()<BRepAdaptor_Surface(b).Cylinder().Radius();});
  gp_Trsf normalization;normalization.SetTransformation(BRepAdaptor_Surface(cylinders.front()).Cylinder().Position());
  const bool transformed=normalization.Form()!=gp_Identity;
  BRepBuilderAPI_Transform normalize(source,normalization,true);
  const auto local=TopoDS::Solid(normalize.Shape());const auto mapped=normalize.ModifiedShape(selected);
  // 7.8's ModifiedShape map does not preserve an occurrence's orientation.
  // Recover the unique actual face occurrence in the transformed solid.
  std::vector<TopoDS_Face> matches;for(const auto& f:sourceFaces(local))if(f.IsSame(mapped))matches.push_back(f);
  const auto face=uniqueSource(matches,"shoulder: transformed selection is ambiguous");
  // Choose by source representation before computing. Never retry a failed
  // construction with another algorithm or silently change its dimensions.
  const auto edges=sourceEdges(face);bool canonical=horizontalSource(face,BRepAdaptor_Surface(face).Plane().Location().Z());
  for(const auto& f:sourceFaces(local)){BRepAdaptor_Surface s(f);if(s.GetType()==GeomAbs_Cylinder&&std::any_of(edges.begin(),edges.end(),[&](const auto& e){return hasEdge(f,e);}))canonical&=canonicalCylinder(f,s.Cylinder().Radius());}
  SourceResult result;
  if(canonical){const auto spec=inferSpec(local,face,width,protection);const auto replacement=LocalReplacement(spec).apply(local);result={replacement.geometry.candidate,spec,replacement.geometry.coreStart,replacement.geometry.coreEnd,replacement.retained.size(),transformed,"shared-boundary-replacement"};}
  else result=cutProjectedStep(local,face,width,protection);
  const auto restored=BRepBuilderAPI_Transform(result.shape,normalization.Inverted(),true).Shape();
  rt::require(BRepCheck_Analyzer(restored,true).IsValid(),"shoulder: invalid restored world result");
  result.shape=restored;result.frameNormalized=transformed;return result;
}
} // namespace webcad::relief_shoulder
