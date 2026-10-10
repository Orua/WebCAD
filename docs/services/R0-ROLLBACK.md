# R0 scoped local IIS rollback

`scripts/rollback-all.ps1` defaults to a read-only dry-run. It selects only
`active-release.json.previousReleaseId`; explicit expected current/previous IDs
and trusted SHA-256 hashes of both package inventories must match. `-ApplyLocal`
and `-DevelopmentConsole` fail closed explicitly. This is source implementation,
not evidence of an actual IIS/service switch.

The supported scope is the verified local Default Web Site at
`F:/Project/Goldenluck/Web`, `http://localhost`, its existing `/cadservices`
application and dedicated `WebCADServices` pool/service, Origin
`http://127.0.0.1:17674`, and pipe `WebCADServices-local`. The existing site/pool
must be started, unshared, net48/x64/Integrated, and anonymous authentication must
already use the pool identity. The service must be running with automatic
own-process configuration as `NT SERVICE\WebCADServices`. R0 does not create,
reconfigure or restart a site/pool, change ERP root config, or provision an account.

Preflight validates absolute fixed paths, ancestor/descendant reparse points,
bounded complete package inventories, every file hash, selected release and joint
binary/frontend/kernel identities. Both existing private Host configs must refer
to their selected immutable releases, the same dedicated data root and final
service/pool SIDs. The existing external appSettings must contain only the seven
matching transport settings. The encrypted credential is checked for existence
and private ACL only, never opened, hashed, copied, printed or reprovisioned.

Existing package manifests lack a dataSchema declaration. R0 conservatively
requires identical Runtime binary hashes and document versions in both releases,
the `services-v1` pointer schema, and the exact Store column names/types/nullability/
primary keys. Python 3's existing standard-library SQLite reader uses `mode=ro`,
query_only, a write-denying authorizer, one snapshot, WAL awareness, 250 ms busy
timeout, three-second query progress budget and five-second child-process bound.
Active/queued jobs, unknown states/engines, triggers, incompatible schema, missing
database, read failure or timeout refuse rollback. No database copy, restore,
deletion, checkpoint or migration is performed. Python must be supplied explicitly;
no package installation or console Host launch occurs.

Apply is for an elevated native reviewer only. A scoped mutex prevents concurrent
R0 invocations. Before mutation it backs up the exact original gateway bytes,
pointer bytes, service command and owner/group/DACL/SACL descriptors under
`G:/CAD-Workspace/WebCAD/backups/<timestamp>-r0-rollback/{site/cadservices,runtime}`.
Backup contents are private to SYSTEM/admins/the executing identity, retain child
relative paths and are checked against the captured hashes. Neither private Host
config nor credentials nor operational data are copied into the backup.

Apply creates only the child app_offline gate, drains admitted requests for the
existing overall transport deadline plus one second, and checks idle jobs again.
It stops only the named service with a 20-second wait, verifies the exclusive Host
data lease is free, then rechecks idle jobs. Identical gateway layout is required:
bounded chunks overwrite only the existing gateway file contents, retaining the
original NTFS objects and exact ACLs. The target external appSettings path is
written only in the child web.config. Service command update uses structured
`Win32_Service.Change` with PathName alone, preserving account/start mode. The
target Host is started while the child admission gate is still closed.

Before pointer publication the gate is removed, the actual IIS URL is probed with
the deliberately invalid one-byte `Bearer !`, and an HTTP 401 with the selected
Gateway hash/transport marker and Host-stage `UNAUTHORIZED` response is required.
Together with selected running process/config checks this proves the IIS/pool/
pipe/Host route without reading a credential. It does **not** certify authenticated
health, capabilities or geometry. Jobs are rechecked before atomic pointer update;
the new pointer reverses current/previous IDs and preserves service/config metadata.
Pointer owner/group/DACL/SACL must read back exactly. A pointer with unstable ACL
control flags is rejected in preflight rather than normalized during publication.

Failure triggers a separately checked recovery deadline (default 90 seconds;
Apply default 120 seconds). After an opened admission gate it gates/drains again
and refuses active jobs before stopping the selected service. It restores original
gateway bytes/ACLs, service command/running identity and exact pointer bytes, then
checks the IIS negative-auth route. A changed external pointer is not overwritten.
Recovery timeout, service/ACL failure, or work admitted during the verification
window can make recovery incomplete; artifacts are retained and the script reports
native recovery required. Native verification must keep other clients quiescent
throughout switch/restore. There is no force kill, cancellation, whole-IIS restart,
or false runtime-success claim. Deadlines are checked around file operations and
during chunk copies; they are not a watchdog for a hung Windows filesystem/SCM API.

## Exact native verification plan (review first; not executed by source agent)

Use the reviewed canonical source, not the historical script inside either immutable
release. The following hashes were read from the installed inventories on this task.
Read-only preflight will reject drift; do not replace a rejected pin with an unchecked
new value. The final5/1150 commands below are an initial inspection snapshot;
after another reviewed release is installed, use the selected identities and
inventory pins from its actual delivery receipt. Do not apply stale example IDs.

