using System;
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
            Protocol.Keys(options, inspect ? new[] { "page" } : new[] { "mode", "page", "sizeMode", "targetWidthMm", "mmPerSourceUnit", "sizeConfirmed", "toleranceMm", "pdfJoinToleranceMm", "raster" });
            if (options["page"] != null && (options["page"].Type != JTokenType.Integer || (int)options["page"] < 1 || (int)options["page"] > 1000)) throw new ServiceError("PARAM_SCHEMA_INVALID", "Page must be 1..1000");
            if (!inspect)
            {
                if ((bool?)options["sizeConfirmed"] != true) throw new ServiceError("SIZE_REQUIRED", "Confirm physical dimensions before conversion");
                foreach (var name in new[] { "targetWidthMm", "mmPerSourceUnit", "toleranceMm" })
                    if (options[name] != null && ((double)options[name] <= 0 || (double)options[name] > 10000)) throw new ServiceError("PARAM_SCHEMA_INVALID", "Invalid positive dimension");
                if (options["pdfJoinToleranceMm"] != null && ((double)options["pdfJoinToleranceMm"] < 0 || (double)options["pdfJoinToleranceMm"] > .1)) throw new ServiceError("PARAM_SCHEMA_INVALID", "PDF join tolerance must be 0..0.1 mm");
                if (options["raster"] is JObject raster) Protocol.Keys(raster, "threshold", "invert", "alphaThreshold");
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
            return new JObject
            {
                ["status"] = converted.Status,
                ["geometryValid"] = true,
                ["reviewRequired"] = converted.ReviewRequired,
                ["sizeConfirmed"] = (bool)options["sizeConfirmed"],
                ["logoDocument"] = JObject.FromObject(converted.Logo, Camel),
                ["previewSvg"] = converted.Svg,
                ["conversionReport"] = JObject.FromObject(converted.Report, Camel)
            };
        }
    }
}
