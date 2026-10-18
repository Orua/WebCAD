using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using WebCADServices.Runtime;

internal static class Program
{
    static void Expect(bool condition,string name){if(!condition)throw new Exception("FAIL "+name);Console.WriteLine("PASS "+name);}
    static bool Rejected(JObject value){try{NativeAdapter.ValidateDeformParameters(value);return false;}catch(Exception){return true;}}
    static int Main(){
        Expect(NativeAdapter.MatchesDeformOperation("deform",NativeAdapter.DeformSemanticVersion,NativeAdapter.DeformStrategy),"exact operation tuple accepted");
        Expect(!NativeAdapter.MatchesDeformOperation("deform","deform.future-1.0",NativeAdapter.DeformStrategy),"unknown semantic version rejected");
        Expect(!NativeAdapter.MatchesDeformOperation("transform",NativeAdapter.DeformSemanticVersion,NativeAdapter.DeformStrategy),"wrong operation rejected");
        Expect(!NativeAdapter.MatchesDeformOperation("deform",NativeAdapter.DeformSemanticVersion,"translation"),"wrong strategy rejected");
        var proof=NativeAdapter.Acceptance;var deformCapability=NativeAdapter.DeformCapability();
        Expect(NativeAdapter.DeformEnabled==(proof?["availableSemantics"] is JArray available&&available.Values<string>().Contains(NativeAdapter.DeformSemanticVersion)&&(string)proof["status"]=="passed"&&(string)proof["deformStatus"]=="passed"),"capability uses matching worker proof and deform acceptance gate");
        Expect(NativeAdapter.DeformEnabled?(deformCapability?["enabled"]?.Value<bool>()==true&&(string)deformCapability["semanticVersion"]==NativeAdapter.DeformSemanticVersion):deformCapability==null,"deform capability is absent until its acceptance proof passes");
        NativeAdapter.ValidateDeformParameters(JObject.Parse("{\"kind\":\"scaleXYZ\",\"scaleXYZ\":[1.25,0.8,1.1]}"));
        NativeAdapter.ValidateDeformParameters(JObject.Parse("{\"kind\":\"bend\",\"axis\":\"x\",\"angleDeg\":15,\"rangeMm\":[0,10]}"));
        NativeAdapter.ValidateDeformParameters(JObject.Parse("{\"kind\":\"ffd\",\"lattice\":{\"dims\":[3,3,3],\"boundsMm\":[[0,0,0],[10,10,10]]},\"displacements\":[{\"i\":1,\"j\":1,\"k\":1,\"dMm\":[0,0,0.5]}]}"));
        Expect(Rejected(JObject.Parse("{\"kind\":\"scaleXYZ\",\"scaleXYZ\":[1,1,1],\"extra\":true}")),"unknown parameter rejected");
        Expect(Rejected(JObject.Parse("{\"kind\":\"ffd\",\"lattice\":{\"dims\":[3,3,3],\"boundsMm\":[[0,0,0],[10,10,10]]},\"displacements\":[{\"i\":1,\"j\":1,\"k\":1,\"dMm\":[0,0,0]},{\"i\":1,\"j\":1,\"k\":1,\"dMm\":[0,0,1]}]}")),"duplicate FFD point rejected");
        Expect(Rejected(JObject.Parse("{\"kind\":\"bend\",\"axis\":\"x\",\"angleDeg\":180,\"rangeMm\":[0,10]}")),"out of range bend rejected");
        Expect(Rejected(JObject.Parse("{\"kind\":\"not-a-deform\"}")),"unknown deformation kind rejected");
        return 0;
    }
}
