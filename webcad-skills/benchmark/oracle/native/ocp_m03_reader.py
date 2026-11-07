"""M03 independent STEP: measured tangent-plane rings, end planes and material.

Native reference uses partial tori; product recipe uses full tori and clipping.
Sampled sections/material are not a certified continuous maximum-error proof.
"""
import argparse
import json
import math
from pathlib import Path
import ocp_reader as base
import m03_math as oracle
from OCP.BRepPrimAPI import BRepPrimAPI_MakeTorus, BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse, BRepAlgoAPI_Section
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeWire, BRepBuilderAPI_Transform
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopTools import TopTools_ListOfShape
from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Torus
from OCP.gp import gp_Pln, gp_Trsf, gp_Ax1

CURVE_SAMPLES = 64


def reference(variant='reference'):
    if variant not in {'reference', 'wrong-wall', 'wrong-path', 'plugged-end', 'rotated-sector'}:
        raise ValueError('M03_REFERENCE_VARIANT_NOT_IMPLEMENTED')
    major = 22 if variant == 'wrong-path' else 20
    inner = 1.5 if variant == 'wrong-wall' else 2
    shape = BRepAlgoAPI_Cut(BRepPrimAPI_MakeTorus(major, 3, math.pi/2).Shape(),
                           BRepPrimAPI_MakeTorus(major, inner, math.pi/2).Shape()).Shape()
    if variant == 'plugged-end':
        plug = BRepPrimAPI_MakeCylinder(base.gp_Ax2(base.gp_Pnt(20, -.1, 0), base.gp_Dir(0, 1, 0)), 2.2, 1).Shape()
        shape = BRepAlgoAPI_Fuse(shape, plug).Shape()
    if variant == 'rotated-sector':
        rotation = gp_Trsf()
        rotation.SetRotation(gp_Ax1(base.gp_Pnt(0, 0, 0), base.gp_Dir(0, 0, 1)), math.pi/18)
        shape = BRepBuilderAPI_Transform(shape, rotation, True).Shape()
    return shape


def faces(shape):
    result, tori = [], []
    explorer = base.TopExp_Explorer(shape, base.TopAbs_FACE)
    while explorer.More():
        face = base.TopoDS.Face_s(explorer.Current())
        surface = base.BRepAdaptor_Surface(face, True)
        if surface.GetType() == GeomAbs_Plane:
            axis = surface.Plane().Axis().Direction()
            point = surface.Plane().Location()
            result.append(dict(shape=face, bounds=base.bounds(face), normal=[axis.X(), axis.Y(), axis.Z()],
                               origin=[point.X(), point.Y(), point.Z()]))
        elif surface.GetType() == GeomAbs_Torus:
            torus = surface.Torus()
            center, axis = torus.Location(), torus.Axis().Direction()
            tori.append(dict(majorRadiusMm=torus.MajorRadius(), minorRadiusMm=torus.MinorRadius(),
                             origin=[center.X(), center.Y(), center.Z()], axis=[axis.X(), axis.Y(), axis.Z()]))
        explorer.Next()
    return result, tori


def ring_sections(edges, t):
    """Group measured circular arcs by their own fitted centers/radii, not targets."""
    if edges.Extent() == 0:
        return dict(available=False, reason='SECTION_CURVES_MISSING')
    groups = []
    for i in range(1, edges.Extent()+1):
        edge = base.TopoDS.Edge_s(edges.FindKey(i))
        curve = BRepAdaptor_Curve(edge)
        first, last = curve.FirstParameter(), curve.LastParameter()
        if not math.isfinite(first) or not math.isfinite(last) or last <= first:
            return dict(available=False, reason='SECTION_CURVE_RANGE_UNAVAILABLE')
        points = []
        for j in range(CURVE_SAMPLES):
            p = curve.Value(first+(last-first)*j/CURVE_SAMPLES)
            points.append(oracle.project([p.X(), p.Y(), p.Z()], t))
        fitted = oracle.fit_circle(points)
        if fitted is None:
            return dict(available=False, reason='SECTION_CIRCLE_FIT_UNAVAILABLE')
        group = next((item for item in groups if math.hypot(item['fitted']['x']-fitted['x'], item['fitted']['y']-fitted['y']) <= base.LENGTH_TOLERANCE
                      and abs(item['fitted']['radius']-fitted['radius']) <= base.LENGTH_TOLERANCE), None)
        if group is None:
            group = dict(fitted=fitted, points=[], edges=[])
            groups.append(group)
        group['edges'].append(edge); group['points'].extend(points)
    rings = []
    for group in groups:
        wire, edge_list = BRepBuilderAPI_MakeWire(), TopTools_ListOfShape()
        for edge in group['edges']:
            edge_list.Append(edge)
        wire.Add(edge_list)
        closed = wire.IsDone()
        if closed:
            used = base.TopTools_IndexedMapOfShape()
            base.TopExp.MapShapes_s(wire.Wire(), TopAbs_EDGE, used)
            closed = wire.Wire().Closed() and used.Extent() == len(group['edges'])
        rings.append(dict(fitted=oracle.fit_circle(group['points']), closed=bool(closed), edgeCount=len(group['edges']),
                          measuredLocalPoints=group['points']))
    rings.sort(key=lambda item: item['fitted']['radius'])
    return dict(available=True, rings=rings, edgeCount=edges.Extent(), samplesPerEdge=CURVE_SAMPLES)


