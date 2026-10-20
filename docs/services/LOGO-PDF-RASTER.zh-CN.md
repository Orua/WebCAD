# PDF／AI 轮廓回退

PDF-compatible AI 和 PDF 优先使用现有矢量提取。仅 `UNSUPPORTED_RENDER_FEATURE` / `NO_VECTOR_CONTENT` 转入已监督的 Logo Worker 内 PDFium 非 V8 渲染；无子进程、客户端路径、脚本执行或网络下载。非法页码、尺寸、拓扑、取消、超时不自动重试。

固定依赖由 `scripts/stage-logo-pdfium.ps1` 校验并放入 Worker 同级 `pdfium/`；DLL、renderer.json、版本、许可证随同发布。Runtime 的 `logo.pdfRasterRenderer` 表示实际匹配依赖是否可用，组合 `engineBuildId` 纳入 DLL 与清单。它不依赖 Codex 缓存或用户电脑另装程序。

一页一次、最长边 1024 像素，PNG 最大 1 MiB。像素并非源矢量精度；字体替代、渲染及阈值重建误差未知，必须进入 `needsReview`。`raster` 参数可用于 PDF／AI 回退，默认阈值 128、alphaThreshold 1、invert false、smoothingPx 0。可直接提取的 PDF 不应用这些位图参数；PDF 线接合公差仍独立。

公开 `readLogo`、`logoWizard.parameters/read` 和 UI 使用同一入口。`source.renderedRaster` 包含原源 SHA、页码、渲染器 SHA、实际像素尺寸、页面点尺寸和有界 PNG 字节；`source.rasterFrame` 定义底图到毫米轮廓的对齐，缩放时一并缩放。`reviewLogo artifacts` / `logoWizard artifacts` 提供原始 PDF、渲染 PNG、原始像素轮廓、当前轮廓、预览和转换报告，供 Agent 读取。PNG 哈希、尺寸及源绑定在展示和导出前校验。轮廓编辑、确认和撤销继续作用于同一个 review session；确认轮廓不代表雕刻已提交。

`PDF_RENDERER_UNAVAILABLE`：保留原任务与原件，核对正式后端版本或从源软件导出 PNG；不要重复提交同样作业。`PDF_RENDER_FAILED`：读取作业审计和渲染阶段，保留原文档。`LOGO_RENDERED_IMAGE_INVALID`：中间图校验失败，重新读取原任务工件，不接受来源不明底图。几何仍只支持原有平面和已支持的曲面边界。
