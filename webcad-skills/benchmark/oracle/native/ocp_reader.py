"""Read-only STEP evaluator using a host-supplied OCP installation.

No Services/page calls, credentials, network, default SDK paths or application writes.
Reference construction is evaluator-only. OCCT is a shared algorithm family;
the independent process/reference is not an independent CAD algorithm proof.
"""
import argparse
import json
import math
from pathlib import Path

import OCP
from OCP.STEPControl import STEPControl_Reader, STEPControl_Writer, STEPControl_AsIs
from OCP.IFSelect import IFSelect_RetDone
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepGProp import BRepGProp
from OCP.BRepBndLib import BRepBndLib
from OCP.GProp import GProp_GProps
from OCP.Bnd import Bnd_Box
from OCP.TopExp import TopExp, TopExp_Explorer
from OCP.TopTools import TopTools_IndexedMapOfShape
from OCP.TopAbs import TopAbs_SOLID, TopAbs_SHELL, TopAbs_FACE, TopAbs_IN, TopAbs_OUT, TopAbs_ON
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder
from OCP.BRepClass3d import BRepClass3d_SolidClassifier
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakePrism
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeWire, BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeFace
from OCP.GC import GC_MakeArcOfCircle
from OCP.gp import gp_Pnt, gp_Dir, gp_Ax2, gp_Vec
from OCP.TColStd import TColStd_SequenceOfAsciiString

LENGTH_TOLERANCE = 0.01
DIFFERENCE_VOLUME_TOLERANCE = 1e-5


def near(a, b, tolerance=LENGTH_TOLERANCE):
    return math.isfinite(a) and abs(a - b) <= tolerance


def volume(shape):
    if shape.IsNull():
        return 0.0
    properties = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, properties)
    return abs(properties.Mass())


def bounds(shape):
    box = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape, box, False, False)
    x0, y0, z0, x1, y1, z1 = box.Get()
    return dict(minX=x0, minY=y0, minZ=z0, maxX=x1, maxY=y1, maxZ=z1)


def cut(first, second):
    operation = BRepAlgoAPI_Cut(first, second)
    operation.Build()
    if not operation.IsDone():
        raise ValueError("BOOLEAN_REFERENCE_CHECK_FAILED")
    return operation.Shape()


def reference(case_id, variant="reference"):
    allowed = {"B01": {"reference", "wrong-size", "wrong-hole", "blind-hole"},
               "B02": {"reference", "wrong-size", "wrong-hole"},
               "B03": {"reference", "wrong-radius"}}
    if variant not in allowed.get(case_id, set()):
        raise ValueError("CASE_VARIANT_NOT_IMPLEMENTED")
    if case_id == "B01":
        shape = BRepPrimAPI_MakeBox(gp_Pnt(-20, -15, 0), 41 if variant == "wrong-size" else 40, 30, 4).Shape()
        for x in (-12, 12):
            blind = variant == "blind-hole"
            drill = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, 0, 2 if blind else 0), gp_Dir(0, 0, 1)),
                                            2.5 if variant == "wrong-hole" else 2, 2 if blind else 4).Shape()
            shape = cut(shape, drill)
        return shape
    if case_id == "B02":
        return cut(BRepPrimAPI_MakeCylinder(6.5 if variant == "wrong-size" else 6, 20).Shape(),
                   BRepPrimAPI_MakeCylinder(3 if variant == "wrong-hole" else 4, 20).Shape())
    # Independent construction: exact rounded 2D wire extruded, not a product fillet.
    radius = 2 if variant == "wrong-radius" else 1
    a, b, k = 15 - radius, 10 - radius, math.sqrt(0.5)
    wire = BRepBuilderAPI_MakeWire()

    def line(p, q):
        wire.Add(BRepBuilderAPI_MakeEdge(gp_Pnt(*p), gp_Pnt(*q)).Edge())

    def arc(p, middle, q):
        curve = GC_MakeArcOfCircle(gp_Pnt(*p), gp_Pnt(*middle), gp_Pnt(*q)).Value()
        wire.Add(BRepBuilderAPI_MakeEdge(curve).Edge())

    line((-a, -10, 0), (a, -10, 0))
    arc((a, -10, 0), (a + radius*k, -b - radius*k, 0), (15, -b, 0))
    line((15, -b, 0), (15, b, 0))
    arc((15, b, 0), (a + radius*k, b + radius*k, 0), (a, 10, 0))
    line((a, 10, 0), (-a, 10, 0))
    arc((-a, 10, 0), (-a - radius*k, b + radius*k, 0), (-15, b, 0))
    line((-15, b, 0), (-15, -b, 0))
    arc((-15, -b, 0), (-a - radius*k, -b - radius*k, 0), (-a, -10, 0))
    return BRepPrimAPI_MakePrism(BRepBuilderAPI_MakeFace(wire.Wire()).Face(), gp_Vec(0, 0, 5)).Shape()


