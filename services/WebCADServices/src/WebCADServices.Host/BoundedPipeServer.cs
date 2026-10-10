using System;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using WebCADServices.Contracts;
using WebCADServices.Transport;

namespace WebCADServices.Host
{
    public sealed class BoundedPipeServer : IDisposable
    {
        readonly TransportSettings settings; readonly Func<WireRequest, WireResponse> handle;
        readonly CancellationTokenSource stopping = new CancellationTokenSource();
        readonly Task[] slots = new Task[4]; readonly PipeSecurity acl;
        public static PipeSecurity CreateAcl(SecurityIdentifier host, string gatewaySid)
        {
            var security = new PipeSecurity(); security.SetAccessRuleProtection(true, false);
            security.AddAccessRule(new PipeAccessRule(host, PipeAccessRights.FullControl, AccessControlType.Allow));
            if (gatewaySid != null)
            {
                if (!gatewaySid.StartsWith("S-1-5-82-", StringComparison.Ordinal)) throw new InvalidOperationException("Exact application pool SID required");
                // ReadWrite includes Synchronize. Never grant CreateNewInstance to the pool.
                security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(gatewaySid), PipeAccessRights.ReadWrite | PipeAccessRights.Synchronize, AccessControlType.Allow));
            }
            return security;
        }
        public BoundedPipeServer(TransportSettings settings, string gatewaySid, Func<WireRequest, WireResponse> handler)
        {
            settings.Validate(); this.settings = settings; handle = handler;
            acl = CreateAcl(WindowsIdentity.GetCurrent().User, gatewaySid);
            try { for (int i = 0; i < slots.Length; i++) slots[i] = Slot(NewPipe()); }
            catch { Dispose(); throw; }
        }
        NamedPipeServerStream NewPipe() => new NamedPipeServerStream(settings.PipeName, PipeDirection.InOut, slots.Length, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 4096, 4096, acl);
        async Task Slot(NamedPipeServerStream initial)
        {
            var pipe = initial;
            while (!stopping.IsCancellationRequested)
            {
                using (pipe)
                {
                    try
                    {
                        await pipe.WaitForConnectionAsync(stopping.Token).ConfigureAwait(false);
                        var deadline = new Deadline(settings.OverallTimeoutMs);
                        var request = await PipeFrames.Read<WireRequest>(pipe, TransportSettings.MaxRequestFrame, deadline, settings.ReadTimeoutMs, stopping.Token).ConfigureAwait(false);
                        if (request == null || request.Credential?.Length > 4096 || request.Route?.Length > 1024 || request.FileName?.Length > 1024 || request.IdempotencyKey?.Length > 160) throw new FrameException();
                        deadline.Remaining(settings.OverallTimeoutMs, "dispatch");
                        var response = request.Body?.Length > TransportSettings.MaxResourceBytes ? WireResponse.Json(new ServiceError("SIZE_LIMIT", "Resource limit is 20 MiB", 413).Body(), 413) : handle(request);
                        await PipeFrames.Write(pipe, response, TransportSettings.MaxResponseFrame, deadline, settings.WriteTimeoutMs, stopping.Token).ConfigureAwait(false);
                    }
                    catch (Exception) { /* Malformed JSON, short frame, deadline, or runtime fault affects this connection only. */ }
                }
                if (stopping.IsCancellationRequested) break;
                try { pipe = NewPipe(); }
                catch (Exception) { await Task.Delay(100).ConfigureAwait(false); if (!stopping.IsCancellationRequested) { try { pipe = NewPipe(); } catch { break; } } }
            }
        }
        public void Dispose()
        {
            stopping.Cancel();
            var active = Array.FindAll(slots, task => task != null);
            try { Task.WaitAll(active, settings.OverallTimeoutMs + 1000); } catch (AggregateException) { }
            // CTS is retained until all pending overlapped I/O has observed cancellation.
            if (Array.TrueForAll(active, task => task.IsCompleted)) stopping.Dispose();
        }
    }
}
