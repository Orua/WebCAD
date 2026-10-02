# WebCAD 浮雕与菜单拆分：成果与交接

## 最终曲面追加任务交接（优先于以下早期记录）

收尾更新：主要功能、文档、可重开的两个示例工程及回执已在 `2706aa9` 推送到 origin/main。之后只新增解析体积回归和LOGO细节截图；本文件所在后续提交是最终收尾。完整contracts最终281通过、1原有跳过、0失败；构建75 operations/28 actions/160 routes通过。专项最终16通过（含R=2/10/100的恒高柱面凸凹六例与解析圆柱扇形体积对照，容差max(1e-6 mm³, 体积×1e-8)）；DOM20通过。截图`curved-logo-closeup.png`可看清圆柱/球面凹刻内孔。开发服务已恢复667，浏览器恢复已落盘的五件曲面工程；重启后的文档实例/修订与先前验收回执不同是正常的，不能缓存旧context。

停止前额度已到剩余约2%的收尾区间，保留原用户“剩1%或北京时间01:00停止”上限，不开启新实验。当前交接可从已推送代码和示例继续；不存在等待用户处理的保存弹窗。源/IIS部署未变。运行日志和备份保留在agent目录，不把未跟踪的旧失败日志当当前验收结果。

用户在00:23追加“检查LOGO，然后两个工具支持曲面”。现在完成：

- LOGO 原有曲面等深凹刻已确认：圆柱/球面/光滑放样面内核试验通过（含深度、内孔、背面、薄壁、STEP）；统一LOGO内核4项通过；真实页面圆柱/球面各一次成功。没有重写或冒充新增既有LOGO功能；曲面凸字/拔模仍拒绝。
- relief 已正式支持外凸圆柱，公共契约增加 point 和 baseMm，UI明确显示基底厚度，API文档升级1.18.0，静态知识包同步。实现 `src/modeling/manufacturing/cylindrical-relief.js`，由现有 relief 操作分派，无独立鼠标专用入口。
- 柱面矩形基底是明确设计限制：默认0.02 mm、0.005–1 mm可调。总高度baseMm+depthMm，整张图的零值区也有基底。没有零背景无痕包裹。水平圆周弧长/垂直沿轴，point真实点击点；角宽≤90°、总高度≤半径20%、angleDeg=0，拒绝跨缝/孔/边界及内孔柱面。球面和任意自由曲面浮雕仍未实现。
- 原型先验证：无基底/逐控制点变换导致部分布尔为空；微小负间隙虽然闭合，但刚体不变体积误差0.029 mm³，未通过门禁，不采用。明确0.02基底加刚体变换刀具后，3图×2模式×2姿态=12实体通过，最大体积差约1.46e-11 mm³，随后才产品化。失败证据在backups/20261003-cylinder-combined。
- 最终目标测试15通过；真实DOM/解码20项通过，包含锁定点击点/基底传参和基底说明。完整contracts与build日志是 `relief-contracts-final.log` / `relief-build-final.log`（后面的早期计数以最终日志为准）。
- 五件曲面页面示例（3个浮雕/凹雕、2个LOGO）通过，保存 `agent/output/curved-relief-logo-demo-20261003.webcad`（30226字节，SHA-256 `9b73ae2fd6e45148fbc11be9157665a3772f6551177833a7c06881f182e0830c`）。回读重开5实体14特征、体积完全相同、dirty=false、最终模型/渲染/上下文revision18一致。不要把文件名理解成产品项目名，内部名保留测试工程名。
- 主要成果文档 `agent/output/RELIEF-RESULTS-20261002.md`；画面 `curved-relief-logo-gallery.png`；页面回执 `relief-curved-browser-acceptance.json`、保存重开 `curved-relief-logo-save-reopen.json`。

下一步：若用户继续，优先研究无矩形基底的稳定零高曲面结合，然后球面/自由曲面浮雕。先独立图案试算、有限面/孔/接缝/法向/自交与薄壁门禁，再产品化；不能简单去掉baseMm限制。柱面凹雕当前如平面允许穿透，UI已提示预览壁厚；如需禁止穿透，应新增完整工具包含性验证，不只检查结果单实体。用户未要求生产部署，IIS副本保持不变。

## 2026-10-03 续跑后的有效交接（覆盖下面暂停时的未验收状态）

