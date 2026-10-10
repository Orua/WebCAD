## Current user deployment override (2026-10-10)

Follow the existing LogoVector deployment pattern: ASHX references compiled DLLs and the DLL invokes controlled Logo/OCCT workers. Do not require or reinstall the independent Windows Host service, named-pipe transport or Host installer. Older Host-only rules below are superseded for the current deployment. The canonical IIS entry is Gateway.IisHandler; package with scripts/package-iis-dll.ps1. Preserve authorization, persistent jobs, cancellation, artifact identity, timeouts and source geometry; no server deployment to 10.121.11.8 is authorized in the current scope.

# WebCADServices maintenance

WebCAD browser, this Solution, imported LogoVector, future native OCCT, shared contracts and joint release scripts are one product. This is the canonical Services/Logo source for WebCAD. Never depend on an external LogoVector checkout or maintain an active duplicate.

- Apply the root AGENTS.md, G: storage and edit-backup rules. User exception (2026-10-10): Services runtime, required dependencies, build outputs, job stores and operational caches must use fixed F: storage (default F:/WebCADServices-local), never a junction to removable G:. Research evidence, downloads and edit backups remain on G:. BuildRoot stays outside the source tree. Production dataRoot is configured outside the web root, never a hardcoded developer path.
- Gateway is HTTP transport only. Host persists jobs before accepting them, owns SQLite/ownership/results and supervises separate Logo/OCCT processes. No long CAD jobs in IIS, Task.Run, or an application-pool memory queue.
- Only asset IDs and strict operation/option whitelists are accepted. No executable scripts, class names, disk paths or download URLs from clients.
- Job Object limits are applied before resume. They are process/resource controls, not a full security sandbox. Production requires a separately accepted restricted identity, ACLs, network policy and native dependency installation.
- Capture bounded diagnostics with real exit/stage; no Token or entire private CAD in ordinary logs. Worker environment must not inherit Host/ERP authorization.
- Advertise exact protocol/semantic/kernel/codec combinations only after their actual gates. Missing native compiler/SDK or bridge means operations remain disabled, not mock-computed.
- Logo DTO explicitly uses lower camelCase and preserves size, page, source/error tolerances and review status. Geometry validity never replaces user approval of glyphs/dimensions.
- Native equality uses relevant geometric invariants, never cross-kernel byte equality. Numeric face/edge IDs and native pointers do not cross revision/kernel boundaries.
- Publish checked artifacts atomically before success. Interrupted/partial results are never successful; cancellation is a request until the controlled process stops. Resume only accepted checkpoints, never a half-finished kernel call.
- User policy (2026-10-10): maintain local simple/fast correctness and Native complex correctness independently. Cross-kernel geometry equality is no longer a release gate. Keep contracts, source/recipe identity, capability, cache, codec, installation and save compatibility explicit; a missing Native operation fails without local fallback. Shared complexity rules and configurable local/server timing live in contracts/services/v1/execution-routing.json.
- Source/compile, server execution, page commit, project save and production deployment are distinct proof levels. Production installation/deployment and Git push need new user authorization.

Current acceptance entry: `G:/CAD-Workspace/WebCAD/reports/unified-upgrade/STAGE-STATUS.md`. Do not infer full stage acceptance from code existence or test counts.
