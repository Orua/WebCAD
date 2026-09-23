# WebCAD project architecture

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
- `dist/`: Vite production output including local WASM/assets. Distribute it with installed server dependencies for offline launch; otherwise npm install is needed.
- `scripts/serve.mjs`: Node built-in HTTP static server; loopback port 667; no upload/business API. `/healthz` identifies this server. Static paths accept GET/HEAD; /mcp accepts standard MCP POST. URL decoding, path containment and realpath containment prevent serving files outside mapped roots.
- `start-server.cmd`: Windows startup, recognizes/reuses own service, refuses unrelated port conflicts, conditionally builds missing dist, starts hidden server via PowerShell, opens the default browser.
- `cad-viewer/` and `cad-data/`: retained read-only viewer/resources, mapped independently by the static server.

The app receives bytes selected by the user in the browser; geometry and files do not need a backend processing service. `.webcad` stores the feature sequence and imported source bytes. Imported STEP contains geometry, not recoverable upstream design history. Mesh display is derived from exact worker shapes; STEP/BREP export comes from those shapes, not reconstruction from triangles.

## Verification and delivery

Run the Vite build after changes. User-facing acceptance must exercise commands and native project reopen through the UI, then inspect exported STEP independently where geometric correctness matters. The existing temporary native checker at `agent/temp/verify-step.py` uses a development machine's native CAD runtime and is not an application dependency. Keep actual results under `agent/output/`; do not claim tests from this architecture document.

Node syntax checks do not prove HTTP behavior, CAD behavior or graphical quality. Verify the packaged static server after stopping only the task-owned development process. No external deployment is part of this project setup.

## Storage and licenses

Agent records belong under `agent/`, backups under timestamped `agent/backups/`, scratch under `agent/temp/`, and acceptance/delivery reports under `agent/output/`. Preserve copied third-party licenses and corresponding-source information. Generated `dist/`, dependencies, test output and backups are not committed by default; a distributable folder can still include the built `dist/` outside Git.

## Additional modeling commands

The current command set includes cylindrical hole cutting from a global X/Y/Z origin along a selected signed principal axis; linear patterns with per-copy XYZ translation; and circular patterns around an explicit principal axis and center. Pattern counts include the original and results are compound shapes. Full-circle placement omits a duplicate endpoint; partial-angle patterns include both endpoints. The viewport can switch orthographic/perspective projection without changing model geometry. These descriptions match the source command contract; operation acceptance remains in the recorded test results.

## Local MCP integration

Official MCP SDK Streamable HTTP runs at /mcp. scripts/mcp-bridge.mjs registers explicit-session tools and forwards allowed commands via /ai-bridge WebSocket to src/ai-bridge.js. The browser adapter calls the same main API as UI operations; no second kernel or arbitrary code evaluation exists. Every mutating request carries expectedRevision and is serialized per tab. The frontend checks cancellation/version again before commit. MCP export returns base64 data for the client to save. Connected pages update through the same rebuild/render path. SDK, ws and zod are runtime dependencies; launcher installs missing dependencies even if dist already exists. Configuration examples and tests are in agent/output/MCP.md; no user Codex configuration was changed.

