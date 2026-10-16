# 快捷模型目录

每个 `definition.js` 应声明稳定的 `defaultInsertionAnchor`（`model-origin`、`bottom-center` 或 `bounds-center`）。未声明的既有模板目前按 `model-origin` 兼容。工具卡 `template.*.placementPolicy.defaultInsertionAnchor` 会暴露该规则。改变模板参数时保持来源局部坐标和基点定义稳定；若尺寸变化导致已命名来源点移动，应在历史重建中重算该点，无法证明旧锚点映射时标记过期。不要为通过定位测试暗中把所有模板居中。

每个快捷模型有一个独立目录，目录名就是持久的 `kind`。已保存工程和页面 API 都依赖这个值，不要随显示名称一起改名。

目录内容：

| 文件 | 用途 |
| --- | --- |
| `definition.js` | 中文/英文名称与说明、默认参数、字段名称、单位和输入范围 |
| `icon.svg` | 选择器中名称旁的简易图标 |
| `build.js` | 输入参数和 CAD 内核，生成精确几何；失败时抛出明确错误 |
| `index.js` | 连接定义、图标和建模函数 |

在 [catalog.js](catalog.js) 中导入目录，并在 `entries` 有序列表中加入模型。列表顺序就是界面显示顺序；把 `kind` 加入 `hiddenFromPicker` 可从选择器隐藏，但旧工程仍可打开。不要删除或改动已有工程使用的 `kind`。`quick-models.js` 和 `quick-model-icons.js` 是旧导入路径的兼容入口。

现有模型的 `build.js` 大多调用 [legacy-geometry.js](legacy-geometry.js) 或 `hardware-templates.js` 中的共享几何实现，以保持既有工程的形状和参数含义。新增模型可以像 [fourHolePlate/build.js](fourHolePlate/build.js) 一样，在自己的目录中直接实现建模逻辑。不要把运行任意用户上传的 JavaScript 当作插件机制；WebCAD 是静态页面，新增代码需构建后发布。

添加模型时，保持默认参数和字段逐项对应，给每个参数标明毫米、角度或其他单位，并说明几何限制。构建会把同一份定义载入界面、AI 工具卡和 Worker；用一个实际参数实例确认生成实体、尺寸与显示，再发布。不要仅凭目录存在就声称模型可用或代表某个 IGS 产品。

安装结构快捷入口：`twoPieceEyelet` 是双件薄壁翻边鸡眼；`frameEyelet` 是圆/圆角方形安装面框、恒壁厚颈口、对称柱和普通孔，可零颈口/零柱作背片；`uStrapClip` 是恒厚开口U夹、不同高前后片及后片普通孔。后两者一次创建一个可编辑实体，真实螺纹、锥口、三维边圆角和饰面须另按原图加工；封闭帽套不能套U夹。AI读单张 `template.<kind>` 和 `api.quick-installation`，用 `op:quickModel`、`params.kind` 创建。


2026-10-16 固定工具目录：运行时只接受参数及显示顺序；新增/改写/导入脚本不再开放。旧工程已冻结的脚本仍可重建。oChain/twistedChain/groundChain 共用 chain-models.js，扭链有限构造数据 chain-source.js 来自只读 NL.stp；ironFoot 由同仓 iron-foot.js 精确生成三种源件结构。工具说明见公开 api.quick-chains。

缩略图由工具作者预生成：先运行 `node scripts/generate-quick-model-previews.mjs <G盘中间目录>`，再运行 `python scripts/render-quick-model-previews.py <中间目录> public/quick-model-previews src/quick-models/preview-assets.js`（仅作者环境需 vtk/Pillow；发布与正常构建无此依赖）。提交工具所需的静态图片及 manifest，不提交中间网格。发布门验证51种工具的默认参数、图片覆盖、PNG签名和SHA-256。丝筒使用真实内核边线和半透明实体；尺寸图与缩略图都来自相同默认几何，非运行时Worker计算。修改默认参数必须重生成相关图片。
