#pragma once

#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_GTransform.hxx>
#include <BRepBuilderAPI_NurbsConvert.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRep_Builder.hxx>
#include <BRepGProp.hxx>
#include <BRep_Tool.hxx>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <Geom_BSplineCurve.hxx>
#include <Geom_BSplineSurface.hxx>
#include <Geom2d_BSplineCurve.hxx>
#include <Geom2dAPI_Interpolate.hxx>
#include <Standard_Failure.hxx>
#include <GeomAPI_ProjectPointOnSurf.hxx>
#include <GeomProjLib.hxx>
#include <Geom2d_Curve.hxx>
#include <Geom_SphericalSurface.hxx>
#include <TColgp_HArray1OfPnt2d.hxx>
#include <TColStd_HArray1OfReal.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_GTrsf.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <array>
#include <cmath>
#include <map>
#include <limits>
#include <iomanip>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace webcad::deform {
using json = nlohmann::json;
constexpr double pi = 3.141592653589793238462643383279502884;

inline void keys(const json& value, std::initializer_list<const char*> allowed) {
  if (!value.is_object()) throw std::runtime_error("Deformation parameters must be an object");
  std::set<std::string> names;
  for (const char* name : allowed) names.emplace(name);
  for (auto it = value.begin(); it != value.end(); ++it)
    if (!names.count(it.key())) throw std::runtime_error("Unknown deformation parameter: " + it.key());
}

inline double number(const json& value, double minimum, double maximum, const char* name) {
  if (!value.is_number()) throw std::runtime_error(std::string(name) + " must be a finite number");
  const double result = value.get<double>();
  if (!std::isfinite(result) || result < minimum || result > maximum)
    throw std::runtime_error(std::string(name) + " is outside its accepted range");
  return result;
}

inline std::array<double, 3> vector3(const json& value, double limit, const char* name) {
  if (!value.is_array() || value.size() != 3) throw std::runtime_error(std::string(name) + " must contain three values");
  return {number(value[0], -limit, limit, name), number(value[1], -limit, limit, name), number(value[2], -limit, limit, name)};
}

inline int axisIndex(const json& value) {
  if (!value.is_string()) throw std::runtime_error("axis must be x, y, or z");
  const std::string axis = value.get<std::string>();
  if (axis == "x") return 0;
  if (axis == "y") return 1;
  if (axis == "z") return 2;
  throw std::runtime_error("axis must be x, y, or z");
}

inline gp_Pnt from(const std::array<double, 3>& p) { return gp_Pnt(p[0], p[1], p[2]); }
inline std::array<double, 3> toArray(const gp_Pnt& p) { return {p.X(), p.Y(), p.Z()}; }

struct Field {
  std::string kind;
  int axis = 0;
  double x0 = 0, x1 = 1, angle = 0, scale0 = 1, scale1 = 1;
  std::array<double, 3> center{0, 0, 0};
  std::array<int, 3> dims{0, 0, 0};
  std::array<double, 3> lower{0, 0, 0}, upper{0, 0, 0};
  std::map<std::array<int, 3>, std::array<double, 3>> displacements;

  double clampT(double x) const { return std::clamp((x - x0) / (x1 - x0), 0.0, 1.0); }

  static double binomial(int n, int k) {
    if (k < 0 || k > n) return 0;
    double value = 1;
    for (int i = 1; i <= k; ++i) value = value * (n - k + i) / i;
    return value;
  }

