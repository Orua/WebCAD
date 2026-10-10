<%@ WebHandler Language="C#" Class="WebCADServicesEntry" %>

using System.Threading.Tasks;
using System.Web;

// Single-file ASP.NET entry, like the existing LogoVector handler.
// IIS compiles this wrapper; the ERP project has no code-behind or build step.
public sealed class WebCADServicesEntry : HttpTaskAsyncHandler
{
    public override bool IsReusable { get { return true; } }

    public override Task ProcessRequestAsync(HttpContext context)
    {
        return new WebCADServices.Gateway.IisHandler().ProcessRequestAsync(context);
    }
}
