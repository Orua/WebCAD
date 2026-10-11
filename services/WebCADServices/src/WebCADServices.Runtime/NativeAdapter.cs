using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;

namespace WebCADServices.Runtime
{
    public static class NativeAdapter
    {
        public const string SemanticVersion="transform.translation-1.0";
        public const string ReliefSemanticVersion="relief.compiled-contours-1.0";
        public const string ReliefPatchSemanticVersion="relief.compiled-contours-local-patch-1.1";
        public const string ReliefStrokeSemanticVersion="relief.compiled-contours-strokes-1.2";
        public const string BooleanCutSemanticVersion="boolean.cut-1.0";
        public const string RoundBoundarySemanticVersion="round.planar-boundary-1.0";
        public static bool BooleanCutEnabled => Acceptance?["availableSemantics"] is JArray semantics && semantics.Values<string>().Contains(BooleanCutSemanticVersion) && (string)Acceptance["booleanCutStatus"]=="passed";
        public static bool RoundBoundaryEnabled => Acceptance?["availableSemantics"] is JArray semantics && semantics.Values<string>().Contains(RoundBoundarySemanticVersion) && (string)Acceptance["roundBoundaryStatus"]=="passed";
        public static bool ReliefStrokeEnabled => Acceptance?["availableSemantics"] is JArray semantics && semantics.Values<string>().Contains(ReliefStrokeSemanticVersion) && !ServiceRuntime.TbdOperations().Any(x => (string)x["semanticVersion"] == ReliefStrokeSemanticVersion && (bool?)x["enabled"] == false);
        public static bool ReliefPatchEnabled => Acceptance?["availableSemantics"] is JArray semantics && semantics.Values<string>().Contains(ReliefPatchSemanticVersion);
        public static bool ReliefEnabled => Acceptance?["availableSemantics"] is JArray semantics && semantics.Values<string>().Contains(ReliefSemanticVersion);
        static string configuredWorker,configuredProof;
        public static void Configure(string worker,string proof) { configuredWorker=Path.GetFullPath(worker);configuredProof=Path.GetFullPath(proof); }
        public static string Worker => configuredWorker ?? Environment.GetEnvironmentVariable("WEBCAD_SERVICES_OCCT_WORKER");
        public static JObject Acceptance
        {
            get {
                string proof=configuredProof ?? Environment.GetEnvironmentVariable("WEBCAD_SERVICES_NATIVE_ACCEPTANCE");if(string.IsNullOrEmpty(Worker)||!File.Exists(Worker)||string.IsNullOrEmpty(proof)||!File.Exists(proof))return null;
                try{var value=JObject.Parse(File.ReadAllText(proof));if((string)value["producerKernelBuildId"]!=BuildId|| (string)value["codec"]!="occt-text-brep-v1" || (int?)value["brepVersion"]!=3)return null;return value;}catch(IOException){return null;}catch(Newtonsoft.Json.JsonException){return null;}
            }
        }
        public static string BuildId => "native-occt@7.8.1:sha256:"+Protocol.Hash(File.ReadAllBytes(Worker));
        static JObject Pick(JToken value,params string[] keys){var result=new JObject();if(value is JObject obj)foreach(string key in keys)if(obj[key]!=null)result[key]=obj[key].DeepClone();return result;}
        static JObject BoundSupport(JToken value){
            if(value is not JObject diagnostic||(string)diagnostic["version"]!="support-binding-1")return null;
            var result=Pick(diagnostic,"version","status","failureReason","elapsedMs","numericIndicesTransferred","truncated");
            result["counts"]=Pick(diagnostic["counts"],"sourceFaces","cylinderFaces","geometricCandidates","trimmedDistanceChecks","matchCount");
            result["rejections"]=Pick(diagnostic["rejections"],"notCylinder","radiusMismatch","axisMismatch","outsideTrimmedDomain","distanceUnavailable");
            result["tolerances"]=Pick(diagnostic["tolerances"],"radiusMm","axisDotError","trimmedDistanceMm","normalProbeMm","classifierMm");
            result["normalProbe"]=Pick(diagnostic["normalProbe"],"minusNormalState","plusNormalState");
            var samples=diagnostic["samples"] as JArray??new JArray();result["samples"]=new JArray(samples.Take(16).Select(sample=>Pick(sample,"radiusMm","radiusErrorMm","axisDotAbs","trimmedDistanceMm","reason")));
            result["sampleLimit"]=16;result["truncated"]=(bool?)result["truncated"]==true||samples.Count>16;return result;
        }
        public static JObject Validate(JObject input,Store store,string owner)
        {
            if(Acceptance==null)throw new ServiceError("OPERATION_UNAVAILABLE","Native kernel pair is not accepted",409);
            Protocol.Keys(input,"requestId","documentId","documentInstanceId","expectedRevision","featureId","operation","schemaVersion","semanticVersion","inputs","placementSnapshot","selectionIntent","params","strategy","requiredResultFormat","recipeFingerprint");
            bool translation=(string)input["operation"]=="transform"&&(string)input["semanticVersion"]==SemanticVersion&&(string)input["strategy"]=="translation";
            bool booleanCut=BooleanCutEnabled&&(string)input["operation"]=="cut"&&(string)input["semanticVersion"]==BooleanCutSemanticVersion&&(string)input["strategy"]=="multi-source-boolean";
            bool roundBoundary=RoundBoundaryEnabled&&(string)input["operation"]=="round"&&(string)input["semanticVersion"]==RoundBoundarySemanticVersion&&(string)input["strategy"]=="planar-boundary-cutter";
            bool relief=(ReliefEnabled&&(string)input["semanticVersion"]==ReliefSemanticVersion||ReliefPatchEnabled&&(string)input["semanticVersion"]==ReliefPatchSemanticVersion||ReliefStrokeEnabled&&(string)input["semanticVersion"]==ReliefStrokeSemanticVersion)&&(string)input["operation"]=="relief"&&new[]{"cutHoleSolids","faceWithHolesExtrude"}.Contains((string)input["strategy"]);
            if((!translation&&!relief&&!booleanCut&&!roundBoundary)||(string)input["schemaVersion"]!="1.0"||(string)input["requiredResultFormat"]!="occt-text-brep-v1")throw new ServiceError("OPERATION_VERSION_UNSUPPORTED","Native operation semantics/strategy/codec are not accepted",409);
            foreach(var field in new[]{"requestId","documentId","documentInstanceId","featureId","recipeFingerprint"})if(input[field]?.Type!=JTokenType.String||((string)input[field]).Length<1||((string)input[field]).Length>200)throw new ServiceError("PARAM_SCHEMA_INVALID","Missing identity/fingerprint");
            if(input["expectedRevision"]?.Type!=JTokenType.Integer||(long)input["expectedRevision"]<1)throw new ServiceError("PARAM_SCHEMA_INVALID","Expected positive document revision");
            if(input["placementSnapshot"]?.Type!=JTokenType.Null)throw new ServiceError("PARAM_SCHEMA_INVALID","Compiled world-coordinate snapshots do not accept a second placement transform");
            if(input["params"] is not JObject parameters)throw new ServiceError("PARAM_SCHEMA_INVALID","Typed operation parameters required");
            if(input["selectionIntent"] is not JObject selection)throw new ServiceError("PARAM_SCHEMA_INVALID","Selection intent required");
            if(translation){Protocol.Keys(parameters,"x","y","z");foreach(var axis in new[]{"x","y","z"})Number(parameters[axis],100000);Protocol.Keys(selection,"kind");if((string)selection["kind"]!="whole-source")throw new ServiceError("SELECTION_UNSUPPORTED","No cross-kernel numeric topology indices accepted");}
            else if(booleanCut){Protocol.Keys(parameters,"keepTools");if(parameters["keepTools"]!=null&&parameters["keepTools"].Type!=JTokenType.Boolean)throw new ServiceError("PARAM_SCHEMA_INVALID","keepTools must be a boolean client history option");Protocol.Keys(selection,"kind");if((string)selection["kind"]!="whole-sources")throw new ServiceError("SELECTION_UNSUPPORTED","Boolean inputs bind complete ordered solids, never topology indices");}
            else if(roundBoundary){Protocol.Keys(parameters,"radius");Number(parameters["radius"],10000);if((double)parameters["radius"]<=0)throw new ServiceError("PARAM_SCHEMA_INVALID","Round boundary requires a positive radius");Protocol.Keys(selection,"kind","point","normal");if((string)selection["kind"]!="planar-face-geometric-intent")throw new ServiceError("SELECTION_UNSUPPORTED","A planar face interior point and outward normal are required");Point(selection["point"]);Point(selection["normal"],true);}
            else{Protocol.Keys(selection,"kind","radiusMm","point","axis","normal");Number(selection["radiusMm"],10000);if((string)selection["kind"]!="outer-cylinder"||(double)selection["radiusMm"]<1)throw new ServiceError("SELECTION_UNSUPPORTED","Explicit outer-cylinder geometric intent required");Point(selection["point"]);Point(selection["axis"],true);Point(selection["normal"],true);}
            if(input["inputs"] is not JArray sources||sources.Count<1||sources.Count>33||sources[0] is not JObject source||translation&&sources.Count!=1)throw new ServiceError("PARAM_SCHEMA_INVALID","Bounded source/tool BReps required");
            if(roundBoundary&&(sources.Count!=1||source["sourceFeatureId"]?.Type!=JTokenType.String||((string)source["sourceFeatureId"]).Length<1||((string)source["sourceFeatureId"]).Length>200))throw new ServiceError("PARAM_SCHEMA_INVALID","Round boundary requires exactly one bound source");
            if(booleanCut){if(sources.Count<2)throw new ServiceError("PARAM_SCHEMA_INVALID","Boolean Cut requires one source and 1 to 32 tools");for(int i=0;i<sources.Count;i++){if(sources[i] is not JObject part||(string)part["role"]!=(i==0?"source":"tool")||part["sourceFeatureId"]?.Type!=JTokenType.String||((string)part["sourceFeatureId"]).Length<1||((string)part["sourceFeatureId"]).Length>200)throw new ServiceError("PARAM_SCHEMA_INVALID","Boolean inputs must retain ordered source/tool roles and source feature bindings");}}
            var assets=new JObject();long totalBytes=0;foreach(var item in sources){if(item is not JObject part)throw new ServiceError("PARAM_SCHEMA_INVALID","Typed geometry asset required");Protocol.Keys(part,"assetId","sha256","role","sourceFeatureId");var accepted=store.Asset(owner,(string)part["assetId"]);if((string)accepted["kind"]!="brep"||(string)accepted["sha"]!=(string)part["sha256"]||(long)accepted["bytes"]>Protocol.MaxUpload||!new[]{"source","tool"}.Contains((string)part["role"]))throw new ServiceError("SOURCE_HASH_MISMATCH","Geometry role/hash/budget differs from accepted asset");assets[(string)accepted["id"]]=new JObject{["sha256"]=accepted["sha"],["role"]=part["role"]};totalBytes+=(long)accepted["bytes"];}
            if(totalBytes>64L*1024*1024)throw new ServiceError("GEOMETRY_SOURCE_LIMIT","Aggregate exact input exceeds the native budget",413);
            var asset=store.Asset(owner,(string)source["assetId"]);if((string)asset["kind"]!="brep"||(string)source["role"]!="source"||(string)asset["sha"]!=(string)source["sha256"])throw new ServiceError("SOURCE_HASH_MISMATCH","Source role/hash differs from accepted asset");
            if((long)asset["bytes"]>Protocol.MaxUpload)throw new ServiceError("GEOMETRY_SOURCE_LIMIT","Initial native bridge source exceeds its declared client-tested budget",413);
            if(relief)ValidateRelief(parameters,assets,(string)input["semanticVersion"]==ReliefStrokeSemanticVersion);
            var semanticParams=(JObject)parameters.DeepClone();if(relief)foreach(JObject layer in (JArray)semanticParams["layers"]){string id=(string)layer["toolAssetId"];layer.Remove("toolAssetId");layer["toolSha256"]=assets[id]["sha256"];}
            // Every ordered source participates in the physical cache key.
            // keepTools belongs to document history, not native geometry.
            if(booleanCut)semanticParams=new JObject{["inputSha256"]=new JArray(sources.Select(part=>part["sha256"].DeepClone()))};
            return new JObject { ["operation"]=input["operation"],["engineBuildId"]=BuildId,["assetId"]=asset["id"],["sourceSha256"]=asset["sha"],["params"]=parameters,["semanticParams"]=semanticParams,["assets"]=assets,["publicRequest"]=input };
        }
        static void Number(JToken value,double bound){if(value==null||!new[]{JTokenType.Integer,JTokenType.Float}.Contains(value.Type)||double.IsNaN((double)value)||double.IsInfinity((double)value)||Math.Abs((double)value)>bound)throw new ServiceError("PARAM_SCHEMA_INVALID","Bounded finite number required");}
        static void Point(JToken value,bool unit=false){if(value is not JArray point||point.Count!=3)throw new ServiceError("PARAM_SCHEMA_INVALID","World XYZ point required");foreach(var v in point)Number(v,100000);if(unit&&Math.Abs(Math.Sqrt(point.Sum(v=>(double)v*(double)v))-1)>1e-9)throw new ServiceError("PARAM_SCHEMA_INVALID","Unit vector required");}
        static void ValidateRelief(JObject parameters,JObject assets,bool strokes){
            Protocol.Keys(parameters,"layers");if(parameters["layers"] is not JArray layers||layers.Count<1||layers.Count>32)throw new ServiceError("PARAM_SCHEMA_INVALID","Bounded layer plan required");int count=0;
            foreach(var item in layers){if(item is not JObject layer)throw new ServiceError("PARAM_SCHEMA_INVALID","Typed layer required");Protocol.Keys(layer,"toolAssetId","normal","spanMm","regions","memberLayerIds","mode");if(strokes){if(layer["mode"]?.Type!=JTokenType.String||!new[]{"emboss","engrave"}.Contains((string)layer["mode"]))throw new ServiceError("PARAM_SCHEMA_INVALID","Explicit physical layer mode required");}else if(layer["mode"]!=null)throw new ServiceError("OPERATION_VERSION_UNSUPPORTED","Layer mode requires accepted strokes-1.2 semantics",409);if((string)assets[(string)layer["toolAssetId"]]?["role"]!="tool")throw new ServiceError("ASSET_INVALID","Layer tool is not a declared owned BRep");Point(layer["normal"],true);Number(layer["spanMm"],20000);if((double)layer["spanMm"]<=0)throw new ServiceError("PARAM_SCHEMA_INVALID","Positive extrusion span required");if(layer["memberLayerIds"] is not JArray ids||ids.Count<1||ids.Count>32||ids.Any(id=>id.Type!=JTokenType.String||((string)id).Length<1||((string)id).Length>150))throw new ServiceError("PARAM_SCHEMA_INVALID","Layer members required");
                if(layer["regions"] is not JArray regions||regions.Count<1||regions.Count>1024)throw new ServiceError("PARAM_SCHEMA_INVALID","Bounded region plan required");foreach(var regionItem in regions){if(regionItem is not JObject region)throw new ServiceError("PARAM_SCHEMA_INVALID","Typed contour region required");Protocol.Keys(region,"outer","holes");if(region["holes"] is not JArray holes||holes.Count>1024)throw new ServiceError("PARAM_SCHEMA_INVALID","Bounded holes required");foreach(var ring in new[]{region["outer"]}.Concat(holes)){if(ring is not JArray segments||segments.Count<3)throw new ServiceError("PARAM_SCHEMA_INVALID","Closed contour primitives required");foreach(var segmentItem in segments){if(++count>64000||segmentItem is not JObject segment)throw new ServiceError("SIZE_LIMIT","Compiled contour plan exceeds its primitive budget");Protocol.Keys(segment,"type","start","mid","end");Point(segment["start"]);Point(segment["end"]);if((string)segment["type"]=="arc")Point(segment["mid"]);else if((string)segment["type"]!="line"||segment["mid"]!=null)throw new ServiceError("PARAM_SCHEMA_INVALID","Explicit line/arc primitives required");}}}
            }
        }
        public static JObject Execute(JObject row,Store store,Func<bool> cancelled)
        {
            string id=(string)row["id"],owner=(string)row["owner"];var payload=JObject.Parse((string)row["request"]);var input=(JObject)payload["publicRequest"];
            string source=Path.Combine(store.Root,"assets",(string)payload["assetId"]);if(Protocol.Hash(File.ReadAllBytes(source))!=(string)payload["sourceSha256"])throw new ServiceError("SOURCE_HASH_MISMATCH","Stored BRep changed");
            if((string)payload["engineBuildId"]!=BuildId)throw new ServiceError("KERNEL_BUILD_CHANGED","Queued native build changed; inspect instead of executing new semantics",409);
            string dir=Path.Combine(store.Root,"jobs",id);Directory.CreateDirectory(dir);string request=Path.Combine(dir,"request.json"),output=Path.Combine(dir,"geometry.brep"),report=Path.Combine(dir,"native-report.json");
            LayerCheckpointCache layerCache=null;var checkpointKeys=new System.Collections.Generic.List<string>();
            var privateParams=(JObject)payload["params"].DeepClone();if((string)input["operation"]=="cut"){
                var toolPaths=new JArray();foreach(JObject part in ((JArray)input["inputs"]).Skip(1)){string assetId=(string)part["assetId"],path=Path.Combine(store.Root,"assets",assetId);if(Protocol.Hash(File.ReadAllBytes(path))!=(string)part["sha256"])throw new ServiceError("SOURCE_HASH_MISMATCH","Stored Boolean tool BRep changed");toolPaths.Add(path);}
                privateParams=new JObject{["toolPaths"]=toolPaths};
            }else if((string)input["operation"]=="round"){
                privateParams["faceIntent"]=input["selectionIntent"].DeepClone();
            }else if((string)input["operation"]=="relief"){
                layerCache=new LayerCheckpointCache(store.Root,owner,BuildId);string chain=LayerCheckpointCache.Hash(new JObject{["version"]="native-layer-cache-1",["sourceSha256"]=payload["sourceSha256"],["engineBuildId"]=BuildId,["semanticVersion"]=input["semanticVersion"],["strategy"]=input["strategy"],["supportIntent"]=input["selectionIntent"]});
                privateParams["supportIntent"]=input["selectionIntent"];int index=0;
                foreach(JObject layer in (JArray)privateParams["layers"]){
                    string assetId=(string)layer["toolAssetId"],path=Path.Combine(store.Root,"assets",assetId);if(Protocol.Hash(File.ReadAllBytes(path))!=(string)payload["assets"][assetId]["sha256"])throw new ServiceError("SOURCE_HASH_MISMATCH","Stored tool BRep changed");
                    var physical=(JObject)layer.DeepClone();physical.Remove("toolAssetId");physical["toolSha256"]=payload["assets"][assetId]["sha256"];chain=LayerCheckpointCache.Hash(new JObject{["prefix"]=chain,["layer"]=physical});checkpointKeys.Add(chain);
                    var cachePath=layerCache.Read(chain);if(cachePath!=null)layer["cacheReadPath"]=cachePath;
                    layer["checkpointPath"]=Path.Combine(dir,"layer-"+index+".brep");index++;layer.Remove("toolAssetId");layer["toolPath"]=path;
                }
            }
            var requestBytes=System.Text.Encoding.UTF8.GetBytes(new JObject { ["operation"]=input["operation"],["semanticVersion"]=input["semanticVersion"],["strategy"]=input["strategy"],["params"]=privateParams,["sourcePath"]=source,["outputPath"]=output,["reportPath"]=report,["inputFingerprint"]=row["fingerprint"],["featureId"]=input["featureId"],["expectedRevision"]=input["expectedRevision"] }.ToString(Newtonsoft.Json.Formatting.None));if(requestBytes.Length>Protocol.MaxNativePlan)throw new ServiceError("SIZE_LIMIT","Compiled native plan exceeds its declared request budget");Store.Atomic(request,requestBytes);
            int exit;try{exit=new WorkerSupervisor().Run(Worker,request,cancelled,pid=>store.Attempt(id,pid),out string diagnostic);}catch(ServiceError error){string progressPath=report+".progress.json";var progress=File.Exists(progressPath)?JObject.Parse(File.ReadAllText(progressPath)):null;throw new ServiceError(error.Code,error.Message,error.Status,(string)progress?["stage"],id+":native-progress");}store.Attempt(id,0,exit);
            if(exit!=0){var details=File.Exists(report)?JObject.Parse(File.ReadAllText(report)):null;throw new ServiceError((string)details?["code"]??"NATIVE_WORKER_FAILED",(string)details?["message"]??("Native worker exit "+exit),400,(string)details?["stage"],id+":native-report",BoundSupport(details?["supportBinding"]));}
            if(cancelled())throw new ServiceError("WORKER_TERMINATED","Native process finished after a cancellation request");
            var result=JObject.Parse(File.ReadAllText(report));if((bool?)result["ok"]!=true||(string)result["inputFingerprint"]!=(string)row["fingerprint"])throw new ServiceError("RESULT_MISMATCH","Native report does not match accepted input");
            // Binding is a diagnostic stage, never a physical layer/cache entry.
            if((string)input["operation"]=="relief")result["stages"]=new JArray((result["stages"] as JArray??new JArray()).OfType<JObject>().Where(stage=>stage["layer"]?.Type==JTokenType.Integer));
            result["supportBinding"]=BoundSupport(result["supportBinding"]);
            var artifact=store.PublishGeometry(owner,File.ReadAllBytes(output));
            var warnings=new JArray();
            try{for(int i=0;i<checkpointKeys.Count;i++)layerCache.Publish(checkpointKeys[i],Path.Combine(dir,"layer-"+i+".brep"));}
            catch(IOException){warnings.Add(new JObject{["code"]="LAYER_CACHE_NOT_PUBLISHED",["message"]="Precise result accepted; optional layer cache could not be published"});}
            catch(UnauthorizedAccessException){warnings.Add(new JObject{["code"]="LAYER_CACHE_NOT_PUBLISHED",["message"]="Precise result accepted; optional layer cache storage is unavailable"});}
            var manifest=new JObject { ["jobId"]=id,["inputFingerprint"]=row["fingerprint"],["recipeFingerprint"]=input["recipeFingerprint"],["documentId"]=input["documentId"],["documentInstanceId"]=input["documentInstanceId"],["expectedRevision"]=input["expectedRevision"],["featureId"]=input["featureId"],["operation"]=input["operation"],["semanticVersion"]=input["semanticVersion"],["strategy"]=input["strategy"],["stages"]=result["stages"],["kernelBuildId"]=BuildId,["codec"]="occt-text-brep-v1",["units"]="mm",["coordinateSystem"]="world-xyz-right-handed",["geometryArtifact"]=artifact,["sourceSha256"]=payload["sourceSha256"],["topologyBinding"]=result["topologyBinding"],["supportBinding"]=result["supportBinding"],["validation"]=result["validation"],["before"]=result["before"],["timings"]=result["timings"],["warnings"]=warnings,["commit"]="notCommitted" };
            if((string)input["operation"]=="cut")manifest["inputSha256"]=payload["semanticParams"]["inputSha256"].DeepClone();
            if((string)input["operation"]=="round")manifest["roundBoundary"]=result["roundBoundary"]?.DeepClone();return manifest;
        }
    }
}
