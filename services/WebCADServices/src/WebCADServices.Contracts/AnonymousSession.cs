using System;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace WebCADServices.Contracts
{
    // A compute-only visitor identity. Website cookies and user ids are never authority.
    public static class AnonymousSession
    {
        public const int LifetimeSeconds = 7200;
        static readonly DateTime Epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        public static long Seconds(DateTime now) => (long)(now.ToUniversalTime() - Epoch).TotalSeconds;
        static string Signature(string payload, string secret)
        {
            using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret)))
                return BitConverter.ToString(hmac.ComputeHash(Encoding.UTF8.GetBytes("webcad-compute-session\n" + payload))).Replace("-", "").ToLowerInvariant();
        }
        public static string Issue(string secret, DateTime now)
        {
            var bytes = new byte[32]; using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
            string payload = "anon1." + BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant() + "." + (Seconds(now) + LifetimeSeconds).ToString(CultureInfo.InvariantCulture);
            return payload + "." + Signature(payload, secret);
        }
        public static bool TryValidate(string value, string secret, DateTime now, out string owner, out long expires)
        {
            owner = null; expires = 0;
            if (value == null || !Regex.IsMatch(value, "^anon1\\.[a-f0-9]{64}\\.[0-9]{10}\\.[a-f0-9]{64}$")) return false;
            var parts = value.Split('.');
            if (!long.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out expires) || expires <= Seconds(now) || expires > Seconds(now) + LifetimeSeconds) return false;
            string expected = Signature(string.Join(".", parts, 0, 3), secret); int diff = 0;
            for (int i = 0; i < expected.Length; i++) diff |= expected[i] ^ parts[3][i];
            if (diff != 0) return false;
            owner = "anonymous:" + parts[1]; return true;
        }
        public static bool IsOwner(string owner) => owner != null && Regex.IsMatch(owner, "^anonymous:[a-f0-9]{64}$");
    }
}
