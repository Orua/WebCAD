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

不可达、缺少授权或版本不一致的端点必须明确报告，不能宣称部署完整完成；遵守现有授权边界。将实际端点、物理映射、发布标识与核对结果记录在 G 盘部署报告。不同版本并行发布前须重新核对当前线上版本，保留其他已授权发布的改动，防止旧包覆盖新功能。

## 唯一本机测试入口（用户要求，2026-10-13）

- 不再新增 WebCAD 测试站点、临时验收站点或其他测试端口。所有前端、工具和 Agent 接口修改完成后，直接在现有 `http://127.0.0.1:17674/` 验证。
- `17685`（WebCADUpgrade20261011）和 `17686`（WebCADShoulder20261011）已取消；不得重新创建或启用。历史文件与配置备份仅用于回滚，不作为运行入口。
- 本机验证前读取 17674 的实际 IIS 映射，备份被替换的程序文件；保留工程、Cookie、自定义配置和后端任务数据。不得通过另起站点规避当前入口的问题。
- 生产及 localhost 镜像仍按上面的部署端点一致性规则同步。17674 是唯一日常本机测试入口，其他正式入口只进行发布后必要的一致性确认。

### 今后固定布置与工作顺序

| 位置或入口 | 固定用途 |
|---|---|
| `F:/Project/WebCAD` | 唯一维护源码；所有新修改在此接续，保留其他已授权修改，不复制成另一套长期维护版本 |
| `http://127.0.0.1:17674/` | 唯一本机日常使用及修改验收入口，包括 Agent/API、工程链接与受影响 Services 联调 |
| `http://localhost/webcad/` | 正式本机镜像；发布时同步同一构建包，不作为第二套测试台 |
| `https://goldenfu.cn/webcad/` | 生产静态页面；发布已在17674验证的同一包 |
| `https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx` | 生产宿主工作台；嵌入同一发布版本，保留宿主功能 |
| `G:/CAD-Workspace/WebCAD/` | 构建交付包、报告、缓存及回滚备份；这些目录不是运行站点 |

1. 修改前核对主维护目录和17674当前版本、IIS实际物理映射；保留最新已授权成果，禁止用历史发布分支或旧包覆盖新功能。
2. 备份受影响文件，再修改源码并运行直接相关的必要检查。命令行单元测试可以执行，但不得为其另起HTTP测试服务。
3. 构建一个候选包，备份17674受影响的程序文件后更新其现有物理目录，在17674完成一轮针对性验证。发现问题就在此修复；需要回滚时恢复17674的上一有效包，不另建隔离站点。
4. 验证通过并具有发布授权后，用这个相同构建包同步生产和localhost镜像，核对生产工作台嵌入的WebCAD版本；不为每个入口单独构建不同版本。
5. 从各正式入口实际HTTP响应核对buildId、pageApiVersion、catalogHash、docsHash及入口脚本哈希，记录结果后收尾。未能核实的入口明确报告，不宣称全部同步完成。
6. 保留用户工程、Cookie、自定义颜色、环境配置和后端任务数据；未保存的页面工程不得被强制刷新或替换。部署仅更新发布清单中的程序文件。

禁止创建新的IIS站点、Vite/preview静态站、临时HTTP服务器或更换端口作为测试台；旧17685/17686不得恢复。历史文件、构建目录或Git工作目录不是新运行入口，也不能作为另一套正式维护版本。

Git最终目标为一个正式维护版本，统一到main。当前尚未归并的下午升级必须完整保留；归并和历史目录清理是独立任务，不能仅因写入本规则而视为已经完成，也不得通过reset/checkout/pull覆盖现有未提交修改。

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
