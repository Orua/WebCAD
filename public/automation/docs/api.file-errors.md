# api.file-errors

页面建模、测量、视图与截图方法的失败通常返回 {status:"failed",commitState:"not_committed",error:{code,message},context}；execute 和 queryGeometry 使用 CommandService 的更完整结果。files 方法抛出带 code 的 Error，调用方应捕获，不能把异常解释为已保存。文件状态分别为 registered、generated、download_initiated、write_verified；generated 不证明磁盘写入。输入资源、导入和输出每项最多 20 MiB，最多 32 个资源、合计 64 MiB、30 分钟有效。自包含 .webcad 保存可能含 base64 导入源并超过上限；页面在限制前预留约 4 KiB 空间。读取 files.capabilities() 获得当前实际上限。
