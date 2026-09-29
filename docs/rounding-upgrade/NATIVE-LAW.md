> 原生 law 生命周期研究记录。这里的 `agent/` 路径是原机器本地探针与输出，未随公开仓库提交。

# T2 原生半径规律生命周期：2026-09-29

## 固定环境与工作区

- 本轮开始前的 `git status --short` 与完整已跟踪差异保存在 `agent/backups/20260929-141221/`。未执行 reset、checkout、pull、push 或部署。
- 安装包 `replicad-opencascadejs@1.1.0` 的 `package.json` 指向 `ghcr.io/taucad/opencascade.js:canary-ebd263f1-single-threaded`。镜像对应 [taucad/opencascade.js 提交 ebd263f1](https://github.com/taucad/opencascade.js/commit/ebd263f1) 的 [DEPS.json](https://raw.githubusercontent.com/taucad/opencascade.js/ebd263f1/DEPS.json) 锁定 OCCT `V8_0_1`、提交 `b8f597c677811d1f9f4d8a97f5ae2825c0353a42`。这是包构建来源链；安装包没有在 WASM 内嵌可直接读出的 OCCT 版本。
- 本轮实际加载的 `replicad_single.wasm` SHA-256 为 `4c9f22e9f3828dca6f3c95405934cdbe624e593c35266f47f392ab337478dbde`，与 T0/T1 锁定值一致。

## 对应源码机制

1. [ChFi3d_FilBuilder.cxx](https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/b8f597c677811d1f9f4d8a97f5ae2825c0353a42/src/ModelingAlgorithms/TKFillet/ChFi3d/ChFi3d_FilBuilder.cxx) 221–227 把 `SetRadius(Handle<Law_Function>, IC, IinC)` 转给 spine。对应 [ChFiDS_FilSpine.cxx](https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/b8f597c677811d1f9f4d8a97f5ae2825c0353a42/src/ModelingAlgorithms/TKFillet/ChFiDS/ChFiDS_FilSpine.cxx) 220–227 仅创建局部 `Law_Composite`、`Append(C)`，随后清空 `parandrad`；没有把局部 composite 放进 `laws` 或成员。因此旧 `Add(law,edge)` 参数域实验不构成求解器使用该 law 的证据。
2. 同版 `FilSpine::ChangeLaw` 839–853 要求 `SplitDone()`、非恒半径边、可定位到 elementary law。`FilBuilder::SetLaw/GetLaw/GetBounds` 336–372 均调用它。上一轮预模拟 `SetLaw` 的原生异常已提取：`Standard_DomainError: ChFiDS_FilSpine::ChangeLaw : the limits are not up-to-date`。这是 split 尚未完成，不是半径过大。
3. `Simulate(IC)` 走 `PerformSetOfSurf(..., true)`，本轮实测其后 `GetLaw/GetBounds` 可用。紧接着 `SetLaw` 将 `Law_Linear` 真正写进当前 elementary law，立即读回值及一阶导数均正确。
4. [BRepFilletAPI_MakeFillet.cxx](https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/b8f597c677811d1f9f4d8a97f5ae2825c0353a42/src/ModelingAlgorithms/TKFillet/BRepFilletAPI/BRepFilletAPI_MakeFillet.cxx) 343–349 的 `Build` 调用 `myBuilder.Compute()`。同版 [ChFi3d_Builder.cxx](https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/b8f597c677811d1f9f4d8a97f5ae2825c0353a42/src/ModelingAlgorithms/TKFillet/ChFi3d/ChFi3d_Builder.cxx) 211–219 在 `Compute` 开始调用 `Reset()`；879–899 的 `Reset` 调用每条 stripe 的 `Reset`。`ChFiDS_Stripe.cxx` 42–49 调用 spine `Reset()`，而 `FilSpine::Reset` 46–53 清空 `laws`。后续再从 `parandrad` 建立默认平滑 law。运行时 Build 后 `GetLaw` 恢复为 `Law_Interpol`、范围从 [0,20] 扩为 [-10,30]，证明此覆盖点与源码一致。

## 真实 WASM 最小验证

命令：`node agent/temp/rounding-law-lifecycle-probe.mjs`。完整 JSON：`agent/output/rounding-law-lifecycle.json`。通用 20×10×8 箱体原始未圆边，自动按几何寻找；实际轮廓 IC=1、仅来源边 8、长度 20 mm，原生首末顶点的 X=0/20、`Abscissa`=0/20，因此此单边的 `sourceArcLengthMm` 正确映到 `nativeParameter` 的同值；未将求解外延 [-10,30] 重新归一化成源边。

| s=q (mm) | 请求 R | SetLaw 后 R | Build 后 R | 生成过渡面截面 R | 误差 (mm) | 拟合残差 (mm) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 0.600000 | 0.600000 | 0.558857 | 0.558857 | -0.041143 | <1e-6 |
| 10 | 1.000000 | 1.000000 | 1.000000 | 1.000000 | <1e-6 | <1e-6 |
| 18 | 1.400000 | 1.400000 | 1.441143 | 1.441143 | +0.041143 | <1e-6 |

还测了 s=0.1、0.5、5、15、19.5、19.9 mm；其中 s=5/15 的绝对误差约 0.053571 mm。截面直接从唯一生成的非平面过渡面提取，每处 17 点圆拟合及平面残差均 <1e-6 mm。最终 BRep 有效、单实体，输入实体体积仍为 1600 mm³。该有效实体是**默认平滑规律**的结果，不能当作线性变 R 正向通过。`Simulate` 本身没有作为提交结果。

## 准确阻塞与依赖

- 状态分类：单边弧长映射已证实；模拟后注入成功；**Build 的 reset 清掉临时替换**。因此不是参数映射错，也不是求解器已使用用户 law 后仍算不出几何。当前直接线性 law 的端外延仍有独立风险：如果需要延伸到 -10 mm，朴素外推为 R=0；本轮未用该风险解释 Build 后回到旧 law。
- 要让正式 Build 使用用户 law，需要锁定 OCCT 上的小范围原生补丁或额外构造入口，使 law 作为持久输入在 `Compute/Reset` 后重放，且再验证端外延正值与 C1 延伸。现有 JS 绑定已经暴露 `SetLaw`；仅增加同名绑定不能解决 reset。未修改或重建生产 WASM。
- **依赖 T2 law：**严格线性变 R、其多段／闭合链、变 R 历史与 UI/API 开放、变 R 端点验收。
- **仅依赖已通过 T1：**T3 的恒 R 等价拓扑整理与解析备用构造、T4 宽度驱动过渡、恒 R 整件范围与历史、通用 BRep 截面测量器。T3/T4 不能因 T2 阻塞被标成已完成。
- 本轮已独立完成 `tests/helpers/rounding-section-metrics.mjs` 的过渡面直接截面、17 点圆拟合和残差测量；真实 WASM 定向测试通过，供 T3/T4 的几何验收复用。T3/T4 的构造算法尚未实施。