  std::array<double, 3> map(const std::array<double, 3>& p) const {
    auto out = p;
    if (kind == "bend") {
      if (p[axis] < x0) return p;
      const double length = x1 - x0, s = std::min(p[axis] - x0, length), theta = angle * s / length, curvature = angle / length;
      if (std::abs(curvature) < 1e-12) return p;
      const int along = axis, normal = (axis + 1) % 3, binormal = (axis + 2) % 3;
      const double offset = p[normal] - center[normal];
      double spineAlong = x0 + std::sin(theta) / curvature;
      double spineNormal = center[normal] + (1.0 - std::cos(theta)) / curvature;
      if (p[along] > x1) { const double tail = p[along] - x1; spineAlong += tail * std::cos(angle); spineNormal += tail * std::sin(angle); }
      out[along] = spineAlong - offset * std::sin(theta);
      out[normal] = spineNormal + offset * std::cos(theta);
      out[binormal] = p[binormal];
      return out;
    }
    if (kind == "twist") {
      const int a = (axis + 1) % 3, b = (axis + 2) % 3;
      const double t = clampT(p[axis]), angleAtPoint = angle * t, c = std::cos(angleAtPoint), s = std::sin(angleAtPoint);
      const double da = p[a] - center[a], db = p[b] - center[b];
      out[a] = center[a] + da * c - db * s;
      out[b] = center[b] + da * s + db * c;
      return out;
    }
    if (kind == "taper") {
      const int a = (axis + 1) % 3, b = (axis + 2) % 3;
      const double s = scale0 + (scale1 - scale0) * clampT(p[axis]);
      out[a] = center[a] + (p[a] - center[a]) * s;
      out[b] = center[b] + (p[b] - center[b]) * s;
      return out;
    }
    if (kind == "ffd") {
      std::array<std::vector<double>, 3> basis;
      for (int d = 0; d < 3; ++d) {
        const double t = (p[d] - lower[d]) / (upper[d] - lower[d]);
        if (t < -1e-8 || t > 1.0 + 1e-8) throw std::runtime_error("FFD bounds must contain every source control point");
        const double u = std::clamp(t, 0.0, 1.0); basis[d].resize(dims[d]);
        for (int i = 0; i < dims[d]; ++i) basis[d][i] = binomial(dims[d] - 1, i) * std::pow(u, i) * std::pow(1.0 - u, dims[d] - 1 - i);
      }
      std::array<double, 3> delta{0, 0, 0};
      for (const auto& item : displacements) {
        const auto& i = item.first; const double weight = basis[0][i[0]] * basis[1][i[1]] * basis[2][i[2]];
        for (int d = 0; d < 3; ++d) delta[d] += weight * item.second[d];
      }
      for (int d = 0; d < 3; ++d) out[d] += delta[d];
      return out;
    }
    throw std::runtime_error("Unsupported deformation field");
  }
};

