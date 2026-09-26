---
name: webcad-page-api
description: Operate an open WebCAD browser CAD page to create, edit, measure or export models through its public frontend API. Use for WebCAD modeling requests, including short drawing requests on a selected WebCAD tab.
---

Use the current WebCAD page's public API and modeling history. Respect the user's chosen browser and target tab; do not reload an existing document to discover tools.

For an installed package, read local `routes.json` when the user names a menu action: it maps the actual UI action to public tool IDs, methods and usage. Search the file or use `findLocalRoutes` in [scripts/page-client.mjs](scripts/page-client.mjs); return only matching entries to context. It is a build-time index, not current document state. Check the live page's hashes before using cached contracts. The browser entry is `automation/agent-start.html`; its machine entry is `automation/agent-start.json` relative to the deployed page base.

Bind the tab using the browser tool's current instructions. Inspect the host's actual capabilities. If an authorized script capability such as CDP is available, read its documentation before calling the page API. Do not infer script support from API visibility, use read-only evaluation for writes, or install a bridge/service to bypass a host limitation. Report a genuinely unavailable channel.

In that channel, check for `window.webcad.api.connect`. If missing, report an older page version; do not assume old `window.webcad.action/execute/ready` examples apply. Read `automation/quickstart.md` relative to the target page's base URL when needed. Current page contracts take precedence over local repository files or old manuals.

For discovery, call `api.connect({queries:["本次能力"],limit:2,includeContracts:true})`. When IDs are already known, use `api.connect({toolIds:["advancedLoft","transform"]})`. Read `api.readDocs({docId:"api.workflow"})` on first use, and `api.run` documentation for the batch envelope. Do not read the whole catalog or source tree. Full cards already returned by connect need not be fetched again.

Check `canExecute`, `blockers`, `buildId`, and hashes. Wait for a busy kernel; do not commit/cancel the user's preview without task authorization. Search returns candidates, not a geometry plan. `template.*` cards describe a single template; execute their `minimalExample` with `op:"quickModel"` and `params.kind`, never with the discovery ID. Distinguish a 2D circle, solid ring and circular extrusion; clarify materially different intent when context does not resolve it.

Compose `api.run({context:connection.requestContext,idempotencyKey,steps})` with at most 20 steps. Use `add` for geometry and `execute` for edit/delete/history commands. Link actual results with `{$ref:"part.createdBodyIds.0"}`; transformations may replace body IDs. Split complex models into meaningful stages, check state between batches, and retain named editable parts. In CDP, wrap asynchronous expressions in an async IIFE with `awaitPromise:true` and inspect exceptions.

Measure key dimensions and inspect the matching rendered frame. Report committed geometry, visible result, and generated/exported files separately. Do not export or save merely to finish a drawing request. For partial failure inspect `progress`, `recovery` and raw errors; earlier commits remain. Read current state before planning only the remainder with a new key. Unknown/timeout outcomes require inspection before retry; an identical request/key returns the old receipt, not a continuation.

Optional persistent cache: download the target page's `automation/index.json` and `automation/tool-library.mjs` using an authorized host tool, keyed by source and catalog/docs hashes. Search the snapshot programmatically and return only needed cards to context. Never cache document state, entity IDs or topology tokens as reusable knowledge. Refresh on hash mismatch; downloading a manual is not an installation or an execution channel.

Read [references/connection.md](references/connection.md) for installation/update commands, host adapter requirements and a short client example. The optional `scripts/page-client.mjs` accepts an already authorized CDP `send` adapter, reads a fresh context for each batch, generates a unique key, awaits page promises and reports uncertain outcomes without replay. It does not open a browser, grant permissions, install dependencies or start a service.
