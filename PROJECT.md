# WebCAD project architecture

## Default product path (2026-09-23 correction)

The product is a static browser application. A normal user opens `dist/` through HTTPS or a localhost static host; the browser Worker runs Replicad/OpenCascade against the current document. The public integration target is `window.webcad.api`, with read-only `info/getState/searchTools/getTool/readDocs` and structured modeling, geometry, view, capture and browser-file methods. `src/page-api-docs.js` derives operation cards from the real registry and provides page-specific discovery without requiring a network service. Client access from an existing ChatGPT sidebar remains unverified until that actual client executes an authorized page call and returns its result.

Named parameters are stored in the native document. `document.parameters` through the page CommandService merges `{value,unit}` definitions and feature-path expression bindings, evaluates them through `src/named-parameters.js`, then rebuilds atomically as one undo step. `getState()` exposes definitions and evaluated values. The UI parameter table edits values through the same action. Old numeric features remain valid; unsafe downstream topology references are rejected. `docs/examples/page-api-plate.js` demonstrates dynamic feature/body IDs and a length-driven four-hole plate; source and example are not browser acceptance evidence.

Node/npm, Vite, test runners and the old server remain development/history tooling. They are not runtime requirements for the static product. Normal startup must not depend on `/mcp`, `/ai-bridge`, asset transfer endpoints, a local converter, or a server welcome message. Static IGES import and server-backed vector conversion are unavailable until a real browser implementation exists. A generated Blob, initiated download and verified file-handle write are distinct outcomes.

## M2A document and file boundary (2026-09-23)

Historical MCP implementation and its test evidence follow. This section records prior behavior, not the default static architecture or a page API acceptance result.

`scripts/document-assets.mjs` adds nine public MCP file tools and local capability-protected raw-byte PUT/GET endpoints. `scripts/artifact-store.mjs` keeps bounded temporary resources (20 MiB each, 128 uploads/resources and 256 MiB total, 30 minute TTL). Only opaque IDs form storage paths. `scripts/file-transfer-client.mjs` is the real client adapter: an explicitly authorized existing directory, same-origin loopback transfers, SHA-256/size verification, file sync/readback and atomic no-overwrite hard-link commit. Generated, transferred, and client-confirmed written are separate states; the server cannot independently prove a remote client's disk durability.

New/open/import/save/export go through `CommandService.fileCommand` with the complete document/instance/revision context and the existing main rebuild/import/export functions. Open/new refuse dirty documents. Import only appends STEP/BREP/IGES source-backed features; it cannot replace a project. Successful reopen retains documentId, creates documentInstanceId and starts fresh undo history. Failed parsing/conversion/rebuild does not commit a replacement. A save acknowledgement clears dirty only for the identical current instance and revision. UI browser downloads keep dirty because starting a download cannot prove disk write. PNG export captures only the current viewport.

Native projects embed imported geometry bytes; they need no original path or temporary asset cache. IGES uses the existing local OCP converter with an early environment probe. Restart destroys the in-memory resource registry; no cross-restart exactly-once guarantee is offered. Discovery and recipes are available through bootstrap/search/get_tool/read_docs; see `recipe.file-workflow`. Run `npm run test:e2e:m2a` for the public-MCP product chain and `npm run test:ui:m2a` separately for UI regression.

## M1 command boundary (2026-09-23)

`src/command-service.js` validates v2 context/actions and calls the existing main transaction; it owns bounded in-memory receipts and snapshot-bound geometry selection tokens, without a second document or CAD kernel. `src/ui-selection-adapter.js` supplies missing UI topology only at the UI boundary. Explicit API topology is never replaced with UI selection.

`src/operation-registry.js` derives all cards from the existing catalog and migrates seven verified operations to strict finite JSON validation through `src/contracts/operation-schema.js` (a documented fail-closed subset, not a general-purpose JSON Schema implementation). `src/ai-docs.js` exposes versioned help and hashes to Node and browser. `src/geometry-query.js` executes exact BRep queries in the existing Worker. `scripts/mcp-bridge.mjs` keeps the 14 legacy tools and adds seven v2 controls with structured output.

