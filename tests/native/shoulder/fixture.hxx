#pragma once
#include "../../../services/WebCADServices/native/occt-worker/relief_topology.hxx"
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <Geom_BezierCurve.hxx>
#include <Geom_Circle.hxx>
#include <Geom_CylindricalSurface.hxx>
#include <Geom_Line.hxx>
#include <Geom_Plane.hxx>
#include <Geom_SurfaceOfRevolution.hxx>
#include <Geom2d_BezierCurve.hxx>
#include <Geom2d_Circle.hxx>
#include <Geom2d_Line.hxx>
#include <TColgp_Array1OfPnt.hxx>
#include <TColgp_Array1OfPnt2d.hxx>
#include <gp_Ax2d.hxx>
#include <gp_Circ.hxx>
#include <map>
#include <string>
#include <tuple>

// Self-contained TEST fixture factory. This proves a bounded construction
// mechanism; it is not an operation which edits an arbitrary selected host.
namespace webcad::relief_fixture {
namespace rt = relief_topology;
constexpr double pi = 3.14159265358979323846;
struct Spec {
  double radiusMm = 50, bodyHeightMm = 20, layerHeightMm = .505;
  double regionAngleStartRad = -.06, regionAngleEndRad = .06;
  double regionZStartMm = 7, regionZEndMm = 13, shoulderWidthMm = .3, endProtectionMm = .3;
};
struct Result {
  Spec spec;
  TopoDS_Solid baseline, candidate;
  TopoDS_Face lowSupport, highSupport, shoulder;
  TopoDS_Edge lowSeam, highSeam;
  double angleStart, angleEnd, coreStart, coreEnd;
  std::size_t unchangedFaces;
};
class Factory {
protected:
  // Test-only low-level construction primitives shared by the local replacement
  // harness. The replacement consumes an existing source rather than build().
  enum class EdgeKind { Arc, Axial, Radial, Profile };
  enum class SurfaceKind { Cylinder, Shoulder, Horizontal, Meridional };
  struct Edge { TopoDS_Edge shape; EdgeKind kind; double first, last, radius = 0, angle = 0, height = 0; };
  struct Wire { rt::WireRole role; std::vector<Edge> edges; };
  Spec spec; BRep_Builder builder; rt::Receipt receipt;
  double R,H,z0,z1,zs,L,t0,ta,tb,t1;
  std::map<std::tuple<double,double,double>,TopoDS_Vertex> vertexCache;
  Handle(Geom_SurfaceOfRevolution) shoulderSurface;
  Handle(Geom_CylindricalSurface) lowSurface, highSurface;
  std::vector<std::pair<double,double>> profilePoles;

