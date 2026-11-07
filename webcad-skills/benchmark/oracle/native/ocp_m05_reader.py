"""M05 final STEP geometry and separate first-hole checkpoint reader.

Final six opposite hole pairs cannot prove a one-sided cutting process. cutScope
stays unknown in final mode. First-hole mode independently checks only that
intermediate shape; the host must also bind exact tool requests and revision chain.
"""
import argparse
import json
import math
from pathlib import Path
import ocp_reader as base
import m05_math as oracle


def cylinder_faces(shape):
    # The frozen base helper intentionally reports only XY axis origins. M05
    # requires actual Z to verify hole height; extend locally without editing it.
    result = []
    explorer = base.TopExp_Explorer(shape, base.TopAbs_FACE)
    while explorer.More():
        face = base.TopoDS.Face_s(explorer.Current())
        surface = base.BRepAdaptor_Surface(face, True)
        if surface.GetType() == base.GeomAbs_Cylinder:
            cylinder = surface.Cylinder()
            point, axis = cylinder.Axis().Location(), cylinder.Axis().Direction()
            result.append(dict(x=point.X(), y=point.Y(), z=point.Z(), radius=cylinder.Radius(),
                               axis=[axis.X(), axis.Y(), axis.Z()], vertical=abs(axis.Z()) > 1-1e-8, bounds=base.bounds(face)))
        explorer.Next()
    return result


def reference(variant='reference'):
    if variant not in {'reference', 'missing-hole', 'wrong-hole', 'wrong-axis', 'extra-hole', 'first-hole', 'through-first', 'ambiguous-final'}:
        raise ValueError('M05_REFERENCE_VARIANT_NOT_IMPLEMENTED')
    shape = base.cut(base.BRepPrimAPI_MakeCylinder(12, 20).Shape(), base.BRepPrimAPI_MakeCylinder(10, 20).Shape())
    count = 1 if variant in {'first-hole', 'through-first'} else 5 if variant == 'missing-hole' else 6
    indices = list(range(count))+([.5] if variant == 'extra-hole' else [])
    for index in indices:
        axis = oracle.direction(index)
        through = variant in {'through-first', 'ambiguous-final'}
        start, length = (-13, 26) if through else (9, 4)
        origin = [start*axis[0], start*axis[1], 10]
        if variant == 'wrong-axis' and index == 0:
            origin[1] += 1.5
        radius = 1.2 if variant == 'wrong-hole' else 1
        tool = base.BRepPrimAPI_MakeCylinder(base.gp_Ax2(base.gp_Pnt(*origin), base.gp_Dir(*axis)), radius, length).Shape()
        shape = base.cut(shape, tool)
    return shape


