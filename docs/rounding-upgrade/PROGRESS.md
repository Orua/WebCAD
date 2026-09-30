> 这是唯一总进度表。最新执行方法见 [SOL-HIGH-NEXT.md](SOL-HIGH-NEXT.md)；相邻边复现见 [HANDOFF.md](HANDOFF.md)。`agent/` 内 JSON 和备份是原机器上的本地证据。

# 圆角／圆润升级总进度（2026-09-30 A1 实施）

本轮 A1：20×10×8 箱体先对一条底边 R0.5，再从当次拓扑选相邻竖边 R0.5，正式 `rounding` 的 `tangent-chain` 成功。内核参与轮廓 `[13,9,5]`，原选边 `[5]`、扩展边 `[13,9]`；实际生成面从 `Generated` 来源映射得两张 R0.5 圆柱面及一张 R0.5 球面，抽样接缝最大 0°。旧圆角在远离交汇处复测 R0.5；第二步局部减材 0.944782729 mm³，无加材。反向顺序、固定 R0.5→R0.4、0.1/1/10 尺度与刚体变换、旧 `selected-only` 范围拒绝、排除冲突和过期引用均有定向回归。页面单标签完成 UI 预览／应用、API 改参、撤销／重做与拒绝后 revision 保持；新版页面 API 的预览回执和 `getState().previewScope` 均读回原选边 `[5]`、扩展边 `[13,9]`，取消不增加修订。75 项定向测试通过，1 个可选 STEP 样例跳过；`npm run build` 和发布检查通过。A1 的此标准案例闭环；A2 通用局部面域／材料与原矩阵仍待完成，整体升级未完成。本轮改动尚未提交或部署，编辑前备份在 `agent/backups/20260930-092152/`。

工作区：`F:/Project/WebCAD`；本轮基线 HEAD `7239eaaff6c05a40954a8a4e83e0c5b9e9ca94b3`，远端 main 与开发分支均已到此提交；本地 main 指针仍是 `79d5dc1`。实际 WASM 为 `replicad-opencascadejs@1.1.0`，SHA-256 `4c9f22e9f3828dca6f3c95405934cdbe624e593c35266f47f392ab337478dbde`。此基线之后已有上文 A1 本地源码改动，尚未提交、推送或部署。前次文档备份在 `agent/backups/20260930-090424/`。

A1 之前的基线复现：相邻边正式流程失败为 `SCOPE_EXPANSION_REQUIRED`，直接 native 对照为有效单实体候选；五文件定向测试 46 通过，旧模式专项 8 通过、1 可选跳过。结果保存在 `agent/output/rounding-next-session-20260930/`。旧错误文案断言的修正已验证通过，不与 A1 几何结果混算。下文未标明 A1 的浏览器与几何数据均为 2026-09-29 的历史证据；完整测试及真实磁盘写入仍未重跑。

