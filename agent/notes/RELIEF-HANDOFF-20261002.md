# WebCAD 浮雕与菜单拆分：暂停交接

暂停时间：2026-10-02 北京时间 23:27。用户明确要求“计划有变，你做好记录先暂停，我调整一下模型”。停止继续开发、几何实验和浏览器测试；仅整理记录和阶段提交。原先 1% 额度或次日 01:00 的持续工作要求被此次暂停覆盖，不自动恢复。最后一次额度查询为剩余 11%（23:24）。

## 用户需求与当前结论

1. 先保存原有进度：已提交并推送 `e9d2cddd7772643d79618f34f3ec454353426c04`，包含此前圆角、图纸、历史与 API 工作；它是本轮修改的基线。
2. 原“加工”拆为“面加工”和“实体加工”，沿用共享主题图标，常用操作直接显示，批量操作进入“更多”。
3. 浮雕必须是凹凸、有层次的连续曲面，不是平顶凸字。先验证计算再做产品代码，已按此顺序执行。
4. 本阶段做平面上的高度场曲面；任意曲面包裹尚未实现。当前阶段代码已写入，但尚未完成全部浏览器验收，不应宣称完整交付。

## 已实现

- 面加工：锣槽、内车、外车；面上打孔、面上拉伸；浮雕、LOGO。
- 实体加工：孔、孔向导、槽、螺纹；合并、相减、相交、切分；批量孔/槽/凸台进入更多。原工具清单保留。
- `relief` 操作：JPG/PNG/SVG 本地采样 → 0–1 高度控制网格 → 三次夹持 B 样条曲面 → 侧面和底面闭合 → 与目标实体融合或相减。
- 两种解释：灰度层次；单色图形按到背景的距离柔和鼓起。第二种产生连续起伏，不是轮廓等高拉伸。
- UI：面加工 → 浮雕；选一个平面，导入图片，设宽高、起伏高度、明暗、精度、方向、偏移和角度，预览后应用。
- AI：`files.register` → `readRelief` → `run add relief`，显式 refs/faceId/values/尺寸；预览、历史改参、撤销使用同一 CommandService/Worker 通路。
- `getState().bodies[].reliefReport` 回读实际增减体积、网格、尺寸、来源摘要。
- 工程保存网格和来源 SHA-256，不需要重新读取外部图片。注意：实际工程保存/重开尚未验收。
- 输入限制：8 MiB、1600 万像素、4–65 行列；SVG 路径/基本图形/填充/描边/线性和径向渐变。文字要转路径；不支持外部图片、脚本、滤镜、CSS 类。
- 几何保护：单一有效闭合实体、平面目标、完整矩形位于有限选面内且避开孔；越界/零变化/曲面目标拒绝。来源通过 BREP 序列化隔离副本，失败不修改来源。

## 算法证据：先试算，后实现

`agent/temp/relief-probe.mjs`、`relief-inputs.json` 和三张自行生成并重新解码的 JPEG：medallion / letter / waves。

- 初始双一次样条：三个有效单实体，源 BREP 字节不变；约 6.9–8.3 秒，14.6–16.8 万三角面。
- 改三次夹持控制样条：三个有效单实体，源 BREP 字节不变；含网格生成约 429 / 169 / 206 ms，13904 / 6368 / 12128 三角面。
- 试算记录：`agent/output/relief-probe-results.json`。这些历史试算体积使用 Replicad 默认积分，不能与后来统一的自适应积分混为同一精度。
- 此算法平滑近似控制网格，通常不穿过每个样点；设置高度是控制上限，不保证峰值达到它。图像灰度不是照片真实三维深度。
- 曾用既有 LOGO 工具验证 SVG 带孔框/星形轮廓，这不是本次曲面浮雕验收，不能计作浮雕 SVG 成功。

## 验收状态，严格区分

### 已通过

- `node --test tests/relief-contract.test.mjs tests/relief-kernel.test.mjs tests/document-identity.test.mjs`：6 项通过，记录 `agent/output/relief-targeted.log`。
- 内核：上/下/侧平面各做浮雕和凹雕，共 6 个实体案例；有效单实体、包含 B 样条面、来源不变。越界、面孔、曲面目标、空图拒绝。
- 高度采样：上下方向、透明背景、明暗反转；柔和鼓起具有多个高度值。
- `npm.cmd run build` 曾成功，发布门禁：75 operations / 28 actions / 160 UI routes；记录 `agent/output/relief-build.log`。构建发生在最后几处小修正之前，不能视为暂停时最终源码的完整构建验收。
- 一个真实浏览器 UI 流程：导入 `relief-waves.jpg` → 33×33、28 mm、2 mm、亮色更高 → 预览 → 应用；单一实体，画面可见波峰和凹谷。截图 `agent/output/relief-first-ui.png`。仅内存建模提交和渲染成功，没有保存工程、导出模型或部署。

### 未通过或未完成

