"""S03 independent world-XY section observation. Uses frozen base helpers unchanged.

Dense sections and off-station samples are evidence, not a certified continuous
Hausdorff bound. Curve fitting uses actual STEP section points, never expected centers.
"""
import argparse
import json
import math
from pathlib import Path
import ocp_reader as base
from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopTools import TopTools_ListOfShape
from OCP.GeomAbs import GeomAbs_Plane
from OCP.gp import gp_Circ, gp_Pln

STATIONS = sorted(set([i/32 for i in range(33)] + [.017, .139, .311, .537, .773, .967]))
CURVE_SAMPLES = 96
SURFACE_TOLERANCE = .05


def fit_circle(points):
    """Algebraic least-squares circle plus actual max radial/plane residuals."""
    if len(points) < 6:
        return None
    mean_x = sum(p[0] for p in points)/len(points)
    mean_y = sum(p[1] for p in points)/len(points)
    matrix = [[0.0]*4 for _ in range(3)]
    for x, y, _ in points:
        dx, dy = x-mean_x, y-mean_y
        row, value = [dx, dy, 1.0], -(dx*dx+dy*dy)
        for i in range(3):
            for j in range(3):
                matrix[i][j] += row[i]*row[j]
            matrix[i][3] += row[i]*value
    for column in range(3):
        pivot = max(range(column, 3), key=lambda row: abs(matrix[row][column]))
        if abs(matrix[pivot][column]) < 1e-12:
            return None
        matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
        divisor = matrix[column][column]
        matrix[column] = [v/divisor for v in matrix[column]]
        for row in range(3):
            if row == column:
                continue
            factor = matrix[row][column]
            matrix[row] = [a-factor*b for a, b in zip(matrix[row], matrix[column])]
    a, b, c = (matrix[i][3] for i in range(3))
    radius_squared = (a*a+b*b)/4-c
    if radius_squared <= 0:
        return None
    x, y, radius = mean_x-a/2, mean_y-b/2, math.sqrt(radius_squared)
    mean_z = sum(p[2] for p in points)/len(points)
    return dict(x=x, y=y, z=mean_z, radius=radius,
                maxCircleResidualMm=max(abs(math.hypot(p[0]-x, p[1]-y)-radius) for p in points),
                maxPlaneResidualMm=max(abs(p[2]-mean_z) for p in points), pointCount=len(points))


def reference(variant="reference"):
    if variant not in {"reference", "wrong-normal", "wrong-center", "ends-only"}:
        raise ValueError("S03_REFERENCE_VARIANT_NOT_IMPLEMENTED")
    builder = BRepOffsetAPI_ThruSections(True, False, 1e-6)
    builder.SetMaxDegree(3)
    builder.CheckCompatibility(False)
    count = 2 if variant == "ends-only" else 17
    amplitude = 5 if variant == "wrong-center" else 6
    for i in range(count):
        t = i/(count-1)
        center = base.gp_Pnt(amplitude*math.sin(math.pi*t), 0, 40*t)
        normal = base.gp_Dir(6*math.pi/40*math.cos(math.pi*t), 0, 1) if variant == "wrong-normal" else base.gp_Dir(0, 0, 1)
        circle = gp_Circ(base.gp_Ax2(center, normal, base.gp_Dir(0, 1, 0)), 5-2*t)
        builder.AddWire(BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(circle).Edge()).Wire())
    builder.Build()
    if not builder.IsDone():
        raise ValueError("S03_REFERENCE_LOFT_FAILED")
    return builder.Shape()


def end_faces(shape):
    faces = []
    explorer = base.TopExp_Explorer(shape, base.TopAbs_FACE)
    while explorer.More():
        face = base.TopoDS.Face_s(explorer.Current())
        surface = base.BRepAdaptor_Surface(face, True)
        if surface.GetType() == GeomAbs_Plane:
            limits = base.bounds(face)
            axis = surface.Plane().Axis().Direction()
            faces.append(dict(bounds=limits, normal=[axis.X(), axis.Y(), axis.Z()]))
        explorer.Next()
    return faces