inline Field parse(const json& params) {
  if (!params.is_object() || !params.contains("kind") || !params["kind"].is_string())
    throw std::runtime_error("Explicit deformation kind is required");
  Field f; f.kind = params["kind"].get<std::string>();
  if (f.kind == "bend" || f.kind == "twist") {
    keys(params, {"kind", "axis", "angleDeg", "rangeMm", "center"}); f.axis = axisIndex(params.at("axis"));
    f.angle = number(params.at("angleDeg"), -170, 170, "angleDeg") * pi / 180.0;
    if (!params.at("rangeMm").is_array() || params.at("rangeMm").size() != 2) throw std::runtime_error("rangeMm must be [start,end]");
    f.x0 = number(params.at("rangeMm")[0], -100000, 100000, "rangeMm[0]");
    f.x1 = number(params.at("rangeMm")[1], -100000, 100000, "rangeMm[1]");
    if (f.x1 - f.x0 < 1e-6) throw std::runtime_error("rangeMm must have positive length");
    if (params.contains("center")) f.center = vector3(params.at("center"), 100000, "center");
    return f;
  }
  if (f.kind == "taper") {
    keys(params, {"kind", "axis", "scaleStart", "scaleEnd", "rangeMm", "center"}); f.axis = axisIndex(params.at("axis"));
    f.scale0 = number(params.at("scaleStart"), 0.05, 20, "scaleStart"); f.scale1 = number(params.at("scaleEnd"), 0.05, 20, "scaleEnd");
    if (!params.contains("rangeMm")) { f.x0 = -100000; f.x1 = 100000; }
    else {
      if (!params.at("rangeMm").is_array() || params.at("rangeMm").size() != 2) throw std::runtime_error("rangeMm must be [start,end]");
      f.x0 = number(params.at("rangeMm")[0], -100000, 100000, "rangeMm[0]"); f.x1 = number(params.at("rangeMm")[1], -100000, 100000, "rangeMm[1]");
      if (f.x1 - f.x0 < 1e-6) throw std::runtime_error("rangeMm must have positive length");
    }
    if (params.contains("center")) f.center = vector3(params.at("center"), 100000, "center");
    return f;
  }
  if (f.kind == "ffd") {
    keys(params, {"kind", "lattice", "displacements"}); const auto& lattice = params.at("lattice"); keys(lattice, {"dims", "boundsMm"});
    if (!lattice.at("dims").is_array() || lattice.at("dims").size() != 3) throw std::runtime_error("lattice.dims must contain three integers");
    int nodes = 1;
    for (int d = 0; d < 3; ++d) {
      if (!lattice.at("dims")[d].is_number_integer()) throw std::runtime_error("FFD lattice dimensions must be integers");
      f.dims[d] = lattice.at("dims")[d].get<int>(); if (f.dims[d] < 2 || f.dims[d] > 8) throw std::runtime_error("FFD lattice dimensions must be between 2 and 8"); nodes *= f.dims[d];
    }
    if (nodes > 512) throw std::runtime_error("FFD lattice exceeds 512 control points");
    const auto& bounds = lattice.at("boundsMm");
    if (!bounds.is_array() || bounds.size() != 2) throw std::runtime_error("lattice.boundsMm must be [[minX,minY,minZ],[maxX,maxY,maxZ]]");
    f.lower = vector3(bounds[0], 100000, "boundsMm.min"); f.upper = vector3(bounds[1], 100000, "boundsMm.max");
    for (int d = 0; d < 3; ++d) if (f.upper[d] - f.lower[d] < 1e-6) throw std::runtime_error("FFD bounds must have positive extent");
    const auto& displacements = params.at("displacements");
    if (!displacements.is_array() || displacements.size() < 1 || displacements.size() > nodes) throw std::runtime_error("FFD displacements must contain 1 to lattice node count entries");
    for (const auto& item : displacements) {
      keys(item, {"i", "j", "k", "dMm"}); std::array<int, 3> index{};
      for (int d = 0; d < 3; ++d) { const char* name = d == 0 ? "i" : d == 1 ? "j" : "k"; if (!item.at(name).is_number_integer()) throw std::runtime_error("FFD displacement indices must be integers"); index[d] = item.at(name).get<int>(); if (index[d] < 0 || index[d] >= f.dims[d]) throw std::runtime_error("FFD displacement index is outside the lattice"); }
      if (f.displacements.count(index)) throw std::runtime_error("FFD displacement indices must be unique");
      f.displacements.emplace(index, vector3(item.at("dMm"), 100000, "dMm"));
    }
    return f;
  }
  throw std::runtime_error("kind must be bend, twist, taper, or ffd");
}

inline TopoDS_Shape scaleXYZ(const TopoDS_Shape& source, const std::array<double, 3>& scale) {
  gp_GTrsf transform;
  transform.SetValue(1, 1, scale[0]); transform.SetValue(2, 2, scale[1]); transform.SetValue(3, 3, scale[2]);
  BRepBuilderAPI_GTransform maker(source, transform, Standard_True);
  if (!maker.IsDone() || maker.Shape().IsNull()) throw std::runtime_error("OCCT affine scale did not complete");
  return maker.Shape();
}

inline void refine(Geom_BSplineCurve& curve) {
  std::vector<std::pair<double, double>> spans;
  for (int i = 1; i < curve.NbKnots(); ++i) { const double a = curve.Knot(i), b = curve.Knot(i + 1); if (b - a > 1e-12) spans.emplace_back(a, b); }
  for (const auto& span : spans) for (int part = 1; part < 4; ++part) curve.InsertKnot(span.first + (span.second - span.first) * part / 4.0, 1, 1e-12, Standard_True);
}

