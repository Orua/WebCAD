"""Isolated S02 world-XY ellipse reader. Frozen earlier readers stay unchanged."""
import argparse
import json
import math
from pathlib import Path
import ocp_reader as base
import s02_math as oracle
from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopTools import TopTools_ListOfShape
from OCP.GeomAbs import GeomAbs_Plane
from OCP.gp import gp_Elips, gp_Pln

CURVE_SAMPLES = 48


def measured_point_verdict(point, a, b, numerical):
    # The target ellipse is contained in [-a,a] x [-b,b]. Also rho(p)=|D^-1 p|
    # has Lipschitz constant 1/min(a,b), so min(a,b)*|rho(p)-1| is a distance
    # LOWER bound. Either bound can prove a violation without numerical convergence.
    box_lower = math.hypot(max(abs(point[0])-a, 0), max(abs(point[1])-b, 0))
    rho_lower = min(a, b)*abs(math.hypot(point[0]/a, point[1]/b)-1)
    lower = max(box_lower, rho_lower)
    candidate_distance = numerical.get("distanceMm")
    if lower > oracle.TOLERANCE_MM:
        verdict, reason = False, "certified-target-ellipse-distance-lower-bound"
    elif candidate_distance is not None and candidate_distance <= oracle.TOLERANCE_MM:
        # A candidate on the actual target ellipse within tolerance is sufficient;
        # convergence is not needed to establish this upper-bound witness.
        verdict, reason = True, "target-curve-candidate-within-tolerance"
    else:
        verdict, reason = None, "numerical-distance-not-certified"
    return dict(verdict=verdict, reason=reason, lowerBoundMm=lower, targetAabbLowerBoundMm=box_lower,
                normalizedRadiusLowerBoundMm=rho_lower, numericalDistanceMm=candidate_distance,
                numericalConverged=bool(numerical.get("converged")))


def combine_point_verdicts(checks):
    verdicts = [check["verdict"] for check in checks]
    return False if False in verdicts else None if None in verdicts else True


def reference(variant="reference"):
    if variant not in {"reference", "wrong-middle", "twisted-middle", "wrong-end", "wrong-center"}:
        raise ValueError("S02_REFERENCE_VARIANT_NOT_IMPLEMENTED")
    builder = BRepOffsetAPI_ThruSections(True, False, 1e-6)
    builder.SetMaxDegree(3); builder.CheckCompatibility(False)
    count = 9 if variant == "reference" else 17
    for i in range(count):
        t = i/(count-1)
        a, b = oracle.target_axes(t)
        if variant == "wrong-middle":
            changed_a = a+1.5*math.sin(math.pi*t)
            a, b = changed_a, a*b/changed_a  # preserves each target section area
        if variant == "wrong-end":
            b = 4+1.5*t
        angle = math.pi/6*math.sin(math.pi*t) if variant == "twisted-middle" else 0
        center = base.gp_Pnt(math.sin(math.pi*t) if variant == "wrong-center" else 0, 0, 40*t)
        axis = base.gp_Ax2(center, base.gp_Dir(0, 0, 1), base.gp_Dir(math.cos(angle), math.sin(angle), 0))
        ellipse = gp_Elips(axis, a, b)
        builder.AddWire(BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(ellipse).Edge()).Wire())
    builder.Build()
    if not builder.IsDone():
        raise ValueError("S02_REFERENCE_LOFT_FAILED")
    return builder.Shape()


def planar_caps(shape):
    result = []
    explorer = base.TopExp_Explorer(shape, base.TopAbs_FACE)
    while explorer.More():
        face = base.TopoDS.Face_s(explorer.Current())
        surface = base.BRepAdaptor_Surface(face, True)
        if surface.GetType() == GeomAbs_Plane:
            result.append(base.bounds(face))
        explorer.Next()
    return result


def section_points(shape, z):
    section = BRepAlgoAPI_Section(shape, gp_Pln(base.gp_Pnt(0, 0, z), base.gp_Dir(0, 0, 1)), False)
    section.Approximation(True); section.Build()
    if not section.IsDone():
        return dict(available=False, reason="SECTION_OPERATION_FAILED")
    edges = base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(section.Shape(), TopAbs_EDGE, edges)
    if edges.Extent() == 0 and z in (0, 40):
        explorer = base.TopExp_Explorer(shape, base.TopAbs_FACE)
        while explorer.More():
            face = base.TopoDS.Face_s(explorer.Current())
            surface = base.BRepAdaptor_Surface(face, True)
            limits = base.bounds(face)
            if surface.GetType() == GeomAbs_Plane and base.near(limits["minZ"], z) and base.near(limits["maxZ"], z):
                base.TopExp.MapShapes_s(face, TopAbs_EDGE, edges)
            explorer.Next()
    if not edges.Extent():
        return dict(available=False, reason="SECTION_CURVES_MISSING")
    edge_list, wire = TopTools_ListOfShape(), BRepBuilderAPI_MakeWire()
    for i in range(1, edges.Extent()+1):
        edge_list.Append(edges.FindKey(i))
    wire.Add(edge_list)
    closed = wire.IsDone()
    if closed:
        used = base.TopTools_IndexedMapOfShape()
        base.TopExp.MapShapes_s(wire.Wire(), TopAbs_EDGE, used)
        closed = used.Extent() == edges.Extent() and wire.Wire().Closed()
    points = []
    for i in range(1, edges.Extent()+1):
        curve = BRepAdaptor_Curve(base.TopoDS.Edge_s(edges.FindKey(i)))
        first, last = curve.FirstParameter(), curve.LastParameter()
        if not math.isfinite(first) or not math.isfinite(last) or last <= first:
            return dict(available=False, reason="SECTION_CURVE_RANGE_UNAVAILABLE")
        for j in range(CURVE_SAMPLES):
            point = curve.Value(first+(last-first)*j/CURVE_SAMPLES)
            points.append([point.X(), point.Y(), point.Z()])
    fitted = oracle.fit_ellipse(points)
    return dict(available=fitted is not None, reason=None if fitted else "ELLIPSE_FIT_UNAVAILABLE",
                closedSingleContour=bool(closed), points=points, fitted=fitted, edgeCount=edges.Extent())


