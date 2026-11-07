"""S09/S10 exact Bezier reference patches and independent STEP observations."""
import argparse
import json
import math
from pathlib import Path
import ocp_reader as base
from ocp_s06_reader import native_distance, free_boundaries
from OCP.Geom import Geom_BezierSurface
from OCP.TColgp import TColgp_Array2OfPnt
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace, BRepBuilderAPI_Sewing, BRepBuilderAPI_MakeSolid
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.BRepTools import BRepTools
from OCP.GeomAPI import GeomAPI_ProjectPointOnSurf
from OCP.BRep import BRep_Tool
from OCP.gp import gp_Pnt2d, gp_Vec
from OCP.TopAbs import TopAbs_EDGE


def patch(rows):
    poles = TColgp_Array2OfPnt(1, len(rows), 1, len(rows[0]))
    for i, row in enumerate(rows, 1):
        for j, p in enumerate(row, 1):
            poles.SetValue(i, j, base.gp_Pnt(*p))
    return BRepBuilderAPI_MakeFace(Geom_BezierSurface(poles), 1e-7).Face()


def reference(case_id, variant='reference'):
    if variant not in {'reference', 'wrong-interior', 'wrong-support', 'open-seam', 'missing-face'}:
        raise ValueError('SEWN_REFERENCE_VARIANT_UNSUPPORTED')
    if case_id == 'S09':
        z = [0, 8/3, 16/3, 8] if variant == 'wrong-interior' else [0, 0, 8, 8]
        rows = [[[x, y, h] for y in [-6, 6]] for x, h in zip([0, 10/3, 20/3, 10], z)]
        faces = [patch([[[x, y, 0] for y in [-6, 6]] for x in [-9 if variant == 'wrong-support' else -10, 0]]),
                 patch(rows), patch([[[x, y, 8] for y in [-6, 6]] for x in [10.5 if variant == 'open-seam' else 10, 20]])]
    else:
        xs, ys, xx, yy = [-10, 0, 10], [-8, 0, 8], [100, -100, 100], [64, -64, 64]
        top = [[[x, y, 5+(a+b)/200+(1 if variant == 'wrong-interior' else 0)] for y, b in zip(ys, yy)] for x, a in zip(xs, xx)]
        bottom = [[[x, y, 0] for y in ys] for x in xs]
        faces = [patch(top), patch(bottom)]
        for i in [0, 2]:
            faces.append(patch([[bottom[i][j], top[i][j]] for j in range(3)]))
        for j in [0, 2]:
            faces.append(patch([[bottom[i][j], top[i][j]] for i in range(3)]))
        if variant == 'missing-face':
            faces.pop()
    sewer = BRepBuilderAPI_Sewing(1e-6)
    for face in faces:
        sewer.Add(face)
    sewer.Perform()
    shape = sewer.SewedShape()
    if case_id == 'S10' and variant != 'missing-face':
        shell = base.TopoDS.Shell_s(shape)
        maker = BRepBuilderAPI_MakeSolid(shell)
        solid = maker.Solid()
        from OCP.BRepLib import BRepLib
        BRepLib.OrientClosedSolid_s(solid)
        return solid
    return shape


def target(case_id, u, v):
    if case_id == 'S09':
        return [10*u, 12*v-6, 8*(3*u*u-2*u*u*u)]
    x, y = 20*u-10, 16*v-8
    return [x, y, 5+(x*x+y*y)/200]


def normal_at(face, point):
    surface = BRep_Tool.Surface_s(face)
    projection = GeomAPI_ProjectPointOnSurf(base.gp_Pnt(*point), surface)
    if projection.NbPoints() < 1 or projection.LowerDistance() > .05:
        return None
    u, v = projection.LowerDistanceParameters()
    if BRepClass_FaceClassifier(face, gp_Pnt2d(u, v), 1e-6).State() not in (base.TopAbs_IN, base.TopAbs_ON):
        return None
    p, du, dv = base.gp_Pnt(), gp_Vec(), gp_Vec()
    surface.D1(u, v, p, du, dv)
    normal = du.Crossed(dv)
    if normal.Magnitude() < 1e-12:
        return None
    normal.Normalize()
    return [normal.X(), normal.Y(), normal.Z()]