| 阶段／必做能力 | 依赖 | 当前实现 | 待做代码及验收案例 | 状态／阻碍 |
| --- | --- | --- | --- | --- |
| T0 基线 | 无 | 原生恒 R 凸／凹边及 WASM 固定 | 保持旧语义与同 SHA 回归 | passed |
| T1 正式恒 R | T0 | `src/modeling/rounding/`、Worker、UI/API、预览／提交／回滚；合成凸／凹边和浏览器通过；A1 标准相邻边连续加工及相切链传播通过 | A2 通用半径、接缝、实际面域及局部材料生产验证；完整原矩阵 | partial；A1 标准案例闭环，整体仍待验收 |
| T2 严格变 R | T1；多段链另需累计弧长映射 | 原生 Simulate 后 `SetLaw` 可读回但 Build 重置；独立解析路线已实现单一直边和共线多段链 2–16 个线性站点；不等长 7+13 mm 链、正反方向、跨分界截面、凹边及刚体变换真实 WASM 通过；页面 API 边链预览/提交、历史及单边／共线双段链工程/STEP 资源跨会话读回通过 | A6 非共线相切链、smooth 插值、闭合一致性、共享 elementary law 去重冲突、端点/交汇；原生持久 law 候选尚未实现；实际磁盘写入未测 | partial：单直边与共线链 linear 子能力有证据；原生临时注入路线 blocked，整阶段未通过 |
| T3 解析恒 R | T1 | 正式两平面直边凸／凹精确圆弧棱柱布尔、闭合圆边和有径向平面端面的开放圆弧精确回转；尺度 0.1/1/10、反向轮廓、60° 与刚体变换真实 WASM 测试；同边 native/analytic 正向对照；序列化副本受控同域整理后唯一映射原边的 native 候选 | 混合直线／圆弧连续轮廓、带孔面及原矩阵；尚未取得 native 原本失败而整理后成功的实际案例 | partial |
| T4 宽圆润 | T1；T3 可复用构造／验证 | 正式两平面直边三次 Bézier 宽度构造，凸／凹及对称／非对称；闭合圆边和有径向平面端面的开放圆弧回转；回读宽度及接缝抽样 G1，尺度／反向／刚体变换真实 WASM 和页面 API 测试 | 四边界约束补面与局部替面、混合曲线轮廓、严格接顺端点及原矩阵 | partial |
| T5 端点／交汇 | 各几何模式 | T1 自然端点 | A5 相切延续、已有终止面、区域内收口、三边交汇和严格接缝验收；当前契约只有 standard/natural，尚无 smooth-region | partial；strict 端部未实施，不是被 T2 阻塞 |
| T6 整件／历史／恢复 | T1；各模式独立接入 | 恒 R 整件排除源边与真实截面；宽度和排除边从上游重建；单直边变 R 三站点历史改参／撤销／重做与工程新会话重开、STEP 新会话导入；宽圆润工程／STEP 新会话回读；计算中 Esc 真正中止 Worker、由原工程恢复，取消回执为 no_change，恢复后重新预览并提交真实圆角；旧代次预览提交被拒而新代次提交真实 R1.2 | 多链原子性、180 秒超时恢复 | partial |
| T7 UI/API／文档 | 每种已验收几何能力 | 恒 R／宽度／单直边及共线多段线性变 R、整件排除的工具卡、schema、UI、页面 API；内置浏览器 UI 恒 R／宽度／变 R、API 宽度／变 R 分别实测 | 更多模式同步、同一源边的 UI/API 精确形状等价、Chrome 侧栏专项 | partial |
| T8 总矩阵／文件 | T0–T7 | 当前定向真实 WASM 测试、工程/STEP 字节跨会话回读、`npm run build` 与 release gate 通过 | 原 24/13/9 案例逐项记录；全仓测试存在其他模块失败／长运行 | partial |

T2 新增共线多段链实测：通用线弧轮廓挤出体的源边按当前 BRep 查询得 7+13 mm 两段，整链累计长度 20 mm；浏览器 API 用 `edges:2,5` 预览、提交，revision 2→3 且渲染同步，有效单一闭合实体。跨原始分段 s=6.9/7.1 mm 的期望 R=0.845/0.855 mm，真实 17 点法截面实测 0.8449996783/0.8549996759 mm；s=2/10/18 实测 0.5999997380/0.9999996405/1.3999995430 mm。最大半径误差 4.81e-7 mm、拟合残差 2.88e-7 mm、抽样 G1 角差 0°。Node 正向另覆盖反向 law、反向源边顺序和上游历史改参一致性；连接但转角的链被拒且源体积不变。页面历史改参至三站点 (0.5,1.1,1.5 mm) 后体积 1594.4632724430166 mm³，2,964 字节工程跨会话重开保留两条边及 20 mm 累计规律，26,374 字节 STEP 跨会话导入得同一单实体，体积差约 6.8e-13 mm³。磁盘写入未测；页面多边鼠标点选尚未执行，UI 映射通过契约测试；不把这组共线链结果推广至非共线链。详细逐点表见 `agent/output/rounding-browser-acceptance-20260929.json`。

T2 路线区分：原生 `SetLaw` 在 `Simulate` 后生效、在 `Build` 重置，正式模式没有把它冒充通过。正式 `analytic-variable-straight-ruled-v1` 从用户站点直接建立精确圆截面，再在相邻站点间生成规则面和实体；无原生 law 参数，因此其截面记录的 `nativeParameter`／`injectedLawRadiusMm`／`lawRadiusAfterBuildMm` 均为 null。单边 20 mm、R(s)=0.5+0.05s 的真实 WASM 截面：s=2/10/18 mm 期望 0.6/1.0/1.4 mm，实测 0.599999738/0.9999996405/1.399999543 mm；每处对生成过渡面法截线做 17 点圆拟合，固定 1e-5 mm 半径／残差、0.1° 抽样切向门槛均通过。三站点 `s=0,0.4,1` 的 0.5/1.2/1.5 mm、反向、凹边和刚体变换单边也通过。多站点斜率变化处可能存在 C0 分界，尚未作为平滑交汇通过。

