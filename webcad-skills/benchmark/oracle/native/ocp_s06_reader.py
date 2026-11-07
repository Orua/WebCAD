"""Isolated S06 reference and bidirectional STEP-surface sampler.

No dependency used by the running S03 acceptance queue is modified. Sampling is
not a certified continuous maximum-distance proof. All STEP UV values are used
only to select actual points; target parameters come from independent inversion.
"""
import argparse
import json
import math
from pathlib import Path
import ocp_reader as base
import s06_math as oracle
from OCP.TColgp import TColgp_Array2OfPnt
from OCP.TColStd import TColStd_Array1OfReal, TColStd_Array1OfInteger
from OCP.Geom import Geom_BSplineSurface
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakePolygon, BRepBuilderAPI_MakeVertex
from OCP.BRepExtrema import BRepExtrema_DistShapeShape
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepTools import BRepTools
from OCP.BRep import BRep_Builder
from OCP.TopoDS import TopoDS_Compound
from OCP.TopAbs import TopAbs_EDGE
from OCP.gp import gp_Pnt2d


def reference(variant="reference"):
    if variant not in {"reference", "wrong-interior", "wrong-boundary", "extra-patch"}:
        raise ValueError("S06_REFERENCE_VARIANT_NOT_IMPLEMENTED")
    # Independent tensor-product construction: quadratic U and cubic Hermite V.
    # This does not call the product's rectangular point-grid fitter.
    segments = 16
    bubble = 1.5 if variant == "wrong-interior" else 0
    width_extra = 1 if variant == "wrong-boundary" else 0

    def pole(row, t):
        sign = [-1, 0, 1][row]
        return [sign*(10+2*math.sin(math.pi*t)+width_extra), 40*t,
                ([5, 5+2*bubble, 5][row])*math.sin(math.pi*t)+[2, -2, 2][row]]

    def tangent(row, t):
        sign = [-1, 0, 1][row]
        return [sign*2*math.pi*math.cos(math.pi*t), 40,
                ([5, 5+2*bubble, 5][row])*math.pi*math.cos(math.pi*t)]

    rows = []
    for row in range(3):
        points = []
        for segment in range(segments):
            a, b = segment/segments, (segment+1)/segments
            p0, p3, d0, d1 = pole(row, a), pole(row, b), tangent(row, a), tangent(row, b)
            p1 = [p+(b-a)*d/3 for p, d in zip(p0, d0)]
            p2 = [p-(b-a)*d/3 for p, d in zip(p3, d1)]
            points.extend([p0, p1, p2, p3] if segment == 0 else [p1, p2, p3])
        rows.append(points)
    poles = TColgp_Array2OfPnt(1, 3, 1, len(rows[0]))
    for i, row in enumerate(rows, 1):
        for j, point in enumerate(row, 1):
            poles.SetValue(i, j, base.gp_Pnt(*point))
    uk, um = TColStd_Array1OfReal(1, 2), TColStd_Array1OfInteger(1, 2)
    uk.SetValue(1, 0); uk.SetValue(2, 1)
    um.SetValue(1, 3); um.SetValue(2, 3)
    vk, vm = TColStd_Array1OfReal(1, segments+1), TColStd_Array1OfInteger(1, segments+1)
    for i in range(segments+1):
        vk.SetValue(i+1, i/segments)
        vm.SetValue(i+1, 4 if i in (0, segments) else 3)
    surface = Geom_BSplineSurface(poles, uk, vk, um, vm, 2, 3, False, False)
    face = BRepBuilderAPI_MakeFace(surface, 1e-7).Face()
    if variant != "extra-patch":
        return face
    polygon = BRepBuilderAPI_MakePolygon()
    for point in [(25, 0, 0), (30, 0, 0), (30, 5, 0), (25, 5, 0)]:
        polygon.Add(base.gp_Pnt(*point))
    polygon.Close()
    patch = BRepBuilderAPI_MakeFace(polygon.Wire()).Face()
    compound, builder = TopoDS_Compound(), BRep_Builder()
    builder.MakeCompound(compound); builder.Add(compound, face); builder.Add(compound, patch)
    return compound


def native_distance(point, shape):
    if shape.IsNull():
        return dict(available=False, point=None, distanceMm=None)
    query = BRepBuilderAPI_MakeVertex(base.gp_Pnt(*point)).Vertex()
    distance = BRepExtrema_DistShapeShape(query, shape)
    distance.Perform()
    if not distance.IsDone() or distance.NbSolution() < 1:
        return dict(available=False, point=None, distanceMm=None)
    actual = distance.PointOnShape2(1)
    return dict(available=True, point=[actual.X(), actual.Y(), actual.Z()], distanceMm=distance.Value())


