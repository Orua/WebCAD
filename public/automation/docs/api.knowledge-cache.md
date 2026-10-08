# api.knowledge-cache

首次握手本地知识库与路由
connect().onboarding.knowledge.policy=required-on-first-handshake。Agent首次连接当前WebCAD来源后，下载automation/agent-knowledge.json，再下载清单内index.json、agent-routing.json、routes.json到宿主存储；逐文件验证SHA-256和字节数。只把轻量路由及命中的完整文档/工具卡送进模型上下文，不打印1–2MiB全库。没有宿主下载或存储能力时报告具体限制，不假称已下载，也不为此安装后台服务。
缓存按当前页面base URL、catalogHash、docsHash隔离。重连时哈希匹配且本地文件验证成功就复用；变更、缺文件或损坏时更新完整包。调用仍读新鲜context，静态库不包含活文档、当前实体编号或拓扑快照。静态库里的示例编号不是当前ID。
两级路由：agent-routing.json按任务命中源图重建、模板、轮廓、加工、圆角、Logo/浮雕、检查、编辑、文件；routes.json按精确UI动作找公共接口。任务先读工作流→选工具→取完整卡→按需专题。template.*单模板优先，避免读取quickModel总目录。未命中用实时searchTools；当前页面哈希与工具契约优先。
可选Node宿主helper（不是网页运行依赖）：createPageClient({send:宿主授权CDP适配器,knowledge:{baseUrl:目标页URL,directory:宿主缓存目录}})。connect自动下载/验证，返回knowledgeStatus:{status:ready,cacheHit,directory,downloadedFiles}；已有匹配缓存不发下载请求。未配置knowledge时返回download_required，helper.run在知识包准备前拒绝执行。其他宿主按相同清单实现存储适配。页面不能证明远端Agent已经写盘，不能把handshake描述符当成下载回执。
await client.route('DWG图纸重建')返回匹配路由和需要的doc/tool IDs；await client.readLocal({docIds:['api.reconstruction'],toolIds:['inspectDesign']})仅取这两项。默认字符预算32000，不能容纳的整项返回omitted/CHAR_BUDGET，不截断schema；调用方缩小本次读取范围。下载不自动安装技能；安装包仍由宿主选择并执行。
