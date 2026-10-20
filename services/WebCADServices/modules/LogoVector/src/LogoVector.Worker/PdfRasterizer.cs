using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using LogoVector.Contracts;
using Newtonsoft.Json.Linq;

namespace LogoVector.Worker
{
    // Loaded only in the already supervised, x64 Logo worker. No shell, child
    // process, client-supplied path, JavaScript engine, or network fetch.
    internal static class PdfRasterizer
    {
        internal sealed class Rendered { public byte[] Png; public int Width, Height; public double WidthPoints, HeightPoints; public string EngineHash; }
        static string Root => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "pdfium");
        internal static bool Available => File.Exists(Path.Combine(Root, "pdfium.dll")) && File.Exists(Path.Combine(Root, "renderer.json"));
        static string Hash(byte[] bytes) { using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern void FPDF_InitLibrary();
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern void FPDF_DestroyLibrary();
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern IntPtr FPDF_LoadMemDocument64(IntPtr data, UIntPtr length, IntPtr password);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern int FPDF_GetPageCount(IntPtr document);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern IntPtr FPDF_LoadPage(IntPtr document, int index);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern float FPDF_GetPageWidthF(IntPtr page);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern float FPDF_GetPageHeightF(IntPtr page);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern IntPtr FPDFBitmap_Create(int width, int height, int alpha);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern void FPDFBitmap_FillRect(IntPtr bitmap, int x, int y, int width, int height, uint color);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern void FPDF_RenderPageBitmap(IntPtr bitmap, IntPtr page, int x, int y, int width, int height, int rotate, int flags);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern IntPtr FPDFBitmap_GetBuffer(IntPtr bitmap);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern int FPDFBitmap_GetStride(IntPtr bitmap);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern void FPDFBitmap_Destroy(IntPtr bitmap);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern void FPDF_ClosePage(IntPtr page);
        [DllImport("pdfium.dll", CallingConvention = CallingConvention.Cdecl)] static extern void FPDF_CloseDocument(IntPtr document);

        internal static Rendered Render(byte[] bytes, int? selected)
        {
            if (!Available) throw new LogoVectorException("PDF_RENDERER_UNAVAILABLE", "此页面需要栅格识别；后台尚未安装匹配的 PDF 渲染器，可先导出 PNG 后继续。");
            var manifest = JObject.Parse(File.ReadAllText(Path.Combine(Root, "renderer.json")));
            var dll = Path.Combine(Root, "pdfium.dll"); var hash = Hash(File.ReadAllBytes(dll));
            if ((string)manifest["sha256"] != hash || (string)manifest["variant"] != "no-v8") throw new LogoVectorException("PDF_RENDERER_UNAVAILABLE", "PDF 渲染组件版本校验未通过，请更新匹配的后台程序。");
            if (LoadLibraryEx(dll, IntPtr.Zero, 0x1100) == IntPtr.Zero) throw new LogoVectorException("PDF_RENDERER_UNAVAILABLE", "PDF 渲染组件未能加载，请检查后台运行依赖。");
            var pin = GCHandle.Alloc(bytes, GCHandleType.Pinned);
            IntPtr document = IntPtr.Zero, page = IntPtr.Zero, bitmap = IntPtr.Zero;
            FPDF_InitLibrary();
            try
            {
                document = FPDF_LoadMemDocument64(pin.AddrOfPinnedObject(), new UIntPtr((uint)bytes.Length), IntPtr.Zero);
                if (document == IntPtr.Zero) throw new LogoVectorException("MALFORMED_FILE", "PDF 无法打开；请检查加密或文件完整性。");
                int count = FPDF_GetPageCount(document), number = selected ?? 1;
                if (count > 1 && !selected.HasValue) throw new LogoVectorException("PAGE_REQUIRED", "请选择 PDF 页面后再转换。");
                if (number < 1 || number > count) throw new LogoVectorException("INVALID_OPTIONS", "PDF 页码超出范围。");
                page = FPDF_LoadPage(document, number - 1);
                if (page == IntPtr.Zero) throw new LogoVectorException("MALFORMED_FILE", "PDF 页面无法读取。");
                double w = FPDF_GetPageWidthF(page), h = FPDF_GetPageHeightF(page);
                if (!(w > 0 && h > 0) || double.IsInfinity(w + h) || Math.Max(w, h) > 144000) throw new LogoVectorException("FILE_TOO_LARGE", "PDF 页面尺寸无效或过大。");
                // One deterministic render, not a threshold/resolution retry loop.
                double scale = 1024 / Math.Max(w, h);
                int pw = Math.Max(1, (int)Math.Round(w * scale)), ph = Math.Max(1, (int)Math.Round(h * scale));
                bitmap = FPDFBitmap_Create(pw, ph, 1);
                if (bitmap == IntPtr.Zero) throw new LogoVectorException("PDF_RENDER_FAILED", "页面图像内存分配失败。");
                FPDFBitmap_FillRect(bitmap, 0, 0, pw, ph, 0xffffffff);
                FPDF_RenderPageBitmap(bitmap, page, 0, 0, pw, ph, 0, 1); // include annotations, never execute actions
                using (var image = new Bitmap(pw, ph, FPDFBitmap_GetStride(bitmap), PixelFormat.Format32bppArgb, FPDFBitmap_GetBuffer(bitmap)))
                using (var output = new MemoryStream())
                {
                    image.Save(output, ImageFormat.Png);
                    if (output.Length > 1024 * 1024) throw new LogoVectorException("FILE_TOO_LARGE", "栅格页面超过 1 MiB 中间图预算，请裁剪到所需 LOGO 后重试。");
                    return new Rendered { Png = output.ToArray(), Width = pw, Height = ph, WidthPoints = w, HeightPoints = h, EngineHash = hash };
                }
            }
            finally
            {
                if (bitmap != IntPtr.Zero) FPDFBitmap_Destroy(bitmap);
                if (page != IntPtr.Zero) FPDF_ClosePage(page);
                if (document != IntPtr.Zero) FPDF_CloseDocument(document);
                FPDF_DestroyLibrary(); pin.Free();
            }
        }
    }
}
