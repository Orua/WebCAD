using System;
using System.Collections.Specialized;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;

namespace WebCADServices.Transport
{
    // Linked into Gateway: IIS must not load Runtime/SQLite/worker dependencies.
    public sealed class TransportSettings
    {
        public string PipeName { get; set; }
        public string AllowedOrigin { get; set; }
        public int ConnectTimeoutMs { get; set; }
        public int ReadTimeoutMs { get; set; }
        public int WriteTimeoutMs { get; set; }
        public int OverallTimeoutMs { get; set; }
        public int AuthenticationTimeoutMs { get; set; }
        public const int MaxResourceBytes = Protocol.MaxUpload;
        public const int MaxRequestFrame = 30 * 1024 * 1024;
        public const int MaxResponseFrame = 48 * 1024 * 1024;
        public static TransportSettings FromAppSettings(NameValueCollection values)
        {
            Func<string, int> number = key => { int value; if (!int.TryParse(values["WebCAD." + key], out value)) throw new InvalidOperationException("Missing transport setting: " + key); return value; };
            var settings = new TransportSettings { PipeName = values["WebCAD.PipeName"], AllowedOrigin = values["WebCAD.AllowedOrigin"], ConnectTimeoutMs = number("ConnectTimeoutMs"), ReadTimeoutMs = number("ReadTimeoutMs"), WriteTimeoutMs = number("WriteTimeoutMs"), OverallTimeoutMs = number("OverallTimeoutMs"), AuthenticationTimeoutMs = number("AuthenticationTimeoutMs") };
            settings.Validate(); return settings;
        }
        public void Validate()
        {
            if (string.IsNullOrEmpty(PipeName) || PipeName.Length > 120 || !System.Text.RegularExpressions.Regex.IsMatch(PipeName, "^[A-Za-z0-9_-]+$")) throw new InvalidOperationException("Invalid pipeName");
            Uri origin;
            if (!Uri.TryCreate(AllowedOrigin, UriKind.Absolute, out origin) || (origin.Scheme != "https" && origin.Scheme != "http") || origin.GetLeftPart(UriPartial.Authority) != AllowedOrigin || !string.IsNullOrEmpty(origin.UserInfo)) throw new InvalidOperationException("AllowedOrigin must be an exact HTTP(S) origin without a path");
            foreach (int value in new[] { ConnectTimeoutMs, ReadTimeoutMs, WriteTimeoutMs, AuthenticationTimeoutMs, OverallTimeoutMs }) if (value < 100 || value > 60000) throw new InvalidOperationException("Transport deadline must be 100..60000 ms");
            if (ConnectTimeoutMs > OverallTimeoutMs || ReadTimeoutMs > OverallTimeoutMs || WriteTimeoutMs > OverallTimeoutMs || AuthenticationTimeoutMs > OverallTimeoutMs) throw new InvalidOperationException("Phase deadline exceeds overall deadline");
        }
    }
    public sealed class TransportTimeoutException : IOException
    {
        public string Phase { get; }
        public TransportTimeoutException(string phase) : base("Transport deadline exceeded") { Phase = phase; }
    }
    public sealed class FrameException : IOException { public FrameException() : base("Invalid transport frame") { } }
    public sealed class Deadline
    {
        readonly Stopwatch timer = Stopwatch.StartNew(); readonly int budget;
        public Deadline(int milliseconds) { budget = milliseconds; }
        public int Remaining(int phaseBudget, string phase)
        {
            int left = budget - (int)timer.ElapsedMilliseconds;
            if (left <= 0) throw new TransportTimeoutException(phase);
            return Math.Min(left, phaseBudget);
        }
    }
    public static class PipeFrames
    {
        static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
        public static async Task Bounded(Task work, Stream stream, Deadline deadline, int phaseBudget, string phase, CancellationToken cancellation)
        {
            using (var delayCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellation))
            {
                int remaining;
                try { remaining = deadline.Remaining(phaseBudget, phase); }
                catch { stream.Dispose(); var late = work.ContinueWith(t => { var ignored = t.Exception; }, TaskContinuationOptions.OnlyOnFaulted); throw; }
                Task delay = Task.Delay(remaining, delayCancellation.Token);
                if (await Task.WhenAny(work, delay).ConfigureAwait(false) != work)
                {
                    stream.Dispose();
                    var observed = work.ContinueWith(t => { var ignored = t.Exception; }, TaskContinuationOptions.OnlyOnFaulted);
                    cancellation.ThrowIfCancellationRequested(); throw new TransportTimeoutException(phase);
                }
                delayCancellation.Cancel(); await work.ConfigureAwait(false);
            }
        }
        public static async Task<byte[]> ReadExactly(Stream stream, int count, Deadline deadline, int timeout, CancellationToken cancellation)
        {
            var bytes = new byte[count]; int offset = 0;
            while (offset < count)
            {
                var read = stream.ReadAsync(bytes, offset, count - offset, cancellation);
                await Bounded(read, stream, deadline, timeout, "read", cancellation).ConfigureAwait(false);
                int got = await read.ConfigureAwait(false); if (got == 0) throw new FrameException(); offset += got;
            }
            return bytes;
        }
        public static async Task<T> Read<T>(Stream stream, int maxFrame, Deadline deadline, int timeout, CancellationToken cancellation)
        {
            var readDeadline = new Deadline(deadline.Remaining(timeout, "read"));
            byte[] prefix = await ReadExactly(stream, 4, readDeadline, timeout, cancellation).ConfigureAwait(false);
            int length = prefix[0] | prefix[1] << 8 | prefix[2] << 16 | prefix[3] << 24;
            if (length < 1 || length > maxFrame) throw new FrameException();
            byte[] body = await ReadExactly(stream, length, readDeadline, timeout, cancellation).ConfigureAwait(false);
            try
            {
                using (var reader = new JsonTextReader(new StringReader(Utf8.GetString(body))) { MaxDepth = 32, DateParseHandling = DateParseHandling.None })
                {
                    var value = JObject.Load(reader, new JsonLoadSettings { DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error });
                    if (reader.Read()) throw new FrameException();
                    T result = value.ToObject<T>(JsonSerializer.Create(new JsonSerializerSettings { TypeNameHandling = TypeNameHandling.None, MaxDepth = 32 }));
                    if (result == null) throw new FrameException(); return result;
                }
            }
            catch (JsonException) { throw new FrameException(); }
            catch (DecoderFallbackException) { throw new FrameException(); }
            catch (ArgumentException) { throw new FrameException(); }
            catch (FormatException) { throw new FrameException(); }
        }
        public static async Task Write(Stream stream, object value, int maxFrame, Deadline deadline, int timeout, CancellationToken cancellation)
        {
            var writeDeadline = new Deadline(deadline.Remaining(timeout, "write"));
            byte[] body = Utf8.GetBytes(JsonConvert.SerializeObject(value));
            if (body.Length < 1 || body.Length > maxFrame) throw new FrameException();
            int length = body.Length; byte[] prefix = { (byte)length, (byte)(length >> 8), (byte)(length >> 16), (byte)(length >> 24) };
            await Bounded(stream.WriteAsync(prefix, 0, 4, cancellation), stream, writeDeadline, timeout, "write", cancellation).ConfigureAwait(false);
            await Bounded(stream.WriteAsync(body, 0, length, cancellation), stream, writeDeadline, timeout, "write", cancellation).ConfigureAwait(false);
            await Bounded(stream.FlushAsync(cancellation), stream, writeDeadline, timeout, "write", cancellation).ConfigureAwait(false);
        }
    }
}
