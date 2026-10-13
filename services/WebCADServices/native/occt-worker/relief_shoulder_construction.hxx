#pragma once
#include "relief_topology.hxx"
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

// Exact shared-boundary construction primitives for a bounded source edit.
namespace webcad::relief_shoulder {
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
class Construction {
protected:
  // The replacement consumes existing source faces and vertices.
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
    rt::require(make.IsDone(), "relief-shoulder: edge construction failed");
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
    throw std::runtime_error("relief-shoulder: unsupported curve/surface pairing");
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
      rt::require(periodic.size()==3,"relief-shoulder: seam recipe size");
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
    rt::require(BRepCheck_Analyzer(result,true).IsValid(),"relief-shoulder: invalid generated face");
    return result;
  }
  Handle(Geom_Surface) horizontal(double z) {return new Geom_Plane(gp_Ax3(gp_Pnt(0,0,z),gp_Dir(0,0,1),gp_Dir(1,0,0)));}
  Handle(Geom_Surface) meridional(double t) {return new Geom_Plane(gp_Ax3(gp_Pnt(0,0,0),gp_Dir(std::sin(t),-std::cos(t),0),gp_Dir(std::cos(t),std::sin(t),0)));}
  TopoDS_Solid solid(const std::vector<TopoDS_Face>& faces) {
    TopoDS_Shell shell;builder.MakeShell(shell);for(const auto& f:faces)builder.Add(shell,f);
    TopoDS_Solid result;builder.MakeSolid(result);builder.Add(result,shell);
    rt::require(BRep_Tool::IsClosed(shell),"relief-shoulder: open shell");
    rt::checkSharedUses(result,receipt);
    rt::require(BRepCheck_Analyzer(result,true).IsValid(),"relief-shoulder: invalid solid");return result;
  }
public:
  explicit Construction(const Spec& s):spec(s),R(s.radiusMm),H(s.radiusMm+s.layerHeightMm),z0(s.regionZStartMm),
    z1(s.regionZEndMm),zs(s.regionZStartMm+s.shoulderWidthMm),L(s.bodyHeightMm),
    t0(s.regionAngleStartRad+pi/2),ta(t0+s.endProtectionMm/s.radiusMm),
    tb(s.regionAngleEndRad+pi/2-s.endProtectionMm/s.radiusMm),t1(s.regionAngleEndRad+pi/2) {
    for(double value:{R,H,z0,z1,zs,L,t0,ta,tb,t1})rt::require(std::isfinite(value),"relief-shoulder: nonfinite spec");
    rt::require(0<R&&R<H&&0<z0&&z0<zs&&zs<z1&&z1<L&&
      pi/2-.5<t0&&t0<ta&&ta<tb&&tb<t1&&t1<pi/2+.5,"relief-shoulder: unsupported spec bounds");
    profilePoles={{R,z0},{R,z0+(zs-z0)/3},{H,z0+2*(zs-z0)/3},{H,zs}};
    TColgp_Array1OfPnt poles(1,4);for(int i=0;i<4;++i)poles.SetValue(i+1,gp_Pnt(profilePoles[i].first,0,profilePoles[i].second));
    shoulderSurface=new Geom_SurfaceOfRevolution(new Geom_BezierCurve(poles),gp_Ax1(gp_Pnt(0,0,0),gp_Dir(0,0,1)));
    lowSurface=new Geom_CylindricalSurface(gp_Ax3(gp_Pnt(0,0,0),gp_Dir(0,0,1),gp_Dir(1,0,0)),R);
    highSurface=new Geom_CylindricalSurface(gp_Ax3(gp_Pnt(0,0,0),gp_Dir(0,0,1),gp_Dir(1,0,0)),H);
  }
};
} // namespace webcad::relief_shoulder
