using System;
using System.Configuration;
using System.IO;
using System.IO.Pipes;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using WebCADServices.Contracts;
using WebCADServices.Transport;

namespace WebCADServices.Gateway
{
    public sealed class Handler : HttpTaskAsyncHandler
    {
        public override bool IsReusable => true;
        public static readonly string BuildId = "sha256:" + Protocol.Hash(File.ReadAllBytes(typeof(Handler).Assembly.Location));
        public static async Task<WireResponse> Exchange(WireRequest request, TransportSettings settings, Deadline deadline, CancellationToken cancellation)
        {
            using (var pipe = new NamedPipeClientStream(".", settings.PipeName, PipeDirection.InOut, PipeOptions.Asynchronous))
            {
                int connect = deadline.Remaining(settings.ConnectTimeoutMs, "connect");
                await PipeFrames.Bounded(pipe.ConnectAsync(connect, cancellation), pipe, deadline, connect, "connect", cancellation).ConfigureAwait(false);
                await PipeFrames.Write(pipe, request, TransportSettings.MaxRequestFrame, deadline, settings.WriteTimeoutMs, cancellation).ConfigureAwait(false);
                var response = await PipeFrames.Read<WireResponse>(pipe, TransportSettings.MaxResponseFrame, deadline, settings.ReadTimeoutMs, cancellation).ConfigureAwait(false);
                if (response.Body == null || response.Status < 200 || response.Status > 599 || (response.ContentType != "application/json" && response.ContentType != "application/octet-stream")) throw new FrameException();
                return response;
            }
        }
        public override async Task ProcessRequestAsync(HttpContext context)
        {
            context.Response.SuppressFormsAuthenticationRedirect = true; context.Response.TrySkipIisCustomErrors = true;
            context.Response.AppendHeader("X-WebCAD-Transport", "iis-ashx-pipe-v1"); context.Response.AppendHeader("X-WebCAD-Gateway-Build", BuildId);
            context.Response.Cache.SetCacheability(HttpCacheability.NoCache); context.Response.Cache.SetNoStore();
            try
            {
                TransportSettings settings;
                try { settings = TransportSettings.FromAppSettings(ConfigurationManager.AppSettings); }
                catch (Exception) { throw new ServiceError("GATEWAY_CONFIG_INVALID", "Services application transport configuration is invalid", 503, "gateway-config"); }
                string origin = context.Request.Headers["Origin"];
                if (!string.IsNullOrEmpty(origin))
                {
                    if (!string.Equals(origin, settings.AllowedOrigin, StringComparison.Ordinal)) throw new ServiceError("ORIGIN_FORBIDDEN", "Origin is not allowed", 403);
                    context.Response.AppendHeader("Access-Control-Allow-Origin", origin); context.Response.AppendHeader("Vary", "Origin");
                    context.Response.AppendHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-File-Name,X-Asset-Kind,Idempotency-Key");
                    context.Response.AppendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
                    context.Response.AppendHeader("Access-Control-Expose-Headers", "X-WebCAD-Transport,X-WebCAD-Gateway-Build,Retry-After");
                }
                if (!context.Request.IsSecureConnection && !context.Request.IsLocal) throw new ServiceError("HTTPS_REQUIRED", "Services requires HTTPS", 403);
                if (context.Request.HttpMethod == "OPTIONS") { context.Response.StatusCode = 204; return; }
                string route = context.Request.QueryString["route"];
                if (string.IsNullOrEmpty(route) || !route.StartsWith("/v1/", StringComparison.Ordinal) || route.Contains("..") || route.Contains("?") || route.Contains("\\")) throw new ServiceError("ROUTE_NOT_FOUND", "Invalid logical route", 404);
                string header = context.Request.Headers["Authorization"];
                string credential = header != null && header.StartsWith("Bearer ", StringComparison.Ordinal) ? header.Substring(7) : null;
                if (credential == null || credential.Length > 4096) throw new ServiceError("UNAUTHORIZED", "Services authorization required", 401);
                var overall = new Deadline(settings.OverallTimeoutMs);
                var authDeadline = new Deadline(overall.Remaining(settings.AuthenticationTimeoutMs, "authentication"));
                // Host is the only authority. No long-lived credential belongs in IIS configuration.
                var authorization = await Exchange(new WireRequest { Method = "GET", Route = "/v1/health", Credential = credential }, settings, authDeadline, CancellationToken.None);
                if (authorization.Status != 200) { Write(context, authorization); return; }
                if (context.Request.ContentLength > TransportSettings.MaxResourceBytes) throw new ServiceError("SIZE_LIMIT", "Resource limit is 20 MiB", 413);
                byte[] body;
                using (var ms = new MemoryStream())
                {
                    Stream input = context.Request.GetBufferlessInputStream(); var chunk = new byte[65536];
                    while (true)
                    {
                        var read = input.ReadAsync(chunk, 0, chunk.Length);
                        await PipeFrames.Bounded(read, input, overall, settings.ReadTimeoutMs, "upload", CancellationToken.None);
                        int count = await read; if (count == 0) break;
                        if (ms.Length + count > TransportSettings.MaxResourceBytes) throw new ServiceError("SIZE_LIMIT", "Resource limit is 20 MiB", 413);
                        ms.Write(chunk, 0, count);
                    }
                    body = ms.ToArray();
                }
                var request = new WireRequest { Method = context.Request.HttpMethod, Route = route, Credential = credential, FileName = Uri.UnescapeDataString(context.Request.Headers["X-File-Name"] ?? ""), IdempotencyKey = context.Request.Headers["Idempotency-Key"], AssetKind = context.Request.Headers["X-Asset-Kind"], Body = body };
                Write(context, await Exchange(request, settings, overall, CancellationToken.None));
            }
            catch (Exception error) { Write(context, ErrorResponse(error)); }
        }
        public static WireResponse ErrorResponse(Exception error)
        {
            var service = error as ServiceError;
            if (service != null) return WireResponse.Json(service.Body("gateway"), service.Status);
            if (error is UnauthorizedAccessException) service = new ServiceError("HOST_ACCESS_DENIED", "Gateway identity cannot access the Host pipe", 503, "connect");
            else if (error is TransportTimeoutException timeout) service = timeout.Phase == "connect" ? new ServiceError("HOST_UNAVAILABLE", "Services Host did not accept the connection", 503, "connect") : new ServiceError("HOST_TIMEOUT", "Services transport deadline exceeded", 504, timeout.Phase);
            else if (error is TimeoutException) service = new ServiceError("HOST_UNAVAILABLE", "Services Host did not accept the connection", 503, "connect");
            else if (error is FrameException) service = new ServiceError("HOST_FRAME_INVALID", "Services Host returned an invalid frame", 502, "read");
            else if (error is IOException) service = new ServiceError("HOST_UNAVAILABLE", "Services Host connection is unavailable", 503, "transport");
            else service = new ServiceError("GATEWAY_REQUEST_INVALID", "Services transport request could not be processed", 400, "gateway");
            return WireResponse.Json(service.Body(), service.Status);
        }
        static void Write(HttpContext context, WireResponse result)
        {
            context.Response.StatusCode = result.Status; context.Response.ContentType = result.ContentType;
            if (result.Status == 202) context.Response.AppendHeader("Retry-After", "1");
            context.Response.BinaryWrite(result.Body);
        }
    }
}
