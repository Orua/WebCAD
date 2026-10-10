using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using LogoVector.Contracts;
using Newtonsoft.Json;

namespace LogoVector.Converter
{
    public sealed class LogoVectorConverter : ILogoVectorConverter
    {
        const int MaxBytes = 20 * 1024 * 1024;
        readonly string workerPath;
        readonly TimeSpan timeout;
        public LogoVectorConverter(string workerPath, TimeSpan? timeout = null)
        {
            this.workerPath = Path.GetFullPath(workerPath ?? throw new ArgumentNullException(nameof(workerPath)));
            this.timeout = timeout ?? TimeSpan.FromSeconds(60);
        }
        public ConverterCapabilities GetCapabilities()
        {
            if (!File.Exists(workerPath)) return new ConverterCapabilities { Formats = new Dictionary<string, string> { ["*"] = "disabled: Worker executable unavailable" } };
            return new ConverterCapabilities { Formats = new Dictionary<string, string>
            {
                [".logo.json"] = "prototype: webcad-logo v1 closed polygon validation",
                [".svg"] = "prototype: M/L/H/V/Z paths and rect with explicit millimetre size",
                [".dxf"] = "prototype: 2D ASCII R2000/R2004/R2007/R2010/R2013/R2018 closed LWPOLYLINE and joined LINE; other entities rejected",
                [".pdf"] = "prototype: simple filled vector paths, explicit page, closed contours",
                [".ai"] = "prototype: PDF-compatible AI with simple filled vector paths",
                [".png"] = "prototype: threshold tracing; review required",
                [".jpg"] = "prototype: threshold tracing; review required",
                [".jpeg"] = "prototype: threshold tracing; review required",
                [".bmp"] = "prototype: threshold tracing; review required",
                [".dwg"] = "disabled: licensed DWG provider unavailable"
            } };
        }
        public async Task<InspectionResult> InspectAsync(Stream input, SourceDescriptor source, InspectOptions options, CancellationToken cancellationToken)
        {
            var result = await ExecuteAsync(input, source, options ?? new InspectOptions(), "inspect", cancellationToken).ConfigureAwait(false);
            return JsonConvert.DeserializeObject<InspectionResult>(result);
        }
        public async Task<ConversionResult> ConvertAsync(Stream input, SourceDescriptor source, ConversionOptions options, CancellationToken cancellationToken)
        {
            if (options == null) throw new ArgumentNullException(nameof(options));
            var result = await ExecuteAsync(input, source, options, "convert", cancellationToken).ConfigureAwait(false);
            return JsonConvert.DeserializeObject<ConversionResult>(result);
        }
        async Task<string> ExecuteAsync(Stream input, SourceDescriptor source, object options, string action, CancellationToken cancellationToken)
        {
            if (input == null || !input.CanRead) throw new ArgumentException("Readable input stream required", nameof(input));
            if (source == null || string.IsNullOrWhiteSpace(source.FileName)) throw new ArgumentException("Source filename required", nameof(source));
            if (!File.Exists(workerPath)) throw new LogoVectorException("ENGINE_UNAVAILABLE", "LogoVector Worker 不存在。");
            string job = Path.Combine(Path.GetTempPath(), "LogoVector", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(job);
            try
            {
                string sourcePath = Path.Combine(job, "source.bin"), requestPath = Path.Combine(job, "request.json"), outputPath = Path.Combine(job, "output.json");
                using (var file = new FileStream(sourcePath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true))
                {
                    byte[] buffer = new byte[65536]; int read; long total = 0;
                    while ((read = await input.ReadAsync(buffer, 0, buffer.Length, cancellationToken).ConfigureAwait(false)) > 0)
                    {
                        total += read; if (total > MaxBytes) throw new LogoVectorException("FILE_TOO_LARGE", "文件超过 20 MiB。");
                        await file.WriteAsync(buffer, 0, read, cancellationToken).ConfigureAwait(false);
                    }
                    if (total == 0) throw new LogoVectorException("MALFORMED_FILE", "输入为空。");
                }
                string hash;
                using (var sha = SHA256.Create()) using (var file = File.OpenRead(sourcePath)) hash = BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
                if (!string.IsNullOrWhiteSpace(source.ExpectedSha256) && !string.Equals(source.ExpectedSha256, hash, StringComparison.OrdinalIgnoreCase)) throw new LogoVectorException("SOURCE_HASH_MISMATCH", "源文件哈希不匹配。");
                File.WriteAllText(requestPath, JsonConvert.SerializeObject(new { action, sourcePath, outputPath, sourceName = Path.GetFileName(source.FileName), sourceHash = hash, options }));
                var start = new ProcessStartInfo(workerPath, "\"" + requestPath + "\"") { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Path.GetDirectoryName(workerPath), RedirectStandardOutput = true, RedirectStandardError = true };
                using (var process = Process.Start(start))
                {
                    if (process == null) throw new LogoVectorException("ENGINE_UNAVAILABLE", "Worker 启动失败。");
                    process.OutputDataReceived += (s, e) => { }; process.ErrorDataReceived += (s, e) => { };
                    process.BeginOutputReadLine(); process.BeginErrorReadLine();
                    using (cancellationToken.Register(() => { try { if (!process.HasExited) process.Kill(); } catch { } }))
                    {
                        var until = DateTime.UtcNow + timeout;
                        while (!process.WaitForExit(100))
                        {
                            cancellationToken.ThrowIfCancellationRequested();
                            if (DateTime.UtcNow > until) { process.Kill(); throw new LogoVectorException("TIMEOUT", "转换超时。"); }
                        }
                    }
                    cancellationToken.ThrowIfCancellationRequested();
                    if (process.ExitCode != 0 || !File.Exists(outputPath)) throw new LogoVectorException("ENGINE_UNAVAILABLE", "Worker 未生成完整结果。");
                }
                var info = new FileInfo(outputPath); if (info.Length > 8 * 1024 * 1024) throw new LogoVectorException("CONTOUR_TOO_COMPLEX", "结果超出大小上限。");
                var text = File.ReadAllText(outputPath);
                var error = JsonConvert.DeserializeObject<ConversionError>(text);
                if (!string.IsNullOrEmpty(error?.Code)) throw new LogoVectorException(error.Code, error.Message);
                return text;
            }
            finally { try { Directory.Delete(job, true); } catch { } }
        }
    }
}
