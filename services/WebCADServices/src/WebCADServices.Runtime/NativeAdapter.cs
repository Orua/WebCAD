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
        public const string DeformSemanticVersion="deform.nurbs-1.0";
        public const string DeformStrategy="nurbs-control-point-map";
        static bool HasDeformAcceptance(JObject proof) => proof?["availableSemantics"] is JArray semantics && semantics.Values<string>().Contains(DeformSemanticVersion) && (string)proof["status"]=="passed" && (string)proof["deformStatus"]=="passed";
        public static bool DeformEnabled => HasDeformAcceptance(Acceptance);
        public static bool MatchesDeformOperation(string operation,string semanticVersion,string strategy) => operation=="deform"&&semanticVersion==DeformSemanticVersion&&strategy==DeformStrategy;
        public static JObject DeformCapability() {
            var proof=Acceptance;if(!HasDeformAcceptance(proof))return null;
            return new JObject { ["operation"]="deform",["schemaVersion"]="1.0",["semanticVersion"]=DeformSemanticVersion,["supportedStrategies"]=new JArray(DeformStrategy),["kernelBuildId"]=BuildId,["resultFormats"]=new JArray("occt-text-brep-v1"),["limits"]=new JObject{["maxSourceBytes"]=Protocol.MaxUpload,["maxSolids"]=1,["maxResultSolids"]=1,["clientResultBudgetBytes"]=Protocol.MaxUpload,["maxFfdDimension"]=8,["maxFfdControlPoints"]=512},["kinds"]=new JArray("scaleXYZ","ellipsoid","bend","twist","taper","ffd"),["enabled"]=true,["blockers"]=new JArray(),["acceptanceStatus"]="passed" };
        }
        public const string ReliefSemanticVersion="relief.compiled-contours-1.0";
        public const string ReliefPatchSemanticVersion="relief.compiled-contours-local-patch-1.1";
        public const string ReliefStrokeSemanticVersion="relief.compiled-contours-strokes-1.2";
        public const string BooleanCutSemanticVersion="boolean.cut-1.0";
        public const string ShoulderSemanticVersion="relief.central-shoulder-1.0";
        public static bool ShoulderEnabled => Acceptance?["availableSemantics"] is JArray semantics && semantics.Values<string>().Contains(ShoulderSemanticVersion) && (string)Acceptance["shoulderStatus"]=="passed";
        public const string RoundBoundarySemanticVersion="round.planar-boundary-1.0";
        // 261022-04 relief pipeline: first full computation on Services (browser keeps fine-tune + fallback).
        public const string ReliefDesignSemanticVersion="relief.design-fit-brep-1";
        public const string ReliefDesignStrategy="masked-bspline-face-replacement";
        public const string SourceConvertSemanticVersion="relief.source-convert-1";
        public const string SourceConvertStrategy="rgba-area-average";
        public const string HeightGridFormat="relief-height-grid-u16le-v1";
        public static bool ReliefDesignEnabled => Acceptance?["availableSemantics"] is JArray semantics && semantics.Values<string>().Contains(ReliefDesignSemanticVersion) && (string)Acceptance["reliefDesignStatus"]=="passed";
        public static bool SourceConvertEnabled => Acceptance?["availableSemantics"] is JArray semantics && semantics.Values<string>().Contains(SourceConvertSemanticVersion) && (string)Acceptance["sourceConvertStatus"]=="passed";
        public static bool MatchesReliefDesign(string operation,string semanticVersion,string strategy) => operation=="reliefDesign"&&semanticVersion==ReliefDesignSemanticVersion&&strategy==ReliefDesignStrategy;
        public static bool MatchesSourceConvert(string operation,string semanticVersion,string strategy) => operation=="reliefSourceConvert"&&semanticVersion==SourceConvertSemanticVersion&&strategy==SourceConvertStrategy;
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
            bool deformation=DeformEnabled&&MatchesDeformOperation((string)input["operation"],(string)input["semanticVersion"],(string)input["strategy"]);
            bool booleanCut=BooleanCutEnabled&&(string)input["operation"]=="cut"&&(string)input["semanticVersion"]==BooleanCutSemanticVersion&&(string)input["strategy"]=="multi-source-boolean";
            bool shoulder=ShoulderEnabled&&(string)input["operation"]=="reliefShoulder"&&(string)input["semanticVersion"]==ShoulderSemanticVersion&&(string)input["strategy"]=="source-boundary-replacement";
            bool roundBoundary=RoundBoundaryEnabled&&(string)input["operation"]=="round"&&(string)input["semanticVersion"]==RoundBoundarySemanticVersion&&(string)input["strategy"]=="planar-boundary-cutter";
            bool reliefDesign=ReliefDesignEnabled&&MatchesReliefDesign((string)input["operation"],(string)input["semanticVersion"],(string)input["strategy"]);
            bool sourceConvert=SourceConvertEnabled&&MatchesSourceConvert((string)input["operation"],(string)input["semanticVersion"],(string)input["strategy"]);
            bool relief=(ReliefEnabled&&(string)input["semanticVersion"]==ReliefSemanticVersion||ReliefPatchEnabled&&(string)input["semanticVersion"]==ReliefPatchSemanticVersion||ReliefStrokeEnabled&&(string)input["semanticVersion"]==ReliefStrokeSemanticVersion)&&(string)input["operation"]=="relief"&&new[]{"cutHoleSolids","faceWithHolesExtrude"}.Contains((string)input["strategy"]);
            if((!translation&&!deformation&&!relief&&!booleanCut&&!roundBoundary&&!shoulder&&!reliefDesign&&!sourceConvert)||(string)input["schemaVersion"]!="1.0"||(string)input["requiredResultFormat"]!=(sourceConvert?HeightGridFormat:"occt-text-brep-v1"))throw new ServiceError("OPERATION_VERSION_UNSUPPORTED","Native operation semantics/strategy/codec are not accepted",409);
            foreach(var field in new[]{"requestId","documentId","documentInstanceId","featureId","recipeFingerprint"})if(input[field]?.Type!=JTokenType.String||((string)input[field]).Length<1||((string)input[field]).Length>200)throw new ServiceError("PARAM_SCHEMA_INVALID","Missing identity/fingerprint");
            if(input["expectedRevision"]?.Type!=JTokenType.Integer||(long)input["expectedRevision"]<1)throw new ServiceError("PARAM_SCHEMA_INVALID","Expected positive document revision");
            if(input["placementSnapshot"]?.Type!=JTokenType.Null)throw new ServiceError("PARAM_SCHEMA_INVALID","Compiled world-coordinate snapshots do not accept a second placement transform");
            if(input["params"] is not JObject parameters)throw new ServiceError("PARAM_SCHEMA_INVALID","Typed operation parameters required");
            if(input["selectionIntent"] is not JObject selection)throw new ServiceError("PARAM_SCHEMA_INVALID","Selection intent required");
            if(translation){Protocol.Keys(parameters,"x","y","z");foreach(var axis in new[]{"x","y","z"})Number(parameters[axis],100000);Protocol.Keys(selection,"kind");if((string)selection["kind"]!="whole-source")throw new ServiceError("SELECTION_UNSUPPORTED","No cross-kernel numeric topology indices accepted");}
            else if(deformation){Protocol.Keys(selection,"kind");if((string)selection["kind"]!="whole-source")throw new ServiceError("SELECTION_UNSUPPORTED","Deformation binds the whole current source; topology indices are not accepted");ValidateDeformParameters(parameters);}
            else if(booleanCut){Protocol.Keys(parameters,"keepTools");if(parameters["keepTools"]!=null&&parameters["keepTools"].Type!=JTokenType.Boolean)throw new ServiceError("PARAM_SCHEMA_INVALID","keepTools must be a boolean client history option");Protocol.Keys(selection,"kind");if((string)selection["kind"]!="whole-sources")throw new ServiceError("SELECTION_UNSUPPORTED","Boolean inputs bind complete ordered solids, never topology indices");}
            else if(shoulder){Protocol.Keys(parameters,"widthMm","endProtectionMm","endPolicy");foreach(var key in new[]{"widthMm","endProtectionMm"}){Number(parameters[key],10000);if((double)parameters[key]<=0)throw new ServiceError("PARAM_SCHEMA_INVALID","Positive shoulder dimensions required");}if((string)parameters["endPolicy"]!="retained-step-with-planar-caps")throw new ServiceError("PARAM_SCHEMA_INVALID","Explicit planar end-cap policy required");Protocol.Keys(selection,"kind","point","normal");if((string)selection["kind"]!="planar-face-geometric-intent")throw new ServiceError("SELECTION_UNSUPPORTED","Select an interior lower-step point and outward normal");Point(selection["point"]);Point(selection["normal"],true);}
            else if(reliefDesign){ValidateReliefDesignParameters(parameters);Protocol.Keys(selection,"kind","point","normal");if((string)selection["kind"]!="planar-face-geometric-intent")throw new ServiceError("SELECTION_UNSUPPORTED","Select one planar support face (interior point + outward normal)");Point(selection["point"]);Point(selection["normal"],true);}
            else if(sourceConvert){ValidateSourceConvertParameters(parameters);Protocol.Keys(selection,"kind");if((string)selection["kind"]!="whole-source")throw new ServiceError("SELECTION_UNSUPPORTED","Source conversion binds the whole raster asset");}
            else if(roundBoundary){Protocol.Keys(parameters,"radius");Number(parameters["radius"],10000);if((double)parameters["radius"]<=0)throw new ServiceError("PARAM_SCHEMA_INVALID","Round boundary requires a positive radius");Protocol.Keys(selection,"kind","point","normal");if((string)selection["kind"]!="planar-face-geometric-intent")throw new ServiceError("SELECTION_UNSUPPORTED","A planar face interior point and outward normal are required");Point(selection["point"]);Point(selection["normal"],true);}
            else{Protocol.Keys(selection,"kind","radiusMm","point","axis","normal");Number(selection["radiusMm"],10000);if((string)selection["kind"]!="outer-cylinder"||(double)selection["radiusMm"]<1)throw new ServiceError("SELECTION_UNSUPPORTED","Explicit outer-cylinder geometric intent required");Point(selection["point"]);Point(selection["axis"],true);Point(selection["normal"],true);}
            if(input["inputs"] is not JArray sources||sources.Count<1||sources.Count>33||sources[0] is not JObject source||(translation||deformation)&&sources.Count!=1)throw new ServiceError("PARAM_SCHEMA_INVALID","Bounded source/tool BReps required");
            if((roundBoundary||shoulder||deformation||reliefDesign||sourceConvert)&&(sources.Count!=1||source["sourceFeatureId"]?.Type!=JTokenType.String||((string)source["sourceFeatureId"]).Length<1||((string)source["sourceFeatureId"]).Length>200))throw new ServiceError("PARAM_SCHEMA_INVALID","Operation requires exactly one bound source feature");
            if(booleanCut){if(sources.Count<2)throw new ServiceError("PARAM_SCHEMA_INVALID","Boolean Cut requires one source and 1 to 32 tools");for(int i=0;i<sources.Count;i++){if(sources[i] is not JObject part||(string)part["role"]!=(i==0?"source":"tool")||part["sourceFeatureId"]?.Type!=JTokenType.String||((string)part["sourceFeatureId"]).Length<1||((string)part["sourceFeatureId"]).Length>200)throw new ServiceError("PARAM_SCHEMA_INVALID","Boolean inputs must retain ordered source/tool roles and source feature bindings");}}
            var assets=new JObject();long totalBytes=0;foreach(var item in sources){if(item is not JObject part)throw new ServiceError("PARAM_SCHEMA_INVALID","Typed geometry asset required");Protocol.Keys(part,"assetId","sha256","role","sourceFeatureId");var accepted=store.Asset(owner,(string)part["assetId"]);if((string)accepted["kind"]!=(sourceConvert?"raster":"brep")||(string)accepted["sha"]!=(string)part["sha256"]||(long)accepted["bytes"]>Protocol.MaxUpload||!new[]{"source","tool"}.Contains((string)part["role"]))throw new ServiceError("SOURCE_HASH_MISMATCH","Geometry role/hash/budget differs from accepted asset");assets[(string)accepted["id"]]=new JObject{["sha256"]=accepted["sha"],["role"]=part["role"]};totalBytes+=(long)accepted["bytes"];}
            if(totalBytes>64L*1024*1024)throw new ServiceError("GEOMETRY_SOURCE_LIMIT","Aggregate exact input exceeds the native budget",413);
            var asset=store.Asset(owner,(string)source["assetId"]);if((string)asset["kind"]!=(sourceConvert?"raster":"brep")||(string)source["role"]!="source"||(string)asset["sha"]!=(string)source["sha256"])throw new ServiceError("SOURCE_HASH_MISMATCH","Source role/hash differs from accepted asset");
            if((long)asset["bytes"]>Protocol.MaxUpload)throw new ServiceError("GEOMETRY_SOURCE_LIMIT","Initial native bridge source exceeds its declared client-tested budget",413);
            if(relief)ValidateRelief(parameters,assets,(string)input["semanticVersion"]==ReliefStrokeSemanticVersion);
            if(sourceConvert&&(long)asset["bytes"]!=(long)parameters["width"]*(long)parameters["height"]*4)throw new ServiceError("PARAM_SCHEMA_INVALID","RGBA asset length must equal width*height*4");
            var semanticParams=(JObject)parameters.DeepClone();if(relief)foreach(JObject layer in (JArray)semanticParams["layers"]){string id=(string)layer["toolAssetId"];layer.Remove("toolAssetId");layer["toolSha256"]=assets[id]["sha256"];}
            // Every ordered source participates in the physical cache key.
            // keepTools belongs to document history, not native geometry.
            if(booleanCut)semanticParams=new JObject{["inputSha256"]=new JArray(sources.Select(part=>part["sha256"].DeepClone()))};
            return new JObject { ["operation"]=input["operation"],["engineBuildId"]=BuildId,["assetId"]=asset["id"],["sourceSha256"]=asset["sha"],["params"]=parameters,["semanticParams"]=semanticParams,["assets"]=assets,["publicRequest"]=input };
        }
        static void Number(JToken value,double bound){if(value==null||!new[]{JTokenType.Integer,JTokenType.Float}.Contains(value.Type)||double.IsNaN((double)value)||double.IsInfinity((double)value)||Math.Abs((double)value)>bound)throw new ServiceError("PARAM_SCHEMA_INVALID","Bounded finite number required");}
        static double DeformNumber(JToken value,double min,double max,string name){if(value==null||!new[]{JTokenType.Integer,JTokenType.Float}.Contains(value.Type)||double.IsNaN((double)value)||double.IsInfinity((double)value)||(double)value<min||(double)value>max)throw new ServiceError("PARAM_SCHEMA_INVALID",name+" is outside its accepted range");return (double)value;}
        static void DeformVector(JToken value,double limit,string name){if(value is not JArray a||a.Count!=3)throw new ServiceError("PARAM_SCHEMA_INVALID",name+" must contain three values");foreach(var x in a)DeformNumber(x,-limit,limit,name);}
        static int DeformAxis(JToken value){if(value?.Type!=JTokenType.String||!new[]{"x","y","z"}.Contains((string)value))throw new ServiceError("PARAM_SCHEMA_INVALID","axis must be x, y, or z");return new[]{"x","y","z"}.ToList().IndexOf((string)value);}
        static void DeformRange(JToken value){if(value is not JArray a||a.Count!=2)throw new ServiceError("PARAM_SCHEMA_INVALID","rangeMm must contain start and end");var lo=DeformNumber(a[0],-100000,100000,"rangeMm[0]");var hi=DeformNumber(a[1],-100000,100000,"rangeMm[1]");if(hi-lo<1e-6)throw new ServiceError("PARAM_SCHEMA_INVALID","rangeMm must have positive length");}
        public static void ValidateDeformParameters(JObject parameters){
            var kind=(string)parameters["kind"];
            if(kind=="scaleXYZ"){Protocol.Keys(parameters,"kind","scaleXYZ");DeformVector(parameters["scaleXYZ"],1000,"scaleXYZ");foreach(var x in (JArray)parameters["scaleXYZ"])if((double)x<=0)throw new ServiceError("PARAM_SCHEMA_INVALID","scaleXYZ factors must be positive");return;}
            if(kind=="ellipsoid"){Protocol.Keys(parameters,"kind","radiiMm");DeformVector(parameters["radiiMm"],100000,"radiiMm");foreach(var x in (JArray)parameters["radiiMm"])if((double)x<=0)throw new ServiceError("PARAM_SCHEMA_INVALID","ellipsoid radii must be positive");return;}
            if(kind=="bend"||kind=="twist"){
                Protocol.Keys(parameters,"kind","axis","angleDeg","rangeMm","center");DeformAxis(parameters["axis"]);DeformNumber(parameters["angleDeg"],-170,170,"angleDeg");DeformRange(parameters["rangeMm"]);if(parameters["center"]!=null)DeformVector(parameters["center"],100000,"center");return;
            }
            if(kind=="taper"){
                Protocol.Keys(parameters,"kind","axis","scaleStart","scaleEnd","rangeMm","center");DeformAxis(parameters["axis"]);DeformNumber(parameters["scaleStart"],.05,20,"scaleStart");DeformNumber(parameters["scaleEnd"],.05,20,"scaleEnd");if(parameters["rangeMm"]!=null)DeformRange(parameters["rangeMm"]);if(parameters["center"]!=null)DeformVector(parameters["center"],100000,"center");return;
            }
            if(kind=="ffd"){
                Protocol.Keys(parameters,"kind","lattice","displacements");if(parameters["lattice"] is not JObject lattice)throw new ServiceError("PARAM_SCHEMA_INVALID","FFD lattice is required");Protocol.Keys(lattice,"dims","boundsMm");
                if(lattice["dims"] is not JArray dims||dims.Count!=3)throw new ServiceError("PARAM_SCHEMA_INVALID","FFD dims must contain three integers");int nodes=1;foreach(var d in dims){if(d.Type!=JTokenType.Integer||(int)d<2||(int)d>8)throw new ServiceError("PARAM_SCHEMA_INVALID","FFD dimensions must be integers from 2 to 8");nodes*= (int)d;}if(nodes>512)throw new ServiceError("SIZE_LIMIT","FFD lattice exceeds 512 control points");
                if(lattice["boundsMm"] is not JArray bounds||bounds.Count!=2)throw new ServiceError("PARAM_SCHEMA_INVALID","boundsMm must be [[min],[max]]");DeformVector(bounds[0],100000,"boundsMm.min");DeformVector(bounds[1],100000,"boundsMm.max");for(int i=0;i<3;i++)if((double)bounds[1][i]-(double)bounds[0][i]<1e-6)throw new ServiceError("PARAM_SCHEMA_INVALID","FFD bounds must have positive extents");
                if(parameters["displacements"] is not JArray displacements||displacements.Count<1||displacements.Count>nodes)throw new ServiceError("PARAM_SCHEMA_INVALID","FFD displacements must fit the lattice");var seen=new System.Collections.Generic.HashSet<string>();foreach(var point in displacements){if(point is not JObject item)throw new ServiceError("PARAM_SCHEMA_INVALID","Typed FFD displacement required");Protocol.Keys(item,"i","j","k","dMm");int[] index=new int[3];string[] names={"i","j","k"};for(int i=0;i<3;i++){if(item[names[i]]?.Type!=JTokenType.Integer||(index[i]=(int)item[names[i]])<0||index[i]>=(int)dims[i])throw new ServiceError("PARAM_SCHEMA_INVALID","FFD displacement index is outside the lattice");}if(!seen.Add(string.Join(",",index)))throw new ServiceError("PARAM_SCHEMA_INVALID","FFD displacement indices must be unique");DeformVector(item["dMm"],100000,"dMm");}return;
            }
            throw new ServiceError("PARAM_SCHEMA_INVALID","kind must be scaleXYZ, ellipsoid, bend, twist, taper, or ffd");
        }
        static double Bounded(JToken value,double min,double max,string name){if(value==null||!new[]{JTokenType.Integer,JTokenType.Float}.Contains(value.Type)||double.IsNaN((double)value)||double.IsInfinity((double)value)||(double)value<min||(double)value>max)throw new ServiceError("PARAM_SCHEMA_INVALID",name+" is outside its accepted range");return (double)value;}
        static int BoundedInt(JToken value,int min,int max,string name){if(value?.Type!=JTokenType.Integer||(long)value<min||(long)value>max)throw new ServiceError("PARAM_SCHEMA_INVALID",name+" must be an integer "+min+"-"+max);return (int)value;}
        static void Region(JToken value,string name){if(value is not JObject s)throw new ServiceError("PARAM_SCHEMA_INVALID",name+" must be a circle/rect object");if((string)s["kind"]=="circle"){Protocol.Keys(s,"kind","centerMm","radiusMm");Bounded(s["radiusMm"],1e-6,1000,name+".radiusMm");}else if((string)s["kind"]=="rect"){Protocol.Keys(s,"kind","centerMm","widthMm","heightMm");Bounded(s["widthMm"],1e-6,1000,name+".widthMm");Bounded(s["heightMm"],1e-6,1000,name+".heightMm");}else throw new ServiceError("PARAM_SCHEMA_INVALID",name+" must be circle or rect");if(s["centerMm"] is not JArray c||c.Count!=2)throw new ServiceError("PARAM_SCHEMA_INVALID",name+".centerMm needs two values");foreach(var v in c)Bounded(v,-1000,1000,name+".centerMm");}
        // Optional quality mode (relief_quality.hxx): full-resolution u16le height source; the worker chooses the control net.
        static void ValidateReliefQuality(JToken value){
            if(value is not JObject q)throw new ServiceError("PARAM_SCHEMA_INVALID","quality must be an object");Protocol.Keys(q,"version","machiningPrecisionMm","maxControlSide","source","depthMm","edgeKeepoutMm","edgeFadeMm");
            if(BoundedInt(q["version"],1,1,"quality.version")!=1)throw new ServiceError("PARAM_SCHEMA_INVALID","quality.version must be 1");
            Bounded(q["machiningPrecisionMm"],.01,.5,"quality.machiningPrecisionMm");Bounded(q["depthMm"],1e-6,20,"quality.depthMm");if(q["maxControlSide"]!=null)BoundedInt(q["maxControlSide"],16,1025,"quality.maxControlSide");
            foreach(var key in new[]{"edgeKeepoutMm","edgeFadeMm"})if(q[key]!=null)Bounded(q[key],0,1000,"quality."+key);
            if(q["source"] is not JObject g)throw new ServiceError("PARAM_SCHEMA_INVALID","quality.source is required");Protocol.Keys(g,"columns","rows","encoding","data","sha256");
            int c=BoundedInt(g["columns"],2,4097,"quality.source.columns"),r=BoundedInt(g["rows"],2,4097,"quality.source.rows");
            if((string)g["encoding"]!="u16le"||g["data"]?.Type!=JTokenType.String||((string)g["data"]).Length!=((long)c*r*2+2)/3*4)throw new ServiceError("PARAM_SCHEMA_INVALID","quality.source must be base64 u16le columns*rows");
            if(g["sha256"]!=null&&(g["sha256"].Type!=JTokenType.String||!System.Text.RegularExpressions.Regex.IsMatch((string)g["sha256"],"^[a-f0-9]{64}$")))throw new ServiceError("PARAM_SCHEMA_INVALID","quality.source.sha256 must be hex");
        }
        // relief.design-fit-brep-1: solved authored field (row 0 = -Y) + analytic domain + fit options + placement.
        public static void ValidateReliefDesignParameters(JObject parameters){
            Protocol.Keys(parameters,"field","domain","baselineMm","fit","placement","quality");if(parameters["quality"]!=null)ValidateReliefQuality(parameters["quality"]);
            if(parameters["field"] is not JObject field)throw new ServiceError("PARAM_SCHEMA_INVALID","Solved field is required");Protocol.Keys(field,"columns","rows","widthMm","heightMm","heightsMm","active","fixedMask");
            int columns=BoundedInt(field["columns"],2,257,"field.columns"),rows=BoundedInt(field["rows"],2,257,"field.rows");Bounded(field["widthMm"],1e-3,1000,"field.widthMm");Bounded(field["heightMm"],1e-3,1000,"field.heightMm");
            foreach(var key in new[]{"heightsMm","active","fixedMask"}){if(field[key] is not JArray a||a.Count!=columns*rows)throw new ServiceError("PARAM_SCHEMA_INVALID","field."+key+" must contain columns*rows values");foreach(var v in a){if(key=="heightsMm")Bounded(v,-100,100,"field.heightsMm");else if(v.Type!=JTokenType.Integer||((int)v!=0&&(int)v!=1))throw new ServiceError("PARAM_SCHEMA_INVALID","field."+key+" must contain 0/1");}}
            if(parameters["domain"] is not JObject domain)throw new ServiceError("PARAM_SCHEMA_INVALID","Analytic domain is required");Protocol.Keys(domain,"support","throughHoles","protectedZones");Region(domain["support"],"domain.support");
            foreach(var key in new[]{"throughHoles","protectedZones"}){if(domain[key]==null)continue;if(domain[key] is not JArray list||list.Count>64)throw new ServiceError("PARAM_SCHEMA_INVALID","domain."+key+" must contain at most 64 regions");foreach(var r in list)Region(r,"domain."+key);}
            Bounded(parameters["baselineMm"],-100,100,"baselineMm");
            if(parameters["fit"] is not JObject fit)throw new ServiceError("PARAM_SCHEMA_INVALID","Fit options are required");Protocol.Keys(fit,"deviationPolicy","mode","controlColumns","controlRows","acceptanceToleranceMm","controlMaxMm","maxIterations","toleranceMm");
            if(!new[]{"emboss","engrave"}.Contains((string)fit["mode"]))throw new ServiceError("PARAM_SCHEMA_INVALID","fit.mode must be emboss or engrave");
            int nx=BoundedInt(fit["controlColumns"],4,129,"fit.controlColumns"),ny=BoundedInt(fit["controlRows"],4,129,"fit.controlRows");if(nx>columns||ny>rows)throw new ServiceError("PARAM_SCHEMA_INVALID","Control net must not exceed the authored field");
            if(fit["deviationPolicy"]!=null&&(string)fit["deviationPolicy"]!="strict"&&(string)fit["deviationPolicy"]!="candidate")throw new ServiceError("PARAM_SCHEMA_INVALID","deviationPolicy must be candidate or strict");
            Bounded(fit["acceptanceToleranceMm"],1e-6,20,"fit.acceptanceToleranceMm");if(fit["controlMaxMm"]!=null)Bounded(fit["controlMaxMm"],0,20,"fit.controlMaxMm");if(fit["maxIterations"]!=null)BoundedInt(fit["maxIterations"],1,200000,"fit.maxIterations");if(fit["toleranceMm"]!=null)Bounded(fit["toleranceMm"],1e-12,1,"fit.toleranceMm");
            if(parameters["placement"] is not JObject placement)throw new ServiceError("PARAM_SCHEMA_INVALID","Explicit placement is required");Protocol.Keys(placement,"originMm","xDirection");Point(placement["originMm"]);Point(placement["xDirection"],true);
        }
        // relief.source-convert-1: raw RGBA8 raster asset + normalized convert settings (+ optional mm precision smoothing).
        public static void ValidateSourceConvertParameters(JObject parameters){
            Protocol.Keys(parameters,"width","height","settings","depthMm","machiningPrecisionMm");
            int width=BoundedInt(parameters["width"],1,16384,"width"),height=BoundedInt(parameters["height"],1,16384,"height");if((long)width*height>16777216)throw new ServiceError("SIZE_LIMIT","Raster exceeds 16M pixels");
            if(parameters["settings"] is not JObject s)throw new ServiceError("PARAM_SCHEMA_INVALID","Normalized convert settings are required");Protocol.Keys(s,"version","columns","rows","crop","levels","gamma","blurPx","invert");
            if(s["version"]?.Type!=JTokenType.Integer||(int)s["version"]!=1)throw new ServiceError("PARAM_SCHEMA_INVALID","settings.version must be 1");
            int c=BoundedInt(s["columns"],2,2049,"settings.columns"),r=BoundedInt(s["rows"],2,2049,"settings.rows");/* over MaxGridNodes is downsampled in Execute (BudgetGrid), never rejected */
            if(s["crop"] is not JObject crop)throw new ServiceError("PARAM_SCHEMA_INVALID","settings.crop required");Protocol.Keys(crop,"x","y","width","height");double cx=Bounded(crop["x"],0,1,"crop.x"),cy=Bounded(crop["y"],0,1,"crop.y"),cw=Bounded(crop["width"],1e-6,1,"crop.width"),ch=Bounded(crop["height"],1e-6,1,"crop.height");if(cx+cw>1+1e-12||cy+ch>1+1e-12)throw new ServiceError("PARAM_SCHEMA_INVALID","Crop exceeds the image");
            if(s["levels"] is not JObject levels)throw new ServiceError("PARAM_SCHEMA_INVALID","settings.levels required");Protocol.Keys(levels,"black","white");if(Bounded(levels["white"],0,1,"levels.white")<=Bounded(levels["black"],0,1,"levels.black"))throw new ServiceError("PARAM_SCHEMA_INVALID","White level must exceed black level");
            Bounded(s["gamma"],.1,10,"settings.gamma");Bounded(s["blurPx"],0,32,"settings.blurPx");if(s["invert"]?.Type!=JTokenType.Boolean)throw new ServiceError("PARAM_SCHEMA_INVALID","settings.invert must be boolean");
            if(parameters["depthMm"]!=null)Bounded(parameters["depthMm"],1e-3,20,"depthMm");if(parameters["machiningPrecisionMm"]!=null){if(parameters["depthMm"]==null)throw new ServiceError("PARAM_SCHEMA_INVALID","machiningPrecisionMm requires depthMm");Bounded(parameters["machiningPrecisionMm"],.01,.5,"machiningPrecisionMm");}
        }
        // Height-grid result budget, aligned with the browser auto grid / draft grid / control caps (1025).
        public const long MaxGridNodes=1025L*1025;
        // Same rule as src/relief-source/convert.js budgetGridSize: keep aspect, floor-scale, then trim the longer side.
        public const int MaxGridSide=1025;
        public static (int columns,int rows) BudgetGrid(int c,int r,long max=MaxGridNodes,int maxSide=MaxGridSide){if((long)c*r<=max&&c<=maxSide&&r<=maxSide)return (c,r);double k=Math.Min(Math.Sqrt((double)max/((double)c*r)),(double)maxSide/Math.Max(c,r));int nc=Math.Min(maxSide,Math.Max(2,(int)Math.Floor(c*k))),nr=Math.Min(maxSide,Math.Max(2,(int)Math.Floor(r*k)));while((long)nc*nr>max){if(nc>=nr)nc--;else nr--;}return (nc,nr);}
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
            }else if((string)input["operation"]=="reliefSourceConvert"){
                privateParams["sourceSha256"]=payload["sourceSha256"];output=Path.Combine(dir,"grid.json");
                var ps=(JObject)privateParams["settings"];int pc=(int)ps["columns"],pr=(int)ps["rows"];var budget=BudgetGrid(pc,pr);if(budget.columns!=pc||budget.rows!=pr){ps["columns"]=budget.columns;ps["rows"]=budget.rows;privateParams["downsampledFrom"]=new JArray(pc,pr);}
            }else if(new[]{"round","reliefShoulder","reliefDesign"}.Contains((string)input["operation"])){
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
            if((string)input["operation"]=="reliefSourceConvert"){
                var grid=store.PublishArtifact(owner,File.ReadAllBytes(output),HeightGridFormat);
                return new JObject{["jobId"]=id,["inputFingerprint"]=row["fingerprint"],["recipeFingerprint"]=input["recipeFingerprint"],["documentId"]=input["documentId"],["documentInstanceId"]=input["documentInstanceId"],["expectedRevision"]=input["expectedRevision"],["featureId"]=input["featureId"],["operation"]=input["operation"],["semanticVersion"]=input["semanticVersion"],["strategy"]=input["strategy"],["kernelBuildId"]=BuildId,["gridArtifact"]=grid,["grid"]=result["grid"],["downsampledFrom"]=privateParams["downsampledFrom"]?.DeepClone(),["precision"]=result["precision"],["sourceSha256"]=payload["sourceSha256"],["timings"]=result["timings"],["commit"]="notCommitted"};
            }
            var artifact=store.PublishGeometry(owner,File.ReadAllBytes(output));
            var warnings=new JArray();
            try{for(int i=0;i<checkpointKeys.Count;i++)layerCache.Publish(checkpointKeys[i],Path.Combine(dir,"layer-"+i+".brep"));}
            catch(IOException){warnings.Add(new JObject{["code"]="LAYER_CACHE_NOT_PUBLISHED",["message"]="Precise result accepted; optional layer cache could not be published"});}
            catch(UnauthorizedAccessException){warnings.Add(new JObject{["code"]="LAYER_CACHE_NOT_PUBLISHED",["message"]="Precise result accepted; optional layer cache storage is unavailable"});}
            var manifest=new JObject { ["jobId"]=id,["inputFingerprint"]=row["fingerprint"],["recipeFingerprint"]=input["recipeFingerprint"],["documentId"]=input["documentId"],["documentInstanceId"]=input["documentInstanceId"],["expectedRevision"]=input["expectedRevision"],["featureId"]=input["featureId"],["operation"]=input["operation"],["semanticVersion"]=input["semanticVersion"],["strategy"]=input["strategy"],["stages"]=result["stages"],["kernelBuildId"]=BuildId,["codec"]="occt-text-brep-v1",["units"]="mm",["coordinateSystem"]="world-xyz-right-handed",["geometryArtifact"]=artifact,["sourceSha256"]=payload["sourceSha256"],["topologyBinding"]=result["topologyBinding"],["supportBinding"]=result["supportBinding"],["validation"]=result["validation"],["before"]=result["before"],["timings"]=result["timings"],["warnings"]=warnings,["commit"]="notCommitted" };
            if((string)input["operation"]=="cut")manifest["inputSha256"]=payload["semanticParams"]["inputSha256"].DeepClone();
            if((string)input["operation"]=="deform")manifest["deformation"]=result["deformation"]?.DeepClone();
            if((string)input["operation"]=="round")manifest["roundBoundary"]=result["roundBoundary"]?.DeepClone();if((string)input["operation"]=="reliefShoulder")manifest["shoulderReport"]=result["shoulderReport"]?.DeepClone();
            if((string)input["operation"]=="reliefDesign"){var design=(JObject)result["reliefDesign"].DeepClone();string step=output+".step";if(File.Exists(step)){manifest["stepArtifact"]=store.PublishArtifact(owner,File.ReadAllBytes(step),"step-ap214-mm");}design.Remove("step");manifest["reliefDesign"]=design;}
            return manifest;
        }
    }
}
