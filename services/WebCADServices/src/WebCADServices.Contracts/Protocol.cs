using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace WebCADServices.Contracts
{
    public sealed class ServiceError : Exception
    {
        public string Code { get; }
        public int Status { get; }
        public string Stage { get; }
        public string DiagnosticsRef { get; }
        public JObject SupportBinding { get; }
        public ServiceError(string code, string message, int status = 400,string stage=null,string diagnosticsRef=null,JObject supportBinding=null) : base(message) { Code = code; Status = status;Stage=stage;DiagnosticsRef=diagnosticsRef;SupportBinding=supportBinding; }
        public JObject Body(string stage = "request") => JObject.FromObject(new { code = Code, message = Message, stage=Stage??stage, retryable = Status == 503, recoveryAction = "Read job state before resubmitting", sourceVersion = "services-v1", diagnosticsRef = DiagnosticsRef, supportBinding=SupportBinding });
    }
    public sealed class WireRequest
    {
        public string Method { get; set; }
        public string Route { get; set; }
        public string Credential { get; set; }
        public string FileName { get; set; }
        public string IdempotencyKey { get; set; }
        public string AssetKind { get; set; }
        public byte[] Body { get; set; }
    }
    public sealed class WireResponse
    {
        public int Status { get; set; }
        public string ContentType { get; set; } = "application/json";
        public byte[] Body { get; set; }
        public static WireResponse Json(object value, int status = 200) => new WireResponse { Status = status, Body = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(value)) };
    }
    public static class Protocol
    {
        public const string Version = "1.0";
        public const int MaxUpload = 20 * 1024 * 1024;
        public const int MaxGeometryUpload = 64 * 1024 * 1024;
        public const int MaxNativePlan = 4 * 1024 * 1024;
        public static string Hash(byte[] bytes) { using (var sha = SHA256.Create()) return string.Concat(sha.ComputeHash(bytes).Select(v => v.ToString("x2"))); }
        public static JObject Parse(byte[] bytes,int maxBytes=1024*1024)
        {
            if (bytes == null || bytes.Length > maxBytes) throw new ServiceError("SIZE_LIMIT", "JSON request exceeds its declared byte budget");
            using (var reader = new JsonTextReader(new System.IO.StringReader(Encoding.UTF8.GetString(bytes))) { MaxDepth = 32, DateParseHandling = DateParseHandling.None })
            {
                var value = JObject.Load(reader, new JsonLoadSettings { DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error });
                if (reader.Read()) throw new ServiceError("PARAM_SCHEMA_INVALID", "Trailing JSON content");
                CheckFinite(value); return value;
            }
        }
        public static void Keys(JObject value, params string[] names)
        {
            if (value.Properties().Any(p => !names.Contains(p.Name))) throw new ServiceError("PARAM_SCHEMA_INVALID", "Unknown request field");
        }
        static void CheckFinite(JToken value)
        {
            if (value.Type == JTokenType.Float && (double.IsInfinity((double)value) || double.IsNaN((double)value))) throw new ServiceError("PARAM_SCHEMA_INVALID", "Nonfinite number");
            if (value is JContainer container) foreach (var child in container.Children()) CheckFinite(child);
        }
    }
}
