using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using System.Web.Caching;

namespace Goldenluck.WebCAD.Hosting
{
    // Deliberately no IRequiresSessionState/IReadOnlySessionState: SSE cannot
    // hold the ASP.NET session lock while result/upload/stop requests arrive.
    public sealed class WebCADBridge : HttpTaskAsyncHandler
    {
        private static readonly HttpClient Client = new HttpClient(new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false }) { Timeout = Timeout.InfiniteTimeSpan };
        private static readonly Regex Id = new Regex("^[a-zA-Z0-9_-]{1,80}$", RegexOptions.Compiled);
        private static readonly string HostBuildId = ComputeHostBuildId();
        private static string ComputeHostBuildId()
        {
            using (var sha = SHA256.Create())
                return "sha256:" + BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(typeof(WebCADBridge).Assembly.Location))).Replace("-", "").ToLowerInvariant();
        }
        private sealed class StreamTicket { public int UserId; public string SessionId; public string AgentKey; }
        public override bool IsReusable { get { return false; } }

        private static string SafeId(string value)
        {
            if (value == null || !Id.IsMatch(value)) throw new HttpException(400, "Invalid resource ID.");
            return value;
        }

        public override async Task ProcessRequestAsync(HttpContext context)
        {
            context.Response.AppendHeader("X-WebCAD-Host-Build", HostBuildId);
            try
            {
                WebCadHost host = WebCadHost.Resolve(context);
                string action = context.Request["action"] ?? "";
                if (action == "events") { await Stream(context, host); return; }
                if (action == "download" || action == "project-download") { await Download(context, host); return; }
                if (!string.Equals(context.Request.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase)) throw new HttpException(405, "Use POST.");
                WebCadHost.RequireCsrf(context);
                string sessionId = action == "attach" || action == "history" || action == "messages" || action == "models" || action == "project-info" ? null : SafeId(context.Request["cadSessionId"]);
                if (action == "project-file") { await UploadProjectFile(context, host, sessionId); return; }
                if (action == "input") { await UploadInput(context, host, sessionId); return; }
                if (action == "artifact") { await UploadArtifact(context, host, sessionId); return; }
                if (action == "artifact-upload-chunk") { await UploadArtifactChunk(context, host, sessionId); return; }
                if (action == "ticket")
                {
                    string token = WebCadHost.NewNonce();
                    HttpRuntime.Cache.Insert("webcad-stream:" + token, new StreamTicket { UserId = host.User.UserID, SessionId = sessionId, AgentKey = host.Target.Key }, null, DateTime.UtcNow.AddSeconds(120), Cache.NoSlidingExpiration);
                    Write(context, 200, new { ticket = token }); return;
                }
                int jsonLimit = action == "result" ? 8 * 1024 * 1024 : 3 * 1024 * 1024;
                if (context.Request.ContentLength > jsonLimit) throw new HttpException(413, "JSON request exceeds its limit.");
                JObject body;
                using (var buffer = new MemoryStream())
                {
                    byte[] bytes = new byte[8192]; int count;
                    while ((count = await context.Request.InputStream.ReadAsync(bytes, 0, bytes.Length)) > 0)
                    { if (buffer.Length + count > jsonLimit) throw new HttpException(413, "JSON request exceeds its limit."); buffer.Write(bytes, 0, count); }
                    body = JObject.Parse(Encoding.UTF8.GetString(buffer.ToArray()));
                }
                string path, method = "POST";
                switch (action)
                {
                    case "models": path = "/api/models"; method = "GET"; break;
                    case "project-info": path = "/api/webcad/projects/" + SafeId((string)body["conversationId"]); method = "GET"; break;
                    case "attach":
                        // The workbench only declares that it can push state snapshots (native host mode);
                        // CodexAgent decides the agent mode server-side. Only a literal JSON true is forwarded.
                        bool nativeHost = body["nativeHost"] != null && body["nativeHost"].Type == JTokenType.Boolean && (bool)body["nativeHost"];
                        bool newConversation = body["newConversation"] != null && body["newConversation"].Type == JTokenType.Boolean && (bool)body["newConversation"];
                        bool dialogueOnly = body["dialogueOnly"] != null && body["dialogueOnly"].Type == JTokenType.Boolean && (bool)body["dialogueOnly"];
                        body = new JObject { ["baseUrl"] = string.IsNullOrWhiteSpace(host.Settings.AgentWebcadBaseUrl) ? new Uri(context.Request.Url, host.Settings.WebcadBasePath).AbsoluteUri : host.Settings.AgentWebcadBaseUrl, ["context"] = body["context"], ["conversationId"] = body["conversationId"], ["scopes"] = new JArray("cad.read", "cad.edit", "cad.export") };
                        if (nativeHost) body["nativeHost"] = true;
                        if (newConversation) body["newConversation"] = true;
                        if (dialogueOnly) body["dialogueOnly"] = true;
                        path = "/api/webcad/sessions"; break;
                    case "history":
                        path = "/api/sessions?mode=webcad&limit=50&cursor=" + HttpUtility.UrlEncode((string)body["cursor"] ?? ""); method = "GET"; break;
                    case "messages":
                        path = "/api/sessions/" + SafeId((string)body["clientSessionId"]) + "/messages?mode=webcad&limit=200&cursor=" + HttpUtility.UrlEncode((string)body["cursor"] ?? ""); method = "GET"; break;
                    case "heartbeat": path = "/api/webcad/sessions/" + sessionId + "/heartbeat"; break;
                    case "prepare": path = "/api/webcad/sessions/" + sessionId + "/prepare"; break;
                    case "snapshot": path = "/api/webcad/sessions/" + sessionId + "/snapshot"; break;
                    case "release": path = "/api/webcad/sessions/" + sessionId + "/release"; break;
                    case "artifact-upload-start": path = "/api/webcad/sessions/" + sessionId + "/artifacts/uploads"; break;
                    case "artifact-upload-complete":
                        path = "/api/webcad/sessions/" + sessionId + "/artifacts/uploads/" + SafeId(context.Request["uploadId"]) + "/complete?commandId=" + SafeId(context.Request["commandId"]); body = new JObject(); break;
                    case "ack": case "result":
                        path = "/api/webcad/sessions/" + sessionId + "/commands/" + SafeId(context.Request["commandId"]) + "/" + action; break;
                    case "send":
                        string message = (string)body["message"];
                        if (string.IsNullOrWhiteSpace(message) || message.Length > 30000) throw new HttpException(400, "Message is required and must be bounded.");
                        string effort = (string)body["reasoningEffort"] ?? "medium";
                        if (effort != "low" && effort != "medium" && effort != "high" && effort != "xhigh") throw new HttpException(400, "Invalid reasoning effort.");
                        bool autoStart = body["autoStart"] != null && body["autoStart"].Type == JTokenType.Boolean && (bool)body["autoStart"];
                        body = new JObject { ["message"] = message, ["purpose"] = "webcad", ["cadSessionId"] = sessionId,
                            ["clientSessionId"] = "webcad-" + sessionId, ["autoStart"] = autoStart, ["reasoningEffort"] = effort, ["model"] = body["model"], ["cadState"] = body["cadState"] };
                        path = "/api/tasks"; break;
                    case "start": path = "/api/tasks/" + SafeId(context.Request["taskId"]) + "/start"; break;
                    case "files": path = "/api/tasks/" + SafeId(context.Request["taskId"]) + "/files?limit=200"; method = "GET"; break;
                    case "task": case "task-events":
                        long after; if (!long.TryParse(context.Request["after"], out after) || after < 0) after = 0;
                        path = "/api/tasks/" + SafeId(context.Request["taskId"]) + (action == "task-events" ? "/events?after=" + after : "");
                        method = "GET"; break;
                    case "cancel": path = "/api/tasks/" + SafeId(context.Request["taskId"]) + "/cancel"; break;
                    case "steer": path = "/api/tasks/" + SafeId(context.Request["taskId"]) + "/steer"; break;
                    default: throw new HttpException(400, "Unknown CAD gateway action.");
                }
                using (var request = Request(host, sessionId, method, path))
                using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(action == "prepare" ? 60 : 30)))
                {
                    string requestKey = context.Request.Headers["Idempotency-Key"];
                    if (action == "send" && !string.IsNullOrWhiteSpace(requestKey)) request.Headers.TryAddWithoutValidation("Idempotency-Key", SafeId(requestKey));
                    if (method == "POST") request.Content = new StringContent(body.ToString(Formatting.None), Encoding.UTF8, "application/json");
                    using (var response = await Client.SendAsync(request, HttpCompletionOption.ResponseContentRead, timeout.Token))
                    {
                        string raw = await response.Content.ReadAsStringAsync();
                        if (raw.Length > 8 * 1024 * 1024) throw new HttpException(502, "CAD response exceeds its limit.");
                        JObject value = ParseAgentResponse(raw);
                        if (action == "task" && response.IsSuccessStatusCode)
                            value = new JObject { ["taskId"] = value["taskId"], ["status"] = value["status"], ["finalResponse"] = value["finalResponse"],
                                ["error"] = value["error"], ["startedAt"] = value["startedAt"], ["completedAt"] = value["completedAt"],
                                ["errorCode"] = value["errorCode"], ["cadOutcome"] = value["requestMetadata"]?["cadOutcome"] };
                        if (action == "send") value.Remove("route");
                        Write(context, (int)response.StatusCode, value);
                    }
                }
            }
            catch (HttpException ex) { Write(context, ex.GetHttpCode(), new { error = new { code = "cad_gateway_denied", message = ex.Message } }); }
            catch (JsonException) { Write(context, 400, new { error = new { code = "invalid_request", message = "Expected bounded JSON." } }); }
            catch (Exception ex)
            {
                System.Diagnostics.Trace.TraceWarning("WebCAD gateway failure type={0}", ex.GetType().Name);
                if (context.Response.IsClientConnected) Write(context, 502, new { error = new { code = "cad_agent_unavailable", message = "CAD Agent is unavailable. Reconnect and inspect the original task before retrying." } });
            }
        }

        private static HttpRequestMessage Request(WebCadHost host, string sessionId, string method, string path)
        {
            var request = new HttpRequestMessage(new HttpMethod(method), host.Target.BaseUrl.TrimEnd('/') + path);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", host.Token(sessionId));
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            return request;
        }

        private static async Task UploadInput(HttpContext context, WebCadHost host, string sessionId)
        {
            string taskId = SafeId(context.Request["taskId"]);
            int budget = CadAttachmentBudget.ForName(context.Request["name"]);
            string limitMessage = "单个附件不能超过 " + budget / 1024 / 1024 + " MiB。";
            if (context.Request.ContentLength > budget) throw new HttpException(413, limitMessage);
            using (var buffer = new MemoryStream())
            {
                byte[] chunk = new byte[8192]; int count;
                while ((count = await context.Request.InputStream.ReadAsync(chunk, 0, chunk.Length)) > 0)
                {
                    if (buffer.Length + count > budget) throw new HttpException(413, limitMessage);
                    buffer.Write(chunk, 0, count);
                }
                using (var request = Request(host, sessionId, "POST", "/api/tasks/" + taskId + "/files"))
                {
                    request.Content = new ByteArrayContent(buffer.GetBuffer(), 0, checked((int)buffer.Length));
                    request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
                    request.Headers.TryAddWithoutValidation("X-File-Name", Uri.EscapeDataString(context.Request["name"] ?? ""));
                    request.Headers.TryAddWithoutValidation("X-File-Name-Encoding", "url");
                    using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.Response.ClientDisconnectedToken))
                    {
                    timeout.CancelAfter(TimeSpan.FromSeconds(120));
                    using (var response = await Client.SendAsync(request, timeout.Token))
                        Write(context, (int)response.StatusCode, ParseAgentResponse(await response.Content.ReadAsStringAsync()));
                    }
                }
            }
        }

        private static async Task UploadArtifact(HttpContext context, WebCadHost host, string sessionId)
        {
            if (context.Request.ContentLength > CadAttachmentBudget.ForName(context.Request["name"])) throw new HttpException(413, "Artifact exceeds its CAD file byte budget.");
            string commandId = SafeId(context.Request["commandId"]);
            string name = context.Request["name"], sha = context.Request["sha256"];
            string path = "/api/webcad/sessions/" + sessionId + "/artifacts?commandId=" + commandId + "&name=" + HttpUtility.UrlEncode(name) + "&sha256=" + HttpUtility.UrlEncode(sha);
            using (var request = Request(host, sessionId, "POST", path))
            using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60)))
            {
                request.Content = new StreamContent(context.Request.InputStream);
                request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
                using (var response = await Client.SendAsync(request, timeout.Token))
                {
                    var descriptor = ParseAgentResponse(await response.Content.ReadAsStringAsync());
                    if (response.IsSuccessStatusCode) descriptor["downloadUrl"] = "WebCADBridge.ashx?action=download&cadSessionId=" + sessionId + "&taskId=" + SafeId((string)descriptor["taskId"]) + "&fileId=" + SafeId((string)descriptor["fileId"]);
                    Write(context, (int)response.StatusCode, descriptor);
                }
            }
        }

        private static async Task UploadProjectFile(HttpContext context, WebCadHost host, string sessionId)
        {
            if (context.Request.ContentLength > 4 * 1024 * 1024) throw new HttpException(413, "Project chunk exceeds byte budget.");
            string path = "/api/webcad/sessions/" + sessionId + "/project-files?";
            foreach (string key in new[] { "name", "sha256", "kind", "leaseEpoch", "revision", "taskId", "part", "parts" })
                path += key + "=" + HttpUtility.UrlEncode(context.Request[key] ?? "") + "&";
            using (var request = Request(host, sessionId, "POST", path))
            using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(120)))
            {
                request.Content = new StreamContent(context.Request.InputStream);
                request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
                using (var response = await Client.SendAsync(request, timeout.Token))
                    Write(context, (int)response.StatusCode, ParseAgentResponse(await response.Content.ReadAsStringAsync()));
            }
        }

        private static async Task Download(HttpContext context, WebCadHost host)
        {
            if (context.Request.HttpMethod != "GET") throw new HttpException(405, "Use GET.");
            bool project = context.Request["action"] == "project-download";
            string sessionId = project ? null : SafeId(context.Request["cadSessionId"]);
            string path = project ? "/api/webcad/projects/" + SafeId(context.Request["conversationId"]) + "/files/" + SafeId(context.Request["fileId"]) : "/api/tasks/" + SafeId(context.Request["taskId"]) + "/files/" + SafeId(context.Request["fileId"]) + "/download?inline=" + (context.Request["inline"] == "true" ? "true" : "false");
            using (var request = Request(host, sessionId, "GET", path))
            using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.Response.ClientDisconnectedToken))
            {
                timeout.CancelAfter(TimeSpan.FromSeconds(60));
                using (var response = await Client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token))
                {
                    if (!response.IsSuccessStatusCode) { Write(context, (int)response.StatusCode, ParseAgentResponse(await response.Content.ReadAsStringAsync())); return; }
                    context.Response.BufferOutput = false;
                    context.Response.ContentType = response.Content.Headers.ContentType?.ToString() ?? "application/octet-stream";
                    if (response.Content.Headers.ContentDisposition != null) context.Response.AddHeader("Content-Disposition", response.Content.Headers.ContentDisposition.ToString());
                    using (Stream input = await response.Content.ReadAsStreamAsync()) await input.CopyToAsync(context.Response.OutputStream);
                }
            }
        }

        private static async Task Stream(HttpContext context, WebCadHost host)
        {
            if (context.Request.HttpMethod != "GET") throw new HttpException(405, "Use GET.");
            string sessionId = SafeId(context.Request["cadSessionId"]);
            var ticket = HttpRuntime.Cache.Remove("webcad-stream:" + context.Request["ticket"]) as StreamTicket;
            if (ticket == null || ticket.UserId != host.User.UserID || ticket.SessionId != sessionId || ticket.AgentKey != host.Target.Key) throw new HttpException(403, "Stream ticket expired or mismatched.");
            long after; if (!long.TryParse(context.Request["after"], out after) || after < 0) after = 0;
            try
            {
            using (var request = Request(host, sessionId, "GET", "/api/webcad/sessions/" + sessionId + "/events?after=" + after))
            using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.Response.ClientDisconnectedToken))
            {
                timeout.CancelAfter(TimeSpan.FromSeconds(110));
                request.Headers.Accept.Clear(); request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
                using (var response = await Client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token))
                {
                    if (!response.IsSuccessStatusCode) { Write(context, (int)response.StatusCode, ParseAgentResponse(await response.Content.ReadAsStringAsync())); return; }
                    context.Response.ContentType = "text/event-stream"; context.Response.BufferOutput = false;
                    context.Response.Cache.SetCacheability(HttpCacheability.NoCache);
                    // Commit the authenticated stream immediately, even when no
                    // queued CAD events exist and upstream is waiting for a heartbeat.
                    byte[] connected = Encoding.UTF8.GetBytes(": connected\n\n");
                    await context.Response.OutputStream.WriteAsync(connected, 0, connected.Length, timeout.Token);
                    context.Response.Flush();
                    using (Stream input = await response.Content.ReadAsStreamAsync())
                    {
                        byte[] buffer = new byte[8192]; int count;
                        while ((count = await input.ReadAsync(buffer, 0, buffer.Length, timeout.Token)) > 0)
                        { await context.Response.OutputStream.WriteAsync(buffer, 0, count, timeout.Token); context.Response.Flush(); }
                    }
                }
            }
            }
            catch (OperationCanceledException) { /* bounded stream ticket expires; reconnect using a new ticket */ }
        }

        private static async Task UploadArtifactChunk(HttpContext context, WebCadHost host, string sessionId)
        {
            int index;
            if (!int.TryParse(context.Request["index"], out index) || index < 0 || index > 1024 || context.Request.ContentLength > 4 * 1024 * 1024)
                throw new HttpException(413, "无效或超出上限的附件分片。");
            string hash = context.Request.Headers["X-Chunk-Sha256"];
            if (hash == null || !Regex.IsMatch(hash, "^[a-f0-9]{64}$")) throw new HttpException(400, "缺少分片摘要。");
            string path = "/api/webcad/sessions/" + sessionId + "/artifacts/uploads/" + SafeId(context.Request["uploadId"]) + "/chunks/" + index + "?commandId=" + SafeId(context.Request["commandId"]);
            using (var request = Request(host, sessionId, "PUT", path))
            using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60)))
            {
                request.Content = new StreamContent(context.Request.InputStream);
                request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
                request.Headers.TryAddWithoutValidation("X-Chunk-Sha256", hash);
                using (var response = await Client.SendAsync(request, timeout.Token))
                    Write(context, (int)response.StatusCode, ParseAgentResponse(await response.Content.ReadAsStringAsync()));
            }
        }

        private static JObject ParseAgentResponse(string raw)
        {
            try { return JObject.Parse(raw); }
            catch (JsonException)
            {
                // An upstream HTML/truncated response can follow a real task
                // acceptance. It is a transport failure, not a rejected user JSON.
                throw new InvalidDataException("CAD Agent response was not valid JSON.");
            }
        }

        private static void Write(HttpContext context, int status, object value)
        {
            context.Response.StatusCode = status; context.Response.TrySkipIisCustomErrors = true;
            context.Response.ContentType = "application/json; charset=utf-8";
            context.Response.Cache.SetCacheability(HttpCacheability.NoCache);
            context.Response.Write(JsonConvert.SerializeObject(value));
        }
    }
}