def inspect(shape):
    if shape.IsNull():
        raise ValueError("EMPTY_STEP_SHAPE")
    solids, shells = base.TopTools_IndexedMapOfShape(), base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, base.TopAbs_SOLID, solids); base.TopExp.MapShapes_s(shape, base.TopAbs_SHELL, shells)
    valid = base.BRepCheck_Analyzer(shape, True).IsValid()
    geometry = dict(reader=dict(independent=True, source="OCP STEP world-XY ellipse sections",
                                version=base.OCP.__version__, sharedKernelFamily=True, algorithmIndependence=False),
                    brepValid=valid, targetType="solid" if solids.Extent() else "surface", units="mm",
                    solidCount=solids.Extent(), shellCount=shells.Extent(), volume=base.volume(shape),
                    bounds=base.bounds(shape), sections=[], checks={})
    if not valid or solids.Extent() != 1:
        return geometry
    frames, verdicts = [], []
    for t in oracle.STATIONS:
        measured = section_points(shape, 40*t)
        fitted = measured.get("fitted")
        if fitted:
            a, b = oracle.target_axes(t)
            distances = [oracle.ellipse_distance(point, a, b) for point in measured["points"]]
            maximum = max(item["distanceMm"] for item in distances)
            point_checks = [dict(index=i, **measured_point_verdict(point, a, b, distance)) for i, (point, distance) in enumerate(zip(measured["points"], distances))]
            distance_verdict = combine_point_verdicts(point_checks)
            if not measured["closedSingleContour"] or fitted["maxPlaneResidualMm"] > base.LENGTH_TOLERANCE:
                distance_verdict = False
            geometry["sections"].append(dict(t=t, z=fitted["z"], a=fitted["a"], b=fitted["b"]))
            frames.append(dict(t=t, fitted=fitted, sampleMaxTargetDeviationMm=maximum, numericalMaximumIsCandidateOnly=True,
                               sampleMaxCertifiedLowerBoundMm=max(item["lowerBoundMm"] for item in point_checks),
                               points=measured["points"], verdict=distance_verdict, pointDistanceEvidence=point_checks,
                               closedSingleContour=measured["closedSingleContour"], edgeCount=measured["edgeCount"]))
            verdicts.append(distance_verdict)
        else:
            geometry["sections"].append(dict(t=t, z=None, a=None, b=None))
            frames.append(dict(t=t, reason=measured["reason"], verdict=None)); verdicts.append(None)
    caps = planar_caps(shape)
    cap_planes = all(any(base.near(face["minZ"], z) and base.near(face["maxZ"], z) for face in caps) for z in (0, 40))
    end = frames[-1].get("fitted")
    circle = None if end is None else abs(end["major"]-6) <= oracle.TOLERANCE_MM and abs(end["minor"]-6) <= oracle.TOLERANCE_MM
    verdicts.extend([cap_planes, circle])
    verdict = False if False in verdicts else None if None in verdicts else True
    # This mandatory assertion includes the prescribed untwisted world frame,
    # because the unchanged scalar section assertion alone cannot detect a shifted center.
    geometry["checks"]["endCircle"] = dict(checkerId="ocp-s02-ellipse-frame-1", **{"pass": verdict},
        evidence=dict(scope="end circle plus all sampled axis-aligned centered ellipse frames", frames=frames, capPlanes=caps,
                      targetCurveDistanceToleranceMm=oracle.TOLERANCE_MM, planeToleranceMm=base.LENGTH_TOLERANCE,
                      samplesPerEdge=CURVE_SAMPLES, sectionStations=oracle.STATIONS,
                      rejectionProof="actual sample distance lower bounds from target support box and normalized ellipse radius; unrelated numerical nonconvergence does not erase a proven failure",
                      measuredAxesDefinition="world-X/Y ellipse half-extents fitted to actual STEP section points",
                      circleAxisAngleIgnored=True, continuousMaximumErrorCertified=False,
                      uncovered="between sampled section/curve parameters; not a continuous maximum-error proof"))
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=["S02"], required=True)
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
            report = dict(recordType="REFERENCE_OR_NEGATIVE_FIXTURE", caseId="S02", variant=args.variant, geometry=inspect(shape))
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
            report = dict(recordType="INDEPENDENT_STEP_GEOMETRY_OBSERVATION", caseId="S02", normalizedLengthUnit="mm",
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