Version-1 files retain a persistent `documentId`; opening a document creates a new `documentInstanceId`. Recovery writes use per-instance keys, retain legacy recovery reads and capture snapshots before asynchronous storage. Memory commit and display warnings are distinct. Persistence remains best-effort IndexedDB checkpointing, not durable atomic document/receipt commit. See `agent/output/M1_ACCEPTANCE.md` for local evidence and `docs/M1-TOOL-CONTRACTS.md` for public limits.

WebCAD is an independent local project copied from CadViewer. The source CadViewer project is not a runtime dependency and must not be edited by WebCAD tasks.

## Runtime

- `src/main.js`: document/history, transactions, local file open/save/export, autosave and UI coordination.
- `src/viewport.js`: Three.js display, camera, selection, topology highlighting and sketch interaction.
- `src/ui.js`, `src/style.css`: Chinese CAD workspace, command dialogs, trees and properties.
- `src/cad-worker.js`: persistent Replicad/OpenCascade WASM exact geometry worker, feature replay, tessellation and export.
- `dist/`: Vite static production output including Worker/WASM/assets; serve by HTTPS or localhost static hosting with correct base URLs and MIME types. Node server dependencies do not belong in the browser runtime.
- `scripts/serve.mjs`: legacy/development Node HTTP service, including the old MCP and transfer endpoints. It is not the normal user launch path.
- `start-server.cmd`: legacy local launcher; do not present it as the static product entrypoint.
- `cad-viewer/` and `cad-data/`: retained read-only viewer/resources; their old URL mapping does not establish static-subpath support.

The app receives bytes selected by the user in the browser; geometry and files do not need a backend processing service. `.webcad` stores the feature sequence and imported source bytes. Imported STEP contains geometry, not recoverable upstream design history. Mesh display is derived from exact worker shapes; STEP/BREP export comes from those shapes, not reconstruction from triangles.

## Verification and delivery

Run the Vite build after changes. User-facing page acceptance must exercise the public API against a static deployment, reopen a native project and inspect exported STEP independently where geometric correctness matters. The existing temporary native checker at `agent/temp/verify-step.py` uses a development machine's native CAD runtime and is not an application dependency. Keep actual results under `agent/output/`; do not claim tests from this architecture document.

Node syntax checks do not prove browser CAD behavior or graphical quality. Verify static assets at root and subpath, Worker/WASM loading and the page workflow directly. No external deployment is part of this project setup.

## Storage and licenses

Agent records belong under `agent/`, backups under timestamped `agent/backups/`, scratch under `agent/temp/`, and acceptance/delivery reports under `agent/output/`. Preserve copied third-party licenses and corresponding-source information. Generated `dist/`, dependencies, test output and backups are not committed by default; a distributable folder can still include the built `dist/` outside Git.

## Additional modeling commands

The current command set includes cylindrical hole cutting from a global X/Y/Z origin along a selected signed principal axis; linear patterns with per-copy XYZ translation; and circular patterns around an explicit principal axis and center. Pattern counts include the original and results are compound shapes. Full-circle placement omits a duplicate endpoint; partial-angle patterns include both endpoints. The viewport can switch orthographic/perspective projection without changing model geometry. These descriptions match the source command contract; operation acceptance remains in the recorded test results.

## Local MCP integration

Legacy development history only; this is not the product integration path.

Official MCP SDK Streamable HTTP runs at /mcp. scripts/mcp-bridge.mjs registers explicit-session tools and forwards allowed commands via /ai-bridge WebSocket to src/ai-bridge.js. The browser adapter calls the same main API as UI operations; no second kernel or arbitrary code evaluation exists. Every mutating request carries expectedRevision and is serialized per tab. The frontend checks cancellation/version again before commit. MCP export returns base64 data for the client to save. Connected pages update through the same rebuild/render path. SDK, ws and zod are runtime dependencies; launcher installs missing dependencies even if dist already exists. Configuration examples and tests are in agent/output/MCP.md; no user Codex configuration was changed.

