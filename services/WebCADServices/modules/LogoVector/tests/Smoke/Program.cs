using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using LogoVector.Contracts;
using LogoVector.Converter;
using LogoVector.Geometry;

internal static class Program
{
    static int count;
    static void Check(bool okay, string name) { if (!okay) throw new Exception("FAILED " + name); Console.WriteLine("PASS " + name); count++; }
    static ConversionResult Convert(LogoVectorConverter converter, string path, bool raster = false, double joinToleranceMm = 0)
    {
        using (var stream = File.OpenRead(path)) return converter.ConvertAsync(stream, new SourceDescriptor { FileName = Path.GetFileName(path) }, new ConversionOptions { SizeConfirmed = true, Mode = raster ? "raster" : "vector", SizeMode = raster ? "targetWidth" : "sourceUnits", TargetWidthMm = raster ? 20 : (double?)null, PdfJoinToleranceMm = joinToleranceMm }, CancellationToken.None).GetAwaiter().GetResult();
    }
    static void ExpectCode(Action action, string code)
    {
        try { action(); throw new Exception("Expected " + code); }
        catch (LogoVectorException e) { Check(e.Code == code, code); }
    }
    static int Main(string[] args)
    {
        try
        {
            string root = Path.GetFullPath(args.Length == 0 ? "." : args[0]);
            var converter = new LogoVectorConverter(Path.Combine(root, @"src\LogoVector.Worker\bin\Release\net48\LogoVector.Worker.exe"));
            var ring = Convert(converter, Path.Combine(root, @"tests\sample-ring.logo.json"));
            Check(ring.Status == "ready" && ring.GeometryValid && ring.Logo.Regions.Count == 1 && ring.Logo.Regions[0].Holes.Count == 1, "A03 ring topology");
            double area = Math.Abs(PolygonArea(ring.Logo.Regions[0].Outer)) - Math.Abs(PolygonArea(ring.Logo.Regions[0].Holes[0]));
            Check(area == 168 && ring.Logo.SizeMm.SequenceEqual(new[] { 20.0, 12.0 }), "A03 area and size");
            var compound = Convert(converter, Path.Combine(root, @"tests\sample-compound.svg"));
            Check(compound.Report.GeometryHash == ring.Report.GeometryHash, "SVG and JSON geometry match");
            string rasterDir = Path.Combine(root, @"agent\temp\smoke-fixtures");
            Directory.CreateDirectory(rasterDir);
            GenerateRasterFixtures(rasterDir);
            foreach (string ext in new[] { "png", "bmp", "jpg" })
            {
                var bitmap = Convert(converter, Path.Combine(rasterDir, "sample-ring." + ext), true);
                Check(bitmap.Status == "needsReview" && bitmap.ReviewRequired && bitmap.Report.GeometryHash == ring.Report.GeometryHash, "raster " + ext + " review and topology");
            }
            var pdf = Path.Combine(rasterDir, "sample-ring.pdf");
            GeneratePdf(pdf, "0 0 20 12 re 4 2 12 8 re f*");
            var pdfResult = Convert(converter, pdf);
            Check(pdfResult.Status == "ready" && pdfResult.Logo.Regions[0].Holes.Count == 1, "PDF evenodd hole");
            Check(Math.Abs(pdfResult.Logo.SizeMm[0] - 20 * 25.4 / 72) < 1e-8, "PDF point to mm");
            AssertClosed(pdfResult, "PDF paths closed");
            var strokeStatePdf = Path.Combine(rasterDir, "fill-with-stroke-state.pdf");
            GeneratePdf(strokeStatePdf, "1 J 2 j 3 w 5 M [2 1] 0 d 0 0 20 12 re 4 2 12 8 re f*");
            var strokeStateResult = Convert(converter, strokeStatePdf);
            Check(strokeStateResult.Report.GeometryHash == pdfResult.Report.GeometryHash, "PDF J stroke state does not change fill topology");
            AssertClosed(strokeStateResult, "PDF J fill paths closed");
            var curvedPdf = Path.Combine(rasterDir, "curved.pdf");
            GeneratePdf(curvedPdf, "0 0 m 0 10 10 10 10 0 c 10 -10 0 -10 0 0 c f");
            var curvedResult = Convert(converter, curvedPdf);
            Check(curvedResult.Report.ApproximationBoundMm <= curvedResult.Report.RequestedToleranceMm, "PDF Bezier tolerance");
            AssertClosed(curvedResult, "PDF Bezier closed");
            var ai = Path.Combine(rasterDir, "sample-ring.ai"); File.Copy(pdf, ai, true);
            Check(Convert(converter, ai).Report.GeometryHash == pdfResult.Report.GeometryHash, "PDF-compatible AI");
            var pages = Path.Combine(rasterDir, "two-pages.pdf"); GenerateTwoPagePdf(pages);
            using (var stream = File.OpenRead(pages)) { var inspection = converter.InspectAsync(stream, new SourceDescriptor { FileName = "two-pages.pdf" }, new InspectOptions(), CancellationToken.None).GetAwaiter().GetResult(); Check(inspection.PageCount == 2 && inspection.SelectedPage == null, "PDF multipage inspection"); }
            ExpectCode(() => Convert(converter, pages), "PAGE_REQUIRED");
            using (var stream = File.OpenRead(pages)) { var second = converter.ConvertAsync(stream, new SourceDescriptor { FileName = "two-pages.pdf" }, new ConversionOptions { SizeConfirmed = true, Page = 2 }, CancellationToken.None).GetAwaiter().GetResult(); Check(Math.Abs(second.Logo.SizeMm[0] - 10 * 25.4 / 72) < 1e-8, "PDF selected second page"); AssertClosed(second, "PDF second page closed"); }
            var stroke = Path.Combine(rasterDir, "open-stroke.pdf");
            GeneratePdf(stroke, "0 0 m 20 0 l S");
            ExpectCode(() => Convert(converter, stroke), "OPEN_CONTOUR");
            GeneratePdf(stroke, "1 J 0 0 m 20 0 l S");
            ExpectCode(() => Convert(converter, stroke), "OPEN_CONTOUR");
            var fragments = Path.Combine(rasterDir, "fragments.pdf");
            GeneratePdf(fragments, "0 0 m 20 0 l S 20 0 m 20 10 l S 20 10 m 0 10 l S 0 10 m 0 0.12 l S 20 0 m 20.12 0 l S");
            var joined = Convert(converter, fragments, joinToleranceMm: 0.05);
            Check(joined.Status == "needsReview" && joined.Report.Method == "pdf-linework-reconstruction" && System.Convert.ToInt32(joined.Logo.Source["lineworkRepairs"]) == 2, "fragment gap and spur repair");
            AssertClosed(joined, "reconstructed linework closed");
            var scaledFragments = Path.Combine(rasterDir, "scaled-fragments.pdf");
            GeneratePdf(scaledFragments, "0 0 m 170 0 l S 170 0 m 170 35 l S 170 35 m 0 35 l S 0 35 m 0 0.36 l S");
            ExpectCode(() => Convert(converter, scaledFragments, joinToleranceMm: 0.05), "OPEN_CONTOUR");
            var scaledJoined = Convert(converter, scaledFragments);
            Check(scaledJoined.Status == "needsReview" && scaledJoined.Logo.Regions.Count == 1 &&
                Math.Abs(System.Convert.ToDouble(scaledJoined.Logo.Source["joinToleranceMm"]) - 170 * 0.0025 * 25.4 / 72) < 1e-8,
                "PDF join tolerance follows complete logo width");
            AssertClosed(scaledJoined, "scaled linework closed");
            var backtrack = Path.Combine(rasterDir, "short-backtrack.pdf");
            GeneratePdf(backtrack, "0 0 m 20 0 l 19.88 0 l 20 10 l 0 10 l 0 0 l S");
            var backtrackResult = Convert(converter, backtrack, joinToleranceMm: 0.05);
            Check(backtrackResult.Status == "needsReview" && System.Convert.ToInt32(backtrackResult.Logo.Source["lineworkRepairs"]) == 1, "PDF short return inside preceding edge removed");
            AssertClosed(backtrackResult, "short backtrack closed");
            GeneratePdf(backtrack, "0 0 m 20 0 l 20 10 l 20.12 10 l 19.76 10 l 0 10 l 0 0 l S");
            backtrackResult = Convert(converter, backtrack, joinToleranceMm: 0.05);
            Check(backtrackResult.Status == "needsReview" && System.Convert.ToInt32(backtrackResult.Logo.Source["lineworkRepairs"]) == 1, "PDF short return past preceding edge removed");
            AssertClosed(backtrackResult, "overshoot backtrack closed");
            var dxf = Path.Combine(rasterDir, "sample-ring.dxf");
            GenerateDxf(dxf, true);
            var dxfResult = Convert(converter, dxf);
            Check(dxfResult.Report.GeometryHash == ring.Report.GeometryHash, "DXF R2000 mm ring and hole");
            AssertClosed(dxfResult, "DXF paths closed");
            var lineDxf = Path.Combine(rasterDir, "closed-line.dxf");
            GenerateLineDxf(lineDxf);
            AssertClosed(Convert(converter, lineDxf), "DXF joined LINE closed");
            var openDxf = Path.Combine(rasterDir, "open-line.dxf");
            GenerateDxf(openDxf, false);
            ExpectCode(() => Convert(converter, openDxf), "OPEN_CONTOUR");
            for (int i = 0; i < 5; i++) Check(Convert(converter, Path.Combine(root, @"tests\sample-ring.logo.json")).Report.GeometryHash == ring.Report.GeometryHash, "deterministic hash " + (i + 1));
            using (var svg = new MemoryStream(Encoding.UTF8.GetBytes(ring.Svg)))
            {
                var roundtrip = converter.ConvertAsync(svg, new SourceDescriptor { FileName = "roundtrip.svg" }, new ConversionOptions { SizeConfirmed = true }, CancellationToken.None).GetAwaiter().GetResult();
                Check(roundtrip.Report.GeometryHash == ring.Report.GeometryHash, "normalized SVG roundtrip");
            }
            var island = LogoGeometry.Normalize("island", new[] {
                new LogoRegion { Outer = Rect(-10,-6,10,6), Holes = new List<List<double[]>> { Rect(-6,-3,6,3) } },
                new LogoRegion { Outer = Rect(-2,-1,2,1) }
            }, new Dictionary<string, object>());
            Check(island.Regions.Count == 2, "island in hole");
            ExpectCode(() => LogoGeometry.Normalize("bad", new[] { new LogoRegion { Outer = new List<double[]> { new[] { 0.0, 0.0 }, new[] { 2.0, 2.0 }, new[] { 0.0, 2.0 }, new[] { 2.0, 0.0 } } } }, new Dictionary<string, object>()), "INVALID_CONTOUR");
            using (var dangerous = new MemoryStream(Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20mm\" height=\"12mm\" onload=\"alert(1)\"><rect x=\"0\" y=\"0\" width=\"20\" height=\"12\"/></svg>")))
                ExpectCode(() => converter.ConvertAsync(dangerous, new SourceDescriptor { FileName = "unsafe.svg" }, new ConversionOptions { SizeConfirmed = true }, CancellationToken.None).GetAwaiter().GetResult(), "UNSUPPORTED_RENDER_FEATURE");
            Console.WriteLine("PASS TOTAL " + count);
            return 0;
        }
        catch (Exception e) { Console.Error.WriteLine(e); return 1; }
    }
    static double PolygonArea(IList<double[]> ring) { double a = 0; for (int i = 0; i < ring.Count; i++) a += ring[i][0] * ring[(i + 1) % ring.Count][1] - ring[(i + 1) % ring.Count][0] * ring[i][1]; return a / 2; }
    static void AssertClosed(ConversionResult result, string label)
    {
        int rings = 0;
        foreach (var region in result.Logo.Regions) foreach (var path in new[] { region.Outer }.Concat(region.Holes))
        {
            Check(path.Count >= 3 && Math.Abs(PolygonArea(path)) > 1e-9 && Math.Abs(path[0][0] - path[path.Count - 1][0]) + Math.Abs(path[0][1] - path[path.Count - 1][1]) > 1e-9, label + " ring " + ++rings);
        }
        Check(result.Svg.Split('Z').Length - 1 == rings, label + " SVG Z count");
    }
    static void GeneratePdf(string path, string content)
    {
        string[] objects = { "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>", "<< /Length " + Encoding.ASCII.GetByteCount(content) + " >>\nstream\n" + content + "\nendstream" };
        var data = new StringBuilder("%PDF-1.4\n"); var offsets = new List<int> { 0 };
        for (int i = 0; i < objects.Length; i++) { offsets.Add(Encoding.ASCII.GetByteCount(data.ToString())); data.Append(i + 1).Append(" 0 obj\n").Append(objects[i]).Append("\nendobj\n"); }
        int xref = Encoding.ASCII.GetByteCount(data.ToString()); data.Append("xref\n0 5\n0000000000 65535 f \n");
        foreach (int offset in offsets.Skip(1)) data.Append(offset.ToString("D10")).Append(" 00000 n \n");
        data.Append("trailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n").Append(xref).Append("\n%%EOF\n");
        File.WriteAllText(path, data.ToString(), Encoding.ASCII);
    }
    static void GenerateTwoPagePdf(string path)
    {
        string one = "0 0 20 12 re f", two = "0 0 10 5 re f";
        string[] objects = { "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 5 0 R >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 6 0 R >>", "<< /Length " + one.Length + " >>\nstream\n" + one + "\nendstream", "<< /Length " + two.Length + " >>\nstream\n" + two + "\nendstream" };
        var data = new StringBuilder("%PDF-1.4\n"); var offsets = new List<int>();
        for (int i = 0; i < objects.Length; i++) { offsets.Add(data.Length); data.Append(i + 1).Append(" 0 obj\n").Append(objects[i]).Append("\nendobj\n"); }
        int xref = data.Length; data.Append("xref\n0 7\n0000000000 65535 f \n");
        foreach (var offset in offsets) data.Append(offset.ToString("D10")).Append(" 00000 n \n");
        data.Append("trailer\n<< /Root 1 0 R /Size 7 >>\nstartxref\n").Append(xref).Append("\n%%EOF\n");
        File.WriteAllText(path, data.ToString(), Encoding.ASCII);
    }
    static void GenerateDxf(string path, bool closed)
    {
        var b = new StringBuilder("0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n");
        if (closed)
        {
            DxfPolyline(b, new[] { new[] { 0, 0 }, new[] { 20, 0 }, new[] { 20, 12 }, new[] { 0, 12 } });
            DxfPolyline(b, new[] { new[] { 4, 3 }, new[] { 16, 3 }, new[] { 16, 9 }, new[] { 4, 9 } });
        }
        else b.Append("0\nLINE\n10\n0\n20\n0\n11\n20\n21\n0\n");
        b.Append("0\nENDSEC\n0\nEOF\n"); File.WriteAllText(path, b.ToString(), Encoding.ASCII);
    }
    static void DxfPolyline(StringBuilder b, int[][] points)
    {
        b.Append("0\nLWPOLYLINE\n70\n1\n90\n").Append(points.Length).Append('\n');
        foreach (var p in points) b.Append("10\n").Append(p[0]).Append("\n20\n").Append(p[1]).Append('\n');
    }
    static void GenerateLineDxf(string path)
    {
        var b = new StringBuilder("0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n");
        var points = new[] { new[] { 0, 0 }, new[] { 20, 0 }, new[] { 20, 12 }, new[] { 0, 12 } };
        for (int i = 0; i < points.Length; i++) { var a = points[i]; var c = points[(i + 1) % points.Length]; b.Append("0\nLINE\n10\n").Append(a[0]).Append("\n20\n").Append(a[1]).Append("\n11\n").Append(c[0]).Append("\n21\n").Append(c[1]).Append('\n'); }
        b.Append("0\nENDSEC\n0\nEOF\n"); File.WriteAllText(path, b.ToString(), Encoding.ASCII);
    }
    static List<double[]> Rect(double x0, double y0, double x1, double y1) => new List<double[]> { new[] { x0, y0 }, new[] { x1, y0 }, new[] { x1, y1 }, new[] { x0, y1 } };
    static void GenerateRasterFixtures(string directory)
    {
        foreach (string ext in new[] { "png", "bmp", "jpg" }) using (var image = new Bitmap(40, 24))
        {
            for (int y = 0; y < 24; y++) for (int x = 0; x < 40; x++)
            {
                bool hole = x >= 8 && x < 32 && y >= 6 && y < 18;
                image.SetPixel(x, y, hole ? (ext == "png" ? Color.Transparent : Color.White) : Color.Black);
            }
            image.Save(Path.Combine(directory, "sample-ring." + ext), ext == "png" ? ImageFormat.Png : ext == "bmp" ? ImageFormat.Bmp : ImageFormat.Jpeg);
        }
    }
}