```powershell
Set-Location F:/Project/WebCAD
$ErrorActionPreference = 'Stop'
$r0 = @{
 LocalRoot = 'F:/WebCADServices-local'
 VerifiedLocalInputs = $true
 SiteName = 'Default Web Site'
 GoldenluckWebRoot = 'F:/Project/Goldenluck/Web'
 SiteBaseUrl = 'http://localhost'
 AppPoolName = 'WebCADServices'
 ServiceName = 'WebCADServices'
 AllowedOrigin = 'http://127.0.0.1:17674'
 PipeName = 'WebCADServices-local'
 ExpectedCurrentReleaseId = 'r1-iis-20261010-final5'
 ExpectedPreviousReleaseId = 'r1-iis-20261010-1150'
 CurrentPackageInventorySha256 = 'd2a58bf50539595e498800d5cc38efb91d6419f72f84dd0b0539aa3fb867b1cc'
 PreviousPackageInventorySha256 = 'ba466a899ab1488e69e2ee8c2aa0713b5e55068ad90e8d5bca6e4d574f2a7b29'
 PythonExe = 'C:/Program Files/Python312/python.exe'
 ApplyTimeoutSeconds = 120
 RecoveryTimeoutSeconds = 90
}
# 1. Read-only native preflight. Review its result; no service/IIS switch occurs.
& ./scripts/rollback-all.ps1 @r0

# 2. ONLY the authorized native reviewer: quiesce clients, switch, inspect, and
#    restore final5 in finally even if a post-switch assertion fails.
$restore = $r0.Clone()
$restore.ExpectedCurrentReleaseId = $r0.ExpectedPreviousReleaseId
$restore.ExpectedPreviousReleaseId = $r0.ExpectedCurrentReleaseId
$restore.CurrentPackageInventorySha256 = $r0.PreviousPackageInventorySha256
$restore.PreviousPackageInventorySha256 = $r0.CurrentPackageInventorySha256
try {
 & ./scripts/rollback-all.ps1 @r0 -Apply
 $p = Get-Content F:/WebCADServices-local/active-release.json -Encoding UTF8 -Raw | ConvertFrom-Json
 if ($p.releaseId -cne $r0.ExpectedPreviousReleaseId) { throw 'Previous release pointer not installed' }
 $s = Get-CimInstance Win32_Service -Filter "Name='WebCADServices'" -OperationTimeoutSec 5
 if ($s.State -ne 'Running' -or $s.StartName -ine 'NT SERVICE\WebCADServices' -or
     !$s.PathName.Contains($r0.ExpectedPreviousReleaseId)) { throw 'Previous release service identity not installed' }
 # The script already checked the actual IIS Host-stage 401 marker/build route.
 # Check authenticated health/capabilities separately only through the existing
 # authorized native credential channel; never read/print tokens for this test.
 & ./scripts/rollback-all.ps1 @restore   # reciprocal read-only preflight
} finally {
 $p = Get-Content F:/WebCADServices-local/active-release.json -Encoding UTF8 -Raw | ConvertFrom-Json
 if ($p.releaseId -ceq $r0.ExpectedPreviousReleaseId) {
  & ./scripts/rollback-all.ps1 @restore -Apply
 } elseif ($p.releaseId -cne $r0.ExpectedCurrentReleaseId) {
  throw 'Unexpected active release; native recovery required'
 }
}
# 3. Recheck preserved final5 and its ACL/package/config/idle-store contracts.
& ./scripts/rollback-all.ps1 @r0
$p = Get-Content F:/WebCADServices-local/active-release.json -Encoding UTF8 -Raw | ConvertFrom-Json
if ($p.releaseId -cne 'r1-iis-20261010-final5' -or
    $p.previousReleaseId -cne 'r1-iis-20261010-1150') { throw 'Final5 restore incomplete' }
```

Capture native command receipts only under `G:/CAD-Workspace/WebCAD/reports/r0-rollback`.
Real native switching, service-context DPAPI across restart, authenticated health/
capabilities, and failure recovery remain unexecuted by the source agent. Because
both current packages have identical binaries, path/config/pointer identity checks
are essential; a binary hash alone cannot distinguish these releases.

## Targeted source verification

```powershell
powershell.exe -NoProfile -NonInteractive -File F:/Project/WebCAD/tests/rollback-all.test.ps1
```

The isolated G: TEST fixtures load parsed functions without executing the entry
point. Native read adapters are explicitly simulated; mutation/probe adapters throw.
Checks cover full dry-run refusal/immutability, path/reparse/pin/identity/transport
guards, real SQLite terminal/active/queued/WAL state checks, actual bounded gateway
file copying and exact ACL restoration, atomic pointer restoration, and deadline
refusal. No fixture proves a real service/IIS switch or geometry success.

Impacts: localImpact = scoped default dry-run and explicit legacy refusal;
servicesImpact = reversible existing local child/service/config/pointer switching;
logoImpact = none (no worker/geometry changes); contractImpact = R0 CLI inputs and
fail-closed state/schema/identity gates, no API semantics; documentImpact = this
guide and README; cacheImpact = none (credential/owner/data unchanged);
requiredTests = parser and targeted isolated dry-run/file/SQLite contract fixtures,
then the separate native bounded switch/restore above. No build/install is required
for this PowerShell-only change.