  TopoDS_Vertex vertex(double r, double t, double z) {
    const auto key = std::make_tuple(r,t,z);
    auto found = vertexCache.find(key); if (found != vertexCache.end()) return found->second;
    auto result = BRepBuilderAPI_MakeVertex(gp_Pnt(r*std::cos(t),r*std::sin(t),z)).Vertex();
    vertexCache[key] = result; return result;
  }
  Edge edge(EdgeKind kind, const Handle(Geom_Curve)& curve, double a, double b,
            const TopoDS_Vertex& va, const TopoDS_Vertex& vb, double r=0,double t=0,double z=0) {
    BRepBuilderAPI_MakeEdge make(curve,va,vb,a,b);
    rt::require(make.IsDone(), "parameterized-fixture: edge construction failed");
    return {make.Edge(),kind,a,b,r,t,z};
  }
  Edge arc(double r,double z,double a,double b) {
    Handle(Geom_Curve) curve = new Geom_Circle(gp_Circ(gp_Ax2(gp_Pnt(0,0,z),gp_Dir(0,0,1),gp_Dir(1,0,0)),r));
    const auto va=vertex(r,a,z), vb=b-a==2*pi?va:vertex(r,b,z);
    return edge(EdgeKind::Arc,curve,a,b,va,vb,r,0,z);
  }
  Edge axial(double r,double t,double a,double b) {
    Handle(Geom_Curve) curve = new Geom_Line(gp_Pnt(r*std::cos(t),r*std::sin(t),0),gp_Dir(0,0,1));
    return edge(EdgeKind::Axial,curve,a,b,vertex(r,t,a),vertex(r,t,b),r,t);
  }
  Edge radial(double t,double z) {
    Handle(Geom_Curve) curve = new Geom_Line(gp_Pnt(0,0,z),gp_Dir(std::cos(t),std::sin(t),0));
    return edge(EdgeKind::Radial,curve,R,H,vertex(R,t,z),vertex(H,t,z),0,t,z);
  }
  Edge profile(double t) {
    return edge(EdgeKind::Profile,shoulderSurface->UIso(t),0,1,vertex(R,t,z0),vertex(H,t,zs),0,t);
  }
  Handle(Geom2d_Curve) pcurve(const Edge& e,SurfaceKind kind) {
    if (kind==SurfaceKind::Cylinder || kind==SurfaceKind::Shoulder) {
      if(e.kind==EdgeKind::Arc) return new Geom2d_Line(gp_Pnt2d(0,kind==SurfaceKind::Shoulder?(e.radius==R?0:1):e.height),gp_Dir2d(1,0));
      if(e.kind==EdgeKind::Axial || e.kind==EdgeKind::Profile) return new Geom2d_Line(gp_Pnt2d(e.angle,0),gp_Dir2d(0,1));
    }
    if (kind==SurfaceKind::Horizontal) {
      if(e.kind==EdgeKind::Arc) return new Geom2d_Circle(gp_Ax2d(gp_Pnt2d(0,0),gp_Dir2d(1,0)),e.radius);
      if(e.kind==EdgeKind::Radial) return new Geom2d_Line(gp_Pnt2d(0,0),gp_Dir2d(std::cos(e.angle),std::sin(e.angle)));
    }
    if (kind==SurfaceKind::Meridional) {
      if(e.kind==EdgeKind::Radial) return new Geom2d_Line(gp_Pnt2d(0,e.height),gp_Dir2d(1,0));
      if(e.kind==EdgeKind::Axial) return new Geom2d_Line(gp_Pnt2d(e.radius,0),gp_Dir2d(0,1));
      if(e.kind==EdgeKind::Profile) {
        TColgp_Array1OfPnt2d poles(1,4);
        for(int i=0;i<4;++i)poles.SetValue(i+1,gp_Pnt2d(profilePoles[i].first,profilePoles[i].second));
        return new Geom2d_BezierCurve(poles);
      }
    }
    throw std::runtime_error("parameterized-fixture: unsupported curve/surface pairing");
  }
  TopoDS_Face face(const Handle(Geom_Surface)& surface,SurfaceKind kind,const std::vector<Wire>& wires,
                   TopAbs_Orientation orientation=TopAbs_FORWARD,const std::vector<Edge>& periodic={}) {
    TopoDS_Face result;builder.MakeFace(result,surface,rt::validationTolerance);
    for(const auto& plan:wires) {
      TopoDS_Wire wire;builder.MakeWire(wire);
      for(const auto& e:plan.edges) {
        builder.UpdateEdge(e.shape,pcurve(e,kind),result,rt::validationTolerance);
        builder.Range(e.shape,result,e.first,e.last);builder.Add(wire,e.shape);
      }
      builder.Add(result,rt::orderedWire({wire,plan.role},result,receipt));
    }
    if(!periodic.empty()) {
      rt::require(periodic.size()==3,"parameterized-fixture: seam recipe size");
      const auto& bottom=periodic[0];const auto& seam=periodic[1];const auto& top=periodic[2];
      for(const auto& e:{bottom,top}) {builder.UpdateEdge(e.shape,pcurve(e,SurfaceKind::Cylinder),result,rt::validationTolerance);builder.Range(e.shape,result,e.first,e.last);}
      builder.UpdateEdge(seam.shape,new Geom2d_Line(gp_Pnt2d(2*pi,0),gp_Dir2d(0,1)),
        new Geom2d_Line(gp_Pnt2d(0,0),gp_Dir2d(0,1)),result,rt::validationTolerance);
      builder.Range(seam.shape,result,seam.first,seam.last);
      TopoDS_Wire wire;builder.MakeWire(wire);
      for(const auto& e:{bottom.shape,seam.shape,TopoDS::Edge(top.shape.Reversed()),TopoDS::Edge(seam.shape.Reversed())})builder.Add(wire,e);
      builder.Add(result,rt::orderedWire({wire,rt::WireRole::Outer},result,receipt));
    }
    result.Orientation(orientation);
    rt::require(BRepCheck_Analyzer(result,true).IsValid(),"parameterized-fixture: invalid generated face");
    return result;
  }
  Handle(Geom_Surface) horizontal(double z) {return new Geom_Plane(gp_Ax3(gp_Pnt(0,0,z),gp_Dir(0,0,1),gp_Dir(1,0,0)));}
  Handle(Geom_Surface) meridional(double t) {return new Geom_Plane(gp_Ax3(gp_Pnt(0,0,0),gp_Dir(std::sin(t),-std::cos(t),0),gp_Dir(std::cos(t),std::sin(t),0)));}
  TopoDS_Solid solid(const std::vector<TopoDS_Face>& faces) {
    TopoDS_Shell shell;builder.MakeShell(shell);for(const auto& f:faces)builder.Add(shell,f);
    TopoDS_Solid result;builder.MakeSolid(result);builder.Add(result,shell);
    rt::require(BRep_Tool::IsClosed(shell),"parameterized-fixture: open shell");
    rt::checkSharedUses(result,receipt);
    rt::require(BRepCheck_Analyzer(result,true).IsValid(),"parameterized-fixture: invalid solid");return result;
  }
public:
  explicit Factory(const Spec& s):spec(s),R(s.radiusMm),H(s.radiusMm+s.layerHeightMm),z0(s.regionZStartMm),
    z1(s.regionZEndMm),zs(s.regionZStartMm+s.shoulderWidthMm),L(s.bodyHeightMm),
    t0(s.regionAngleStartRad+pi/2),ta(t0+s.endProtectionMm/s.radiusMm),
    tb(s.regionAngleEndRad+pi/2-s.endProtectionMm/s.radiusMm),t1(s.regionAngleEndRad+pi/2) {
    for(double value:{R,H,z0,z1,zs,L,t0,ta,tb,t1})rt::require(std::isfinite(value),"parameterized-fixture: nonfinite spec");
    rt::require(0<R&&R<H&&0<z0&&z0<zs&&zs<z1&&z1<L&&
      pi/2-.5<t0&&t0<ta&&ta<tb&&tb<t1&&t1<pi/2+.5,"parameterized-fixture: unsupported spec bounds");
    profilePoles={{R,z0},{R,z0+(zs-z0)/3},{H,z0+2*(zs-z0)/3},{H,zs}};
    TColgp_Array1OfPnt poles(1,4);for(int i=0;i<4;++i)poles.SetValue(i+1,gp_Pnt(profilePoles[i].first,0,profilePoles[i].second));
    shoulderSurface=new Geom_SurfaceOfRevolution(new Geom_BezierCurve(poles),gp_Ax1(gp_Pnt(0,0,0),gp_Dir(0,0,1)));
    lowSurface=new Geom_CylindricalSurface(gp_Ax3(gp_Pnt(0,0,0),gp_Dir(0,0,1),gp_Dir(1,0,0)),R);
    highSurface=new Geom_CylindricalSurface(gp_Ax3(gp_Pnt(0,0,0),gp_Dir(0,0,1),gp_Dir(1,0,0)),H);
  }
  TopoDS_Solid buildUnsplitSource() {
    const auto bottom=arc(R,0,0,2*pi),top=arc(R,L,0,2*pi),seam=axial(R,0,0,L);
    const auto low=arc(R,z0,t0,t1),high=arc(H,z0,t0,t1),lt=arc(R,z1,t0,t1),ht=arc(H,z1,t0,t1);
    const auto lv0=axial(R,t0,z0,z1),lv1=axial(R,t1,z0,z1),hv0=axial(H,t0,z0,z1),hv1=axial(H,t1,z0,z1);
    const auto rb0=radial(t0,z0),rb1=radial(t1,z0),rt0=radial(t0,z1),rt1=radial(t1,z1);
    const auto outer=rt::WireRole::Outer,inner=rt::WireRole::Inner;
    return solid({
      face(lowSurface,SurfaceKind::Cylinder,{{inner,{low,lv1,lt,lv0}}},TopAbs_FORWARD,{bottom,seam,top}),
      face(horizontal(0),SurfaceKind::Horizontal,{{outer,{bottom}}},TopAbs_REVERSED),
      face(horizontal(L),SurfaceKind::Horizontal,{{outer,{top}}}),
      face(meridional(t0),SurfaceKind::Meridional,{{outer,{rb0,hv0,rt0,lv0}}}),
      face(meridional(t1),SurfaceKind::Meridional,{{outer,{rb1,hv1,rt1,lv1}}},TopAbs_REVERSED),
      face(horizontal(z1),SurfaceKind::Horizontal,{{outer,{lt,rt1,ht,rt0}}}),
      face(horizontal(z0),SurfaceKind::Horizontal,{{outer,{low,rb1,high,rb0}}},TopAbs_REVERSED),
      face(highSurface,SurfaceKind::Cylinder,{{outer,{high,hv1,ht,hv0}}})});
  }
  Result build() {
    const auto bottom=arc(R,0,0,2*pi),top=arc(R,L,0,2*pi),seam=axial(R,0,0,L);
    const auto ll=arc(R,z0,t0,ta),lm=arc(R,z0,ta,tb),lr=arc(R,z0,tb,t1);
    const auto hl=arc(H,z0,t0,ta),hm=arc(H,z0,ta,tb),hr=arc(H,z0,tb,t1);
    const auto lt=arc(R,z1,t0,t1),ht=arc(H,z1,t0,t1),lv0=axial(R,t0,z0,z1),lv1=axial(R,t1,z0,z1),hv0=axial(H,t0,z0,z1),hv1=axial(H,t1,z0,z1);
    const auto rb0=radial(t0,z0),rb1=radial(t1,z0),rt0=radial(t0,z1),rt1=radial(t1,z1);
    const auto outer=rt::WireRole::Outer,inner=rt::WireRole::Inner;
    std::vector<TopoDS_Face> common={
      face(lowSurface,SurfaceKind::Cylinder,{{inner,{ll,lm,lr,lv1,lt,lv0}}},TopAbs_FORWARD,{bottom,seam,top}),
      face(horizontal(0),SurfaceKind::Horizontal,{{outer,{bottom}}},TopAbs_REVERSED),
      face(horizontal(L),SurfaceKind::Horizontal,{{outer,{top}}}),
      face(meridional(t0),SurfaceKind::Meridional,{{outer,{rb0,hv0,rt0,lv0}}}),
      face(meridional(t1),SurfaceKind::Meridional,{{outer,{rb1,hv1,rt1,lv1}}},TopAbs_REVERSED),
      face(horizontal(z1),SurfaceKind::Horizontal,{{outer,{lt,rt1,ht,rt0}}})};
    auto baselineFaces=common;
    baselineFaces.push_back(face(horizontal(z0),SurfaceKind::Horizontal,{{outer,{ll,lm,lr,rb1,hl,hm,hr,rb0}}},TopAbs_REVERSED));
    baselineFaces.push_back(face(highSurface,SurfaceKind::Cylinder,{{outer,{hl,hm,hr,hv1,ht,hv0}}}));
    const auto baseline=solid(baselineFaces);
    const auto rba=radial(ta,z0),rbb=radial(tb,z0),hsa=axial(H,ta,z0,zs),hsb=axial(H,tb,z0,zs),pa=profile(ta),pb=profile(tb),sh=arc(H,zs,ta,tb);
    auto candidateFaces=common;
    candidateFaces.push_back(face(horizontal(z0),SurfaceKind::Horizontal,{{outer,{ll,rba,hl,rb0}}},TopAbs_REVERSED));
    candidateFaces.push_back(face(horizontal(z0),SurfaceKind::Horizontal,{{outer,{lr,rb1,hr,rbb}}},TopAbs_REVERSED));
    candidateFaces.push_back(face(meridional(ta),SurfaceKind::Meridional,{{outer,{rba,hsa,pa}}},TopAbs_REVERSED));
    candidateFaces.push_back(face(meridional(tb),SurfaceKind::Meridional,{{outer,{rbb,hsb,pb}}}));
    const auto shoulder=face(shoulderSurface,SurfaceKind::Shoulder,{{outer,{lm,pb,sh,pa}}});candidateFaces.push_back(shoulder);
    const auto crest=face(highSurface,SurfaceKind::Cylinder,{{outer,{hl,hsa,sh,hsb,hr,hv1,ht,hv0}}});candidateFaces.push_back(crest);
    return {spec,baseline,solid(candidateFaces),common.front(),crest,shoulder,lm.shape,sh.shape,t0,t1,ta,tb,common.size()};
  }
};
} // namespace webcad::relief_fixture
