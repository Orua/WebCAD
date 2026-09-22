#!/usr/bin/env python3
"""Inspect and extract reviewed vector-logo windows for WebCAD.

This deliberately supports a conservative subset of SVG, PDF-compatible AI,
PDF, DXF, and DWG. It never substitutes fonts or repairs malformed CAD input.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

MAX_PATHS = 10_000
MAX_POINTS = 100_000
MAX_REGIONS = 150
MAX_RING_POINTS = 2_000
MAX_TOTAL_RING_POINTS = 12_000
FLATNESS_MM = 0.005
ENDPOINT_JOIN_MM = 1e-7
PDF_MM_PER_POINT = 25.4 / 72.0
SVG_MM_PER_CSS_PX = 25.4 / 96.0


class ImportFailure(ValueError):
    """An actionable, user-facing input or geometry error."""


@dataclass
class PathItem:
    points: list[tuple[float, float]]
    closed: bool
    filled: bool = True
    fill_rule: str = "evenodd"
    group: str = "default"
    kind: str = "vector"
    source_z: float | None = None


@dataclass
class DocumentGeometry:
    paths: list[PathItem] = field(default_factory=list)
    bounds: list[float] | None = None
    page_count: int = 1
    unit_label: str = "unitless"
    suggested_scale: float = 1.0
    text_bounds: list[list[float]] = field(default_factory=list)
    image_bounds: list[list[float]] = field(default_factory=list)
    unsupported_bounds: list[list[float]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _finite_number(value: Any, label: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ImportFailure(f"{label} 必须是有限数字") from None
    if not math.isfinite(result):
        raise ImportFailure(f"{label} 必须是有限数字")
    return result


def _bounds(value: Any, label: str = "bounds") -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ImportFailure(f"{label} 必须为 [xmin,ymin,xmax,ymax]")
    result = [_finite_number(v, label) for v in value]
    if result[0] >= result[2] or result[1] >= result[3]:
        raise ImportFailure(f"{label} 的 xmin/ymin 必须小于 xmax/ymax")
    return result


def _rect_from_xy(points: list[tuple[float, float]]) -> list[float] | None:
    if not points:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def _rect_intersects(a: list[float], b: list[float]) -> bool:
    return a[0] <= b[2] and a[2] >= b[0] and a[1] <= b[3] and a[3] >= b[1]


def _add_path(doc: DocumentGeometry, item: PathItem) -> None:
    if len(item.points) < 2:
        return
    doc.paths.append(item)
    if len(doc.paths) > MAX_PATHS or sum(len(p.points) for p in doc.paths) > MAX_POINTS:
        raise ImportFailure("文件几何过于复杂：超过 10000 条路径或 100000 个采样点")


def _merge_bounds(doc: DocumentGeometry) -> None:
    all_points = [p for path in doc.paths for p in path.points]
    doc.bounds = _rect_from_xy(all_points) or doc.bounds


def _svg_length(text: str) -> tuple[float, str]:
    match = re.fullmatch(r"\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(px|mm|cm|in|pt|pc)?\s*", text)
    if not match:
        raise ImportFailure(f"SVG 长度单位暂不支持：{text!r}")
    return float(match.group(1)), match.group(2) or "px"


def _length_mm(text: str) -> float:
    value, unit = _svg_length(text)
    return value * {"px": SVG_MM_PER_CSS_PX, "mm": 1.0, "cm": 10.0,
                    "in": 25.4, "pt": 25.4 / 72.0, "pc": 25.4 / 6.0}[unit]


def _mat_mul(a: tuple[float, ...], b: tuple[float, ...]) -> tuple[float, ...]:
    # SVG affine matrix [a,b,c,d,e,f], composed as a(b(point)).
    aa, ab, ac, ad, ae, af = a
    ba, bb, bc, bd, be, bf = b
    return (aa * ba + ac * bb, ab * ba + ad * bb,
            aa * bc + ac * bd, ab * bc + ad * bd,
            aa * be + ac * bf + ae, ab * be + ad * bf + af)


def _svg_transform(text: str) -> tuple[float, ...]:
    result = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    consumed = ""
    for name, args_text in re.findall(r"([A-Za-z]+)\s*\(([^)]*)\)", text):
        nums = [float(v) for v in re.findall(r"[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?", args_text)]
        if name == "matrix" and len(nums) == 6:
            local = tuple(nums)
        elif name == "translate" and len(nums) in (1, 2):
            local = (1, 0, 0, 1, nums[0], nums[1] if len(nums) == 2 else 0)
        elif name == "scale" and len(nums) in (1, 2):
            local = (nums[0], 0, 0, nums[1] if len(nums) == 2 else nums[0], 0, 0)
        elif name == "rotate" and len(nums) in (1, 3):
            theta = math.radians(nums[0]); co = math.cos(theta); si = math.sin(theta)
            rot = (co, si, -si, co, 0, 0)
            if len(nums) == 3:
                x, y = nums[1:]
                local = _mat_mul(_mat_mul((1, 0, 0, 1, x, y), rot), (1, 0, 0, 1, -x, -y))
            else:
                local = rot
        elif name == "skewX" and len(nums) == 1:
            local = (1, 0, math.tan(math.radians(nums[0])), 1, 0, 0)
        elif name == "skewY" and len(nums) == 1:
            local = (1, math.tan(math.radians(nums[0])), 0, 1, 0, 0)
        else:
            raise ImportFailure(f"SVG transform 参数无效或不支持：{name}({args_text})")
        result = _mat_mul(result, local)
    parsed = re.sub(r"[\s,]+", "", re.sub(r"[A-Za-z]+\s*\([^)]*\)", "", text))
    if parsed or not re.search(r"[A-Za-z]+\s*\([^)]*\)", text):
        raise ImportFailure("SVG transform 语法无效")
    return result


def _xy(matrix: tuple[float, ...], x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = matrix
    return a * x + c * y + e, b * x + d * y + f


def _segment_points(segment: Any, tolerance: float) -> list[tuple[float, float]]:
    start, end = segment.point(0), segment.point(1)
    points = [(float(start.x), float(start.y))]

    def distance_to_chord(p: Any, a: Any, b: Any) -> float:
        dx, dy = b.x - a.x, b.y - a.y
        denom = dx * dx + dy * dy
        if denom <= 1e-30:
            return math.hypot(p.x - a.x, p.y - a.y)
        t = max(0.0, min(1.0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / denom))
        return math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))

    def walk(t0: float, t1: float, p0: Any, p1: Any, depth: int) -> None:
        ts = (t0 + (t1 - t0) * 0.25, (t0 + t1) * 0.5, t0 + (t1 - t0) * 0.75)
        mids = [segment.point(t) for t in ts]
        error = max(distance_to_chord(p, p0, p1) for p in mids)
        if depth >= 20 and error > tolerance:
            raise ImportFailure("曲线过于复杂，无法在指定公差内展开")
        if error <= tolerance:
            points.append((float(p1.x), float(p1.y)))
            if len(points) > MAX_POINTS:
                raise ImportFailure("单条曲线路径展开后超过采样点限制")
            return
        tm = (t0 + t1) * 0.5
        pm = mids[1]
        walk(t0, tm, p0, pm, depth + 1)
        walk(tm, t1, pm, p1, depth + 1)

    walk(0, 1, start, end, 0)
    return points


def _svg_geometry(path: Path, name: str, requested_scale: float | None = None) -> DocumentGeometry:
    data = path.read_bytes()
    if len(data) > 20 * 1024 * 1024:
        raise ImportFailure("SVG 超过 20 MiB 限制")
    if re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", data, re.I):
        raise ImportFailure("SVG 禁止 DOCTYPE/实体声明（外部实体与网络解析已禁用）")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ImportFailure(f"SVG XML 无法严格解析：{exc}") from None
    local = lambda tag: tag.rsplit("}", 1)[-1]
    forbidden = {"script", "image", "use", "foreignObject", "mask", "clipPath", "filter", "feGaussianBlur", "feBlend"}
    for elem in root.iter():
        tag = local(elem.tag)
        if tag in forbidden:
            label = "剪裁/蒙版/滤镜" if tag in {"mask", "clipPath", "filter", "feGaussianBlur", "feBlend"} else "script/image/use 外部或嵌入内容"
            raise ImportFailure(f"SVG 含不支持的 {label}（<{tag}>）；请先转为纯路径")
        for attr, value in elem.attrib.items():
            attr_name = local(attr).lower()
            if attr_name.startswith("on") or attr_name in {"href", "src"}:
                raise ImportFailure("SVG 禁止脚本事件与外部引用")
            if attr_name in {"clip-path", "mask", "filter"} and value.strip() not in ("", "none"):
                raise ImportFailure(f"SVG 的 {attr_name} 需要精确剪裁，暂不支持")
            if attr_name == "class":
                raise ImportFailure("SVG CSS class 样式解析暂不支持；请内联 fill/fill-rule")
        if tag == "style":
            raise ImportFailure("SVG 外部/嵌入 CSS 样式解析暂不支持；请内联 fill/fill-rule")

    viewbox_text = root.attrib.get("viewBox") or root.attrib.get("viewbox")
    viewbox = None
    if viewbox_text:
        values = [float(v) for v in re.findall(r"[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?", viewbox_text)]
        if len(values) != 4 or values[2] <= 0 or values[3] <= 0:
            raise ImportFailure("SVG viewBox 必须包含有效的 xmin,ymin,width,height")
        viewbox = values
    width_mm = _length_mm(root.attrib["width"]) if root.attrib.get("width", "").strip() and "%" not in root.attrib["width"] else None
    height_mm = _length_mm(root.attrib["height"]) if root.attrib.get("height", "").strip() and "%" not in root.attrib["height"] else None
    if viewbox:
        scale_x = width_mm / viewbox[2] if width_mm is not None else SVG_MM_PER_CSS_PX
        scale_y = height_mm / viewbox[3] if height_mm is not None else SVG_MM_PER_CSS_PX
        if abs(scale_x - scale_y) > max(scale_x, scale_y) * 1e-6:
            raise ImportFailure("SVG viewBox 的 X/Y 物理比例不同，无法用一个 mmPerUnit 保真导入")
        suggested = (scale_x + scale_y) / 2
        unit = "SVG viewBox user units"
    else:
        suggested = SVG_MM_PER_CSS_PX
        unit = "SVG CSS px (96 dpi)"

    try:
        import svgelements
    except ImportError:
        raise ImportFailure("缺少 svgelements；请在服务端 Python 环境安装 svgelements") from None

    doc = DocumentGeometry(unit_label=unit, suggested_scale=suggested)
    svg_ns = "{http://www.w3.org/2000/svg}"
    geometry_tags = {"path", "polygon", "polyline", "rect", "circle", "ellipse", "line"}
    geom_index = 0

    def style_attrs(elem: ET.Element, inherited: dict[str, str]) -> dict[str, str]:
        result = dict(inherited)
        for key in ("fill", "fill-rule", "stroke", "display"):
            if key in elem.attrib:
                result[key] = elem.attrib[key]
        inline = elem.attrib.get("style", "")
        if inline:
            for declaration in inline.split(";"):
                if not declaration.strip():
                    continue
                if ":" not in declaration:
                    raise ImportFailure("SVG inline style 语法无效")
                key, value = [v.strip() for v in declaration.split(":", 1)]
                if key not in {"fill", "fill-rule", "stroke", "display"}:
                    raise ImportFailure(f"SVG inline CSS 属性 {key!r} 暂不支持")
                result[key] = value
        return result

    def walk(elem: ET.Element, parent_matrix: tuple[float, ...], inherited: dict[str, str]) -> None:
        nonlocal geom_index
        tag = local(elem.tag)
        matrix = parent_matrix
        if elem.attrib.get("transform"):
            matrix = _mat_mul(parent_matrix, _svg_transform(elem.attrib["transform"]))
        style = style_attrs(elem, inherited)
        if style.get("display", "").strip().lower() == "none":
            return
        if tag in geometry_tags:
            fill = style.get("fill", "black").strip().lower()
            fill_rule = style.get("fill-rule", "nonzero").strip().lower()
            stroke = style.get("stroke", "none").strip().lower()
            has_stroke = stroke not in {"none", "transparent"}
            if fill_rule not in {"nonzero", "evenodd"}:
                raise ImportFailure(f"SVG fill-rule 不支持：{fill_rule}")
            if tag == "path":
                try:
                    parsed = svgelements.Path(elem.attrib.get("d", ""))
                except Exception as exc:
                    raise ImportFailure(f"SVG path 无法严格解析：{exc}") from None
                subpaths = list(parsed.as_subpaths())
                for subpath in subpaths:
                    points: list[tuple[float, float]] = []
                    closed = False
                    for seg in subpath.segments(transformed=False):
                        if isinstance(seg, svgelements.Move):
                            if seg.end is not None:
                                p = (float(seg.end.x), float(seg.end.y))
                                points.append(p)
                        elif isinstance(seg, svgelements.Close):
                            closed = True
                            if seg.end is not None:
                                points.append((float(seg.end.x), float(seg.end.y)))
                        else:
                            matrix_scale=max(math.hypot(matrix[0],matrix[1])+math.hypot(matrix[2],matrix[3]),1e-12)
                            effective_scale=requested_scale or suggested
                            sampled = _segment_points(seg, max(1e-10, FLATNESS_MM / max(effective_scale*matrix_scale, 1e-12)))
                            if points and math.dist(points[-1], sampled[0]) < 1e-9:
                                points.extend(sampled[1:])
                            else:
                                points.extend(sampled)
                    points = [_xy(matrix, x, y) for x, y in points]
                    # The SVG y-down axis becomes WebCAD y-up. Keep viewBox/user units.
                    points = [(x, -y) for x, y in points]
                    _add_path(doc, PathItem(points, closed, fill not in {"none", "transparent"}, fill_rule, f"svg-{geom_index}", "stroked" if has_stroke else "fill"))
                geom_index += 1
            else:
                if tag in {"polygon", "polyline"}:
                    nums = [float(v) for v in re.findall(r"[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?", elem.attrib.get("points", ""))]
                    if len(nums) < 4 or len(nums) % 2:
                        raise ImportFailure(f"SVG <{tag}> points 坐标无效")
                    points = list(zip(nums[::2], nums[1::2]))
                    closed = tag == "polygon"
                elif tag == "rect":
                    x = float(elem.attrib.get("x", 0)); y = float(elem.attrib.get("y", 0))
                    w = float(elem.attrib.get("width", 0)); h = float(elem.attrib.get("height", 0))
                    if w <= 0 or h <= 0:
                        raise ImportFailure("SVG rect 宽高必须大于零")
                    if float(elem.attrib.get("rx", 0) or 0) or float(elem.attrib.get("ry", 0) or 0):
                        raise ImportFailure("SVG 圆角 rect 暂不支持；请转为 path")
                    points = [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]; closed = True
                elif tag in {"circle", "ellipse"}:
                    cx = float(elem.attrib.get("cx", 0)); cy = float(elem.attrib.get("cy", 0))
                    rx = float(elem.attrib.get("r", 0)) if tag == "circle" else float(elem.attrib.get("rx", 0))
                    ry = rx if tag == "circle" else float(elem.attrib.get("ry", 0))
                    if rx <= 0 or ry <= 0:
                        raise ImportFailure(f"SVG <{tag}> 半径必须大于零")
                    scale = math.hypot(matrix[0], matrix[1])+math.hypot(matrix[2], matrix[3])
                    effective_scale=requested_scale or suggested
                    n = max(16, min(50_000, int(math.ceil(math.pi * math.sqrt(max(rx, ry) * scale / max(2 * FLATNESS_MM / max(effective_scale, 1e-9), 1e-9))))))
                    points = [(cx + rx * math.cos(i * math.tau / n), cy + ry * math.sin(i * math.tau / n)) for i in range(n)]
                    closed = True
                else:
                    x1=float(elem.attrib.get("x1",0)); y1=float(elem.attrib.get("y1",0)); x2=float(elem.attrib.get("x2",0)); y2=float(elem.attrib.get("y2",0))
                    points=[(x1,y1),(x2,y2)]; closed=False
                points = [_xy(matrix, x, y) for x, y in points]
                points = [(x, -y) for x, y in points]
                _add_path(doc, PathItem(points, closed, fill not in {"none", "transparent"}, fill_rule, f"svg-{geom_index}", "stroked" if has_stroke else "fill"))
                geom_index += 1
        # These SVG structural elements are harmless in the accepted subset.
        if tag == "defs":
            return
        if tag not in {"svg", "g", "defs", "title", "desc", "metadata", "path", "polygon", "polyline", "rect", "circle", "ellipse", "line"}:
            raise ImportFailure(f"SVG 元素 <{tag}> 暂不支持，无法保证轮廓完整")
        for child in list(elem):
            walk(child, matrix, style)

    walk(root, (1, 0, 0, 1, 0, 0), {"fill": "black", "fill-rule": "nonzero", "stroke": "none"})
    _merge_bounds(doc)
    if viewbox:
        x, y, w, h = viewbox
        doc.bounds = doc.bounds or [x, -y-h, x+w, -y]
    if not doc.paths:
        doc.warnings.append("SVG 中没有可读取的矢量路径；文字与图片不会被当作 logo")
    return doc


def _pdf_geometry(path: Path, page_num: int, requested_scale: float | None = None) -> DocumentGeometry:
    try:
        import pymupdf as fitz
    except ImportError:
        raise ImportFailure("缺少 PyMuPDF；请在服务端 Python 环境安装 PyMuPDF") from None
    try:
        pdf = fitz.open(path)
    except Exception as exc:
        raise ImportFailure(f"PDF/AI 兼容文件无法读取：{exc}") from None
    try:
        if pdf.is_encrypted:
            raise ImportFailure("加密 PDF 暂不支持")
        if page_num < 1 or page_num > pdf.page_count:
            raise ImportFailure(f"PDF 页码超出范围：文件共 {pdf.page_count} 页")
        page = pdf[page_num - 1]
        if page.rotation != 0:
            raise ImportFailure("PDF 页面 rotation 非 0；请先另存为无旋转页面")
        if not page.cropbox.is_empty and (abs(page.cropbox.x0 - page.mediabox.x0) > 1e-5 or abs(page.cropbox.y0 - page.mediabox.y0) > 1e-5 or abs(page.cropbox.x1 - page.mediabox.x1) > 1e-5 or abs(page.cropbox.y1 - page.mediabox.y1) > 1e-5):
            raise ImportFailure("PDF cropbox 与 mediabox 不同；请先裁切并另存页面")
        doc = DocumentGeometry(page_count=pdf.page_count, unit_label="PDF point (1/72 inch)", suggested_scale=PDF_MM_PER_POINT,
                               bounds=[0.0, 0.0, float(page.rect.width), float(page.rect.height)])
        try:
            extended = page.get_drawings(extended=True)
        except TypeError:
            extended = page.get_drawings()
        if any(str(item.get("type", "")).startswith("clip") for item in extended):
            raise ImportFailure("PDF 页面含 clipping path；暂不支持复杂剪裁，请先展开为无剪裁矢量")
        drawings = [d for d in extended if d.get("type") in {"f", "s", "fs", None} and "items" in d]
        for idx, drawing in enumerate(drawings):
            fill = drawing.get("fill") is not None
            stroke = drawing.get("color") is not None
            if not fill and not stroke:
                continue
            subpaths: list[list[tuple[float, float]]] = []
            active: list[tuple[float, float]] = []

            def flush() -> None:
                nonlocal active
                if len(active) >= 2:
                    subpaths.append(active)
                active = []

            for item in drawing.get("items", []):
                kind = item[0]
                if kind == "l":
                    a, b = item[1], item[2]
                    start=(float(a.x), float(a.y)); end=(float(b.x), float(b.y))
                    if active and math.dist(active[-1], start) > 1e-5:
                        flush()
                    if not active: active.append(start)
                    active.append(end)
                elif kind == "c":
                    a, c1, c2, b = item[1:]
                    start=(float(a.x), float(a.y))
                    if active and math.dist(active[-1], start) > 1e-5: flush()
                    if not active: active.append(start)
                    # Reuse svgelements' cubic segment parser for deterministic flatness.
                    try:
                        seg = __import__("svgelements").CubicBezier(start, (c1.x,c1.y), (c2.x,c2.y), (b.x,b.y))
                        sampled = _segment_points(seg, max(1e-10, FLATNESS_MM / (requested_scale or PDF_MM_PER_POINT)))
                    except Exception as exc:
                        raise ImportFailure(f"PDF cubic 曲线无法展开：{exc}") from None
                    active.extend(sampled[1:])
                elif kind == "re":
                    flush(); r=item[1]
                    rectangle=[(float(r.x0),float(r.y0)),(float(r.x1),float(r.y0)),(float(r.x1),float(r.y1)),(float(r.x0),float(r.y1))]
                    if len(item)>2 and item[2]<0:rectangle.reverse()
                    subpaths.append(rectangle)
                elif kind == "qu":
                    flush(); q=item[1]
                    subpaths.append([(float(p.x),float(p.y)) for p in [q.ul,q.ur,q.lr,q.ll]])
                else:
                    raise ImportFailure(f"PDF 绘图命令 {kind!r} 暂不支持，无法保证轮廓完整")
            flush()
            if not subpaths:
                continue
            closed = bool(drawing.get("closePath")) or fill
            if stroke and not fill and not closed:
                for pts in subpaths:
                    pts=[(x, float(page.rect.height)-y) for x,y in pts]
                _add_path(doc, PathItem(pts, False, False, "evenodd", f"pdf-{idx}", "stroke"))
                continue
            for pts in subpaths:
                # PDF fill implicitly closes subpaths; stroke-only closed shapes are outline mode.
                pts=[(x, float(page.rect.height)-y) for x,y in pts]
                _add_path(doc, PathItem(pts, closed, fill, "evenodd" if drawing.get("even_odd", False) else "nonzero", f"pdf-{idx}", "stroked" if stroke else "fill"))

        text_data = page.get_text("dict")
        for block in text_data.get("blocks", []):
            if block.get("type") == 0:
                rect = block.get("bbox")
                if rect:
                    x0,y0,x1,y1 = map(float, rect)
                    doc.text_bounds.append([x0, float(page.rect.height)-y1, x1, float(page.rect.height)-y0])
            elif block.get("type") == 1 and block.get("bbox"):
                x0,y0,x1,y1=map(float,block["bbox"])
                doc.image_bounds.append([x0,float(page.rect.height)-y1,x1,float(page.rect.height)-y0])
        # get_text may omit image placements; also inspect image resources and their actual rectangles.
        for image in page.get_images(full=True):
            for rect in page.get_image_rects(image):
                x0,y0,x1,y1=map(float,rect)
                candidate=[x0,float(page.rect.height)-y1,x1,float(page.rect.height)-y0]
                if candidate not in doc.image_bounds:
                    doc.image_bounds.append(candidate)
        _merge_bounds(doc)
        if doc.bounds is None:
            doc.bounds=[0.0,0.0,float(page.rect.width),float(page.rect.height)]
        if doc.text_bounds:
            doc.warnings.append("PDF 页面含文本；仅可导入已转曲的闭合路径")
        if doc.image_bounds:
            doc.warnings.append("PDF 页面含嵌入图片；扫描位图不会被当作矢量 logo")
        if not doc.paths:
            doc.warnings.append("此 PDF 页没有可读取的矢量路径；可切换页码检查其他页面")
        return doc
    finally:
        pdf.close()


def _dxf_geometry(path: Path, requested_scale: float | None = None) -> DocumentGeometry:
    try:
        import ezdxf
        from ezdxf import disassemble, path as dxfpath, bbox as dxfbbox
    except ImportError:
        raise ImportFailure("缺少 ezdxf；请在服务端 Python 环境安装 ezdxf") from None
    from shapely.geometry import LineString
    try:
        drawing = ezdxf.readfile(path)
    except Exception as exc:
        raise ImportFailure(f"DXF 严格解析失败（未尝试修复）：{exc}") from None
    unit_code = int(drawing.header.get("$INSUNITS", 0) or 0)
    unit_factors = {0:("DXF unitless",1.0),1:("DXF inch",25.4),2:("DXF foot",304.8),4:("DXF mm",1.0),5:("DXF cm",10.0),6:("DXF m",1000.0),7:("DXF km",1_000_000.0),8:("DXF microinch",0.0000254),9:("DXF mil",0.0254),10:("DXF yard",914.4),11:("DXF angstrom",1e-7),12:("DXF nm",1e-6),13:("DXF micron",0.001),14:("DXF dm",100.0),15:("DXF dam",10_000.0),16:("DXF hm",100_000.0),17:("DXF Gm",1e12),18:("DXF AU",149_597_870_700_000.0)}
    unit, suggestion = unit_factors.get(unit_code, (f"DXF INSUNITS {unit_code} (unknown)", 1.0))
    doc = DocumentGeometry(unit_label=unit, suggested_scale=suggestion)
    try:
        entities = list(disassemble.recursive_decompose(drawing.modelspace()))
    except Exception as exc:
        raise ImportFailure(f"DXF block/INSERT 展开失败（未修复源图）：{exc}") from None
    supported = {"LINE","ARC","CIRCLE","LWPOLYLINE","POLYLINE","SPLINE","ELLIPSE"}
    for index, entity in enumerate(entities):
        kind = entity.dxftype()
        if kind in {"TEXT","MTEXT","ATTRIB","ATTDEF"}:
            try:
                insert = entity.dxf.insert
                x,y=float(insert.x),float(insert.y)
                height=float(entity.dxf.get("height", entity.dxf.get("char_height", 1.0)) or 1.0)
                text = entity.plain_text() if kind == "MTEXT" else entity.dxf.get("text", "")
                width=max(height * 0.55 * max(1,len(str(text))), height)
                angle=math.radians(float(entity.dxf.get("rotation",0) or 0))
                corners=[(x,y),(x+width*math.cos(angle),y+width*math.sin(angle)),(x-height*math.sin(angle),y+height*math.cos(angle)),(x+width*math.cos(angle)-height*math.sin(angle),y+width*math.sin(angle)+height*math.cos(angle))]
                rect=_rect_from_xy(corners)
                if rect: doc.text_bounds.append(rect)
            except Exception:
                pass
            continue
        if kind == "IMAGE":
            try:
                insert=entity.dxf.insert; u=entity.dxf.u_pixel; v=entity.dxf.v_pixel; w,h=entity.dxf.image_size
                pts=[(insert.x,insert.y),(insert.x+u.x*w,insert.y+u.y*w),(insert.x+v.x*h,insert.y+v.y*h),(insert.x+u.x*w+v.x*h,insert.y+u.y*w+v.y*h)]
                rect=_rect_from_xy([(float(x),float(y)) for x,y in pts])
                if rect: doc.image_bounds.append(rect)
            except Exception:
                doc.image_bounds.append([-1e300,-1e300,1e300,1e300])
            continue
        if kind in supported:
            try:
                curve=dxfpath.make_path(entity)
                tolerance=FLATNESS_MM/max(requested_scale or suggestion,1e-12)
                points=list(curve.flattening(tolerance,segments=8))
                xy=[(float(p.x),float(p.y)) for p in points]
                if len(xy)>=2:
                    if max(p.z for p in points)-min(p.z for p in points)>1e-7/max(requested_scale or suggestion,1e-12):
                        raise ImportFailure('非 XY 平面的 CAD 曲线不能直接投影为 LOGO')
                    closed=bool(curve.is_closed)
                    _add_path(doc,PathItem(xy,closed,True,"evenodd", "dxf", kind,float(points[0].z)))
            except Exception as exc:
                try:
                    ext=dxfbbox.extents([entity]); doc.unsupported_bounds.append([ext.extmin.x,ext.extmin.y,ext.extmax.x,ext.extmax.y])
                except Exception:
                    doc.unsupported_bounds.append([-1e300,-1e300,1e300,1e300])
                doc.warnings.append(f"DXF 第 {index+1} 个 {kind} 实体未能展开：{exc}")
            continue
        # Non-geometry bookkeeping entities are ignored. Other physical geometry is
        # retained as an unknown extent so a selected window cannot silently lose it.
        if kind not in {"SEQEND","VERTEX","ENDBLK","BLOCK","DIMSTYLE","LAYER","STYLE","APPID","DICTIONARY","XRECORD","SUN","VIEWPORT","POINT","RAY","XLINE"}:
            try:
                ext=dxfbbox.extents([entity])
                if ext.has_data:
                    doc.unsupported_bounds.append([float(ext.extmin.x),float(ext.extmin.y),float(ext.extmax.x),float(ext.extmax.y)])
            except Exception:
                if kind in {"HATCH","SOLID","TRACE","3DFACE","MESH","REGION","BODY","3DSOLID"}:
                    doc.unsupported_bounds.append([-1e300,-1e300,1e300,1e300])
    _merge_bounds(doc)
    if unit_code == 0:
        doc.warnings.append("DXF $INSUNITS 为 unitless；mmPerUnit 必须由用户明确填写")
    return doc


def _convert_dwg(path: Path, work_dir: Path) -> Path:
    exe_text = os.environ.get("WEBCAD_DWG_CONVERTER", r"F:\金大福生产\agent\tools\libredwg\dwg2dxf.exe")
    exe = Path(exe_text)
    if not exe.is_file():
        raise ImportFailure(f"找不到本机 DWG 转换器：{exe}（可用 WEBCAD_DWG_CONVERTER 覆盖）")
    target = work_dir / (path.stem + ".dxf")
    command = [str(exe), "-v0", "-o", str(target), "-y", str(path)]
    kwargs: dict[str, Any] = {"capture_output": True, "text": True, "encoding": "utf-8", "errors": "replace", "timeout": 45}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        kwargs["startupinfo"] = subprocess.STARTUPINFO()
        kwargs["startupinfo"].dwFlags |= subprocess.STARTF_USESHOWWINDOW
        kwargs["startupinfo"].wShowWindow = subprocess.SW_HIDE
    try:
        result = subprocess.run(command, **kwargs)
    except subprocess.TimeoutExpired:
        raise ImportFailure("DWG 转换超过 45 秒上限") from None
    except OSError as exc:
        raise ImportFailure(f"无法启动 DWG 转换器：{exc}") from None
    if result.returncode != 0 or not target.is_file() or target.stat().st_size == 0:
        detail = (result.stderr or result.stdout or "无转换器错误详情")[-1200:]
        raise ImportFailure(f"DWG 转换失败（退出码 {result.returncode}）：{detail}")
    return target


def _read_document(source: Path, original_name: str, page: int, requested_scale: float | None = None) -> tuple[DocumentGeometry, str, Path | None]:
    suffix = Path(original_name).suffix.lower()
    converted = None
    if suffix == ".dwg":
        with tempfile.TemporaryDirectory(prefix="webcad-dwg-", dir=source.parent) as temporary:
            work_dir=Path(temporary)
            converted=_convert_dwg(source,work_dir)
            geometry=_dxf_geometry(converted,requested_scale)
            # Geometry is fully materialized; the ephemeral converted file is deleted below.
            return geometry, "dwg", converted
    if suffix == ".dxf":
        if page != 1: raise ImportFailure("DXF 只支持第 1 页")
        return _dxf_geometry(source,requested_scale), "dxf", None
    if suffix == ".svg":
        if page != 1: raise ImportFailure("SVG 只支持第 1 页")
        return _svg_geometry(source, original_name,requested_scale), "svg", None
    if suffix in {".pdf", ".ai"}:
        if suffix == ".ai" and not source.read_bytes()[:1024].lstrip().startswith(b"%PDF-"):
            raise ImportFailure("AI 仅支持 PDF-compatible 文件；旧 EPS/AI 请先另存为 SVG 或兼容 PDF")
        return _pdf_geometry(source, page,requested_scale), "pdf-compatible-ai" if suffix == ".ai" else "pdf", None
    raise ImportFailure("仅支持 SVG、PDF-compatible AI、PDF、DXF、DWG；旧 EPS AI 请先另存 SVG/兼容 PDF")


def _loops_to_regions(paths: list[PathItem], mm_per_unit: float) -> tuple[list[dict[str, Any]], tuple[float,float,float,float]]:
    from shapely.geometry import LineString, Polygon
    from shapely.ops import polygonize_full, unary_union
    if not paths:
        raise ImportFailure("选区内没有完整闭合的矢量轮廓")
    grouped: dict[str, list[PathItem]] = {}
    for item in paths:
        grouped.setdefault(item.group, []).append(item)
    all_regions = []
    for group, contours in grouped.items():
        rings = []
        signs = []
        if group == 'dxf':
            # CAD letters are normally a network of separate LINE/ARC/SPLINE
            # entities. Join only endpoint roundoff; never close each segment.
            tolerance = ENDPOINT_JOIN_MM / mm_per_unit
            buckets = {}
            lines = []
            for contour in contours:
                pts = list(contour.points)
                if contour.closed and pts[0] != pts[-1]:
                    pts.append(pts[0])
                for index in (0, -1):
                    point = pts[index]
                    cell = (math.floor(point[0]/tolerance), math.floor(point[1]/tolerance))
                    matches = [q for dx in (-1,0,1) for dy in (-1,0,1)
                               for q in buckets.get((cell[0]+dx,cell[1]+dy),[])
                               if math.dist(point,q) <= tolerance]
                    if matches:
                        pts[index] = min(matches,key=lambda q:math.dist(point,q))
                    else:
                        buckets.setdefault(cell,[]).append(point)
                lines.append(LineString(pts))
            polygons,cuts,dangles,invalid=polygonize_full(unary_union(lines))
            if any(not value.is_empty for value in (cuts,dangles,invalid)):
                raise ImportFailure("选区线段没有组成完整闭合轮廓；存在断口/多余线段，未自动补线")
            seen=set()
            for polygon in polygons.geoms:
                for boundary in [polygon.exterior,*polygon.interiors]:
                    ring=Polygon(boundary)
                    key=ring.normalize().wkb
                    if key not in seen:
                        rings.append(ring);signs.append(1);seen.add(key)
            fill_rule='evenodd'
        else:
            fill_rule=contours[0].fill_rule
            if any(item.fill_rule!=fill_rule for item in contours):
                raise ImportFailure("同一路径的填充规则不一致")
            for contour in contours:
                if not contour.filled or not contour.closed:
                    raise ImportFailure("所选图案含开放路径或未扩展的描边；请先转成闭合填充路径")
                pts=list(contour.points)
                if len(pts)>3 and math.dist(pts[0],pts[-1])<=ENDPOINT_JOIN_MM/mm_per_unit:
                    pts.pop()
                if len(pts)<3:
                    raise ImportFailure("闭合路径至少需要三个点")
                # Preserve the ORIGINAL directed paths. Polygonization changes
                # orientation and must never determine SVG/PDF nonzero winding.
                signed=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(pts,pts[1:]+pts[:1]))
                rings.append(Polygon(pts));signs.append(1 if signed>0 else -1)
        if not rings:
            raise ImportFailure("所选图案没有闭合区域")
        for i,ring in enumerate(rings):
            if not ring.is_valid or ring.area<=1e-14:
                raise ImportFailure("图案含自交或零面积轮廓")
            for other in rings[:i]:
                if ring.boundary.intersects(other.boundary):
                    raise ImportFailure("轮廓相交或相切；请先在原设计软件中合并/修正路径")
        parents=[[j for j,other in enumerate(rings) if j!=i and other.contains(ring)] for i,ring in enumerate(rings)]
        depths=[len(p) for p in parents]
        # 1 enters material, -1 leaves material (a hole), 0 does not change fill.
        roles=[]
        for i in range(len(rings)):
            if fill_rule=='evenodd':
                roles.append(1 if depths[i]%2==0 else -1)
            elif fill_rule=='nonzero':
                outside=sum(signs[j] for j in parents[i]);inside=outside+signs[i]
                roles.append(1 if outside==0 and inside!=0 else -1 if outside!=0 and inside==0 else 0)
            else:
                raise ImportFailure("不支持的填充规则")
        holes_by_outer={i:[] for i,role in enumerate(roles) if role==1}
        for i,role in enumerate(roles):
            if role!=-1:continue
            outers=[j for j in parents[i] if roles[j]==1]
            if not outers:raise ImportFailure("图案内孔缺少外轮廓")
            owner=max(outers,key=lambda j:depths[j]);holes_by_outer[owner].append(rings[i].exterior.coords)
        for i,holes in holes_by_outer.items():
            region=Polygon(rings[i].exterior.coords,holes)
            if not region.is_valid:raise ImportFailure("填充规则产生无效轮廓")
            all_regions.append(region)
    for i,region in enumerate(all_regions):
        if any(region.intersects(other) for other in all_regions[:i]):
            raise ImportFailure("不同填充图案重叠或相切；请先合并路径")
    if not all_regions:raise ImportFailure("没有可导入的填充区域")
    minx=min(p.bounds[0] for p in all_regions);miny=min(p.bounds[1] for p in all_regions)
    maxx=max(p.bounds[2] for p in all_regions);maxy=max(p.bounds[3] for p in all_regions)
    center=((minx+maxx)/2,(miny+maxy)/2)
    def points(ring):return [[round((x-center[0])*mm_per_unit,8),round((y-center[1])*mm_per_unit,8)] for x,y in list(ring.coords)[:-1]]
    result=[{'outer':points(p.exterior),'holes':[points(h) for h in p.interiors]} for p in all_regions]
    rings_out=[ring for region in result for ring in [region['outer'],*region['holes']]]
    if len(result)>MAX_REGIONS or any(len(r)>MAX_RING_POINTS for r in rings_out) or sum(map(len,rings_out))>MAX_TOTAL_RING_POINTS:
        raise ImportFailure("轮廓超过限制：150个区域、每环2000点、总计12000点")
    return result,(minx,miny,maxx,maxy)


def process(request: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(request, dict):
        raise ImportFailure("request 必须是 JSON 对象")
    action=request.get("action")
    if action not in {"inspect","extract"}:
        raise ImportFailure("action 必须为 inspect 或 extract")
    source=Path(str(request.get("filePath", ""))).expanduser()
    if not source.is_file():
        raise ImportFailure("服务端保存的源文件不存在")
    original_name=str(request.get("name") or source.name)
    page=request.get("page",1)
    if isinstance(page,bool) or not isinstance(page,int) or page<1:
        raise ImportFailure("page 必须是从 1 开始的正整数")
    if action=="extract":
        bounds=_bounds(request.get("bounds"))
        if "mmPerUnit" not in request:
            raise ImportFailure("extract 必须显式提供 mmPerUnit")
        mm_per_unit=_finite_number(request["mmPerUnit"],"mmPerUnit")
        if not (0 < mm_per_unit <= 1_000_000):
            raise ImportFailure("mmPerUnit 必须大于 0 且不超过 1000000")
    else:
        bounds=_bounds(request["bounds"]) if request.get("bounds") is not None else None
        mm_per_unit=_finite_number(request["mmPerUnit"],"mmPerUnit") if request.get("mmPerUnit") is not None else None
        if mm_per_unit is not None and not (0 < mm_per_unit <= 1_000_000):
            raise ImportFailure("mmPerUnit 必须大于 0 且不超过 1000000")
    if source.stat().st_size > 20*1024*1024:
        raise ImportFailure("源文件超过 20 MiB 限制")
    suffix=Path(original_name).suffix.lower()
    # DWG conversion output lives only for the duration of parsing; strict DXF errors
    # are surfaced without repair. Converted DWG files remain read-only.
    if suffix==".dwg":
        exe_text=os.environ.get("WEBCAD_DWG_CONVERTER",r"F:\金大福生产\agent\tools\libredwg\dwg2dxf.exe")
        exe=Path(exe_text)
        if not exe.is_file(): raise ImportFailure(f"找不到本机 DWG 转换器：{exe}（可用 WEBCAD_DWG_CONVERTER 覆盖）")
        temp_root=source.parent / "webcad-converter-temp"
        temp_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="dwg-",dir=temp_root) as temp_name:
            converted=_convert_dwg(source,Path(temp_name))
            geometry=_dxf_geometry(converted,mm_per_unit)
            return _finish(request,source,original_name,page,action,bounds,mm_per_unit,geometry,"dwg")
    geometry,format_name,_=_read_document(source,original_name,page,mm_per_unit)
    return _finish(request,source,original_name,page,action,bounds,mm_per_unit,geometry,format_name)


def _finish(request: dict[str, Any], source: Path, name: str, page: int, action: str,
            bounds: list[float] | None, mm_per_unit: float | None,
            geometry: DocumentGeometry, format_name: str) -> dict[str, Any]:
    warnings=list(geometry.warnings)
    if bounds is not None:
        from shapely.geometry import LineString, box
        window=box(*bounds)
        crossing=[]
        selected=[]
        for index,path in enumerate(geometry.paths):
            line=LineString(path.points + ([path.points[0]] if path.closed and path.points[-1]!=path.points[0] else []))
            if not window.intersects(line):
                continue
            if not window.covers(line):
                crossing.append(index)
            else:
                selected.append(path)
        if crossing:
            message=f"选区与 {len(crossing)} 条路径相交但未完整包含；请调整框选，避免裁掉字形/轮廓"
            if action=="extract" and (not request.get('ignoreCrossing',False) or any(geometry.paths[i].closed for i in crossing)):
                raise ImportFailure(message + "；仅可在确认后排除穿过选区的开放辅助线，闭合图案不可裁断")
            if action=='extract':message += '；已按用户选项排除，请核对完整字形'
            warnings.append(message)
        text_hits=[rect for rect in geometry.text_bounds if _rect_intersects(rect,bounds)]
        image_hits=[rect for rect in geometry.image_bounds if _rect_intersects(rect,bounds)]
        unknown_hits=[rect for rect in geometry.unsupported_bounds if _rect_intersects(rect,bounds)]
        if action=="extract":
            if text_hits:
                raise ImportFailure("所选窗口包含 PDF/DXF TEXT；请先把字体转曲再导入，绝不猜测字体轮廓")
            if image_hits:
                raise ImportFailure("所选窗口包含 IMAGE/扫描图片；位图不能作为矢量 logo 导入")
            if unknown_hits:
                raise ImportFailure("所选窗口与未支持的 CAD 几何重叠；请先转成可识别的闭合矢量路径")
            nonfill=[p for p in selected if not p.filled]
            if nonfill:
                raise ImportFailure("所选窗口包含 stroke-only/open paths；不能把 stroke 当填充轮廓，请先转曲/扩展外观")
            if not selected:
                raise ImportFailure("选区中没有完整的矢量路径")
            stroked=[p for p in selected if p.kind=="stroked"]
            if stroked:
                raise ImportFailure("选区含 fill+stroke 外观；当前不能保真保留描边，请先将描边扩展为闭合轮廓")
            scale=mm_per_unit
            zs=[p.source_z for p in selected if p.source_z is not None]
            if zs and (max(zs)-min(zs))*scale>1e-7:
                raise ImportFailure('所选 CAD 轮廓不在同一 XY 平面，请先导出二维轮廓')
            regions,extent=_loops_to_regions(selected,scale)
            point_count=sum(len(r["outer"])+sum(map(len,r["holes"])) for r in regions)
            area_mm2=0.0
            for region in regions:
                from shapely.geometry import Polygon
                poly=Polygon(region["outer"],region["holes"])
                area_mm2+=poly.area
            packet={"type":"webcad-logo","version":1,"units":"mm","name":Path(name).stem,
                    "regions":regions,"sizeMm":[round((extent[2]-extent[0])*scale,8),round((extent[3]-extent[1])*scale,8)],
                    "areaMm2":round(area_mm2,8),
                    "source":{"name":name,"sha256":hashlib.sha256(source.read_bytes()).hexdigest(),"format":format_name,
                              "page":page,"pageCount":geometry.page_count,"window":bounds,"mmPerUnit":scale,
                              "unitLabel":geometry.unit_label,"suggestedMmPerUnit":geometry.suggested_scale,
                              "curveToleranceMm":FLATNESS_MM,"endpointJoinToleranceMm":ENDPOINT_JOIN_MM,
                              "method":"reviewed vector paths; curves flattened at recorded tolerance; no font substitution or source repair",
                              "warnings":warnings,"pointCount":point_count}}
            return {"logo":packet}
    return {"paths":[{"points":[[round(x,8),round(y,8)] for x,y in item.points],"closed":item.closed} for item in geometry.paths],
            "bounds":geometry.bounds,"page":page,"pageCount":geometry.page_count,"unitLabel":geometry.unit_label,
            "suggestedMmPerUnit":geometry.suggested_scale,"warnings":warnings,
            **({"textBounds":geometry.text_bounds} if geometry.text_bounds else {})}


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request",required=True,type=Path)
    parser.add_argument("--output",required=True,type=Path)
    args=parser.parse_args()
    try:
        request=json.loads(args.request.read_text(encoding="utf-8-sig"))
        result=process(request)
    except ImportFailure as exc:
        result={"error":str(exc)}
    except Exception as exc:
        # Keep service responses concise; retain a safe user-facing class/message.
        result={"error":f"矢量文件处理失败：{type(exc).__name__}: {exc}"}
    try:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    except Exception as exc:
        sys.stderr.write(f"无法写入转换结果：{exc}\n")
        return 2
    return 0


if __name__=="__main__":
    raise SystemExit(main())

