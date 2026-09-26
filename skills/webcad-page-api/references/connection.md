# 本地 Agent 包与页面连接

页面部署根地址记为 `BaseUrl`，例如 `http://localhost:17674/`；子路径部署需保留完整根路径。网页上的 `automation/agent-start.html` 是给人的入口，`automation/agent-start.json` 是给 Agent 的机器入口，`automation/routes.json` 来自实际 UI/API 映射。安装包仅帮助宿主发现和使用工具，不会给没有脚本权限的宿主增加权限。

## 安装和更新

下载页面的 `automation/install-agent.ps1`，用自己的工具查看脚本后显式执行。Windows PowerShell 5.1 与 PowerShell 7 均可：

```powershell
& .\install-agent.ps1 -BaseUrl 'http://localhost:17674/'
# 或安装到明确指定的隔离目录
& .\install-agent.ps1 -BaseUrl 'http://localhost:17674/' -Destination 'D:\AgentPackages\webcad-page-api'
# 若当前 Windows 执行策略阻止脚本，用一次性子进程运行；不会修改系统或用户策略
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-agent.ps1 -BaseUrl 'http://localhost:17674/'
```

默认目录为 `$env:USERPROFILE/.codex/skills/webcad-page-api`。安装器只下载有限清单中的四个文件（skill、连接说明、客户端脚本、实际操作路由），逐个验证 SHA-256 后才更换目录。既有包先保存到父目录的 `.agent-backups/webcad-page-api-时间戳-唯一编号` 容器内，不在 skills 根目录直接创建另一份同名技能；重复安装安全，下载或哈希失败不改变既有包。`.agent-kit.json` 记录安装来源、版本和哈希。安装器不修改执行策略、不自动安装浏览器扩展、不启动后台进程；网页不会自动运行它。新安装的技能在宿主重新发现本地技能后可用。

保留需要的个人文件应在安装前放到包外；更新按清单替换整个包，旧包的完整内容仍在备份目录。四个文件中仅按需读取路由/引用，不把完整知识库放进模型上下文。需要离线静态契约缓存时另下载 `automation/index.json` 与 `automation/tool-library.mjs`；不缓存实体编号、会话或拓扑快照。

## 核实执行通道

先绑定用户指定的当前 WebCAD 标签页，查看宿主能力和相应工具文档。只有具备已授权的页面脚本/CDP 通道时才执行页面 API。DOM 只读求值不是任意写入通道；页面有 API 也不证明 Chrome 聊天侧栏可执行它。没有通道时说明具体限制，不能安装桥接服务来绕过。

`page-client.mjs` 是可选宿主辅助，使用标准 ECMAScript 模块和 Node 内置功能，不需要 npm 包或本机 WebCAD 服务。适配器接收标准 CDP 方法和参数，返回标准 CDP 响应 `{result:{type,value},exceptionDetails?}`，目标标签页与生命周期由宿主管理。例如宿主文档确认支持 `tab.cdp.send` 后：

```javascript
import { createPageClient, findLocalRoutes } from './scripts/page-client.mjs';
const client = createPageClient({send:(method,params)=>tab.cdp.send(method,params)});
const matchingRoutes = await findLocalRoutes('移动');
const connection = await client.connect({queries:['移动'],limit:2,includeContracts:true});
const workflow = await client.readDocs('api.workflow');
// 从当前状态/真实查询获得 bodyId，不猜编号；以下 steps 是已读工具卡后的计划
const result = await client.run(steps,{context:connection.requestContext});
```

不要把这个例子当作宿主必有 `tab.cdp.send` 的保证。如果宿主的签名不同，只调整已授权的 adapter。`send` 必须执行真正的 `Runtime.evaluate`；本辅助不会使用文件系统或另一服务直接修改模型。

## 回执与恢复

`connect` 可在内核未就绪时发现工具；建模前需 `canExecute:true`，否则检查 `blockers`，不要取消用户的预览。已收到的完整工具卡可缓存哈希，`getTools` 只补缺失契约。模板卡 `template.*` 的执行 op 是 `quickModel`，`params.kind` 指定模板。

`run` 要求传入规划步骤时取得的 requestContext，写入前重新握手并核对会话、工程、实例和 revision；有并发变化就抛 `STALE_CONTEXT` 并停止，不会自动采纳新 revision 来执行旧计划。核对通过后生成唯一 idempotencyKey，发送一批最多 20 步。若调用的传输断开或超时，会抛 `UNKNOWN_OUTCOME` 并附原请求和键；它绝不自动重发。先用 `getState` / 当前回执查清提交状态，再规划剩余步骤。需要取相同请求的原幂等回执时可显式 `client.call('run',error.request)`，不能换 key 重做不确定批次。`partial/failed/unknown` 与成功保持原回执，不包装成“完成”。当前页重载后幂等不保证。

`readDocs` 返回一页，按真实 `nextCursor` 继续读相关文档；不默认遍历所有文档。`findLocalRoutes` 只读本地 routes.json，可按动作名、工具 ID、method 或用途匹配；本地路由版本与实时目录不符时以页面 `getUILayout/readDocs/getTools` 为准。任务完成后由宿主释放浏览器控制。
