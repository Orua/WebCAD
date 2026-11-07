"""M02 standalone STEP reader and explicit eight-edge native reference.

Sections are measured from actual BRep intersections. Closed-shell topology and
complete trimmed analytic supports establish the convex tube boundary. Boolean
differences are diagnostic only: independently serialized coincident periodic
surfaces can report a full-volume difference even for the frozen standard itself.
"""
import argparse
import json
import math
from pathlib import Path
import ocp_reader as base
import m02_math as oracle
from OCP.BRepOffsetAPI import BRepOffsetAPI_MakePipe
from OCP.BRepAlgoAPI import BRepAlgoAPI_Section, BRepAlgoAPI_Fuse
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRep import BRep_Tool
from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Cylinder, GeomAbs_Torus
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopTools import TopTools_ListOfShape
from OCP.gp import gp_Circ, gp_Pln

CURVE_SAMPLES = 48


def analytic_supports(shape):
    """Match the complete trimmed boundary to the eight analytic target supports.

    STEP may split faces: accumulate area and bounds per support, not face IDs.
    All dimensions come from the frozen specification, never the test output.
    This avoids Boolean equality of coincident periodic faces as an oracle.
    """
    targets = [
        ('bottom', 'cylinder', (0, -12, 0), (1, 0, 0), 112*math.pi, (-14, -14, -2, 14, -10, 2)),
        ('right', 'cylinder', (20, 0, 0), (0, 1, 0), 48*math.pi, (18, -6, -2, 22, 6, 2)),
        ('top', 'cylinder', (0, 12, 0), (1, 0, 0), 112*math.pi, (-14, 10, -2, 14, 14, 2)),
        ('left', 'cylinder', (-20, 0, 0), (0, 1, 0), 48*math.pi, (-22, -6, -2, -18, 6, 2)),
        ('bottom-right', 'torus', (14, -6, 0), (0, 0, 1), 12*math.pi**2, (14, -14, -2, 22, -6, 2)),
        ('top-right', 'torus', (14, 6, 0), (0, 0, 1), 12*math.pi**2, (14, 6, -2, 22, 14, 2)),
        ('top-left', 'torus', (-14, 6, 0), (0, 0, 1), 12*math.pi**2, (-22, 6, -2, -14, 14, 2)),
        ('bottom-left', 'torus', (-14, -6, 0), (0, 0, 1), 12*math.pi**2, (-22, -14, -2, -14, -6, 2)),
    ]
    groups = {name: dict(faceCount=0, areaMm2=0, bounds=None) for name, *_ in targets}
    unmatched = []
    explorer = base.TopExp_Explorer(shape, base.TopAbs_FACE)
    while explorer.More():
        face = base.TopoDS.Face_s(explorer.Current());explorer.Next()
        surface = base.BRepAdaptor_Surface(face, True)
        kind = 'cylinder' if surface.GetType() == GeomAbs_Cylinder else 'torus' if surface.GetType() == GeomAbs_Torus else None
        if kind is None:
            unmatched.append(str(surface.GetType()));continue
        primitive = surface.Cylinder() if kind == 'cylinder' else surface.Torus()
        location, direction = primitive.Location(), primitive.Axis().Direction()
        p = (location.X(), location.Y(), location.Z());d = (direction.X(), direction.Y(), direction.Z())
        radius_ok = abs(primitive.Radius()-2) <= base.LENGTH_TOLERANCE if kind == 'cylinder' else abs(primitive.MajorRadius()-6) <= base.LENGTH_TOLERANCE and abs(primitive.MinorRadius()-2) <= base.LENGTH_TOLERANCE
        matches = []
        for name, expected_kind, center, axis, _, _ in targets:
            delta = [a-b for a, b in zip(p, center)];projection = sum(a*b for a, b in zip(delta, axis))
            distance = math.sqrt(sum((v-projection*t)**2 for v, t in zip(delta, axis))) if kind == 'cylinder' else math.dist(p, center)
            aligned = abs(abs(sum(a*b for a, b in zip(d, axis)))-1) <= 1e-9
            if kind == expected_kind and radius_ok and aligned and distance <= base.LENGTH_TOLERANCE:
                matches.append(name)
        if len(matches) != 1:
            unmatched.append(dict(kind=kind, matches=matches));continue
        group = groups[matches[0]];group['faceCount'] += 1
        properties = base.GProp_GProps();base.BRepGProp.SurfaceProperties_s(face, properties);group['areaMm2'] += properties.Mass()
        box = base.bounds(face);values = [box[k] for k in ('minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ')]
        group['bounds'] = values if group['bounds'] is None else [(min if i < 3 else max)(old, value) for i, (old, value) in enumerate(zip(group['bounds'], values))]
    for name, _, _, _, expected_area, expected_bounds in targets:
        group = groups[name];group['expectedAreaMm2'] = expected_area;group['expectedBounds'] = expected_bounds
        group['matches'] = bool(group['faceCount'] and abs(group['areaMm2']-expected_area) <= expected_area*1e-4 and all(abs(a-b) <= base.LENGTH_TOLERANCE for a, b in zip(group['bounds'], expected_bounds)))
    return dict(matches=not unmatched and all(group['matches'] for group in groups.values()), groups=groups, unmatched=unmatched,
                scope='every boundary face matches a frozen cylinder/torus support; trimmed area and bounds checked per support, allowing face subdivision', areaRelativeTolerance=1e-4)