def cylinder_faces(shape):
    result = []
    explorer = TopExp_Explorer(shape, TopAbs_FACE)
    while explorer.More():
        face = TopoDS.Face_s(explorer.Current())
        surface = BRepAdaptor_Surface(face, True)
        if surface.GetType() == GeomAbs_Cylinder:
            cylinder = surface.Cylinder()
            axis = cylinder.Axis()
            point, direction = axis.Location(), axis.Direction()
            result.append(dict(x=point.X(), y=point.Y(), radius=cylinder.Radius(),
                               axis=[direction.X(), direction.Y(), direction.Z()],
                               vertical=abs(direction.Z()) > 1-1e-8, bounds=bounds(face)))
        explorer.Next()
    return result


def material_samples(solid, points, expected):
    samples = []
    for point in points:
        state = BRepClass3d_SolidClassifier(solid, gp_Pnt(*point), 1e-7).State()
        samples.append(dict(point=point, classification="inside" if state == TopAbs_IN else
                            "outside" if state == TopAbs_OUT else "boundary" if state == TopAbs_ON else "unknown"))
    expected_name = "inside" if expected == TopAbs_IN else "outside"
    return {"pass": all(sample["classification"] == expected_name for sample in samples), "samples": samples}


def check(passed, evidence):
    return dict(checkerId="python-ocp-step-1", **{"pass": bool(passed)}, evidence=evidence)


def inspect(shape, case_id):
    if shape.IsNull():
        raise ValueError("EMPTY_STEP_SHAPE")
    solids, shells = TopTools_IndexedMapOfShape(), TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, TopAbs_SOLID, solids)
    TopExp.MapShapes_s(shape, TopAbs_SHELL, shells)
    valid = BRepCheck_Analyzer(shape, True).IsValid()
    geometry = dict(reader=dict(independent=True, source="standalone OCP STEP reader and separate reference construction",
                                engine="OpenCASCADE via OCP", version=OCP.__version__, bindingVersion=OCP.__version__,
                                sharedKernelFamily=True, algorithmIndependence=False),
                    brepValid=valid, targetType="solid" if solids.Extent() else "surface", units="mm",
                    solidCount=solids.Extent(), shellCount=shells.Extent(), volume=volume(shape), bounds=bounds(shape), checks={})
    if not valid or solids.Extent() != 1:
        return geometry
    solid, expected = solids.FindKey(1), reference(case_id)
    missing, extra = volume(cut(expected, solid)), volume(cut(solid, expected))
    equivalent = missing <= DIFFERENCE_VOLUME_TOLERANCE and extra <= DIFFERENCE_VOLUME_TOLERANCE
    difference = dict(missingMaterialMm3=missing, extraMaterialMm3=extra,
                      toleranceMm3=DIFFERENCE_VOLUME_TOLERANCE, withinTolerance=equivalent)
    geometry["referenceDifference"] = difference
    cylinders = cylinder_faces(solid)
    geometry["cylinders"] = cylinders
    checks = geometry["checks"]
    if case_id == "B01":
        holes = []
        for cylinder in cylinders:
            if not cylinder["vertical"]:
                continue
            found = next((h for h in holes if near(h["x"], cylinder["x"], 1e-7) and
                          near(h["y"], cylinder["y"], 1e-7) and near(h["diameter"], 2*cylinder["radius"], 1e-7)), None)
            if found is not None:
                found["minZ"] = min(found["minZ"], cylinder["bounds"]["minZ"])
                found["maxZ"] = max(found["maxZ"], cylinder["bounds"]["maxZ"])
            else:
                holes.append(dict(x=cylinder["x"], y=cylinder["y"], diameter=2*cylinder["radius"],
                                  minZ=cylinder["bounds"]["minZ"], maxZ=cylinder["bounds"]["maxZ"]))
        geometry["holes"] = holes
        voids = material_samples(solid, [[x, 0, z] for x in (-12, 12) for z in (.5, 2, 3.5)], TopAbs_OUT)
        kept = material_samples(solid, [[0, 0, 2], [-19, -14, 2], [19, 14, 2]], TopAbs_IN)
        checks["through"] = check(equivalent and voids["pass"], dict(voidSamples=voids, referenceDifference=difference))
        checks["retainedMaterial"] = check(equivalent and kept["pass"], dict(materialSamples=kept, referenceDifference=difference))
    elif case_id == "B02":
        radii = bool(cylinders) and all(near(c["radius"], 4) or near(c["radius"], 6) for c in cylinders)
        radii = radii and any(near(c["radius"], 4) for c in cylinders) and any(near(c["radius"], 6) for c in cylinders)
        checks["diameters"] = check(radii, dict(cylinders=cylinders))
        checks["coaxial"] = check(bool(cylinders) and all(c["vertical"] and near(c["x"], 0) and near(c["y"], 0) for c in cylinders), dict(cylinders=cylinders))
        checks["height"] = check(near(geometry["bounds"]["minZ"], 0) and near(geometry["bounds"]["maxZ"], 20), geometry["bounds"])
        bore = material_samples(solid, [[0, 0, z] for z in (.1, 5, 10, 19.9)], TopAbs_OUT)
        checks["through"] = check(equivalent and bore["pass"], dict(boreSamples=bore, referenceDifference=difference))
    elif case_id == "B03":
        checks["radius"] = check(len(cylinders) == 4 and all(near(c["radius"], 1) for c in cylinders), dict(cylinders=cylinders))
        scope = len(cylinders) == 4 and all(c["vertical"] and near(abs(c["x"]), 14) and near(abs(c["y"]), 9) for c in cylinders)
        checks["edgeScope"] = check(scope and equivalent, dict(cylinders=cylinders, referenceDifference=difference))
        checks["thickness"] = check(near(geometry["bounds"]["minZ"], 0) and near(geometry["bounds"]["maxZ"], 5), geometry["bounds"])
        # Undo is intentionally absent: no STEP reader can verify live application undo.
    return geometry


