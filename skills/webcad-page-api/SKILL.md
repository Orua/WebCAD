---
name: webcad-page-api
description: Operate an open WebCAD browser CAD page to create, edit, measure or export models through its public frontend API. Use for WebCAD modeling requests, including short drawing requests on a selected WebCAD tab.
---

Use the current WebCAD page's public API and modeling history. Respect the user's chosen browser and target tab; do not reload an existing document to discover tools.

For threaded/interlocked rings, buckles, chains or key rings (穿接、穿串、相扣、内口贴紧、不要悬空), follow the live handshake's `onboarding.knowledge.assemblyDocId` and route to `modeling.interlocked-assembly`. Read that full chapter from the current verified knowledge package before positioning: it defines actual threading, first inner-surface contact under tension, non-penetration, separate solids and measurements. A separated collision-free arrangement is insufficient. This instruction is WebCAD-delivered knowledge after handshake, not a rule to hardcode in the Agent program; no preinstalled skill is required.

On the first handshake, follow `connect().onboarding.knowledge`: download its `automation/agent-knowledge.json` manifest and the three finite static payloads (`index.json`, `agent-routing.json`, `routes.json`) to host storage and verify SHA-256/size. Cache by page base URL plus catalog/docs hashes. Reuse a matching verified cache on reconnect; refresh changed or damaged files. Load the listed bootstrap docs once, then only selected workflows and complete tool cards into model context. If the host cannot download/persist, report that limitation and do not claim a cache exists. This is a documentation download, not a skill/service installation.

## Native MCP host

When the current Agent exposes webcad_* MCP tools, use that inventory and the actual host capability receipt. The host downloads and verifies the published package; follow its knowledgeReceipt rather than downloading it again. Unknown capabilities: webcad_docs(method="route",args={"query":"本次任务","limit":2}); known IDs: webcad_docs(method="getTools",args={"ids":["transform"]}). Read a selected chapter with webcad_docs(method="readDocs",args={"docId":"api.modeling.methods.execution-strategy"}), following nextCursor for needed content. Candidates are alternatives, not a full reading checklist. Use each card's mcpCall/methodTools/contextPolicies; getState does not accept context. Submit structured batches through webcad_submit(method="run",args={context,idempotencyKey,steps},requestKey). No Node is required for run. Inspect the current feature.addMany card for its separate feature limit and atomic semantics.

MCP route accepts query/limit, not scope. planLayout is a published fixed numeric planner exposed by webcad_docs; planSource and readLocal below belong to the optional page client, not this MCP host. Local Python/JS may calculate bounded parameters only when the interpreter is actually verified; script success is not CAD commit. Do not obtain grants/cookies or call internal APIs from scripts. Use current task temp/output and authorized inputs. Canvas outages do not disable independent company knowledge, conversation files or local calculations.

## Optional authorized page API / CDP host

The following page/client examples require an explicitly provided authorized send channel. They are not native MCP examples.

Route task descriptions through `agent-routing.json` (source reconstruction, templates, profiles, machining, rounding, Logo/relief, inspection, editing, files); exact menu actions still use `routes.json`. For new/reconstructed/modified models read `api.modeling.start` and `api.modeling.guide`, then route with `route(query,{scope:"modeling"})` to one `modeling.*` workflow. Compare construction and datums before selecting a branch; only then fetch that branch’s complete cards. On failure read `api.modeling.problems.diagnosis` and select the relevant diagnostics, reconciling unknown outcomes first. Related methods are optional references; never bulk-load all workflows/branches. Use a single `template.*` card for a template, not the master `quickModel` catalog. The optional host helper supports `createPageClient({send,knowledge:{baseUrl,directory?}})`, automatic download in `connect()`, `route(query)` and `readLocal({docIds,toolIds})`; see `api.knowledge-cache`. Live context/IDs never come from cached files.

For unfamiliar products, read `api.product-source` and use host `planSource(brief,{includeKnowledge:true,maxChars:32000})` to select a structural family and its complete cards from one verified snapshot. Record target parts, roles, source version, section evidence and unknowns. TypeID is a candidate hint; a reviewed family can cross categories. Photographs alone or unresolved source conflicts keep `canPlan:false`. Planning is caller-asserted, read-only, and cannot certify dimensions. Exact closed wire paths now use `profileSweep` when the saved section is already normal to the path start; preserve source curves rather than fitting a convenient oval template. Source operations are separate run steps when the current `addMany` allowlist does not include them.

For an installed package, read local `routes.json` when the user names a menu action: it maps the actual UI action to public tool IDs, methods and usage. Search the file or use `findLocalRoutes` in [scripts/page-client.mjs](scripts/page-client.mjs); return only matching entries to context. It is a build-time index, not current document state. Check the live page's hashes before using cached contracts. The browser entry is `automation/agent-start.html`; its machine entry is `automation/agent-start.json` relative to the deployed page base.

