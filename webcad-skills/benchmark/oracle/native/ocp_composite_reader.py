"""M01/M04 evaluator extension. Leaves the frozen B01-B03 reader source unchanged."""
import argparse
import json
from pathlib import Path
import ocp_reader as base
from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse
from OCP.GeomAbs import GeomAbs_Plane


def reference(case_id, variant="reference"):
    variants = {"M01": {"reference", "wrong-shoulder", "wrong-hole"},
                "M04": {"reference", "wrong-depth", "wrong-hole"}}
    if variant not in variants.get(case_id, set()):
        raise ValueError("COMPOSITE_REFERENCE_VARIANT_NOT_IMPLEMENTED")
    if case_id == "M01":
        shoulder = 5 if variant == "wrong-shoulder" else 4
        lower = base.BRepPrimAPI_MakeCylinder(8, shoulder).Shape()
        upper = base.BRepPrimAPI_MakeCylinder(base.gp_Ax2(base.gp_Pnt(0, 0, shoulder), base.gp_Dir(0, 0, 1)), 5, 20-shoulder).Shape()
        joined = BRepAlgoAPI_Fuse(lower, upper)
        joined.Build()
        if not joined.IsDone():
            raise ValueError("REFERENCE_UNION_FAILED")
        return base.cut(joined.Shape(), base.BRepPrimAPI_MakeCylinder(3.5 if variant == "wrong-hole" else 3, 20).Shape())
    stock = base.BRepPrimAPI_MakeBox(base.gp_Pnt(-20, -15, 0), 40, 30, 10).Shape()
    stock = base.cut(stock, base.BRepPrimAPI_MakeCylinder(2.5 if variant == "wrong-hole" else 2, 10).Shape())
    depth = 4 if variant == "wrong-depth" else 3
    counterbore = base.BRepPrimAPI_MakeCylinder(base.gp_Ax2(base.gp_Pnt(0, 0, 10-depth), base.gp_Dir(0, 0, 1)), 5, depth).Shape()
    return base.cut(stock, counterbore)


def horizontal_planes(shape):
    planes = []
    explorer = base.TopExp_Explorer(shape, base.TopAbs_FACE)
    while explorer.More():
        face = base.TopoDS.Face_s(explorer.Current())
        surface = base.BRepAdaptor_Surface(face, True)
        if surface.GetType() == GeomAbs_Plane and abs(surface.Plane().Axis().Direction().Z()) > 1-1e-8:
            planes.append(base.bounds(face))
        explorer.Next()
    return planes


def cylindrical_zone(cylinders, radius, bottom, top):
    # STEP may split one analytic cylindrical wall into several faces.
    # Require axial coverage, not a particular face count or individual face span.
    intervals = sorted((c["bounds"]["minZ"], c["bounds"]["maxZ"]) for c in cylinders
                       if c["vertical"] and base.near(c["x"], 0) and base.near(c["y"], 0)
                       and base.near(c["radius"], radius))
    if not intervals or not base.near(intervals[0][0], bottom):
        return False
    reached = bottom
    for start, end in intervals:
        if start > reached + base.LENGTH_TOLERANCE or start < bottom-base.LENGTH_TOLERANCE or end > top+base.LENGTH_TOLERANCE:
            return False
        reached = max(reached, end)
    return base.near(reached, top)


