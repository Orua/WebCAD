# R1 infrastructure source / native installation boundary

This source implements R0.2–R0.4. SCM/IIS installation, the final virtual-account DPAPI profile, site inheritance and the real page/geometry acceptance remain native-agent work. No actual site or production acceptance is implied by compilation or the infrastructure fixtures.

## Shared configuration and transport

One installer transport object generates `configuration/<releaseId>/host.json` and `gateway-configuration/<releaseId>/appSettings.config` under the fixed F: runtime. The latter contains only pipeName, exact HTTP(S) Origin and deadline values. The cadservices web.config uses the .NET appSettings `file` attribute with an absolute private path; `configSource` cannot reference a file outside the web directory. Missing settings fail closed. No environment-based Gateway defaults or credential copies are present in IIS.

Default deadlines: connect 2000 ms; read 5000 ms per complete frame; write 5000 ms per complete frame; authentication 3000 ms; overall request 30000 ms. Allowed range is 100–60000 ms, with phase budgets no greater than overall. Gateway performs a bounded, body-free existing Host health/authentication handshake before obtaining its bufferless upload stream. Upload buffering remains bounded at 20 MiB; binary streaming is a later change. Each logo/BRep resource is limited to 20 MiB at IIS, Gateway, Host and Store. Native aggregate input/plan limits retain their existing meaning.

Frames are little-endian int32 lengths plus strict UTF-8 JSON (bounded depth, no duplicate/trailing JSON). Request frame maximum 30 MiB accommodates the base64 envelope for a 20 MiB resource; response frame maximum 48 MiB accommodates current bounded results. Short, invalid or oversized frames terminate only the connection. Four independent Host slots bound concurrent pipe connections. All CAD work still goes through existing persisted jobs and worker supervision.

Gateway returns JSON/status codes with Forms redirect suppression and IIS response preservation. Markers are `X-WebCAD-Transport: iis-ashx-pipe-v1` and the actual Gateway assembly SHA-256. Connection denial, unavailable Host, I/O timeout and invalid response frames have distinct errors. Absent Host connection deadlines map to 503. Read/write deadlines map to 504; malformed Host responses map to 502. IIS request-filter rejections and assembly/configuration load failures occur before Handler and require native HTTP substatus diagnostics.

## Final identity and credential initialization

The service account is `NT SERVICE/<ServiceName>`, never the desktop user or LocalSystem. Its deterministic service SID is checked again after registration. The pipe DACL contains the actual Host user SID and the registered application's exact `IIS APPPOOL/<AppPoolName>` SID. The pool receives ReadWrite/Synchronize, never CreateNewInstance or Everyone. It receives no private Host credential/config access.

The installer reads the existing desktop CurrentUser DPAPI credential in the authorized initializer's context (or accepts SecurePrompt), retaining the same authorization and owner fingerprint. Plaintext exists only in process memory and an anonymous stdin/local protected pipe. It never appears in argv, environment, webroot, manifest or a plaintext file.

The final service itself initializes `credential.dpapi` using **CurrentUser DPAPI in its final service identity**. Bootstrap is explicit through a random protected provisioning pipe: Host + exact recorded provisioner SID only, 15-second overall deadline. The service verifies the client SID by impersonation. The provisioner verifies the server process executable and token user SID before sending authorization. A desktop-produced DPAPI blob is never copied directly to the service. Existing service credentials are read in their original final context; overwrite/rotation is refused. The original console CurrentUser path remains compatible.

A virtual-account profile/DPAPI failure fails startup and installation. The native agent must prove protected readback in that actual account and across a service/cold restart; current-user fixtures do not prove this gate. The abandoned DPAPI-NG SID approach failed encryption on this local environment (0x80090034); it is not used by the delivered source. There is no LocalMachine DPAPI fallback.

Private Host files have protected ACLs for service/provisioner/SYSTEM/administrators, with credential access denied to the pool. The token-free Gateway settings have separate pool-readable ACLs. Service paths require fixed F: storage and reject reparse points; credentials share the private Host configuration directory. Startup checks real x64 PE imports/native DLL loading, logo dependencies, native binary/kernel proof binding, authorization and data write access before pipe readiness. Health reports degraded when required worker/proof readiness disappears. The existing exclusive `.host.lock` remains authoritative before SQLite recovery.

## Installer workflow (native agent only)

