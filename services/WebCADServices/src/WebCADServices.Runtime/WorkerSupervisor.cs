using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32.SafeHandles;
using WebCADServices.Contracts;

namespace WebCADServices.Runtime
{
    public sealed class WorkerSupervisor
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Startup { public int cb; public string reserved, desktop, title; public int x, y, width, height, cx, cy, fill, flags; public short show, reserved2; public IntPtr reservedPtr, stdin, stdout, stderr; }
        [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process, thread; public int pid, tid; }
        [StructLayout(LayoutKind.Sequential)] struct Limits { public long processTime, jobTime; public uint flags; public UIntPtr minWorking, maxWorking; public uint active; public UIntPtr affinity; public uint priority, scheduling; }
        [StructLayout(LayoutKind.Sequential)] struct Counters { public ulong readOps, writeOps, otherOps, readBytes, writeBytes, otherBytes; }
        [StructLayout(LayoutKind.Sequential)] struct Extended { public Limits basic; public Counters io; public UIntPtr processMemory, jobMemory, peakProcess, peakJob; }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, string command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref Startup startup, out ProcessInfo process);
        [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int info, ref Extended limits, int length);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
        [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job, uint code);
        [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateFile(string file, uint access, uint share, IntPtr attributes, uint creation, uint flags, IntPtr template);
        [StructLayout(LayoutKind.Sequential)] struct Security { public int length; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref Security attributes, int size);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);

        public int Run(string executable, string requestPath, Func<bool> cancelled, Action<int> started, out string diagnostic)
        {
            if (!File.Exists(executable)) throw new ServiceError("WORKER_UNAVAILABLE", "Configured worker binary is missing", 503);
            if (executable.Contains("\"") || requestPath.Contains("\"")) throw new ServiceError("DATA_ROOT_INVALID", "Invalid internal worker path");
            IntPtr job = CreateJobObject(IntPtr.Zero, null), read = IntPtr.Zero, write = IntPtr.Zero, environment = IntPtr.Zero; ProcessInfo process = default; bool launched = false;
            var log = new System.Text.StringBuilder(); Thread drain = null;
            try
            {
                if (job == IntPtr.Zero) throw new Win32Exception();
                var limits = new Extended { basic = new Limits { flags = 0x2000 | 0x100 | 0x8 | 0x2, active = 1, processTime = TimeSpan.FromSeconds(600).Ticks }, processMemory = new UIntPtr(1024UL * 1024 * 1024) };
                if (!SetInformationJobObject(job, 9, ref limits, Marshal.SizeOf(limits))) throw new Win32Exception();
                var security = new Security { length = Marshal.SizeOf(typeof(Security)), inherit = true };
                if (!CreatePipe(out read, out write, ref security, 4096) || !SetHandleInformation(read, 1, 0)) throw new Win32Exception();
                var startup = new Startup { cb = Marshal.SizeOf(typeof(Startup)), flags = 0x100, stdout = write, stderr = write };
                // CREATE_SUSPENDED: no parser runs until process-tree and memory limits are assigned.
                // Do not inherit the Host's authorization, ERP credentials, or model configuration.
                string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows), work = Path.GetDirectoryName(requestPath);
                environment = Marshal.StringToHGlobalUni("PATH=" + windows + "\\System32\0SystemRoot=" + windows + "\0TEMP=" + work + "\0TMP=" + work + "\0\0");
                if (!CreateProcess(executable, "\"" + executable + "\" \"" + requestPath + "\"", IntPtr.Zero, IntPtr.Zero, true, 0x08000404, environment, work, ref startup, out process)) throw new Win32Exception();
                launched = true;
                if (!AssignProcessToJobObject(job, process.process)) { TerminateProcess(process.process, 10); throw new Win32Exception(); }
                CloseHandle(write); write = IntPtr.Zero;
                var capturedRead = read; read = IntPtr.Zero;
                drain = new Thread(() => { using (var stream = new FileStream(new SafeFileHandle(capturedRead, true), FileAccess.Read)) { var bytes = new byte[1024]; int count; while ((count = stream.Read(bytes, 0, bytes.Length)) > 0) lock (log) if (log.Length < 16384) log.Append(System.Text.Encoding.UTF8.GetString(bytes, 0, Math.Min(count, 16384 - log.Length))); } }) { IsBackground = true }; drain.Start();
                started(process.pid);
                if (ResumeThread(process.thread) == uint.MaxValue) throw new Win32Exception();
                var elapsed = Stopwatch.StartNew(); long cancellationAt = -1;
                while (WaitForSingleObject(process.process, 100) == 258)
                {
                    if (cancelled() && cancellationAt < 0) { cancellationAt = elapsed.ElapsedMilliseconds; File.WriteAllText(Path.Combine(work, "cancel.flag"), "cancel"); }
                    if (cancellationAt >= 0 && elapsed.ElapsedMilliseconds - cancellationAt > 500 || elapsed.Elapsed.TotalSeconds > 900) { TerminateJobObject(job, cancellationAt >= 0 ? 20u : 21u); WaitForSingleObject(process.process, 5000); throw new ServiceError(cancellationAt >= 0 ? "WORKER_TERMINATED" : "WORKER_TIMEOUT", "Controlled worker process tree stopped (15-minute hard safety limit)"); }
                }
                GetExitCodeProcess(process.process, out uint code); drain.Join(2000);
                // Parser inputs are not logged. Only bounded console diagnostics are retained.
                lock (log) diagnostic = log.ToString(); return unchecked((int)code);
            }
            finally
            {
                if (job != IntPtr.Zero) { TerminateJobObject(job, 30); CloseHandle(job); }
                if (launched) { CloseHandle(process.thread); CloseHandle(process.process); }
                if (read != IntPtr.Zero) CloseHandle(read); if (write != IntPtr.Zero) CloseHandle(write);
                if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
            }
        }
    }
}
