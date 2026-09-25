# api.execute

execute(request) 使用当前 CommandService 的结构化请求：{context:{sessionId,documentId,documentInstanceId,expectedRevision},idempotencyKey,action,args}。feature.add 的 args 使用真实工具卡的 op、opVersion、schemaHash、params、refs；feature.edit 使用 featureId、opVersion、schemaHash、params 补丁。严格参数契约列表以 info().capabilities.migratedOperations 和当前工具卡为准。其他操作的卡片是 advisory，不得把它当成严格 v2 可执行保证。
同一页面修改由原命令队列串行处理。幂等回执只在当前 documentInstanceId 的有限内存范围内有效，不跨页面重载。成功提交与后续显示或文件写入失败应分别报告。
