<%@ WebHandler Language="C#" Class="WebCADComputeEntry" %>
<%@ Assembly Name="System.Net.Http, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a" %>
<%@ Assembly Name="System.Security, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a" %>
using System;
using System.IO;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web;

// Uses the existing signed-in WebCAD permission. The backend credential never
// enters browser storage, public configuration, responses or log files.
public sealed class WebCADComputeEntry : HttpTaskAsyncHandler
{
    static readonly HttpClient Client = new HttpClient(new HttpClientHandler { UseProxy=false, AllowAutoRedirect=false }) { Timeout=TimeSpan.FromSeconds(35) };
    public override bool IsReusable { get { return true; } }
    public override async Task ProcessRequestAsync(HttpContext context)
    {
        var response=context.Response;
        response.SuppressFormsAuthenticationRedirect=true;response.TrySkipIisCustomErrors=true;
        response.Cache.SetCacheability(HttpCacheability.NoCache);response.Cache.SetNoStore();
        try
        {
            string origin=context.Request.Headers["Origin"],own=context.Request.Url.GetLeftPart(UriPartial.Authority);
            bool localEditor=context.Request.IsLocal && context.Request.Url.Host=="127.0.0.1" && origin=="http://127.0.0.1:17674";
            if(!string.IsNullOrEmpty(origin) && origin!=own && !localEditor)throw new HttpException(403,"计算请求来源无效。");
            if(localEditor){response.AddHeader("Access-Control-Allow-Origin",origin);response.AddHeader("Access-Control-Allow-Credentials","true");response.AddHeader("Vary","Origin");}
            if(context.Request.HttpMethod=="OPTIONS")
            {
                if(!localEditor)throw new HttpException(403,"计算请求来源无效。");
                response.AddHeader("Access-Control-Allow-Headers","Content-Type,X-WebCAD-Compute,X-File-Name,X-Asset-Kind,Idempotency-Key");response.AddHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");response.StatusCode=204;return;
            }
            if(context.Request.Headers["X-WebCAD-Compute"]!="1")throw new HttpException(403,"请从 WebCAD 计算工具发起请求。");
            var host=Web.AI.WebCAD.WebCadHost.Resolve(context);
            if(context.Request.HttpMethod!="GET" && context.Request.HttpMethod!="POST")throw new HttpException(405,"计算入口仅支持 GET/POST。");
            string route=context.Request.QueryString["route"]??"/v1/capabilities";
            if(!Regex.IsMatch(route,"^/v1/(health|capabilities|assets|logo/(inspect|convert)|compute/jobs|jobs/[a-f0-9]{32}(/(cancel|recover|result))?|requests/[a-zA-Z0-9_-]{1,160}(/result)?|artifacts/[a-zA-Z0-9_-]{1,160})$"))throw new HttpException(400,"计算任务地址无效。");
            int limit=context.Request.Headers["X-Asset-Kind"]=="mesh"?128*1024*1024:20*1024*1024;
            if(context.Request.ContentLength>limit)throw new HttpException(413,"计算输入超过容量限制。");
            using(var request=new HttpRequestMessage(new HttpMethod(context.Request.HttpMethod),"http://127.0.0.1/cadservices/api.ashx?route="+Uri.EscapeDataString(route)))
            {
                request.Headers.TryAddWithoutValidation("X-WebCAD-Website-Token",host.Token(Web.AI.WebCAD.WebCadHost.NewNonce()));
                foreach(string name in new[]{"X-File-Name","X-Asset-Kind","Idempotency-Key"})if(context.Request.Headers[name]!=null)request.Headers.TryAddWithoutValidation(name,context.Request.Headers[name]);
                if(context.Request.HttpMethod=="POST")
                {
                    using(var buffer=new MemoryStream())
                    {
                        byte[] chunk=new byte[65536];int read;
                        while((read=await context.Request.InputStream.ReadAsync(chunk,0,chunk.Length))>0){if(buffer.Length+read>limit)throw new HttpException(413,"计算输入超过容量限制。");buffer.Write(chunk,0,read);}
                        request.Content=new ByteArrayContent(buffer.ToArray());
                    }
                    request.Content.Headers.TryAddWithoutValidation("Content-Type",context.Request.ContentType??"application/json");
                }
                using(var result=await Client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead))
                {
                    response.StatusCode=(int)result.StatusCode;response.ContentType=result.Content.Headers.ContentType==null?"application/json":result.Content.Headers.ContentType.ToString();
                    await result.Content.CopyToAsync(response.OutputStream);
                }
            }
        }
        catch(HttpException error){Write(context,error.GetHttpCode(),error.GetHttpCode()==401?"SIGN_IN_REQUIRED":"COMPUTE_REQUEST_REJECTED",error.GetHttpCode()==401?"请先登录当前网站，再连接后台计算。":error.Message);}
        catch(Exception){Write(context,503,"COMPUTE_CONNECTION_UNAVAILABLE","后台计算暂不可用，请保留当前工程并联系管理员核对计算程序配置。");}
    }
    static void Write(HttpContext context,int status,string code,string message){context.Response.StatusCode=status;context.Response.ContentType="application/json";context.Response.Write(new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new {code=code,message=message}));}
}
