using System;
using System.IO;
using System.IO.Pipes;
using System.Net;
using System.Security.AccessControl;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using WebCADServices.Contracts;
using WebCADServices.Runtime;

namespace WebCADServices.Host
{
    sealed class Program : ServiceBase
    {
        ServiceRuntime runtime;
        BoundedPipeServer pipes;
        HostConfiguration configuration;
        HttpListener listener;
        volatile bool stop;
        bool service;
        static string Setting(string key) => Environment.GetEnvironmentVariable("WEBCAD_SERVICES_" + key) ?? throw new InvalidOperationException("Missing Services configuration: " + key);
        static void Main(string[] args)
        {
            try
            {
                string mode = args.Length > 0 ? args[0] : "--console", path = null;
                if (args.Length == 3 && args[1] == "--config") path = args[2];
                else if (args.Length > 1) throw new ArgumentException("Use --console/--service --config <absolute path>");
                if (mode != "--console" && mode != "--service" && mode != "--provision-credential" && mode != "--validate-config") throw new ArgumentException("Invalid Host mode");
                if (args.Length == 0 && !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WEBCAD_SERVICES_DEV_HTTP"))) throw new ArgumentException("DEV_HTTP requires explicit --console development mode");
                if (mode != "--console" && path == null) throw new ArgumentException("Persistent --config is required");
                var config = path == null ? null : HostConfiguration.Load(path);
                if (mode == "--provision-credential")
                {
                    config.ValidateService(path, false);
                    if (!Console.IsInputRedirected) throw new InvalidOperationException("Provision credential through redirected stdin, never argv or a plaintext file");
                    ProtectedCredential.Provision(config, Console.ReadLine()); Console.WriteLine("Protected credential provisioned; no credential was displayed."); return;
                }
                if (mode == "--validate-config") { config.ValidateService(path, false); Console.WriteLine("Persistent service config and private ACL validation passed."); return; }
                var app = new Program { ServiceName = config?.ServiceName ?? "WebCADServices", configuration = config, service = mode == "--service" };
                if (app.service) { config.ValidateService(path, true); Run(app); return; }
                app.OnStart(args); Console.CancelKeyPress += (_, e) => { e.Cancel = true; app.OnStop(); }; while (!app.stop) Thread.Sleep(250);
            }
            catch (Exception error) { Console.Error.WriteLine("Host startup failed: " + (error is ServiceError failure ? failure.Code : error.GetType().Name + ": " + error.Message)); Environment.ExitCode = 1; }
        }
        protected override void OnStart(string[] args)
        {
            try { StartConfigured(args); }
            catch (Exception error)
            {
                if (configuration != null)
                {
                    try { File.WriteAllText(Path.Combine(Path.GetDirectoryName(configuration.CredentialFile), "startup-error.json"), JsonConvert.SerializeObject(new { stage = "host-startup", errorType = error.GetType().Name, code = (error as ServiceError)?.Code, message = error.Message.Substring(0, Math.Min(500, error.Message.Length)) })); } catch { }
                }
                throw;
            }
        }
        void StartConfigured(string[] args)
        {
            var config = configuration ?? new HostConfiguration {
                Transport = new WebCADServices.Transport.TransportSettings { PipeName = Environment.GetEnvironmentVariable("WEBCAD_SERVICES_PIPE_NAME") ?? "WebCADServices-v1", AllowedOrigin = Environment.GetEnvironmentVariable("WEBCAD_SERVICES_ALLOWED_ORIGIN") ?? "http://localhost", ConnectTimeoutMs = 2000, ReadTimeoutMs = 5000, WriteTimeoutMs = 5000, AuthenticationTimeoutMs = 3000, OverallTimeoutMs = 30000 },
                DataRoot = Setting("DATA_ROOT"), LogoWorker = Setting("LOGO_WORKER"), NativeWorker = Environment.GetEnvironmentVariable("WEBCAD_SERVICES_OCCT_WORKER"), NativeAcceptance = Environment.GetEnvironmentVariable("WEBCAD_SERVICES_NATIVE_ACCEPTANCE"), GatewaySid = Environment.GetEnvironmentVariable("WEBCAD_SERVICES_GATEWAY_SID")
            };
            config.Transport.Validate(); config.ConfigureWorkers(service);
            if (service && !File.Exists(config.CredentialFile)) { RequestAdditionalTime(20000); ProtectedCredential.EnsureInService(config); }
            string token = configuration == null ? Setting("TOKEN") : ProtectedCredential.Read(config);
            // Environment token compatibility is only for explicit console development.
            Environment.SetEnvironmentVariable("WEBCAD_SERVICES_TOKEN", null);
            string http = service ? null : Environment.GetEnvironmentVariable("WEBCAD_SERVICES_DEV_HTTP");
            if (!string.IsNullOrEmpty(http)) { var uri = new Uri(http); if (uri.Scheme != "http" || uri.Host != "127.0.0.1" || uri.AbsolutePath != "/") throw new InvalidOperationException("Console HTTP must bind 127.0.0.1 only"); }
            try
            {
                runtime = new ServiceRuntime(config.DataRoot, config.LogoWorker, token, service);
                pipes = new BoundedPipeServer(config.Transport, config.GatewaySid, runtime.Handle);
                if (!string.IsNullOrEmpty(http)) { listener = new HttpListener(); listener.Prefixes.Add(http); listener.Start(); new Thread(HttpLoop) { IsBackground = true }.Start(); }
            }
            catch { pipes?.Dispose(); runtime?.Dispose(); listener?.Close(); throw; }
        }
        void HttpLoop()
        {
            while (!stop) { HttpListenerContext context; try { context = listener.GetContext(); } catch (HttpListenerException) { return; } ThreadPool.QueueUserWorkItem(_ => Http(context)); }
        }
        void Http(HttpListenerContext context)
        {
            try
            {
                string origin = context.Request.Headers["Origin"], allowed = Environment.GetEnvironmentVariable("WEBCAD_SERVICES_ALLOWED_ORIGIN");
                if (!string.IsNullOrEmpty(origin)) { if (origin != allowed) { context.Response.StatusCode = 403; return; } context.Response.Headers["Access-Control-Allow-Origin"] = origin; context.Response.Headers["Vary"] = "Origin"; context.Response.Headers["Access-Control-Allow-Headers"] = "Authorization,Content-Type,X-File-Name,X-Asset-Kind,Idempotency-Key"; context.Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"; }
                if (context.Request.HttpMethod == "OPTIONS") { context.Response.StatusCode = 204; return; }
                string credential=context.Request.Headers["Authorization"]?.Replace("Bearer ", "");
                var authorization=runtime.Handle(new WireRequest{Method="GET",Route="/v1/health",Credential=credential});
                if(authorization.Status!=200){context.Response.StatusCode=authorization.Status;context.Response.ContentType=authorization.ContentType;context.Response.OutputStream.Write(authorization.Body,0,authorization.Body.Length);return;}
                byte[] body; using (var ms = new MemoryStream()) { var chunk = new byte[65536]; int count; while ((count = context.Request.InputStream.Read(chunk, 0, chunk.Length)) > 0) { if (ms.Length + count > WebCADServices.Transport.TransportSettings.MaxResourceBytes) throw new ServiceError("SIZE_LIMIT", "Request exceeds limit", 413); ms.Write(chunk, 0, count); } body = ms.ToArray(); }
                string route = context.Request.QueryString["route"] ?? context.Request.Url.AbsolutePath;
                var result = runtime.Handle(new WireRequest { Method = context.Request.HttpMethod, Route = route, Credential = context.Request.Headers["Authorization"]?.Replace("Bearer ", ""), Body = body, FileName = Uri.UnescapeDataString(context.Request.Headers["X-File-Name"] ?? ""), IdempotencyKey = context.Request.Headers["Idempotency-Key"],AssetKind=context.Request.Headers["X-Asset-Kind"] });
                context.Response.StatusCode = result.Status; context.Response.ContentType = result.ContentType; context.Response.ContentLength64 = result.Body.Length; if (result.Status == 202) context.Response.Headers["Retry-After"] = "1"; context.Response.OutputStream.Write(result.Body, 0, result.Body.Length);
            }
            catch (ServiceError error) { context.Response.StatusCode = error.Status; var data = Encoding.UTF8.GetBytes(error.Body().ToString()); context.Response.OutputStream.Write(data, 0, data.Length); }
            catch(IOException) { /* Interrupted upload/response: no accepted task. */ }
            catch(HttpListenerException) { /* Disconnected client cannot kill Host. */ }
            catch(Exception) { try{context.Response.StatusCode=400;var data=Encoding.UTF8.GetBytes(new ServiceError("REQUEST_INVALID","Invalid transport request").Body().ToString());context.Response.OutputStream.Write(data,0,data.Length);}catch(IOException){}catch(HttpListenerException){} }
            finally { try{context.Response.Close();}catch(IOException){}catch(HttpListenerException){} }
        }
        protected override void OnStop() { if (stop) return; stop = true; listener?.Close(); pipes?.Dispose(); runtime?.Dispose(); }
    }
}
