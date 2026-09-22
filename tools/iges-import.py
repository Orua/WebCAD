#!/usr/bin/env python3
import argparse, hashlib, json
from pathlib import Path
from OCP.IGESControl import IGESControl_Reader
from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer
from OCP.IFSelect import IFSelect_RetDone
from OCP.BRepTools import BRepTools
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_SHELL, TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer

MAX_BYTES = 20 * 1024 * 1024

def count(shape, kind):
    ex = TopExp_Explorer(shape, kind); total = 0
    while ex.More(): total += 1; ex.Next()
    return total

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--input', type=Path, required=True); ap.add_argument('--brep', type=Path, required=True); ap.add_argument('--step', type=Path, required=True); ap.add_argument('--result', type=Path, required=True)
    args = ap.parse_args()
    if not args.input.is_file() or args.input.stat().st_size > MAX_BYTES: raise ValueError('IGES 文件不存在或超过 20 MiB')
    reader = IGESControl_Reader()
    if reader.ReadFile(str(args.input)) != IFSelect_RetDone: raise ValueError('IGES 读取失败')
    reader.TransferRoots()
    shape = reader.OneShape()
    if shape.IsNull(): raise ValueError('IGES 转换为空形体')
    face_count = count(shape, TopAbs_FACE)
    if face_count <= 0: raise ValueError('IGES 转换未生成面')
    args.brep.parent.mkdir(parents=True, exist_ok=True); BRepTools.Write_s(shape, str(args.brep))
    writer = STEPControl_Writer()
    if writer.Transfer(shape, STEPControl_AsIs) != IFSelect_RetDone: raise ValueError('STEP Transfer 失败')
    if writer.Write(str(args.step)) != IFSelect_RetDone: raise ValueError('STEP 写出失败')
    gs = reader.IGESModel().GlobalSection()
    result = {'ok': True, 'format': 'iges', 'unit': gs.UnitName().ToCString(), 'sha256': hashlib.sha256(args.input.read_bytes()).hexdigest(), 'topology': {'faces': face_count, 'edges': count(shape, TopAbs_EDGE), 'edgeCountMeaning': 'TopExp occurrence count; shared edges may repeat', 'shells': count(shape, TopAbs_SHELL), 'solids': count(shape, TopAbs_SOLID)}, 'brepBytes': args.brep.stat().st_size, 'stepBytes': args.step.stat().st_size, 'entityStatus': 'raw transfer; no healing or sewing'}
    args.result.write_text(json.dumps(result, ensure_ascii=False), encoding='utf8')

if __name__ == '__main__':
    try: main()
    except Exception as exc: print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False)); raise