IAB 页面实测：变 R 两站点和三站点的 UI 预览／提交及 API 预览／提交；三站点历史中间值 1.2→1.1 mm、撤销／重做；1,785 字节工程在新会话重建，26,638 字节 STEP 在另一新会话导入，单实体、体积差约 2×10⁻¹² mm³。文件均为生成资源后跨会话登记，未验证真实磁盘写入。详情见 `agent/output/rounding-browser-acceptance-20260929.json`。

宽圆润的 1/2 mm 请求在 IAB 页面 API 提交后实际宽度读回仍为 1/2 mm；1,359 字节工程在新会话重建、20,081 字节 STEP 在另一新会话导入，均单实体、显示与修订一致；STEP 体积差约 1.8×10⁻¹² mm³。T3 强制 native 与 analytic 在同一凸边上实测半径／截面残差／体积一致。变 R 另通过 0.1/1/10 尺度的反向三站点、凹边和刚体变换；过大终点 R 到达几何冲突检查且输入实体未改变。

T3/T4 规则开放圆弧新增证据：通用扇形拉伸体的顶面与真实圆柱侧壁构成 90° 圆弧，起止落在两张径向平面。正式解析恒 R 按真实圆弧长度／方向做部分回转，R=0.5 mm 的最终 TORUS 法截面实测 0.5 mm，17 点拟合残差 <1e-14 mm，BRep 有效单实体；宽圆润 A/B=0.5/1 mm，实际宽度同值、接缝抽样最大角误差约 8.5×10⁻⁷°，同样为有效单实体。正反轮廓、0.1/1/10 尺度和刚体变换均通过。IAB 公开 API 另以 `extrude` 扇形体及 `queryGeometry` 的当前上圆弧 3 预览并提交宽圆润：revision 2→3，渲染同步，实测 A/B 仍 0.5/1 mm、有效单实体 195.1723786020794 mm³。`agent/temp/rounding-open-arc-*-probe.mjs` 保留了源拓扑、最初手工回转和正式构造证据。此端面是 `natural` 终止；未声称严格四边界 G1 补面完成。

T6 旧预览专项在 IAB 页面：箱体当前边 8 上先预览 R0.5（generation 1），更新为 R1.2（generation 2），用旧 generation 提交得 `STALE_REFERENCE`、revision 仍 2、仅 1 个源特征且体积仍 1600 mm³；提交 generation 2 得 revision 3、视口同步、单实体体积 1593.8194671058463 mm³。新圆柱两端真实圆弧边经 `queryGeometry` 回读 R=1.2 mm，旧 R0.5 未覆盖新参数。

T3 受控整理专项：在源棱柱的同一直线上保留冗余分段，正式 `unified-native` 内部强制策略从源 BREP 序列化重建副本；`ShapeUpgrade_UnifySameDomain` 以 1e-7 mm／rad 容差把 15 边／7 面整理为 12 边／6 面，双向布尔差体积均为 0，原实体边数／体积不变。原目标边 12 唯一映射为候选边 9 后完成 native 恒 R；最终 R0.5 截面与 17 点拟合残差通过。若用户目标正是被合并的半段边，因作用范围会扩大而拒绝候选。自动策略在原 native 报 `KERNEL_BUILD_FAILED` 后才尝试此候选，随后仍可试解析原件；尚无真实“原 native 失败、整理后成功”的触发样例，不能声称自动救援率。

原方案引用的 `rounding-acceptance-matrix.json` 当前不在 WebCAD 仓库、下载目录或已提供附件内；不能编造原案例 ID 或预填 passed。已向用户请求该文件，同时继续不依赖它的 T2/T3/T4 及闭环工作。矩阵到达后保留原 ID、期望类型和断言逐项记录结果。

证据：`tests/rounding-kernel.test.mjs`、`tests/rounding-history.test.mjs`、`tests/rounding-section-metrics.test.mjs`、`tests/operation-registry.test.mjs`、`agent/output/rounding-browser-acceptance-20260929.json`、`agent/output/rounding-law-lifecycle.json`、`agent/notes/rounding-t2-law-lifecycle.md` 和 `agent/temp/rounding-law-lifecycle-probe.mjs`。A1 之前定向复跑 46/46，旧模式专项另有 8 通过、1 跳过；本轮 A1 定向 75 通过、1 可选跳过（含命令服务 18 项），`npm run build` 与 release gate 通过。完整 `npm test` 的历史结果为 442 项中 434 通过、7 失败、1 跳过，失败包括 `halfLengthPoint` 不收敛、PowerShell 文件权限和旧 UI 布局断言；需在集成节点保存完整失败列表并定向定位，不能把它们都预判为无关或以定向通过覆盖。基线代码已在远端 main；A1 源码及文档是本地未提交改动，不代表整体升级已完成。
