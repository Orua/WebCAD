using System;
using System.IO;
using System.Text;
using System.Reflection;
using System.Data.SQLite;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;
using WebCADServices.Runtime;

class AnonymousComputeTests
{
    static void Check(bool value,string label) { if(!value)throw new Exception(label); }
    static void Reject(Action action,string code) { try{action();}catch(ServiceError e){Check(e.Code==code,"Expected "+code+", got "+e.Code);return;}throw new Exception("Expected "+code); }
    static void ResetCleanup(Store store) { typeof(Store).GetField("lastAnonymousCleanup",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(store,DateTime.MinValue); }
    static JObject Payload(int n) { return JObject.FromObject(new {operation="logo.inspect",sourceSha256="fixture-"+n,sourceName="fixture.logo.json",engineBuildId="fixture",semanticVersion="logo-1.0",options=new {}}); }
    static int Main(string[] args)
    {
        string root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);
        string secret=new string('s',64),ownerA,ownerB;long expiryA,expiryB;DateTime now=DateTime.UtcNow;
        string a=AnonymousSession.Issue(secret,now),b=AnonymousSession.Issue(secret,now);
        Check(AnonymousSession.TryValidate(a,secret,now,out ownerA,out expiryA),"visitor A signature");
        Check(AnonymousSession.TryValidate(b,secret,now,out ownerB,out expiryB)&&ownerA!=ownerB,"distinct owners");
        string invalidOwner;long invalidExpiry;
        Check(!AnonymousSession.TryValidate(a+"0",secret,now,out invalidOwner,out invalidExpiry),"tamper rejected");
        Check(!AnonymousSession.TryValidate(a,new string('t',64),now,out invalidOwner,out invalidExpiry),"wrong key rejected");
        Check(!AnonymousSession.TryValidate(a,secret,now.AddSeconds(7201),out invalidOwner,out invalidExpiry),"expiration rejected");
        var cacheType=typeof(Store).Assembly.GetType("WebCADServices.Runtime.LayerCheckpointCache");
        string visitorCacheRoot=Path.Combine(root,"visitor-cache");
        var cache=Activator.CreateInstance(cacheType,new object[]{visitorCacheRoot,ownerA,"fixture"});
        Check(cacheType.GetMethod("Read").Invoke(cache,new object[]{new string('a',64)})==null&&!Directory.Exists(visitorCacheRoot),"visitor does not create a durable layer cache");
        using(var store=new Store(Path.Combine(root,"store")))
        {
            store.VisitAnonymous(ownerA,expiryA,"GET");store.VisitAnonymous(ownerB,expiryB,"GET");
            byte[] bytes=Encoding.UTF8.GetBytes("isolated store fixture; no geometry claim");
            var asset=store.AddAsset(ownerA,"fixture.logo.json",bytes);string assetId=(string)asset["assetId"];
            Reject(()=>store.Asset(ownerB,assetId),"ASSET_NOT_FOUND");
            var artifact=store.PublishGeometry(ownerA,bytes);string artifactId=(string)artifact["artifactId"];
            Reject(()=>store.Artifact(ownerB,artifactId),"ARTIFACT_NOT_FOUND");
            string job=(string)store.Submit(ownerA,"one",Payload(1))["jobId"];
            Reject(()=>store.Job(ownerB,job),"JOB_NOT_FOUND");Reject(()=>store.Cancel(ownerB,job),"JOB_NOT_FOUND");Reject(()=>store.Result(ownerB,job),"JOB_NOT_FOUND");Reject(()=>store.Request(ownerB,"one"),"REQUEST_NOT_FOUND");
            Check((string)store.Submit(ownerA,"one",Payload(1))["jobId"]==job,"idempotent original job");
            string job2=(string)store.Submit(ownerA,"two",Payload(2))["jobId"];
            Reject(()=>store.Submit(ownerA,"three",Payload(3)),"QUEUE_LIMIT");
            store.Cancel(ownerA,job2);store.Claim("logo");
            store.Attempt(job,System.Diagnostics.Process.GetCurrentProcess().Id);
            store.Finish(job,"interrupted");
            var internalAsset=store.AddAsset("internal-existing-owner","kept.logo.json",bytes);
            using(var db=new SQLiteConnection("Data Source="+Path.Combine(root,"store","jobs.db")))
            {db.Open();using(var cmd=new SQLiteCommand("UPDATE anonymous_sessions SET expires=0 WHERE owner=@owner",db)){cmd.Parameters.AddWithValue("@owner",ownerA);cmd.ExecuteNonQuery();}}
            ResetCleanup(store);store.PruneAnonymous();
            Check((bool)store.Job(ownerA,job)["cancelRequested"],"expired worker cancellation requested");
            Check(File.Exists(Path.Combine(root,"store","assets",assetId)),"interrupted row with live prior process retains input");
            store.Attempt(job,System.Diagnostics.Process.GetCurrentProcess().Id,0);ResetCleanup(store);store.PruneAnonymous();
            Reject(()=>store.Asset(ownerA,assetId),"ASSET_NOT_FOUND");Reject(()=>store.Artifact(ownerA,artifactId),"ARTIFACT_NOT_FOUND");
            Check(!File.Exists(Path.Combine(root,"store","assets",assetId))&&!File.Exists(Path.Combine(root,"store","artifacts",artifactId)),"expired files removed");
            Check(store.Asset("internal-existing-owner",(string)internalAsset["assetId"])!=null,"internal data preserved");
            Reject(()=>store.AddAsset(ownerB,"too-big.mesh",new byte[20*1024*1024+1],"mesh"),"SIZE_LIMIT");
            for(int i=0;i<20;i++)store.VisitAnonymous(ownerB,expiryB,"POST");
            Reject(()=>store.VisitAnonymous(ownerB,expiryB,"POST"),"RATE_LIMIT");
            Reject(()=>store.AddAsset(ownerB,"../bad.logo.json",bytes),"PARAM_SCHEMA_INVALID");
        }
        using(var runtime=new ServiceRuntime(Path.Combine(root,"runtime"),args.Length>=3?args[1]:typeof(AnonymousComputeTests).Assembly.Location,secret))
        {
            var accepted=runtime.Handle(new WireRequest{Method="POST",Route="/v1/assets",Credential=a,FileName="fixture.logo.json",Body=new byte[]{1,2,3}});
            Check(accepted.Status==201,"signed visitor runtime upload");
            Check(runtime.Handle(new WireRequest{Method="GET",Route="/v1/capabilities",Credential="wrong"}).Status==401,"internal authorization retained");
            Check(runtime.Handle(new WireRequest{Method="GET",Route="/v1/capabilities",Credential=secret}).Status==200,"explicit internal principal retained");
            Check(runtime.Handle(new WireRequest{Method="POST",Route="/v1/compute/jobs",Credential=b,Body=Encoding.UTF8.GetBytes("{\"operation\":\"run-script\"}")}).Status==403,"arbitrary compute denied");
            if(args.Length>=3)
            {
                var upload=runtime.Handle(new WireRequest{Method="POST",Route="/v1/assets",Credential=a,FileName="sample-ring.logo.json",Body=File.ReadAllBytes(args[2])});
                Check(upload.Status==201,"actual vector source accepted");
                var input=JObject.FromObject(new {assetId=(string)JObject.Parse(Encoding.UTF8.GetString(upload.Body))["assetId"],options=new {sizeConfirmed=true,sizeMode="sourceUnits",mode="vector",pdfJoinToleranceMm=0}});
                var submit=runtime.Handle(new WireRequest{Method="POST",Route="/v1/logo/convert",Credential=a,IdempotencyKey="visitor-real-conversion",Body=Encoding.UTF8.GetBytes(input.ToString())});
                Check(submit.Status==202,"real visitor computation accepted");
                string actualJob=(string)JObject.Parse(Encoding.UTF8.GetString(submit.Body))["jobId"];
                Check(runtime.Handle(new WireRequest{Method="POST",Route="/v1/jobs/"+actualJob+"/cancel",Credential=b}).Status==404,"other visitor cannot cancel actual work");
                WireResponse result=null;
                for(int i=0;i<100;i++){result=runtime.Handle(new WireRequest{Method="GET",Route="/v1/jobs/"+actualJob+"/result",Credential=a});if(result.Status==200)break;System.Threading.Thread.Sleep(100);}
                Check(result.Status==200,"real controlled worker result");
                var manifest=JObject.Parse(Encoding.UTF8.GetString(result.Body));string actualArtifact=(string)manifest["artifactId"];
                Check(runtime.Handle(new WireRequest{Method="GET",Route="/v1/artifacts/"+actualArtifact,Credential=b}).Status==404,"other visitor cannot download actual result");
                var output=runtime.Handle(new WireRequest{Method="GET",Route="/v1/artifacts/"+actualArtifact,Credential=a});
                Check(output.Status==200&&Protocol.Hash(output.Body)==(string)manifest["artifactSha256"],"actual result bytes and hash");
                Check(((JArray)JObject.Parse(Encoding.UTF8.GetString(output.Body))["logoDocument"]["regions"][0]["holes"]).Count==1,"actual vector hole preserved");
                Console.WriteLine("PASS: anonymous signed visitor -> persisted job -> real controlled Logo worker -> owned hashed one-hole result; cross-visitor cancel/download denied");
            }
        }
        Console.WriteLine("PASS: signed expiry, visitor isolation, idempotency, job quotas, runtime authorization, size/rate limits, cancellation before cleanup and internal-data preservation");return 0;
    }
}