def inspect(shape, mode='final'):
    if shape.IsNull():
        raise ValueError('EMPTY_STEP_SHAPE')
    solids, shells = base.TopTools_IndexedMapOfShape(), base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, base.TopAbs_SOLID, solids); base.TopExp.MapShapes_s(shape, base.TopAbs_SHELL, shells)
    valid = base.BRepCheck_Analyzer(shape, True).IsValid()
    geometry = dict(reader=dict(independent=True, source='OCP M05 STEP radial cylinder axes and material differences', version=base.OCP.__version__,
                                sharedKernelFamily=True, algorithmIndependence=False), brepValid=valid, targetType='solid' if solids.Extent() else 'surface',
                    units='mm', solidCount=solids.Extent(), shellCount=shells.Extent(), volume=base.volume(shape), bounds=base.bounds(shape), checks={})
    if not valid or solids.Extent() != 1:
        return geometry
    solid = base.TopoDS.Solid_s(solids.FindKey(1))
    expected = reference('first-hole' if mode == 'first-hole' else 'reference')
    missing, extra = base.volume(base.cut(expected, solid)), base.volume(base.cut(solid, expected))
    equivalent = missing <= base.DIFFERENCE_VOLUME_TOLERANCE and extra <= base.DIFFERENCE_VOLUME_TOLERANCE
    difference = dict(missingMaterialMm3=missing, extraMaterialMm3=extra, toleranceMm3=base.DIFFERENCE_VOLUME_TOLERANCE, withinTolerance=equivalent)
    geometry['referenceDifference'] = difference
    def check(verdict, evidence):
        return dict(checkerId='ocp-m05-radial-holes-1', **{'pass': verdict}, evidence=evidence)
    if mode == 'first-hole':
        void = base.material_samples(solid, [[r, 0, 10] for r in [10.1, 11, 11.9]], base.TopAbs_OUT)
        kept = base.material_samples(solid, [[-r, 0, 10] for r in [10.1, 11, 11.9]], base.TopAbs_IN)
        geometry['checks']['cutScope'] = check(equivalent and void['pass'] and kept['pass'],
            dict(scope='first intermediate STEP only; one own-side hole and opposite wall retained', referenceDifference=difference, ownSideVoid=void, oppositeKept=kept,
                 limitation='tool extent in empty space cannot be inferred from the STEP; host must separately bind exact 9..13 operation requests'))
        return geometry
    cylinders = cylinder_faces(solid)
    holes = [c for c in cylinders if not (c['vertical'] and (base.near(c['radius'], 10) or base.near(c['radius'], 12)))]
    classified = [oracle.classify_hole(c) for c in holes]
    sectors = sorted(set(item['index'] for item in classified if item is not None))
    # Several faces may be fragments of one trimmed cylindrical hole wall.
    # Distinct outward radial axis sectors, not raw face count, define the six holes.
    all_match = bool(classified) and all(item is not None and item['matches'] for item in classified)
    hole_count = len(oracle.distinct_holes(classified))
    geometry['cylinders'] = cylinders
    geometry['checks']['holeCount'] = check(hole_count == 6 and all_match, dict(measuredHoleCount=hole_count, radialSectors=sectors, measuredCylinders=holes, axisMeasurements=classified, definition='distinct outward radial axis sectors; split faces grouped'))
    geometry['checks']['radialAxes'] = check(all_match and sectors == list(range(6)), dict(axisMeasurements=classified, radiusMm=1, centerHeightMm=10, angleStepDeg=60, toleranceMm=base.LENGTH_TOLERANCE))
    voids, kept = [], []
    for index in range(6):
        axis = oracle.direction(index)
        voids.extend([[r*axis[0], r*axis[1], 10] for r in [10.1, 11, 11.9]])
        middle = oracle.direction(index+.5)
        kept.extend([[11*middle[0], 11*middle[1], 10], [11*axis[0], 11*axis[1], 8], [11*axis[0], 11*axis[1], 12]])
    material = base.material_samples(solid, kept, base.TopAbs_IN)
    bores = base.material_samples(solid, voids, base.TopAbs_OUT)
    limits = geometry['bounds']
    envelope = all(base.near(limits[key], value) for key, value in dict(minX=-12, maxX=12, minY=-12, maxY=12, minZ=0, maxZ=20).items())
    geometry['checks']['retainedMaterial'] = check(equivalent and material['pass'] and bores['pass'] and envelope,
        dict(referenceDifference=difference, kept=material, bores=bores, bounds=limits, envelopeMatches=envelope))
    geometry['checks']['cutScope'] = check(None, dict(scope='final STEP has no modeling history', reason='opposite through-cuts may produce the same final six-hole geometry; original intermediate STEP and operation receipts required'))
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=['M05'], required=True)
    parser.add_argument('--input'); parser.add_argument('--write-reference')
    parser.add_argument('--variant', default='reference'); parser.add_argument('--report', required=True)
    parser.add_argument('--mode', choices=['final', 'first-hole'], default='final')
    args = parser.parse_args()
    if args.variant != 'reference' and not args.write_reference:
        parser.error('negative variants require explicit output')
    try:
        report = None
        if args.write_reference:
            if Path(args.write_reference).exists():
                raise ValueError('REFERENCE_OUTPUT_ALREADY_EXISTS')
            shape = reference(args.variant)
            if not base.BRepCheck_Analyzer(shape, True).IsValid():
                raise ValueError('INVALID_REFERENCE_BREP')
            writer = base.STEPControl_Writer()
            if writer.Transfer(shape, base.STEPControl_AsIs) != base.IFSelect_RetDone or writer.Write(args.write_reference) != base.IFSelect_RetDone:
                raise ValueError('REFERENCE_STEP_WRITE_FAILED')
            mode = 'first-hole' if args.variant in {'first-hole', 'through-first'} else 'final'
            report = dict(recordType='REFERENCE_OR_NEGATIVE_FIXTURE', caseId='M05', variant=args.variant, geometry=inspect(shape, mode))
        if args.input:
            path = Path(args.input)
            if not path.is_file() or not 0 < path.stat().st_size <= 128*1024*1024:
                raise ValueError('STEP_INPUT_MISSING_OR_OVERSIZED')
            reader = base.STEPControl_Reader()
            if reader.ReadFile(str(path)) != base.IFSelect_RetDone:
                raise ValueError('STEP_PARSE_FAILED')
            lengths, angles, solid_angles = (base.TColStd_SequenceOfAsciiString() for _ in range(3))
            reader.FileUnits(lengths, angles, solid_angles); reader.SetSystemLengthUnit(1.0)
            if reader.TransferRoots() < 1:
                raise ValueError('STEP_TRANSFER_FAILED')
            report = dict(recordType='INDEPENDENT_STEP_GEOMETRY_OBSERVATION', caseId='M05', normalizedLengthUnit='mm',
                          sourceLengthUnits=[lengths.Value(i).ToCString() for i in range(1, lengths.Length()+1)], geometry=inspect(reader.OneShape(), args.mode))
        if report is None:
            raise ValueError('STEP_INPUT_OR_REFERENCE_OUTPUT_REQUIRED')
        exit_code = 0
    except Exception as error:
        report, exit_code = dict(status='ERROR', error=type(error).__name__, message=str(error)), 2
    with Path(args.report).open('x', encoding='utf-8') as output:
        json.dump(report, output, ensure_ascii=False, allow_nan=False, indent=2)
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
