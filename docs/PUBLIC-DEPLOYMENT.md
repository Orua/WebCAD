# Public deployment / 公开版交付边界

Status: **pending implementation and acceptance**. This documentation does not deploy a site, change the existing demo URL or assert anonymous access is working.

The planned public frontend provides manual modeling without an Agent console. It must preserve local modeling, final-geometry save/open and precise STEP export where the input is an exact solid. Optional computation needs an explicit public capability boundary; public access must not weaken protected Agent/service authentication.

Before publication:

1. Freeze the candidate commit, build identity and actual distribution inventory. Close the applicable [license/source decisions](compliance/LICENSE_DECISION.md), run the byte-integrity build and the scoped publication check in [BUILD.md](BUILD.md).
2. Confirm the public build excludes the Agent console and its protected entry paths rather than only hiding UI. Inventory the actual module graph, Worker dependencies and static copies.
3. Deploy the complete verified candidate to the authorized target with a rollback copy. Preserve user project data and deployment secrets. Never put host/service configuration in public source archives.
4. In an unauthenticated session, run the [quick start](QUICKSTART.md), save/reopen and STEP round trip. Check optional network behavior and verify protected operations still reject unauthorized access.
5. Record the actual result and build identity, then update the demo link and repository homepage to that verified target. Do not advertise a new URL based on a planned deployment.

Resource rules: retain reviewed HDR attribution and full notices; do not copy private drawings, evidence folders or historical packages. The antique-metal texture and model/preview assets need provenance review before distribution. Services using PyMuPDF need their own scope review even when no Python files are in the static output.

Rollback restores the preceding verified program package and matching notices. Do not overwrite project files, cookies, user settings or persistent service jobs. Follow deployment-specific instructions and authorization separately; this checklist is not permission to publish.
