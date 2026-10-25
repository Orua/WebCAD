using BLL;
using DAL;
using Main;
using Model;
using ChatClass.Agent;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.OpenSsl;
using Org.BouncyCastle.Security;
using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Web;

namespace Goldenluck.WebCAD.Hosting
{
    public sealed class WebCadSettings
    {
        public bool Enabled { get; set; }
        public string AgentTargetKey { get; set; } = "main";
        public string WebcadBasePath { get; set; } = "/webcad/";
        public string AgentWebcadBaseUrl { get; set; }
    }

    public sealed class WebCadHost
    {
        public const string CsrfCookie = "MOS_WebCAD_CSRF";
        public WebCadSettings Settings { get; private set; }
        public MOSUser User { get; private set; }
        public AgentTarget Target { get; private set; }
        public string PrivateKeyPath { get; private set; }

        public static WebCadHost Resolve(HttpContext context)
        {
            string file = context.Server.MapPath("~/App_Data/WebCADAgent.config.json");
            WebCadSettings settings = File.Exists(file) ? JsonConvert.DeserializeObject<WebCadSettings>(File.ReadAllText(file)) : null;
            if (settings == null || !settings.Enabled) throw new HttpException(503, "WebCAD Agent integration is disabled.");
            if (string.IsNullOrWhiteSpace(settings.WebcadBasePath) || !settings.WebcadBasePath.StartsWith("/") || settings.WebcadBasePath.StartsWith("//") || settings.WebcadBasePath.Contains("..") || settings.WebcadBasePath.Contains("?") || settings.WebcadBasePath.Contains("#")) throw new HttpException(503, "Invalid WebCAD deployment path.");
            Uri agentWebcad;
            if (!string.IsNullOrWhiteSpace(settings.AgentWebcadBaseUrl) &&
                (!Uri.TryCreate(settings.AgentWebcadBaseUrl, UriKind.Absolute, out agentWebcad) ||
                 (agentWebcad.Scheme != "http" && agentWebcad.Scheme != "https") || !string.IsNullOrEmpty(agentWebcad.UserInfo) ||
                 !string.IsNullOrEmpty(agentWebcad.Query) || !string.IsNullOrEmpty(agentWebcad.Fragment)))
                throw new HttpException(503, "Invalid Agent-accessible WebCAD URL.");
            MOSUser user = ResolveUser(context.Request);
            if (user == null || !user.IsActive) throw new HttpException(401, "Please sign in to Goldenluck.");
            if (!AgentAccessPolicy.CanUse(user, "webcad")) throw new HttpException(403, "当前账号没有 WebCAD Agent 使用权限。");
            var provider = new AgentSettingsProvider(context.Server.MapPath("~/App_Data/CodexAgent.config.json"), context.Server.MapPath("~/App_Data"));
            // The target is trusted deployment configuration, not a user-selected test target.
            AgentTarget target = provider.ResolveTarget(settings.AgentTargetKey, true);
            return new WebCadHost { Settings = settings, User = user, Target = target, PrivateKeyPath = provider.ResolvePrivateKeyPath(target.Settings) };
        }

        private static MOSUser ResolveUser(HttpRequest request)
        {
            int id;
            string raw = request.Cookies["MOS_UserID"] == null ? null : HttpUtility.UrlDecode(request.Cookies["MOS_UserID"].Value);
            string ticket = request.Cookies["MOS_Ticket"] == null ? null : HttpUtility.UrlDecode(request.Cookies["MOS_Ticket"].Value);
            if (!int.TryParse(raw, out id) || string.IsNullOrWhiteSpace(ticket)) return null;
            MOSUser user = DAL_MOSUser.GetDBUser(id);
            if (user == null) return null;
            string expected = Permission.IsHashedPassword(user.Password) ? Permission.CreateTicket(user) : Function.MD5(user.Password + "_GoldenLuck");
            return FixedEquals(ticket, expected) ? user : null;
        }

        public static string NewNonce()
        {
            byte[] bytes = new byte[32];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
            return Base64Url(bytes);
        }

        public static bool FixedEquals(string a, string b)
        {
            byte[] x = Encoding.UTF8.GetBytes(a ?? ""), y = Encoding.UTF8.GetBytes(b ?? "");
            int difference = x.Length ^ y.Length;
            for (int i = 0; i < Math.Max(x.Length, y.Length); i++) difference |= (i < x.Length ? x[i] : 0) ^ (i < y.Length ? y[i] : 0);
            return difference == 0 && x.Length > 0;
        }

        public static void RequireCsrf(HttpContext context)
        {
            HttpCookie cookie = context.Request.Cookies[CsrfCookie];
            string origin = context.Request.Headers["Origin"];
            if (cookie == null || !FixedEquals(cookie.Value, context.Request.Headers["X-CSRF-Token"]) ||
                (!string.IsNullOrEmpty(origin) && !string.Equals(origin, context.Request.Url.GetLeftPart(UriPartial.Authority), StringComparison.OrdinalIgnoreCase)))
                throw new HttpException(403, "Request validation failed.");
        }

        public string Token(string cadSessionId)
        {
            AgentSettings s = Target.Settings;
            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            JObject header = new JObject { ["alg"] = "RS256", ["typ"] = "JWT", ["kid"] = s.KeyId };
            JObject payload = new JObject
            {
                ["iss"] = s.Issuer, ["aud"] = s.Audience, ["sub"] = User.UserID.ToString(), ["name"] = User.UserName,
                ["role"] = User.IsAdmin ? "admin" : "user", ["isAdmin"] = User.IsAdmin, ["canViewQuotation"] = false, ["entry"] = "webcad", ["purpose"] = "webcad",
                ["modelAdmin"] = User.IsAdmin,
                ["cadScopes"] = new JArray("cad.read", "cad.edit", "cad.export"), ["cadSessionId"] = cadSessionId,
                ["iat"] = now, ["nbf"] = now, ["exp"] = now + Math.Min(s.TokenLifetimeSeconds, 300), ["jti"] = Guid.NewGuid().ToString("N")
            };
            string unsigned = Base64Url(Encoding.UTF8.GetBytes(header.ToString(Formatting.None))) + "." + Base64Url(Encoding.UTF8.GetBytes(payload.ToString(Formatting.None)));
            object keyObject;
            using (TextReader reader = File.OpenText(PrivateKeyPath)) keyObject = new PemReader(reader).ReadObject();
            var pair = keyObject as AsymmetricCipherKeyPair;
            AsymmetricKeyParameter key = pair != null ? pair.Private : keyObject as AsymmetricKeyParameter;
            if (key == null || !key.IsPrivate) throw new HttpException(503, "Agent signing key is unavailable.");
            ISigner signer = SignerUtilities.GetSigner("SHA256withRSA");
            signer.Init(true, key);
            byte[] bytes = Encoding.ASCII.GetBytes(unsigned);
            signer.BlockUpdate(bytes, 0, bytes.Length);
            return unsigned + "." + Base64Url(signer.GenerateSignature());
        }

        private static string Base64Url(byte[] bytes) { return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_'); }
    }
}
