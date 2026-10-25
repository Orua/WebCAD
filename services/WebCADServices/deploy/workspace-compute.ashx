<%@ WebHandler Language="C#" Class="WebCADComputeEntry" %>
<%@ Assembly Name="System.Net.Http, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a" %>
<%@ Assembly Name="System.Security, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a" %>
using System;
using System.IO;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web;

// Compatibility entrance only. Current clients call same-origin /cadservices/api.ashx.
// This adapter has no ERP login, Web.dll or signing-key dependency.
public sealed class WebCADComputeEntry : HttpTaskAsyncHandler
{
    static readonly HttpClient Client = new HttpClient(new HttpClientHandler { UseProxy=false, AllowAutoRedirect=false }) { Timeout=TimeSpan.FromSeconds(35) };
    public static Uri GatewayUri(Uri siteUrl,string applicationPath,string route)
    {
        // Resolve inside this website/application. Loopback without the site's
        // authority can select an unrelated IIS default site after deployment.
        string path=VirtualPathUtility.ToAbsolute("~/cadservices/api.ashx",applicationPath);
        return new UriBuilder(new Uri(siteUrl,path)) { Query="route="+Uri.EscapeDataString(route) }.Uri;
    }
    public override bool IsReusable { get { return true; } }
    public override async Task ProcessRequestAsync(HttpContext context)
    {
        var response=context.Response;
        response.SuppressFormsAuthenticationRedirect=true;response.TrySkipIisCustomErrors=true;
        response.Cache.SetCacheability(HttpCacheability.NoCache);response.Cache.SetNoStore();
        try
        {
            string origin=context.Request.Headers["Origin"],own=context.Request.Url.GetLeftPart(UriPartial.Authority);
            if(!string.IsNullOrEmpty(origin) && origin!=own)throw new HttpException(403,"计算请求来源无效。");
            if(context.Request.HttpMethod=="OPTIONS")
            {
                if(origin!=own)throw new HttpException(403,"计算请求来源无效。");
                response.AddHeader("Access-Control-Allow-Headers","Content-Type,X-WebCAD-Compute,X-File-Name,X-Asset-Kind,Idempotency-Key");response.AddHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");response.StatusCode=204;return;
            }
            if(context.Request.Headers["X-WebCAD-Compute"]!="1")throw new HttpException(403,"请从 WebCAD 计算工具发起请求。");
            if(context.Request.HttpMethod!="GET" && context.Request.HttpMethod!="POST")throw new HttpException(405,"计算入口仅支持 GET/POST。");
            string route=context.Request.QueryString["route"]??"/v1/capabilities";
            if(!Regex.IsMatch(route,"^/v1/(health|capabilities|assets|logo/(inspect|convert)|compute/jobs|jobs/[a-f0-9]{32}(/(cancel|recover|result))?|requests/[a-zA-Z0-9_-]{1,160}(/result)?|artifacts/[a-zA-Z0-9_-]{1,160})$"))throw new HttpException(400,"计算任务地址无效。");
            int limit=context.Request.Headers["X-Asset-Kind"]=="mesh"?128*1024*1024:20*1024*1024;
            if(context.Request.ContentLength>limit)throw new HttpException(413,"计算输入超过容量限制。");
            using(var request=new HttpRequestMessage(new HttpMethod(context.Request.HttpMethod),GatewayUri(context.Request.Url,context.Request.ApplicationPath,route)))
            {
                request.Headers.TryAddWithoutValidation("Origin",own);
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
                    if((int)result.StatusCode==404){Write(context,502,"COMPUTE_BACKEND_NOT_FOUND","后台计算接口未找到，请管理员核对当前网站应用下的 cadservices/api.ashx。当前工程保留。");return;}
                    if((int)result.StatusCode==401){Write(context,502,"COMPUTE_BACKEND_AUTH_REJECTED","后台计算尚未安装同域免鉴权版本，请核对 Services 发布。当前工程保留。");return;}
                    response.StatusCode=(int)result.StatusCode;response.ContentType=result.Content.Headers.ContentType==null?"application/json":result.Content.Headers.ContentType.ToString();
                    foreach(string name in new[]{"X-WebCAD-Transport","X-WebCAD-Gateway-Build"}){System.Collections.Generic.IEnumerable<string> values;if(result.Headers.TryGetValues(name,out values))response.AddHeader(name,string.Join(",",values));}
                    await result.Content.CopyToAsync(response.OutputStream);
                }
            }
        }
        catch(HttpException error){Write(context,error.GetHttpCode(),"COMPUTE_REQUEST_REJECTED",error.Message);}
        catch(Exception){Write(context,503,"COMPUTE_CONNECTION_UNAVAILABLE","后台计算暂不可用，请保留当前工程并联系管理员核对计算程序配置。");}
    }
    static void Write(HttpContext context,int status,string code,string message){context.Response.StatusCode=status;context.Response.ContentType="application/json";context.Response.Write(new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new {code=code,message=message}));}
}
