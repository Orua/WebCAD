using System;
using System.Data.SQLite;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using WebCADServices.Contracts;

namespace WebCADServices.Runtime
{
    // Host owns the database. Every mutation uses a database transaction, never an in-memory queue.
    public sealed class Store : IDisposable
    {
        readonly SQLiteConnection db;
        readonly FileStream hostLease;
        readonly object gate = new object();
        public string Root { get; }
        public Store(string root)
        {
            Root = Path.GetFullPath(root);
            Directory.CreateDirectory(Root);
            if ((File.GetAttributes(Root) & FileAttributes.ReparsePoint) != 0) throw new ServiceError("DATA_ROOT_INVALID", "Data root must not be a reparse point");
            try{hostLease=new FileStream(Path.Combine(Root,".host.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);}
            catch(IOException){throw new ServiceError("DATA_ROOT_IN_USE","Another Host owns this data root; running jobs were not modified",409);}
            try{
            foreach (var name in new[] { "assets", "artifacts", "jobs" }) Directory.CreateDirectory(Path.Combine(Root, name));
            db = new SQLiteConnection(new SQLiteConnectionStringBuilder { DataSource = Path.Combine(Root, "jobs.db"), ForeignKeys = true }.ConnectionString); db.Open();
            Execute("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,sha TEXT NOT NULL,bytes INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,owner TEXT NOT NULL,sha TEXT NOT NULL,bytes INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,idem TEXT NOT NULL,fingerprint TEXT NOT NULL,request TEXT NOT NULL,state TEXT NOT NULL,created TEXT NOT NULL,result TEXT,error TEXT,cancel INTEGER NOT NULL DEFAULT 0,UNIQUE(owner,idem)); CREATE TABLE IF NOT EXISTS job_events(job TEXT NOT NULL,state TEXT NOT NULL,time TEXT NOT NULL); CREATE TABLE IF NOT EXISTS attempts(job TEXT NOT NULL,pid INTEGER,started TEXT NOT NULL,finished TEXT,exit_code INTEGER);");
            bool hasPayloadHash = false; using (var command = Command("PRAGMA table_info(jobs)")) using (var reader = command.ExecuteReader()) while (reader.Read()) if ((string)reader["name"] == "payload_hash") hasPayloadHash = true;
            if (!hasPayloadHash) Execute("ALTER TABLE jobs ADD COLUMN payload_hash TEXT");
            EnsureColumn("assets", "kind", "TEXT NOT NULL DEFAULT 'logo'");
            EnsureColumn("jobs", "engine", "TEXT NOT NULL DEFAULT 'logo'");
            Execute("CREATE INDEX IF NOT EXISTS jobs_execution_queue ON jobs(owner,engine,state)");
            Execute("CREATE TABLE IF NOT EXISTS client_keys(owner TEXT NOT NULL,idem TEXT NOT NULL,payload_hash TEXT NOT NULL,job TEXT NOT NULL,PRIMARY KEY(owner,idem)); INSERT OR IGNORE INTO client_keys(owner,idem,payload_hash,job) SELECT owner,idem,COALESCE(payload_hash,''),id FROM jobs;");
            EnsureColumn("client_keys","binding_json","TEXT");
            Execute("UPDATE jobs SET state='interrupted',error='Host restarted during execution; inspect job before retry' WHERE state='running'");
            }catch{db?.Dispose();hostLease.Dispose();throw;}
        }
        void EnsureColumn(string table,string name,string definition) { bool found=false;using(var command=Command("PRAGMA table_info("+table+")"))using(var reader=command.ExecuteReader())while(reader.Read())if((string)reader["name"]==name)found=true;if(!found)Execute("ALTER TABLE "+table+" ADD COLUMN "+name+" "+definition); }
        SQLiteCommand Command(string sql, params object[] args)
        {
            var command = new SQLiteCommand(sql, db); for (int i = 0; i < args.Length; i++) command.Parameters.AddWithValue("@p" + i, args[i] ?? DBNull.Value); return command;
        }
        void Execute(string sql, params object[] args) { using (var command = Command(sql, args)) command.ExecuteNonQuery(); }
        public JObject NativeQueue(string owner)
        {
            lock(gate)
            {
                int queued=0,running=0;
                using(var command=Command("SELECT state,COUNT(*) AS count FROM jobs WHERE owner=@p0 AND engine='occt' AND state IN ('queued','running') GROUP BY state",owner))
                using(var reader=command.ExecuteReader())while(reader.Read())
                {
                    int count=Convert.ToInt32(reader["count"]);
                    if((string)reader["state"]=="queued")queued=count;else running=count;
                }
                return new JObject { ["queued"]=queued,["running"]=running,["parallelism"]=1,["snapshotAt"]=DateTime.UtcNow.ToString("o"),["remainingDurationKnown"]=false };
            }
        }
        JObject Read(string sql, params object[] args)
        {
            using (var command = Command(sql, args)) using (var reader = command.ExecuteReader())
            { if (!reader.Read()) return null; var row = new JObject(); for (int i = 0; i < reader.FieldCount; i++) row[reader.GetName(i)] = reader.IsDBNull(i) ? JValue.CreateNull() : JToken.FromObject(reader.GetValue(i)); return row; }
        }
        public JObject Asset(string owner, string id)
        {
            lock (gate) return Read("SELECT * FROM assets WHERE id=@p0 AND owner=@p1", id, owner) ?? throw new ServiceError("ASSET_NOT_FOUND", "Asset is not owned by this principal", 404);
        }
        public JObject AddAsset(string owner, string name, byte[] bytes, string kind = "logo")
        {
            if (!new[] { "logo", "brep" }.Contains(kind)) throw new ServiceError("PARAM_SCHEMA_INVALID", "Unknown asset role");
            if (bytes == null || bytes.Length == 0 || bytes.Length > Protocol.MaxUpload) throw new ServiceError("SIZE_LIMIT", "Resource limit is 20 MiB", 413);
            if (string.IsNullOrEmpty(name) || name.Length > 160 || name != Path.GetFileName(name) || name.Contains("\\") || name.Contains("/")) throw new ServiceError("PARAM_SCHEMA_INVALID", "Source name must be a display filename");
            string id = Guid.NewGuid().ToString("N"), sha = Protocol.Hash(bytes); Atomic(Path.Combine(Root, "assets", id), bytes);
            lock (gate) Execute("INSERT INTO assets(id,owner,name,sha,bytes,kind) VALUES(@p0,@p1,@p2,@p3,@p4,@p5)", id, owner, name, sha, bytes.Length, kind);
            return new JObject { ["assetId"] = id, ["sha256"] = sha, ["bytes"] = bytes.Length };
        }
        public JObject Submit(string owner, string idem, JObject request, JObject clientRequest = null)
            => SubmitCore(owner,idem,request,clientRequest,null);
        public JObject Recover(string owner,string jobId,string idem,string reason,JObject validatedPayload)
        {
            if(string.IsNullOrWhiteSpace(reason)||reason.Length>240)throw new ServiceError("RECOVERY_REASON_REQUIRED","Explain the reviewed environment interruption",409);
            var candidate=(JObject)validatedPayload.DeepClone();candidate["recovery"]=new JObject{["supersedesJobId"]=jobId,["reason"]=reason,["attempt"]=1};
            return SubmitCore(owner,idem,candidate,new JObject{["supersedesJobId"]=jobId,["reason"]=reason,["approved"]=true},jobId);
        }
        public JObject RecoveryPayload(string owner,string jobId){lock(gate){var row=Read("SELECT * FROM jobs WHERE owner=@p0 AND id=@p1",owner,jobId)??throw new ServiceError("JOB_NOT_FOUND","Job not owned by principal",404);return JObject.Parse((string)row["request"]);}}
        void AssertRecoverable(JObject row,string owner,string previous)
        {
            if((string)row["id"]!=previous||(string)row["state"]!="interrupted"||row["result"].Type!=JTokenType.Null||(long)row["cancel"]!=0||JObject.Parse((string)row["request"])["recovery"]!=null)throw new ServiceError("RECOVERY_NOT_ALLOWED","Only one reviewed environment interruption without a result may resume; geometry failures remain blocked",409);
            foreach(string file in new[]{"geometry.brep","result.partial.json"})if(File.Exists(Path.Combine(Root,"jobs",previous,file)))throw new ServiceError("RECOVERY_RESULT_UNRESOLVED","Inspect existing unpublished result before recovery",409);
            using(var command=Command("SELECT pid FROM attempts WHERE job=@p0 AND pid>0",previous))using(var reader=command.ExecuteReader())while(reader.Read()){
                try{using(var process=System.Diagnostics.Process.GetProcessById(Convert.ToInt32(reader["pid"])))if(!process.HasExited)throw new ServiceError("RECOVERY_WORKER_ACTIVE","A prior process identity remains active; inspect without retry",409);}catch(ArgumentException){}
            }
        }
        JObject SubmitCore(string owner, string idem, JObject request, JObject clientRequest,string recoveryJob)
        {
            if (string.IsNullOrEmpty(idem) || idem.Length > 160) throw new ServiceError("PARAM_SCHEMA_INVALID", "An idempotency key is required");
            string canonical = Canonical(request).ToString(Newtonsoft.Json.Formatting.None), fingerprint = Protocol.Hash(Encoding.UTF8.GetBytes(Canonical(ComputationIdentity(request)).ToString(Newtonsoft.Json.Formatting.None)));
            string payloadHash = Protocol.Hash(Encoding.UTF8.GetBytes(Canonical(clientRequest ?? request).ToString(Newtonsoft.Json.Formatting.None)));
            var binding=request["publicRequest"] is JObject input?new JObject(new[]{"requestId","documentId","documentInstanceId","expectedRevision","featureId","operation","semanticVersion","recipeFingerprint"}.Select(name=>new JProperty(name,input[name].DeepClone()))){["sourceSha256"]=request["sourceSha256"]}:null;
            lock (gate)
            {
                using (var transaction = db.BeginTransaction())
                {
                    var alias=Read("SELECT * FROM client_keys WHERE owner=@p0 AND idem=@p1",owner,idem);
                    var existing = alias==null?Read("SELECT * FROM jobs WHERE owner=@p0 AND idem=@p1", owner, idem):Read("SELECT * FROM jobs WHERE id=@p0 AND owner=@p1",(string)alias["job"],owner);
                    if (existing != null) {
                        string previousHash = (string)alias?["payload_hash"] ?? (string)existing["payload_hash"];
                        if(previousHash=="")previousHash=null;
                        if (previousHash == null) { var old = JObject.Parse((string)existing["request"]); previousHash = Protocol.Hash(Encoding.UTF8.GetBytes(Canonical(new JObject { ["assetId"] = old["assetId"], ["options"] = old["options"] }).ToString(Newtonsoft.Json.Formatting.None))); }
                        if (previousHash != payloadHash) throw new ServiceError("IDEMPOTENCY_KEY_REUSED", "Same key has a different payload", 409);if(binding!=null)Execute("UPDATE client_keys SET binding_json=@p2 WHERE owner=@p0 AND idem=@p1 AND binding_json IS NULL",owner,idem,binding.ToString(Newtonsoft.Json.Formatting.None));transaction.Commit(); return Accepted(existing,idem,binding,false);
                    }
                    var same=Read("SELECT * FROM jobs WHERE owner=@p0 AND fingerprint=@p1 ORDER BY created DESC LIMIT 1",owner,fingerprint);
                    if(recoveryJob!=null){if(same==null)throw new ServiceError("RECOVERY_INPUT_CHANGED","Current engine/input differs from the interrupted task",409);AssertRecoverable(same,owner,recoveryJob);}
                    else if(same!=null){if(new[]{"failed","terminated","interrupted"}.Contains((string)same["state"]))throw new ServiceError("KNOWN_INPUT_FAILED","This exact computation already failed; inspect job "+(string)same["id"]+" before another strategy",409);Execute("INSERT INTO client_keys(owner,idem,payload_hash,job,binding_json) VALUES(@p0,@p1,@p2,@p3,@p4)",owner,idem,payloadHash,(string)same["id"],binding?.ToString(Newtonsoft.Json.Formatting.None));transaction.Commit();return Accepted(same,idem,binding,true);}
                    string id = Guid.NewGuid().ToString("N");
                    Execute("INSERT INTO jobs(id,owner,idem,fingerprint,request,state,created,payload_hash,engine) VALUES(@p0,@p1,@p2,@p3,@p4,'queued',@p5,@p6,@p7)", id, owner, idem, fingerprint, canonical, DateTime.UtcNow.ToString("o"), payloadHash, ((string)request["operation"]).StartsWith("logo.") ? "logo" : "occt");
                    Execute("INSERT INTO client_keys(owner,idem,payload_hash,job,binding_json) VALUES(@p0,@p1,@p2,@p3,@p4)",owner,idem,payloadHash,id,binding?.ToString(Newtonsoft.Json.Formatting.None));
                    Execute("INSERT INTO job_events VALUES(@p0,'queued',@p1)", id, DateTime.UtcNow.ToString("o")); transaction.Commit(); return Accepted(Read("SELECT * FROM jobs WHERE id=@p0 AND owner=@p1",id,owner),idem,binding,false);
                }
            }
        }
        static JObject ComputationIdentity(JObject request)
        {
            if(((string)request["operation"]).StartsWith("logo."))return new JObject { ["operation"]=request["operation"],["sourceSha256"]=request["sourceSha256"],["sourceName"]=request["sourceName"],["engineBuildId"]=request["engineBuildId"],["semanticVersion"]=request["semanticVersion"],["options"]=request["options"] };
            // Recipe/document identities bind installation, not computation.
            // Changing a feature ID must not evade a failed physical-input
            // fingerprint. Successful cross-document rebinding is a separate
            // explicit receipt; the existing installer rejects stale manifests.
            var input=(JObject)request["publicRequest"];return new JObject { ["operation"]=request["operation"],["sourceSha256"]=request["sourceSha256"],["engineBuildId"]=request["engineBuildId"],["schemaVersion"]=input["schemaVersion"],["semanticVersion"]=input["semanticVersion"],["params"]=request["semanticParams"]??input["params"],["placementSnapshot"]=input["placementSnapshot"],["selectionIntent"]=input["selectionIntent"],["strategy"]=input["strategy"],["requiredResultFormat"]=input["requiredResultFormat"] };
        }
        static JToken Canonical(JToken token) => token is JObject obj ? new JObject(obj.Properties().OrderBy(p => p.Name, StringComparer.Ordinal).Select(p => new JProperty(p.Name, Canonical(p.Value)))) : token is JArray arr ? new JArray(arr.Select(Canonical)) : token.DeepClone();
        static JObject Public(JObject row) {var value=new JObject { ["jobId"] = row["id"], ["execution"] = row["state"], ["inputFingerprint"] = row["fingerprint"], ["createdAt"] = row["created"], ["cancelRequested"] = (long)row["cancel"] != 0, ["observation"] = "known", ["commit"] = "notCommitted", ["error"] = PublicError((string)row["error"]) };var recovery=JObject.Parse((string)row["request"])["recovery"];if(recovery!=null)value["recovery"]=recovery.DeepClone();return value;}
        static JObject Accepted(JObject row,string key,JObject binding,bool cacheHit){var value=Public(row);value["requestKey"]=key;value["requestBinding"]=binding;value["computeCacheHit"]=cacheHit;return value;}
        static JToken PublicError(string error) { if (error == null) return JValue.CreateNull(); try { return JObject.Parse(error); } catch (Newtonsoft.Json.JsonException) { return new ServiceError("HOST_INTERRUPTED", "Host restarted during execution; inspect job before retry", 409).Body("recovery"); } }
        public JObject Job(string owner, string id) { lock (gate) return Public(Read("SELECT * FROM jobs WHERE id=@p0 AND owner=@p1", id, owner) ?? throw new ServiceError("JOB_NOT_FOUND", "Job not owned by principal", 404)); }
        public JObject Request(string owner,string key){lock(gate){var row=Read("SELECT jobs.*,client_keys.binding_json FROM jobs JOIN client_keys ON jobs.id=client_keys.job WHERE client_keys.idem=@p0 AND client_keys.owner=@p1 AND jobs.owner=@p1",key,owner)??throw new ServiceError("REQUEST_NOT_FOUND","No accepted request for this principal/key",404);return Accepted(row,key,row["binding_json"].Type==JTokenType.Null?null:JObject.Parse((string)row["binding_json"]),(string)row["idem"]!=key);}}
        public JObject RequestResult(string owner,string key){lock(gate){JObject receipt=Request(owner,key),result=Result(owner,(string)receipt["jobId"]);if(receipt["requestBinding"] is JObject binding){if((string)result["sourceSha256"]!=(string)binding["sourceSha256"]||(string)result["inputFingerprint"]!=(string)receipt["inputFingerprint"])throw new ServiceError("RESULT_MISMATCH","Cached exact result does not match accepted source/input",409);foreach(var field in new[]{"documentId","documentInstanceId","expectedRevision","featureId","operation","semanticVersion","recipeFingerprint"})result[field]=binding[field].DeepClone();result["requestBinding"]=binding;result["requestKey"]=key;result["computeCacheHit"]=receipt["computeCacheHit"];}return result;}}
        public JObject Claim(string engine = "logo")
        {
            lock (gate) using (var transaction = db.BeginTransaction())
            {
                var row = Read("SELECT * FROM jobs WHERE state='queued' AND engine=@p0 ORDER BY created LIMIT 1", engine);
                if (row != null) { Execute("UPDATE jobs SET state='running' WHERE id=@p0 AND state='queued'", (string)row["id"]); Execute("INSERT INTO job_events VALUES(@p0,'running',@p1)", (string)row["id"], DateTime.UtcNow.ToString("o")); }
                transaction.Commit(); return row;
            }
        }
        public bool Cancelled(string id) { lock (gate) return (long)Read("SELECT cancel FROM jobs WHERE id=@p0", id)["cancel"] != 0; }
        public JObject Cancel(string owner, string id)
        {
            lock (gate) { Job(owner, id); Execute("UPDATE jobs SET cancel=1,state=CASE WHEN state='queued' THEN 'cancelled' ELSE state END WHERE id=@p0 AND state IN ('queued','running')", id); return Job(owner, id); }
        }
        public void Finish(string id, string state, string result = null, string error = null)
        {
            lock (gate) using (var transaction = db.BeginTransaction()) { Execute("UPDATE jobs SET state=@p1,result=@p2,error=@p3 WHERE id=@p0 AND state='running'", id, state, result, error); Execute("INSERT INTO job_events VALUES(@p0,@p1,@p2)", id, state, DateTime.UtcNow.ToString("o")); transaction.Commit(); }
        }
        public void Attempt(string id, int pid, int? exit = null)
        {
            lock (gate) if (exit.HasValue) Execute("UPDATE attempts SET finished=@p1,exit_code=@p2 WHERE job=@p0 AND finished IS NULL", id, DateTime.UtcNow.ToString("o"), exit.Value); else Execute("INSERT INTO attempts(job,pid,started) VALUES(@p0,@p1,@p2)", id, pid, DateTime.UtcNow.ToString("o"));
        }
        public JObject Publish(string owner, string jobId, string fingerprint, JObject value)
        {
            var bytes = Encoding.UTF8.GetBytes(value.ToString(Newtonsoft.Json.Formatting.None)); string id = Guid.NewGuid().ToString("N"), sha = Protocol.Hash(bytes);
            Atomic(Path.Combine(Root, "artifacts", id), bytes);
            lock (gate) Execute("INSERT INTO artifacts VALUES(@p0,@p1,@p2,@p3)", id, owner, sha, bytes.Length);
            return new JObject { ["jobId"] = jobId, ["inputFingerprint"] = fingerprint, ["artifactId"] = id, ["artifactSha256"] = sha, ["bytes"] = bytes.Length, ["format"] = "webcad-logo-result-v1", ["expiresAt"] = JValue.CreateNull(), ["commit"] = "notCommitted" };
        }
        public JObject PublishGeometry(string owner,byte[] bytes)
        {
            if(bytes.Length>Protocol.MaxGeometryUpload)throw new ServiceError("RESULT_TOO_LARGE", "Geometry result exceeds server artifact budget");
            string id=Guid.NewGuid().ToString("N"),sha=Protocol.Hash(bytes);Atomic(Path.Combine(Root,"artifacts",id),bytes);lock(gate)Execute("INSERT INTO artifacts VALUES(@p0,@p1,@p2,@p3)",id,owner,sha,bytes.Length);
            return new JObject { ["artifactId"]=id,["sha256"]=sha,["bytes"]=bytes.Length,["format"]="occt-text-brep-v1",["brepVersion"]=3 };
        }
        public JObject Result(string owner, string id)
        {
            lock (gate) { var row = Read("SELECT * FROM jobs WHERE id=@p0 AND owner=@p1", id, owner) ?? throw new ServiceError("JOB_NOT_FOUND", "Unknown job", 404); if ((string)row["state"] != "succeeded") throw new ServiceError("RESULT_NOT_READY", "Job has no successful result", 409); return JObject.Parse((string)row["result"]); }
        }
        public byte[] Artifact(string owner, string id)
        {
            JObject row; lock (gate) row = Read("SELECT * FROM artifacts WHERE id=@p0 AND owner=@p1", id, owner) ?? throw new ServiceError("ARTIFACT_NOT_FOUND", "Artifact not owned by principal", 404);
            byte[] bytes;try{bytes=File.ReadAllBytes(Path.Combine(Root, "artifacts", (string)row["id"]));}
            catch(FileNotFoundException){throw new ServiceError("ARTIFACT_UNAVAILABLE","Stored artifact is unavailable or expired; reconcile the accepted job instead of automatically recomputing",410);}
            if (Protocol.Hash(bytes) != (string)row["sha"]) throw new ServiceError("ARTIFACT_CORRUPT", "Artifact integrity failed", 500); return bytes;
        }
        public static void Atomic(string path, byte[] bytes) { string temp = Path.Combine(Path.GetDirectoryName(path),".partial-" + Guid.NewGuid().ToString("N")); try { using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { stream.Write(bytes, 0, bytes.Length); stream.Flush(true); } File.Move(temp, path); } finally { if (File.Exists(temp)) File.Delete(temp); } }
        public void Dispose() { try{db.Dispose();}finally{hostLease.Dispose();} }
    }
}
