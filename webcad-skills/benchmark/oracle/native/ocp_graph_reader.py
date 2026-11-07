"""S07/S08 STEP graph checks; finite samples, not a continuous extrema proof."""
import argparse
import json
import math
from pathlib import Path
import ocp_reader as base
import graph_surface_math as oracle
from ocp_s06_reader import native_distance, free_boundaries
from OCP.TColgp import TColgp_Array2OfPnt
from OCP.TColStd import TColStd_Array1OfReal, TColStd_Array1OfInteger
from OCP.Geom import Geom_BSplineSurface
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Common
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepTools import BRepTools
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.gp import gp_Pnt2d, gp_Vec


def reference(case_id, variant='reference'):
    if variant not in {'reference', 'wrong-interior', 'wrong-boundary', 'wrong-hole', 'wrong-trim-side'}:
        raise ValueError('GRAPH_VARIANT_UNSUPPORTED')
    if case_id == 'S07':
        rows = [[[x, y, (a-b)+(1.5 if variant == 'wrong-interior' else 0)]
                 for y, b in zip([-10, 0, 10], [1, -1, 1])]
                for x, a in zip([-10, 0, 10], [1, -1, 1])]
        degree, segments = 2, 1
    else:
        segments, degree = 16, 3
        linear, sine = [], []
        for i in range(segments):
            a, b = i/segments, (i+1)/segments
            linear.extend([a, a+(b-a)/3, b-(b-a)/3, b] if i == 0 else [a+(b-a)/3, b-(b-a)/3, b])
            values = [math.sin(math.pi*a), math.sin(math.pi*a)+(b-a)*math.pi*math.cos(math.pi*a)/3,
                      math.sin(math.pi*b)-(b-a)*math.pi*math.cos(math.pi*b)/3, math.sin(math.pi*b)]
            sine.extend(values if i == 0 else values[1:])
        rows = [[[(21 if variant == 'wrong-boundary' else 20)*u, 20*v,
                  3*v*su+2*sv+(1.5*su*sv if variant == 'wrong-interior' else 0)]
                 for v, sv in zip(linear, sine)] for u, su in zip(linear, sine)]
    poles = TColgp_Array2OfPnt(1, len(rows), 1, len(rows[0]))
    for i, row in enumerate(rows, 1):
        for j, p in enumerate(row, 1):
            poles.SetValue(i, j, base.gp_Pnt(*p))
    knots, mults = TColStd_Array1OfReal(1, segments+1), TColStd_Array1OfInteger(1, segments+1)
    for i in range(segments+1):
        knots.SetValue(i+1, i/segments)
        mults.SetValue(i+1, degree+1 if i in (0, segments) else degree)
    face = BRepBuilderAPI_MakeFace(Geom_BSplineSurface(poles, knots, knots, mults, mults, degree, degree, False, False), 1e-7).Face()
    if case_id == 'S08':
        return face
    cutter = BRepPrimAPI_MakeCylinder(base.gp_Ax2(base.gp_Pnt(0, 0, -5), base.gp_Dir(0, 0, 1)), 2.5 if variant == 'wrong-hole' else 3, 10).Shape()
    op = BRepAlgoAPI_Common(face, cutter) if variant == 'wrong-trim-side' else BRepAlgoAPI_Cut(face, cutter)
    op.Build()
    if not op.IsDone():
        raise ValueError('REFERENCE_TRIM_FAILED')
    return op.Shape()


