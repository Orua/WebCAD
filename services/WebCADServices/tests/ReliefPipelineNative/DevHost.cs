// Test-only HTTP host for box UI acceptance (261022-04): exposes ServiceRuntime.Handle on
// http://127.0.0.1:<port>/api.ashx?route=/v1/... like the IIS Gateway (same headers + CORS),
// so the real browser client can drive the Linux-built occt-worker. NOT a production host.
using System;
using System.IO;
using System.Net;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;
using WebCADServices.Runtime;

internal static class DevHost
{
    public static int Run(string[] args)
    {
        string worker=Environment.GetEnvironmentVariable("WEBCAD_SERVICES_OCCT_WORKER"),token=args.Length>1?args[1]:"relief-dev-credential-0123456789abcdef";
        int port=args.Length>2?int.Parse(args[2]):18080;
        string root=Path.Combine(Path.GetTempPath(),"relief-devhost");Directory.CreateDirectory(root);
        string proof=Path.Combine(root,"acceptance.json");
        File.WriteAllText(proof,new JObject{["producerKernelBuildId"]="native-occt@7.8.1:sha256:"+Protocol.Hash(File.ReadAllBytes(worker)),["codec"]="occt-text-brep-v1",["brepVersion"]=3,["status"]="passed",["consumerKernelBuildId"]=Environment.GetEnvironmentVariable("WEBCAD_DEVHOST_CONSUMER")??"browser-occt-test",["availableSemantics"]=new JArray("transform.translation-1.0","relief.design-fit-brep-1","relief.source-convert-1"),["reliefDesignStatus"]="passed",["sourceConvertStatus"]="passed"}.ToString());
        NativeAdapter.Configure(worker,proof);
        var runtime=new ServiceRuntime(root,Path.Combine(root,"no-logo.exe"),token);
        var listener=new HttpListener();listener.Prefixes.Add("http://127.0.0.1:"+port+"/");listener.Start();
        Console.WriteLine("DEVHOST http://127.0.0.1:"+port+"/api.ashx kernel native-occt@7.8.1:sha256:"+Protocol.Hash(File.ReadAllBytes(worker)));
        while(true){var ctx=listener.GetContext();Task.Run(()=>Serve(ctx,runtime));}
    }
    static void Serve(HttpListenerContext ctx,ServiceRuntime runtime)
    {
        var q=ctx.Request;var r=ctx.Response;
        try{
            string origin=q.Headers["Origin"];
            if(!string.IsNullOrEmpty(origin)){r.AppendHeader("Access-Control-Allow-Origin",origin);r.AppendHeader("Vary","Origin");r.AppendHeader("Access-Control-Allow-Headers","Authorization,Content-Type,X-File-Name,X-Asset-Kind,Idempotency-Key");r.AppendHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");r.AppendHeader("Access-Control-Expose-Headers","X-WebCAD-Transport,X-WebCAD-Gateway-Build,Retry-After");}
            if(q.HttpMethod=="OPTIONS"){r.StatusCode=204;r.Close();return;}
            string auth=q.Headers["Authorization"]??"";string cred=auth.StartsWith("Bearer ")?auth.Substring(7):null;
            byte[] body;using(var ms=new MemoryStream()){q.InputStream.CopyTo(ms);body=ms.ToArray();}
            var resp=runtime.Handle(new WireRequest{Method=q.HttpMethod,Route=q.QueryString["route"],Credential=cred,FileName=Uri.UnescapeDataString(q.Headers["X-File-Name"]??""),IdempotencyKey=q.Headers["Idempotency-Key"],AssetKind=q.Headers["X-Asset-Kind"],Body=body.Length>0?body:null});
            r.StatusCode=resp.Status;r.ContentType=resp.ContentType;r.AppendHeader("X-WebCAD-Transport","devhost");r.AppendHeader("Cache-Control","no-store");
            Console.WriteLine(q.HttpMethod+" "+q.QueryString["route"]+" -> "+resp.Status+(resp.Status>=400?" "+System.Text.Encoding.UTF8.GetString(resp.Body??Array.Empty<byte>()):""));
            r.OutputStream.Write(resp.Body??Array.Empty<byte>());r.Close();
        }catch(Exception e){Console.WriteLine("ERR "+e.Message);try{r.StatusCode=500;r.Close();}catch{}}
    }
}
