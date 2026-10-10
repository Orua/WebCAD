using System;
using System.Collections.Generic;
using System.Linq;
using LogoVector.Contracts;
using LogoVector.Geometry;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Core;

namespace LogoVector.Worker
{
    internal static class PdfAdapter
    {
        internal sealed class Parsed
        {
            public List<LogoRegion> Regions;
            public double WidthPoints;
            public int PageCount;
            public int Page;
            public bool Curves;
            public bool Reconstructed;
            public int Repairs;
            public double JoinToleranceMm;
        }
        internal static int CountPages(byte[] bytes)
        {
            using (var document = PdfDocument.Open(bytes)) return document.NumberOfPages;
        }

        internal static Parsed Parse(byte[] bytes, int? pageNumber, ConversionOptions options = null)
        {
            using (var document = PdfDocument.Open(bytes))
            {
                if (document.NumberOfPages < 1) throw new LogoVectorException("NO_VECTOR_CONTENT", "PDF 没有页面。");
                if (!pageNumber.HasValue && document.NumberOfPages != 1) throw new LogoVectorException("PAGE_REQUIRED", "多页 PDF 必须选择页面。");
                int selected = pageNumber ?? 1;
                if (selected < 1 || selected > document.NumberOfPages) throw new LogoVectorException("INVALID_OPTIONS", "PDF 页码超出范围。");
                var page = document.GetPage(selected);
                if (page.Rotation.Value != 0) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "旋转页面尚未支持。");
                if (!page.CropBox.Bounds.Equals(page.MediaBox.Bounds)) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "裁剪页面尚未支持。");
                if (page.Letters.Count > 0 || page.NumberOfImages > 0) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "PDF 页面含文字或图片，请先转曲或移除图片。");
                // Stroke-only graphics state is harmless for fill-only paths; actual painted strokes remain rejected.
                var supported = new HashSet<string>(StringComparer.Ordinal) { "q", "Q", "cm", "m", "l", "c", "v", "y", "h", "re", "f", "f*", "rg", "g", "k", "n", "w", "J", "j", "M", "d", "G", "RG", "K", "S", "s" };
                foreach (var op in page.Operations)
                    if (!supported.Contains(op.Operator)) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "PDF 图形操作未支持：" + op.Operator);
                if (page.Paths.Count > 0 && page.Paths.All(p => p.IsStroked && !p.IsFilled && !p.IsClipping))
                {
                    if (page.Operations.Any(op => op.Operator == "d")) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "虚线状态的轮廓重建尚未支持。");
                    var edges = new List<Tuple<double[], double[]>>();
                    foreach (var path in page.Paths) foreach (var sub in path)
                    {
                        double[] first = null, last = null;
                        foreach (var command in sub.Commands)
                        {
                            if (command is PdfSubpath.Move move) first = last = Point(move.Location);
                            else if (command is PdfSubpath.Line line) { edges.Add(Tuple.Create(Point(line.From), Point(line.To))); last = Point(line.To); }
                            else if (command is PdfSubpath.Close) { if (first != null && last != null) edges.Add(Tuple.Create(last, first)); }
                            else throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "当前自动接合支持折线轮廓。");
                        }
                    }
                    if (edges.Count == 0) throw new LogoVectorException("NO_VECTOR_CONTENT", "没有可接合线段。");
                    double width = edges.SelectMany(e => new[] { e.Item1, e.Item2 }).Max(p => p[0]) - edges.SelectMany(e => new[] { e.Item1, e.Item2 }).Min(p => p[0]);
                    double scale = options?.SizeMode == "targetWidth" && options.TargetWidthMm > 0 && width > 0 ? options.TargetWidthMm.Value / width : options?.SizeMode == "mmPerSourceUnit" && options.MmPerSourceUnit > 0 ? options.MmPerSourceUnit.Value : 25.4 / 72;
                    double toleranceMm = options?.PdfJoinToleranceMm ?? 0;
                    if (double.IsNaN(toleranceMm) || toleranceMm < 0 || toleranceMm > 0.1) throw new LogoVectorException("INVALID_OPTIONS", "接合公差须为自动（0）或 0–0.1 mm。");
                    // Match the allowed gap to this logo's full width in source coordinates.
                    // This preserves the same join behaviour when artwork is scaled before splitting.
                    double tolerancePoints = toleranceMm > 0 ? toleranceMm / scale : width * 0.0025;
                    var rings = LineworkJoiner.Join(edges, tolerancePoints, out int repairs);
                    return new Parsed { Regions = LogoGeometry.FromEvenOddRings(rings), WidthPoints = width, PageCount = document.NumberOfPages, Page = selected, Reconstructed = true, Repairs = repairs, JoinToleranceMm = tolerancePoints * scale };
                }
                var regions = new List<LogoRegion>();
                string color = null;
                bool curves = false;
                foreach (var path in page.Paths)
                {
                    if (path.IsClipping || path.IsStroked || !path.IsFilled) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "仅支持填充路径；裁剪与描边须先扩展为轮廓。");
                    if (path.FillingRule != FillingRule.EvenOdd && path.FillingRule != FillingRule.NonZeroWinding) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "PDF 填充规则未支持。");
                    string fill = path.FillColor?.ToString() ?? "";
                    if (color != null && color != fill) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "多色 PDF 须先合并为单色。");
                    color = fill;
                    var pathRings = new List<List<double[]>>();
                    foreach (var sub in path)
                    {
                        var points = new List<double[]>();
                        foreach (var cmd in sub.Commands)
                        {
                            if (cmd is PdfSubpath.Move move) points.Add(Point(move.Location));
                            else if (cmd is PdfSubpath.Line line) points.Add(Point(line.To));
                            else if (cmd is PdfSubpath.CubicBezierCurve cubic)
                            {
                                curves = true;
                                Flatten(Point(cubic.StartPoint), Point(cubic.FirstControlPoint), Point(cubic.SecondControlPoint), Point(cubic.EndPoint), points, 0);
                            }
                            else if (cmd is PdfSubpath.QuadraticBezierCurve quadratic)
                            {
                                curves = true;
                                var a = Point(quadratic.StartPoint); var b = Point(quadratic.ControlPoint); var d = Point(quadratic.EndPoint);
                                Flatten(a, Mix(a, b, 2.0 / 3), Mix(d, b, 2.0 / 3), d, points, 0);
                            }
                            else if (!(cmd is PdfSubpath.Close)) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "PDF 路径命令未支持。");
                        }
                        if (points.Count > 1 && Distance(points[0], points[points.Count - 1]) < 1e-9) points.RemoveAt(points.Count - 1);
                        if (points.Count > 0) pathRings.Add(points);
                    }
                    if (pathRings.Count > 1 && path.FillingRule != FillingRule.EvenOdd) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "复合非零绕组路径尚未支持，请导出 evenodd 路径。");
                    if (pathRings.Count > 0) regions.AddRange(LogoGeometry.FromEvenOddRings(pathRings));
                }
                if (regions.Count == 0) throw new LogoVectorException("NO_VECTOR_CONTENT", "所选页面没有填充矢量路径。");
                double minX = regions.SelectMany(x => x.Outer).Min(x => x[0]);
                double maxX = regions.SelectMany(x => x.Outer).Max(x => x[0]);
                return new Parsed { Regions = regions, WidthPoints = maxX - minX, PageCount = document.NumberOfPages, Page = selected, Curves = curves };
            }
        }
        static double[] Point(PdfPoint p) => new[] { p.X, p.Y };
        static double[] Mix(double[] a, double[] b, double t) => new[] { a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t };
        static double Distance(double[] a, double[] b) => Math.Sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
        static double LineDistance(double[] p, double[] a, double[] b)
        {
            double length = Distance(a, b);
            return length < 1e-12 ? Distance(p, a) : Math.Abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / length;
        }
        static void Flatten(double[] a, double[] b, double[] c, double[] d, List<double[]> output, int depth)
        {
            if (output.Count >= 2000) throw new LogoVectorException("CONTOUR_TOO_COMPLEX", "PDF 曲线细分顶点过多。");
            if (Math.Max(LineDistance(b, a, d), LineDistance(c, a, d)) <= 0.0001) { output.Add(d); return; }
            if (depth >= 16) throw new LogoVectorException("TOLERANCE_UNACHIEVABLE", "PDF 曲线过复杂，无法保证离散公差。");
            var ab = Mix(a, b, .5); var bc = Mix(b, c, .5); var cd = Mix(c, d, .5);
            var abc = Mix(ab, bc, .5); var bcd = Mix(bc, cd, .5); var mid = Mix(abc, bcd, .5);
            Flatten(a, ab, abc, mid, output, depth + 1);
            Flatten(mid, bcd, cd, d, output, depth + 1);
        }
    }
}