inline void refine(Geom_BSplineSurface& surface) {
  std::vector<std::pair<double, double>> uSpans, vSpans;
  for (int i = 1; i < surface.NbUKnots(); ++i) { const double a = surface.UKnot(i), b = surface.UKnot(i + 1); if (b - a > 1e-12) uSpans.emplace_back(a, b); }
  for (int i = 1; i < surface.NbVKnots(); ++i) { const double a = surface.VKnot(i), b = surface.VKnot(i + 1); if (b - a > 1e-12) vSpans.emplace_back(a, b); }
  for (const auto& span : uSpans) for (int part = 1; part < 4; ++part) surface.InsertUKnot(span.first + (span.second - span.first) * part / 4.0, 1, 1e-12, Standard_True);
  for (const auto& span : vSpans) for (int part = 1; part < 4; ++part) surface.InsertVKnot(span.first + (span.second - span.first) * part / 4.0, 1, 1e-12, Standard_True);
}

inline TopoDS_Shape ellipsoidFromUnitSphere(const TopoDS_Shape& source, const std::array<double, 3>& radii) {
  TopoDS_Face onlyFace; int count = 0;
  for (TopExp_Explorer ex(source, TopAbs_FACE); ex.More(); ex.Next()) { onlyFace = TopoDS::Face(ex.Current()); ++count; }
  if (count != 1) throw std::runtime_error("ellipsoid requires one untrimmed unit-sphere source body");
  TopLoc_Location location; const Handle(Geom_Surface)& surface = BRep_Tool::Surface(onlyFace, location);
  const auto sphere = Handle(Geom_SphericalSurface)::DownCast(surface);
  if (sphere.IsNull() || std::abs(sphere->Radius() - 1.0) > 1e-8 || sphere->Location().Distance(gp_Pnt(0, 0, 0)) > 1e-8 || !location.IsIdentity())
    throw std::runtime_error("ellipsoid source must be an unplaced analytic unit sphere centered at world origin");
  return scaleXYZ(source, radii);
}

inline Handle(Geom2d_Curve) rebuildMappedPcurve(const Handle(Geom_Curve)& edgeCurve,
                                                const Handle(Geom2d_Curve)& sourcePcurve,
                                                const Handle(Geom_BSplineSurface)& surface,
                                                double first, double last,
                                                double& maxResidual,
                                                const std::string& context) {
  if (edgeCurve.IsNull() || sourcePcurve.IsNull() || surface.IsNull() || !(last > first))
    throw std::runtime_error("Cannot rebuild a mapped trim without bounded source curves; source was preserved");
  constexpr int fitSegments = 64;
  const int pointCount = fitSegments + 1;
  auto points = new TColgp_HArray1OfPnt2d(1, pointCount);
  auto parameters = new TColStd_HArray1OfReal(1, pointCount);
  auto projectNearBranch = [&](double parameter) {
    const gp_Pnt point = edgeCurve->Value(parameter);
    const gp_Pnt2d anchor = sourcePcurve->Value(parameter);
    GeomAPI_ProjectPointOnSurf projection(point, surface, 1e-8);
    if (projection.NbPoints() == 0) throw std::runtime_error("Mapped trim sample has no bounded surface projection; source was preserved");
    double selectedU = 0, selectedV = 0, best = std::numeric_limits<double>::infinity();
    const bool periodicU = surface->IsUPeriodic(), periodicV = surface->IsVPeriodic();
    const double periodU = periodicU ? surface->UPeriod() : 0, periodV = periodicV ? surface->VPeriod() : 0;
    for (int i = 1; i <= projection.NbPoints(); ++i) {
      double u = 0, v = 0; projection.Parameters(i, u, v);
      if (periodicU) u += std::round((anchor.X() - u) / periodU) * periodU;
      if (periodicV) v += std::round((anchor.Y() - v) / periodV) * periodV;
      const double branchDistance = std::hypot(u - anchor.X(), v - anchor.Y());
      if (branchDistance < best) { best = branchDistance; selectedU = u; selectedV = v; }
    }
    return gp_Pnt2d(selectedU, selectedV);
  };
  bool repeatedUv = false; int repeatedPairs = 0;
  std::string stage = "project-samples";
  try {
    for (int i = 0; i < pointCount; ++i) {
      const double parameter = first + (last - first) * i / fitSegments;
      parameters->SetValue(i + 1, parameter);
      const gp_Pnt2d uv = projectNearBranch(parameter);
      for (int previous = 0; previous < i; ++previous) {
        if (uv.Distance(points->Value(previous + 1)) <= 1e-12) { repeatedUv = true; ++repeatedPairs; break; }
      }
      points->SetValue(i + 1, uv);
    }
    stage = "interpolate";
    Geom2dAPI_Interpolate fit(points, parameters, Standard_False, 1e-12);
    fit.Perform();
    if (!fit.IsDone()) throw std::runtime_error("Mapped trim interpolation did not converge");
    const Handle(Geom2d_Curve) pcurve = fit.Curve();
    stage = "verify-residual";
    maxResidual = 0;
    constexpr int verifySegments = fitSegments * 4;
    for (int i = 0; i <= verifySegments; ++i) {
      const double parameter = first + (last - first) * i / verifySegments;
      const gp_Pnt actual = surface->Value(pcurve->Value(parameter).X(), pcurve->Value(parameter).Y());
      maxResidual = std::max(maxResidual, actual.Distance(edgeCurve->Value(parameter)));
    }
    if (!std::isfinite(maxResidual) || maxResidual > 1e-4) {
      std::ostringstream residual;
      residual << std::setprecision(17) << maxResidual;
      throw std::runtime_error("Unified mapped trim residual exceeds 0.0001 mm; maxResidualMm=" + residual.str());
    }
    return pcurve;
  } catch (const Standard_Failure& error) {
    const char* message = error.GetMessageString();
    throw std::runtime_error(context + " stage=" + stage + " first=" + std::to_string(first) +
      " last=" + std::to_string(last) + " samplePoints=" + std::to_string(pointCount) +
      " repeatedUv=" + (repeatedUv ? "true" : "false") + " repeatedPairs=" +
      std::to_string(repeatedPairs) + " Standard_Failure=" + (message ? message : "<empty>"));
  } catch (const std::exception& error) {
    throw std::runtime_error(context + " stage=" + stage + " first=" + std::to_string(first) +
      " last=" + std::to_string(last) + " samplePoints=" + std::to_string(pointCount) +
      " repeatedUv=" + (repeatedUv ? "true" : "false") + " repeatedPairs=" +
      std::to_string(repeatedPairs) + " error=" + error.what());
  }
}

