// TEST DOUBLES ONLY (Linux check build). Not compiled into any production assembly.
using System;
using System.Diagnostics;
using System.IO;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;
namespace WebCADServices.Runtime
{
    // Same contract as the Windows supervisor: run worker with one request path, report pid, honour cancellation.
    public sealed class WorkerSupervisor
    {
        public int Run(string executable,string requestPath,Func<bool> cancelled,Action<int> started,out string diagnostic)
        {
            if(!File.Exists(executable))throw new ServiceError("WORKER_UNAVAILABLE","Configured worker binary is missing",503);
            var info=new ProcessStartInfo(executable){UseShellExecute=false,RedirectStandardOutput=true,RedirectStandardError=true,WorkingDirectory=Path.GetDirectoryName(requestPath)};info.ArgumentList.Add(requestPath);
            using var process=Process.Start(info);started(process.Id);var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
            var timer=Stopwatch.StartNew();while(!process.WaitForExit(100)){if(cancelled()||timer.Elapsed.TotalSeconds>900){process.Kill(true);process.WaitForExit();throw new ServiceError("WORKER_TERMINATED","Native process terminated");}}
            diagnostic=(output.Result+error.Result);if(diagnostic.Length>4096)diagnostic=diagnostic.Substring(0,4096);return process.ExitCode;
        }
    }
}
namespace WebCADServices.Logo
{
    public static class LogoAdapter
    {
        public static JObject ValidateOptions(JObject options,bool inspect)=>throw new ServiceError("WORKER_UNAVAILABLE","Logo is not part of the relief check build",503);
        public static JObject Normalize(JObject value,bool inspect,JObject options)=>throw new ServiceError("WORKER_UNAVAILABLE","Logo is not part of the relief check build",503);
    }
}
