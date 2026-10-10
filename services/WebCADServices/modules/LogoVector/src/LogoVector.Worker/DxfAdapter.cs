using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using LogoVector.Contracts;
using LogoVector.Geometry;

namespace LogoVector.Worker
{
    // Strict 2D ASCII subset. Every entity in ENTITIES must be accounted for.
    internal static class DxfAdapter
    {
        internal sealed class Parsed { public List<LogoRegion> Regions; public double Width; public double? MmPerUnit; public string Version; }
        sealed class Pair { public int Code; public string Value; }
        sealed class Entity { public string Kind; public List<Pair> Pairs = new List<Pair>(); public string Get(int code) => Pairs.FirstOrDefault(p => p.Code == code)?.Value; }
        static double Number(string s) { if (!double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out double value) || double.IsNaN(value) || double.IsInfinity(value)) throw new LogoVectorException("MALFORMED_FILE", "DXF 坐标不是有限数值。"); return value; }
        static double Value(Entity e, int code, double fallback = 0) => e.Get(code) == null ? fallback : Number(e.Get(code));
        static bool Same(double[] a, double[] b) => Math.Abs(a[0] - b[0]) < 1e-8 && Math.Abs(a[1] - b[1]) < 1e-8;
        internal static Parsed Parse(byte[] bytes)
        {
            if (bytes.Any(b => b == 0 || b > 127)) throw new LogoVectorException("TYPE_MISMATCH", "只支持 ASCII DXF。");
            string text = Encoding.UTF8.GetString(bytes);
            var lines = text.Replace("\r", "").Split('\n');
            var pairs = new List<Pair>();
            for (int i = 0; i + 1 < lines.Length; i += 2)
            {
                if (!int.TryParse(lines[i].Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out int code)) throw new LogoVectorException("MALFORMED_FILE", "DXF 组码无效。");
                pairs.Add(new Pair { Code = code, Value = lines[i + 1].Trim() });
            }
            if (pairs.Count < 8 || pairs.Last().Code != 0 || pairs.Last().Value != "EOF") throw new LogoVectorException("MALFORMED_FILE", "DXF 缺少 EOF 或结构无效。");
            string section = ""; string variable = ""; string version = null; int units = -1;
            var entities = new List<Entity>(); Entity current = null;
            for (int i = 0; i < pairs.Count; i++)
            {
                var p = pairs[i];
                if (p.Code == 0 && p.Value == "SECTION") { if (i + 1 >= pairs.Count || pairs[i + 1].Code != 2) throw new LogoVectorException("MALFORMED_FILE", "DXF SECTION 无名称。"); section = pairs[++i].Value; current = null; continue; }
                if (p.Code == 0 && p.Value == "ENDSEC") { section = ""; current = null; continue; }
                if (section == "HEADER")
                {
                    if (p.Code == 9) variable = p.Value;
                    else if (variable == "$ACADVER" && p.Code == 1) version = p.Value;
                    else if (variable == "$INSUNITS" && p.Code == 70 && int.TryParse(p.Value, out int u)) units = u;
                }
                else if (section == "ENTITIES")
                {
                    if (p.Code == 0) { current = new Entity { Kind = p.Value }; entities.Add(current); }
                    else if (current != null) current.Pairs.Add(p);
                }
            }
            var versions = new HashSet<string> { "AC1015", "AC1018", "AC1021", "AC1024", "AC1027", "AC1032" };
            if (!versions.Contains(version)) throw new LogoVectorException("FORMAT_VARIANT_UNSUPPORTED", "仅支持经验证的 R2000–R2018 ASCII DXF 版本。");
            if (entities.Count == 0) throw new LogoVectorException("NO_VECTOR_CONTENT", "DXF 没有实体。");
            var rings = new List<List<double[]>>(); var edges = new List<Tuple<double[], double[]>>();
            foreach (var e in entities)
            {
                if (e.Kind == "LWPOLYLINE")
                {
                    int flags = (int)Value(e, 70);
                    if ((flags & 1) == 0) throw new LogoVectorException("OPEN_CONTOUR", "DXF 折线没有闭合标志。");
                    if (Math.Abs(Value(e, 38)) > 1e-9 || Math.Abs(Value(e, 39)) > 1e-9 || Math.Abs(Value(e, 210)) > 1e-9 || Math.Abs(Value(e, 220)) > 1e-9 || Math.Abs(Value(e, 230, 1) - 1) > 1e-9 || e.Pairs.Any(p => p.Code == 42 && Math.Abs(Number(p.Value)) > 1e-12)) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "DXF 凸度、厚度、高度或空间变换未支持。");
                    var points = new List<double[]>();
                    foreach (var p in e.Pairs)
                    {
                        if (p.Code == 10) points.Add(new[] { Number(p.Value), double.NaN });
                        else if (p.Code == 20) { if (points.Count == 0 || !double.IsNaN(points[points.Count - 1][1])) throw new LogoVectorException("MALFORMED_FILE", "DXF 折线坐标配对错误。"); points[points.Count - 1][1] = Number(p.Value); }
                        else if (p.Code == 30 && Math.Abs(Number(p.Value)) > 1e-9) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "3D 折线未支持。");
                    }
                    if (points.Any(p => double.IsNaN(p[1]))) throw new LogoVectorException("MALFORMED_FILE", "DXF 折线缺少 Y 坐标。");
                    if (e.Get(90) != null && (int)Value(e, 90) != points.Count) throw new LogoVectorException("MALFORMED_FILE", "DXF 折线顶点数量不符。");
                    rings.Add(points);
                }
                else if (e.Kind == "LINE")
                {
                    if (Math.Abs(Value(e, 30)) > 1e-9 || Math.Abs(Value(e, 31)) > 1e-9 || Math.Abs(Value(e, 39)) > 1e-9 || Math.Abs(Value(e, 210)) > 1e-9 || Math.Abs(Value(e, 220)) > 1e-9 || Math.Abs(Value(e, 230, 1) - 1) > 1e-9) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "3D LINE 或空间变换未支持。");
                    if (e.Get(10) == null || e.Get(20) == null || e.Get(11) == null || e.Get(21) == null) throw new LogoVectorException("MALFORMED_FILE", "LINE 缺少端点。");
                    edges.Add(Tuple.Create(new[] { Value(e, 10), Value(e, 20) }, new[] { Value(e, 11), Value(e, 21) }));
                }
                else throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "DXF 实体未支持：" + e.Kind);
            }
            while (edges.Count > 0)
            {
                var edge = edges[0]; edges.RemoveAt(0);
                var points = new List<double[]> { edge.Item1, edge.Item2 };
                while (!Same(points[points.Count - 1], points[0]))
                {
                    int match = -1; double[] next = null;
                    for (int i = 0; i < edges.Count; i++)
                    {
                        if (Same(edges[i].Item1, points[points.Count - 1])) { if (match >= 0) throw new LogoVectorException("AMBIGUOUS_CONTOUR", "LINE 链存在分叉。"); match = i; next = edges[i].Item2; }
                        else if (Same(edges[i].Item2, points[points.Count - 1])) { if (match >= 0) throw new LogoVectorException("AMBIGUOUS_CONTOUR", "LINE 链存在分叉。"); match = i; next = edges[i].Item1; }
                    }
                    if (match < 0) throw new LogoVectorException("OPEN_CONTOUR", "LINE 链存在断口。");
                    edges.RemoveAt(match); points.Add(next);
                    if (points.Count > 2001) throw new LogoVectorException("CONTOUR_TOO_COMPLEX", "LINE 链过长。");
                }
                points.RemoveAt(points.Count - 1); rings.Add(points);
            }
            if (rings.Count == 0) throw new LogoVectorException("NO_VECTOR_CONTENT", "DXF 没有闭合轮廓。");
            var regions = LogoGeometry.FromEvenOddRings(rings);
            double minX = rings.SelectMany(r => r).Min(p => p[0]), maxX = rings.SelectMany(r => r).Max(p => p[0]);
            double? mm = units == 4 ? 1 : units == 1 ? 25.4 : units == 5 ? 10 : units == 6 ? 1000 : (double?)null;
            return new Parsed { Regions = regions, Width = maxX - minX, MmPerUnit = mm, Version = version };
        }
    }
}