def reference(variant='reference'):
    if variant not in {'reference', 'wrong-wire', 'wrong-corner', 'wrong-envelope', 'open-gap', 'shifted-center', 'crossbar'}:
        raise ValueError('M02_REFERENCE_VARIANT_NOT_IMPLEMENTED')
    radius = 5 if variant == 'wrong-corner' else 6
    half_x = 21 if variant == 'wrong-envelope' else 20
    half_y = 12
    shift = 1 if variant == 'shifted-center' else 0
    a, b = half_x-radius, half_y-radius
    wire = base.BRepBuilderAPI_MakeWire()
    def point(x, y):
        return base.gp_Pnt(x+shift, y, 0)
    def line(p, q):
        wire.Add(base.BRepBuilderAPI_MakeEdge(point(*p), point(*q)).Edge())
    def arc(center, first):
        points = [point(center[0]+radius*math.cos(first+t*math.pi/2), center[1]+radius*math.sin(first+t*math.pi/2)) for t in [0, .5, 1]]
        wire.Add(base.BRepBuilderAPI_MakeEdge(base.GC_MakeArcOfCircle(*points).Value()).Edge())
    line((-a, -half_y), (a, -half_y));arc((a, -b), -math.pi/2)
    line((half_x, -b), (half_x, b));arc((a, b), 0)
    line((a, half_y), (-a, half_y));arc((-a, b), math.pi/2)
    line((-half_x, b), (-half_x, -b))
    if variant != 'open-gap':
        arc((-a, -b), math.pi)
    section_radius = 2.3 if variant == 'wrong-wire' else 2
    circle = gp_Circ(base.gp_Ax2(point(-a, -half_y), base.gp_Dir(1, 0, 0)), section_radius)
    section = base.BRepBuilderAPI_MakeFace(base.BRepBuilderAPI_MakeWire(base.BRepBuilderAPI_MakeEdge(circle).Edge()).Wire()).Face()
    pipe = BRepOffsetAPI_MakePipe(wire.Wire(), section)
    pipe.Build()
    if not pipe.IsDone():
        raise ValueError('M02_NATIVE_PIPE_FAILED')
    shape = pipe.Shape()
    if variant == 'crossbar':
        bar = base.BRepPrimAPI_MakeCylinder(base.gp_Ax2(point(-20, 0), base.gp_Dir(1, 0, 0)), 2, 40).Shape()
        operation = BRepAlgoAPI_Fuse(shape, bar);operation.Build()
        if not operation.IsDone():
            raise ValueError('M02_CROSSBAR_FIXTURE_FAILED')
        shape = operation.Shape()
    return shape


