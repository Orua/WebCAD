using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;
using WebCADServices.Logo;

namespace WebCADServices.Runtime
{
    public sealed class ServiceRuntime : IDisposable
    {
        readonly Store store;
        readonly string worker;
        readonly string token;
        readonly bool serviceMode;
        readonly string runtimeMode;
        readonly Thread scheduler;
        readonly Thread nativeScheduler;
        readonly AutoResetEvent wake = new AutoResetEvent(false);
        volatile bool stopping;
        public ServiceRuntime(string dataRoot, string logoWorker, string credential, bool serviceMode = false, string runtimeMode = null)
        {
            if (string.IsNullOrEmpty(credential) || credential.Length < 32) throw new ServiceError("AUTH_CONFIG_REQUIRED", "Set a dedicated Services credential of at least 32 characters", 503);
            this.serviceMode = serviceMode;this.runtimeMode = runtimeMode ?? (serviceMode ? "service" : "console"); token = credential; worker = Path.GetFullPath(logoWorker); store = new Store(dataRoot);
            scheduler = new Thread(Dispatch) { IsBackground = true, Name = "services-persistent-dispatch" }; scheduler.Start();
            nativeScheduler = new Thread(DispatchNative) { IsBackground = true, Name = "services-native-dispatch" }; nativeScheduler.Start();
        }
        bool Auth(string supplied)
        {
            var a = Encoding.UTF8.GetBytes(token); var b = Encoding.UTF8.GetBytes(supplied ?? ""); int diff = a.Length ^ b.Length; for (int i = 0; i < a.Length; i++) diff |= a[i] ^ (i < b.Length ? b[i] : 0); return diff == 0;
        }
        public WireResponse Handle(WireRequest request)
        {
            try
            {
                if (!Auth(request.Credential)) throw new ServiceError("UNAUTHORIZED", "Services authorization required", 401);
                if (request.Body != null && request.Body.Length > WebCADServices.Transport.TransportSettings.MaxResourceBytes) throw new ServiceError("SIZE_LIMIT", "Resource limit is 20 MiB", 413);
                // Dedicated credential is one principal; user-provided userid is never authority.
                string owner = Protocol.Hash(Encoding.UTF8.GetBytes(token));
                string route = request.Route ?? "", method = request.Method;
                if (route == "/v1/health" && method == "GET") { bool ready = File.Exists(worker) && (!serviceMode || NativeAdapter.Acceptance != null); return WireResponse.Json(new { status = ready ? "healthy" : "degraded", protocolVersion = Protocol.Version, hostMode = runtimeMode, logoAvailable = File.Exists(worker), nativeAccepted = NativeAdapter.Acceptance != null }, ready ? 200 : 503); }
                if (route == "/v1/capabilities" && method == "GET") return WireResponse.Json(Capabilities(owner));
                if (route == "/v1/assets" && method == "POST") return WireResponse.Json(store.AddAsset(owner, request.FileName, request.Body, request.AssetKind ?? "logo"), 201);
                if ((route == "/v1/logo/inspect" || route == "/v1/logo/convert") && method == "POST")
                {
                    if (!File.Exists(worker)) throw new ServiceError("WORKER_UNAVAILABLE", "Logo worker is not built", 503);
                    var input = Protocol.Parse(request.Body); Protocol.Keys(input, "assetId", "options"); var asset = store.Asset(owner, (string)input["assetId"]);
                    if((string)asset["kind"]!="logo")throw new ServiceError("ASSET_ROLE_MISMATCH","Logo requires a Logo source asset");
                    var options = LogoAdapter.ValidateOptions(input["options"] as JObject, route.EndsWith("inspect"));
                    var payload = new JObject { ["operation"] = route.EndsWith("inspect") ? "logo.inspect" : "logo.convert", ["assetId"] = asset["id"], ["sourceSha256"] = asset["sha"],["sourceName"]=asset["name"], ["semanticVersion"] = "logo-1.0", ["engineBuildId"] = LogoBuildId(), ["options"] = options };
                    var publicPayload = new JObject { ["assetId"] = input["assetId"], ["options"] = options };
                    var accepted = store.Submit(owner, request.IdempotencyKey, payload, publicPayload); wake.Set(); return WireResponse.Json(accepted, 202);
                }
                if (route == "/v1/compute/jobs" && method == "POST") {var input=Protocol.Parse(request.Body,Protocol.MaxNativePlan);var payload=NativeAdapter.Validate(input,store,owner);return WireResponse.Json(store.Submit(owner,request.IdempotencyKey,payload,input),202);}
                var parts = route.Split('/');
                if (parts.Length == 4 && parts[1] == "v1" && parts[2] == "requests" && method == "GET") return WireResponse.Json(store.Request(owner, parts[3]));
                if(parts.Length==5&&parts[1]=="v1"&&parts[2]=="requests"&&parts[4]=="result"&&method=="GET")return WireResponse.Json(store.RequestResult(owner,parts[3]));
                if (parts.Length >= 4 && parts[1] == "v1" && parts[2] == "jobs")
                {
                    string id = parts[3];
                    if(parts.Length==5&&parts[4]=="recover"&&method=="POST"){
                        var approval=Protocol.Parse(request.Body);Protocol.Keys(approval,"approved","reason","acknowledgedState");
                        if((bool?)approval["approved"]!=true||(string)approval["acknowledgedState"]!="interrupted")throw new ServiceError("RECOVERY_AUTH_REQUIRED","Explicitly approve the reviewed interrupted state",409);
                        var original=store.RecoveryPayload(owner,id);var candidate=(JObject)original.DeepClone();
                        if((string)original["engineBuildId"]!=(((string)original["operation"]).StartsWith("logo.")?LogoBuildId():NativeAdapter.BuildId))throw new ServiceError("RECOVERY_INPUT_CHANGED","Engine changed; use separately validated repair semantics",409);
                        if(!((string)original["operation"]).StartsWith("logo."))candidate=NativeAdapter.Validate((JObject)original["publicRequest"],store,owner);
                        var accepted=store.Recover(owner,id,request.IdempotencyKey,(string)approval["reason"],candidate);wake.Set();return WireResponse.Json(accepted,202);
                    }
                    if (parts.Length == 4 && method == "GET") return WireResponse.Json(store.Job(owner, id));
                    if (parts.Length == 5 && parts[4] == "result" && method == "GET") return WireResponse.Json(store.Result(owner, id));
                    if (parts.Length == 5 && parts[4] == "cancel" && method == "POST") { wake.Set(); return WireResponse.Json(store.Cancel(owner, id), 202); }
                }
                if (parts.Length == 4 && parts[1] == "v1" && parts[2] == "artifacts" && method == "GET") return new WireResponse { Status = 200, ContentType="application/octet-stream",Body = store.Artifact(owner, parts[3]) };
                throw new ServiceError("ROUTE_NOT_FOUND", "Unknown route or method", 404);
            }
            catch (ServiceError error) { return WireResponse.Json(error.Body(), error.Status); }
            catch (Exception) { return WireResponse.Json(new ServiceError("REQUEST_INVALID", "Invalid request or unavailable storage", 400).Body(), 400); }
        }
        static JObject RoutingPolicy()
        {
            using(var stream=typeof(ServiceRuntime).Assembly.GetManifestResourceStream("WebCADServices.ExecutionRouting.json"))
            using(var reader=new StreamReader(stream))return JObject.Parse(reader.ReadToEnd());
        }
        public static JArray TbdOperations()
        {
            using(var stream=typeof(ServiceRuntime).Assembly.GetManifestResourceStream("WebCADServices.TbdCapabilities.json"))
            using(var reader=new StreamReader(stream))return (JArray)JObject.Parse(reader.ReadToEnd())["operations"];
        }
        JObject Capabilities(string owner) => JObject.FromObject(new
        {
            protocolVersion = Protocol.Version, supportedClientProtocolRange = new[] { "1.0" }, serviceBuildId = "sha256:" + Protocol.Hash(File.ReadAllBytes(typeof(ServiceRuntime).Assembly.Location)), hostBuildId = "sha256:" + Protocol.Hash(File.ReadAllBytes((System.Reflection.Assembly.GetEntryAssembly() ?? typeof(ServiceRuntime).Assembly).Location)),
            logo = new { engineBuildId = LogoBuildId(), enabled = File.Exists(worker), formats = new[] { "logo-json", "svg-restricted", "pdf", "pdf-compatible-ai", "dxf-restricted", "png", "jpeg", "bmp" }, restrictions = new[] { "monochrome", "explicit physical dimensions", "manual review for raster/reconstructed linework", "no DWG" }, maxSourceBytes = Protocol.MaxUpload, acceptanceStatus = "local JSON/FURLA PDF accepted; IIS and production identity gates pending" },
            operations = NativeOperations(), unavailableOperations = TbdOperations(), geometryExchange = new { supportedFormats = NativeAdapter.Acceptance==null?new string[0]:new[]{"occt-text-brep-v1"}, testedKernelPairs = NativeAdapter.Acceptance==null?new object[0]:new object[]{new { producerKernelBuildId=NativeAdapter.BuildId, consumerKernelBuildId=(string)NativeAdapter.Acceptance["consumerKernelBuildId"],codec="occt-text-brep-v1",brepVersion=3 }}, blockers = NativeAdapter.Acceptance==null?new[] { "NATIVE_BRIDGE_NOT_ACCEPTED" }:new string[0] },
            documentFormats = new { supportedVersions = new[] { 1, 2, 3 } },
            executionRouting = new { policyVersion=(string)RoutingPolicy()["policyVersion"],policy=RoutingPolicy(),queue=store.NativeQueue(owner),decisionAuthority="browser-shared-ExecutionRouter",failedTaskFallback="none" },
            deploymentStatus = runtimeMode == "iis-dll" ? "ASHX loads compiled DLL; no installed Host service" : "legacy service/console runtime"
        });
        object[] NativeOperations() {
            var proof=NativeAdapter.Acceptance;if(proof==null)return new object[0];var result=new System.Collections.Generic.List<object>();
            result.Add(new { operation="transform",schemaVersion="1.0",semanticVersion=NativeAdapter.SemanticVersion,supportedStrategies=new[]{"translation"},kernelBuildId=NativeAdapter.BuildId,resultFormats=new[]{"occt-text-brep-v1"},limits=new{ maxSourceBytes=Protocol.MaxUpload,maxSolids=1,clientResultBudgetBytes=Protocol.MaxUpload },enabled=true,blockers=new string[0],acceptanceStatus=(string)proof["status"]=="passed"?"passed":"bridge-passed-project-gates-pending" });
            if(NativeAdapter.BooleanCutEnabled)result.Add(new { operation="cut",schemaVersion="1.0",semanticVersion=NativeAdapter.BooleanCutSemanticVersion,supportedStrategies=new[]{"multi-source-boolean"},kernelBuildId=NativeAdapter.BuildId,resultFormats=new[]{"occt-text-brep-v1"},limits=new{maxSourceBytes=Protocol.MaxUpload,maxInputBytes=64*1024*1024,maxSources=33,maxTools=32,maxSolids=33,maxSolidsPerInput=1,maxResultSolids=1,clientResultBudgetBytes=Protocol.MaxUpload},enabled=true,blockers=new string[0],acceptanceStatus=(string)proof["status"]=="passed"?"passed":"bridge-passed-project-gates-pending" });
            if(NativeAdapter.RoundBoundaryEnabled)result.Add(new { operation="round",schemaVersion="1.0",semanticVersion=NativeAdapter.RoundBoundarySemanticVersion,supportedStrategies=new[]{"planar-boundary-cutter"},kernelBuildId=NativeAdapter.BuildId,resultFormats=new[]{"occt-text-brep-v1"},limits=new{maxSourceBytes=Protocol.MaxUpload,maxSolids=1,maxResultSolids=1,clientResultBudgetBytes=Protocol.MaxUpload},restrictions=new[]{"one rectangular planar face with one pre-existing same-radius adjacent edge blend","six orthogonal support planes and one quarter-cylinder","corner patches retain isolated sharp-edge termination points"},enabled=true,blockers=new string[0],acceptanceStatus=(string)proof["status"]=="passed"?"passed":"bridge-passed-project-gates-pending" });
            if(NativeAdapter.ReliefEnabled)result.Add(new { operation="relief",schemaVersion="1.0",semanticVersion=NativeAdapter.ReliefSemanticVersion,supportedStrategies=new[]{"cutHoleSolids","faceWithHolesExtrude"},kernelBuildId=NativeAdapter.BuildId,resultFormats=new[]{"occt-text-brep-v1"},limits=new{ maxSourceBytes=Protocol.MaxUpload,maxInputBytes=64*1024*1024,maxPlanBytes=Protocol.MaxNativePlan,maxLayers=32,maxPrimitives=64000,clientResultBudgetBytes=Protocol.MaxUpload },enabled=true,blockers=new string[0],acceptanceStatus=(string)proof["reliefStatus"]=="passed"?"passed":"bridge-passed-project-gates-pending" });
            if(NativeAdapter.ReliefStrokeEnabled)result.Add(new { operation="relief",schemaVersion="1.0",semanticVersion=NativeAdapter.ReliefStrokeSemanticVersion,supportedStrategies=new[]{"cutHoleSolids","faceWithHolesExtrude"},kernelBuildId=NativeAdapter.BuildId,resultFormats=new[]{"occt-text-brep-v1"},limits=new{maxSourceBytes=Protocol.MaxUpload,maxInputBytes=64*1024*1024,maxPlanBytes=Protocol.MaxNativePlan,maxLayers=32,maxPrimitives=64000,clientResultBudgetBytes=Protocol.MaxUpload},enabled=true,blockers=new string[0],acceptanceStatus=(string)proof["strokeStatus"]=="passed"?"passed":"bridge-passed-project-gates-pending" });
            if(NativeAdapter.ReliefPatchEnabled)result.Add(new { operation="relief",schemaVersion="1.0",semanticVersion=NativeAdapter.ReliefPatchSemanticVersion,supportedStrategies=new[]{"cutHoleSolids","faceWithHolesExtrude"},kernelBuildId=NativeAdapter.BuildId,resultFormats=new[]{"occt-text-brep-v1"},limits=new{maxSourceBytes=Protocol.MaxUpload,maxInputBytes=64*1024*1024,maxPlanBytes=Protocol.MaxNativePlan,maxLayers=32,maxPrimitives=64000,clientResultBudgetBytes=Protocol.MaxUpload},enabled=true,blockers=new string[0],acceptanceStatus=(string)proof["localPatchStatus"]=="passed"?"passed":"bridge-passed-project-gates-pending" });
            return result.ToArray();
        }
        string LogoBuildId()
        {
            if (!File.Exists(worker)) return "unavailable";
            var paths = new[] { worker, Path.Combine(Path.GetDirectoryName(worker), "LogoVector.Contracts.dll"), Path.Combine(Path.GetDirectoryName(worker), "LogoVector.Geometry.dll") };
            return "sha256:" + Protocol.Hash(Encoding.UTF8.GetBytes(string.Join("\n", paths.Select(p => Protocol.Hash(File.ReadAllBytes(p))))));
        }
        void Dispatch()
        {
            while (!stopping)
            {
                JObject row = store.Claim(); if (row == null) { wake.WaitOne(250); continue; }
                string id = (string)row["id"];
                try
                {
                    if (store.Cancelled(id)) { store.Finish(id, "cancelled"); continue; }
                    var input = JObject.Parse((string)row["request"]); var asset = store.Asset((string)row["owner"], (string)input["assetId"]);
                    if (Protocol.Hash(File.ReadAllBytes(Path.Combine(store.Root, "assets", (string)asset["id"]))) != (string)input["sourceSha256"]) throw new ServiceError("SOURCE_HASH_MISMATCH", "Stored input integrity check failed");
                    string dir = Path.Combine(store.Root, "jobs", id); Directory.CreateDirectory(dir); string output = Path.Combine(dir, "result.partial.json"), path = Path.Combine(dir, "request.json");
                    Store.Atomic(path, Encoding.UTF8.GetBytes(new JObject { ["action"] = (string)input["operation"] == "logo.inspect" ? "inspect" : "convert", ["sourcePath"] = Path.Combine(store.Root, "assets", (string)asset["id"]), ["sourceName"] = asset["name"], ["sourceHash"] = asset["sha"], ["outputPath"] = output, ["options"] = input["options"] }.ToString()));
                    var timer = Stopwatch.StartNew();
                    int exit = new WorkerSupervisor().Run(worker, path, () => stopping || store.Cancelled(id), pid => store.Attempt(id, pid), out string diagnostic); store.Attempt(id, 0, exit);
                    if (store.Cancelled(id)) { store.Finish(id, "cancelled"); continue; }
                    if (exit != 0) throw new ServiceError("WORKER_FAILED", "Worker exited with code " + exit);
                    if (!File.Exists(output) || new FileInfo(output).Length > 32 * 1024 * 1024) throw new ServiceError("RESULT_INVALID", "Missing or oversized result");
                    var value = LogoAdapter.Normalize(JObject.Parse(File.ReadAllText(output)), (string)input["operation"] == "logo.inspect", (JObject)input["options"]);
                    value["timings"] = new JObject { ["workerElapsedMs"] = timer.Elapsed.TotalMilliseconds, ["peakMemoryBytes"] = "unavailable" };
                    var manifest = store.Publish((string)row["owner"], id, (string)row["fingerprint"], value); store.Finish(id, "succeeded", manifest.ToString(Newtonsoft.Json.Formatting.None));
                    File.Delete(output); File.Delete(path);
                }
                catch (ServiceError error) { store.Finish(id, error.Code == "WORKER_TERMINATED" ? "terminated" : "failed", error: error.Body("worker").ToString()); }
                catch (Exception error) { store.Finish(id, "failed", error: new ServiceError("WORKER_FAILED", "Worker processing failed (" + error.GetType().Name + ")").Body("worker").ToString()); }
            }
        }
        void DispatchNative()
        {
            while(!stopping){var row=store.Claim("occt");if(row==null){Thread.Sleep(100);continue;}string id=(string)row["id"];try{if(store.Cancelled(id)){store.Finish(id,"cancelled");continue;}var result=NativeAdapter.Execute(row,store,()=>stopping||store.Cancelled(id));if(store.Cancelled(id)){store.Finish(id,"cancelled");continue;}store.Finish(id,"succeeded",result.ToString(Newtonsoft.Json.Formatting.None));}catch(ServiceError error){store.Finish(id,store.Cancelled(id)?"cancelled":error.Code=="WORKER_TERMINATED"?"terminated":"failed",error:error.Body("native").ToString());}catch(Exception error){store.Finish(id,"failed",error:new ServiceError("NATIVE_WORKER_FAILED","Native processing failed ("+error.GetType().Name+")").Body("native").ToString());}}
        }
        public void Dispose() { stopping = true; wake.Set(); scheduler.Join(7000); nativeScheduler.Join(7000);store.Dispose(); wake.Dispose(); }
    }
}
