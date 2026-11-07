"""Independent S04 Bezier-tube STEP observations, without product calls."""
import argparse
import json
import math
from pathlib import Path
import ocp_reader as base
import s04_math as oracle
from m02_math import fit_circle
from OCP.Geom import Geom_BezierCurve
from OCP.TColgp import TColgp_Array1OfPnt
from OCP.BRepOffsetAPI import BRepOffsetAPI_MakePipe
from OCP.BRepAlgoAPI import BRepAlgoAPI_Section, BRepAlgoAPI_Check
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
from OCP.BRepExtrema import BRepExtrema_DistShapeShape
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepTools import BRepTools
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopTools import TopTools_ListOfShape
from OCP.GeomAbs import GeomAbs_Plane
from OCP.gp import gp_Circ, gp_Pln, gp_Pnt2d


def reference(variant='reference'):
    controls = [list(p) for p in oracle.CONTROLS]
    if variant == 'wrong-path':
        controls[2][0] += 3
    elif variant == 'shifted-path':
        controls = [[x+1, y, z] for x, y, z in controls]
    elif variant not in ('reference', 'wrong-radius'):
        raise ValueError('S04_REFERENCE_VARIANT_NOT_IMPLEMENTED')
    poles = TColgp_Array1OfPnt(1, 4)
    for i, point in enumerate(controls, 1):
        poles.SetValue(i, base.gp_Pnt(*point))
    curve = Geom_BezierCurve(poles)
    path = base.BRepBuilderAPI_MakeWire(base.BRepBuilderAPI_MakeEdge(curve).Edge()).Wire()
    circle = gp_Circ(base.gp_Ax2(base.gp_Pnt(*controls[0]), base.gp_Dir(*oracle.derivative(0, controls))), 2.4 if variant == 'wrong-radius' else 2)
    face = base.BRepBuilderAPI_MakeFace(base.BRepBuilderAPI_MakeWire(base.BRepBuilderAPI_MakeEdge(circle).Edge()).Wire()).Face()
    pipe = BRepOffsetAPI_MakePipe(path, face);pipe.Build()
    if not pipe.IsDone():
        raise ValueError('S04_REFERENCE_PIPE_FAILED')
    return pipe.Shape()


def section(shape, frame):
    operation = BRepAlgoAPI_Section(shape, gp_Pln(base.gp_Pnt(*frame['center']), base.gp_Dir(*frame['normal'])), False)
    operation.Approximation(True);operation.Build()
    if not operation.IsDone():
        return dict(available=False, reason='SECTION_FAILED')
    groups = []
    explorer = base.TopExp_Explorer(operation.Shape(), TopAbs_EDGE)
    while explorer.More():
        edge = base.TopoDS.Edge_s(explorer.Current());explorer.Next()
        curve = BRepAdaptor_Curve(edge);a, b = curve.FirstParameter(), curve.LastParameter()
        points = []
        for i in range(48):
            point = curve.Value(a+(b-a)*i/48)
            delta = [p-c for p, c in zip((point.X(), point.Y(), point.Z()), frame['center'])]
            points.append([sum(x*y for x, y in zip(delta, axis)) for axis in (frame['u'], frame['v'], frame['normal'])])
        fitted = fit_circle(points)
        if fitted is None:
            continue
        group = next((g for g in groups if math.hypot(g['fit']['x']-fitted['x'], g['fit']['y']-fitted['y']) < .01 and abs(g['fit']['radius']-fitted['radius']) < .01), None)
        if group is None:
            group = dict(fit=fitted, points=[], edges=[]);groups.append(group)
        group['points'].extend(points);group['edges'].append(edge)
    if not groups:
        return dict(available=False, reason='SECTION_EMPTY')
    group = min(groups, key=lambda g: math.hypot(g['fit']['x'], g['fit']['y']))
    fitted = fit_circle(group['points']);edges = TopTools_ListOfShape()
    for edge in group['edges']:
        edges.Append(edge)
    wire = base.BRepBuilderAPI_MakeWire();wire.Add(edges)
    closed = wire.IsDone() and wire.Wire().Closed()
    measured = [frame['center'][i]+fitted['x']*frame['u'][i]+fitted['y']*frame['v'][i] for i in range(3)]
    return dict(available=True, t=frame['t'], center=measured, centerErrorMm=math.dist(measured, frame['center']), radius=fitted['radius'],
                circleResidualMm=fitted['maxCircleResidualMm'], planeResidualMm=fitted['maxPlaneResidualMm'], closed=bool(closed))


def shell(shape):
    explorer = base.TopExp_Explorer(shape, base.TopAbs_SHELL)
    if not explorer.More():
        raise ValueError('BOUNDARY_SHELL_MISSING')
    return explorer.Current()


def distance(point, boundary):
    operation = BRepExtrema_DistShapeShape(BRepBuilderAPI_MakeVertex(base.gp_Pnt(*point)).Vertex(), boundary)
    if not operation.IsDone():
        raise ValueError('INDEPENDENT_BOUNDARY_DISTANCE_UNAVAILABLE')
    return operation.Value()


