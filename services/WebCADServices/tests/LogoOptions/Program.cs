using System;
using System.IO;
using LogoVector.Contracts;
using LogoVector.Geometry;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;
using WebCADServices.Logo;

internal static class Program
{
    static int count;
    static JObject Options(string raster) => JObject.Parse("{\"sizeConfirmed\":true" + (raster == null ? "" : ",\"raster\":" + raster) + "}");
    static void Main(string[] args)
    {
        foreach (string raster in new[] { "null", "[]", "128", "{\"threshold\":0.5}", "{\"threshold\":128.0}", "{\"threshold\":\"128\"}", "{\"threshold\":null}", "{\"threshold\":-1}", "{\"threshold\":256}", "{\"threshold\":9999999999999999999999999}", "{\"alphaThreshold\":0.1}", "{\"alphaThreshold\":\"1\"}", "{\"alphaThreshold\":256}", "{\"invert\":1}", "{\"invert\":\"true\"}", "{\"invert\":null}", "{\"smoothing\":true}" })
        {
            try { LogoAdapter.ValidateOptions(Options(raster), false); throw new Exception("Unexpected accepted raster=" + raster); }
            catch (ServiceError error) { if (error.Code != "PARAM_SCHEMA_INVALID") throw; count++; }
        }
        foreach (string raster in new[] { null, "{}", "{\"threshold\":0,\"alphaThreshold\":255,\"invert\":false}", "{\"threshold\":255,\"alphaThreshold\":0,\"invert\":true}", "{\"threshold\":128,\"alphaThreshold\":1,\"invert\":false}" })
        {
            var input = Options(raster); string before = input.ToString(); var valid = LogoAdapter.ValidateOptions(input, false);
            if (valid.ToString() != before) throw new Exception("Validation mutated request fingerprint");
            var dto = valid.ToObject<ConversionOptions>();
            if ((raster == null || raster == "{}") && (dto.Raster.Threshold != 128 || dto.Raster.AlphaThreshold != 1 || dto.Raster.Invert)) throw new Exception("Default byte thresholds changed");
            count++;
        }
        foreach (bool inspect in new[] { true, false })
        {
            foreach (string json in new[] { "null", "\"0.01\"", "-0.01", "0.11", "NaN", "Infinity" })
            {
                var options = inspect ? new JObject() : Options(null); options["pdfJoinToleranceMm"] = JToken.Parse(json);
                try { LogoAdapter.ValidateOptions(options, inspect); throw new Exception("Unexpected PDF tolerance accepted"); }
                catch (ServiceError error) { if (error.Code != "PARAM_SCHEMA_INVALID") throw; count++; }
            }
            foreach (double tolerance in new[] { 0, .02, .1 })
            {
                var options = inspect ? new JObject() : Options(null); options["pdfJoinToleranceMm"] = tolerance; options["targetWidthMm"] = 10;
                string before = options.ToString(); if (LogoAdapter.ValidateOptions(options, inspect).ToString() != before) throw new Exception("PDF validation changed options"); count++;
            }
        }
        foreach (string value in new[] { "null", "\"0.1\"", "true", "-0.01", "0.51", "NaN", "Infinity" })
        {
            var options = Options("{}"); options["raster"]["smoothingPx"] = JToken.Parse(value);
            try { LogoAdapter.ValidateOptions(options, false); throw new Exception("Invalid smoothingPx accepted"); }
            catch (ServiceError error) { if (error.Code != "PARAM_SCHEMA_INVALID") throw; count++; }
        }
        foreach (double value in new[] { 0, .01, .5 })
        {
            var options = Options("{}"); options["raster"]["smoothingPx"] = value; string before = options.ToString();
            if (LogoAdapter.ValidateOptions(options, false).ToString() != before) throw new Exception("Smoothing validation mutated request"); count++;
        }
        if (args.Length == 1)
        {
            var workerOutput = JObject.Parse(File.ReadAllText(args[0]));
            var before = workerOutput["Logo"]["Source"]["rasterOriginalContours"].ToObject<LogoDocument>();
            string beforeHash = LogoGeometry.GeometryHash(before);
            var normalized = LogoAdapter.Normalize(workerOutput, false, new JObject { ["sizeConfirmed"] = true });
            var raw = normalized["logoDocument"]["source"]["rasterOriginalContours"];
            if ((string)raw["type"] != "webcad-logo" || (int)raw["version"] != 1 || (string)raw["units"] != "mm" || !(raw["regions"] is JArray) || raw["Type"] != null || raw["Regions"] != null || raw["regions"][0]["outer"] == null || raw["regions"][0]["Outer"] != null) throw new Exception("Original nested document did not normalize to canonical camelCase");
            var after = raw.ToObject<LogoDocument>();
            if (!JToken.DeepEquals(JObject.FromObject(before), JObject.FromObject(after)) || LogoGeometry.GeometryHash(after) != beforeHash) throw new Exception("Nested normalization changed original coordinates or source/hash fields");
            string recordedHash = (string)normalized["logoDocument"]["source"]["rasterSmoothing"]["originalGeometryHash"];
            if (recordedHash != beforeHash) throw new Exception("Original geometry proof no longer matches");
            if (!JToken.DeepEquals(workerOutput["Logo"]["Source"]["rasterOriginalContours"], JObject.FromObject(before))) throw new Exception("Worker source object was mutated");
            count++; Console.WriteLine("PASS real Worker Normalize original-contour camelCase roundtrip, coordinates and geometry proof unchanged");
        }
        Console.WriteLine("PASS Logo Services option checks: " + count);
    }
}