def section(shape, frame):
    operation = BRepAlgoAPI_Section(shape, gp_Pln(base.gp_Pnt(*frame['center']), base.gp_Dir(*frame['tangent'])), False)
    operation.Approximation(True);operation.Build()
    if not operation.IsDone():
        return dict(available=False, reason='SECTION_OPERATION_FAILED')
    edges = base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(operation.Shape(), TopAbs_EDGE, edges)
    groups = []
    for i in range(1, edges.Extent()+1):
        edge = base.TopoDS.Edge_s(edges.FindKey(i))
        curve = BRepAdaptor_Curve(edge)
        first, last = curve.FirstParameter(), curve.LastParameter()
        if not math.isfinite(first) or not math.isfinite(last) or last <= first:
            continue
        points = []
        for j in range(CURVE_SAMPLES):
            p = curve.Value(first+(last-first)*j/CURVE_SAMPLES)
            points.append(oracle.project([p.X(), p.Y(), p.Z()], frame))
        # An infinite tangent plane also cuts distant sides of the closed ring.
        # Select the local contour spatially, then measure it; global material
        # differences below still test the complete solid, including other sides.
        if min(math.hypot(p[0], p[1]) for p in points) > 8:
            continue
        fitted = oracle.fit_circle(points)
        if fitted is None:
            return dict(available=False, reason='LOCAL_SECTION_FIT_UNAVAILABLE')
        group = next((item for item in groups if math.hypot(item['fitted']['x']-fitted['x'], item['fitted']['y']-fitted['y']) <= base.LENGTH_TOLERANCE
                      and abs(item['fitted']['radius']-fitted['radius']) <= base.LENGTH_TOLERANCE), None)
        if group is None:
            group = dict(fitted=fitted, points=[], edges=[]);groups.append(group)
        group['points'].extend(points);group['edges'].append(edge)
    if len(groups) != 1:
        return dict(available=bool(groups), reason='LOCAL_CONTOUR_COUNT', contourCount=len(groups), verdict=False if groups else None)
    group = groups[0]
    wire, edge_list = base.BRepBuilderAPI_MakeWire(), TopTools_ListOfShape()
    for edge in group['edges']:
        edge_list.Append(edge)
    wire.Add(edge_list)
    closed = wire.IsDone()
    if closed:
        used = base.TopTools_IndexedMapOfShape()
        base.TopExp.MapShapes_s(wire.Wire(), TopAbs_EDGE, used)
        closed = used.Extent() == len(group['edges']) and wire.Wire().Closed()
    fitted = oracle.fit_circle(group['points'])
    verdict = bool(closed and abs(fitted['radius']-2) <= base.LENGTH_TOLERANCE and fitted['maxCircleResidualMm'] <= base.LENGTH_TOLERANCE
                   and fitted['maxPlaneResidualMm'] <= base.LENGTH_TOLERANCE)
    return dict(available=True, fitted=fitted, measuredCenter=oracle.measured_center(fitted, frame), closed=bool(closed),
                verdict=verdict, localPoints=group['points'], samplesPerEdge=CURVE_SAMPLES)


