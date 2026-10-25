using System;
using WebCADServices.Gateway;
class SameOriginTests
{
    static void Check(bool value, string label) { if (!value) throw new Exception(label); }
    static int Main()
    {
        var site = new Uri("https://goldenfu.cn/cadservices/api.ashx");
        Check(IisHandler.SameOrigin(site,"https://goldenfu.cn",null,null),"Same-origin POST");
        Check(IisHandler.SameOrigin(site,null,"https://goldenfu.cn/webcad/","same-origin"),"Same-origin GET");
        Check(IisHandler.SameOrigin(site,null,null,"same-origin"),"Browser same-origin metadata");
        Check(!IisHandler.SameOrigin(site,null,null,null),"Unclassified client requires bearer");
        Check(!IisHandler.SameOrigin(site,"https://evil.invalid","https://goldenfu.cn/webcad/","same-origin"),"Foreign Origin wins over spoofed metadata");
        Check(!IisHandler.SameOrigin(site,"null",null,"same-origin"),"Opaque Origin");
        Check(!IisHandler.SameOrigin(site,"https://sub.goldenfu.cn",null,null),"Subdomain differs");
        Check(!IisHandler.SameOrigin(site,"http://goldenfu.cn",null,null),"Scheme differs");
        Check(!IisHandler.SameOrigin(site,"https://goldenfu.cn:8443",null,null),"Port differs");
        Check(!IisHandler.SameOrigin(site,null,"https://goldenfu.cn/webcad/","cross-site"),"Cross-site metadata");
        Console.WriteLine("10 same-origin boundary cases passed"); return 0;
    }
}