def combine(verdicts):
    return False if False in verdicts else None if None in verdicts else True


def free_boundaries(shape, faces):
    edges = base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, TopAbs_EDGE, edges)
    uses = [0]*(edges.Extent()+1)
    for i in range(1, faces.Extent()+1):
        explorer = base.TopExp_Explorer(faces.FindKey(i), TopAbs_EDGE)
        while explorer.More():
            index = edges.FindIndex(explorer.Current())
            if index:
                uses[index] += 1
            explorer.Next()
    compound, builder = TopoDS_Compound(), BRep_Builder()
    builder.MakeCompound(compound)
    free = []
    for i in range(1, edges.Extent()+1):
        if uses[i] == 1:
            edge = base.TopoDS.Edge_s(edges.FindKey(i))
            builder.Add(compound, edge); free.append(edge)
    return compound, free


def inspect(shape):
    if shape.IsNull():
        raise ValueError("EMPTY_STEP_SHAPE")
    solids, faces, shells = (base.TopTools_IndexedMapOfShape() for _ in range(3))
    for kind, mapping in [(base.TopAbs_SOLID, solids), (base.TopAbs_FACE, faces), (base.TopAbs_SHELL, shells)]:
        base.TopExp.MapShapes_s(shape, kind, mapping)
    valid = base.BRepCheck_Analyzer(shape, True).IsValid()
    geometry = dict(reader=dict(independent=True, source="isolated OCP S06 bidirectional sampler",
                                version=base.OCP.__version__, sharedKernelFamily=True, algorithmIndependence=False),
                    brepValid=valid, targetType="solid" if solids.Extent() else "surface" if faces.Extent() else "wire",
                    units="mm", solidCount=solids.Extent(), faceCount=faces.Extent(), shellCount=shells.Extent(),
                    bounds=base.bounds(shape), surfaceSamples=[], checks={})
    if not valid or solids.Extent() or not faces.Extent():
        return geometry
    if faces.Extent() > 256:
        geometry["reader"]["unverifiedReason"] = "ORACLE_FACE_BUDGET_EXCEEDED"
        return geometry
    samples = geometry["surfaceSamples"]
    forward = []
    for u, t in [(u, t) for u in oracle.SAMPLE_PARAMETERS for t in oracle.SAMPLE_PARAMETERS]+oracle.OFF_GRID:
        actual = native_distance(oracle.target(u, t), shape)
        forward.append(dict(u=u, t=t, **actual))
        samples.append(dict(u=u, v=t, point=actual["point"], samplingDirection="target-to-actual-STEP"))
    reverse, coverage = [], []
    for i in range(1, faces.Extent()+1):
        face = base.TopoDS.Face_s(faces.FindKey(i))
        u0, u1, v0, v1 = BRepTools.UVBounds_s(face)
        count = 0
        if all(math.isfinite(value) for value in (u0, u1, v0, v1)):
            surface = base.BRepAdaptor_Surface(face, True)
            for a in oracle.SAMPLE_PARAMETERS:
                for b in oracle.SAMPLE_PARAMETERS:
                    u, v = u0+(u1-u0)*a, v0+(v1-v0)*b
                    state = BRepClass_FaceClassifier(face, gp_Pnt2d(u, v), 1e-7).State()
                    if state not in (base.TopAbs_IN, base.TopAbs_ON):
                        continue
                    p = surface.Value(u, v)
                    point = [p.X(), p.Y(), p.Z()]
                    closest = oracle.closest_target(point)
                    verdict = oracle.sample_verdict(closest)
                    reverse.append(dict(face=i, stepUV=[u, v], actualPoint=point, closest=closest, verdict=verdict))
                    samples.append(dict(u=closest["u"], v=closest["t"], point=point if verdict is not None else None,
                                        samplingDirection="actual-STEP-to-target", parameterBinding="numerical closest target parameters, not STEP UV"))
                    count += 1
        coverage.append(dict(face=i, sampledPoints=count))
    boundary_shape, edges = free_boundaries(shape, faces)
    boundary_forward, boundary_reverse = [], []
    if edges:
        for axis, fixed in [(0, 0), (0, 1), (1, 0), (1, 1)]:
            for i in range(17):
                u, t = (fixed, i/16) if axis == 0 else (i/16, fixed)
                measured = native_distance(oracle.target(u, t), boundary_shape)
                boundary_forward.append(dict(boundary=[axis, fixed], parameter=i/16, **measured))
        for index, edge in enumerate(edges):
            curve = BRepAdaptor_Curve(edge)
            first, last = curve.FirstParameter(), curve.LastParameter()
            if not math.isfinite(first) or not math.isfinite(last):
                boundary_reverse.append(dict(edge=index, verdict=None, reason="BOUNDARY_RANGE_UNAVAILABLE")); continue
            for i in range(17):
                p = curve.Value(first+(last-first)*i/16)
                point = [p.X(), p.Y(), p.Z()]
                closest = oracle.closest_boundary(point)
                boundary_reverse.append(dict(edge=index, parameter=i/16, actualPoint=point, closest=closest, verdict=oracle.sample_verdict(closest)))
    forward_verdicts = [m["distanceMm"] <= oracle.TOLERANCE_MM if m["available"] else None for m in boundary_forward]
    boundary_verdict = combine(forward_verdicts+[m["verdict"] for m in boundary_reverse]+[bool(edges), True if all(row["sampledPoints"] for row in coverage) else None])
    geometry["checks"]["boundaries"] = dict(checkerId="ocp-s06-free-boundaries-1", **{"pass": boundary_verdict},
        evidence=dict(freeEdgeCount=len(edges), forward=boundary_forward, reverse=boundary_reverse, toleranceMm=oracle.TOLERANCE_MM, zeroSolids=True, faceSamplingCoverage=coverage))
    geometry["samplingEvidence"] = dict(forward=forward, reverse=reverse, perEdgeSamples=17,
        faceUVGrid="9x9 per trimmed face; outside trim points excluded", targetGrid="9x9 plus four off-grid points",
        stepUVIsTargetUV=False, continuousMaximumErrorCertified=False,
        uncovered="between sampled surface/curve parameters; numerical target distances are not a global extrema proof")
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=["S06"], required=True)
    parser.add_argument("--input")
    parser.add_argument("--write-reference")
    parser.add_argument("--variant", default="reference")
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    if args.variant != "reference" and not args.write_reference:
        parser.error("negative variants require explicit output")
    try:
        report = None
        if args.write_reference:
            if Path(args.write_reference).exists():
                raise ValueError("REFERENCE_OUTPUT_ALREADY_EXISTS")
            shape = reference(args.variant)
            if not base.BRepCheck_Analyzer(shape, True).IsValid():
                raise ValueError("INVALID_REFERENCE_BREP")
            writer = base.STEPControl_Writer()
            if writer.Transfer(shape, base.STEPControl_AsIs) != base.IFSelect_RetDone or writer.Write(args.write_reference) != base.IFSelect_RetDone:
                raise ValueError("REFERENCE_STEP_WRITE_FAILED")
            report = dict(recordType="REFERENCE_OR_NEGATIVE_FIXTURE", caseId="S06", variant=args.variant, geometry=inspect(shape))
        if args.input:
            path = Path(args.input)
            if not path.is_file() or not 0 < path.stat().st_size <= 128*1024*1024:
                raise ValueError("STEP_INPUT_MISSING_OR_OVERSIZED")
            reader = base.STEPControl_Reader()
            if reader.ReadFile(str(path)) != base.IFSelect_RetDone:
                raise ValueError("STEP_PARSE_FAILED")
            lengths, angles, solid_angles = (base.TColStd_SequenceOfAsciiString() for _ in range(3))
            reader.FileUnits(lengths, angles, solid_angles); reader.SetSystemLengthUnit(1.0)
            if reader.TransferRoots() < 1:
                raise ValueError("STEP_TRANSFER_FAILED")
            report = dict(recordType="INDEPENDENT_STEP_GEOMETRY_OBSERVATION", caseId="S06", normalizedLengthUnit="mm",
                          sourceLengthUnits=[lengths.Value(i).ToCString() for i in range(1, lengths.Length()+1)], geometry=inspect(reader.OneShape()))
        if report is None:
            raise ValueError("STEP_INPUT_OR_REFERENCE_OUTPUT_REQUIRED")
        exit_code = 0
    except Exception as error:
        report, exit_code = dict(status="ERROR", error=type(error).__name__, message=str(error)), 2
    with Path(args.report).open("x", encoding="utf-8") as output:
        json.dump(report, output, ensure_ascii=False, allow_nan=False, indent=2)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
