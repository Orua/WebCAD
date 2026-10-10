using System;
using System.Collections.Specialized;
using System.Configuration;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;
using WebCADServices.Gateway;
using WebCADServices.Transport;

public static class GatewayInfrastructureTests
{
    static void Check(bool condition, string label) { if (!condition) throw new Exception(label); }
    static TransportSettings Settings() { return TransportSettings.FromAppSettings(ConfigurationManager.AppSettings); }
    static byte[] Frame(string text) { byte[] body = Encoding.UTF8.GetBytes(text); using (var ms = new MemoryStream()) using (var writer = new BinaryWriter(ms)) { writer.Write(body.Length); writer.Write(body); return ms.ToArray(); } }
    static async Task Invalid(byte[] frame)
    {
        try { await PipeFrames.Read<WireResponse>(new MemoryStream(frame), 4096, new Deadline(500), 500, CancellationToken.None); throw new Exception("Invalid frame accepted"); }
        catch (FrameException) { }
    }
    sealed class HungWrite : MemoryStream
    {
        public bool Closed;
        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellation) { return new TaskCompletionSource<bool>().Task; }
        protected override void Dispose(bool disposing) { Closed = true; base.Dispose(disposing); }
    }
    sealed class DripRead : MemoryStream
    {
        public DripRead(byte[] bytes) : base(bytes) { }
        public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellation) { await Task.Delay(60, cancellation); return base.Read(buffer, offset, Math.Min(count, 1)); }
    }
    sealed class Request : HttpWorkerRequest
    {
        public int Reads;
        public readonly NameValueCollection ResponseHeaders = new NameValueCollection();
        public string Authorization = "Bearer rejected-in-memory-fixture";
        public string Origin = "http://127.0.0.1:17780";
        public override string GetUriPath() { return "/api.ashx"; }
        public override string GetQueryString() { return "route=/v1/assets"; }
        public override string GetRawUrl() { return "/api.ashx?route=/v1/assets"; }
        public override string GetHttpVerbName() { return "POST"; }
        public override string GetHttpVersion() { return "HTTP/1.1"; }
        public override string GetRemoteAddress() { return "127.0.0.1"; }
        public override int GetRemotePort() { return 1000; }
        public override string GetLocalAddress() { return "127.0.0.1"; }
        public override int GetLocalPort() { return 80; }
        public override string GetKnownRequestHeader(int index) { if (index == HeaderAuthorization) return Authorization; if (index == HeaderContentLength) return "20971520"; return null; }
        public override string GetUnknownRequestHeader(string name) { return name == "Origin" ? Origin : null; }
        public override string[][] GetUnknownRequestHeaders() { return new[] { new[] { "Origin", Origin } }; }
        public override int ReadEntityBody(byte[] buffer, int size) { Reads++; throw new Exception("Unauthorized body was read"); }
        public override int GetTotalEntityBodyLength() { return 20971520; }
        public override void SendStatus(int statusCode, string statusDescription) { }
        public override void SendKnownResponseHeader(int index, string value) { }
        public override void SendUnknownResponseHeader(string name, string value) { ResponseHeaders[name] = value; }
        public override void SendResponseFromMemory(byte[] data, int length) { }
        public override void SendResponseFromFile(string filename, long offset, long length) { }
        public override void SendResponseFromFile(IntPtr handle, long offset, long length) { }
        public override void FlushResponse(bool finalFlush) { }
        public override void EndOfRequest() { }
    }
    static async Task ServeOne(TransportSettings settings, Func<WireRequest, WireResponse> handle)
    {
        using (var pipe = new NamedPipeServerStream(settings.PipeName, PipeDirection.InOut, 4, PipeTransmissionMode.Byte, PipeOptions.Asynchronous))
        {
            await pipe.WaitForConnectionAsync();
            var request = await PipeFrames.Read<WireRequest>(pipe, TransportSettings.MaxRequestFrame, new Deadline(1000), 1000, CancellationToken.None);
            await PipeFrames.Write(pipe, handle(request), TransportSettings.MaxResponseFrame, new Deadline(1000), 1000, CancellationToken.None);
        }
    }
    static async Task Run()
    {
        var settings = Settings();
        Check(settings.PipeName.StartsWith("r1-fixture-"), "Persistent appSettings not loaded");
        var values = new NameValueCollection(ConfigurationManager.AppSettings); values["WebCAD.AllowedOrigin"] += "/";
        try { TransportSettings.FromAppSettings(values); throw new Exception("Non-exact origin accepted"); } catch (InvalidOperationException) { }
        values = new NameValueCollection(ConfigurationManager.AppSettings); values.Remove("WebCAD.PipeName");
        try { TransportSettings.FromAppSettings(values); throw new Exception("Missing pipe defaulted"); } catch (InvalidOperationException) { }
        await Invalid(new byte[] { 5, 0, 0, 0, 123 });
        await Invalid(new byte[] { 0, 0, 0, 0 });
        await Invalid(new byte[] { 255, 255, 255, 127 });
        await Invalid(Frame("{broken"));
        await Invalid(Frame("{\"Status\":200,\"Status\":401}"));
        await Invalid(Frame("{} {}"));
        using (var hung = new HungWrite())
        {
            var writeTimer = System.Diagnostics.Stopwatch.StartNew();
            try { await PipeFrames.Write(hung, WireResponse.Json(new { ok = true }), 4096, new Deadline(1000), 150, CancellationToken.None); throw new Exception("Blocked write accepted"); } catch (TransportTimeoutException) { }
            Check(hung.Closed && writeTimer.ElapsedMilliseconds < 1000, "Write deadline did not close I/O");
        }
        using (var drip = new DripRead(Frame("{}")))
        {
            var readTimer = System.Diagnostics.Stopwatch.StartNew();
            try { await PipeFrames.Read<WireResponse>(drip, 4096, new Deadline(1000), 150, CancellationToken.None); throw new Exception("Drip frame exceeded its phase budget"); } catch (TransportTimeoutException) { }
            Check(readTimer.ElapsedMilliseconds < 600, "Frame phase deadline reset per fragment");
        }
        var good = WireResponse.Json(new { ok = true });
        using (var bytes = new MemoryStream()) { await PipeFrames.Write(bytes, good, 4096, new Deadline(500), 500, CancellationToken.None); bytes.Position = 0; var result = await PipeFrames.Read<WireResponse>(bytes, 4096, new Deadline(500), 500, CancellationToken.None); Check(result.Status == 200 && result.Body.Length > 0, "Frame round trip"); }
        var serve = ServeOne(settings, request => { Check(request.Route == "/v1/health" && request.Body == null, "Authentication handshake must be body-free"); return WireResponse.Json(new ServiceError("UNAUTHORIZED", "Fixture authorization rejected", 401).Body(), 401); });
        var worker = new Request(); var context = new HttpContext(worker);
        await new Handler().ProcessRequestAsync(context); await serve;
        Check(worker.Reads == 0 && context.Response.StatusCode == 401, "Unauthorized upload buffering/status");
        Check(context.Response.SuppressFormsAuthenticationRedirect, "Forms authentication redirect suppression");
        context.Response.Flush();
        Check(context.Response.ContentType == "application/json" && worker.ResponseHeaders["X-WebCAD-Transport"] == "iis-ashx-pipe-v1", "JSON/build transport evidence");
        worker = new Request(); worker.Origin += ".untrusted"; context = new HttpContext(worker); await new Handler().ProcessRequestAsync(context);
        Check(context.Response.StatusCode == 403 && worker.Reads == 0, "Exact origin gate");
        worker = new Request(); worker.Authorization = null; context = new HttpContext(worker); await new Handler().ProcessRequestAsync(context); Check(context.Response.StatusCode == 401 && worker.Reads == 0, "Missing bearer gate");
        var errors = new Exception[] { new UnauthorizedAccessException(), new TimeoutException(), new TransportTimeoutException("read"), new FrameException(), new IOException() };
        var statuses = new[] { 503, 503, 504, 502, 503 }; var codes = new[] { "HOST_ACCESS_DENIED", "HOST_UNAVAILABLE", "HOST_TIMEOUT", "HOST_FRAME_INVALID", "HOST_UNAVAILABLE" };
        for (int i = 0; i < errors.Length; i++) { var error = Handler.ErrorResponse(errors[i]); Check(error.Status == statuses[i] && (string)JObject.Parse(Encoding.UTF8.GetString(error.Body))["code"] == codes[i], "Gateway failure mapping"); }
        var timer = System.Diagnostics.Stopwatch.StartNew();
        try { await Handler.Exchange(new WireRequest { Route = "/v1/health", Method = "GET" }, settings, new Deadline(300), CancellationToken.None); throw new Exception("Absent Host accepted"); } catch (TimeoutException) { } catch (TransportTimeoutException) { }
        Check(timer.ElapsedMilliseconds < 2000, "Connect deadline was not bounded");
        using (var silent = new NamedPipeServerStream(settings.PipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous))
        {
            var accept = silent.WaitForConnectionAsync(); var exchange = Handler.Exchange(new WireRequest { Route = "/v1/health", Method = "GET" }, settings, new Deadline(500), CancellationToken.None); await accept;
            timer.Restart(); try { await exchange; throw new Exception("Silent Host accepted"); } catch (TransportTimeoutException) { } Check(timer.ElapsedMilliseconds < 2000, "Read deadline was not bounded");
        }
        Console.WriteLine("passed: persistent appSettings, exact origin, frames, auth-before-upload, ASP.NET JSON/401/marker, error mapping, connect/read/write/overall deadlines");
    }
    public static int Main() { Console.OutputEncoding = new UTF8Encoding(false); try { Run().GetAwaiter().GetResult(); return 0; } catch (Exception e) { Console.Error.WriteLine(e.GetType().Name + ": " + e.Message); return 1; } }
}
