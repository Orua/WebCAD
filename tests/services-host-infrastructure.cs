using System;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using WebCADServices.Contracts;
using WebCADServices.Host;
using WebCADServices.Runtime;
using WebCADServices.Transport;

public static class HostInfrastructureTests
{
    static void Check(bool condition, string label) { if (!condition) throw new Exception(label); }
    static async Task<WireResponse> Exchange(TransportSettings settings, string route)
    {
        using (var pipe = new NamedPipeClientStream(".", settings.PipeName, PipeDirection.InOut, PipeOptions.Asynchronous))
        {
            await pipe.ConnectAsync(1000);
            await PipeFrames.Write(pipe, new WireRequest { Method = "GET", Route = route }, 4096, new Deadline(1000), 1000, CancellationToken.None);
            return await PipeFrames.Read<WireResponse>(pipe, 4096, new Deadline(1000), 1000, CancellationToken.None);
        }
    }
    static async Task Run(string root)
    {
        var settings = JsonConvert.DeserializeObject<TransportSettings>(File.ReadAllText(Path.Combine(root, "transport.json"))); settings.Validate();
        var poolSid = "S-1-5-82-1-2-3-4-5"; var current = WindowsIdentity.GetCurrent().User;
        var acl = BoundedPipeServer.CreateAcl(current, poolSid); int poolRules = 0, hostRules = 0;
        foreach (PipeAccessRule rule in acl.GetAccessRules(true, true, typeof(SecurityIdentifier))) { Check(rule.IdentityReference.Value != "S-1-1-0", "Everyone pipe ACL"); if (rule.IdentityReference.Value == poolSid) { poolRules++; Check((rule.PipeAccessRights & PipeAccessRights.CreateNewInstance) == 0, "Pool can create pipe instances"); } if (rule.IdentityReference.Value == current.Value) hostRules++; }
        Check(poolRules == 1 && hostRules == 1 && acl.AreAccessRulesProtected, "Exact pipe ACL identities");
        try { BoundedPipeServer.CreateAcl(current, "S-1-1-0"); throw new Exception("Everyone accepted"); } catch (InvalidOperationException) { }
        var config = new HostConfiguration { Transport = settings, ServiceName = "WebCADServices", GatewaySid = poolSid, DataRoot = root, LogoWorker = typeof(HostInfrastructureTests).Assembly.Location, CredentialFile = Path.Combine(root, "fixture.dpapi"), CredentialFormat = "current-user-dpapi" };
        var configPath = Path.Combine(root, "fixture-config.json"); File.WriteAllText(configPath, JsonConvert.SerializeObject(config)); var loaded = HostConfiguration.Load(configPath); Check(loaded.Transport.PipeName == settings.PipeName && loaded.Transport.OverallTimeoutMs == 1200, "Host config mismatch");
        try { loaded.ValidateService(configPath, false); throw new Exception("Desktop DPAPI accepted in service"); } catch (InvalidOperationException) { }
        using (var server = new BoundedPipeServer(settings, poolSid, request => { if (request.Route == "/fault") throw new InvalidOperationException("Connection-only fixture fault"); return WireResponse.Json(new { ok = true }); }))
        {
            using (var slow = new NamedPipeClientStream(".", settings.PipeName, PipeDirection.InOut, PipeOptions.Asynchronous))
            {
                await slow.ConnectAsync(1000); await slow.WriteAsync(new byte[] { 100 }, 0, 1);
                var timer = System.Diagnostics.Stopwatch.StartNew(); var healthy = await Exchange(settings, "/v1/health"); Check(healthy.Status == 200 && timer.ElapsedMilliseconds < 800, "Slow connection serialized Host");
                await Task.Delay(450); Check((await Exchange(settings, "/v1/health")).Status == 200, "Slow slot was not reclaimed");
            }
            using (var malformed = new NamedPipeClientStream(".", settings.PipeName, PipeDirection.InOut, PipeOptions.Asynchronous)) { await malformed.ConnectAsync(1000); byte[] bad = { 1, 0, 0, 0, 123 }; await malformed.WriteAsync(bad, 0, bad.Length); }
            try { await Exchange(settings, "/fault"); throw new Exception("Handler fault was accepted"); } catch (FrameException) { }
            Check((await Exchange(settings, "/v1/health")).Status == 200, "Malformed frame or handler exception killed Host");
            var requests = new[] { Exchange(settings, "/v1/health"), Exchange(settings, "/v1/health"), Exchange(settings, "/v1/health"), Exchange(settings, "/v1/health") };
            foreach (var result in await Task.WhenAll(requests)) Check(result.Status == 200, "Concurrent connection failed");
        }
        // SQLite ownership is tested in process, without launching/stopping another Host process.
        using (var first = new Store(Path.Combine(root, "sqlite")))
        {
            try { using (var second = new Store(first.Root)) { } throw new Exception("Concurrent SQLite owner accepted"); } catch (ServiceError e) { Check(e.Code == "DATA_ROOT_IN_USE", "Incorrect root lease rejection"); }
        }
        string inMemoryCredential = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        using (var runtime = new ServiceRuntime(Path.Combine(root, "health"), Path.Combine(root, "missing-worker.exe"), inMemoryCredential, true))
        {
            Check(runtime.Handle(new WireRequest { Method = "GET", Route = "/v1/health", Credential = inMemoryCredential }).Status == 503, "Missing service dependency reported healthy");
            Check(runtime.Handle(new WireRequest { Method = "POST", Route = "/v1/assets", Credential = inMemoryCredential, AssetKind = "brep", FileName = "fixture.brep", Body = new byte[Protocol.MaxUpload + 1] }).Status == 413, "Host geometry resource exceeded actual budget");
        }
        using (var store = new Store(Path.Combine(root, "size")))
        {
            try { store.AddAsset("fixture", "fixture.brep", new byte[Protocol.MaxUpload + 1], "brep"); throw new Exception("Store advertised budget drift"); } catch (ServiceError error) { Check(error.Status == 413, "Store resource budget"); }
        }
        StartupDependencies.Imports(typeof(HostConfiguration).Assembly.Location);
        Check(StartupDependencies.Imports(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe")).Length > 0, "Actual native PE imports not parsed");
        var brokenPe = Path.Combine(root, "broken-pe.exe"); File.WriteAllBytes(brokenPe, new byte[256]);
        try { StartupDependencies.Imports(brokenPe); throw new Exception("Broken native image accepted"); } catch (InvalidOperationException) { }
        // Verify CurrentUser DPAPI in this test identity only. Real virtual-account initialization remains an installation gate.
        config.HostSid = current.Value; config.ProvisionerSid = current.Value; config.CredentialFormat = "service-current-user-dpapi"; config.CredentialFile = Path.Combine(root, "fixture.dpapi");
        string fixture = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"); ProtectedCredential.SaveInFinalContext(config, fixture); Check(ProtectedCredential.Read(config) == fixture, "CurrentUser protection round trip");
        Check(!Encoding.UTF8.GetString(File.ReadAllBytes(config.CredentialFile)).Contains(fixture), "Plaintext credential persisted");
        try { ProtectedCredential.SaveInFinalContext(config, fixture); throw new Exception("Credential overwrite accepted"); } catch (InvalidOperationException) { }
        config.HostSid = "S-1-5-80-2201197645-1098119612-4069130862-3767940876-3039169740"; config.CredentialFile += ".other";
        try { ProtectedCredential.SaveInFinalContext(config, fixture); throw new Exception("Wrong final identity accepted"); } catch (InvalidOperationException) { }
        Console.WriteLine("passed: Host persistent config, exact pipe ACL, slow/bad connections, runtime exception isolation, four clients, exclusive SQLite lease, exact resource limit/readiness, PE imports, CurrentUser credential and final-context guard");
    }
    public static int Main(string[] args) { Console.OutputEncoding = new UTF8Encoding(false); try { Run(args[0]).GetAwaiter().GetResult(); return 0; } catch (Exception e) { Console.Error.WriteLine(e.GetType().Name + ": " + e.Message); return 1; } }
}
