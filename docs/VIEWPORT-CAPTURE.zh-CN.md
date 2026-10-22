# WebCAD 视口截图

截图已由 WebCAD 公开工具提供。调用 `await window.webcad.api.capture({context:api.getState().context,maxWidth:800,format:'webp'})`。context 须来自当前页面；format 为 png 或 webp，maxWidth 为64–4096，quality须大于0且不超过1。返回实际mime/dataUrl/width/height/context/display。截图等待与当前已提交修订匹配的渲染帧，包含当前可见的P编号标注，仅截视口，不含聊天、菜单或整个桌面。失败返回 DISPLAY_FAILED 或 CAPTURE_TIMEOUT；不修改模型、历史或dirty，不自动重新提交建模。

原生CADAgent使用 `webcad_view`，参数 `method:'capture',args:{context,maxWidth:800,format:'webp'}`。现有路线：页面capture → WebCAD host-adapter → 宿主命令回执 → 原生Agent MCP转换为image内容 → 截图附件持久化和读回校验 → CADAgent方格缩略图。不是图像生成工具，也不需要Agent自己寻找桌面截图办法。宿主当前截图附件限1MiB，过大时降低maxWidth；不能伪称生成图像等于宿主写盘成功。

新增材料读取也可通过当前有限批次工具调用：`webcad_submit(method:'run',args:{context,idempotencyKey,steps:[{id:'materials',method:'getMaterials',args:{}}]})`；重量步骤使用method:'measureMass',args:{bodyId}。批次继续走页面当前API和契约，不要求安装新截图或CAD服务。
