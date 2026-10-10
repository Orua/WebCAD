using System;
using System.Collections.Generic;
using System.Linq;
using LogoVector.Contracts;

namespace LogoVector.Worker
{
    internal static class LineworkJoiner
    {
        sealed class Node { public double[] Point; public HashSet<int> Neighbors = new HashSet<int>(); }
        internal static List<List<double[]>> Join(List<Tuple<double[], double[]>> edges, double tolerance, out int repairs)
        {
            var nodes = new List<Node>();
            Func<double[], int> find = p => { int i = nodes.FindIndex(n => Distance(n.Point, p) < 1e-8); if (i >= 0) return i; nodes.Add(new Node { Point = (double[])p.Clone() }); return nodes.Count - 1; };
            foreach (var edge in edges) { int a = find(edge.Item1), b = find(edge.Item2); if (a == b) continue; nodes[a].Neighbors.Add(b); nodes[b].Neighbors.Add(a); }
            repairs = 0;
            // A short dangling edge at an otherwise closed boundary is a spur, not a gap to bridge.
            for (int i = 0; i < nodes.Count; i++) if (nodes[i].Neighbors.Count == 1)
            {
                int j = nodes[i].Neighbors.Single();
                if (nodes[j].Neighbors.Count == 3 && Distance(nodes[i].Point, nodes[j].Point) <= tolerance)
                { nodes[j].Neighbors.Remove(i); nodes[i].Neighbors.Clear(); repairs++; }
            }
            for (int i = 0; i < nodes.Count; i++) if (nodes[i].Neighbors.Count == 1)
            {
                var candidates = Enumerable.Range(0, nodes.Count).Where(j => j != i && nodes[j].Neighbors.Count == 1 && !nodes[i].Neighbors.Contains(j) && Distance(nodes[i].Point, nodes[j].Point) <= tolerance).ToList();
                if (candidates.Count != 1) throw new LogoVectorException(candidates.Count == 0 ? "OPEN_CONTOUR" : "AMBIGUOUS_CONTOUR", "线条断口超出接合公差，或存在多个接合候选。");
                int match = candidates[0];
                int reverse = Enumerable.Range(0, nodes.Count).Count(j => j != match && nodes[j].Neighbors.Count == 1 && !nodes[match].Neighbors.Contains(j) && Distance(nodes[match].Point, nodes[j].Point) <= tolerance);
                if (reverse != 1) throw new LogoVectorException("AMBIGUOUS_CONTOUR", "端点接合关系不唯一。");
                var midpoint = new[] { (nodes[i].Point[0] + nodes[match].Point[0]) / 2, (nodes[i].Point[1] + nodes[match].Point[1]) / 2 };
                int neighbor = nodes[match].Neighbors.Single();
                nodes[neighbor].Neighbors.Remove(match); nodes[neighbor].Neighbors.Add(i); nodes[i].Neighbors.Add(neighbor);
                nodes[i].Point = midpoint; nodes[match].Neighbors.Clear(); repairs++;
            }
            if (nodes.Any(n => n.Neighbors.Count != 0 && n.Neighbors.Count != 2)) throw new LogoVectorException("AMBIGUOUS_CONTOUR", "接合后仍存在分叉，不能自动生成闭环。");
            var used = new HashSet<int>(); var rings = new List<List<double[]>>();
            for (int start = 0; start < nodes.Count; start++)
            {
                if (used.Contains(start) || nodes[start].Neighbors.Count == 0) continue;
                var ring = new List<double[]>(); int previous = -1, current = start;
                do { if (!used.Add(current)) throw new LogoVectorException("INVALID_CONTOUR", "路径重复经过节点。"); ring.Add(nodes[current].Point); int next = nodes[current].Neighbors.First(n => n != previous); previous = current; current = next; } while (current != start);
                RemoveShortBacktracks(ring, tolerance, ref repairs);
                if (ring.Count < 3) throw new LogoVectorException("INVALID_CONTOUR", "闭环顶点不足。");
                rings.Add(ring);
            }
            if (rings.Count == 0) throw new LogoVectorException("NO_VECTOR_CONTENT", "没有可接合轮廓。");
            return rings;
        }
        static void RemoveShortBacktracks(List<double[]> ring, double tolerance, ref int repairs)
        {
            // A tiny out-and-back segment is a PDF stroke artifact, not part of the boundary.
            // Remove only the overshooting vertex; the remaining edge ends at the existing next point.
            bool changed;
            do
            {
                changed = false;
                for (int i = 0; i < ring.Count && ring.Count > 3; i++)
                {
                    var a = ring[(i + ring.Count - 1) % ring.Count];
                    var b = ring[i];
                    var c = ring[(i + 1) % ring.Count];
                    double abx = b[0] - a[0], aby = b[1] - a[1];
                    double bcx = c[0] - b[0], bcy = c[1] - b[1];
                    double abLength = Distance(a, b), bcLength = Distance(b, c);
                    if (abLength <= 0 || bcLength <= 0 || Math.Min(abLength, bcLength) > tolerance) continue;
                    if (abx * bcx + aby * bcy >= 0 || Math.Abs(abx * bcy - aby * bcx) > 1e-9 * abLength * bcLength) continue;
                    ring.RemoveAt(i);
                    repairs++;
                    changed = true;
                    break;
                }
            } while (changed);
        }
        static double Distance(double[] a, double[] b) => Math.Sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
    }
}
