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
        static long Key(int x, int y) => ((long)y << 32) | (uint)x;
        static double[] Point(long key) => new[] { (double)(uint)key, -(double)(key >> 32) };
        public static Tuple<List<LogoRegion>, double> Trace(byte[] bytes, RasterOptions options)
        {
            if (options == null || options.Threshold < 0 || options.Threshold > 255 || options.AlphaThreshold < 0 || options.AlphaThreshold > 255) throw new LogoVectorException("INVALID_OPTIONS", "位图阈值无效。");
            ImageInfo? info;
            using (var stream = new MemoryStream(bytes)) info = ImageInfo.FromStream(stream);
            if (!info.HasValue || info.Value.Width < 1 || info.Value.Height < 1 || info.Value.Width > 20000 || info.Value.Height > 20000 || (long)info.Value.Width * info.Value.Height > 20000000) throw new LogoVectorException("FILE_TOO_LARGE", "位图尺寸超出限制。");
            var image = ImageResult.FromMemory(bytes, ColorComponents.RedGreenBlueAlpha);
            int width = image.Width, height = image.Height;
            var black = new bool[width * height];
            for (int i = 0; i < black.Length; i++)
            {
                int q = i * 4; var a = image.Data[q + 3];
                if (a < options.AlphaThreshold) continue;
                int luma = (image.Data[q] * 299 + image.Data[q + 1] * 587 + image.Data[q + 2] * 114) / 1000;
                black[i] = options.Invert ? luma >= options.Threshold : luma < options.Threshold;
            }
            for (int y = 0; y < height - 1; y++) for (int x = 0; x < width - 1; x++)
            {
                bool a = black[y * width + x], b = black[y * width + x + 1], c = black[(y + 1) * width + x], d = black[(y + 1) * width + x + 1];
                if (a && d && !b && !c || b && c && !a && !d) throw new LogoVectorException("RASTER_TOPOLOGY_AMBIGUOUS", "位图存在仅角点相接的像素。");
            }
            var edges = new Dictionary<long, long>();
            Action<int, int, int, int> add = (x0, y0, x1, y1) =>
            {
                long start = Key(x0, y0);
                if (edges.ContainsKey(start)) throw new LogoVectorException("RASTER_TOPOLOGY_AMBIGUOUS", "位图边界分叉。");
                edges.Add(start, Key(x1, y1));
            };
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) if (black[y * width + x])
            {
                if (y == 0 || !black[(y - 1) * width + x]) add(x, y, x + 1, y);
                if (x == width - 1 || !black[y * width + x + 1]) add(x + 1, y, x + 1, y + 1);
                if (y == height - 1 || !black[(y + 1) * width + x]) add(x + 1, y + 1, x, y + 1);
                if (x == 0 || !black[y * width + x - 1]) add(x, y + 1, x, y);
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
            return Tuple.Create(LogoGeometry.FromEvenOddRings(rings), (double)width);
        }
    }
}