def section_points(shape, z):
    operation = BRepAlgoAPI_Section(shape, gp_Pln(base.gp_Pnt(0, 0, z), base.gp_Dir(0, 0, 1)), False)
    operation.Approximation(True)
    operation.Build()
    if not operation.IsDone():
        return dict(available=False, reason="SECTION_OPERATION_FAILED")
    edges = base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(operation.Shape(), TopAbs_EDGE, edges)
    source = "world-XY BRep section"
    if edges.Extent() == 0 and z in (0, 40):
        explorer = base.TopExp_Explorer(shape, base.TopAbs_FACE)
        while explorer.More():
            face = base.TopoDS.Face_s(explorer.Current())
            surface = base.BRepAdaptor_Surface(face, True)
            if surface.GetType() == GeomAbs_Plane:
                limits = base.bounds(face)
                if base.near(limits["minZ"], z) and base.near(limits["maxZ"], z):
                    base.TopExp.MapShapes_s(face, TopAbs_EDGE, edges)
            explorer.Next()
        source = "exact planar end-face boundary"
    if edges.Extent() == 0:
        return dict(available=False, reason="SECTION_CURVES_MISSING", source=source)
    edge_list = TopTools_ListOfShape()
    for i in range(1, edges.Extent()+1):
        edge_list.Append(edges.FindKey(i))
    wire = BRepBuilderAPI_MakeWire()
    wire.Add(edge_list)
    connected = wire.IsDone()
    if connected:
        used = base.TopTools_IndexedMapOfShape()
        base.TopExp.MapShapes_s(wire.Wire(), TopAbs_EDGE, used)
        connected = used.Extent() == edges.Extent() and wire.Wire().Closed()
    points = []
    for i in range(1, edges.Extent()+1):
        curve = BRepAdaptor_Curve(base.TopoDS.Edge_s(edges.FindKey(i)))
        first, last = curve.FirstParameter(), curve.LastParameter()
        if not math.isfinite(first) or not math.isfinite(last) or last <= first:
            return dict(available=False, reason="SECTION_CURVE_RANGE_UNAVAILABLE", source=source)
        for j in range(CURVE_SAMPLES):
            point = curve.Value(first+(last-first)*j/CURVE_SAMPLES)
            points.append([point.X(), point.Y(), point.Z()])
    fitted = fit_circle(points)
    return dict(available=fitted is not None, reason=None if fitted else "SECTION_CIRCLE_FIT_UNAVAILABLE",
                source=source, closedSingleContour=bool(connected), edgeCount=edges.Extent(),
                samplesPerEdge=CURVE_SAMPLES, fitted=fitted)


def inspect(shape):
    if shape.IsNull():
        raise ValueError("EMPTY_STEP_SHAPE")
    solids, shells = base.TopTools_IndexedMapOfShape(), base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, base.TopAbs_SOLID, solids)
    base.TopExp.MapShapes_s(shape, base.TopAbs_SHELL, shells)
    valid = base.BRepCheck_Analyzer(shape, True).IsValid()
    geometry = dict(reader=dict(independent=True, source="standalone OCP STEP world-XY section reader",
                                engine="OpenCASCADE via OCP", version=base.OCP.__version__,
                                sharedKernelFamily=True, algorithmIndependence=False), brepValid=valid,
                    targetType="solid" if solids.Extent() else "surface", units="mm", solidCount=solids.Extent(),
                    shellCount=shells.Extent(), volume=base.volume(shape), bounds=base.bounds(shape), sections=[], checks={})
    if not valid or solids.Extent() != 1:
        return geometry
    measurements = []
    for t in STATIONS:
        measured = section_points(shape, 40*t)
        measurements.append(dict(t=t, **measured))
        fitted = measured.get("fitted") or {}
        geometry["sections"].append(dict(t=t, **{key: fitted.get(key) for key in ("x", "y", "z", "radius")}))
    caps = end_faces(shape)
    caps_horizontal = all(any(base.near(face["bounds"]["minZ"], z) and base.near(face["bounds"]["maxZ"], z) for face in caps) for z in (0, 40))
    available = all(m["available"] for m in measurements)
    circles = available and all(m["closedSingleContour"] and m["fitted"]["maxCircleResidualMm"] <= SURFACE_TOLERANCE and m["fitted"]["maxPlaneResidualMm"] <= base.LENGTH_TOLERANCE for m in measurements)
    evidence = dict(sectionStations=STATIONS, measurements=measurements, capFaces=caps,
                    lengthToleranceMm=base.LENGTH_TOLERANCE, circleResidualToleranceMm=SURFACE_TOLERANCE,
                    coverage="39 world-XY sections including six off-grid stations; 96 parameter samples per edge",
                    continuousMaximumErrorCertified=False, uncovered="between sampled stations/curve parameters; not a global Hausdorff proof")
    geometry["checks"]["sectionPlanes"] = dict(checkerId="ocp-world-xy-sections-1", **{"pass": bool(circles and caps_horizontal) if available or not caps_horizontal else None}, evidence=evidence)
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=["S03"], required=True)
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
            report = dict(recordType="REFERENCE_OR_NEGATIVE_FIXTURE", caseId="S03", variant=args.variant, geometry=inspect(shape))
        if args.input:
            path = Path(args.input)
            if not path.is_file() or not 0 < path.stat().st_size <= 128*1024*1024:
                raise ValueError("STEP_INPUT_MISSING_OR_OVERSIZED")
            reader = base.STEPControl_Reader()
            if reader.ReadFile(str(path)) != base.IFSelect_RetDone:
                raise ValueError("STEP_PARSE_FAILED")
            lengths, angles, solid_angles = (base.TColStd_SequenceOfAsciiString() for _ in range(3))
            reader.FileUnits(lengths, angles, solid_angles)
            reader.SetSystemLengthUnit(1.0)
            if reader.TransferRoots() < 1:
                raise ValueError("STEP_TRANSFER_FAILED")
            report = dict(recordType="INDEPENDENT_STEP_GEOMETRY_OBSERVATION", caseId="S03", normalizedLengthUnit="mm",
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