def inspect(shape):
    solids = base.TopTools_IndexedMapOfShape();base.TopExp.MapShapes_s(shape, base.TopAbs_SOLID, solids)
    valid = base.BRepCheck_Analyzer(shape, True).IsValid()
    geometry = dict(reader=dict(independent=True, source='exact cubic Bezier reference, actual normal-plane sections, boundary distances and self-interference check', version=base.OCP.__version__, sharedKernelFamily=True, algorithmIndependence=False),
                    brepValid=valid, units='mm', targetType='solid' if solids.Extent() else 'surface', solidCount=solids.Extent(), volume=base.volume(shape), bounds=base.bounds(shape), checks={})
    if not valid or solids.Extent() != 1:
        return geometry
    solid = base.TopoDS.Solid_s(solids.FindKey(1));target_boundary = shell(reference());boundary = shell(solid)
    frames = [section(solid, oracle.frame(i/20)) for i in range(1, 20)]
    caps, actual_samples = [], []
    explorer = base.TopExp_Explorer(solid, base.TopAbs_FACE)
    while explorer.More():
        face = base.TopoDS.Face_s(explorer.Current());explorer.Next();surface = base.BRepAdaptor_Surface(face, True)
        if surface.GetType() == GeomAbs_Plane:
            properties = base.GProp_GProps();base.BRepGProp.SurfaceProperties_s(face, properties);point = properties.CentreOfMass();normal = surface.Plane().Axis().Direction()
            caps.append(dict(center=[point.X(), point.Y(), point.Z()], normal=[normal.X(), normal.Y(), normal.Z()], areaMm2=properties.Mass()))
        u0, u1, v0, v1 = BRepTools.UVBounds_s(face)
        for i in range(5):
            for j in range(9):
                u, v = u0+(u1-u0)*i/4, v0+(v1-v0)*j/8
                if BRepClass_FaceClassifier(face, gp_Pnt2d(u, v), 1e-7).State() not in (base.TopAbs_IN, base.TopAbs_ON):
                    continue
                point = surface.Value(u, v);actual_samples.append(distance((point.X(), point.Y(), point.Z()), target_boundary))
    expected_samples = [distance(oracle.surface(i/12, 2*math.pi*j/16), boundary) for i in range(13) for j in range(16)]
    cap_checks = []
    for t in (0, 1):
        center, normal = oracle.center(t), oracle.unit(oracle.derivative(t));cap = min(caps, key=lambda item: math.dist(item['center'], center)) if caps else None
        angle = math.degrees(math.acos(min(1, abs(sum(x*y for x, y in zip(cap['normal'], normal)))))) if cap else None
        cap_checks.append(dict(t=t, cap=cap, angleDeg=angle, matches=bool(cap and math.dist(cap['center'], center) <= .05 and angle <= 1 and abs(cap['areaMm2']-4*math.pi) <= 4*math.pi*1e-4)))
    expected_volume = 4*math.pi*oracle.arc_length();path_ok = bool(actual_samples and max(actual_samples) <= .05 and max(expected_samples) <= .05 and abs(geometry['volume']-expected_volume) <= expected_volume*1e-4)
    section_ok = all(f.get('available') and f['closed'] and f['centerErrorMm'] <= .05 and abs(f['radius']-2) <= .01 and f['circleResidualMm'] <= .05 and f['planeResidualMm'] <= .01 for f in frames)
    checked = BRepAlgoAPI_Check(solid, True, True).IsValid()
    check = lambda verdict, evidence: dict(checkerId='ocp-s04-bezier-tube-1', **{'pass': bool(verdict)}, evidence=evidence)
    geometry['checks']['path'] = check(path_ok, dict(maxActualToReferenceMm=max(actual_samples, default=None), maxReferenceToActualMm=max(expected_samples), expectedVolumeMm3=expected_volume, maxBoundaryDistanceMm=.05, volumeRelativeTolerance=1e-4, actualSampleCount=len(actual_samples), referenceSampleCount=len(expected_samples), continuousMaximumErrorCertified=False))
    geometry['checks']['sections'] = check(section_ok, dict(frames=frames, expectedRadiusMm=2, reference='normal planes of the exact Bezier derivative'))
    geometry['checks']['endNormals'] = check(len(caps) == 2 and all(c['matches'] for c in cap_checks), dict(planarCapCount=len(caps), caps=cap_checks, angleToleranceDeg=1))
    geometry['checks']['selfIntersection'] = check(checked and valid and path_ok, dict(occtSelfInterferenceChecked=True, selfInterferenceValid=checked, minimumSampledReferenceCurvatureRadiusMm=min(oracle.curvature_radius(i/4096) for i in range(4097)), monotonicallyIncreasingZ=True, sharedKernelFamily=True))
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__);parser.add_argument('--case', choices=['S04'], required=True);parser.add_argument('--input');parser.add_argument('--write-reference');parser.add_argument('--variant', default='reference');parser.add_argument('--report', required=True);args = parser.parse_args()
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
            report = dict(recordType='REFERENCE_OR_NEGATIVE_FIXTURE', caseId='S04', variant=args.variant, geometry=inspect(shape))
        if args.input:
            reader = base.STEPControl_Reader()
            if reader.ReadFile(args.input) != base.IFSelect_RetDone:
                raise ValueError('STEP_PARSE_FAILED')
            lengths, angles, solid_angles = (base.TColStd_SequenceOfAsciiString() for _ in range(3));reader.FileUnits(lengths, angles, solid_angles);reader.SetSystemLengthUnit(1.0)
            if reader.TransferRoots() < 1:
                raise ValueError('STEP_TRANSFER_FAILED')
            report = dict(recordType='INDEPENDENT_STEP_GEOMETRY_OBSERVATION', caseId='S04', normalizedLengthUnit='mm', sourceLengthUnits=[lengths.Value(i).ToCString() for i in range(1, lengths.Length()+1)], geometry=inspect(reader.OneShape()))
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
