# 整个text-to-cad库：审阅与WebCAD落点

已安装0.7.19：106个插件文件，其中92个技能文件，14个技能组全部进入方法处置表。源码仓库0.7.14：2,895个跟踪文件逐项指纹/分组，928个模型源码、265个测试模块做AST模式扫描，107个文档做主题扫描；不声称逐行审计内核或实跑所有样例。两个版本分开，接口以WebCAD当前卡为准。

|技能组|文件数|采用方法的落点|边界|
|---|---:|---|---|
|cad|16|GUIDE.md、methods/construction-choice.md、methods/feature-order.md、methods/verification.md、problems/diagnosis.md|Model choice, datums, artifacts, inspection, repair; do not port cadgen runtime or motion APIs|
|dxf|4|methods/profiles-and-drawings.md|Closedness, layers/intent, analytic curves, actual serialized geometry; WebCAD profile/drawing APIs only|
|engineering-drawing|4|methods/profiles-and-drawings.md|Geometric projection and dimension provenance; use current createDrawing/exportDrawing and limits|
|dfm|8|methods/process-aware-modeling.md|CNC/sheet/mold reasoning and fact/threshold separation; no factory defaults or imported measurement engine|
|dfam-check|6|methods/process-aware-modeling.md|Mesh units, per-body and partial-report semantics; expose only actual WebCAD checks|
|gcode|4|methods/external-handoff.md、methods/parts-and-repetition.md|Printer/material/preset identity and resolved effective values; no built-in slicer claimed|
|bambu-labs|3|methods/external-handoff.md|File/type and human app execution boundaries; no printer API or access-code collection|
|sendcutsend|5|methods/process-aware-modeling.md、methods/external-handoff.md|Exact specification identity, local geometry, trustworthy comparisons; no vendor-specific thresholds/orders inherited|
|step-parts|5|methods/parts-and-repetition.md|Exact model selection, aliases, download integrity, origin; search/download requires actual host tools|
|urdf|10|methods/representations-units-and-mass.md、methods/selection-and-placement.md|Frames, unit conversions, distinct geometry roles, computed physical values; no URDF validator or dynamics claimed|
|srdf|9|methods/artifacts-and-dependencies.md、methods/representations-units-and-mass.md|Actual object-name tables, cross-file identity, stale dependent semantics, evidence exclusions; no MoveIt/IK claimed|
|sdf|11|methods/representations-units-and-mass.md、methods/external-handoff.md|Explicit frames, assumption ledger, target-consumer and structural/behavioral proof split; no simulator/plugin APIs claimed|
|jindafu-cad|1|methods/source-reconstruction.md、domain/hardware.md|Formal source over visual guess; no external private knowledge copied|
|jindafu-d-buckle|6|methods/source-reconstruction.md、methods/profiles-and-drawings.md、examples/whole-library-cases.md|View correspondence, real section, source-path repair, independent positive/negative geometry tests; ignore stale CLI commands and product-specific sizes|

所有安装文件的具体采用/不采用理由、字节、SHA256和目标文件见source-coverage.json。仓库全量记录在G盘审阅报告，摘要见repository-survey.json。许可证/宿主描述/发布脚本单列，不当作建模方法数量。

整库发现的关键迁移：几何分解与构造→GUIDE；2D层/轮廓/投影与工程图→profiles-and-drawings；源图视图/剖面/轮廓独立验收→source-reconstruction；制造检查及partial不等于0→process-aware-modeling；标准件身份/下载完整性与重复结构→parts-and-repetition；坐标/单位/派生物/质量来源→representations-units-and-mass；切片、打印、供应商、仿真消费端边界→external-handoff。

样例只借鉴构造和依赖表达，不把近似齿形或概念装配升级为标准件/齿轮设计能力；不执行新安装、打印、上传、下单、机器人插件或另一个CAD服务。内置脚本只研究方法和误差，不作为WebCAD产品依赖。

本机jindafu技能带内部样例和旧命令。只迁移证据/语义/验证方法，不复制私有图纸、产品数值、旧cadgen命令或把本机定制伪称上游通用规范。
