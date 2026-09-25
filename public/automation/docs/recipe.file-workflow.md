# recipe.file-workflow

浏览器文件流程：先调用 api.files.capabilities() 读取格式和限制。api.files.register({name,data,mime?}) 登记 File/Blob/ArrayBuffer/Uint8Array 真实字节，返回 resourceId。api.files.new({context})、open/import({context,resourceId}) 操作当前工程；save({context,name?})、export({context,format,ids?,name?}) 返回 status=generated 的资源描述。read({resourceId,as:"blob"|"bytes"}) 返回实际 Blob 或 Uint8Array。download({resourceId}) 返回 download_initiated；write({resourceId,handle}) 仅在已授权句柄写入、关闭与 SHA-256/大小回读匹配后返回 write_verified。release({resourceId}) 释放页面资源；已启动下载的 Object URL 由定时器回收，不因 release 立即撤销。
单资源 20 MiB、最多 32 个、总计 64 MiB、有效期 30 分钟。生成 Blob 不等于写盘，下载启动不等于写盘成功。旧快照写入不能清除新 revision 的 dirty。页面 API 的新建/打开遇 dirty 一律拒绝 UNSAVED_REPLACEMENT；UI 的真实用户确认是独立路径。File/Blob 不保证能跨侧边栏 JSON 通道传递；宿主不能传字节时由用户在页面选择文件。当前静态版不含本机 IGES 转换器及服务端矢量转换器。
