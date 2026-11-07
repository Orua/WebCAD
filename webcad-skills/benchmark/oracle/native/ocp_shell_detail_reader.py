"""Original S11 outward cylindrical wall and S12 scoped rolling-radius reference."""
import argparse
import json
import math
from pathlib import Path
import ocp_reader as base
from ocp_s06_reader import native_distance, free_boundaries
from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakeSphere, BRepPrimAPI_MakeBox
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Common
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepTools import BRepTools
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.BRep import BRep_Tool
from OCP.GeomLProp import GeomLProp_SLProps
from OCP.GeomAbs import GeomAbs_Sphere, GeomAbs_Cylinder, GeomAbs_Plane
from OCP.TopAbs import TopAbs_EDGE
from OCP.gp import gp_Trsf, gp_Ax1, gp_Pnt2d, gp_Vec


def edges_of(shape):
    mapping = base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, TopAbs_EDGE, mapping)
    return [base.TopoDS.Edge_s(mapping.FindKey(i)) for i in range(1, mapping.Extent()+1)]


def edge_points(edge, count=17):
    curve = BRepAdaptor_Curve(edge)
    return [[p.X(), p.Y(), p.Z()] for i in range(count) if (p := curve.Value(curve.FirstParameter()+(curve.LastParameter()-curve.FirstParameter())*i/(count-1))) is not None]


def reference(case_id, variant='reference'):
    if variant not in {'reference', 'wrong-radius', 'wrong-direction', 'wrong-rim', 'no-fillet'}:
        raise ValueError('DETAIL_VARIANT_UNSUPPORTED')
    if case_id == 'S11':
        inner, outer = (19, 20) if variant == 'wrong-direction' else (20, 21.5 if variant == 'wrong-radius' else 21)
        outer_shape = BRepPrimAPI_MakeCylinder(outer, 15, 2*math.pi/3).Shape()
        inner_shape = BRepPrimAPI_MakeCylinder(inner, 15, 2*math.pi/3).Shape()
        shape = BRepAlgoAPI_Cut(outer_shape, inner_shape).Shape()
        transform = gp_Trsf()
        transform.SetRotation(gp_Ax1(base.gp_Pnt(0, 0, 0), base.gp_Dir(0, 0, 1)), -math.pi/3)
        return BRepBuilderAPI_Transform(shape, transform, True).Shape()
    sphere = BRepPrimAPI_MakeSphere(20).Shape()
    top_halfspace = BRepPrimAPI_MakeBox(base.gp_Pnt(-25, -25, 10), 50, 50, 20).Shape()
    cap = BRepAlgoAPI_Common(sphere, top_halfspace).Shape()
    cutter = BRepPrimAPI_MakeCylinder(base.gp_Ax2(base.gp_Pnt(5, 0, 5), base.gp_Dir(0, 0, 1)), 2, 20).Shape()
    drilled = BRepAlgoAPI_Cut(cap, cutter).Shape()
    if variant == 'no-fillet':
        return drilled
    selected = []
    for edge in edges_of(drilled):
        points = edge_points(edge)
        if not all(abs(math.hypot(p[0]-5, p[1])-2) < 1e-5 for p in points):
            continue
        if (variant == 'wrong-rim' and all(abs(p[2]-10) < 1e-5 for p in points)) or (variant != 'wrong-rim' and min(p[2] for p in points) > 15):
            selected.append(edge)
    if not selected:
        raise ValueError('REFERENCE_HOLE_RIM_NOT_FOUND')
    fillet = BRepFilletAPI_MakeFillet(drilled)
    for edge in selected:
        fillet.Add(.25 if variant == 'wrong-radius' else .5, edge)
    fillet.Build()
    if not fillet.IsDone():
        raise ValueError('REFERENCE_R05_FILLET_NOT_CONSTRUCTIBLE')
    return fillet.Shape()


