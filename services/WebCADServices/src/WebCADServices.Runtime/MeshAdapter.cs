using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;

namespace WebCADServices.Runtime
{
    public static class MeshAdapter
    {
        public const string Codec="webcad-mesh-f64-u32-v1";
        public const string InspectSemantic="mesh.source-preservation-1.0";
        public const string TranslateSemantic="mesh.translation-1.0";
        static string worker,proof;
        public static void Configure(string executable,string acceptance){worker=Path.GetFullPath(executable);proof=Path.GetFullPath(acceptance);}
        public static string Worker=>worker??Environment.GetEnvironmentVariable("WEBCAD_SERVICES_MESH_WORKER");
        public static string BuildId=>string.IsNullOrEmpty(Worker)||!File.Exists(Worker)?null:"native-mesh@manifold-3.5.4:sha256:"+Protocol.Hash(File.ReadAllBytes(Worker));
        public static JObject Acceptance
        {
            get{
                var path=proof??Environment.GetEnvironmentVariable("WEBCAD_SERVICES_MESH_ACCEPTANCE");if(BuildId==null||string.IsNullOrEmpty(path)||!File.Exists(path))return null;
                try{var p=JObject.Parse(File.ReadAllText(path));return (string)p["producerKernelBuildId"]==BuildId&&(string)p["codec"]==Codec&&(string)p["sourceCoordinateStatus"]=="passed"&&(string)p["clientCapacityStatus"]=="passed"&&(string)p["offlineStatus"]=="passed"?p:null;}catch(IOException){return null;}catch(Newtonsoft.Json.JsonException){return null;}
            }
        }
        public static JObject Capabilities()=>new JObject{
            ["enabled"]=Acceptance!=null,["codec"]=Codec,["producerKernelBuildId"]=BuildId,
            ["maxSourceBytes"]=Protocol.MaxMeshSource,["maxResultBytes"]=Protocol.MaxMeshResult,["maxTriangles"]=2000000,
            ["sourceTypes"]=new JArray("binary-stl"),["resultTypes"]=new JArray("rawMesh"),
            ["operations"]=new JArray(new JObject{["operation"]="mesh.inspect",["semanticVersion"]=InspectSemantic,["enabled"]=Acceptance!=null},new JObject{["operation"]="mesh.translate",["semanticVersion"]=TranslateSemantic,["enabled"]=Acceptance!=null&&(string)Acceptance["translationStatus"]=="passed"}),
            ["solidBoolean"]=false,["repairAutomatic"]=false,["blocker"]=Acceptance==null?"Mesh worker/source/client/offline gates are incomplete":null};
        public static JObject Validate(JObject input,Store store,string owner)
        {
            var accepted=Acceptance;if(accepted==null)throw new ServiceError("MESH_OPERATION_UNAVAILABLE","Mesh source/client/offline capacity has not been accepted",409);
            Protocol.Keys(input,"requestId","documentId","documentInstanceId","expectedRevision","featureId","operation","schemaVersion","semanticVersion","inputs","params","recipeFingerprint","requiredResultFormat","placementSnapshot","selectionIntent","strategy");
            var op=(string)input["operation"];var semantic=(string)input["semanticVersion"];
            if(op!="mesh.inspect"&&op!="mesh.translate"||op=="mesh.inspect"&&semantic!=InspectSemantic||op=="mesh.translate"&&(semantic!=TranslateSemantic||(string)accepted["translationStatus"]!="passed")||(string)input["schemaVersion"]!="1.0"||(string)input["requiredResultFormat"]!=Codec)throw new ServiceError("OPERATION_VERSION_UNSUPPORTED","Only accepted source-preserving mesh semantics are supported",409);
            foreach(var field in new[]{"requestId","documentId","documentInstanceId","featureId","recipeFingerprint"})if(input[field]?.Type!=JTokenType.String||string.IsNullOrWhiteSpace((string)input[field])||((string)input[field]).Length>200)throw new ServiceError("PARAM_SCHEMA_INVALID","Full bounded identity is required");
            if(input["expectedRevision"]?.Type!=JTokenType.Integer||(long)input["expectedRevision"]<1||input["placementSnapshot"]!=null&&input["placementSnapshot"].Type!=JTokenType.Null||input["selectionIntent"]!=null&&input["selectionIntent"].Type!=JTokenType.Null)throw new ServiceError("PARAM_SCHEMA_INVALID","Mesh snapshots require positive revision and no BRep topology or second placement");
            if(input["inputs"] is not JArray sources||sources.Count!=1||sources[0] is not JObject source)throw new ServiceError("PARAM_SCHEMA_INVALID","Exactly one controlled source asset required");Protocol.Keys(source,"assetId","sha256","role","sourceFeatureId");
            var asset=store.Asset(owner,(string)source["assetId"]);if((string)asset["kind"]!="mesh"||(string)source["role"]!="source"||(string)source["sha256"]!=(string)asset["sha"]||(long)asset["bytes"]>Protocol.MaxMeshSource||!((string)asset["name"]).EndsWith(".stl",StringComparison.OrdinalIgnoreCase))throw new ServiceError("SOURCE_HASH_MISMATCH","Typed STL role/hash/budget does not match the accepted source");
            if(input["params"] is not JObject p)throw new ServiceError("PARAM_SCHEMA_INVALID","Explicit mesh units required");Protocol.Keys(p,"units","translationMm");var units=(string)p["units"];if(!new[]{"mm","cm","m","in"}.Contains(units))throw new ServiceError("MESH_UNITS_REQUIRED","STL has no units: explicitly declare source units");
            if(op=="mesh.translate"){if(p["translationMm"] is not JArray delta||delta.Count!=3||delta.Any(x=>x.Type!=JTokenType.Float&&x.Type!=JTokenType.Integer||Math.Abs((double)x)>100000))throw new ServiceError("PARAM_SCHEMA_INVALID","Three bounded mm translation values required");}
            else if(p["translationMm"]!=null)throw new ServiceError("PARAM_SCHEMA_INVALID","Inspection cannot transform a source");
            return new JObject{["operation"]=op,["assetId"]=asset["id"],["sourceSha256"]=asset["sha"],["sourceName"]=asset["name"],["engineBuildId"]=BuildId,["semanticVersion"]=semantic,["semanticParams"]=p.DeepClone(),["publicRequest"]=input.DeepClone()};
        }
        public static void CheckCodec(byte[] bytes)
        {
            if(bytes.Length<64||bytes.Length>Protocol.MaxMeshResult||!bytes.Take(8).SequenceEqual(new byte[]{87,67,77,69,83,72,49,0})||BitConverter.ToUInt32(bytes,8)!=1||BitConverter.ToUInt32(bytes,12)!=64||BitConverter.ToUInt32(bytes,24)!=8||BitConverter.ToUInt32(bytes,28)!=4||BitConverter.ToUInt32(bytes,32)!=1||bytes.Skip(36).Take(28).Any(x=>x!=0))throw new ServiceError("MESH_CODEC_INVALID","Mesh codec header/budget invalid");
            var vertices=BitConverter.ToUInt32(bytes,16);var triangles=BitConverter.ToUInt32(bytes,20);long end=64L+vertices*24L;if(vertices>12000000||triangles<1||triangles>4000000||end+triangles*12L!=bytes.LongLength)throw new ServiceError("MESH_CODEC_INVALID","Mesh declared counts do not match its full payload");
            for(long at=64;at<end;at+=8){var n=BitConverter.ToDouble(bytes,(int)at);if(double.IsNaN(n)||double.IsInfinity(n))throw new ServiceError("MESH_NONFINITE","Nonfinite artifact coordinates");}for(long at=end;at<bytes.LongLength;at+=4)if(BitConverter.ToUInt32(bytes,(int)at)>=vertices)throw new ServiceError("MESH_INDEX_INVALID","Out-of-range mesh index");
        }
        public static JObject Execute(JObject row,Store store,Func<bool> cancelled)
        {
            var payload=JObject.Parse((string)row["request"]);if((string)payload["engineBuildId"]!=BuildId)throw new ServiceError("KERNEL_BUILD_CHANGED","Queued mesh worker changed; do not recompute under another build",409);
            string id=(string)row["id"],owner=(string)row["owner"],sourcePath=Path.Combine(store.Root,"assets",(string)payload["assetId"]);var input=(JObject)payload["publicRequest"];
            if(Protocol.Hash(File.ReadAllBytes(sourcePath))!=(string)payload["sourceSha256"])throw new ServiceError("SOURCE_HASH_MISMATCH","Persisted source changed");
            var dir=Path.Combine(store.Root,"jobs",id);Directory.CreateDirectory(dir);var request=new JObject{["operation"]=payload["operation"],["sourcePath"]=sourcePath,["sourceSha256"]=payload["sourceSha256"],["units"]=payload["semanticParams"]["units"]};if(payload["semanticParams"]["translationMm"]!=null)request["translationMm"]=payload["semanticParams"]["translationMm"].DeepClone();
            string path=Path.Combine(dir,"request.json");Store.Atomic(path,System.Text.Encoding.UTF8.GetBytes(request.ToString()));var supervisor=new WorkerSupervisor();int exit=supervisor.Run(Worker,path,cancelled,pid=>store.Attempt(id,pid),out string diagnostic);store.Attempt(id,0,exit);
            if(exit!=0)throw new ServiceError("MESH_WORKER_FAILED","Controlled mesh worker failed: "+diagnostic);
            if(cancelled())throw new ServiceError("CANCELLED","Mesh task cancelled before publication",409);
            var reportPath=Path.Combine(dir,"result.json");if(new FileInfo(reportPath).Length>65536)throw new ServiceError("MESH_REPORT_INVALID","Bounded mesh report required");var report=JObject.Parse(File.ReadAllText(reportPath));var bytes=File.ReadAllBytes(Path.Combine(dir,"geometry.mesh"));CheckCodec(bytes);
            if((string)report["sourceHash"]!=(string)payload["sourceSha256"]||(string)report["artifactSha256"]!=Protocol.Hash(bytes)||(long)report["artifactBytes"]!=bytes.LongLength||(long)report["triangleCount"]!=BitConverter.ToUInt32(bytes,20)||(string)report["geometryType"]!="rawMesh")throw new ServiceError("MESH_RESULT_MISMATCH","Worker source/count/artifact binding mismatch");
            var artifact=store.PublishMesh(owner,bytes);var binding=new JObject();foreach(var key in new[]{"requestId","documentId","documentInstanceId","expectedRevision","featureId","operation","semanticVersion","recipeFingerprint"})binding[key]=input[key].DeepClone();binding["sourceSha256"]=payload["sourceSha256"];
            return new JObject{["jobId"]=id,["inputFingerprint"]=row["fingerprint"],["requestBinding"]=binding,["sourceSha256"]=payload["sourceSha256"],["geometryArtifact"]=artifact,["producerKernelBuildId"]=BuildId,["semanticVersion"]=payload["semanticVersion"],["codec"]=Codec,["meshReport"]=report,["commit"]="notCommitted"};
        }
    }
}
