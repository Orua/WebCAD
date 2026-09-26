# api.connection

AI 应通过宿主已授权的页面脚本通道在后台调用 window.webcad.api。不要为查工具或执行建模打开 JSON 调试面板、填输入框或点击执行按钮。没有可用脚本通道时，明确报告通道不可用；不要自动退回界面操作。

首次入口为 automation/agent-start.html，机器可读引导为 automation/agent-start.json。connect().onboarding 返回同一 version=1 静态连接步骤，不包含工程状态或实体身份。需要可选本地技能/客户端时，先读 automation/agent-kit.json；安装脚本 automation/install-agent.ps1 仅供宿主或用户明确选择安装，installation=host-opt-in，不会增加浏览器权限，也不是页面建模的必需服务。

先确认宿主实际提供的能力。只读 DOM evaluate 不能据此推断公开 API 不可调用，也不能用于绕过宿主限制。
对于当前提供 cua_repl 的 Codex Chrome/IAB 开发环境：按该工具当前文档绑定用户指定标签页（不要刷新已有工程），检查 tab.capabilities.list()；若列出 cdp，读取 (await tab.capabilities.get('cdp')).documentation()。只有该通道确实提供并允许当前任务时，才用其 send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true}) 调用页面公开 API。检查 exceptionDetails 与 result，不把命令已发送当作执行成功。其他宿主使用其明确提供的等价脚本接口，不猜测 CDP 方法或自行安装桥接服务。

首次表达式可一次返回状态、候选完整卡和批次说明：
JSON.stringify((()=>{const api=window.webcad.api;return {connection:api.connect({queries:['本次需要的能力'],limit:2,includeContracts:true}),run:api.readDocs({docId:'api.run'})};})())

connect 的 queries 是最多4个短字符串；searchTools 使用单个 query 字符串，两者不能混用。includeContracts=true 时完整卡已在 connection.contracts.items[].card，不要重复 getTool。需要补卡时用 getTools({ids:[实际ID]}) 一次取回；已知 ID 不必搜索。查询拓扑等补充说明可在同次表达式中按 docId 读取。不要为了发现工具构造 api.run 请求：这些只读方法直接调用，无需上下文或幂等键。

拿到契约后使用 api.run({context:connection.requestContext,idempotencyKey:唯一键,steps})。CDP expression 中异步调用应包成 (async()=>JSON.stringify(await window.webcad.api.run(请求对象)))()，配合 awaitPromise:true；不要直接使用顶层 await。修改前确认状态仍新鲜，依赖前步结果用 $ref；按需读取回执，不裁掉错误或必要约束。核对 committed 与当前渲染 revision。只执行用户要求的工作；保存/导出并非普通建模的自动收尾步骤。

连接出错要先区分标签页绑定、宿主通道和页面 API。宿主超时/传输错误不证明页面或 API 不可用；只在脚本已成功进入目标页后，才检查 window.webcad.api.connect 是否存在。缺失可能是页面尚未初始化、当前页不是 WebCAD 或旧版本，按实际结果报告；不能套用新版文档或刷新已有工程。当前宿主文档与权限优先于这里的示例，不自行安装服务或桥接绕过限制。新版公开面只有 window.webcad.api，不沿用旧 action/execute/ready/viewport。握手返回 canExecute/blockers；ready 仅指内核初始化完成，忙碌或预览中仍不能执行。已知能力 ID 可用 connect({toolIds:['advancedLoft','transform'],includeContracts:true})，一次拿到实时上下文和完整卡。模板按名称检索，读 template.* 的单模板卡；按卡里的 minimalExample 用 op:quickModel 执行，不把 template.* 当几何操作 ID。

静态文档可直接按页面 base URL 读取 automation/quickstart.md、automation/tools/<id>.json、automation/docs/<docId>.md。HTTP 读取 JSON 必须按 UTF-8 解码，避免中文乱码。manifest/index 为程序索引输入，不要将全目录或全库打印进模型上下文。缓存只包含静态契约，不能代替实时工程状态。