def inspect(case_id, shape):
    faces, solids = base.TopTools_IndexedMapOfShape(), base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, base.TopAbs_FACE, faces)
    base.TopExp.MapShapes_s(shape, base.TopAbs_SOLID, solids)
    geometry = dict(reader=dict(independent=True, source='OCP graph STEP sampler', version=base.OCP.__version__,
                                sharedKernelFamily=True, algorithmIndependence=False),
                    brepValid=base.BRepCheck_Analyzer(shape, True).IsValid(), targetType='solid' if solids.Extent() else 'surface' if faces.Extent() else 'wire',
                    units='mm', solidCount=solids.Extent(), faceCount=faces.Extent(), volume=None, surfaceSamples=[], checks={})
    if not geometry['brepValid'] or solids.Extent() or not faces.Extent() or faces.Extent() > 64:
        return geometry
    expected = reference(case_id)
    expected_faces = base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(expected, base.TopAbs_FACE, expected_faces)
    boundary, edges = free_boundaries(shape, faces)
    expected_boundary, _ = free_boundaries(expected, expected_faces)
    samples, reverse, jacobians, coverage = geometry['surfaceSamples'], [], [], []
    for u, v in [(i/8, j/8) for i in range(9) for j in range(9)]+list(oracle.OFF_GRID):
        point = oracle.target(case_id, u, v)
        if point is not None:
            measured = native_distance(point, shape)
            samples.append(dict(u=u, v=v, point=measured['point'], direction='target-to-STEP'))
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
                p, du, dv = base.gp_Pnt(), gp_Vec(), gp_Vec()
                surface.D1(u, v, p, du, dv)
                point = [p.X(), p.Y(), p.Z()]
                reverse.append(dict(actualPoint=point, **native_distance(point, expected)))
                jacobians.append(du.X()*dv.Y()-du.Y()*dv.X())
                count += 1
        coverage.append(count)
    forward_boundary = [native_distance(point, boundary) for point in oracle.boundary_samples(case_id)]
    reverse_boundary, inner_points = [], []
    for edge in edges:
        curve = BRepAdaptor_Curve(edge)
        for i in range(33):
            p = curve.Value(curve.FirstParameter()+(curve.LastParameter()-curve.FirstParameter())*i/32)
            point = [p.X(), p.Y(), p.Z()]
            reverse_boundary.append(dict(actualPoint=point, **native_distance(point, expected_boundary)))
            if math.hypot(p.X(), p.Y()) < 5:
                inner_points.append(point)
    def passes(rows):
        return bool(rows) and all(row['available'] and row['distanceMm'] <= .05 for row in rows)
    common = dict(forward=forward_boundary, reverse=reverse_boundary, actualSurfaceToReference=reverse,
                  faceSampleCounts=coverage, toleranceMm=.05, continuousMaximumErrorCertified=False)
    boundary_pass = passes(forward_boundary) and passes(reverse_boundary) and passes(reverse) and all(coverage)
    if case_id == 'S07':
        radial_errors = [abs(math.hypot(p[0], p[1])-3) for p in inner_points]
        angular_bins = {int((math.atan2(p[1], p[0])+math.pi)/(2*math.pi)*16) % 16 for p in inner_points}
        geometry['checks']['holeBoundary'] = dict(checkerId='ocp-graph-hole-1', **{'pass': boundary_pass and bool(radial_errors) and max(radial_errors) <= .05 and len(angular_bins) == 16},
            evidence=dict(**common, innerPoints=inner_points, maxRadiusError=max(radial_errors) if radial_errors else None, angularBins=sorted(angular_bins)))
        center = native_distance([0, 0, 0], shape)
        geometry['checks']['trimSide'] = dict(checkerId='ocp-graph-trim-side-1', **{'pass': center['available'] and center['distanceMm'] > 2.9 and passes(reverse)}, evidence=dict(centerDistance=center, reverse=reverse))
    else:
        geometry['checks']['boundaries'] = dict(checkerId='ocp-graph-boundary-1', **{'pass': boundary_pass}, evidence=common)
        signs = [1 if j > 1e-9 else -1 if j < -1e-9 else 0 for j in jacobians]
        geometry['checks']['folds'] = dict(checkerId='ocp-graph-xy-jacobian-1', **{'pass': bool(signs) and len(set(signs)) == 1 and 0 not in signs and faces.Extent() == 1 and passes(reverse)},
            evidence=dict(xyJacobians=jacobians, faceCount=faces.Extent(), sampledOnly=True))
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=['S07', 'S08'], required=True)
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
        report = dict(caseId=args.case, variant=args.variant, sourceLengthUnits=units, normalizedLengthUnit='mm', geometry=inspect(args.case, shape))
        exit_code = 0
    except Exception as error:
        report, exit_code = dict(status='ERROR', error=type(error).__name__, message=str(error)), 2
    with Path(args.report).open('x', encoding='utf-8') as output:
        json.dump(report, output, allow_nan=False, indent=2)
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
