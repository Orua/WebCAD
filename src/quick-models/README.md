# 快捷模型目录

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
