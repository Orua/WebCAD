# 旧 Agent / CLI 开发模式（非产品入口）

2026-09-23 纠偏：终端 CLI 没有解决用户正在使用的浏览器侧栏入口。
它不能作为 AI 接入问题已解决的证明，也不应要求用户安装或启动 CLI 才能使用 WebCAD。

当前路径：
1. [项目目的与规范](../PROJECT.md)
2. [页面 API 与 JSON 批次](PAGE-API.zh-CN.md)
3. 发布页面的 automation/quickstart.md；运行时 window.webcad.api.info()。

scripts/webcad-agent.mjs、旧 npm agent:cli 和同源 MCP/WebSocket 桥保留为开发兼容代码；
普通静态页面不启用它们。本次没有删除这些既有实现，以免破坏已有开发回归与会话映射修复。
历史完整说明保存在编辑前备份 agent/backups/20260923-141805/docs/AGENT-MODE.zh-CN.md。