def inspect(case_id, shape):
    faces, solids = base.TopTools_IndexedMapOfShape(), base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(shape, base.TopAbs_FACE, faces)
    base.TopExp.MapShapes_s(shape, base.TopAbs_SOLID, solids)
    props = base.GProp_GProps()
    base.BRepGProp.VolumeProperties_s(shape, props)
    geometry = dict(reader=dict(independent=True, source='OCP shell/detail STEP sampler', version=base.OCP.__version__, sharedKernelFamily=True, algorithmIndependence=False),
                    brepValid=base.BRepCheck_Analyzer(shape, True).IsValid(), targetType='solid' if solids.Extent() else 'surface' if faces.Extent() else 'wire',
                    units='mm', solidCount=solids.Extent(), faceCount=faces.Extent(), volume=props.Mass(), checks={})
    if not geometry['brepValid'] or solids.Extent() != 1 or faces.Extent() > 64:
        return geometry
    expected = reference(case_id)
    expected_faces = base.TopTools_IndexedMapOfShape()
    base.TopExp.MapShapes_s(expected, base.TopAbs_FACE, expected_faces)
    reverse, forward, cylinders, curvatures, bottom_faces, sampled_faces = [], [], [], [], [], []
    for source, direction in [(shape, reverse), (expected, forward)]:
        mapping = faces if source is shape else expected_faces
        for i in range(1, mapping.Extent()+1):
            face = base.TopoDS.Face_s(mapping.FindKey(i))
            adaptor = base.BRepAdaptor_Surface(face, True)
            u0, u1, v0, v1 = BRepTools.UVBounds_s(face)
            surface = BRep_Tool.Surface_s(face)
            count = 0
            for a in range(9):
                for b in range(9):
                    u, v = u0+(u1-u0)*(a+.5)/9, v0+(v1-v0)*(b+.5)/9
                    if BRepClass_FaceClassifier(face, gp_Pnt2d(u, v), 1e-7).State() not in (base.TopAbs_IN, base.TopAbs_ON):
                        continue
                    p = adaptor.Value(u, v)
                    direction.append(dict(actualPoint=[p.X(), p.Y(), p.Z()], **native_distance([p.X(), p.Y(), p.Z()], expected if source is shape else shape)))
                    if source is shape and case_id == 'S12' and adaptor.GetType() not in (GeomAbs_Sphere, GeomAbs_Cylinder, GeomAbs_Plane):
                        properties = GeomLProp_SLProps(surface, u, v, 2, 1e-7)
                        if properties.IsCurvatureDefined():
                            curvature = max(abs(properties.MaxCurvature()), abs(properties.MinCurvature()))
                            curvatures.append(dict(face=i, point=[p.X(), p.Y(), p.Z()], radius=1/curvature if curvature > 1e-12 else None))
                    count += 1
            if source is shape:
                sampled_faces.append(count)
                if adaptor.GetType() == GeomAbs_Cylinder:
                    cylinder = adaptor.Cylinder()
                    origin, axis = cylinder.Axis().Location(), cylinder.Axis().Direction()
                    cylinders.append(dict(face=i, radius=cylinder.Radius(), origin=[origin.X(), origin.Y(), origin.Z()], axis=[axis.X(), axis.Y(), axis.Z()]))
                if adaptor.GetType() == GeomAbs_Plane:
                    plane = adaptor.Plane()
                    if abs(plane.Axis().Direction().Z()) > .999999 and abs(plane.Location().Z()-10) < .01:
                        area = base.GProp_GProps()
                        base.BRepGProp.SurfaceProperties_s(face, area)
                        bottom_faces.append(dict(face=i, area=area.Mass()))
    both = bool(forward and reverse) and all(sampled_faces) and all(m['available'] and m['distanceMm'] <= .05 for m in forward+reverse)
    _, free = free_boundaries(shape, faces)
    common = dict(targetToActual=forward, actualToTarget=reverse, faceSampleCounts=sampled_faces, toleranceMm=.05, continuousMaximumErrorCertified=False)
    if case_id == 'S11':
        radii = sorted(round(row['radius'], 7) for row in cylinders)
        for name, verdict, evidence in [('radii', radii == [20, 21], dict(cylinders=cylinders)),
                                      ('thicknessDirection', both and radii == [20, 21], common),
                                      ('closedBoundaries', not free and both, dict(freeEdgeCount=len(free), **common))]:
            geometry['checks'][name] = dict(checkerId='ocp-detail-'+name+'-1', **{'pass': verdict}, evidence=evidence)
        return geometry
    bottom_edges, seams = [], []
    for edge in edges_of(shape):
        points = edge_points(edge)
        if all(abs(p[2]-10) < .01 for p in points) and all(abs(math.hypot(p[0]-5, p[1])-2) < .01 for p in points):
            bottom_edges.append(points)
        if min(p[2] for p in points) <= 15:
            continue
        adjacent = []
        for i in range(1, faces.Extent()+1):
            face = base.TopoDS.Face_s(faces.FindKey(i))
            if any(edge.IsSame(e) for e in edges_of(face)):
                adjacent.append(face)
        if len(adjacent) == 2:
            for t in [.1, .25, .5, .75, .9]:
                normals, positions = [], []
                for face in adjacent:
                    first, last = BRep_Tool.Range_s(edge, face)
                    pcurve = BRep_Tool.CurveOnSurface_s(edge, face, first, last)
                    uv = pcurve.Value(first+(last-first)*t)
                    surface = BRep_Tool.Surface_s(face)
                    p, du, dv = base.gp_Pnt(), gp_Vec(), gp_Vec()
                    surface.D1(uv.X(), uv.Y(), p, du, dv)
                    n = du.Crossed(dv)
                    if n.Magnitude() < 1e-12:
                        normals.append(None)
                    else:
                        n.Normalize(); normals.append([n.X(), n.Y(), n.Z()])
                    positions.append([p.X(), p.Y(), p.Z()])
                angle = math.degrees(math.acos(min(1, abs(sum(a*b for a, b in zip(*normals)))))) if all(n is not None for n in normals) else None
                gap = math.dist(*positions)
                seams.append(dict(pcurveFraction=t, positions=positions, normals=normals, angleDeg=angle, gapMm=gap))
    radius_ok = bool(curvatures) and all(row['radius'] is not None and abs(row['radius']-.5) <= .01 for row in curvatures)
    bottom_ok = bool(bottom_edges) and len(bottom_faces) == 1 and abs(bottom_faces[0]['area']-296*math.pi) <= .01
    for name, verdict, evidence in [('radius', radius_ok, dict(principalCurvatureRadii=curvatures, radiusToleranceMm=.01)),
                                  ('rimScope', both and radius_ok and bottom_ok and all(row['point'][2] > 15 for row in curvatures), common),
                                  ('bottomPreserved', bottom_ok, dict(bottomHoleEdges=bottom_edges, bottomFaces=bottom_faces, expectedArea=296*math.pi)),
                                  ('continuity', bool(seams) and all(row['angleDeg'] is not None and row['angleDeg'] <= .1 and row['gapMm'] <= .05 for row in seams), dict(seams=seams, toleranceDeg=.1))]:
        geometry['checks'][name] = dict(checkerId='ocp-detail-'+name+'-1', **{'pass': verdict}, evidence=evidence)
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=['S11', 'S12'], required=True)
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