def run(args):
    report = None
    if args.write_reference:
        path = Path(args.write_reference)
        if path.exists():
            raise ValueError("REFERENCE_OUTPUT_ALREADY_EXISTS")
        shape = reference(args.case, args.variant)
        if not BRepCheck_Analyzer(shape, True).IsValid():
            raise ValueError("INVALID_REFERENCE_BREP")
        writer = STEPControl_Writer()
        if writer.Transfer(shape, STEPControl_AsIs) != IFSelect_RetDone or writer.Write(str(path)) != IFSelect_RetDone:
            raise ValueError("REFERENCE_STEP_WRITE_FAILED")
        report = dict(recordType="REFERENCE_OR_NEGATIVE_FIXTURE", caseId=args.case, variant=args.variant, geometry=inspect(shape, args.case))
    if args.input:
        path = Path(args.input)
        if not path.is_file() or not 0 < path.stat().st_size <= 128*1024*1024:
            raise ValueError("STEP_INPUT_MISSING_OR_OVERSIZED")
        reader = STEPControl_Reader()
        if reader.ReadFile(str(path)) != IFSelect_RetDone:
            raise ValueError("STEP_PARSE_FAILED")
        lengths, angles, solid_angles = (TColStd_SequenceOfAsciiString() for _ in range(3))
        reader.FileUnits(lengths, angles, solid_angles)
        reader.SetSystemLengthUnit(1.0)  # normalize STEP's declared units into mm
        if reader.TransferRoots() < 1:
            raise ValueError("STEP_TRANSFER_FAILED")
        report = dict(recordType="INDEPENDENT_STEP_GEOMETRY_OBSERVATION", caseId=args.case,
                      sourceLengthUnits=[lengths.Value(i).ToCString() for i in range(1, lengths.Length()+1)],
                      normalizedLengthUnit="mm", geometry=inspect(reader.OneShape(), args.case))
    if report is None:
        raise ValueError("STEP_INPUT_OR_REFERENCE_OUTPUT_REQUIRED")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=["B01", "B02", "B03"], required=True)
    parser.add_argument("--input")
    parser.add_argument("--write-reference")
    parser.add_argument("--variant", default="reference")
    parser.add_argument("--report", required=True, help="New exclusive JSON report path in host evidence storage")
    args = parser.parse_args()
    if args.variant != "reference" and not args.write_reference:
        parser.error("negative variants require explicit reference output")
    try:
        report, exit_code = run(args), 0
    except Exception as error:
        report, exit_code = dict(status="ERROR", error=type(error).__name__, message=str(error)), 2
    with Path(args.report).open("x", encoding="utf-8") as output:
        json.dump(report, output, ensure_ascii=False, allow_nan=False, indent=2)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
