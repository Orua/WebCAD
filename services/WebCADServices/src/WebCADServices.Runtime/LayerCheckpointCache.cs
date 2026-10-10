using System;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;

namespace WebCADServices.Runtime
{
    // Only the Host chooses cache paths. Publish after the complete worker succeeds;
    // interrupted native writes have no trusted receipt and are never reused.
    sealed class LayerCheckpointCache
    {
        readonly string root;
        const long Budget = 256L * 1024 * 1024;
        public LayerCheckpointCache(string dataRoot,string owner,string build)
        {
            root=Path.Combine(dataRoot,"layer-cache",Hash(new JArray(owner,build)));Directory.CreateDirectory(root);
        }
        static JToken Canonical(JToken token) => token is JObject obj ? new JObject(obj.Properties().OrderBy(p=>p.Name,StringComparer.Ordinal).Select(p=>new JProperty(p.Name,Canonical(p.Value)))) : token is JArray arr ? new JArray(arr.Select(Canonical)) : token.DeepClone();
        public static string Hash(JToken value) => Protocol.Hash(Encoding.UTF8.GetBytes(Canonical(value).ToString(Formatting.None)));
        public string Read(string key)
        {
            var receipt=Path.Combine(root,key+".json");if(!File.Exists(receipt))return null;
            JObject meta;try{meta=JObject.Parse(File.ReadAllText(receipt));}catch(JsonException){throw new ServiceError("LAYER_CACHE_CORRUPT","Layer checkpoint receipt is corrupt; no automatic heavy retry",409);}var path=Path.Combine(root,key+".brep");
            if((string)meta["key"]!=key||(string)meta["format"]!="occt-text-brep-v1"||!File.Exists(path)||new FileInfo(path).Length!=(long?)meta["bytes"]||new FileInfo(path).Length>Protocol.MaxUpload||Protocol.Hash(File.ReadAllBytes(path))!=(string)meta["sha256"])throw new ServiceError("LAYER_CACHE_CORRUPT","Stored exact layer checkpoint failed verification; no automatic heavy retry",409);
            File.SetLastWriteTimeUtc(receipt,DateTime.UtcNow);return path;
        }
        public void Publish(string key,string source)
        {
            if(!File.Exists(source))return;
            var size=new FileInfo(source).Length;if(size>Protocol.MaxUpload)return;
            // A previously verified prefix stays authoritative. A crash between
            // BRep and receipt publication leaves an untrusted orphan; replace
            // that file atomically rather than failing a valid completed job.
            if(Read(key)!=null)return;
            var bytes=File.ReadAllBytes(source);var destination=Path.Combine(root,key+".brep");
            if(File.Exists(destination)){
                var temporary=Path.Combine(root,".partial-"+Guid.NewGuid().ToString("N"));
                try{Store.Atomic(temporary,bytes);File.Replace(temporary,destination,null);}finally{if(File.Exists(temporary))File.Delete(temporary);}
            }else Store.Atomic(destination,bytes);
            Store.Atomic(Path.Combine(root,key+".json"),Encoding.UTF8.GetBytes(new JObject{["key"]=key,["sha256"]=Protocol.Hash(bytes),["bytes"]=bytes.Length,["format"]="occt-text-brep-v1"}.ToString(Formatting.None)));
            var files=new DirectoryInfo(root).GetFiles("*.brep");long total=files.Sum(f=>f.Length);int count=files.Length;
            foreach(var file in files.OrderBy(f=>File.GetLastWriteTimeUtc(Path.ChangeExtension(f.FullName,".json")))){if(total<=Budget&&count<=64)break;File.Delete(Path.ChangeExtension(file.FullName,".json"));File.Delete(file.FullName);total-=file.Length;count--;}
        }
    }
}
