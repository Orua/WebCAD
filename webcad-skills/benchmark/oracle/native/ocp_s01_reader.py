"""Isolated S01 reader: actual XY rectangles, twist and side continuity.

No frozen hub/reader is modified. Off-grid sections test the interior twist law.
Surface continuity and horizontal interface topology distinguish smooth sides
from fused stacks. Sampled contour distances are not continuous Hausdorff bounds.
"""
import argparse
import json
import math
from pathlib import Path
import ocp_reader as base
import s01_math as oracle
from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
from OCP.BRepAlgoAPI import BRepAlgoAPI_Section, BRepAlgoAPI_Fuse
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopTools import TopTools_ListOfShape
from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_C0
from OCP.gp import gp_Pln, gp_Ax1, gp_Trsf

CURVE_SAMPLES = 48


def reference(variant='reference'):
    if variant not in {'reference', 'wrong-middle-angle', 'wrong-center', 'area-preserving-size', 'ends-only', 'stacked'}:
        raise ValueError('S01_REFERENCE_VARIANT_NOT_IMPLEMENTED')
    if variant == 'stacked':
        shape = None
        for i in range(8):
            block = base.BRepPrimAPI_MakeBox(base.gp_Pnt(-10, -6, 5*i), 20, 12, 5).Shape()
            transform = gp_Trsf()
            transform.SetRotation(gp_Ax1(base.gp_Pnt(0, 0, 0), base.gp_Dir(0, 0, 1)), math.pi*i/21)
            block = BRepBuilderAPI_Transform(block, transform, True).Shape()
            if shape is None:
                shape = block
            else:
                operation = BRepAlgoAPI_Fuse(shape, block);operation.Build()
                if not operation.IsDone():
                    raise ValueError('S01_STACK_FIXTURE_FUSE_FAILED')
                shape = operation.Shape()
        return shape
    builder = BRepOffsetAPI_ThruSections(True, False, 1e-6)
    builder.SetMaxDegree(3);builder.CheckCompatibility(False)
    count = 2 if variant == 'ends-only' else 9 if variant == 'reference' else 17
    for i in range(count):
        t = i/(count-1)
        angle = math.pi*t/3+(math.pi/12*math.sin(math.pi*t) if variant == 'wrong-middle-angle' else 0)
        width = 20+4*math.sin(math.pi*t) if variant == 'area-preserving-size' else 20
        height = 240/width
        cx = math.sin(math.pi*t) if variant == 'wrong-center' else 0
        c, s = math.cos(angle), math.sin(angle)
        points = [base.gp_Pnt(cx+c*x-s*y, s*x+c*y, 40*t) for x, y in [(-width/2, -height/2), (width/2, -height/2), (width/2, height/2), (-width/2, height/2)]]
        wire = base.BRepBuilderAPI_MakeWire()
        for j, point in enumerate(points):
            wire.Add(base.BRepBuilderAPI_MakeEdge(point, points[(j+1) % 4]).Edge())
        builder.AddWire(wire.Wire())
    builder.Build()
    if not builder.IsDone():
        raise ValueError('S01_REFERENCE_LOFT_FAILED')
    return builder.Shape()


def section_points(shape, z):
    operation = BRepAlgoAPI_Section(shape, gp_Pln(base.gp_Pnt(0, 0, z), base.gp_Dir(0, 0, 1)), False)
    operation.Approximation(True);operation.Build()
    if not operation.IsDone():
        return dict(available=False, verdict=None, reason='SECTION_OPERATION_FAILED')
    edges = base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(operation.Shape(), TopAbs_EDGE, edges)
    if edges.Extent() == 0 and z in (0, 40):
        explorer = base.TopExp_Explorer(shape, base.TopAbs_FACE)
        while explorer.More():
            face = base.TopoDS.Face_s(explorer.Current())
            surface = base.BRepAdaptor_Surface(face, True)
            limits = base.bounds(face)
            if surface.GetType() == GeomAbs_Plane and base.near(limits['minZ'], z) and base.near(limits['maxZ'], z):
                base.TopExp.MapShapes_s(face, TopAbs_EDGE, edges)
            explorer.Next()
    if edges.Extent() == 0:
        return dict(available=False, verdict=None, reason='SECTION_CURVES_MISSING')
    wire, edge_list = base.BRepBuilderAPI_MakeWire(), TopTools_ListOfShape()
    for i in range(1, edges.Extent()+1):
        edge_list.Append(edges.FindKey(i))
    wire.Add(edge_list)
    closed = wire.IsDone()
    if closed:
        used = base.TopTools_IndexedMapOfShape()
        base.TopExp.MapShapes_s(wire.Wire(), TopAbs_EDGE, used)
        closed = wire.Wire().Closed() and used.Extent() == edges.Extent()
    points, segments = [], []
    for i in range(1, edges.Extent()+1):
        curve = BRepAdaptor_Curve(base.TopoDS.Edge_s(edges.FindKey(i)))
        first, last = curve.FirstParameter(), curve.LastParameter()
        if not math.isfinite(first) or not math.isfinite(last) or last <= first:
            return dict(available=False, verdict=None, reason='SECTION_CURVE_RANGE_UNAVAILABLE')
        sampled = []
        for j in range(CURVE_SAMPLES+1):
            point = curve.Value(first+(last-first)*j/CURVE_SAMPLES)
            sampled.append([point.X(), point.Y(), point.Z()])
        points.extend(sampled)
        segments.extend(zip(sampled[:-1], sampled[1:]))
    result = oracle.frame_evidence(points, segments, z/40)
    if not closed:
        result['verdict'] = False
    return dict(**result, closedSingleContour=bool(closed), points=points, edgeCount=edges.Extent(), samplesPerEdge=CURVE_SAMPLES)


