using Newtonsoft.Json;
using System;
using System.Web;
using System.Web.UI;

namespace Goldenluck.WebCAD.Hosting
{
    public partial class WebCADWorkspace : Page
    {
        public string BootstrapJson { get; private set; } = "{}";
        protected void Page_Load(object sender, EventArgs e)
        {
            WebCadHost host;
            try { host = WebCadHost.Resolve(Context); }
            catch (HttpException ex) when (ex.GetHttpCode() == 401)
            {
                Response.Redirect("~/Login.aspx?ReturnUrl=" + HttpUtility.UrlEncode(Request.RawUrl), true);
                return;
            }
            string csrf = Request.Cookies[WebCadHost.CsrfCookie]?.Value;
            if (csrf == null || !System.Text.RegularExpressions.Regex.IsMatch(csrf, "^[a-zA-Z0-9_-]{43}$")) csrf = WebCadHost.NewNonce();
            Response.Cookies.Set(new HttpCookie(WebCadHost.CsrfCookie, csrf) { HttpOnly = true, Secure = Request.IsSecureConnection, SameSite = SameSiteMode.Strict, Path = "/AI/WebCAD/" });
            Response.Cache.SetCacheability(HttpCacheability.NoCache); Response.Cache.SetNoStore();
            BootstrapJson = JsonConvert.SerializeObject(new { csrf, pageUrl = host.Settings.WebcadBasePath,
                bridge = "WebCADBridge.ashx", agentTarget = host.Target.Key, userId = host.User.UserID, protocol = "goldenluck.webcad/1" }).Replace("<", "\\u003c");
        }
    }
}