Read `scripts/install-services.ps1` before invocation. Required inputs are actual `PackageRoot`, `SiteName`, `GoldenluckWebRoot`, root `SiteBaseUrl`, exact `AllowedOrigin` and `-VerifiedSiteInputs`. Confirm their values from local IIS; no guessed ERP directory or binding is permitted.

- Default / `-Mode Preflight`: read-only package/.NET/x64/ASP.NET handler/site/binding/pool/service/data-owner checks and a token-free plan. A new pool's SID is intentionally unresolved until actual registration.
- `-Mode LocalIntegration`: verified loopback binding. Without `-Apply`, remains dry-run.
- `-Mode Production`: HTTPS; `-Apply` additionally requires explicit `-ProductionAuthorized` from native site authorization.

Apply creates an immutable release, persistent configs and exact ACLs, registers/updates the independent virtual-account service and cadservices child application with a dedicated v4.0 Integrated x64 pool. ERP root web.config is never edited. A currently running service or live data lease causes refusal; the script does not stop an existing Host to authorize its own update. Existing SQLite requires a previously verified consistent backup and explicit `-VerifiedDataBackup`. Do not copy a live jobs.db or start parallel Hosts.

The Apply path bootstraps the credential in the final context, then checks the actual `api.ashx?route=/v1/health` URL and capabilities against the candidate Gateway/Host hashes. It never uses DEV_HTTP as acceptance. The active pointer is written atomically after those checks. Rollback is limited to the named product service, cadservices application/pool, original child/data ACLs and pointer; old/candidate releases and database files remain retained. Stop waits are bounded; incomplete rollback stops and reports the named failure rather than force-killing unrelated processes. Existing stopped services remain stopped on rollback.

`start-package.ps1` defaults to reporting the installed service and recorded actual URL. It does not start a second Host. `-DevelopmentConsole` explicitly opts into the legacy console/17781 debugging path. `initialize-services-local.ps1` retains desktop CurrentUser compatibility; service provisioning is performed by the installer/Host bootstrap, not that desktop blob.

Joint packaging uses `package-all.ps1 -BuildRoot <managed build> -FrontendRoot <actual frontend> -NativeWorker <accepted exe> -NativeAcceptance <matching proof> -OutputRoot <G: directory>`. Native inputs are mandatory; no frozen native-a06 directory is selected implicitly. The manifest records the selected binary and proof hashes and distinguishes the joint source hash from a Native rebuild claim. Package verification checks Gateway/Runtime hashes as well as Host/Logo/Native.

## Focused verification and remaining acceptance

```powershell
./scripts/build-services.ps1 -BuildRoot F:/WebCADServices-local/build-r1
./scripts/test-services.ps1 -BuildRoot F:/WebCADServices-local/build-r1 -DataRoot G:/CAD-Workspace/WebCAD/temp/r1-infrastructure/test-data -InfrastructureOnly
```

The existing Services runner explicitly includes `tests/services-infrastructure.test.mjs`. It compiles/runs actual net48 fixture executables under build-r1. Tests cover shared external appSettings and Host JSON, exact Origin, strict frames, cumulative frame/read/write/connect deadlines, authentication before upload reads, JSON/401/marker and Forms suppression, Host slow/bad connections and handler faults, four clients, exact pipe DACL, SQLite ownership, resource limits/degraded health, native PE metadata, CurrentUser credential round-trip/final-context identity guard, web.config section loading and PowerShell parsing. It submits no geometry and touches no existing processes/services/IIS.

IIS-specific TrySkipIisCustomErrors behavior cannot be read back from a plain fixture HttpWorkerRequest. Native acceptance must check unauthorized/forbidden JSON without login 302, actual markers/substatus/assembly loading, exact pool access, final account credential bootstrap/restart, DEV_HTTP absent, pool recycle/task persistence, rollback, and the separately authorized page/Logo/native/save/reopen gates. GC15432 and all geometry are outside this work.

Impacts: localImpact = development console explicit opt-in; servicesImpact = persistent config, bounded authenticated transport, independent service installer; logoImpact = unchanged geometry/worker, common resource limit; contractImpact = existing v1 routes and capability byte budgets retained, additive health readiness/mode; documentImpact = this guide and README; cacheImpact = none (credential preservation retains owner keys); requiredTests = actual net48 build and infrastructure-only runner. No frontend/package-all/operation semantics were changed.