inline TopoDS_Shape mapNurbs(const TopoDS_Shape& source, const Field& field, json& detail) {
  BRepBuilderAPI_NurbsConvert convert(source, Standard_True);
  if (!convert.IsDone() || convert.Shape().IsNull()) throw std::runtime_error("OCCT could not convert the source to NURBS");
  BRepBuilderAPI_Copy copy(convert.Shape(), Standard_True, Standard_False);
  if (!copy.IsDone() || copy.Shape().IsNull()) throw std::runtime_error("OCCT could not isolate a NURBS source copy");
  TopoDS_Shape result = copy.Shape(); BRep_Builder builder;
  TopTools_IndexedMapOfShape faces, edges, vertices;
  TopExp::MapShapes(result, TopAbs_FACE, faces); TopExp::MapShapes(result, TopAbs_EDGE, edges); TopExp::MapShapes(result, TopAbs_VERTEX, vertices);
  struct SourcePcurve { Handle(Geom2d_Curve) curve; double first = 0, last = 0; int representation = 0; };
  std::map<std::pair<int, int>, std::vector<SourcePcurve>> sourcePcurves;
  for (int faceIndex = 1; faceIndex <= faces.Extent(); ++faceIndex) {
    const auto face = TopoDS::Face(faces(faceIndex)); TopLoc_Location faceLocation;
    const auto faceSurface = BRep_Tool::Surface(face, faceLocation);
    for (TopExp_Explorer ex(face, TopAbs_EDGE); ex.More(); ex.Next()) {
      const auto edge = TopoDS::Edge(ex.Current()); const int edgeIndex = edges.FindIndex(edge);
      const std::string context = "face=" + std::to_string(faceIndex) + " edge=" + std::to_string(edgeIndex) + " stage=bind-source-pcurve";
      if (edgeIndex <= 0) throw std::runtime_error(context + " edge is absent from the mapped edge index");
      auto& branches = sourcePcurves[{faceIndex, edgeIndex}];
      for (int representation = 1; representation <= 256; ++representation) {
        Handle(Geom2d_Curve) curve; Handle(Geom_Surface) surface; TopLoc_Location location; double first = 0, last = 0;
        try { BRep_Tool::CurveOnSurface(edge, curve, surface, location, first, last, representation); }
        catch (const Standard_Failure& error) {
          const char* message = error.GetMessageString();
          throw std::runtime_error(context + " representation=" + std::to_string(representation) +
            " Standard_Failure=" + (message ? message : "<empty>"));
        }
        if (curve.IsNull() || surface.IsNull()) break;
        if (surface == faceSurface && location.IsEqual(faceLocation))
          branches.push_back({curve, first, last, representation});
      }
      const int expected = BRep_Tool::IsClosed(edge, face) ? 2 : 1;
      if (static_cast<int>(branches.size()) != expected)
        throw std::runtime_error(context + " expectedFaceRepresentations=" + std::to_string(expected) +
          " matchedFaceRepresentations=" + std::to_string(branches.size()));
    }
  }
  int faceCount = 0, edgeCount = 0, poleCount = 0;
  for (int n = 1; n <= faces.Extent(); ++n) {
    const auto face = TopoDS::Face(faces(n)); TopLoc_Location location; const auto base = BRep_Tool::Surface(face, location);
    auto surface = Handle(Geom_BSplineSurface)::DownCast(base);
    if (surface.IsNull()) throw std::runtime_error("NURBS conversion left a non-B-spline trimmed face; source was preserved");
    surface = Handle(Geom_BSplineSurface)::DownCast(surface->Copy()); const auto inverse = location.Transformation().Inverted();
    refine(*surface);
    if (surface->NbUPoles() > 500 || surface->NbVPoles() > 500 || surface->NbUPoles() * surface->NbVPoles() > 250000)
      throw std::runtime_error("NURBS refinement exceeds the bounded per-face control-point budget; source was preserved");
    for (int u = 1; u <= surface->NbUPoles(); ++u) for (int v = 1; v <= surface->NbVPoles(); ++v) {
      gp_Pnt world = surface->Pole(u, v).Transformed(location.Transformation()); world = from(field.map(toArray(world))); surface->SetPole(u, v, world.Transformed(inverse)); ++poleCount;
    }
    builder.UpdateFace(face, surface, location, BRep_Tool::Tolerance(face)); ++faceCount;
  }
  for (int n = 1; n <= edges.Extent(); ++n) {
    const auto edge = TopoDS::Edge(edges(n)); TopLoc_Location location; double first = 0, last = 0; const auto base = BRep_Tool::Curve(edge, location, first, last);
    if (base.IsNull()) continue;
    auto curve = Handle(Geom_BSplineCurve)::DownCast(base);
    if (curve.IsNull()) throw std::runtime_error("NURBS conversion left a non-B-spline trim edge; source was preserved");
    curve = Handle(Geom_BSplineCurve)::DownCast(curve->Copy()); const auto inverse = location.Transformation().Inverted();
    refine(*curve);
    if (curve->NbPoles() > 50000) throw std::runtime_error("NURBS refinement exceeds the bounded trim-curve control-point budget; source was preserved");
    for (int i = 1; i <= curve->NbPoles(); ++i) { gp_Pnt world = curve->Pole(i).Transformed(location.Transformation()); world = from(field.map(toArray(world))); curve->SetPole(i, world.Transformed(inverse)); ++poleCount; }
    builder.UpdateEdge(edge, curve, location, BRep_Tool::Tolerance(edge)); ++edgeCount;
  }
  for (int n = 1; n <= vertices.Extent(); ++n) {
    const auto vertex = TopoDS::Vertex(vertices(n)); const TopLoc_Location location = vertex.Location(); const auto inverse = location.Transformation().Inverted();
    gp_Pnt world = BRep_Tool::Pnt(vertex); world = from(field.map(toArray(world))); builder.UpdateVertex(vertex, world.Transformed(inverse), BRep_Tool::Tolerance(vertex));
  }
  int trimsRebuilt = 0;
  double maxTrimResidual = 0;
  for (int n = 1; n <= faces.Extent(); ++n) {
    const auto face = TopoDS::Face(faces(n)); TopLoc_Location faceLocation; const auto surface = BRep_Tool::Surface(face, faceLocation);
      for (TopExp_Explorer ex(face, TopAbs_EDGE); ex.More(); ex.Next()) {
      const auto edge = TopoDS::Edge(ex.Current());
      TopLoc_Location edgeLocation; double first = 0, last = 0; const auto curve = BRep_Tool::Curve(edge, edgeLocation, first, last);
      if (curve.IsNull()) throw std::runtime_error("A trimmed boundary has no 3D curve for pcurve reconstruction; source was preserved");
      Handle(Geom_Curve) inFaceFrame = Handle(Geom_Curve)::DownCast(curve->Transformed(edgeLocation.Transformation()));
      inFaceFrame = Handle(Geom_Curve)::DownCast(inFaceFrame->Transformed(faceLocation.Transformation().Inverted()));
      if (inFaceFrame.IsNull()) throw std::runtime_error("Could not express a deformed trim in its face coordinate system; source was preserved");
      const int branchCount = BRep_Tool::IsClosed(edge, face) ? 2 : 1;
      Handle(Geom2d_Curve) rebuilt[2];
      const int edgeIndex = edges.FindIndex(edge);
      const auto sourceBranches = sourcePcurves.find({n, edgeIndex});
      if (sourceBranches == sourcePcurves.end() || static_cast<int>(sourceBranches->second.size()) != branchCount)
        throw std::runtime_error("face=" + std::to_string(n) + " edge=" + std::to_string(edgeIndex) +
          " stage=bind-source-pcurve cached branch count does not match the face seam topology");
      for (int branch = 0; branch < branchCount; ++branch) {
        const auto& sourceBranch = sourceBranches->second[branch];
        const std::string context = "face=" + std::to_string(n) + " edge=" +
          std::to_string(edgeIndex) + " branch=" + std::to_string(branch + 1) +
          " representation=" + std::to_string(sourceBranch.representation);
        if (std::abs(sourceBranch.first - first) > 1e-9 || std::abs(sourceBranch.last - last) > 1e-9)
          throw std::runtime_error(context + " parameter range differs from the mapped edge");
        double branchResidual = 0;
        rebuilt[branch] = rebuildMappedPcurve(inFaceFrame, sourceBranch.curve, Handle(Geom_BSplineSurface)::DownCast(surface), first, last, branchResidual, context);
        maxTrimResidual = std::max(maxTrimResidual, branchResidual);
      }
      const double trimTolerance = std::max(1e-7, BRep_Tool::Tolerance(edge));
      if (branchCount == 2) builder.UpdateEdge(edge, rebuilt[0], rebuilt[1], face, trimTolerance);
      else builder.UpdateEdge(edge, rebuilt[0], face, trimTolerance);
      trimsRebuilt += branchCount;
    }
  }
  detail = {{"conversion", "BRepBuilderAPI_NurbsConvert"}, {"facesMapped", faceCount}, {"edgesMapped", edgeCount}, {"controlPointsMapped", poleCount}, {"trimCurvesReprojected", trimsRebuilt}, {"trimToleranceMm", 0.0001}, {"maxTrimResidualMm", maxTrimResidual}, {"trimTopology", "all-associated-pcurves-rebuilt"}};
  return result;
}