用户调整模型和速率后明确恢复工作。又补充：以后测试工程自行保存，不要弹窗要求人在场。后续 agent 应先通过公共文件 API 生成资源，再实际写盘、回读校验和 confirmWritten，确认 dirty=false 后才能 new/open/reload；不要调用会弹 native confirm 的 UI 新建。不要伪造写盘确认。

### 本阶段已交付

- 原进度基线已推送 `e9d2cdd`；暂停点已推送 `7a84a99`。最终续跑提交见本文件所在 Git 提交及之后的收尾记录。
- 加工菜单拆成面加工/实体加工；平面曲面浮雕 UI、Worker、公共 AI 接口与文档齐全。JPG/PNG/SVG → 连续 B 样条起伏，支持灰度/图形柔和鼓起、浮雕/凹雕、偏移旋转、预览、改历史参数、撤销。
- 续跑修复预览弹窗共享关闭清理标记；保留 SVG 精确比例和物理单位比例；在解码前检查 JPEG/PNG 尺寸；拒绝单实体夹带散面。
- 本轮先证明三张 JPEG 的计算，再实现正式平面工具；新增柱面两套原型共 14 项通过，但尚未接入正式功能。不要把柱面或任意曲面包裹说成可用。

### 最终验收和成果

- `node --test tests/relief-contract.test.mjs tests/relief-kernel.test.mjs tests/workspace-upgrade.test.mjs`：14 通过。
- `npm.cmd run test:contracts`：282 总计、281 通过、1 原有跳过、0 失败。日志 `agent/output/relief-contracts-final.log`。
- 最终 `npm.cmd run build`：75 operations / 28 actions / 160 UI routes 发布门禁通过；日志 `agent/output/relief-build-final.log`。只有既有 bundle 大小提示。
- 同一 IAB 页/同一 Worker 上 18 项实际 DOM/解码检查通过；三个浮雕样件 + 一个凹雕样件都成为有效单实体；精确体积/失败不提交/幂等/改参/撤销重做通过。验收模块在 `agent/temp/relief-browser-acceptance.js`、`relief-engrave-acceptance.js`；回执在 output 同名 JSON。
- 四样件已保存为 `agent/output/relief-demo-20261003.webcad`，112757 字节。回读 SHA-256 `0998017f2399b0b51f7f7c29af7b3acff6e65877a5c8df5b4226501173850f24`；公共 API 重开后 4 实体/12 特征、体积完全相同、dirty=false，最终渲染身份与修订一致。详见 `relief-save-reopen.json`、`relief-final-state.json`。
- 可视成果 `agent/output/relief-four-cases.png`；完整说明 `agent/output/RELIEF-RESULTS-20261002.md`。重载前旧测试页另保存在 `relief-before-reload-20261003.webcad`，仅本地备份，不作为最终示例。
- 源码和本地构建已完成；没有部署 `D:/Projects/WebCAD` IIS 副本。浏览器使用开发服务 667。浏览器单批返回 rendered 时可能仍是前一帧，必须比较最终 context/model/rendered，不只看 status。

### 下一阶段

1. 读 `agent/notes/RELIEF-CYLINDER-NEXT.md`，把柱面几何构造与实际选面边界门禁合成一个隔离的内核原型，补角宽/深度/半径范围、任意轴材料体积和源不变验证。
2. 柱面首版可仅开放外凸圆柱；内孔、接缝、孔边界和非等参旋转须明确拒绝。选面中心不能用面积质心猜。当前 `relief` 平面保护保持不变，直到新契约、UI 和 API 同时完整。
3. 若进一步支持照片的真实深度，应作为独立深度输入/推断问题讨论；当前亮度到高度不恢复真实三维。三次控制网格是平滑近似，不逐点插值。
4. 浏览器测试复用现有页；先 connect/read current context，不缓存面 ID/文档身份。示例是本轮自造测试件，可以自行保存；源产品仍只读。

### 已知测试环境问题

开发服务运行时 Windows agent-kit 安装器 stage Directory.Move 曾 AccessDenied。停止 dev 后同一测试和完整 contracts 均通过；没有修改安装器生产代码，也没有把相关性当作锁进程根因。需要再跑该组时先停止本地开发服务，跑完恢复。

备份：`agent/backups/20261002-relief-*`、`20261003-cylinder`、`20261003-final-records`。保留其他历史功能，禁止 reset/checkout/pull 覆盖工作。

## 以下为暂停时的历史记录，状态已被上文覆盖

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
