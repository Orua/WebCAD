# start

WebCAD 页面自动化入口：window.webcad.api.connect({queries:[能力关键词]})。优先读取精简状态和搜索结果，再 getTools({ids}) 批量读取契约，详见 api.discovery。先读 automation/quickstart.md 或 readDocs({docId:"api.run"})，通过页面脚本调用 run 批次；AI 应通过宿主已授权的页面脚本通道在后台调用 window.webcad.api。不要为查工具或执行建模打开 JSON 调试面板、填输入框或点击执行按钮。没有可用脚本通道时，明确报告通道不可用；不要自动退回界面操作。 宿主通道发现见 api.connection。无需终端 CLI。读取当前页面的 info()/getState()，再用 searchTools({query:"安装板"})、getTool({id:"box"})、readDocs({docId:"coordinates"}) 查询契约。当前页面的建模、文件和视图操作由页面 API 调用浏览器 Worker 中的精确内核。
页面 JS 执行通道必须由调用客户端提供并获用户授权；页面公开函数不证明某个侧边栏已能调用。建模写入须传当前 sessionId、documentId、documentInstanceId、expectedRevision，不能猜 revision。页面方法不接收任意脚本源码、任意 URL 或本地路径。