inline double volume(const TopoDS_Shape& shape) {
  GProp_GProps properties; BRepGProp::VolumeProperties(shape, properties); return std::abs(properties.Mass());
}

inline std::array<std::array<double, 3>, 2> bounds(const TopoDS_Shape& shape) {
  Bnd_Box box; BRepBndLib::AddOptimal(shape, box, Standard_False, Standard_False);
  double x0, y0, z0, x1, y1, z1; box.Get(x0, y0, z0, x1, y1, z1);
  return {{{x0, y0, z0}, {x1, y1, z1}}};
}

inline TopoDS_Shape run(const TopoDS_Shape& source, const json& params, const json& operation,
                        double before, json& detail) {
  const std::string mode = params.at("kind").get<std::string>();
  if (mode == "scaleXYZ") {
    keys(params, {"kind", "scaleXYZ"}); const auto scale = vector3(params.at("scaleXYZ"), 1000, "scaleXYZ");
    for (double factor : scale) if (factor <= 0) throw std::runtime_error("scaleXYZ factors must be positive to preserve solid orientation");
    const auto result = scaleXYZ(source, scale); const double expected = before * scale[0] * scale[1] * scale[2];
    const double measured = volume(result), error = std::abs(measured - expected) / expected;
    if (!std::isfinite(measured) || measured <= 0 || error > 1e-6) throw std::runtime_error("scaleXYZ volume differs from its affine determinant by more than 1 ppm; source was preserved");
    detail = {{"kind", mode}, {"method", "gp_GTrsf+BRepBuilderAPI_GTransform"}, {"expectedVolumeMm3", expected}, {"measuredVolumeMm3", measured}, {"relativeVolumeError", error}, {"analyticFacesMayBecomeBSplines", true}};
    return result;
  }
  if (mode == "ellipsoid") {
    keys(params, {"kind", "radiiMm"}); const auto radii = vector3(params.at("radiiMm"), 100000, "radiiMm");
    for (double radius : radii) if (radius <= 0) throw std::runtime_error("ellipsoid radii must be positive");
    const auto result = ellipsoidFromUnitSphere(source, radii); const double expected = 4.0 * pi * radii[0] * radii[1] * radii[2] / 3.0;
    const double measured = volume(result), error = std::abs(measured - expected) / expected;
    if (!std::isfinite(measured) || measured <= 0 || error > 0.005) throw std::runtime_error("Ellipsoid volume exceeds the 0.5% analytic tolerance; source was preserved");
    detail = {{"kind", mode}, {"method", "unit-sphere+gp_GTrsf+BRepBuilderAPI_GTransform"}, {"expectedVolumeMm3", expected}, {"measuredVolumeMm3", measured}, {"relativeVolumeError", error}, {"analyticFacesMayBecomeBSplines", true}};
    return result;
  }
  json normalized = params; const auto box = bounds(source);
  if (mode == "taper" && !normalized.contains("rangeMm")) {
    const int axis = axisIndex(normalized.at("axis")); normalized["rangeMm"] = {box[0][axis], box[1][axis]};
  }
  if ((mode == "taper" || mode == "twist" || mode == "bend") && !normalized.contains("center"))
    normalized["center"] = {(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2, (box[0][2] + box[1][2]) / 2};
  const Field field = parse(normalized); json mapping;
  const auto result = mapNurbs(source, field, mapping); const bool valid = BRepCheck_Analyzer(result, true).IsValid();
  const double after = volume(result), ratio = after / before;
  if (!valid) throw std::runtime_error("NURBS mapping did not preserve trimmed BRep validity; source was preserved");
  if (!std::isfinite(after) || after <= 0) throw std::runtime_error("Deformation produced no positive material volume (measured " + std::to_string(after) + "); source was preserved");
  if ((mode == "bend" || mode == "twist") && std::abs(ratio - 1.0) > 0.01)
    throw std::runtime_error("Bend/twist measured volume ratio " + std::to_string(ratio) + " exceeds the 1% volume-preservation gate; source was preserved");
  if (mode == "taper") {
    const double low = std::min(field.scale0, field.scale1), high = std::max(field.scale0, field.scale1);
    if (ratio < low * low * (1 - 0.02) || ratio > high * high * (1 + 0.02)) throw std::runtime_error("Taper volume is outside its cross-section scale bounds; source was preserved");
  }
  detail = {{"kind", mode}, {"method", "NURBS-control-point-map"}, {"mapping", mapping}, {"measuredVolumeMm3", after}, {"volumeRatio", ratio}, {"trimAndBRepValidatedBeforePublish", true}};
  return result;
}
}
