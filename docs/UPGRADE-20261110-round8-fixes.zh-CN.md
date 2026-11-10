# Round 7/8 程序缺陷修复升级说明（2026-11-10）

- 页面 API：`1.65.0`。
- 基线：`main` @ `106923bd`（pageApiVersion `1.64.0`）。
- 分支：`fix/r8-all`，未推送、未合并、未部署。

这一轮按 Round 7/8 的整合修复计划（CONSOLIDATED-FIX-PLAN）修改页面和浏览器内核。没有重建 F-22，也没有改开发机上的工作副本。

**`services/**` 没有修改。** 不需要替换 WebCADServices，也不需要跑 .NET 构建。

## 已修复 / 部分修复

| 批次 | 编号 | 状态 | 要点 |
|---|---|---|---|
| 1A-5 | 截面瘦身 | done | `planeSection` 的 `result:'edges'\|'wire'\|'polyline'` 和 `samples`（4–512，默认 64）。`queryGeometry` 加了 `fields` / `includeSpline` 投影，回执带 `itemProjection`。 |
| 1B | R7-017 | done | 重建有硬超时 `max(180s, 3×localTimeoutMs)`，上限 900s。超时报 `KERNEL_TIMEOUT` / `not_committed`，并重启 Worker。`validateRoundingResult` 保留。 |
| 1C | R7-001/016、R8-004 | done | 恢复改为按文档建索引（`recovery-index:`），不再用 `recovery:latest` 盲恢复。URL 里的文档 id 在第一次刷新前就记下来；选「新建」只写 dismissed 标记，不删除提示；URL 匹配时对话框默认「恢复」。 |
| D | R7-002/021、R8-002 | done | 恢复后的重建保留 instanceId 和已保存 revision，`getState().restoredFrom` 可读。`files.new({context,name?})` 返回 `name`。 |
| D | R7-020 | partial | `files.save` 回执增加 `documentNameChanged:false`、`dirtyCleared:false`、`durability`、`next`。未确认的保存不清 dirty。`art_*` 资源仍不写入 IDB。 |
| E | R7-005（=R6-019，含 union/intersect） | done | 布尔结果名统一走 `src/boolean-naming.js`。union / cut / intersect 有 `renameTarget` 选项。 |
| E | R7-009、R7-013 | done | 延迟测量字段不再进入 revisionStamp。已删除实体的隐藏 id 在重建时清理（`src/hidden-ids.js`）。 |
| F | R7-004、R7-008、R7-012 | done | `setCamera({position,target,up})` 默认 Z-up，`up:'inherit'` 保留当前滚转。`setView({header:boolean})`。方向约定写进文档。 |
| F | R7-003 | partial | `capture({detail:'settled'\|'current'})`，回执带 `renderMs` 和 `detailSource`，慢时警告 `CAPTURE_SLOW`。同步渲染本身不能被抢占。 |
| G | R7-014 | partial | `body.appearance` 支持 `roughness`（design 饰面、按体、随工程保存）。光照偏好仍存在 cookie 里，没有随工程保存。 |
| G | R7-010 | partial | 金属光照仍是全场的，但会报告出来：`display.metalRendering.sceneLighting` 和 `designBodiesUnderMetalLighting`，并发警告 `METAL_LIGHTING_GLOBAL`。 |
| G | R7-007 | partial（文档） | 没有玻璃/透明饰面。材质卡已经写清楚这一点。 |
| H | R7-011 | done（仅警告） | `loftDegree` 默认仍是 8。外鼓超出截面包络时发 `LOFT_ENVELOPE_EXCEEDED`（`loftReport.envelopeWarning`，同时进入 getState warnings），建议改用 2。 |
| H | R7-015 | done | `extrude.holes` 一步生成通孔板。孔不合法时报 `EXTRUDE_HOLE_INVALID`，不出近似件。 |
| H | R8-001 | done | `measureRelation` 新增 `planeSample`（截面环数、长度、面积、宽高）和 `rayHits`（射线精确交点）。 |
| H | R8-003 | deferred | ThruSections 导轨 / G1 仍诚实失败。 |

以下项没有重复修改：R6-001/002/003/004/005/006/017/021/024/025/031。重命名仍只用 `document.rename`。内核导出遇到未知 id 时报错是正确行为，没有改。

新错误码：

- `CAPTURE_SLOW`
- `METAL_LIGHTING_GLOBAL`
- `LOFT_ENVELOPE_EXCEEDED`
- `EXTRUDE_HOLE_INVALID`

这些错误码都登记在 `contracts/error-recovery-codes.json`。

## 行为变化（调用方须知）

- 自定义相机不传 `up` 时默认 Z-up。以前会沿用旧的滚转。要保留滚转，请传 `up:'inherit'`。
- 旧工程里的布尔体重开后名称可能改变。需要旧命名时，用 `renameTarget` 恢复。
- 重建超过硬超时（默认 180s）会被终止，并重启 Worker。确实很长的重建，请调大 `setServices` 的 `localTimeoutMs`（硬超时为它的 3 倍，上限 900s）。
- 撤销 / 重做 / 历史路径仍走 `restoring:true`，会让 revision 加 1。只有恢复路径保留已保存的 revision。

## 构建

```
npm ci
npm test
npm run build
```

`docs/compliance/source-license-map.json` 中 `antique-procedural/src/procedural-antique-atlas.js` 的 sha256 是按 CRLF 字节登记的。在 LF 检出（Linux）上，`npm run build` 会报 `Reviewed source changed`。这是已有问题，与本轮无关。本轮构建时临时把该文件转成 CRLF，构建后已还原。

当前契约（与 `public/automation/manifest.json` 一致）：

- `pageApiVersion`: `1.65.0`
- `catalogHash`: `sha256:3946f7f0984275ec52aa25e8ad810dcd9c51b99189c4cfcd0117027226f34fef`
- `docsHash`: `sha256:07b90e85414990c6e01410c26d4bf9c2eb4eefccbc88b2dd378b799c894cc323`

## 部署后现场复测（小模型，不用 F-22 密集截面）

1. 在 10×10 的盒子上调用 `planeSection` 加 `result:'polyline'` 和 `samples:16`。回执应该很小。`queryGeometry` 加 `fields` 后只返回所列字段。
2. 新建工程后关闭页面，再用 URL 打开另一份文档。不应弹出别的工程的恢复，并且 URL 不被清掉。
3. 调用 `files.new({name:'x'})`，回执应带 name。`files.save` 回执的 `dirtyCleared` 为 false，直到确认保存。
4. 做两个盒子的 `union`，结果名应符合 `resultDisplayNames`。
5. 调用 `setView({camera:{position,target}})`，读回的 up 应为 [0,0,1]。`header:false` 应隐藏页头。
6. design 体设 `roughness:0.2` 后保存，再重开，值应保留。在金属光照下应带 `METAL_LIGHTING_GLOBAL`。
7. 5 站剧烈变宽的 sections 放样：degree 8 时应有 `LOFT_ENVELOPE_EXCEEDED`，degree 2 时没有。
8. `extrude` 带两个孔，应一步出通孔板。孔碰到外框时报 `EXTRUDE_HOLE_INVALID`。
9. 在盒子上调用 `measureRelation` 的 `planeSample`，应返回 1 个环，面积等于截面面积。`rayHits` 穿过盒子应有 2 个交点。