def inspect(shape, case_id):
    if shape.IsNull():
        raise ValueError("EMPTY_STEP_SHAPE")
    solids, shells = base.TopTools_IndexedMapOfShape(), base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, base.TopAbs_SOLID, solids)
    base.TopExp.MapShapes_s(shape, base.TopAbs_SHELL, shells)
    valid = base.BRepCheck_Analyzer(shape, True).IsValid()
    geometry = dict(reader=dict(independent=True, source="standalone OCP composite STEP reader and separate reference",
                                engine="OpenCASCADE via OCP", version=base.OCP.__version__, bindingVersion=base.OCP.__version__,
                                sharedKernelFamily=True, algorithmIndependence=False),
                    brepValid=valid, targetType="solid" if solids.Extent() else "surface", units="mm",
                    solidCount=solids.Extent(), shellCount=shells.Extent(), volume=base.volume(shape), bounds=base.bounds(shape), checks={})
    if not valid or solids.Extent() != 1:
        return geometry
    solid, expected = solids.FindKey(1), reference(case_id)
    missing, extra = base.volume(base.cut(expected, solid)), base.volume(base.cut(solid, expected))
    equivalent = missing <= base.DIFFERENCE_VOLUME_TOLERANCE and extra <= base.DIFFERENCE_VOLUME_TOLERANCE
    difference = dict(missingMaterialMm3=missing, extraMaterialMm3=extra,
                      toleranceMm3=base.DIFFERENCE_VOLUME_TOLERANCE, withinTolerance=equivalent)
    geometry["referenceDifference"] = difference
    cylinders = base.cylinder_faces(solid)
    geometry["cylinders"] = cylinders
    checks = geometry["checks"]

    if case_id == "M01":
        planes = horizontal_planes(solid)
        shoulder = cylindrical_zone(cylinders, 8, 0, 4) and cylindrical_zone(cylinders, 5, 4, 20) and any(base.near(p["minZ"], 4) and base.near(p["maxZ"], 4) for p in planes)
        checks["shoulders"] = base.check(shoulder and equivalent, dict(cylinders=cylinders, planes=planes, referenceDifference=difference))
        bore = base.material_samples(solid, [[0, 0, z] for z in (.1, 3.9, 4.1, 19.9)], base.TopAbs_OUT)
        checks["bore"] = base.check(cylindrical_zone(cylinders, 3, 0, 20) and bore["pass"] and equivalent, dict(cylinders=cylinders, samples=bore, referenceDifference=difference))
        material = base.material_samples(solid, [[4, 0, z] for z in (.1, 3.9, 4.1, 19.9)], base.TopAbs_IN)
        checks["connected"] = base.check(material["pass"] and equivalent, dict(solidCount=solids.Extent(), samples=material, referenceDifference=difference))
    else:
        correct_diameters = bool(cylinders) and all(c["vertical"] and base.near(c["x"], 0) and base.near(c["y"], 0) and
                                                    (base.near(c["radius"], 2) or base.near(c["radius"], 5)) for c in cylinders)
        checks["diameters"] = base.check(correct_diameters and cylindrical_zone(cylinders, 2, 0, 7) and cylindrical_zone(cylinders, 5, 7, 10), dict(cylinders=cylinders))
        counterbore = [c for c in cylinders if c["vertical"] and base.near(c["radius"], 5)]
        geometry["counterboreBottomZ"] = min((c["bounds"]["minZ"] for c in counterbore), default=None)
        geometry["counterboreDepth"] = (max(c["bounds"]["maxZ"] for c in counterbore)-geometry["counterboreBottomZ"]) if counterbore else None
        kept = base.material_samples(solid, [[-19, -14, 5], [19, 14, 5], [4, 0, 6]], base.TopAbs_IN)
        voids = base.material_samples(solid, [[0, 0, .1], [0, 0, 6.9], [0, 0, 9.9], [4, 0, 8]], base.TopAbs_OUT)
        checks["retainedMaterial"] = base.check(kept["pass"] and voids["pass"] and equivalent, dict(materialSamples=kept, voidSamples=voids, referenceDifference=difference))
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=["M01", "M04"], required=True)
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
            shape = reference(args.case, args.variant)
            if not base.BRepCheck_Analyzer(shape, True).IsValid():
                raise ValueError("INVALID_REFERENCE_BREP")
            writer = base.STEPControl_Writer()
            if writer.Transfer(shape, base.STEPControl_AsIs) != base.IFSelect_RetDone or writer.Write(args.write_reference) != base.IFSelect_RetDone:
                raise ValueError("REFERENCE_STEP_WRITE_FAILED")
            report = dict(recordType="REFERENCE_OR_NEGATIVE_FIXTURE", caseId=args.case, variant=args.variant, geometry=inspect(shape, args.case))
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
            report = dict(recordType="INDEPENDENT_STEP_GEOMETRY_OBSERVATION", caseId=args.case,
                          sourceLengthUnits=[lengths.Value(i).ToCString() for i in range(1, lengths.Length()+1)],
                          normalizedLengthUnit="mm", geometry=inspect(reader.OneShape(), args.case))
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
