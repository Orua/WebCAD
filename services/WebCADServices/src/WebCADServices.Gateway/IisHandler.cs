using System;
using System.Configuration;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using System.Web.Hosting;
using WebCADServices.Contracts;
using WebCADServices.Runtime;

namespace WebCADServices.Gateway
{
    // Same deployment shape as LogoVector: ASHX -> compiled DLL -> controlled worker.
    // No Windows Service, named pipe or Host executable is required.
    public sealed class IisHandler : HttpTaskAsyncHandler
    {
        public override bool IsReusable => true;
        public static readonly string BuildId = "sha256:" + Protocol.Hash(File.ReadAllBytes(typeof(IisHandler).Assembly.Location));
        public static bool PrivateAddress(string host)
        {
            if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase)) return true;
            IPAddress address;if (!IPAddress.TryParse(host, out address)) return false;
            if (IPAddress.IsLoopback(address)) return true;
            if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
            var bytes = address.GetAddressBytes();
            return bytes.Length == 4 && (bytes[0] == 10 || bytes[0] == 192 && bytes[1] == 168 || bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31);
        }
        public override async Task ProcessRequestAsync(HttpContext context)
        {
            var request = context.Request;var response = context.Response;
            response.SuppressFormsAuthenticationRedirect = true;response.TrySkipIisCustomErrors = true;
            response.Cache.SetCacheability(HttpCacheability.NoCache);response.Cache.SetNoStore();
            response.AppendHeader("X-WebCAD-Transport", "iis-ashx-dll-v1");response.AppendHeader("X-WebCAD-Gateway-Build", BuildId);
            try
            {
                if (!request.IsSecureConnection && (!PrivateAddress(request.Url.Host) || !PrivateAddress(request.UserHostAddress))) throw new ServiceError("LAN_ONLY", "HTTP Services is available only on the private LAN", 403);
                string origin = request.Headers["Origin"],allowed = ConfigurationManager.AppSettings["WebCAD.AllowedOrigin"] ?? request.Url.GetLeftPart(UriPartial.Authority);
                if (!string.IsNullOrEmpty(origin))
                {
                    if (!string.Equals(origin, allowed, StringComparison.Ordinal)) throw new ServiceError("ORIGIN_FORBIDDEN", "Origin is not allowed", 403);
                    response.AppendHeader("Access-Control-Allow-Origin", origin);response.AppendHeader("Vary", "Origin");
                    response.AppendHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-File-Name,X-Asset-Kind,Idempotency-Key");
                    response.AppendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
                    response.AppendHeader("Access-Control-Expose-Headers", "X-WebCAD-Transport,X-WebCAD-Gateway-Build,Retry-After");
                }
                if (request.HttpMethod == "OPTIONS") { if (string.IsNullOrEmpty(origin)) throw new ServiceError("ORIGIN_FORBIDDEN", "Origin is required", 403);response.StatusCode = 204;return; }
                string header = request.Headers["Authorization"],credential = header != null && header.StartsWith("Bearer ", StringComparison.Ordinal) ? header.Substring(7) : null;
                if (string.IsNullOrEmpty(credential)) throw new ServiceError("UNAUTHORIZED", "Services authorization required", 401);
                var runtime = IisRuntime.Get(credential);
                var authorized = runtime.Handle(new WireRequest { Method = "GET", Route = "/v1/health", Credential = credential });
                if (authorized.Status != 200) { Write(context, authorized);return; }
                string route = request.QueryString["route"] ?? "/v1/health";
                if (!System.Text.RegularExpressions.Regex.IsMatch(route, "^/v1/[a-zA-Z0-9/_-]+$")) throw new ServiceError("ROUTE_NOT_FOUND", "Invalid route", 404);
                if (request.ContentLength > Protocol.MaxUpload) throw new ServiceError("SIZE_LIMIT", "Resource limit is 20 MiB", 413);
                byte[] body;
                using (var input = request.GetBufferlessInputStream())
                using (var memory = new MemoryStream())
                {
                    var chunk = new byte[65536];int count;
                    while ((count = await input.ReadAsync(chunk, 0, chunk.Length)) != 0) { if (memory.Length + count > Protocol.MaxUpload) throw new ServiceError("SIZE_LIMIT", "Resource limit is 20 MiB", 413);memory.Write(chunk, 0, count); }
                    body = memory.ToArray();
                }
                Write(context, runtime.Handle(new WireRequest { Method = request.HttpMethod,Route = route,Credential = credential,FileName = Uri.UnescapeDataString(request.Headers["X-File-Name"] ?? ""),IdempotencyKey = request.Headers["Idempotency-Key"],AssetKind = request.Headers["X-Asset-Kind"],Body = body }));
            }
            catch (ServiceError error) { Write(context, WireResponse.Json(error.Body("iis-dll"), error.Status)); }
            catch (UnauthorizedAccessException) { Write(context, WireResponse.Json(new ServiceError("IIS_STORAGE_FORBIDDEN", "Site identity cannot access the private Services data or runtime", 503).Body("iis-dll"), 503)); }
            catch (Exception) { Write(context, WireResponse.Json(new ServiceError("IIS_RUNTIME_UNAVAILABLE", "Services DLL configuration or runtime is unavailable", 503).Body("iis-dll"), 503)); }
        }
        static void Write(HttpContext context, WireResponse result) { context.Response.StatusCode = result.Status;context.Response.ContentType = result.ContentType;context.Response.OutputStream.Write(result.Body, 0, result.Body.Length); }
    }
    internal sealed class IisRuntime : IRegisteredObject
    {
        static readonly object Gate = new object();static IisRuntime current;
        readonly ServiceRuntime runtime;int disposed;
        IisRuntime(string credential)
        {
            // An ASHX folder can share the ERP application; its runtime lives beside
            // the handler rather than beside the parent application's bin directory.
            string root = Path.GetDirectoryName(HttpContext.Current.Request.PhysicalPath);
            Func<string,string,string> path = (key, fallback) => Path.GetFullPath(Path.Combine(root, ConfigurationManager.AppSettings["WebCAD." + key] ?? fallback));
            string logo = path("LogoWorker", "runtime/logo/LogoVector.Worker.exe"),native = path("NativeWorker", "runtime/occt/WebCADOcctWorker.exe"),proof = path("NativeAcceptance", "runtime/kernel-pair.json");
            if (!File.Exists(logo) || !File.Exists(native) || !File.Exists(proof)) throw new ServiceError("WORKER_UNAVAILABLE", "Required Logo/OCCT runtime files are missing", 503);
            NativeAdapter.Configure(native, proof);
            if (NativeAdapter.Acceptance == null) throw new ServiceError("NATIVE_ACCEPTANCE_INVALID", "Native binary and proof do not match", 503);
            runtime = new ServiceRuntime(path("DataRoot", "../../WebCADServices-data"), logo, credential, true, "iis-dll");
            HostingEnvironment.RegisterObject(this);
        }
        internal static ServiceRuntime Get(string supplied)
        {
            lock (Gate)
            {
                if (current != null) return current.runtime;
                string token = ConfigurationManager.AppSettings["WebCAD.Credential"] ?? ConfigurationManager.AppSettings["COAKey"];
                string file = ConfigurationManager.AppSettings["WebCAD.CredentialFile"];
                if (!string.IsNullOrEmpty(file)) { byte[] plain = ProtectedData.Unprotect(File.ReadAllBytes(file), null, DataProtectionScope.LocalMachine);try { token = Encoding.UTF8.GetString(plain); } finally { Array.Clear(plain, 0, plain.Length); } }
                if (string.IsNullOrEmpty(token) || token.Length < 32) throw new ServiceError("AUTH_CONFIG_REQUIRED", "Configure the Services authorization", 503);
                byte[] a = Encoding.UTF8.GetBytes(token),b = Encoding.UTF8.GetBytes(supplied ?? "");int diff = a.Length ^ b.Length;for (int i = 0;i < a.Length;i++) diff |= a[i] ^ (i < b.Length ? b[i] : 0);
                if (diff != 0) throw new ServiceError("UNAUTHORIZED", "Services authorization required", 401);
                current = new IisRuntime(token);return current.runtime;
            }
        }
        public void Stop(bool immediate) { if (Interlocked.Exchange(ref disposed, 1) != 0) return;try { runtime.Dispose(); } finally { HostingEnvironment.UnregisterObject(this); } }
    }
}
