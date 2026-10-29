# 牌仔（牌子／方牌）

快捷模型 → 底片 → 牌仔（牌子／方牌）。独立精确实体脚本为 `build.js`，字段和工具说明来自 `definition.js`，与当前快捷工具共用预览、创建、历史编辑、撤销和保存流程，固定在本地 WASM 执行。

所有参数单位为 mm：长 `length` 沿 X，宽 `width` 沿 Y，厚 `thickness` 沿 Z；XY 居中、反面 Z=0。`cornerRadius` 控制平面外轮廓四角，0 为直角矩形，最大为短边的一半。`frontChamfer` 控制正面 Z=厚度的周边，`backChamfer` 控制反面 Z=0 的周边，都是 45° 等距倒角；分别填 0 关闭，可单面、双面或两面不同尺寸。两面倒角之和必须小于厚度，每面倒角小于短边的一半。无孔、柱或文字。

API：读取 `getTool({id:'template.rectBadge'})`，通过 `run` 的 `add` 步骤执行 `op:'quickModel'`、`params:{kind:'rectBadge',length:40,width:20,cornerRadius:2,thickness:3,frontChamfer:0.5,backChamfer:0.5}`。默认锚点为底面中心；测量和编辑沿用通用 `measure` 与 `feature.edit`。

缩略图和尺寸图由此默认实体预生成；运行时不启动缩略图几何计算。针对性检查：`node tests/rect-badge.test.mjs`。
