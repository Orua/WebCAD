# 参考方法与WebCAD改写依据

本版深入读取已安装earthtojake/text-to-cad 0.7.19的CAD技能及以下五篇原始参考。按方法重新组织中文内容，没有安装其cadgen/Viewer，也不把build123d函数当WebCAD工具。版本/文件哈希在source-fingerprints.json；这是离线固定版本依据，不声称是上游最新。

|原始参考/方法|本库改写位置|WebCAD差异与不迁移内容|
|---|---|---|
|cad-brief：区分复刻/灵感、比例、图纸视图、约束和未知|methods/brief-and-datums.md|图纸仍只读；不靠文件名推导真实尺寸；输入进入页面计划，不生成Python作为产品前提|
|build123d-modeling：以控制尺寸选构造，材料连续与分体，工序可变|methods/construction-choice.md、feature-order.md、各workflow|闭合轮廓/旋转/扫掠/放样映射真实profile*；不用build123d/OCP调用，也不将所有零件套模板|
|build123d-modeling：按几何选边、改形重新识别、基准与共面风险|methods/selection-and-placement.md、problems/diagnosis.md|用queryGeometry和revision/instance绑定代替scene.resolve与Python句柄；不承诺持久拓扑命名|
|inspection-and-validation：包围盒不代表局部尺寸、孔位和配合需对应几何、实际保存结果检查|methods/verification.md|measure/queryGeometry/inspect*能证明哪些就报哪些；没有暴露的BRepCheck、自交全检不能迁移为“已支持”|
|repair-loop：定位首个错误、保留规格、检查修复影响、未知结果|problems/diagnosis.md、workflows/editing.md|WebCAD用页面回执、幂等键、progress和最后提交状态；不使用cadgen doctor/store/daemon命令|
|positioning：功能基准、明确旋转/平移、配合关系检查|workflows/placement.md|使用参考锚点/transform/planAlignment；不导入原生joint或运动学能力|

Text-to-cad上游：https://github.com/earthtojake/text-to-cad ，MIT。具体许可适用于其内容；本库的中文方法是结合当前WebCAD架构的重新表达。若后续复制原文/代码须保留版权与MIT许可。工厂数值标准未在本轮获取，不从该项目推导。

WebCAD事实依据：PROJECT.md；src/page-api-docs.js:getTool/readDocs；src/operation-registry.js:normalizeOperationParams；src/ui-api-coverage.js:UI_API_ROUTES；src/agent/host-adapter.js；contracts/services/v1/execution-routing.json。正式模型请求端仍未接入，开发加载器只演示同一权威知识如何传给调用者。

0.2.1新增六篇参考的适用章节审阅，以及运动学/动画的范围筛查，详见reference-coverage.md；来源哈希同步更新。

0.3.0：本文件保留最初CAD方法的具体转换记录；完整范围已扩大到14技能组和全部安装文件，以full-library-review.md和source-coverage.json为准。