def section(shape, t):
    center, _, tangent = oracle.frame(t)
    operation = BRepAlgoAPI_Section(shape, gp_Pln(base.gp_Pnt(*center), base.gp_Dir(*tangent)), False)
    operation.Approximation(True); operation.Build()
    if not operation.IsDone():
        return dict(available=False, reason='SECTION_OPERATION_FAILED')
    edges = base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(operation.Shape(), TopAbs_EDGE, edges)
    return ring_sections(edges, t)


def ring_verdict(measured):
    if not measured.get('available'):
        return None
    rings = measured['rings']
    return len(rings) == 2 and all(item['closed'] and oracle.ring_matches(item['fitted'], radius)
                                   for item, radius in zip(rings, [2, 3]))


def combined(verdicts):
    return False if False in verdicts else None if None in verdicts else True


def end_observation(planar, t):
    center, _, tangent = oracle.frame(t)
    candidates = []
    for item in planar:
        # Plane distance plus actual face center rejects a parallel plane elsewhere.
        normal = item['normal']
        distance = abs(sum((c-o)*n for c, o, n in zip(center, item['origin'], normal)))
        b = item['bounds']
        midpoint = [(b['min'+a]+b['max'+a])/2 for a in ['X', 'Y', 'Z']]
        offset = math.dist(midpoint, center)
        error = oracle.normal_error_mm(normal, tangent)
        if distance <= base.LENGTH_TOLERANCE and offset <= base.LENGTH_TOLERANCE:
            edges = base.TopTools_IndexedMapOfShape()
            base.TopExp.MapShapes_s(item['shape'], TopAbs_EDGE, edges)
            measured = ring_sections(edges, t)
            candidates.append(dict(bounds=b, normal=normal, planeDistanceMm=distance, centerOffsetMm=offset,
                                   normalDeviationAcrossDiameterMm=error, section=measured,
                                   verdict=error <= base.LENGTH_TOLERANCE and ring_verdict(measured) is True))
    return dict(t=t, candidates=candidates, verdict=any(item['verdict'] for item in candidates))


def inspect(shape):
    if shape.IsNull():
        raise ValueError('EMPTY_STEP_SHAPE')
    solids, shells = base.TopTools_IndexedMapOfShape(), base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, base.TopAbs_SOLID, solids); base.TopExp.MapShapes_s(shape, base.TopAbs_SHELL, shells)
    valid = base.BRepCheck_Analyzer(shape, True).IsValid()
    geometry = dict(reader=dict(independent=True, source='OCP STEP tangent-plane bend sections and material', version=base.OCP.__version__,
                                sharedKernelFamily=True, algorithmIndependence=False), brepValid=valid,
                    targetType='solid' if solids.Extent() else 'surface', units='mm', solidCount=solids.Extent(),
                    shellCount=shells.Extent(), volume=base.volume(shape), bounds=base.bounds(shape), checks={})
    if not valid or solids.Extent() != 1:
        return geometry
    planar, tori = faces(shape)
    frames = [dict(t=t, **section(shape, t)) for t in oracle.STATIONS]
    rings_ok = combined([ring_verdict(item) for item in frames])
    wall_verdicts = []
    for item in frames:
        rings = item.get('rings', [])
        if len(rings) != 2:
            wall_verdicts.append(False if item.get('available') else None)
        else:
            thickness = rings[1]['fitted']['radius']-rings[0]['fitted']['radius']
            item['measuredWallMm'] = thickness
            wall_verdicts.append(all(ring['closed'] for ring in rings) and ring_verdict(item) is True
                                 and abs(thickness-1) <= base.LENGTH_TOLERANCE)
    ends = [end_observation(planar, t) for t in [0, 1]]
    solid = base.TopoDS.Solid_s(solids.FindKey(1))
    bore, wall = [], []
    for t in sorted(set([0, 1]+oracle.STATIONS)):
        center, radial, _ = oracle.frame(t)
        bore.append(center)
        if t not in (0, 1):
            wall.extend([[c+2.5*r for c, r in zip(center, radial)], [center[0], center[1], 2.5]])
    voids = base.material_samples(solid, bore, base.TopAbs_OUT)
    material = base.material_samples(solid, wall, base.TopAbs_IN)
    def check(verdict, evidence):
        return dict(checkerId='ocp-m03-bend-1', **{'pass': verdict}, evidence=evidence)
    scope = dict(lengthToleranceMm=base.LENGTH_TOLERANCE, stations=oracle.STATIONS, continuousMaximumErrorCertified=False,
                 uncovered='between sampled section/curve/material locations', analyticTori=tori)
    geometry['checks']['diameters'] = check(rings_ok, dict(**scope, scope='two closed rings R2/R3 centered on R20 XY centerline at each sampled tangent plane', frames=frames))
    geometry['checks']['endNormals'] = check(all(item['verdict'] for item in ends), dict(ends=ends, scope='annular end locations and tangent normals at XY angles 0 and 90 degrees', lengthToleranceMm=base.LENGTH_TOLERANCE))
    geometry['checks']['through'] = check(voids['pass'] and material['pass'],
                                         dict(bore=voids, wall=material, scope=scope))
    geometry['checks']['wall'] = check(combined(wall_verdicts), dict(frames=frames, targetWallMm=1, scope=scope))
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=['M03'], required=True)
    parser.add_argument('--input'); parser.add_argument('--write-reference')
    parser.add_argument('--variant', default='reference'); parser.add_argument('--report', required=True)
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
            report = dict(recordType='REFERENCE_OR_NEGATIVE_FIXTURE', caseId='M03', variant=args.variant, geometry=inspect(shape))
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
            report = dict(recordType='INDEPENDENT_STEP_GEOMETRY_OBSERVATION', caseId='M03', normalizedLengthUnit='mm',
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
