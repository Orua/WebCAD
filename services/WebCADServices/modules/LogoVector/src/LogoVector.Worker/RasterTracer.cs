using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using LogoVector.Contracts;
using LogoVector.Geometry;
using StbImageSharp;

namespace LogoVector.Worker
{
    internal static class RasterTracer
    {
        internal sealed class SmoothingReport
        {
            public string Status, FailureCode;
            public double RequestedPx, ActualPx;
            public int PointsBefore, PointsAfter, RegionCount, HoleCount;
            public int DiagonalContacts;
            public double CornerBoundPx;
            public List<LogoRegion> OriginalRegions;
        }
        internal static List<LogoRegion> CopyRegions(IEnumerable<LogoRegion> regions) => regions.Select(r => new LogoRegion { Outer = r.Outer.Select(p => (double[])p.Clone()).ToList(), Holes = r.Holes.Select(h => h.Select(p => (double[])p.Clone()).ToList()).ToList() }).ToList();
        static IEnumerable<List<double[]>> Rings(IEnumerable<LogoRegion> regions) => regions.SelectMany(r => new[] { r.Outer }.Concat(r.Holes));
        static double Area2(IList<double[]> ring) { double area = 0; for (int i = 0; i < ring.Count; i++) { var a = ring[i]; var b = ring[(i + 1) % ring.Count]; area += a[0] * b[1] - b[0] * a[1]; } return area; }
        static bool Inside(double[] p, IList<double[]> ring)
        {
            bool result = false;
            for (int i = 0, j = ring.Count - 1; i < ring.Count; j = i++) { var a = ring[i]; var b = ring[j]; if ((a[1] > p[1]) != (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result; }
            return result;
        }
        // One explicit, bounded pass, not denoise, island deletion or pixel resampling.
        // The same edge parameter maps old endpoints to new endpoints. Convexity of
        // the norm bounds every corresponding edge point by max vertex displacement.
        internal static List<LogoRegion> SmoothContours(List<LogoRegion> original, double smoothingPx, out SmoothingReport report)
        {
            if (double.IsNaN(smoothingPx) || double.IsInfinity(smoothingPx) || smoothingPx < 0 || smoothingPx > .5) throw new LogoVectorException("INVALID_OPTIONS", "raster.smoothingPx 必须为 0–0.5 源像素数值；0 保留原始边界。");
            report = new SmoothingReport { Status = "disabled", RequestedPx = smoothingPx, ActualPx = 0, PointsBefore = Rings(original).Sum(r => r.Count), PointsAfter = Rings(original).Sum(r => r.Count), RegionCount = original.Count, HoleCount = original.Sum(r => r.Holes.Count) };
            if (smoothingPx == 0) return original;
            // Validate the source independently; smoothing never makes an invalid source acceptable.
            LogoGeometry.Normalize("raster-original", original, new Dictionary<string, object>(), false);
            report.OriginalRegions = CopyRegions(original);
            var candidate = CopyRegions(original);
            double minX = original.Min(r => r.Outer.Min(p => p[0])), maxX = original.Max(r => r.Outer.Max(p => p[0])), minY = original.Min(r => r.Outer.Min(p => p[1])), maxY = original.Max(r => r.Outer.Max(p => p[1]));
            var before = Rings(original).ToList(); var after = Rings(candidate).ToList();
            double actual = 0;
            for (int r = 0; r < before.Count; r++) for (int i = 0; i < before[r].Count; i++)
            {
                var ring = before[r]; var p = ring[i];
                // Preserve the whole artwork's physical bounds and original origin.
                if (p[0] == minX || p[0] == maxX || p[1] == minY || p[1] == maxY) continue;
                var prev = ring[(i - 1 + ring.Count) % ring.Count]; var next = ring[(i + 1) % ring.Count];
                double dx = (prev[0] + next[0]) / 2 - p[0], dy = (prev[1] + next[1]) / 2 - p[1], distance = Math.Sqrt(dx * dx + dy * dy);
                if (distance == 0) continue;
                double weight = Math.Min(.5, smoothingPx / distance);
                after[r][i][0] = p[0] + dx * weight; after[r][i][1] = p[1] + dy * weight;
                actual = Math.Max(actual, distance * weight);
            }
            try
            {
                // This checks every ring for self contact, all ring pairs for
                // intersections/contact, holes within their own outer, and overlaps.
                LogoGeometry.Normalize("raster-smoothed", candidate, new Dictionary<string, object>(), false);
                for (int i = 0; i < before.Count; i++)
                {
                    if (Math.Sign(Area2(before[i])) != Math.Sign(Area2(after[i]))) throw new LogoVectorException("RASTER_SMOOTHING_TOPOLOGY", "平滑改变了轮廓方向。");
                    for (int j = 0; j < before.Count; j++) if (i != j && Inside(before[i][0], before[j]) != Inside(after[i][0], after[j])) throw new LogoVectorException("RASTER_SMOOTHING_TOPOLOGY", "平滑改变了孔洞或小岛包含关系。");
                }
            }
            catch (LogoVectorException error)
            {
                report.Status = "rejected-topology"; report.FailureCode = error.Code;
                // No partial ring replacement or adaptive retry with hidden parameters.
                return original;
            }
            report.Status = actual > 0 ? "applied" : "unchanged"; report.ActualPx = actual;
            report.PointsAfter = Rings(candidate).Sum(r => r.Count);
            return candidate;
        }
        static long Key(int x, int y) => ((long)y << 32) | (uint)x;
        static double[] Point(long key) => new[] { (uint)key / 4.0, -(key >> 32) / 4.0 };
        public static Tuple<List<LogoRegion>, double> Trace(byte[] bytes, RasterOptions options, out int pixelHeight)
        {
            SmoothingReport ignored;
            return Trace(bytes, options, out pixelHeight, 0, out ignored);
        }
        public static Tuple<List<LogoRegion>, double> Trace(byte[] bytes, RasterOptions options, out int pixelHeight, double smoothingPx, out SmoothingReport smoothing)
        {
            if (options == null || options.Threshold < 0 || options.Threshold > 255 || options.AlphaThreshold < 0 || options.AlphaThreshold > 255) throw new LogoVectorException("INVALID_OPTIONS", "位图阈值无效。");
            ImageInfo? info;
            using (var stream = new MemoryStream(bytes)) info = ImageInfo.FromStream(stream);
            if (!info.HasValue || info.Value.Width < 1 || info.Value.Height < 1 || info.Value.Width > 20000 || info.Value.Height > 20000 || (long)info.Value.Width * info.Value.Height > 20000000) throw new LogoVectorException("FILE_TOO_LARGE", "位图尺寸超出限制。");
            var image = ImageResult.FromMemory(bytes, ColorComponents.RedGreenBlueAlpha);
            int width = image.Width, height = image.Height; pixelHeight = height;
            var black = new bool[width * height];
            for (int i = 0; i < black.Length; i++)
            {
                int q = i * 4; var a = image.Data[q + 3];
                if (a < options.AlphaThreshold) continue;
                int luma = (image.Data[q] * 299 + image.Data[q + 1] * 587 + image.Data[q + 2] * 114) / 1000;
                black[i] = options.Invert ? luma >= options.Threshold : luma < options.Threshold;
            }
            var contacts = new HashSet<long>();
            for (int y = 0; y < height - 1; y++) for (int x = 0; x < width - 1; x++)
            {
                bool a = black[y * width + x], b = black[y * width + x + 1], c = black[(y + 1) * width + x], d = black[(y + 1) * width + x + 1];
                if (a && d && !b && !c || b && c && !a && !d) contacts.Add(Key((x + 1) * 4, (y + 1) * 4));
            }
            var edges = new Dictionary<long, long>();
            Action<int, int, int, int> add = (x0, y0, x1, y1) =>
            {
                long start = Key(x0, y0);
                if (edges.ContainsKey(start)) throw new LogoVectorException("RASTER_TOPOLOGY_AMBIGUOUS", "位图边界分叉。");
                edges.Add(start, Key(x1, y1));
            };
            // Four-connected foreground: retain every pixel centre and all holes.
            // Only a zero-width diagonal contact is bevelled inside its own cell,
            // by 1/4 pixel along each incident edge; never join separate islands.
            Action<int, int, int, int> side = (x0, y0, x1, y1) =>
            {
                x0 *= 4; y0 *= 4; x1 *= 4; y1 *= 4;
                int dx = Math.Sign(x1 - x0), dy = Math.Sign(y1 - y0);
                bool first = contacts.Contains(Key(x0,y0)), last = contacts.Contains(Key(x1,y1));
                add(x0 + (first ? dx : 0), y0 + (first ? dy : 0), x1 - (last ? dx : 0), y1 - (last ? dy : 0));
                // Clockwise boundary, foreground on the right. Connect the incoming
                // edge to the outgoing edge of the same foreground cell.
                if(last) add(x1-dx,y1-dy,x1-dy,y1+dx);
            };
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) if (black[y * width + x])
            {
                if (y == 0 || !black[(y - 1) * width + x]) side(x, y, x + 1, y);
                if (x == width - 1 || !black[y * width + x + 1]) side(x + 1, y, x + 1, y + 1);
                if (y == height - 1 || !black[(y + 1) * width + x]) side(x + 1, y + 1, x, y + 1);
                if (x == 0 || !black[y * width + x - 1]) side(x, y + 1, x, y);
                if (edges.Count > 500000) throw new LogoVectorException("CONTOUR_TOO_COMPLEX", "位图边界过于复杂。");
            }
            if (edges.Count == 0) throw new LogoVectorException("NO_VECTOR_CONTENT", "阈值下没有前景像素。");
            var rings = new List<List<double[]>>();
            while (edges.Count > 0)
            {
                long start = edges.Keys.First(), current = start;
                var ring = new List<double[]>();
                do
                {
                    ring.Add(Point(current));
                    if (!edges.TryGetValue(current, out long next)) throw new LogoVectorException("OPEN_CONTOUR", "位图边界未闭合。");
                    edges.Remove(current); current = next;
                    if (ring.Count > 500000) throw new LogoVectorException("CONTOUR_TOO_COMPLEX", "边界过于复杂。");
                } while (current != start);
                for (int i = ring.Count - 1; i >= 0 && ring.Count > 3; i--)
                {
                    var prev = ring[(i - 1 + ring.Count) % ring.Count]; var here = ring[i]; var next = ring[(i + 1) % ring.Count];
                    if ((here[0] - prev[0]) * (next[1] - here[1]) == (here[1] - prev[1]) * (next[0] - here[0])) ring.RemoveAt(i);
                }
                rings.Add(ring);
            }
            var regions = LogoGeometry.FromEvenOddRings(rings);
            var result = SmoothContours(regions, smoothingPx, out smoothing);
            smoothing.DiagonalContacts = contacts.Count;
            smoothing.CornerBoundPx = contacts.Count > 0 ? .25 / Math.Sqrt(2) : 0;
            return Tuple.Create(result, (double)width);
        }
    }
}