Bind the tab using the browser tool's current instructions. Inspect the host's actual capabilities. If an authorized script capability such as CDP is available, read its documentation before calling the page API. Do not infer script support from API visibility, use read-only evaluation for writes, or install a bridge/service to bypass a host limitation. Report a genuinely unavailable channel.

In that channel, check for `window.webcad.api.connect`. If missing, report an older page version; do not assume old `window.webcad.action/execute/ready` examples apply. Read `automation/quickstart.md` relative to the target page's base URL when needed. Current page contracts take precedence over local repository files or old manuals.

For discovery, call `api.connect({queries:["本次能力"],limit:2,includeContracts:true})`. When IDs are already known, use `api.connect({toolIds:["advancedLoft","transform"]})`. Read `api.readDocs({docId:"api.workflow"})` on first use, and `api.run` documentation for the batch envelope. Do not read the whole catalog or source tree. Full cards already returned by connect need not be fetched again.

Check `canExecute`, `blockers`, `buildId`, and hashes. Wait for a busy kernel; do not commit/cancel the user's preview without task authorization. Search returns candidates, not a geometry plan. `template.*` cards describe a single template; execute their `minimalExample` with `op:"quickModel"` and `params.kind`, never with the discovery ID. Distinguish a 2D circle, solid ring and circular extrusion; clarify materially different intent when context does not resolve it.

Compose `api.run({context:connection.requestContext,idempotencyKey,steps})` within the live handshake limits.batch.maxSteps and host safety limit. Use `add` for geometry and `execute` for edit/delete/history commands. Link actual results with `{$ref:"part.createdBodyIds.0"}`; transformations may replace body IDs. Split complex models into meaningful stages, check state between batches, and retain named editable parts. In CDP, wrap asynchronous expressions in an async IIFE with `awaitPromise:true` and inspect exceptions.

Measure key dimensions and inspect the matching rendered frame. Report committed geometry, visible result, and generated/exported files separately. Do not export or save merely to finish a drawing request. For partial failure inspect `progress`, `recovery` and raw errors; earlier commits remain. Read current state before planning only the remainder with a new key. Unknown/timeout outcomes require inspection before retry; an identical request/key returns the old receipt, not a continuation.

For source-drawing reconstruction, read `api.reconstruction` once and `api.design-checks` when checking material. Set expectations from the latest drawing/user requirements, including section, bars, joints and openings. `inspectDesign` batches source-labelled bounds, solid counts and world material samples; use `requirePass:true` before an authorized export to stop on mismatches or unverified assumptions. Boundary samples remain unverified. Correct dimensions and one solid cannot prove section shape, fillet continuity or the entire product; inspect the actual section/fit where those are required. Build principal parts, machining and rounding first, then Logo. Reuse templates only when their section and path prerequisites match.

Optional persistent cache: download the target page's `automation/index.json` and `automation/tool-library.mjs` using an authorized host tool, keyed by source and catalog/docs hashes. Search the snapshot programmatically and return only needed cards to context. Never cache document state, entity IDs or topology tokens as reusable knowledge. Refresh on hash mismatch; downloading a manual is not an installation or an execution channel.

Read [references/connection.md](references/connection.md) for installation/update commands, host adapter requirements and a short client example. The optional `scripts/page-client.mjs` accepts an already authorized CDP `send` adapter, reads a fresh context for each batch, generates a unique key, awaits page promises and reports uncertain outcomes without replay. It does not open a browser, grant permissions, install dependencies or start a service.

## 确定参数后的快速提交

源图/尺寸已确认且无需中间面边查询时，读取 api.feature-plan 与 feature.addMany 卡；在run中用method:addMany一次提交主体、刀具、定位、布尔。每项使用key，refs用当前ID或{feature:"earlierKey"}。计划保留每个可编辑特征，一次重建/一个撤销步骤；失败全部不提交。Logo、选择性圆角与需要当前拓扑的加工分段执行。不要把未确认源参数变成模板假设。结果steps的elapsedMs用于区分建模、检查、导出；整件用宿主计时，不将内核时间称为端到端。


## LOGO直连与阶段约定

先读当前api.logo和readLogo卡。原生宿主优先readLogo({context,sessionFileId,allowUpload:true,targetWidthMm,reviewPolicy})，宿主直接Services并验证/本地保存矢量，只把矢量送入页面。不得取Cookie/服务密钥、伪造Origin或自行调用内部接口。没有此能力就明确报告，不谎称已走直连。
默认automatic接受已验证稿并输出“已完成矢量化”等真实进度，再用logo.params.logoId继续雕刻。只有用户要求先看/调整才preview，logoWizard action open打开大窗并结束本阶段等待确认。继续时读取当前wizard.logoId，保留用户编辑；不重复转换、不把整个轮廓数组交给模型。点数/精度由发布适配器自动处理。图像35mm默认是可缩放放置稿，不是源尺寸实测。目标面/深度/定位和最终几何仍由当前卡及页面内核验证。
