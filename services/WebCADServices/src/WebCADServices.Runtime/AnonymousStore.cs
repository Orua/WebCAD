using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;

namespace WebCADServices.Runtime
{
    public sealed partial class Store
    {
        DateTime lastAnonymousCleanup = DateTime.MinValue;
        const long AnonymousStorageLimit = 1024L * 1024 * 1024;
        long Number(string sql, params object[] args) { var row = Read(sql, args); return row == null ? 0 : (long)row["n"]; }
        public void VisitAnonymous(string owner, long expires, string method)
        {
            lock (gate)
            {
                PruneAnonymous();
                long now = AnonymousSession.Seconds(DateTime.UtcNow), window = now / 60;
                if (!AnonymousSession.IsOwner(owner) || expires <= now) throw new ServiceError("SESSION_EXPIRED", "Compute session expired", 401);
                if (Read("SELECT owner FROM anonymous_sessions WHERE owner=@p0", owner) == null)
                {
                    if (Number("SELECT COUNT(*) AS n FROM anonymous_sessions") >= 128) throw new ServiceError("QUEUE_LIMIT", "Public compute is busy; try later", 429);
                    Execute("INSERT INTO anonymous_sessions(owner,expires,window,reads,writes) VALUES(@p0,@p1,@p2,0,0)", owner, expires, window);
                }
                Execute("UPDATE anonymous_sessions SET window=@p1,reads=0,writes=0 WHERE owner=@p0 AND window<>@p1", owner, window);
                var row = Read("SELECT reads,writes FROM anonymous_sessions WHERE owner=@p0", owner);
                if ((long)row["reads"] >= 180 || method != "GET" && (long)row["writes"] >= 20) throw new ServiceError("RATE_LIMIT", "Compute request limit reached; wait one minute", 429);
                Execute("UPDATE anonymous_sessions SET reads=reads+1,writes=writes+@p1 WHERE owner=@p0", owner, method == "GET" ? 0 : 1);
            }
        }
        void AnonymousAssetBudget(string owner, int bytes)
        {
            if (!AnonymousSession.IsOwner(owner)) return;
            if (bytes > Protocol.MaxUpload || Number("SELECT COALESCE(SUM(bytes),0) AS n FROM assets WHERE owner=@p0", owner) + bytes > 64L * 1024 * 1024)
                throw new ServiceError("SIZE_LIMIT", "Visitor uploads are limited to 20 MiB per file and 64 MiB per session", 413);
            AnonymousGlobalBudget(bytes);
        }
        void AnonymousGlobalBudget(int bytes)
        {
            if (Number("SELECT COALESCE(SUM(bytes),0) AS n FROM assets WHERE owner LIKE 'anonymous:%'") + Number("SELECT COALESCE(SUM(bytes),0) AS n FROM artifacts WHERE owner LIKE 'anonymous:%'") + bytes > AnonymousStorageLimit)
                throw new ServiceError("STORAGE_LIMIT", "Public compute temporary storage is full", 429);
        }
        void AnonymousJobBudget(string owner)
        {
            if (!AnonymousSession.IsOwner(owner)) return;
            if (Number("SELECT COUNT(*) AS n FROM jobs WHERE owner=@p0", owner) >= 10 || Number("SELECT COUNT(*) AS n FROM jobs WHERE owner=@p0 AND state IN ('queued','running')", owner) >= 2 || Number("SELECT COUNT(*) AS n FROM jobs WHERE owner LIKE 'anonymous:%' AND state IN ('queued','running')") >= 32)
                throw new ServiceError("QUEUE_LIMIT", "Public compute permits two active jobs and ten jobs per visitor session", 429);
        }
        void AddArtifact(string owner, string id, byte[] bytes, string sha)
        {
            lock (gate)
            {
                if (AnonymousSession.IsOwner(owner))
                {
                    if (Number("SELECT COALESCE(SUM(bytes),0) AS n FROM artifacts WHERE owner=@p0", owner) + bytes.Length > 128L * 1024 * 1024) throw new ServiceError("SIZE_LIMIT", "Visitor results exceed the 128 MiB session budget", 413);
                    AnonymousGlobalBudget(bytes.Length);
                }
                string path = Path.Combine(Root, "artifacts", id); Atomic(path, bytes);
                try { Execute("INSERT INTO artifacts VALUES(@p0,@p1,@p2,@p3)", id, owner, sha, bytes.Length); }
                catch { File.Delete(path); throw; }
            }
        }
        // Expiration requests cancellation first. Files are removed only after the
        // controlled worker has left its running state; internal owners are untouched.
        public void PruneAnonymous()
        {
            lock (gate)
            {
                if ((DateTime.UtcNow - lastAnonymousCleanup).TotalSeconds < 60) return;
                lastAnonymousCleanup = DateTime.UtcNow;
                long now = AnonymousSession.Seconds(DateTime.UtcNow); var expired = new List<string>();
                using (var command = Command("SELECT owner FROM anonymous_sessions WHERE expires<=@p0", now))
                using (var reader = command.ExecuteReader()) while (reader.Read()) expired.Add((string)reader["owner"]);
                foreach (string owner in expired)
                {
                    Execute("UPDATE jobs SET cancel=1,state=CASE WHEN state='queued' THEN 'cancelled' ELSE state END WHERE owner=@p0 AND state IN ('queued','running','interrupted')", owner);
                    if (Number("SELECT COUNT(*) AS n FROM jobs WHERE owner=@p0 AND state='running'", owner) != 0) continue;
                    try
                    {
                        var priorJobs=new List<string>();
                        using(var command=Command("SELECT id FROM jobs WHERE owner=@p0",owner))
                        using(var reader=command.ExecuteReader())while(reader.Read())priorJobs.Add((string)reader["id"]);
                        // Restart reconciliation marks running rows interrupted;
                        // that alone is not proof a prior worker has exited.
                        bool active=false;
                        foreach(string id in priorJobs)
                        {
                            try { AssertWorkerStopped(id); }
                            catch(ServiceError error) { if(error.Code!="RECOVERY_WORKER_ACTIVE")throw;active=true;break; }
                        }
                        if(active)continue;
                        foreach (string table in new[] { "assets", "artifacts", "jobs" })
                        {
                            var ids = new List<string>();
                            using (var command = Command("SELECT id FROM " + table + " WHERE owner=@p0", owner))
                            using (var reader = command.ExecuteReader()) while (reader.Read()) ids.Add((string)reader["id"]);
                            foreach (string id in ids)
                            {
                                if (!System.Text.RegularExpressions.Regex.IsMatch(id, "^[a-f0-9]{32}$")) throw new IOException("Invalid stored resource identity");
                                string path = Path.Combine(Root, table, id);
                                if (Directory.Exists(path)) DeleteAnonymousDirectory(path);
                                else if (File.Exists(path)) { if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("Linked resource"); File.Delete(path); }
                            }
                        }
                        using (var transaction = db.BeginTransaction())
                        {
                            Execute("DELETE FROM attempts WHERE job IN (SELECT id FROM jobs WHERE owner=@p0)", owner);
                            Execute("DELETE FROM job_events WHERE job IN (SELECT id FROM jobs WHERE owner=@p0)", owner);
                            foreach (string table in new[] { "client_keys", "jobs", "assets", "artifacts", "anonymous_sessions" }) Execute("DELETE FROM " + table + " WHERE owner=@p0", owner);
                            transaction.Commit();
                        }
                    }
                    catch (IOException) { /* Retain rows for the next bounded cleanup. */ }
                    catch (UnauthorizedAccessException) { }
                }
            }
        }
        static void DeleteAnonymousDirectory(string path)
        {
            if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("Linked job directory");
            foreach (string child in Directory.GetFileSystemEntries(path))
            {
                var attrs = File.GetAttributes(child);
                if ((attrs & FileAttributes.ReparsePoint) != 0) throw new IOException("Linked job resource");
                if ((attrs & FileAttributes.Directory) != 0) DeleteAnonymousDirectory(child); else File.Delete(child);
            }
            Directory.Delete(path);
        }
    }
}
