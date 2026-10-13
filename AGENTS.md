## Current user deployment override (2026-10-10)

Follow the existing LogoVector deployment pattern: ASHX references compiled DLLs and the DLL invokes controlled Logo/OCCT workers. Do not require or reinstall the independent Windows Host service, named-pipe transport or Host installer. Older Host-only rules below are superseded for the current deployment. The canonical IIS entry is Gateway.IisHandler; package with scripts/package-iis-dll.ps1. Preserve authorization, persistent jobs, cancellation, artifact identity, timeouts and source geometry; no server deployment to 10.121.11.8 is authorized in the current scope.

## 部署端点一致性（用户要求，2026-10-13）

无论修改 UI、工具、页面 API、文档、Services、Logo 或 Native，部署完成必须保证所有正式使用端点运行同一发布版本。不得只更新生产站或文件镜像而遗漏本机独立站点。

每次发布必须覆盖并核对：

- 生产静态页面：`https://goldenfu.cn/webcad/`。
- 生产工作台入口：`https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx`；确认它加载本次发布的 WebCAD，保留宿主工作台功能。
- 本机独立入口：`http://127.0.0.1:17674/`（包括 `?document=...` 工程链接）；当前 IIS 物理路径为 `F:/WebCADServices-local/frontend-usable-20261010-final`，部署时必须重新读取实际映射，不能只凭历史路径推断。
- 本机 IIS 镜像入口：`http://localhost/webcad/`；当前物理路径为 `F:/Project/Goldenluck/Web/webcad`，同样核对实际映射。

前端使用同一个已验证构建包同步各端点；从端点实际 HTTP 响应核对 `buildId`、`pageApiVersion`、`catalogHash`、`docsHash` 和入口资源哈希一致，不能以磁盘复制成功代替部署验证。工作台只要求其嵌入的 WebCAD 版本一致，不要求不同宿主页面 HTML 相同。

涉及 Services / Logo / Native 时，所有正式配置的对应后端也必须使用本次匹配的发布产物、协议及能力版本；仅前端修改可明确记录后端无影响。环境 URL、密钥、数据目录和用户配置允许不同，工程数据、Cookie、自定义颜色及后端任务数据必须保留。不要为同步版本覆盖这些数据。

临时验收站点须明确标记用途；一旦被作为正式使用入口，立即纳入同步清单。不可达、缺少授权或版本不一致的端点必须明确报告，不能宣称部署完整完成；遵守现有授权边界。将实际端点、物理映射、发布标识与核对结果记录在 G 盘部署报告。不同版本并行发布前须重新核对当前线上版本，保留其他已授权发布的改动，防止旧包覆盖新功能。

# WebCAD agent rules

## Local storage restriction (user instruction, 2026-10-09)

F: contains necessary source, program/runtime files, Git metadata and lightweight entry/router files. Write all other transferable data directly to G:, including agent scratch scripts, downloads, CAD investigation data, exported models, screenshots, reports, notes, logs, caches and backups. New non-program work uses `G:/CAD-Workspace/WebCAD/`; existing migrated agent data stays under `G:/AgentStorage/F/Project/WebCAD/agent/` with original-path compatibility links. Transferable dependencies use G: with compatible configuration/junctions.

Read `G:/AgentStorage/agent/notes/CAD-STORAGE-POLICY.md` before generating or organizing files. Older `agent/temp`, `agent/output` and backup examples below apply only when their actual storage is G:. For an occupied F: directory that cannot be linked, write new data to the explicit G: location and record retained F: paths. Generated investigation data is never required program source by default. These local links are not part of the public page or deployment package.

Remote Agent integration and the tool upgrade are now integrated in the primary checkout under the user's 2026-10-09 authorization. The adapter in `src/agent/` delegates to the same public page API, CommandService and Worker as the UI. Historical worktrees and coordination records are not separate product versions; continue from the canonical branch and preserve unrelated work.

Read [PROJECT.md](PROJECT.md) before implementation. It is the canonical product-purpose, architecture and acceptance specification. See [page API](docs/PAGE-API.zh-CN.md) for integration.

Follow PROJECT.md section 8 for execution: address the user's core real-case failure first, validate only the affected behavior, and enforce one shared experiment budget across routes and agents. A passing synthetic model or growing test count does not complete a failing real case.

For using an open WebCAD page, start with `window.webcad.api.connect({queries:[capability keywords]})`. On the first handshake, follow `onboarding.knowledge` to download and hash-verify the finite static knowledge package on host storage; route tasks with `agent-routing.json` and exact UI actions with `routes.json`, then load only needed complete docs/cards. Reuse a verified cache keyed by source base URL and live catalog/docs hashes. Report missing host storage/download capability rather than claiming success. Details: [knowledge routing](docs/AGENT-KNOWLEDGE.zh-CN.md). Cache static contracts, never document state or topology IDs.

Known IDs can be read in one handshake with `connect({toolIds:[...]})`. Check `canExecute/blockers`, not `ready` alone. Template discovery cards (`template.*`) use `op:quickModel` and `params.kind` in their executable examples. First-use workflow is `readDocs({docId:'api.workflow'})`; the portable host skill lives in `skills/webcad-page-api/SKILL.md`. Do not reuse legacy top-level `window.webcad.action/execute/ready` instructions against the current page API.

