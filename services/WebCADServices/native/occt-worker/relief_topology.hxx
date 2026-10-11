#pragma once

#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepCheck_Wire.hxx>
#include <BRepTools.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <ShapeAnalysis.hxx>
#include <ShapeExtend_WireData.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Shell.hxx>
#include <TopoDS_Solid.hxx>
#include <cmath>
#include <stdexcept>
#include <vector>

// Internal construction primitive, not an imported-BRep healing operation or
// an enabled shoulder semantic. The manufacturing planner must explicitly own
// each face, wire, and outer/inner role. No topology indices cross kernels.
namespace webcad::relief_topology {
constexpr double validationTolerance = 1e-7;
constexpr std::size_t maximumWireEdges = 4096;
enum class WireRole { Outer, Inner };
struct WirePlan { TopoDS_Wire wire; WireRole role; };
struct FacePlan { TopoDS_Face face; std::vector<WirePlan> wires; };
struct Receipt {
  std::size_t rebuiltFaces = 0, rebuiltWires = 0, preservedSeamWires = 0;
  std::size_t sharedNondegenerateEdges = 0;
};

inline void require(bool condition, const char* reason) {
  if (!condition) throw std::runtime_error(reason);
}
inline bool ordinaryOrientation(const TopoDS_Shape& shape) {
  return shape.Orientation() == TopAbs_FORWARD || shape.Orientation() == TopAbs_REVERSED;
}
inline std::pair<TopoDS_Vertex, TopoDS_Vertex> vertices(const TopoDS_Edge& edge) {
  TopoDS_Vertex first, last;
  TopExp::Vertices(edge, first, last, true);
  require(!first.IsNull() && !last.IsNull(), "relief-topology: missing endpoint vertex");
  return {first, last};
}
inline void checkWire(const TopoDS_Wire& wire, const TopoDS_Face& face) {
  BRepCheck_Wire check(wire);
  require(check.Closed() == BRepCheck_NoError, "relief-topology: open or redundant wire");
  require(check.Closed2d(face) == BRepCheck_NoError, "relief-topology: open PCurve loop");
  require(check.Orientation(face) == BRepCheck_NoError, "relief-topology: inconsistent coedge orientation");
  TopoDS_Edge first, second;
  require(check.SelfIntersect(face, first, second) == BRepCheck_NoError,
          "relief-topology: self-intersecting or missing PCurve");
}
inline double signedUVArea(const TopoDS_Wire& wire, const TopoDS_Face& face) {
  Handle(ShapeExtend_WireData) data = new ShapeExtend_WireData(wire);
  const double area = ShapeAnalysis::TotCross2D(data, face);
  require(std::isfinite(area) && std::abs(area) > 1e-14,
          "relief-topology: indeterminate UV winding");
  return area;
}
inline bool roleMatches(double area, WireRole role) {
  return (area > 0) == (role == WireRole::Outer);
}

inline TopoDS_Wire orderedWire(const WirePlan& plan, const TopoDS_Face& face, Receipt& receipt) {
  require(!plan.wire.IsNull() && ordinaryOrientation(plan.wire), "relief-topology: invalid wire plan");
  require(plan.wire.Location().IsIdentity() && face.Location().IsIdentity(),
          "relief-topology: construction boundaries must use identity locations");
  std::vector<TopoDS_Edge> edges;
  TopTools_IndexedMapOfShape unique;
  bool hasRepeatedEdge = false;
  for (TopExp_Explorer it(plan.wire, TopAbs_EDGE); it.More(); it.Next()) {
    auto edge = TopoDS::Edge(it.Current());
    require(ordinaryOrientation(edge), "relief-topology: internal/external coedge unsupported");
    require(edge.Location().IsIdentity(), "relief-topology: located coedge requires an explicit planner transform");
    hasRepeatedEdge |= unique.Contains(edge);
    unique.Add(edge); edges.push_back(edge);
  }
  require(!edges.empty() && edges.size() <= maximumWireEdges, "relief-topology: wire size limit");

  // Periodic seams use two PCurves of the same edge. Never reorder, copy,
  // project or shift those curves. Retain only an already coherent seam wire.
  if (hasRepeatedEdge) {
    for (int i = 1; i <= unique.Extent(); ++i) {
      auto edge = TopoDS::Edge(unique(i));
      int forward = 0, reverse = 0;
      for (const auto& use : edges) if (use.IsSame(edge)) {
        if (use.Orientation() == TopAbs_FORWARD) ++forward; else ++reverse;
      }
      if (forward + reverse > 1)
        require(forward == 1 && reverse == 1 && BRep_Tool::IsClosed(edge, face),
                "relief-topology: repeated edge is not a valid periodic seam");
    }
    checkWire(plan.wire, face);
    require(roleMatches(signedUVArea(plan.wire, face), plan.role),
            "relief-topology: periodic seam role is ambiguous");
    ++receipt.preservedSeamWires;
    return plan.wire;
  }

  TopTools_IndexedMapOfShape vertexMap;
  std::vector<std::pair<int, int>> endpoints;
  for (const auto& edge : edges) {
    require(!BRep_Tool::Degenerated(edge), "relief-topology: degenerate reorder is ambiguous");
    const auto v = vertices(edge);
    endpoints.push_back({vertexMap.Add(v.first), vertexMap.Add(v.second)});
  }
  std::vector<int> degree(vertexMap.Extent() + 1);
  for (const auto& v : endpoints) { ++degree[v.first]; ++degree[v.second]; }
  for (int i = 1; i <= vertexMap.Extent(); ++i)
    require(degree[i] == 2, "relief-topology: endpoints do not define one manifold cycle");

  std::vector<TopoDS_Edge> ordered{edges.front()};
  std::vector<bool> used(edges.size(), false); used.front() = true;
  int last = endpoints.front().second;
  while (ordered.size() < edges.size()) {
    std::size_t candidate = 0, matches = 0; bool reverse = false;
    for (std::size_t i = 0; i < edges.size(); ++i) if (!used[i]) {
      if (endpoints[i].first == last) { candidate = i; reverse = false; ++matches; }
      if (endpoints[i].second == last) { candidate = i; reverse = true; ++matches; }
    }
    require(matches == 1, "relief-topology: disconnected or ambiguous endpoint cycle");
    ordered.push_back(reverse ? TopoDS::Edge(edges[candidate].Reversed()) : edges[candidate]);
    last = reverse ? endpoints[candidate].first : endpoints[candidate].second;
    used[candidate] = true;
  }
  require(last == endpoints.front().first, "relief-topology: endpoint cycle is not closed");

  // Exact vertex identity drives adjacency; a nearby point never merges two
  // vertices. Existing PCurve ranges and endpoint positions must agree.
  for (std::size_t i = 0; i < ordered.size(); ++i) {
    const auto& edge = ordered[i]; const auto& next = ordered[(i + 1) % ordered.size()];
    double a, b, c, d;
    auto pc = BRep_Tool::CurveOnSurface(edge, face, a, b);
    auto pn = BRep_Tool::CurveOnSurface(next, face, c, d);
    require(!pc.IsNull() && !pn.IsNull(), "relief-topology: missing PCurve");
    const auto end = pc->Value(edge.Orientation() == TopAbs_REVERSED ? a : b);
    const auto start = pn->Value(next.Orientation() == TopAbs_REVERSED ? d : c);
    require(end.Distance(start) <= validationTolerance,
            "relief-topology: PCurve endpoints disagree; periodic shifting is not implicit");
  }
  BRep_Builder builder;
  auto makeWire = [&](const std::vector<TopoDS_Edge>& sequence) {
    TopoDS_Wire wire; builder.MakeWire(wire);
    for (const auto& edge : sequence) builder.Add(wire, edge);
    return wire;
  };
  auto wire = makeWire(ordered);
  if (!roleMatches(signedUVArea(wire, face), plan.role)) {
    std::vector<TopoDS_Edge> reversed;
    for (auto it = ordered.rbegin(); it != ordered.rend(); ++it)
      reversed.push_back(TopoDS::Edge(it->Reversed()));
    wire = makeWire(reversed);
  }
  checkWire(wire, face);
  require(roleMatches(signedUVArea(wire, face), plan.role), "relief-topology: UV role mismatch");
  ++receipt.rebuiltWires;
  return wire;
}

inline TopoDS_Face rebuildFace(const FacePlan& plan, Receipt& receipt) {
  require(!plan.face.IsNull() && ordinaryOrientation(plan.face), "relief-topology: invalid face plan");
  const auto forward = TopoDS::Face(plan.face.Oriented(TopAbs_FORWARD));
  TopTools_IndexedMapOfShape expected, supplied;
  for (TopExp_Explorer it(forward, TopAbs_WIRE); it.More(); it.Next()) expected.Add(it.Current());
  int outerCount = 0;
  for (const auto& wire : plan.wires) {
    require(expected.Contains(wire.wire) && !supplied.Contains(wire.wire),
            "relief-topology: missing, duplicate, or foreign planned wire");
    supplied.Add(wire.wire); outerCount += wire.role == WireRole::Outer;
  }
  require(supplied.Extent() == expected.Extent() && outerCount == 1,
          "relief-topology: explicit one-outer/all-wire plan required");
  auto result = TopoDS::Face(forward.EmptyCopied());
  BRep_Builder builder;
  for (const auto& wire : plan.wires) builder.Add(result, orderedWire(wire, forward, receipt));
  result.Orientation(plan.face.Orientation());
  require(BRepCheck_Analyzer(result, true).IsValid(), "relief-topology: rebuilt face failed exact BRep checks");
  ++receipt.rebuiltFaces;
  return result;
}

inline void checkSharedUses(const TopoDS_Shape& solid, Receipt& receipt) {
  TopTools_IndexedMapOfShape edges;
  std::vector<std::pair<int, int>> counts(1);
  for (TopExp_Explorer fi(solid, TopAbs_FACE); fi.More(); fi.Next())
    for (TopExp_Explorer ei(fi.Current(), TopAbs_EDGE); ei.More(); ei.Next()) {
      auto edge = TopoDS::Edge(ei.Current());
      if (BRep_Tool::Degenerated(edge)) continue;
      require(ordinaryOrientation(edge), "relief-topology: non-boundary solid edge");
      const int index = edges.Add(edge);
      if (counts.size() <= static_cast<std::size_t>(index)) counts.resize(index + 1);
      if (edge.Orientation() == TopAbs_FORWARD) ++counts[index].first; else ++counts[index].second;
    }
  for (int i = 1; i <= edges.Extent(); ++i)
    require(counts[i].first == 1 && counts[i].second == 1,
            "relief-topology: shared edge must have exactly two opposite uses");
  receipt.sharedNondegenerateEdges = edges.Extent();
}

inline TopoDS_Solid rebuildSolidBoundaries(const TopoDS_Solid& source,
                                         const std::vector<FacePlan>& plans, Receipt& receipt) {
  require(!source.IsNull() && source.Orientation() == TopAbs_FORWARD,
          "relief-topology: one forward construction solid required");
  require(source.Location().IsIdentity(), "relief-topology: located construction solid unsupported");
  std::vector<TopoDS_Shell> shells;
  for (TopExp_Explorer it(source, TopAbs_SHELL); it.More(); it.Next()) shells.push_back(TopoDS::Shell(it.Current()));
  require(shells.size() == 1 && shells.front().Orientation() == TopAbs_FORWARD,
          "relief-topology: only one forward shell is supported");
  require(shells.front().Location().IsIdentity(), "relief-topology: located construction shell unsupported");
  TopTools_IndexedMapOfShape faces, planned;
  TopExp::MapShapes(source, TopAbs_FACE, faces);
  for (const auto& plan : plans) {
    require(faces.Contains(plan.face) && !planned.Contains(plan.face), "relief-topology: foreign or duplicate face plan");
    planned.Add(plan.face);
  }
  BRep_Builder builder; TopoDS_Shell shell; builder.MakeShell(shell);
  for (int i = 1; i <= faces.Extent(); ++i) {
    auto face = TopoDS::Face(faces(i));
    require(face.Location().IsIdentity(), "relief-topology: located construction face unsupported");
    for (const auto& plan : plans) if (face.IsSame(plan.face)) { face = rebuildFace(plan, receipt); break; }
    builder.Add(shell, face);
  }
  auto result = TopoDS::Solid(source.EmptyCopied()); builder.Add(result, shell);
  require(BRep_Tool::IsClosed(shell), "relief-topology: assembled shell is open");
  checkSharedUses(result, receipt);
  require(BRepCheck_Analyzer(result, true).IsValid(), "relief-topology: assembled solid is invalid");
  return result;
}
} // namespace webcad::relief_topology
