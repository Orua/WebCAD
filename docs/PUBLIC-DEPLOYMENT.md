# Public deployment / 公开版交付边界

Status: **public candidate implemented and locally pre-release tested; live deployment pending**. Candidate checks use isolated browser interception on the existing localhost origin; they do not certify deployed-site HTTP, backend cookie handling or a new demo URL.

The public frontend provides manual modeling without an Agent console. It must preserve local modeling, final-geometry save/open and precise STEP export where the input is an exact solid. Optional computation needs an explicit public capability boundary; public access must not weaken protected Agent/service authentication.

Before publication:

1. Freeze the candidate commit, build identity and actual distribution inventory. Close the applicable [license/source decisions](compliance/LICENSE_DECISION.md), run the byte-integrity build and the scoped publication check in [BUILD.md](BUILD.md).
2. Confirm the public build excludes the Agent console and its protected entry paths rather than only hiding UI. Inventory the actual module graph, Worker dependencies and static copies.
3. Deploy the complete verified candidate to the authorized target with a rollback copy. Preserve user project data and deployment secrets. Never put host/service configuration in public source archives.
4. In an unauthenticated session, run the [quick start](QUICKSTART.md), save/reopen and STEP round trip. Check optional network behavior and verify protected operations still reject unauthorized access.
5. Record the actual result and build identity, then update the demo link and repository homepage to that verified target. Do not advertise a new URL based on a planned deployment.

Resource rules: retain reviewed HDR attribution and full notices; do not copy private drawings, evidence folders or historical packages. The antique-metal texture and model/preview assets need provenance review before distribution. Services using PyMuPDF need their own scope review even when no Python files are in the static output.

Rollback restores the preceding verified program package and matching notices. Do not overwrite project files, cookies, user settings or persistent service jobs. Follow deployment-specific instructions and authorization separately; this checklist is not permission to publish.

## Visitor compute contract

The public build reads only its dedicated compute settings, starts with computation disabled, and accepts no internal bearer or cross-origin compute address. Explicit connection requires an isolation-version-1 handshake before input upload. Legacy shared-principal endpoints are rejected. The backend uses signed compute-only visitor sessions, per-owner job/asset/result access, bounded request/storage/queue limits and two-hour expiration. Expired work is cancelled before its temporary files are removed; existing internal bearer-owned data is retained. See [Services](services/README.md).

Persisted ownership/limits/expiration and a real controlled Logo worker conversion have passed isolated runtime tests. Actual IIS cookie/session and cross-browser acceptance remain required after deploying the matching DLLs. An execution-policy rejection of deployment must not be bypassed or reported as installation success. The current public distribution check still requires actual application-scope and reference-texture rights facts.
