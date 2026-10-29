// Relief Services pipeline checks (261022-04): parameter validation + end-to-end job through
// ServiceRuntime.Handle -> NativeAdapter.Validate/Execute -> occt-worker (when WEBCAD_SERVICES_OCCT_WORKER is set).
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;
using WebCADServices.Runtime;

internal static class Program
{
    static int failures;
    static void Expect(bool ok,string name){Console.WriteLine((ok?"PASS ":"FAIL ")+name);if(!ok)failures++;}
    static bool Rejects(Action a){try{a();return false;}catch(ServiceError){return true;}}
    static JObject Field(int n){var h=new JArray();var a=new JArray();var f=new JArray();for(int j=0;j<n;j++)for(int i=0;i<n;i++){bool edge=i==0||j==0||i==n-1||j==n-1;double x=(double)i/(n-1)-.5,y=(double)j/(n-1)-.5;h.Add(edge?0.0:Math.Max(0,1-12*(x*x+y*y))*Math.Min(1,Math.Min(Math.Min(i,j),Math.Min(n-1-i,n-1-j))/4.0));a.Add(1);f.Add(edge?1:0);}return new JObject{["columns"]=n,["rows"]=n,["widthMm"]=20.0,["heightMm"]=20.0,["heightsMm"]=h,["active"]=a,["fixedMask"]=f};}
    static JObject DesignParams(int n,int c)=>new JObject{["field"]=Field(n),["domain"]=new JObject{["support"]=new JObject{["kind"]="rect",["centerMm"]=new JArray(0.0,0.0),["widthMm"]=20.0,["heightMm"]=20.0},["throughHoles"]=new JArray(),["protectedZones"]=new JArray()},["baselineMm"]=0.0,["fit"]=new JObject{["mode"]="emboss",["controlColumns"]=c,["controlRows"]=c,["acceptanceToleranceMm"]=0.1,["controlMaxMm"]=1.5,["maxIterations"]=50000,["toleranceMm"]=1e-9},["placement"]=new JObject{["originMm"]=new JArray(0.0,0.0,20.0),["xDirection"]=new JArray(1.0,0.0,0.0)}};
    static JObject Settings(int c,int r)=>JObject.Parse("{\"version\":1,\"columns\":"+c+",\"rows\":"+r+",\"crop\":{\"x\":0,\"y\":0,\"width\":1,\"height\":1},\"levels\":{\"black\":0,\"white\":1},\"gamma\":1,\"blurPx\":0,\"invert\":false}");
    static int Main(string[] args)
    {
        if(args.Length>0&&args[0]=="serve")return DevHost.Run(args);
        // ---- strict parameter validation (no worker needed) ----
        {var b=NativeAdapter.BudgetGrid(1025,1025);Expect(b.columns==1025&&b.rows==1025,"grid budget keeps 1025x1025");var d=NativeAdapter.BudgetGrid(2049,1025);Expect((long)d.columns*d.rows<=NativeAdapter.MaxGridNodes&&d.columns<=1025&&Math.Abs((double)d.columns/d.rows-2)<.02,"grid budget downsamples 2049x1025 with aspect");}
        NativeAdapter.ValidateReliefDesignParameters(DesignParams(33,17));Expect(true,"design params 33/17 accepted");
        NativeAdapter.ValidateReliefDesignParameters(DesignParams(129,65));Expect(true,"design params 129/65 accepted");
        Expect(Rejects(()=>{var p=DesignParams(33,17);p["extra"]=1;NativeAdapter.ValidateReliefDesignParameters(p);}),"unknown design field rejected");
        Expect(Rejects(()=>{var p=DesignParams(33,17);p["fit"]["controlColumns"]=40;NativeAdapter.ValidateReliefDesignParameters(p);}),"control net larger than field rejected");
        Expect(Rejects(()=>{var p=DesignParams(33,17);((JArray)p["field"]["active"])[5]=2;NativeAdapter.ValidateReliefDesignParameters(p);}),"non-binary mask rejected");
        Expect(Rejects(()=>{var p=DesignParams(33,17);((JArray)p["field"]["heightsMm"]).RemoveAt(0);NativeAdapter.ValidateReliefDesignParameters(p);}),"wrong field length rejected");
        Expect(Rejects(()=>{var p=DesignParams(33,17);p["placement"]["xDirection"]=new JArray(1.0,1.0,0.0);NativeAdapter.ValidateReliefDesignParameters(p);}),"non-unit placement axis rejected");
        Expect(Rejects(()=>{var p=DesignParams(33,17);p["fit"]["maxWork"]=1;NativeAdapter.ValidateReliefDesignParameters(p);}),"client work budget is not accepted (server owns it)");
        var sc=new JObject{["width"]=4,["height"]=4,["settings"]=Settings(4,4),["depthMm"]=1.0,["machiningPrecisionMm"]=0.05};NativeAdapter.ValidateSourceConvertParameters(sc);Expect(true,"source-convert params accepted");
        Expect(Rejects(()=>{var p=(JObject)sc.DeepClone();p["machiningPrecisionMm"]=0.005;NativeAdapter.ValidateSourceConvertParameters(p);}),"precision below 0.01 rejected");
        Expect(Rejects(()=>{var p=(JObject)sc.DeepClone();p["machiningPrecisionMm"]=0.6;NativeAdapter.ValidateSourceConvertParameters(p);}),"precision above 0.5 rejected");
        Expect(Rejects(()=>{var p=(JObject)sc.DeepClone();p.Remove("depthMm");NativeAdapter.ValidateSourceConvertParameters(p);}),"precision without depth rejected");
        Expect(!Rejects(()=>{var p=(JObject)sc.DeepClone();p["settings"]["columns"]=1025;p["settings"]["rows"]=1025;NativeAdapter.ValidateSourceConvertParameters(p);}),"grid 1025x1025 accepted (no 513 cap)");Expect(Rejects(()=>{var p=(JObject)sc.DeepClone();p["settings"]["columns"]=3000;p["settings"]["rows"]=3000;NativeAdapter.ValidateSourceConvertParameters(p);}),"grid side above 2049 rejected");
        Expect(NativeAdapter.MatchesReliefDesign("reliefDesign","relief.design-fit-brep-1","masked-bspline-face-replacement")&&!NativeAdapter.MatchesReliefDesign("reliefDesign","relief.design-fit-brep-2","masked-bspline-face-replacement"),"exact design tuple only");
        Expect(NativeAdapter.MatchesSourceConvert("reliefSourceConvert","relief.source-convert-1","rgba-area-average")&&!NativeAdapter.MatchesSourceConvert("reliefSourceConvert","relief.source-convert-1","nearest"),"exact convert tuple only");
        Expect(!NativeAdapter.ReliefDesignEnabled&&!NativeAdapter.SourceConvertEnabled,"capabilities disabled without worker + acceptance proof");

        string worker=Environment.GetEnvironmentVariable("WEBCAD_SERVICES_OCCT_WORKER"),brep=Environment.GetEnvironmentVariable("RELIEF_CHECK_BOX_BREP");
        if(string.IsNullOrEmpty(worker)||!File.Exists(worker)||string.IsNullOrEmpty(brep)){Console.WriteLine("SKIP end-to-end (set WEBCAD_SERVICES_OCCT_WORKER and RELIEF_CHECK_BOX_BREP)");return failures==0?0:1;}
        // ---- end-to-end through the real runtime and the native worker ----
        string root=Path.Combine(Path.GetTempPath(),"relief-check-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        string proof=Path.Combine(root,"acceptance.json");
        File.WriteAllText(proof,new JObject{["producerKernelBuildId"]="native-occt@7.8.1:sha256:"+Protocol.Hash(File.ReadAllBytes(worker)),["codec"]="occt-text-brep-v1",["brepVersion"]=3,["status"]="passed",["consumerKernelBuildId"]="browser-occt-test",["availableSemantics"]=new JArray("transform.translation-1.0","relief.design-fit-brep-1","relief.source-convert-1"),["reliefDesignStatus"]="passed",["sourceConvertStatus"]="passed"}.ToString());
        NativeAdapter.Configure(worker,proof);
        Expect(NativeAdapter.ReliefDesignEnabled&&NativeAdapter.SourceConvertEnabled,"capabilities enabled by matching worker proof");
        const string token="relief-check-credential-0123456789abcdef";
        using var runtime=new ServiceRuntime(root,Path.Combine(root,"no-logo.exe"),token);
        JObject Call(string method,string route,byte[] body=null,string kind=null,string name=null,string key=null){var r=runtime.Handle(new WireRequest{Method=method,Route=route,Credential=token,Body=body,AssetKind=kind,FileName=name,IdempotencyKey=key});return JObject.Parse(Encoding.UTF8.GetString(r.Body));}
        var caps=Call("GET","/v1/capabilities");var ops=(JArray)caps["operations"];
        Expect(ops.Any(o=>(string)o["semanticVersion"]=="relief.design-fit-brep-1"&&(int)o["limits"]["maxFieldSide"]==257),"capabilities advertise relief.design-fit-brep-1");
        Expect(ops.Any(o=>(string)o["semanticVersion"]=="relief.source-convert-1"),"capabilities advertise relief.source-convert-1");
        JObject Wait(string job){for(int i=0;i<300;i++){var j=Call("GET","/v1/jobs/"+job);var s=(string)j["execution"];if(s=="succeeded"||s=="failed"||s=="cancelled"||s=="terminated")return j;Thread.Sleep(100);}Console.WriteLine("TIMEOUT "+Call("GET","/v1/jobs/"+job).ToString(Newtonsoft.Json.Formatting.None));return null;}
        // design-fit-brep
        var brepBytes=File.ReadAllBytes(brep);var asset=Call("POST","/v1/assets",brepBytes,"brep","box.brep");
        JObject Job(JObject p,string fp,string key){var body=new JObject{["requestId"]=key,["documentId"]="doc",["documentInstanceId"]="inst",["expectedRevision"]=1,["featureId"]="relief-1",["operation"]="reliefDesign",["schemaVersion"]="1.0",["semanticVersion"]="relief.design-fit-brep-1",["strategy"]="masked-bspline-face-replacement",["inputs"]=new JArray(new JObject{["assetId"]=asset["assetId"],["sha256"]=asset["sha256"],["role"]="source",["sourceFeatureId"]="box-1"}),["placementSnapshot"]=null,["selectionIntent"]=new JObject{["kind"]="planar-face-geometric-intent",["point"]=new JArray(0.0,0.0,20.0),["normal"]=new JArray(0.0,0.0,1.0)},["params"]=p,["requiredResultFormat"]="occt-text-brep-v1",["recipeFingerprint"]=fp};return Call("POST","/v1/compute/jobs",Encoding.UTF8.GetBytes(body.ToString()),key:key);}
        var p33=DesignParams(33,17);p33["domain"]["support"]["widthMm"]=20.0;var accepted=Job(p33,"recipe-33","k-33");Expect(accepted["jobId"]!=null,"design job accepted: "+(accepted["jobId"]??accepted["code"]));
        var done=Wait((string)accepted["jobId"]);Expect((string)done?["execution"]=="succeeded","design job succeeded "+(done?["error"]??""));
        if((string)done?["execution"]=="succeeded"){var result=Call("GET","/v1/jobs/"+accepted["jobId"]+"/result");
            Expect((string)result["geometryArtifact"]["format"]=="occt-text-brep-v1"&&(long)result["geometryArtifact"]["bytes"]>0,"BRep artifact published");
            Expect(result["stepArtifact"]==null,"STEP export belongs to the browser");
            Expect(result["reliefDesign"]?["fit"]?["controlDeltasSha256"]!=null&&(string)result["reliefDesign"]["trim"]!=null,"fit controls + trim report returned");
            Expect((bool?)result["reliefDesign"]["quality"]["consistent"]==true,"volume cross-check consistent");
            var art=runtime.Handle(new WireRequest{Method="GET",Route="/v1/artifacts/"+result["geometryArtifact"]["artifactId"],Credential=token});Expect(art.Body.Length>0,"BRep bytes available");File.WriteAllBytes(Path.Combine(Environment.GetEnvironmentVariable("RELIEF_CHECK_OUT")??root,"design-result.brep"),art.Body);
            File.WriteAllText(Path.Combine(Environment.GetEnvironmentVariable("RELIEF_CHECK_OUT")??root,"design-result.json"),result.ToString());}
        // a conflicting design (relief touching the face boundary) fails with a coded error, never a mock result
        var bad=DesignParams(33,17);for(int k=0;k<33;k++)((JArray)bad["field"]["fixedMask"])[k]=0;((JArray)bad["field"]["heightsMm"])[16]=0.8;
        var badJob=Job(bad,"recipe-bad","k-bad");var badDone=badJob["jobId"]!=null?Wait((string)badJob["jobId"]):null;Expect(badJob["code"]!=null||(string)badDone?["execution"]=="failed","boundary-touching relief rejected: "+(badJob["code"]??badDone?["error"]?["code"]));
        // source-convert (4x4 gradient raster)
        var rgba=new byte[4*4*4];for(int i=0;i<16;i++){byte v=(byte)(i*16);rgba[i*4]=v;rgba[i*4+1]=v;rgba[i*4+2]=v;rgba[i*4+3]=255;}
        var raster=Call("POST","/v1/assets",rgba,"raster","img.rgba");
        var convBody=new JObject{["requestId"]="c1",["documentId"]="doc",["documentInstanceId"]="inst",["expectedRevision"]=1,["featureId"]="relief-1",["operation"]="reliefSourceConvert",["schemaVersion"]="1.0",["semanticVersion"]="relief.source-convert-1",["strategy"]="rgba-area-average",["inputs"]=new JArray(new JObject{["assetId"]=raster["assetId"],["sha256"]=raster["sha256"],["role"]="source",["sourceFeatureId"]="image-1"}),["placementSnapshot"]=null,["selectionIntent"]=new JObject{["kind"]="whole-source"},["params"]=new JObject{["width"]=4,["height"]=4,["settings"]=Settings(4,4)},["requiredResultFormat"]="relief-height-grid-u16le-v1",["recipeFingerprint"]="conv-1"};
        var conv=Call("POST","/v1/compute/jobs",Encoding.UTF8.GetBytes(convBody.ToString()),key:"k-conv");var convDone=Wait((string)conv["jobId"]);Expect((string)convDone?["execution"]=="succeeded","source-convert job succeeded "+(convDone?["error"]??conv["code"]));
        if((string)convDone?["execution"]=="succeeded"){var r=Call("GET","/v1/jobs/"+conv["jobId"]+"/result");Expect((string)r["gridArtifact"]["format"]=="relief-height-grid-u16le-v1"&&(int)r["grid"]["columns"]==4,"grid artifact published");
            var g=JObject.Parse(Encoding.UTF8.GetString(runtime.Handle(new WireRequest{Method="GET",Route="/v1/artifacts/"+r["gridArtifact"]["artifactId"],Credential=token}).Body));File.WriteAllText(Path.Combine(Environment.GetEnvironmentVariable("RELIEF_CHECK_OUT")??root,"convert-result.json"),g.ToString());
            Expect((string)g["grid"]["sha256"]==(string)r["grid"]["sha256"],"grid hash matches manifest");}
        return failures==0?0:1;
    }
}
