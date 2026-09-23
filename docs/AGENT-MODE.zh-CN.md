# WebCAD Agent 模式

Agent 模式用于只有终端权限、不能直接执行页面 JavaScript 的 AI。它把当前浏览器标签页连接到本机命令桥，建模仍由该页面的 Worker 和同一份工程完成。普通静态页面不自动连接此桥。

## 启动与发现

```powershell
npm run agent
```

构建完成后打开 `http://127.0.0.1:667/agent`。页面底部应显示“Agent 接口已连接”。AI 可先读取：

```powershell
Invoke-RestMethod http://127.0.0.1:667/api/agent
Invoke-RestMethod 'http://127.0.0.1:667/api/agent/docs?doc=start'
Invoke-RestMethod 'http://127.0.0.1:667/api/agent/tools?query=box'
```

这些 HTTP 入口只读，来源与 MCP 工具卡一致，不维护第二套参数表。服务只绑定 `127.0.0.1`，Host/Origin 仍受本机限制。

## JSON CLI

```powershell
npm run agent:cli -- bootstrap --pretty
npm run agent:cli -- docs start --pretty
npm run agent:cli -- sessions --pretty
npm run agent:cli -- state --session <实际会话ID> --pretty
npm run agent:cli -- search "安装板" --pretty
npm run agent:cli -- tool box --pretty
```

只有一个就绪标签页时，`state`、`import`、`open`、`save`、`export` 可自动选择它；有多个就绪标签页时必须传 `--session`。不能缓存 session、revision、body ID 或拓扑编号。

调用任意公开工具时，用 `--args` 传 JSON，复杂内容可放在获授权目录的 JSON 文件中并使用 `@文件`：

```powershell
npm run agent:cli -- call webcad_add_feature --args '{"sessionId":"实际ID","expectedRevision":1,"op":"box","params":{"width":12,"depth":8,"height":3},"name":"板件"}' --pretty
npm run agent:cli -- call webcad_execute_v2 --args @agent/temp/request.json --pretty
```

写操作前先读最新 state。严格 v2 写入须从当前工具卡取得 `opVersion` 与 `schemaHash`；不猜 revision，不在结果不确定时直接重试。

## 无文件选择器流程

以下命令读取明确路径中的真实字节，使用受限本机上传/下载能力，核对大小与 SHA-256，并拒绝覆盖已有目标文件：

```powershell
npm run agent:cli -- upload C:\authorized\part.step --pretty
npm run agent:cli -- import C:\authorized\part.step --session <实际ID> --pretty
npm run agent:cli -- open C:\authorized\design.webcad --session <实际ID> --pretty
npm run agent:cli -- save C:\authorized\output --name design.webcad --session <实际ID> --pretty
npm run agent:cli -- export step C:\authorized\output --name design.step --session <实际ID> --pretty
```

`open` 会替换工程，dirty 工程会被拒绝；`import` 只追加 STEP/BREP/IGES。保存和导出返回 `written` 后才表示客户端完成下载、校验、磁盘写入和回读。`documentSaved:false` 可用于交换格式，不代表写文件失败。

## 退出与普通页面

关闭 Agent 标签页即断开该会话。普通静态发布仍从 `/` 打开，不带 `?agent=1`，也不需要 Node、MCP 或 WebSocket 服务。
