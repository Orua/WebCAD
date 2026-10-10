using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using LogoVector.Contracts;
using LogoVector.Geometry;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace LogoVector.Worker
{
    internal static class Program
    {
        static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;
        static void Main(string[] args)
        {
            if (args.Length != 1) { Environment.ExitCode = 2; return; }
            string output = null;
            try
            {
                var request = JObject.Parse(File.ReadAllText(args[0]));
                CheckCancellation(args[0]);
                output = (string)request["outputPath"];
                string sourcePath = (string)request["sourcePath"], sourceName = (string)request["sourceName"], hash = (string)request["sourceHash"];
                if (string.IsNullOrWhiteSpace(output) || string.IsNullOrWhiteSpace(sourcePath) || !File.Exists(sourcePath)) throw new LogoVectorException("MALFORMED_FILE", "Worker 请求不完整。");
                var bytes = File.ReadAllBytes(sourcePath);
                string format = Detect(bytes, sourceName);
                string action = (string)request["action"];
                object result = null;
                if (action == "inspect")
                {
                    if (format == "svg") ParseSvg(bytes);
                    else if (format == "logo-json")
                    {
                        var token = JObject.Parse(Encoding.UTF8.GetString(bytes));
                        if ((string)token["type"] != "webcad-logo" || (int?)token["version"] != 1 || (string)token["units"] != "mm") throw new LogoVectorException("FORMAT_VARIANT_UNSUPPORTED", "仅支持 webcad-logo v1 毫米文件。");
                    }
                    else if (format == "pdf" || format == "pdf-ai") { int? selected = (int?)request["options"]?["page"]; int count = PdfAdapter.CountPages(bytes); if (selected.HasValue || count == 1) PdfAdapter.Parse(bytes, selected); result = new InspectionResult { Status = "needsInput", SourceSha256 = hash, DetectedFormat = format, PageCount = count, SelectedPage = selected ?? (count == 1 ? 1 : (int?)null), Message = count > 1 && !selected.HasValue ? "请选择 PDF 页面。" : "已识别矢量页面；请确认尺寸后转换。" }; }
                    else if (format == "dxf") DxfAdapter.Parse(bytes);
                    else { using (var stream = new MemoryStream(bytes)) if (!StbImageSharp.ImageInfo.FromStream(stream).HasValue) throw new LogoVectorException("MALFORMED_FILE", "位图解码失败。"); }
                    if (result == null) result = new InspectionResult { Status = "needsInput", SourceSha256 = hash, DetectedFormat = format, Message = "已识别文件；请确认尺寸和参数后转换。" };
                }
                else if (action == "convert") result = Convert(bytes, sourceName, hash, format, request["options"].ToObject<ConversionOptions>());
                else throw new LogoVectorException("MALFORMED_FILE", "未知操作。");
                CheckCancellation(args[0]);
                File.WriteAllText(output, JsonConvert.SerializeObject(result), new UTF8Encoding(false));
            }
            catch (Exception e)
            {
                if (output != null) File.WriteAllText(output, JsonConvert.SerializeObject(new ConversionError { Code = (e as LogoVectorException)?.Code ?? "MALFORMED_FILE", Message = e is LogoVectorException ? e.Message : "文件解析失败。" }), new UTF8Encoding(false));
                else Environment.ExitCode = 2;
            }
        }
        static void CheckCancellation(string requestPath)
        {
            if (File.Exists(Path.Combine(Path.GetDirectoryName(requestPath), "cancel.flag"))) throw new LogoVectorException("WORKER_CANCELLED", "Cancelled at a parser stage boundary.");
        }
        static string Detect(byte[] data, string name)
        {
            string ext = Path.GetExtension(name).ToLowerInvariant();
            string prefix = Encoding.UTF8.GetString(data, 0, Math.Min(data.Length, 256)).TrimStart('\uFEFF', ' ', '\t', '\r', '\n');
            if (ext == ".logo.json" || name.EndsWith(".logo.json", StringComparison.OrdinalIgnoreCase)) { if (!prefix.StartsWith("{", StringComparison.Ordinal)) throw new LogoVectorException("TYPE_MISMATCH", "不是 JSON 文件。"); return "logo-json"; }
            if (ext == ".svg") { if (!prefix.StartsWith("<", StringComparison.Ordinal)) throw new LogoVectorException("TYPE_MISMATCH", "不是 SVG 文件。"); return "svg"; }
            if (ext == ".pdf" || ext == ".ai") { if (!prefix.StartsWith("%PDF-", StringComparison.Ordinal)) throw new LogoVectorException("TYPE_MISMATCH", "不是 PDF-compatible 文件。"); return ext == ".ai" ? "pdf-ai" : "pdf"; }
            if (ext == ".dxf") { if (!prefix.StartsWith("0\nSECTION", StringComparison.Ordinal) && !prefix.StartsWith("0\r\nSECTION", StringComparison.Ordinal)) throw new LogoVectorException("TYPE_MISMATCH", "不是 ASCII DXF。"); return "dxf"; }
            if (ext == ".png" && data.Length >= 8 && data[0] == 137 && data[1] == 80 && data[2] == 78 && data[3] == 71) return "raster";
            if ((ext == ".jpg" || ext == ".jpeg") && data.Length >= 3 && data[0] == 255 && data[1] == 216 && data[2] == 255) return "raster";
            if (ext == ".bmp" && data.Length >= 2 && data[0] == 66 && data[1] == 77) return "raster";
            if (new[] { ".png", ".jpg", ".jpeg", ".bmp" }.Contains(ext)) throw new LogoVectorException("TYPE_MISMATCH", "文件签名与扩展名不符。");
            throw new LogoVectorException("UNSUPPORTED_FORMAT", "文件格式尚未启用。");
        }
        static ConversionResult Convert(byte[] bytes, string name, string hash, string format, ConversionOptions options)
        {
            if (options == null || options.Mode != (format == "raster" ? "raster" : "vector") || options.ToleranceMm <= 0 || options.ToleranceMm > 0.1) throw new LogoVectorException("INVALID_OPTIONS", "转换参数无效。");
            if (!options.SizeConfirmed) throw new LogoVectorException("SIZE_REQUIRED", "请先确认实际毫米尺寸。");
            List<LogoRegion> regions; double nativeWidth; string method; bool pdfCurves = false, reconstructed = false; int repairs = 0; double joinToleranceMm = 0; double? sourceUnitMm = null; string version = null;
            if (format == "logo-json")
            {
                var token = JObject.Parse(Encoding.UTF8.GetString(bytes));
                if ((string)token["type"] != "webcad-logo" || (int?)token["version"] != 1 || (string)token["units"] != "mm" || token["regions"] == null) throw new LogoVectorException("FORMAT_VARIANT_UNSUPPORTED", "仅支持 webcad-logo v1 毫米文件。");
                var doc = token.ToObject<LogoDocument>();
                if (doc.SizeMm == null || doc.SizeMm.Length != 2) throw new LogoVectorException("INVALID_CONTOUR", "缺少尺寸。");
                var measured = LogoGeometry.Normalize("measure", doc.Regions, new Dictionary<string, object>());
                if (Math.Abs(measured.SizeMm[0] - doc.SizeMm[0]) > 1e-6 || Math.Abs(measured.SizeMm[1] - doc.SizeMm[1]) > 1e-6) throw new LogoVectorException("INVALID_CONTOUR", "标注尺寸与实际轮廓不符。");
                regions = doc.Regions; nativeWidth = doc.SizeMm[0]; method = "vector-normalization";
            }
            else if (format == "svg") { var parsed = ParseSvg(bytes); regions = parsed.Item1; nativeWidth = parsed.Item2; method = "vector-extraction"; }
            else if (format == "pdf" || format == "pdf-ai") { var parsed = PdfAdapter.Parse(bytes, options.Page, options); regions = parsed.Regions; nativeWidth = parsed.WidthPoints; pdfCurves = parsed.Curves; reconstructed = parsed.Reconstructed; repairs = parsed.Repairs; joinToleranceMm = parsed.JoinToleranceMm; method = reconstructed ? "pdf-linework-reconstruction" : "pdf-vector-extraction"; }
            else if (format == "dxf") { var parsed = DxfAdapter.Parse(bytes); regions = parsed.Regions; nativeWidth = parsed.Width; sourceUnitMm = parsed.MmPerUnit; version = parsed.Version; method = "dxf-vector-extraction"; }
            else { var parsed = RasterTracer.Trace(bytes, options.Raster); regions = parsed.Item1; nativeWidth = parsed.Item2; method = "raster-tracing"; }
            if (!(nativeWidth > 0)) throw new LogoVectorException("SIZE_REQUIRED", "缺少可靠的物理宽度。");
            double factor;
            if (options.SizeMode == "sourceUnits") factor = format == "pdf" || format == "pdf-ai" ? 25.4 / 72 : format == "dxf" ? sourceUnitMm ?? throw new LogoVectorException("SIZE_REQUIRED", "DXF 未声明可用单位，须给出目标宽度或毫米比例。") : 1;
            else if (options.SizeMode == "targetWidth" && options.TargetWidthMm > 0) factor = options.TargetWidthMm.Value / nativeWidth;
            else if (options.SizeMode == "mmPerSourceUnit" && options.MmPerSourceUnit > 0) factor = options.MmPerSourceUnit.Value;
            else throw new LogoVectorException("SIZE_REQUIRED", "需要有效目标宽度或源单位比例。");
            if (pdfCurves && factor * 0.0001 > options.ToleranceMm) throw new LogoVectorException("TOLERANCE_UNACHIEVABLE", "目标尺寸过大，PDF 曲线细分无法满足公差。");
            foreach (var r in regions) foreach (var ring in new[] { r.Outer }.Concat(r.Holes)) foreach (var p in ring) { p[0] *= factor; p[1] *= factor; }
            var source = new Dictionary<string, object> { ["kind"] = format, ["fileName"] = Path.GetFileName(name), ["sha256"] = hash, ["coordinateSystem"] = "x-right-y-up", ["origin"] = "bounds-center" };
            if (format == "pdf" || format == "pdf-ai") source["page"] = options.Page ?? 1;
            if (format == "dxf") { source["dxfVersion"] = version; source["mmPerSourceUnit"] = factor; }
            var logo = LogoGeometry.Normalize(Path.GetFileNameWithoutExtension(name), regions, source);
            var geometryHash = LogoGeometry.GeometryHash(logo);
            bool review = format == "raster" || reconstructed;
            var report = new ConversionReport { Method = method, RequestedToleranceMm = options.ToleranceMm, ApproximationBoundMm = format == "svg" ? (double?)null : pdfCurves ? factor * 0.0001 : 0, SourceReconstructionErrorMm = null, GeometryHash = geometryHash };
            if (format == "raster") report.Warnings.Add("RASTER_TRACED: 位图重建误差未知，须人工复核。");
            if (reconstructed) { report.Warnings.Add("LINEWORK_RECONSTRUCTED: 按线条中心路径重建闭环；修复 " + repairs + " 处，接合公差 " + joinToleranceMm.ToString("0.######", Invariant) + " mm，须复核。"); source["lineworkRepairs"] = repairs; source["joinToleranceMm"] = joinToleranceMm; }
            source["conversion"] = new { method, normalizationProfile = "webcad-logo-v1", requestedToleranceMm = options.ToleranceMm, approximationBoundMm = report.ApproximationBoundMm, sourceReconstructionErrorMm = report.SourceReconstructionErrorMm, reviewRequired = review, reviewReasons = reconstructed ? new[] { "LINEWORK_RECONSTRUCTED" } : review ? new[] { "RASTER_TRACED" } : new string[0], geometryHash };
            logo.Source = source;
            return new ConversionResult { Status = review ? "needsReview" : "ready", GeometryValid = true, ReviewRequired = review, Logo = logo, Svg = LogoGeometry.ToSvg(logo), Report = report };
        }
        static Tuple<List<LogoRegion>, double> ParseSvg(byte[] bytes)
        {
            var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 2 * 1024 * 1024 };
            var doc = new XmlDocument { XmlResolver = null };
            using (var stream = new MemoryStream(bytes)) using (var reader = XmlReader.Create(stream, settings)) doc.Load(reader);
            var root = doc.DocumentElement;
            if (root == null || root.LocalName != "svg" || root.NamespaceURI != "http://www.w3.org/2000/svg") throw new LogoVectorException("TYPE_MISMATCH", "无效 SVG 根节点。");
            foreach (XmlAttribute a in root.Attributes) if (!new[] { "xmlns", "width", "height", "viewBox" }.Contains(a.Name)) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "SVG 根属性未支持：" + a.Name);
            double width = Mm(root.GetAttribute("width")), height = Mm(root.GetAttribute("height"));
            if (!(width > 0) || !(height > 0)) throw new LogoVectorException("SIZE_REQUIRED", "SVG 必须有毫米制物理宽高。");
            if (root.HasAttribute("viewBox"))
            {
                var box = Regex.Split(root.GetAttribute("viewBox").Trim(), @"[\s,]+").Select(x => double.Parse(x, Invariant)).ToArray();
                if (box.Length != 4 || Math.Abs(box[2] - width) > 1e-9 || Math.Abs(box[3] - height) > 1e-9) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "此阶段要求 viewBox 与毫米尺寸一致。");
            }
            var regions = new List<LogoRegion>(); string expectedFill = null;
            foreach (XmlNode node in root.ChildNodes)
            {
                if (node.NodeType == XmlNodeType.Whitespace || node.NodeType == XmlNodeType.Comment) continue;
                if (node.NodeType != XmlNodeType.Element) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "SVG 包含未支持的内容。");
                var e = (XmlElement)node;
                if (e.LocalName != "path" && e.LocalName != "rect") throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "SVG 仅暂支持闭合 path 和 rect。");
                foreach (XmlAttribute a in e.Attributes) if (!new[] { "d", "x", "y", "width", "height", "fill", "fill-rule", "stroke" }.Contains(a.LocalName)) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "SVG 属性未支持：" + a.LocalName);
                string fill = e.GetAttribute("fill");
                if (fill == "none") throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "不可把无填充对象转成 LOGO。");
                if (expectedFill != null && !string.Equals(expectedFill, fill, StringComparison.OrdinalIgnoreCase)) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "多色 SVG 尚未支持。");
                expectedFill = fill;
                if (e.GetAttribute("stroke") != "" && e.GetAttribute("stroke") != "none") throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "描边暂未支持。");
                if (e.GetAttribute("fill-rule") != "" && e.GetAttribute("fill-rule") != "evenodd") throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "仅支持明确 evenodd 填充。");
                if (e.LocalName == "rect")
                {
                    double x = e.HasAttribute("x") ? N(e.GetAttribute("x")) : 0, y = e.HasAttribute("y") ? N(e.GetAttribute("y")) : 0, w = N(e.GetAttribute("width")), h = N(e.GetAttribute("height"));
                    if (!(w > 0) || !(h > 0)) throw new LogoVectorException("INVALID_CONTOUR", "矩形尺寸无效。");
                    regions.Add(new LogoRegion { Outer = new List<double[]> { new[] { x, -y }, new[] { x + w, -y }, new[] { x + w, -y - h }, new[] { x, -y - h } } });
                }
                else
                {
                    regions.AddRange(LogoGeometry.FromEvenOddRings(ParsePath(e.GetAttribute("d"))));
                }
            }
            if (regions.Count == 0) throw new LogoVectorException("NO_VECTOR_CONTENT", "没有闭合轮廓。");
            return Tuple.Create(regions, width);
        }
        static double N(string text) => double.Parse(text, NumberStyles.Float, Invariant);
        static double Mm(string text) => text.EndsWith("mm", StringComparison.OrdinalIgnoreCase) ? N(text.Substring(0, text.Length - 2)) : double.NaN;
        static List<List<double[]>> ParsePath(string d)
        {
            var tokens = Regex.Matches(d, @"[MLHVZmlhvz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?").Cast<Match>().Select(x => x.Value).ToList();
            if (Regex.Replace(d, @"[MLHVZmlhvz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]+", "").Length > 0) throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "路径命令未支持。");
            var rings = new List<List<double[]>>(); var points = new List<double[]>(); double x = 0, y = 0; int i = 0; char command = '\0';
            while (i < tokens.Count)
            {
                if (tokens[i].Length == 1 && char.IsLetter(tokens[i][0])) command = tokens[i++][0];
                if (command == '\0') throw new LogoVectorException("MALFORMED_FILE", "路径缺少命令。");
                bool relative = char.IsLower(command); char op = char.ToUpperInvariant(command);
                if (op == 'Z') { if (points.Count < 3) throw new LogoVectorException("OPEN_CONTOUR", "闭合路径顶点不足。"); rings.Add(points); points = new List<double[]>(); command = '\0'; continue; }
                if (op == 'M' && points.Count != 0) throw new LogoVectorException("OPEN_CONTOUR", "子路径未闭合。");
                if (i >= tokens.Count || (tokens[i].Length == 1 && char.IsLetter(tokens[i][0]))) throw new LogoVectorException("MALFORMED_FILE", "路径参数缺失。");
                double a = N(tokens[i++]);
                if (op == 'M' || op == 'L') { if (i >= tokens.Count) throw new LogoVectorException("MALFORMED_FILE", "路径参数缺失。"); double b = N(tokens[i++]); x = relative ? x + a : a; y = relative ? y + b : b; if (op == 'M') command = relative ? 'l' : 'L'; }
                else if (op == 'H') x = relative ? x + a : a;
                else if (op == 'V') y = relative ? y + a : a;
                else throw new LogoVectorException("UNSUPPORTED_RENDER_FEATURE", "路径命令未支持。");
                points.Add(new[] { x, -y });
            }
            if (points.Count != 0) throw new LogoVectorException("OPEN_CONTOUR", "路径未闭合。");
            return rings;
        }
    }
}
