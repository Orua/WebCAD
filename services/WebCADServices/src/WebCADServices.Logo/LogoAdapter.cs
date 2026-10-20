using System;
using System.Globalization;
using System.Linq;
using LogoVector.Contracts;
using LogoVector.Geometry;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using WebCADServices.Contracts;

namespace WebCADServices.Logo
{
    public static class LogoAdapter
    {
        static readonly JsonSerializer Camel = JsonSerializer.Create(new JsonSerializerSettings { ContractResolver = new CamelCasePropertyNamesContractResolver(), MaxDepth = 32 });
        public static JObject ValidateOptions(JObject options, bool inspect)
        {
            options = options ?? new JObject();
            Protocol.Keys(options, inspect ? new[] { "page", "pdfJoinToleranceMm", "targetWidthMm" } : new[] { "mode", "page", "sizeMode", "targetWidthMm", "mmPerSourceUnit", "sizeConfirmed", "toleranceMm", "pdfJoinToleranceMm", "raster" });
            if (options["page"] != null && (options["page"].Type != JTokenType.Integer || (int)options["page"] < 1 || (int)options["page"] > 1000)) throw new ServiceError("PARAM_SCHEMA_INVALID", "Page must be 1..1000");
            if (options["pdfJoinToleranceMm"] != null)
            {
                var token = options["pdfJoinToleranceMm"];
                if ((token.Type != JTokenType.Integer && token.Type != JTokenType.Float) || double.IsNaN((double)token) || double.IsInfinity((double)token) || (double)token < 0 || (double)token > .1) throw new ServiceError("PARAM_SCHEMA_INVALID", "PDF join tolerance must be a finite number 0..0.1 mm (0 = source width * 0.0025)");
            }
            if (inspect && options["targetWidthMm"] != null)
            {
                var token = options["targetWidthMm"];
                if ((token.Type != JTokenType.Integer && token.Type != JTokenType.Float) || double.IsNaN((double)token) || double.IsInfinity((double)token) || (double)token <= 0 || (double)token > 10000) throw new ServiceError("PARAM_SCHEMA_INVALID", "Inspect targetWidthMm must be a finite positive dimension <= 10000 mm");
            }
            if (!inspect)
            {
                if ((bool?)options["sizeConfirmed"] != true) throw new ServiceError("SIZE_REQUIRED", "Confirm physical dimensions before conversion");
                foreach (var name in new[] { "targetWidthMm", "mmPerSourceUnit", "toleranceMm" })
                    if (options[name] != null && ((double)options[name] <= 0 || (double)options[name] > 10000)) throw new ServiceError("PARAM_SCHEMA_INVALID", "Invalid positive dimension");
                if (options["raster"] != null)
                {
                    if (!(options["raster"] is JObject raster)) throw new ServiceError("PARAM_SCHEMA_INVALID", "raster must be an object");
                    Protocol.Keys(raster, "threshold", "invert", "alphaThreshold", "smoothingPx");
                    var smoothing = raster["smoothingPx"];
                    if (smoothing != null && ((smoothing.Type != JTokenType.Integer && smoothing.Type != JTokenType.Float) || double.IsNaN((double)smoothing) || double.IsInfinity((double)smoothing) || (double)smoothing < 0 || (double)smoothing > .5)) throw new ServiceError("PARAM_SCHEMA_INVALID", "raster.smoothingPx must be a finite number 0..0.5 source pixels (default 0)");
                    foreach (var name in new[] { "threshold", "alphaThreshold" })
                    {
                        var value = raster[name];
                        if (value != null && (value.Type != JTokenType.Integer || !int.TryParse(value.ToString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out int number) || number < 0 || number > 255))
                            throw new ServiceError("PARAM_SCHEMA_INVALID", "raster." + name + " must be a 0..255 integer; defaults are threshold=128 and alphaThreshold=1");
                    }
                    if (raster["invert"] != null && raster["invert"].Type != JTokenType.Boolean) throw new ServiceError("PARAM_SCHEMA_INVALID", "raster.invert must be boolean (default false)");
                }
                options.ToObject<ConversionOptions>();
            }
            return options;
        }
        public static JObject Normalize(JObject output, bool inspect, JObject options)
        {
            if (output["Code"] != null || output["code"] != null) throw new ServiceError((string)(output["Code"] ?? output["code"]), (string)(output["Message"] ?? output["message"]));
            if (inspect) return JObject.FromObject(output.ToObject<InspectionResult>(), Camel);
            var converted = output.ToObject<ConversionResult>();
            if (!converted.GeometryValid || converted.Logo == null) throw new ServiceError("GEOMETRY_INVALID", "Logo parser did not validate contours");
            var measured = LogoGeometry.Normalize(converted.Logo.Name, converted.Logo.Regions, converted.Logo.Source);
            if (converted.Logo.SizeMm == null || converted.Logo.SizeMm.Length != 2 || measured.SizeMm.Zip(converted.Logo.SizeMm, (a, b) => Math.Abs(a - b)).Any(x => x > 1e-6)) throw new ServiceError("GEOMETRY_INVALID", "Logo dimensions differ from contour bounds");
            var logoDocument = JObject.FromObject(converted.Logo, Camel);
            // Source is a dictionary of object: deserialization leaves the nested
            // original document as JObject, whose keys bypass ContractResolver.
            // Rehydrate only this known DTO; never re-normalize its coordinates/hash.
            var originalToken = logoDocument["source"]?["rasterOriginalContours"];
            if (originalToken != null)
            {
                if (!(originalToken is JObject)) throw new ServiceError("GEOMETRY_INVALID", "Original pixel contours must be a logo document");
                var original = originalToken.ToObject<LogoDocument>();
                logoDocument["source"]["rasterOriginalContours"] = JObject.FromObject(original, Camel);
            }
            return new JObject
            {
                ["status"] = converted.Status,
                ["geometryValid"] = true,
                ["reviewRequired"] = converted.ReviewRequired,
                ["sizeConfirmed"] = (bool)options["sizeConfirmed"],
                ["logoDocument"] = logoDocument,
                ["previewSvg"] = converted.Svg,
                ["conversionReport"] = JObject.FromObject(converted.Report, Camel)
            };
        }
    }
}
