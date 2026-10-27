# PDF／AI 轮廓回退

PDF-compatible AI 和 PDF 优先使用现有矢量提取。仅 `UNSUPPORTED_RENDER_FEATURE` / `NO_VECTOR_CONTENT` 转入已监督的 Logo Worker 内 PDFium 非 V8 渲染；无子进程、客户端路径、脚本执行或网络下载。非法页码、尺寸、拓扑、取消、超时不自动重试。

固定依赖由 `scripts/stage-logo-pdfium.ps1` 校验并放入 Worker 同级 `pdfium/`；DLL、renderer.json、版本、许可证随同发布。Runtime 的 `logo.pdfRasterRenderer` 表示实际匹配依赖是否可用，组合 `engineBuildId` 纳入 DLL 与清单。它不依赖 Codex 缓存或用户电脑另装程序。

一页一次、最长边 1024 像素，PNG 最大 1 MiB。像素并非源矢量精度；字体替代、渲染及阈值重建误差未知，必须进入 `needsReview`。PDF／AI 回退省略 `raster` 时继续使用阈值 128、alphaThreshold 1、invert false、smoothingPx 0；显式 `{mode:"auto"}` 可使用自动位图分析。可直接提取的 PDF 不应用这些位图参数；PDF 线接合公差仍独立。

公开 `readLogo`、`logoWizard.parameters/read` 和 UI 使用同一入口。`source.renderedRaster` 包含原源 SHA、页码、渲染器 SHA、实际像素尺寸、页面点尺寸和有界 PNG 字节；`source.rasterFrame` 定义底图到毫米轮廓的对齐，缩放时一并缩放。`reviewLogo artifacts` / `logoWizard artifacts` 提供原始 PDF、渲染 PNG、原始像素轮廓、当前轮廓、预览和转换报告，供 Agent 读取。PNG 哈希、尺寸及源绑定在展示和导出前校验。轮廓编辑、确认和撤销继续作用于同一个 review session；确认轮廓不代表雕刻已提交。

`PDF_RENDERER_UNAVAILABLE`：保留原任务与原件，核对正式后端版本或从源软件导出 PNG；不要重复提交同样作业。`PDF_RENDER_FAILED`：读取作业审计和渲染阶段，保留原文档。`LOGO_RENDERED_IMAGE_INVALID`：中间图校验失败，重新读取原任务工件，不接受来源不明底图。几何仍只支持原有平面和已支持的曲面边界。

位图自动识别使用多尺度尖角保护和曲线拟合：沿轮廓识别交替的小幅像素波动，在尖角之间按自动选取的像素误差拟合较长的三次曲线。原像素轮廓、区域与孔洞保留，几何校验失败时回退原轮廓。source.rasterAuto 的 cubicSegments、ripplePoints、fitTolerancePx 与 fitBoundPx 分别记录曲线数、识别出的波动点、拟合控制和针对拟合输入轮廓的保守界限。包含前处理和 CAD 采样的保守界限见 source.rasterSmoothing.curveDistanceUpperBoundMm；两者都不是源稿重建误差或加工精度。

位图自动拟合 v7 沿用已验证的受限贝塞尔拟合，再对拟合后的片段检验控制点到弦的距离、原始像素轮廓的交替残差和端点切线，只有确认是直线的跨度才合并为 SVG 直线。所有候选跨度仍受连续轮廓偏差界限制；非直线弧保留原曲线。如果直线回修导致某圈自交或面积偏差过大，先撤销该圈的直线回修并保留回修前已拟合的贝塞尔曲线；只有曲线拟合本身仍不安全时，才将该圈恢复为原像素轮廓。source.rasterAuto.straightenedLines记录最终保留的直线回修数，partialPreservedRings仅记录回退到原像素边界的轮廓数。
