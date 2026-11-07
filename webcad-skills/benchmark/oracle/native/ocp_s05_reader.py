"""Independent radial-plane S05 measurements and separately built references."""
import argparse
import json
import math
from pathlib import Path
import ocp_reader as base
import s05_math as oracle
from ocp_s04_reader import shell, distance
from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakePolygon
from OCP.BRepAlgoAPI import BRepAlgoAPI_Section, BRepAlgoAPI_Check
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepTools import BRepTools
from OCP.BRepClass import BRepClass_FaceClassifier
from OCP.TopAbs import TopAbs_EDGE
from OCP.gp import gp_Pln, gp_Pnt2d


def reference(variant='reference'):
    if variant not in ('reference', 'area-preserving-size', 'twisted-middle', 'wrong-path'):
        raise ValueError('S05_REFERENCE_VARIANT_NOT_IMPLEMENTED')
    loft = BRepOffsetAPI_ThruSections(True, False, 1e-7);loft.SetMaxDegree(3);loft.CheckCompatibility(False)
    for i in range(33):
        t = i/32;wire = BRepBuilderAPI_MakePolygon()
        for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            wire.Add(base.gp_Pnt(*oracle.point(t, u, v, radius=19 if variant == 'wrong-path' else 20, area_preserving_width=variant == 'area-preserving-size', twist=variant == 'twisted-middle')))
        wire.Close();loft.AddWire(wire.Wire())
    loft.Build()
    if not loft.IsDone():
        raise ValueError('S05_REFERENCE_LOFT_FAILED')
    return loft.Shape()


def section(shape, t):
    frame = oracle.frame(t)
    operation = BRepAlgoAPI_Section(shape, gp_Pln(base.gp_Pnt(*frame['center']), base.gp_Dir(*frame['normal'])), False);operation.Approximation(True);operation.Build()
    if not operation.IsDone():
        return dict(available=False, t=t)
    points = [];explorer = base.TopExp_Explorer(operation.Shape(), TopAbs_EDGE)
    while explorer.More():
        edge = base.TopoDS.Edge_s(explorer.Current());explorer.Next();curve = BRepAdaptor_Curve(edge);a, b = curve.FirstParameter(), curve.LastParameter()
        for i in range(33):
            point = curve.Value(a+(b-a)*i/32);points.append([point.X(), point.Y(), point.Z()])
    return oracle.measure(points, t)


def inspect(shape):
    solids = base.TopTools_IndexedMapOfShape();base.TopExp.MapShapes_s(shape, base.TopAbs_SOLID, solids)
    valid = base.BRepCheck_Analyzer(shape, True).IsValid()
    geometry = dict(reader=dict(independent=True, source='independent radial-plane intersections and analytic varying rectangle field', version=base.OCP.__version__, sharedKernelFamily=True, algorithmIndependence=False),
                    brepValid=valid, units='mm', targetType='solid' if solids.Extent() else 'surface', solidCount=solids.Extent(), volume=base.volume(shape), bounds=base.bounds(shape), checks={}, sections=[])
    if not valid or solids.Extent() != 1:
        return geometry
    solid = base.TopoDS.Solid_s(solids.FindKey(1));frames = [section(solid, t) for t in oracle.STATIONS]
    geometry['sections'] = [{key: frame.get(key) for key in ('t', 'angleDeg', 'radius', 'width', 'height')} for frame in frames]
    target_boundary, boundary = shell(reference()), shell(solid);actual_samples = []
    explorer = base.TopExp_Explorer(solid, base.TopAbs_FACE)
    while explorer.More():
        face = base.TopoDS.Face_s(explorer.Current());explorer.Next();surface = base.BRepAdaptor_Surface(face, True);u0, u1, v0, v1 = BRepTools.UVBounds_s(face)
        for i in range(5):
            for j in range(5):
                u, v = u0+(u1-u0)*i/4, v0+(v1-v0)*j/4
                if BRepClass_FaceClassifier(face, gp_Pnt2d(u, v), 1e-7).State() not in (base.TopAbs_IN, base.TopAbs_ON):
                    continue
                point = surface.Value(u, v);actual_samples.append(distance((point.X(), point.Y(), point.Z()), target_boundary))
    expected_samples = []
    for i in range(13):
        t = i/12
        for u in (-1, 0, 1):
            for v in (-1, 1):
                expected_samples.append(distance(oracle.point(t, u, v), boundary))
        for v in (-1, 0, 1):
            for u in (-1, 1):
                expected_samples.append(distance(oracle.point(t, u, v), boundary))
    frame_ok = all(f.get('available') and abs(f['centerZ']) <= .01 and f['rectangleResidualMm'] <= .05 and f['planeResidualMm'] <= .01 for f in frames)
    checked = BRepAlgoAPI_Check(solid, True, True).IsValid()
    geometry['checks']['connected'] = dict(checkerId='ocp-s05-varying-radial-rectangle-1', **{'pass': bool(valid and checked and frame_ok and actual_samples and max(actual_samples) <= .05 and max(expected_samples) <= .05)}, evidence=dict(
        frames=frames, maxActualToReferenceMm=max(actual_samples, default=None), maxReferenceToActualMm=max(expected_samples), boundaryToleranceMm=.05,
        selfInterferenceChecked=True, selfInterferenceValid=checked, referenceVolumeMm3=oracle.volume(), sharedKernelFamily=True, continuousMaximumErrorCertified=False))
    return geometry


def main():
    parser = argparse.ArgumentParser(description=__doc__);parser.add_argument('--case', choices=['S05'], required=True);parser.add_argument('--input');parser.add_argument('--write-reference');parser.add_argument('--variant', default='reference');parser.add_argument('--report', required=True);args = parser.parse_args()
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
            report = dict(recordType='REFERENCE_OR_NEGATIVE_FIXTURE', caseId='S05', variant=args.variant, geometry=inspect(shape))
        if args.input:
            reader = base.STEPControl_Reader()
            if reader.ReadFile(args.input) != base.IFSelect_RetDone:
                raise ValueError('STEP_PARSE_FAILED')
            lengths, angles, solid_angles = (base.TColStd_SequenceOfAsciiString() for _ in range(3));reader.FileUnits(lengths, angles, solid_angles);reader.SetSystemLengthUnit(1.0)
            if reader.TransferRoots() < 1:
                raise ValueError('STEP_TRANSFER_FAILED')
            report = dict(recordType='INDEPENDENT_STEP_GEOMETRY_OBSERVATION', caseId='S05', normalizedLengthUnit='mm', sourceLengthUnits=[lengths.Value(i).ToCString() for i in range(1, lengths.Length()+1)], geometry=inspect(reader.OneShape()))
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
