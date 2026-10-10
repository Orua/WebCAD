using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using WebCADServices.Contracts;
using WebCADServices.Transport;

namespace WebCADServices.Host
{
    // The final service identity protects the credential itself. No machine-wide DPAPI scope.
    public static class ProtectedCredential
    {
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetNamedPipeServerProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle pipe, out uint processId);
        [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
        public static void SaveInFinalContext(HostConfiguration config, string credential)
        {
            if (WindowsIdentity.GetCurrent().User.Value != config.HostSid || config.CredentialFormat != "service-current-user-dpapi") throw new InvalidOperationException("Credential initialization requires the final configured Host identity");
            if (credential == null || credential.Length < 32 || credential.Length > 4096) throw new InvalidOperationException("Credential must contain 32..4096 characters");
            if (File.Exists(config.CredentialFile)) throw new InvalidOperationException("Credential already exists; rotation requires a separate migration plan");
            byte[] plain = Encoding.UTF8.GetBytes(credential);
            try
            {
                byte[] encrypted = ProtectedData.Protect(plain, null, DataProtectionScope.CurrentUser);
                using (var file = new FileStream(config.CredentialFile, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { file.Write(encrypted, 0, encrypted.Length); file.Flush(true); }
                var acl = File.GetAccessControl(config.CredentialFile); acl.SetAccessRuleProtection(true, true); File.SetAccessControl(config.CredentialFile, acl);
                if (Read(config) != credential) throw new CryptographicException("Final identity credential readback failed");
            }
            finally { Array.Clear(plain, 0, plain.Length); }
        }
        public static void EnsureInService(HostConfiguration config)
        {
            if (File.Exists(config.CredentialFile)) return;
            if (WindowsIdentity.GetCurrent().User.Value != config.HostSid) throw new InvalidOperationException("Credential bootstrap requires the final service identity");
            var acl = new PipeSecurity(); acl.SetAccessRuleProtection(true, false);
            acl.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(config.HostSid), PipeAccessRights.FullControl, AccessControlType.Allow));
            acl.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(config.ProvisionerSid), PipeAccessRights.ReadWrite | PipeAccessRights.Synchronize, AccessControlType.Allow));
            using (var pipe = new NamedPipeServerStream(config.ProvisioningPipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 4096, 4096, acl))
            {
                var deadline = new Deadline(15000);
                PipeFrames.Bounded(pipe.WaitForConnectionAsync(), pipe, deadline, 15000, "credential-connect", CancellationToken.None).GetAwaiter().GetResult();
                string caller = null;
                pipe.RunAsClient(() => { using (var identity = WindowsIdentity.GetCurrent(true)) { caller = identity.User.Value; } });
                if (caller != config.ProvisionerSid) throw new InvalidOperationException("Credential bootstrap caller identity rejected");
                var request = PipeFrames.Read<WireRequest>(pipe, 8192, deadline, 5000, CancellationToken.None).GetAwaiter().GetResult();
                if (request.Route != "credential.initialize" || request.Body != null) throw new FrameException();
                SaveInFinalContext(config, request.Credential);
                PipeFrames.Write(pipe, WireResponse.Json(new { protectedInFinalContext = true }), 4096, deadline, 5000, CancellationToken.None).GetAwaiter().GetResult();
            }
        }
        public static void Provision(HostConfiguration config, string credential)
        {
            if (WindowsIdentity.GetCurrent().User.Value != config.ProvisionerSid) throw new InvalidOperationException("Provisioning requires the explicitly configured provisioner identity");
            if (credential == null || credential.Length < 32 || credential.Length > 4096 || File.Exists(config.CredentialFile)) throw new InvalidOperationException("Invalid credential or already initialized configuration");
            using (var pipe = new NamedPipeClientStream(".", config.ProvisioningPipeName, PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Impersonation))
            {
                var deadline = new Deadline(15000);
                PipeFrames.Bounded(pipe.ConnectAsync(10000), pipe, deadline, 10000, "credential-connect", CancellationToken.None).GetAwaiter().GetResult();
                uint pid; IntPtr token = IntPtr.Zero;
                if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle, out pid)) throw new InvalidOperationException("Unable to identify credential bootstrap server");
                using (var process = Process.GetProcessById((int)pid))
                {
                    if (!string.Equals(process.MainModule.FileName, typeof(ProtectedCredential).Assembly.Location, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Credential bootstrap server executable rejected");
                    if (!OpenProcessToken(process.Handle, 8, out token)) throw new InvalidOperationException("Unable to verify credential bootstrap server identity");
                    try { using (var identity = new WindowsIdentity(token)) { if (identity.User.Value != config.HostSid) throw new InvalidOperationException("Credential bootstrap server is not the final Host identity"); } }
                    finally { CloseHandle(token); }
                }
                PipeFrames.Write(pipe, new WireRequest { Route = "credential.initialize", Credential = credential }, 8192, deadline, 5000, CancellationToken.None).GetAwaiter().GetResult();
                var response = PipeFrames.Read<WireResponse>(pipe, 4096, deadline, 5000, CancellationToken.None).GetAwaiter().GetResult();
                if (response.Status != 200) throw new CryptographicException("Final identity credential initialization failed");
            }
        }
        public static string Read(HostConfiguration config)
        {
            var info = new FileInfo(config.CredentialFile);
            if (info.Length < 1 || info.Length > 16384) throw new CryptographicException("Protected credential file size is invalid");
            byte[] plain = null;
            try
            {
                plain = ProtectedData.Unprotect(File.ReadAllBytes(config.CredentialFile), null, DataProtectionScope.CurrentUser);
                string credential = new UTF8Encoding(false, true).GetString(plain);
                if (credential.Length < 32 || credential.Length > 4096) throw new CryptographicException("Protected credential size is invalid"); return credential;
            }
            finally { if (plain != null) Array.Clear(plain, 0, plain.Length); }
        }
    }
}