def side_topology(shape):
    caps, internal_steps, surfaces = [], [], []
    explorer = base.TopExp_Explorer(shape, base.TopAbs_FACE)
    while explorer.More():
        face = base.TopoDS.Face_s(explorer.Current())
        surface = base.BRepAdaptor_Surface(face, True)
        limits = base.bounds(face)
        horizontal = False
        if surface.GetType() == GeomAbs_Plane:
            normal = surface.Plane().Axis().Direction()
            horizontal = abs(normal.Z()) > 1-1e-8 and base.near(limits['minZ'], limits['maxZ'])
        if horizontal:
            if base.near(limits['minZ'], 0) or base.near(limits['minZ'], 40):
                caps.append(limits)
            else:
                internal_steps.append(limits)
        else:
            try:
                u, v = surface.UContinuity(), surface.VContinuity()
                c1 = u != GeomAbs_C0 and v != GeomAbs_C0
                surfaces.append(dict(bounds=limits, uContinuity=str(u), vContinuity=str(v), atLeastC1=bool(c1)))
            except Exception:
                surfaces.append(dict(bounds=limits, atLeastC1=None, reason='SURFACE_CONTINUITY_UNAVAILABLE'))
        explorer.Next()
    edges = base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, TopAbs_EDGE, edges)
    transverse = []
    for i in range(1, edges.Extent()+1):
        limits = base.bounds(edges.FindKey(i))
        if base.near(limits['minZ'], limits['maxZ']) and limits['minZ'] > base.LENGTH_TOLERANCE and limits['maxZ'] < 40-base.LENGTH_TOLERANCE:
            transverse.append(limits)
    cap_planes = all(any(base.near(face['minZ'], z) and base.near(face['maxZ'], z) for face in caps) for z in [0, 40])
    return dict(capPlanesPresent=cap_planes, caps=caps, internalHorizontalFaces=internal_steps, sideSurfaces=surfaces,
                interiorHorizontalEdges=transverse, surfaceContinuityAvailable=bool(surfaces) and all(item['atLeastC1'] is True for item in surfaces),
                splitFaceSeamsUnverified=bool(transverse))


def smooth_verdict(frames, topology):
    verdicts = [item.get('verdict') for item in frames]
    if False in verdicts or not topology['capPlanesPresent'] or topology['internalHorizontalFaces']:
        return False
    if None in verdicts or not topology['surfaceContinuityAvailable'] or topology['splitFaceSeamsUnverified']:
        return None
    return True


def inspect(shape):
    if shape.IsNull():
        raise ValueError('EMPTY_STEP_SHAPE')
    solids, shells = base.TopTools_IndexedMapOfShape(), base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, base.TopAbs_SOLID, solids);base.TopExp.MapShapes_s(shape, base.TopAbs_SHELL, shells)
    valid = base.BRepCheck_Analyzer(shape, True).IsValid()
    geometry = dict(reader=dict(independent=True, source='OCP S01 actual oriented XY rectangle sections and side topology', version=base.OCP.__version__, sharedKernelFamily=True, algorithmIndependence=False),
                    brepValid=valid, targetType='solid' if solids.Extent() else 'surface', units='mm', solidCount=solids.Extent(), shellCount=shells.Extent(),
                    volume=base.volume(shape), bounds=base.bounds(shape), sections=[], checks={})
    if not valid or solids.Extent() != 1:
        return geometry
    frames = []
    for t in oracle.STATIONS:
        measured = section_points(shape, 40*t)
        frames.append(dict(t=t, **measured))
        fitted = measured.get('fitted') or {}
        geometry['sections'].append(dict(t=t, **{key: fitted.get(key) for key in ['z', 'width', 'height', 'angleDeg']}))
    topology = side_topology(shape)
    geometry['checks']['smoothSides'] = dict(checkerId='ocp-s01-actual-rectangles-and-side-continuity-1', **{'pass': smooth_verdict(frames, topology)},
        evidence=dict(scope='all sampled centered XY 20x12 rectangle frames and twist law, plus side-face continuity and absence of interior horizontal step interfaces',
                      frames=frames, sideTopology=topology, sectionStations=oracle.STATIONS, curveToleranceMm=oracle.CURVE_TOLERANCE_MM, planeAndCenterToleranceMm=base.LENGTH_TOLERANCE,
                      fittedFrameMethod='minimum-area oriented bounding rectangle of actual section hull; longest dimension identifies width direction modulo 180 degrees',
                      continuousMaximumErrorCertified=False, polylineDistanceIsSampleApproximation=True,
                      uncovered='between sampled section/curve locations; split side-face transverse seams remain UNVERIFIED rather than being assumed tangent',
                      intentionalSharpEdges='the four longitudinal rectangle corners'))
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=['S01'], required=True)
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
            report = dict(recordType='REFERENCE_OR_NEGATIVE_FIXTURE', caseId='S01', variant=args.variant, geometry=inspect(shape))
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
            report = dict(recordType='INDEPENDENT_STEP_GEOMETRY_OBSERVATION', caseId='S01', normalizedLengthUnit='mm',
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