def inspect(shape):
    if shape.IsNull():
        raise ValueError('EMPTY_STEP_SHAPE')
    solids, shells = base.TopTools_IndexedMapOfShape(), base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, base.TopAbs_SOLID, solids);base.TopExp.MapShapes_s(shape, base.TopAbs_SHELL, shells)
    valid = base.BRepCheck_Analyzer(shape, True).IsValid()
    geometry = dict(reader=dict(independent=True, source='OCP M02 exact native path, STEP sections and material differences', version=base.OCP.__version__,
                                sharedKernelFamily=True, algorithmIndependence=False), brepValid=valid, targetType='solid' if solids.Extent() else 'surface', units='mm',
                    solidCount=solids.Extent(), shellCount=shells.Extent(), volume=base.volume(shape), bounds=base.bounds(shape), checks={})
    if not valid or solids.Extent() != 1:
        return geometry
    solid = base.TopoDS.Solid_s(solids.FindKey(1))
    target = reference()
    missing, extra = base.volume(base.cut(target, solid)), base.volume(base.cut(solid, target))
    boolean_equivalent = missing <= base.DIFFERENCE_VOLUME_TOLERANCE and extra <= base.DIFFERENCE_VOLUME_TOLERANCE
    support = analytic_supports(solid)
    expected_volume = 4*math.pi*(80+12*math.pi)
    equivalent = support['matches'] and abs(geometry['volume']-expected_volume) <= expected_volume*1e-4
    geometry['analyticSupports'] = support
    difference = dict(missingMaterialMm3=missing, extraMaterialMm3=extra, toleranceMm3=base.DIFFERENCE_VOLUME_TOLERANCE, withinTolerance=boolean_equivalent,
                      acceptanceSource='independent analytic supports, trimmed areas/bounds, sections and volume', acceptanceDependsOnBoolean=False)
    geometry['referenceDifference'] = difference
    frames = [dict(**frame, **section(solid, frame)) for frame in oracle.frames()]
    measured_centerline = oracle.centerline_measurements(frames)
    shell_closed = [bool(BRep_Tool.IsClosed_s(base.TopoDS.Shell_s(shells.FindKey(i)))) for i in range(1, shells.Extent()+1)]
    caps = []
    explorer = base.TopExp_Explorer(solid, base.TopAbs_FACE)
    while explorer.More():
        face = base.TopoDS.Face_s(explorer.Current())
        if base.BRepAdaptor_Surface(face, True).GetType() == GeomAbs_Plane:
            caps.append(base.bounds(face))
        explorer.Next()
    def check(verdict, evidence):
        return dict(checkerId='ocp-m02-closed-wire-2', **{'pass': verdict}, evidence=evidence)
    verdicts = [item.get('verdict') for item in frames]
    diameter = False if False in verdicts else None if None in verdicts else True
    geometry['checks']['closedPath'] = check(equivalent and shells.Extent() == 1 and all(shell_closed) and not caps,
        dict(shellsClosed=shell_closed, planarEndCaps=caps, referenceDifference=difference, scope='closed single-shell target tube without sweep end caps'))
    geometry['checks']['wireDiameter'] = check(diameter, dict(frames=frames, expectedDiameterMm=4, toleranceMm=base.LENGTH_TOLERANCE,
        continuousMaximumErrorCertified=False, localSelectionRadiusMm=8, uncovered='between sampled section/curve parameters; global material differences checked separately'))
    centerline_verdict = False if not equivalent else measured_centerline['matches'] if measured_centerline.get('available') else None
    geometry['checks']['centerline'] = check(centerline_verdict,
        dict(measurements=measured_centerline, analyticSupports=support, referenceDifference=difference, scope='centers fitted from actual tube sections; 40x24 path envelope and four R6 corners, not outer solid bounds'))
    geometry['checks']['selfIntersection'] = check(valid and equivalent,
        dict(brepValid=valid, referenceDifference=difference, targetGeometryProof=dict(convexSimpleRoundedRectangle=True, minimumOffsetReachMm=6, wireRadiusMm=2,
             offsetMarginMm=4, opposedStraightSeparationMm=24),
             analyticSupports=support, scope='valid closed BRep with all trimmed analytic supports, areas, bounds and volume matching the simple convex target; target offsets remain regular for radius 2 below reach 6',
             generalPurposeSelfIntersectionSolver=False))
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=['M02'], required=True)
    parser.add_argument('--input');parser.add_argument('--write-reference')
    parser.add_argument('--variant', default='reference');parser.add_argument('--report', required=True)
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
            report = dict(recordType='REFERENCE_OR_NEGATIVE_FIXTURE', caseId='M02', variant=args.variant, geometry=inspect(shape))
        if args.input:
            path = Path(args.input)
            if not path.is_file() or not 0 < path.stat().st_size <= 128*1024*1024:
                raise ValueError('STEP_INPUT_MISSING_OR_OVERSIZED')
            reader = base.STEPControl_Reader()
            if reader.ReadFile(str(path)) != base.IFSelect_RetDone:
                raise ValueError('STEP_PARSE_FAILED')
            lengths, angles, solid_angles = (base.TColStd_SequenceOfAsciiString() for _ in range(3))
            reader.FileUnits(lengths, angles, solid_angles);reader.SetSystemLengthUnit(1.0)
            if reader.TransferRoots() < 1:
                raise ValueError('STEP_TRANSFER_FAILED')
            report = dict(recordType='INDEPENDENT_STEP_GEOMETRY_OBSERVATION', caseId='M02', normalizedLengthUnit='mm',
                          sourceLengthUnits=[lengths.Value(i).ToCString() for i in range(1, lengths.Length()+1)], geometry=inspect(reader.OneShape()))
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
