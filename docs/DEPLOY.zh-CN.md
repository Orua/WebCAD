# 一键增量发布

涉及后端和宿主时，先验证 `scripts/build-agent-host.ps1` 的独立程序集及匹配 Services Gateway：本机真实计算、任务/产物、同域免鉴权与跨域授权、原 Agent 任务和正式登录恢复通过后，才可发布同一候选包。Agent 宿主源码位于本仓库 `host/Goldenluck.WebCADHost`；不重建或覆盖生产系统 `Web.dll`。Services 默认同域直连 `/cadservices/api.ashx`。部署清单包含实际有影响的独立 DLL、入口与前端，保留工程、配置、密钥和任务数据；旧计算入口只是无业务程序集依赖的兼容转发。

发布脚本：`scripts/deploy.ps1`（PowerShell 7）。默认预演；传 `-Apply` 才发布。

```powershell
# 代码完成后，一条命令构建并发布本机，即可在 http://localhost/webcad/ 使用。
# 本机发布不需要生产登录、FTP或GitHub，不会上传或推送。
./scripts/deploy.ps1 -Apply -LocalOnly

# 同一个包构建一次；列出本次修改的源码，自动提交并推送 main。
# $session 是现有授权登录会话，不将 Cookie、令牌写入脚本或报告。
./scripts/deploy.ps1 -Apply -SourcePaths src/example.js,public/automation -WorkspaceSession $session

# 已在localhost/webcad验收的构建包直接复用，不再构建。
./scripts/deploy.ps1 -Apply -BuildRoot G:/CAD-Workspace/WebCAD/builds/release-name -SourcePaths src/example.js,public/automation -WorkspaceSession $session

# 只查看变化数量和清单，不修改站点、不提交、不推送。
./scripts/deploy.ps1 -BuildRoot G:/CAD-Workspace/WebCAD/builds/release-name
```

也支持 `-WorkspaceCheckScript <已有认证页面检查脚本>`：脚本读取现有工作台，返回 `url/buildId/pageApiVersion/catalogHash/docsHash/entrySha256`，不刷新用户工程。与 `-WorkspaceSession` 二选一。没有工作台认证能力时发布前直接说明，不先发布再要求补登录。

两个部署位置，一个生产宿主入口：

| 入口 | 用途 |
| --- | --- |
| `http://localhost/webcad/` | 唯一本机发布、使用及针对性验收入口 |
| `https://goldenfu.cn/webcad/` | 生产静态前端 |
| `https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx` | 生产宿主工作台，嵌入上一项前端 |

本机流程：读取localhost/webcad实际 IIS 映射 → 构建一次或复用包 → 备份并只更新变化文件 → 一轮身份和入口脚本核对 → 可直接使用并收尾。实际工具行为只在此做与修改相关的一轮检查；HTTP核对不替代几何或交互验收。

已授权的生产流程：复用同一个包 → 比较生产清单 SHA256 → 本机增量就绪并核对一次 → 提交指定源码并推送 main → 只上传变化文件到服务器 `/GOLDENLUCK/webcad/` → 一轮必要版本及宿主嵌入关系核对 → 写报告后结束。本机不再维护独立端口站点，也没有第二套本机镜像。17674停止维护；旧文件和备份不作为发布目标，不在本次脚本变更中删除用户数据或历史IIS配置。

本机和生产两个静态入口各核对一次 `buildId/pageApiVersion/catalogHash/docsHash/entrySha256`；工作台通过实际认证 HTTP 配置确认嵌入地址，复用该地址已核对的身份，或使用认证页面检查回执。工作台不重复部署前端，也不会重复下载同一入口来凑验证轮数。

只有哈希不同或部署清单未收录的文件上传；不存在清理远端目录、全站镜像删除或全量强制重传。资源先传、发现清单其次、HTML 最后。保留旧哈希资源，避免已打开页面失效。配置、工程、上传内容、任务数据均不属于前端发布包。生产备份在替换本机文件之前完成，优先复用哈希与上次发布一致的本机旧文件，减少FTP下载；无法证明一致时才从远端备份。

源码和包指纹不匹配、已有暂存修改、源码范围不完整、生产版本在准备阶段改变或任一必要核对失败时明确停止。失败报告保留实际已上传文件和推送状态；下次运行重新按部署清单计算差异，不使用跨版本的“已上传”标记。不会自动回滚覆盖其他发布。

报告和备份分别在 `G:/CAD-Workspace/WebCAD/reports/deploy-*/`、`G:/CAD-Workspace/WebCAD/backups/deploy-*/`。生产共享 `.deploy-manifest.json` 只合并本次文件条目，保留其他应用的条目。

本脚本负责前端及其生成的公共 API 文档，Services/Logo/Native 无改动时不编译后端。检测到后端源码变更会停止：后端仍须按 `scripts/package-iis-dll.ps1` 生成匹配 DLL/Native 产物并按现有 Services 流程发布，不能将前端同步冒充后端发布完成。跨仓宿主源码同样按各自仓库范围提交，不在此脚本盲目提交其他仓库。
