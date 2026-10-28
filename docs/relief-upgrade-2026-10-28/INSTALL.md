# 浮雕生产升级安装说明（2026-10-28）

本包对应 WebCAD `main` 上的浮雕生产修复。只更新浏览器前端与本仓库 `services/WebCADServices` 中的浮雕拟合源码。不要改 `F:\WebCADServices-local`，也不要另建 Services 仓库。

## 包含什么

- 大体积 `POST /v1/compute/jobs` 不再固定 30 秒中止。请求体 ≥256 KiB 时，提交时限至少等于计算设置里的服务器等待时间（默认 180 秒），并随体积上浮，上限 900 秒。小请求（LOGO 等）为 60 秒。轮询、能力查询、取消、恢复为 60–120 秒。
- 超时或断线时，界面和 `getDebugReport` 给出 `SERVICES_CONNECTION_UNKNOWN`，以及操作名、请求键、已等待毫秒、时限、请求体级别，并写明先用 `getServicesRequest` 查询，勿盲目重算。
- 纯图像浮雕发给 Services 的高度源按控制网边长打包（默认最长 513，不再把 1025² 网格整段塞进作业）。候选拟合可以在可用控制网上提前结束；体积核对抽样有上限。残差大于 0.05 mm 仍给出可应用候选，不自动拒绝。
- 浮雕导入默认只留图片、尺寸、方向和预览。其余收在「高级配置」。

## 安装（有生产发布授权时）

1. 在维护目录 `F:\Project\WebCAD` 拉取本 PR 合并后的 `main`。保留本地未提交修改，不要 `reset` / `checkout` 覆盖。
2. 读取本机 IIS 上 `http://localhost/webcad/` 的实际物理路径（当前约定 `F:/Project/Goldenluck/Web/webcad`）。备份将被替换的程序文件。不要动工程、Cookie、自定义颜色和后端任务数据。
3. 在维护目录执行已有构建（`npm run build`）。用同一个构建包增量发布到 `http://localhost/webcad/`。先在本机打开一张浮雕，确认下面的验收项。
4. 本机通过后，把同一构建包的变化文件上传到 `https://goldenfu.cn/webcad/`。工作台 `https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx` 只核对它嵌入的是这次 WebCAD，不要另传一套前端。
5. 从各入口的 HTTP 响应核对 `buildId`、`pageApiVersion`、`catalogHash`、`docsHash` 和入口脚本哈希一致。对不上的入口写进 G 盘部署报告，不要宣称全部完成。
6. 若本次包含 Native 浮雕改动，已配置的 Services 也要换上同一次发布的对应产物，并保持协议与能力版本一致。只改前端时，在报告里写明后端无影响。环境地址、密钥和数据目录保持原样。

本机也可以只做 `scripts/deploy.ps1 -Apply -LocalOnly`：只发布本机，不上传、不推送。

## 不要做的事

- 不要新建 IIS 站点、Vite 预览站或 17674/17685/17686 端口。
- 不要覆盖用户未保存的页面工程。
- 不要因为拟合残差大于 0.05 mm 就阻断应用。效果不好用撤销。
