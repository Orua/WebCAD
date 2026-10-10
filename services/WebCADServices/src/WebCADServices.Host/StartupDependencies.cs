using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace WebCADServices.Host
{
    public static class StartupDependencies
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr LoadLibraryEx(string file, IntPtr reserved, uint flags);
        [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
        // Read the actual x64 PE import table, rather than guessing that one TK DLL is enough.
        public static string[] Imports(string executable)
        {
            using (var file = File.OpenRead(executable)) using (var reader = new BinaryReader(file))
            {
                if (file.Length < 256 || reader.ReadUInt16() != 0x5A4D) throw new InvalidOperationException("NATIVE_PE_INVALID");
                file.Position = 0x3C; uint pe = reader.ReadUInt32();
                if (pe > file.Length - 256) throw new InvalidOperationException("NATIVE_PE_INVALID");
                file.Position = pe;
                if (reader.ReadUInt32() != 0x4550 || reader.ReadUInt16() != 0x8664) throw new InvalidOperationException("NATIVE_X64_REQUIRED");
                ushort sections = reader.ReadUInt16(); file.Position += 12; ushort optionalSize = reader.ReadUInt16(); file.Position += 2; long optional = file.Position;
                if (sections < 1 || sections > 96 || optionalSize < 128 || reader.ReadUInt16() != 0x20B) throw new InvalidOperationException("NATIVE_PE_INVALID");
                file.Position = optional + 120; uint imports = reader.ReadUInt32(), importBytes = reader.ReadUInt32();
                if (imports == 0 && importBytes == 0) return new string[0];
                if (importBytes > 20 * 1024 || imports == 0) throw new InvalidOperationException("NATIVE_IMPORTS_INVALID");
                var addresses = new List<uint[]>();
                for (int i = 0; i < sections; i++) { file.Position = optional + optionalSize + i * 40 + 12; uint rva = reader.ReadUInt32(), bytes = reader.ReadUInt32(), raw = reader.ReadUInt32(); addresses.Add(new[] { rva, bytes, raw }); }
                Func<uint, long> offset = rva => { foreach (var section in addresses) { long delta = (long)rva - section[0]; if (delta >= 0 && delta < section[1] && section[2] + delta < file.Length) return section[2] + delta; } throw new InvalidOperationException("NATIVE_IMPORTS_INVALID"); };
                long table = offset(imports); var names = new List<string>();
                for (int i = 0; i < 1024; i++)
                {
                    file.Position = table + i * 20 + 12; uint nameRva = reader.ReadUInt32(); if (nameRva == 0) return names.ToArray();
                    file.Position = offset(nameRva); var name = new System.Text.StringBuilder();
                    for (int count = 0; count < 256; count++) { byte c = reader.ReadByte(); if (c == 0) break; name.Append((char)c); }
                    if (!Regex.IsMatch(name.ToString(), "^[A-Za-z0-9_.+-]+\\.dll$", RegexOptions.IgnoreCase)) throw new InvalidOperationException("NATIVE_IMPORT_NAME_INVALID");
                    names.Add(name.ToString());
                }
                throw new InvalidOperationException("NATIVE_IMPORTS_INVALID");
            }
        }
        public static void Verify(string executable)
        {
            var imports = Imports(executable);
            if (imports.Length == 0) throw new InvalidOperationException("NATIVE_IMPORTS_REQUIRED");
            foreach (string name in imports)
            {
                string local = Path.Combine(Path.GetDirectoryName(executable), name);
                IntPtr module = File.Exists(local) ? LoadLibraryEx(local, IntPtr.Zero, 0x100 | 0x1000) : LoadLibraryEx(name, IntPtr.Zero, 0x800);
                if (module == IntPtr.Zero) throw new InvalidOperationException("NATIVE_DLL_LOAD_FAILED: " + name + " (Win32 " + Marshal.GetLastWin32Error() + ")");
                FreeLibrary(module);
            }
        }
    }
}