def inspect(case_id, shape):
    faces, solids = base.TopTools_IndexedMapOfShape(), base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, base.TopAbs_FACE, faces)
    base.TopExp.MapShapes_s(shape, base.TopAbs_SOLID, solids)
    geometry = dict(reader=dict(independent=True, source='OCP sewn-patch STEP sampler', version=base.OCP.__version__, sharedKernelFamily=True, algorithmIndependence=False),
                    brepValid=base.BRepCheck_Analyzer(shape, True).IsValid(), targetType='solid' if solids.Extent() else 'surface' if faces.Extent() else 'wire',
                    units='mm', solidCount=solids.Extent(), faceCount=faces.Extent(), volume=None, surfaceSamples=[], checks={})
    if not geometry['brepValid'] or not faces.Extent() or faces.Extent() > 64:
        return geometry
    if solids.Extent():
        props = base.GProp_GProps()
        base.BRepGProp.VolumeProperties_s(shape, props)
        geometry['volume'] = props.Mass()
    for u, v in [(i/8, j/8) for i in range(9) for j in range(9)]+[(.113, .219), (.337, .581), (.719, .873), (.887, .443)]:
        measured = native_distance(target(case_id, u, v), shape)
        geometry['surfaceSamples'].append(dict(u=u, v=v, point=measured['point']))
    expected = reference(case_id)
    reverse, coverage = [], []
    for i in range(1, faces.Extent()+1):
        face = base.TopoDS.Face_s(faces.FindKey(i))
        surface = base.BRepAdaptor_Surface(face, True)
        u0, u1, v0, v1 = BRepTools.UVBounds_s(face)
        count = 0
        for a in range(9):
            for b in range(9):
                u, v = u0+(u1-u0)*a/8, v0+(v1-v0)*b/8
                if BRepClass_FaceClassifier(face, gp_Pnt2d(u, v), 1e-7).State() not in (base.TopAbs_IN, base.TopAbs_ON):
                    continue
                p = surface.Value(u, v)
                point = [p.X(), p.Y(), p.Z()]
                reverse.append(dict(actualPoint=point, **native_distance(point, expected)))
                count += 1
        coverage.append(count)
    _, edges = free_boundaries(shape, faces)
    reverse_ok = bool(reverse) and all(coverage) and all(m['available'] and m['distanceMm'] <= .05 for m in reverse)
    if case_id == 'S10':
        geometry['checks']['closedBoundaries'] = dict(checkerId='ocp-sewn-closed-1', **{'pass': not edges and solids.Extent() == 1 and reverse_ok},
            evidence=dict(freeEdgeCount=len(edges), solidCount=solids.Extent(), reverse=reverse, faceSampleCounts=coverage, toleranceMm=.05, continuousMaximumErrorCertified=False))
        return geometry
    seam_rows = []
    for x, z in [(0, 0), (10, 8)]:
        for j in range(1, 16):
            point = [x, 12*j/16-6, z]
            normals = [n for i in range(1, faces.Extent()+1) if (n := normal_at(base.TopoDS.Face_s(faces.FindKey(i)), point)) is not None]
            seam_rows.append(dict(point=point, normals=normals, closest=native_distance(point, shape)))
    seam_g0 = all(len(row['normals']) == 2 and row['closest']['available'] and row['closest']['distanceMm'] <= .05 for row in seam_rows)
    seam_g1 = seam_g0 and all(abs(n[2]) >= math.cos(math.radians(.1)) for row in seam_rows for n in row['normals'])
    supports = [native_distance([x, y, z], shape) for z, xs in [(0, [-10, -7.5, -5, -2.5]), (8, [12.5, 15, 17.5, 20])] for x in xs for y in [-6, -3, 0, 3, 6]]
    for name, verdict, evidence in [('seamG0', seam_g0, dict(seams=seam_rows, distanceToleranceMm=.05)), ('seamG1', seam_g1, dict(seams=seam_rows, angleToleranceDeg=.1)),
                                  ('supports', reverse_ok and all(m['available'] and m['distanceMm'] <= .05 for m in supports), dict(supportSamples=supports, reverse=reverse, faceSampleCounts=coverage, continuousMaximumErrorCertified=False))]:
        geometry['checks'][name] = dict(checkerId='ocp-sewn-'+name+'-1', **{'pass': verdict}, evidence=evidence)
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=['S09', 'S10'], required=True)
    parser.add_argument('--variant', default='reference')
    parser.add_argument('--write-reference')
    parser.add_argument('--input')
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    try:
        units = ['mm']
        if args.write_reference:
            if Path(args.write_reference).exists():
                raise ValueError('REFERENCE_OUTPUT_ALREADY_EXISTS')
            shape = reference(args.case, args.variant)
            writer = base.STEPControl_Writer()
            if writer.Transfer(shape, base.STEPControl_AsIs) != base.IFSelect_RetDone or writer.Write(args.write_reference) != base.IFSelect_RetDone:
                raise ValueError('REFERENCE_STEP_WRITE_FAILED')
        elif args.input:
            path = Path(args.input)
            if not path.is_file() or not 0 < path.stat().st_size <= 128*1024*1024:
                raise ValueError('STEP_INPUT_MISSING_OR_OVERSIZED')
            reader = base.STEPControl_Reader()
            if reader.ReadFile(str(path)) != base.IFSelect_RetDone:
                raise ValueError('STEP_PARSE_FAILED')
            lengths, angles, solid_angles = (base.TColStd_SequenceOfAsciiString() for _ in range(3))
            reader.FileUnits(lengths, angles, solid_angles)
            units = [lengths.Value(i).ToCString() for i in range(1, lengths.Length()+1)]
            reader.SetSystemLengthUnit(1.0)
            if reader.TransferRoots() < 1:
                raise ValueError('STEP_TRANSFER_FAILED')
            shape = reader.OneShape()
        else:
            raise ValueError('STEP_INPUT_OR_REFERENCE_OUTPUT_REQUIRED')
        report, exit_code = dict(caseId=args.case, variant=args.variant, sourceLengthUnits=units, normalizedLengthUnit='mm', geometry=inspect(args.case, shape)), 0
    except Exception as error:
        report, exit_code = dict(status='ERROR', error=type(error).__name__, message=str(error)), 2
    with Path(args.report).open('x', encoding='utf-8') as output:
        json.dump(report, output, allow_nan=False, indent=2)
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
