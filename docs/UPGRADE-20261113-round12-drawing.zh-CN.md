# 升级说明 1.70.0 — 作图压测修复（Round12）

- 日期：2026-11-13
- 分支：`fix/r12-drawing`
- 基于 main 1.69.0（`f35c6b13`）。pageApiVersion 1.70.0。
- 本说明不授权生产发布。合并与部署留到额度约剩 5–10% 的收尾阶段。

## 修复

- **D-01** 圆角矩形被误判自交：四分之一圆弧改为由精确圆心构造；端点重合容差改为 `max(1e-6, 1e-9·坐标尺度)`，与轮廓编辑的 `near` 对齐，避免平移原点后 1e-7 误报，同时仍能抓住真正的中段相交。
- **V-01** 无单位的 SVG `width="40"` 会在看到 `targetWidthMm` 之前抛错。无单位宽高现视为 viewBox 单位，并遵守目标宽度。
- **Q-01** 无筛选列出面/边时默认 `requireUnique:false`、`limit` 100；带筛选仍默认唯一。未知 `fields`（如 `convexity`、`length`）改为拒绝并列出合法字段。唯一失败时若还有剩余项会返回 `nextCursor`。
- **W-01** 提交回执不再把其他实体上遗留的 `UNION_NOT_FUSED` 算到本次阵列/布尔上。`getState().warnings` 仍汇总当前文档全部警告，并带 `bodyId`。
- **L-09** `fit:true` 本来就不含地坪网格，只框可见实体。文档写明：远处还有对象时近处会显得很小，只需对目标件使用 `selectedIds` 与 `temporaryDisplay:"selectedOnly"`。
- **F-01** `files.save` 仍然只在页面内存生成文件，`dirtyCleared:false`。`files.new` 增加可选 `unsaved:"fail"|"discard"`（省略为 fail），错误信息说明需 `save → write/download → confirmWritten`。
- **P-01** 不改工程图性能。文档注明带螺纹或大量隐藏线的零件可能需要数分钟，应等待同一请求返回。

## 测试

契约检查、profile / SVG / queryGeometry / files / command-service 回归，以及 portable / contracts 组。
