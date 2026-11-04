# WebCAD 整库方法指导 0.3.0

入口[SKILL.md](SKILL.md)→[建模总流程](GUIDE.md)→按任务选分册。目的：让AI判断三维结构怎样构造、遇到问题该查什么和用哪个当前工具；工具卡作为调用依据。

本版系统遍历text-to-cad已安装0.7.19的106文件/14技能组，另盘点本地0.7.14仓库2,895个跟踪文件，扫描928模型源码、265测试模块、107文档的模式。每个技能文件均有采用/不采用理由和WebCAD落点，见[整库审阅](references/full-library-review.md)。源码运行时、二进制及发布文件只做指纹/组件分类，不声称逐行审计或重建所有模型。研究资料不全部塞进模型请求。

18条路线覆盖：构造与编辑、源图复刻、轮廓/工程图、工艺与打印检查、标准件和重复结构、材料/估重、外部交接。按需方法和实际工具卡分开；未支持的CAD/打印/仿真能力明确界定。原版五个页面几何回归保留完整回执，新文档不把它们冒称新工具的执行验收。

```powershell
node webcad-skills/scripts/load.mjs "按源图复刻五金"
node webcad-skills/scripts/load.mjs --route cut-features --branch plain-hole --tools
node webcad-skills/scripts/load.mjs --tool inspectDraft
node webcad-skills/scripts/load.mjs --problem AMBIGUOUS_SELECTION
node webcad-skills/scripts/check.mjs --repo F:/Project/WebCAD
node webcad-skills/tests/routing.test.mjs
node webcad-skills/tests/full-library.test.mjs
node webcad-skills/scripts/check-sources.mjs --installed-root <text-to-cad-installed-root>
```

生成工具快照：scripts/generate-tools.mjs --repo 显式维护目录。变更时检测受影响路线和卡片；完整Schema不截断，超出24,000字符时要求缩小分支。研究库大小与每次加载量分开报告。

开发模型接入：scripts/model-session.mjs支持由调用者提供真实模型、页面工具、独立初始工程、记录器与独立judge；当前仅假适配器管线验证，真实模型A/B、Token和改善率未测。未安装、未接入正式Agent，未修改WebCAD/Services/CadViewer/text-to-cad源代码，未部署或推送。

实际知识文件在G盘，F:/Project/WebCAD/webcad-skills是兼容目录入口。保留原版与编辑前备份供对照/恢复；整库审阅报告在G盘。所有脚本是宿主/开发辅助，不成为产品运行前提。

大卡片可单独--tool读取，省去重复方法正文；完整单卡仍超预算时须显式--max-chars扩大，或在实际宿主直接按当前页面契约读取。不会把Schema截成不完整片段。