- Deliver a static browser CAD application for Goldenluck hardware; AI and UI operate the same current document, CommandService and browser Worker.
- AI's default entrance is window.webcad.api with generated readable docs. Use an actually supported authorized page script channel; see readDocs({docId:'api.connection'}) for host capability discovery. Never auto-fallback to the manual JSON debug panel. If no authorized script channel exists, report that limitation.
- Every new or changed user operation must ship its public AI equivalent, explicit arguments, state/readback, errors and current tool card in the same change. Register UI mappings in src/ui-api-coverage.js; npm run build rejects undocumented UI actions. Never ship a mouse-only tool. Pointer gestures use explicit geometry/camera coordinates; native file dialogs use the resource API.
- Generate on-demand tools/docs and the complete downloadable knowledge snapshot with scripts/generate-page-docs.mjs. Document version/hash drift and genuine unavailable capabilities. Per-body appearance controls belong in Properties; browser-wide default colors/materials and lighting belong in Global Settings and persist in a versioned cookie. Explicit body/project appearance must survive save/open and undo.
- Do not solve browser/sidebar access by making a terminal CLI or local MCP service a product prerequisite. Existing bridge/CLI code is legacy development tooling.
- Do not claim a host supports script execution merely because the page exposes an API. Verify the actual host channel.
- Source CAD stays read-only. Never substitute guessed dimensions or logos for source evidence.
- “At least 80% product coverage” requires per-product reconstruction and acceptance, not a route hypothesis, template count or unit-test count.
- Preserve separate results for geometry commit, rendered frame, generated bytes, disk write and deployment. Correct mistaken prior reports explicitly.
- This is independent F:/Project/WebCAD. Never edit original F:/Project/CadViewer as part of this task.
- Keep records in agent/notes, scratch in agent/temp, reports in agent/output. Back up existing files under agent/backups/<timestamp> with the original relative paths before editing. Keep root clean.
- Preserve unrelated changes and third-party licenses. Do not overwrite via git reset/checkout/pull.
- No production deployment, external source upload or Git push without session authorization.
- Use targeted tests and one relevant browser check when authorized. Stop exploration after two rounds without new mechanism evidence, or when the shared experiment budget is exhausted. Do not extend it by changing parameters, routes, tools, kernels or agents; retain the minimal repro and report the unresolved core problem.

## Services fixed-disk exception (user instruction, 2026-10-10)

G: is frequently unmounted. Services runtime, required native/build dependencies and persistent operational data use F:/WebCADServices-local outside the repository. No runtime junction may depend on G:. Research packages, acceptance reports and edit backups retain the existing G: policy.

## Unified WebCAD / Services maintenance

WebCAD browser code, `services/WebCADServices`, imported LogoVector, native Worker, shared contracts and joint scripts are one product. Future WebCAD changes must check related Services/Logo/Native impact without a separate reminder. This repository is the unique active maintenance source; never add an absolute external-checkout build dependency.

- Keep one Services configuration and authorization entrance. Old LOGO methods are deprecated adapters, never a shadow URL/Key or implicit conversion of old authorization.
- For every affected change record localImpact, servicesImpact, logoImpact, contractImpact, documentImpact, cacheImpact and requiredTests. Genuine UI-only changes may say none with a reason.
- User policy (2026-10-10): simple accurate/fast geometry belongs to the local WASM; complex geometry belongs to server Native OCCT when Services is configured. No Services means all supported operations run locally. Use shared deterministic complexity rules, not successful-timing or cross-kernel equality gates. An unsupported complex server operation fails explicitly without local fallback.
- Local timeout and server wait reminder are independently configurable (defaults 60/180 seconds). Local timeout terminates its Worker and preserves the committed document. Server reminder offers continue on the same job or controlled stop, never automatic resubmission.
- Maintain input meaning, units, source/revision/recipe binding, codec and independent geometric correctness for the executing end; do not duplicate a Native algorithm in WASM or demand identical dual-end geometry. Native-only versions still require actual capability and correct BRep import/installation/save acceptance.
- Services computes snapshots; current page, CommandService, history and Worker remain document authority. Server success is not page commit. Verify fingerprint/revision/semantic/codec/artifact/geometry and atomically install at the original feature, retaining recipe/dependencies and rollback.
- Never reuse topology indices/pointers across revisions or kernels, or guess ambiguous selections. Never alter source glyphs, holes, depth, radius, placement or unrequested supports for success/speed. Smooth surfaces are not fixed-R fillets.
- Saved projects must carry required compiled artifacts. Hot Maps/expiring URLs are insufficient; upstream changes invalidate dependent checkpoints. Large remote results still require a real client BRep import capacity gate.
- Persist before accept; same idempotency key/payload returns the existing job and conflicting payload rejects. Unknown/disconnected tasks are reconciled before new compute. Cancellation is not kernel pause.
- The shared heavy-geometry budget is one baseline plus one mechanism-backed alternative per real candidate across all executors/Agents; local acceptance unlocks at most one related full-product trial. No repeat under another jobId.
- Maintain `contracts/operation-impact-map.json`, joint build/compatibility manifest, public API routes/docs and necessary tests. Compile, execution, page commit, save and production deployment are reported separately.
- Read `services/WebCADServices/AGENTS.md` for process/ownership/storage/safety rules. Local implementation does not authorize administrator installation, IIS changes, production deployment or Git push.
