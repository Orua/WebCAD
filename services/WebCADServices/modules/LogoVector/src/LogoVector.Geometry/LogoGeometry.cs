using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using LogoVector.Contracts;

namespace LogoVector.Geometry
{
    public static class LogoGeometry
    {
        const double Epsilon = 1e-9;
        static double Cross(double[] a, double[] b, double[] c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        static double Area(IList<double[]> p) { double v = 0; for (int i = 0; i < p.Count; i++) { var a = p[i]; var b = p[(i + 1) % p.Count]; v += a[0] * b[1] - b[0] * a[1]; } return v / 2; }
        static bool Same(double[] a, double[] b) => Math.Abs(a[0] - b[0]) <= Epsilon && Math.Abs(a[1] - b[1]) <= Epsilon;
        static bool OnSegment(double[] a, double[] b, double[] p) => Math.Abs(Cross(a, b, p)) <= Epsilon && p[0] >= Math.Min(a[0], b[0]) - Epsilon && p[0] <= Math.Max(a[0], b[0]) + Epsilon && p[1] >= Math.Min(a[1], b[1]) - Epsilon && p[1] <= Math.Max(a[1], b[1]) + Epsilon;
        static bool Intersects(double[] a, double[] b, double[] c, double[] d)
        {
            double x = Cross(a, b, c), y = Cross(a, b, d), z = Cross(c, d, a), w = Cross(c, d, b);
            return (x * y < -Epsilon && z * w < -Epsilon) || OnSegment(a, b, c) || OnSegment(a, b, d) || OnSegment(c, d, a) || OnSegment(c, d, b);
        }
        static bool BoundariesMeet(IList<double[]> a, IList<double[]> b)
        {
            for (int i = 0; i < a.Count; i++) for (int j = 0; j < b.Count; j++) if (Intersects(a[i], a[(i + 1) % a.Count], b[j], b[(j + 1) % b.Count])) return true;
            return false;
        }
        static bool Inside(double[] p, IList<double[]> ring)
        {
            bool hit = false;
            for (int i = 0, j = ring.Count - 1; i < ring.Count; j = i++)
            {
                var a = ring[i]; var b = ring[j];
                if (OnSegment(a, b, p)) return false;
                if ((a[1] > p[1]) != (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
            }
            return hit;
        }
        public static List<LogoRegion> FromEvenOddRings(IEnumerable<List<double[]>> input)
        {
            var rings = input.Select(Clean).ToList();
            if (rings.Count == 0) throw new LogoVectorException("NO_VECTOR_CONTENT", "没有闭合轮廓。");
            for (int i = 0; i < rings.Count; i++) for (int j = i + 1; j < rings.Count; j++) if (BoundariesMeet(rings[i], rings[j])) throw new LogoVectorException("REGIONS_TOUCH_OR_OVERLAP", "轮廓相交或相接。");
            var parent = new int[rings.Count];
            for (int i = 0; i < rings.Count; i++)
            {
                parent[i] = -1; double parentArea = double.PositiveInfinity;
                for (int j = 0; j < rings.Count; j++) if (i != j && Inside(rings[i][0], rings[j]))
                {
                    double area = Math.Abs(Area(rings[j]));
                    if (area < parentArea) { parent[i] = j; parentArea = area; }
                }
            }
            var result = new List<LogoRegion>();
            for (int i = 0; i < rings.Count; i++)
            {
                int depth = 0, p = parent[i];
                while (p >= 0) { if (++depth > rings.Count) throw new LogoVectorException("INVALID_HOLE", "轮廓包含关系无效。"); p = parent[p]; }
                if (depth % 2 != 0) continue;
                var region = new LogoRegion { Outer = rings[i] };
                for (int j = 0; j < rings.Count; j++) if (parent[j] == i) region.Holes.Add(rings[j]);
                result.Add(region);
            }
            return result;
        }
        static List<double[]> Clean(IEnumerable<double[]> points)
        {
            var p = points.Select(x => x == null ? null : (double[])x.Clone()).ToList();
            if (p.Count > 1 && p[0] != null && p[p.Count - 1] != null && Same(p[0], p[p.Count - 1])) p.RemoveAt(p.Count - 1);
            if (p.Count < 3 || p.Count > 2000) throw new LogoVectorException("CONTOUR_TOO_COMPLEX", "环需要 3–2000 个顶点。");
            foreach (var x in p) if (x == null || x.Length != 2 || x.Any(v => double.IsNaN(v) || double.IsInfinity(v))) throw new LogoVectorException("INVALID_CONTOUR", "坐标必须是有限二维数值。");
            for (int i = 0; i < p.Count; i++) if (Same(p[i], p[(i + 1) % p.Count])) throw new LogoVectorException("INVALID_CONTOUR", "轮廓包含零长度边。");
            if (Math.Abs(Area(p)) <= Epsilon) throw new LogoVectorException("INVALID_CONTOUR", "轮廓面积为零。");
            for (int i = 0; i < p.Count; i++) for (int j = i + 1; j < p.Count; j++)
            {
                if (j == i + 1 || (i == 0 && j == p.Count - 1)) continue;
                if (Intersects(p[i], p[(i + 1) % p.Count], p[j], p[(j + 1) % p.Count])) throw new LogoVectorException("SELF_INTERSECTION", "轮廓自交或自身接触。");
            }
            return p;
        }
        static void OrientAndRotate(List<double[]> p, bool ccw)
        {
            if ((Area(p) > 0) != ccw) p.Reverse();
            int first = 0;
            for (int i = 1; i < p.Count; i++) if (p[i][0] < p[first][0] || (p[i][0] == p[first][0] && p[i][1] < p[first][1])) first = i;
            if (first > 0) { var copy = p.ToArray(); for (int i = 0; i < p.Count; i++) p[i] = copy[(i + first) % p.Count]; }
        }
        public static LogoDocument Normalize(string name, IEnumerable<LogoRegion> input, IDictionary<string, object> source, bool center = true)
        {
            var regions = input.Select(r => new LogoRegion { Outer = Clean(r.Outer), Holes = (r.Holes ?? new List<List<double[]>>()).Select(Clean).ToList() }).ToList();
            if (regions.Count < 1 || regions.Count > 150) throw new LogoVectorException("CONTOUR_TOO_COMPLEX", "区域数须为 1–150。");
            int total = regions.Sum(r => r.Outer.Count + r.Holes.Sum(h => h.Count));
            if (total > 12000) throw new LogoVectorException("CONTOUR_TOO_COMPLEX", "总顶点超过 12000。");
            foreach (var r in regions)
            {
                foreach (var h in r.Holes) { if (BoundariesMeet(r.Outer, h) || !Inside(h[0], r.Outer)) throw new LogoVectorException("INVALID_HOLE", "孔洞须严格位于外轮廓内。"); }
                for (int i = 0; i < r.Holes.Count; i++) for (int j = i + 1; j < r.Holes.Count; j++)
                    if (BoundariesMeet(r.Holes[i], r.Holes[j]) || Inside(r.Holes[i][0], r.Holes[j]) || Inside(r.Holes[j][0], r.Holes[i])) throw new LogoVectorException("INVALID_HOLE", "孔洞相交、相接或嵌套。");
            }
            for (int i = 0; i < regions.Count; i++) for (int j = i + 1; j < regions.Count; j++)
            {
                var a = regions[i]; var b = regions[j];
                foreach (var x in new[] { a.Outer }.Concat(a.Holes)) foreach (var y in new[] { b.Outer }.Concat(b.Holes)) if (BoundariesMeet(x, y)) throw new LogoVectorException("REGIONS_TOUCH_OR_OVERLAP", "区域边界相交或相接。");
                bool aInB = Inside(a.Outer[0], b.Outer) && !b.Holes.Any(h => Inside(a.Outer[0], h));
                bool bInA = Inside(b.Outer[0], a.Outer) && !a.Holes.Any(h => Inside(b.Outer[0], h));
                if (aInB || bInA) throw new LogoVectorException("REGIONS_TOUCH_OR_OVERLAP", "填充区域重叠。");
            }
            double minX = regions.Min(r => r.Outer.Min(p => p[0])), minY = regions.Min(r => r.Outer.Min(p => p[1]));
            double maxX = regions.Max(r => r.Outer.Max(p => p[0])), maxY = regions.Max(r => r.Outer.Max(p => p[1]));
            if (maxX <= minX || maxY <= minY) throw new LogoVectorException("INVALID_CONTOUR", "尺寸无效。");
            double cx = center ? (minX + maxX) / 2 : 0, cy = center ? (minY + maxY) / 2 : 0;
            foreach (var r in regions) foreach (var ring in new[] { r.Outer }.Concat(r.Holes)) foreach (var p in ring) { p[0] = Math.Round(p[0] - cx, 9); p[1] = Math.Round(p[1] - cy, 9); if (p[0] == 0) p[0] = 0; if (p[1] == 0) p[1] = 0; }
            foreach (var r in regions) { OrientAndRotate(r.Outer, true); foreach (var h in r.Holes) OrientAndRotate(h, false); r.Holes = r.Holes.OrderBy(h => h[0][0]).ThenBy(h => h[0][1]).ToList(); }
            regions = regions.OrderBy(r => r.Outer[0][0]).ThenBy(r => r.Outer[0][1]).ToList();
            return new LogoDocument { Name = name, SizeMm = new[] { Math.Round(maxX - minX, 9), Math.Round(maxY - minY, 9) }, Regions = regions, Source = new Dictionary<string, object>(source) };
        }
        static string F(double v) => v.ToString("0.#########", CultureInfo.InvariantCulture);
        public static string GeometryHash(LogoDocument doc)
        {
            var b = new StringBuilder("mm|").Append(F(doc.SizeMm[0])).Append(',').Append(F(doc.SizeMm[1]));
            foreach (var r in doc.Regions) { b.Append("|O"); foreach (var p in r.Outer) b.Append(';').Append(F(p[0])).Append(',').Append(F(p[1])); foreach (var h in r.Holes) { b.Append("|H"); foreach (var p in h) b.Append(';').Append(F(p[0])).Append(',').Append(F(p[1])); } }
            using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(b.ToString()))).Replace("-", "").ToLowerInvariant();
        }
        public static string ToSvg(LogoDocument doc)
        {
            var b = new StringBuilder().Append("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"").Append(F(doc.SizeMm[0])).Append("mm\" height=\"").Append(F(doc.SizeMm[1])).Append("mm\" viewBox=\"").Append(F(-doc.SizeMm[0] / 2)).Append(' ').Append(F(-doc.SizeMm[1] / 2)).Append(' ').Append(F(doc.SizeMm[0])).Append(' ').Append(F(doc.SizeMm[1])).Append("\">");
            foreach (var r in doc.Regions)
            {
                b.Append("<path fill=\"#000000\" fill-rule=\"evenodd\" stroke=\"none\" d=\"");
                foreach (var ring in new[] { r.Outer }.Concat(r.Holes)) { for (int i = 0; i < ring.Count; i++) b.Append(i == 0 ? 'M' : 'L').Append(F(ring[i][0])).Append(' ').Append(F(-ring[i][1])).Append(' '); b.Append("Z "); }
                b.Append("\"/>");
            }
            return b.Append("</svg>").ToString();
        }
    }
}
