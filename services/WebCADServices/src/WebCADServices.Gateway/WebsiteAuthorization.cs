using System;
using System.Configuration;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;

namespace WebCADServices.Gateway
{
    // Reuse the existing WebCAD host's short-lived signed assertion. Only the
    // public verification key is shared; the dedicated compute secret stays in
    // the original protected runtime and never becomes readable by the host.
    public static class WebsiteAuthorization
    {
        static byte[] Decode(string value) { string text=value.Replace('-','+').Replace('_','/');return Convert.FromBase64String(text.PadRight((text.Length+3)/4*4,'=')); }
        public static bool Verify(string token,string publicXml,string method,long now)
        {
            try
            {
                if(string.IsNullOrEmpty(token)||token.Length>8192||publicXml.Length>16384)return false;
                var parts=token.Split('.');if(parts.Length!=3)return false;
                var header=JObject.Parse(Encoding.UTF8.GetString(Decode(parts[0])));var claims=JObject.Parse(Encoding.UTF8.GetString(Decode(parts[1])));
                if((string)header["alg"]!="RS256"||(string)header["typ"]!="JWT")return false;
                if((string)claims["iss"]!="goldenfu-webforms"||(string)claims["aud"]!="codex-python-api"||(string)claims["purpose"]!="webcad"||(string)claims["entry"]!="webcad")return false;
                if(claims["exp"]?.Type!=JTokenType.Integer||claims["nbf"]?.Type!=JTokenType.Integer||claims["iat"]?.Type!=JTokenType.Integer)return false;
                long expires=(long)claims["exp"],issued=(long)claims["iat"],validFrom=(long)claims["nbf"];
                if(expires<=now||validFrom>now+5||issued>now+5||expires-issued>300||expires<=issued||now-issued>300)return false;
                if(string.IsNullOrWhiteSpace((string)claims["sub"])||string.IsNullOrWhiteSpace((string)claims["jti"])||string.IsNullOrWhiteSpace((string)claims["cadSessionId"]))return false;
                var scopes=claims["cadScopes"] as JArray;if(scopes==null||!scopes.Values<string>().Contains("cad.read")||(method!="GET"&&!scopes.Values<string>().Contains("cad.edit")))return false;
                using(var rsa=new RSACryptoServiceProvider()){rsa.PersistKeyInCsp=false;rsa.FromXmlString(publicXml);return rsa.VerifyData(Encoding.ASCII.GetBytes(parts[0]+"."+parts[1]),CryptoConfig.MapNameToOID("SHA256"),Decode(parts[2]));}
            }
            catch{return false;}
        }
        internal static void Require(string token,string method)
        {
            string file=ConfigurationManager.AppSettings["WebCAD.WebsitePublicKeyFile"];
            if(string.IsNullOrEmpty(file))file=Path.Combine(Path.GetDirectoryName(System.Web.HttpContext.Current.Request.PhysicalPath),"runtime","website-public-key.xml");
            if(string.IsNullOrEmpty(file)||!Verify(token,File.ReadAllText(file),method,DateTimeOffset.UtcNow.ToUnixTimeSeconds()))throw new ServiceError("UNAUTHORIZED","网站计算授权无效或已过期，请重新登录。",401);
        }
    }
}
