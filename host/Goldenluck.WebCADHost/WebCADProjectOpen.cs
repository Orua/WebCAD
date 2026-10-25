using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Goldenluck.WebCAD.Hosting
{
// One fixed host lifecycle endpoint; never accepts a URL or disk path.
public sealed class WebCADProjectOpen : HttpTaskAsyncHandler
{
    static readonly HttpClient Client = new HttpClient(new HttpClientHandler { UseProxy=false, AllowAutoRedirect=false }) { Timeout=TimeSpan.FromSeconds(30) };
    public override bool IsReusable { get { return true; } }
    public override async Task ProcessRequestAsync(HttpContext context)
    {
        context.Response.SuppressFormsAuthenticationRedirect=true;
        context.Response.TrySkipIisCustomErrors=true;
        context.Response.ContentType="application/json";
        context.Response.Cache.SetCacheability(HttpCacheability.NoCache);
        context.Response.Cache.SetNoStore();
        try
        {
            var host=WebCadHost.Resolve(context);
            if(context.Request.HttpMethod!="POST")throw new HttpException(405,"工程交接仅支持POST。");
            WebCadHost.RequireCsrf(context);
            string sessionId=context.Request.QueryString["cadSessionId"]??"";
            if(!Regex.IsMatch(sessionId,"^[a-f0-9]{32}$"))throw new HttpException(400,"无效的原会话ID。");
            byte[] bytes;
            using(var buffer=new MemoryStream())
            {
                byte[] chunk=new byte[4096];int count;
                while((count=await context.Request.InputStream.ReadAsync(chunk,0,chunk.Length))>0)
                {if(buffer.Length+count>16384)throw new HttpException(413,"交接参数超过限制。");buffer.Write(chunk,0,count);}
                bytes=buffer.ToArray();
            }
            var body=JObject.Parse(Encoding.UTF8.GetString(bytes));
            string method=(string)body["method"];
            if(method!="status"&&method!="claim"&&method!="update")throw new HttpException(400,"未知交接动作。");
            string path="/api/webcad/sessions/"+sessionId+"/project-open";
            using(var request=new HttpRequestMessage(HttpMethod.Post,host.Target.BaseUrl.TrimEnd('/')+path))
            {
                request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",host.Token(sessionId));
                request.Content=new ByteArrayContent(bytes);
                request.Content.Headers.ContentType=new MediaTypeHeaderValue("application/json");
                using(var result=await Client.SendAsync(request))
                {
                    string raw=await result.Content.ReadAsStringAsync();
                    if(raw.Length>65536)throw new HttpException(502,"交接回执超过限制，请查询原状态。");
                    JObject.Parse(raw); // Refuse HTML/login pages rather than forwarding them.
                    context.Response.StatusCode=(int)result.StatusCode;
                    context.Response.Write(raw);
                }
            }
        }
        catch(HttpException error){Write(context,error.GetHttpCode(),"PROJECT_OPEN_REQUEST_REJECTED",error.Message);}
        catch(JsonException){Write(context,502,"PROJECT_OPEN_RESPONSE_INVALID","交接参数或回执无效，请核对原交接；不会重放打开。");}
        catch(Exception){Write(context,502,"PROJECT_OPEN_CONNECTION_UNKNOWN","交接结果尚未确认，请读取原交接状态；不会重放打开。");}
    }
    static void Write(HttpContext context,int status,string code,string message)
    {context.Response.StatusCode=status;context.Response.Write(JsonConvert.SerializeObject(new {error=new {code=code,message=message}}));}
}

}
