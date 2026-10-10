using System;
using System.IO;
using System.Linq;
using System.Security.AccessControl;
using System.Security.Principal;
using Newtonsoft.Json;
using WebCADServices.Contracts;
using WebCADServices.Runtime;
using WebCADServices.Transport;

namespace WebCADServices.Host
{
    public sealed class HostConfiguration
    {
        public TransportSettings Transport { get; set; }
        public string ServiceName { get; set; }
        public string HostSid { get; set; }
        public string GatewaySid { get; set; }
        public string ProvisionerSid { get; set; }
        public string DataRoot { get; set; }
        public string LogoWorker { get; set; }
        public string NativeWorker { get; set; }
        public string NativeAcceptance { get; set; }
        public string CredentialFile { get; set; }
        public string CredentialFormat { get; set; }
        public string ProvisioningPipeName { get; set; }
        public static HostConfiguration Load(string path)
        {
            if (!Path.IsPathRooted(path) || new FileInfo(path).Length > 16384) throw new InvalidOperationException("Host config must be an absolute bounded file");
            var config = JsonConvert.DeserializeObject<HostConfiguration>(File.ReadAllText(path), new JsonSerializerSettings { TypeNameHandling = TypeNameHandling.None, MaxDepth = 8, MissingMemberHandling = MissingMemberHandling.Error });
            if (config == null) throw new InvalidOperationException("Host config is empty");
            config.Validate(); return config;
        }
        public void Validate()
        {
            if (Transport == null) throw new InvalidOperationException("Missing transport configuration"); Transport.Validate();
            foreach (var path in new[] { DataRoot, LogoWorker, CredentialFile }) if (string.IsNullOrEmpty(path) || !Path.IsPathRooted(path)) throw new InvalidOperationException("Host paths must be absolute");
            if (CredentialFormat != "service-current-user-dpapi" && CredentialFormat != "current-user-dpapi") throw new InvalidOperationException("Unsupported protected credential format");
            if (GatewaySid != null && !GatewaySid.StartsWith("S-1-5-82-", StringComparison.Ordinal)) throw new InvalidOperationException("Gateway requires an exact application pool SID");
            if (GatewaySid != null) new SecurityIdentifier(GatewaySid);
        }
        public void ValidateService(string configPath, bool requireIdentity)
        {
            if (string.IsNullOrEmpty(ServiceName) || !System.Text.RegularExpressions.Regex.IsMatch(ServiceName, "^[A-Za-z0-9_-]{1,80}$")) throw new InvalidOperationException("Invalid serviceName");
            string expected;
            using (var sha = System.Security.Cryptography.SHA1.Create())
            {
                var hash = sha.ComputeHash(System.Text.Encoding.Unicode.GetBytes(ServiceName.ToUpperInvariant()));
                expected = "S-1-5-80-" + string.Join("-", Enumerable.Range(0, 5).Select(i => BitConverter.ToUInt32(hash, i * 4).ToString(System.Globalization.CultureInfo.InvariantCulture)));
            }
            if (HostSid != expected || GatewaySid == null || CredentialFormat != "service-current-user-dpapi") throw new InvalidOperationException("Service requires its virtual account SID, exact pool SID and final-context protected credential");
            if (string.IsNullOrEmpty(ProvisioningPipeName) || !System.Text.RegularExpressions.Regex.IsMatch(ProvisioningPipeName, "^WebCADServices-provision-[A-Fa-f0-9]{32}$")) throw new InvalidOperationException("Explicit bounded provisioning pipe required");
            if (string.IsNullOrEmpty(ProvisionerSid) || ProvisionerSid == "S-1-1-0") throw new InvalidOperationException("Explicit provisioner SID required");
            new SecurityIdentifier(ProvisionerSid);
            foreach (string path in new[] { configPath, CredentialFile, DataRoot, LogoWorker, NativeWorker, NativeAcceptance })
            {
                if (string.IsNullOrEmpty(path) || !Path.IsPathRooted(path) || !string.Equals(Path.GetPathRoot(path), "F:\\", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Service configuration, credentials, programs and data require fixed F storage");
                for (string cursor = Path.GetFullPath(path); cursor != null; cursor = Path.GetDirectoryName(cursor)) if ((File.Exists(cursor) || Directory.Exists(cursor)) && (File.GetAttributes(cursor) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("Service paths cannot depend on reparse points");
            }
            if (!string.Equals(Path.GetDirectoryName(Path.GetFullPath(CredentialFile)), Path.GetDirectoryName(Path.GetFullPath(configPath)), StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Credential must remain in the private Host configuration directory");
            if (requireIdentity && WindowsIdentity.GetCurrent().User.Value != HostSid) throw new InvalidOperationException("Host is not running as the configured virtual service account");
            foreach (string path in new[] { configPath, Path.GetDirectoryName(configPath), Path.GetDirectoryName(CredentialFile) }) CheckPrivateAcl(path);
            if (File.Exists(CredentialFile)) CheckPrivateAcl(CredentialFile);
            if (Path.GetPathRoot(DataRoot).ToUpperInvariant() != "F:\\") throw new InvalidOperationException("Service data must be on fixed F storage");
            if (string.IsNullOrEmpty(NativeWorker) || string.IsNullOrEmpty(NativeAcceptance) || !Path.IsPathRooted(NativeWorker) || !Path.IsPathRooted(NativeAcceptance)) throw new InvalidOperationException("Service requires explicit native worker and acceptance paths");
        }
        void CheckPrivateAcl(string path)
        {
            if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("Private configuration cannot be a reparse point");
            FileSystemSecurity acl = Directory.Exists(path) ? (FileSystemSecurity)Directory.GetAccessControl(path) : File.GetAccessControl(path);
            if (!acl.AreAccessRulesProtected) throw new InvalidOperationException("Private configuration must have protected ACLs");
            var allowed = new[] { HostSid, ProvisionerSid, "S-1-5-18", "S-1-5-32-544" };
            foreach (FileSystemAccessRule rule in acl.GetAccessRules(true, true, typeof(SecurityIdentifier)))
                if (rule.AccessControlType == AccessControlType.Allow && !allowed.Contains(rule.IdentityReference.Value)) throw new InvalidOperationException("Private configuration grants an unrelated identity access");
        }
        public void ConfigureWorkers(bool service)
        {
            if (!File.Exists(LogoWorker)) throw new InvalidOperationException("LOGO_WORKER_MISSING");
            foreach (var dll in new[] { "LogoVector.Contracts.dll", "LogoVector.Geometry.dll" }) if (!File.Exists(Path.Combine(Path.GetDirectoryName(LogoWorker), dll))) throw new InvalidOperationException("LOGO_DEPENDENCY_MISSING: " + dll);
            Environment.SetEnvironmentVariable("WEBCAD_SERVICES_OCCT_WORKER", NativeWorker);
            Environment.SetEnvironmentVariable("WEBCAD_SERVICES_NATIVE_ACCEPTANCE", NativeAcceptance);
            if (service)
            {
                if (!File.Exists(NativeWorker)) throw new InvalidOperationException("NATIVE_WORKER_MISSING");
                StartupDependencies.Verify(NativeWorker);
                var proof = NativeAdapter.Acceptance;
                if (proof == null || ((string)proof["status"] != "passed" && (string)proof["geometryBridgeStatus"] != "passed") || (string)proof["consumerKernelBuildId"] == null) throw new InvalidOperationException("NATIVE_ACCEPTANCE_INVALID");
            }
            Directory.CreateDirectory(DataRoot);
            // Store subsequently takes its exclusive .host.lock before SQLite recovery.
            string probe = Path.Combine(DataRoot, ".startup-" + Guid.NewGuid().ToString("N"));
            using (var file = new FileStream(probe, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None, 1, FileOptions.DeleteOnClose)) { file.WriteByte(1); file.Flush(true); }
        }
    }
}
