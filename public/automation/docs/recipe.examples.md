# recipe.examples

打开用户提供的 .webcad 工程：经授权取得文件字节，await api.files.register({name,data}) 后调用 files.open({context,resourceId})。context 在读文件前取得；遇并发修改拒绝，未保存工程不能替换。读取卡片 files.write 了解真实磁盘保存；仅 files.save 生成字节不清除 dirty。正式界面不提供预置示例。