- 最新 contracts：281 项，279 通过，1 失败，1 跳过。唯一失败是 `tests/agent-kit.test.mjs:130` 首次 PowerShell 安装时移动 stage 目录 AccessDenied；记录 `agent/output/relief-contracts.log`。本轮最初（dev server 启动前）该项未失败。怀疑 Vite watcher 争用 agent/temp 目录，但尚无证据，禁止称已定位/修复；未改安装器。
- 基线另一个 `document-identity` 测试缺少 VM 中 `serializeBoundedDocument` 注入，已补测试依赖，针对测试通过。
- JPG UI 验收发现 reliefReport 与 body.volume 相差约 0.074 mm³；已统一 `VolumePropertiesGK` 自适应积分，与内核 body volume 保持同一参数。随后内核两项回归通过，但浏览器尚未加载新版本验证数值一致。
- 最后修改还包括：应用失败不关闭任务面板；属性中的浮雕/凹雕标签避免“凸字”；relief 卡片指向 `api.relief`。这些修改尚未逐项浏览器验收。
- 渐变 SVG、叶片 SVG 的 `readRelief` → 真实 BREP → 页面渲染、历史改参、撤销、重复请求保护、工程序列化重建仍待验收。
- 已准备 `agent/temp/relief-browser-acceptance.js` 和 `relief-rosette.svg` / `relief-levels.svg` / `relief-vine.svg`，但验收脚本尚未成功运行。不要把存在脚本当成验收通过。

## 浏览器与本机状态

- 单个 IAB 页面、单个串行内核，开发服务 `http://127.0.0.1:667/`；服务启动命令 `npm.cmd run dev`，输出 `agent/output/relief-dev-server.log`，exec session 32547。本轮暂停保留服务，没有修改 IIS 静态副本 `D:\Projects\WebCAD`。
- 已确认的授权脚本通道是 CUA IAB `cdp` capability 的 `Runtime.evaluate`，操作入口 `window.webcad.api`。不是手工 JSON 调试面板。
- 清空本轮自建 JPG 测试工程准备 SVG 验收时，`files.new` 因未保存拒绝；正常 UI“文件→新建工程”出现原生确认，随后 CUA 的点击和 focus/CDP 命令超时，`getJsDialog()` 却返回 undefined。到达失败预算后停止重复操作。
- 用户暂停消息的 ambient URL 已变为 document `72b34ff3-cc3c-4ac5-b488-27cf86e28ed8`；可能确认已完成，但这是未验证状态，暂停后未再操作。旧 session/document/revision/body/face ID 全部禁止复用。
- 恢复时先读取当前页面、`api.connect({toolIds:[...]})` 和 canExecute/blockers；只在确认属于本轮测试且空白的工程运行验收脚本，不覆盖用户模型，不新开一批浏览器实例。
- 既有脚本的 feature.edit 参数、回执字段在首次运行时仍需按当前卡片核对；它未经过执行验证。

## 关键文件

- `src/modeling/manufacturing/relief.js`：B 样条、面坐标、有限面覆盖检查、实体与体积校验。
- `src/modeling/manufacturing/relief-contracts.js`：严格参数、上限、错误、尺寸字段。
- `src/relief-image.js`：本地图片解码、SVG 白名单、灰度与距离变换。
- `src/ui/forms/relief-dialog.js`：图片/参数/预览/应用状态。
- `src/cad-kernel.js`、`src/main.js`：Worker 操作、预览和结果回读。
- `src/page-api.js`、`src/page-api-docs.js`、`src/ui-api-coverage.js`：AI 对等能力、文档/路由。
- `src/ui/config/ui-layout.js`：11 个菜单及工具分组；`tests/workspace-upgrade.test.mjs` 保持原工具清单覆盖。
- `tests/relief-contract.test.mjs`、`tests/relief-kernel.test.mjs`、`scripts/test.mjs`。
- `PROJECT.md` / `docs/PAGE-API.zh-CN.md` / `docs/USER-GUIDE.zh-CN.md` 已追加本阶段说明；旧段落中的“10 菜单”描述尚待统一清理。

## 恢复顺序

1. 先确认用户允许恢复，重新查询额度和截止要求，不沿用原时间计划自动工作。
2. 核对本次阶段提交、工作树和实际页面；阅读 PROJECT.md、此记录。不要 reset/checkout 覆盖用户改动。
3. 用现有同一页面验证最新 JPG 体积报告一致，以及 SVG 渐变/叶片的真实解码、曲面、渲染、历史改参、撤销。失败先精确定位，勿增加实例绕过。
4. 完成存储网格的 JSON 工程重建测试，检查预览更参失效及应用失败保持任务。
5. 安装器失败可在不再需要浏览器调试时暂关本轮 dev server 再作一次定向验证，以检验 watcher 假设；未确认前不要修改安装器或增加重试掩盖问题。
6. 最终生成 docs、build、目标 tests；若还有原有失败，分别报告。确认后再考虑圆柱/任意曲面映射，先做独立试算，不能直接声称可用。

## 参考与回滚

仅参考算法，无复制第三方源码：
- FreeCAD Lithophane（MIT）：https://github.com/furti/FreeCAD-Lithophane ，灰度转高度、降采样。
- OpenSCAD surface：https://github.com/openscad/openscad/blob/master/src/core/SurfaceNode.cc ，高度场及封闭底面。
- FreeCAD Curves Sketch on Surface：https://github.com/tomate44/CurvesWB/blob/main/freecad/Curves/Sketch_On_Surface.py ，后续曲面映射参考。

备份 `agent/backups/20261002-relief-start/<原相对路径>`；原型备份 `agent/backups/20261002-2302/agent/temp/relief-probe.mjs`；file-patch 自动备份已归入 `agent/backups/20261002-file-patch/`。本地备份和大多数运行日志受 .gitignore 的 agent/ 规则忽略，明确选中的交接与试算证据才强制加入阶段提交。

源代码提交、生成文档、构建产物、页面内存、工程落盘、生产部署是不同状态。本轮没有部署生产，也没有保存测试 CAD 工程。暂停阶段提交是可恢复检查点，不是完整验收通过声明。
