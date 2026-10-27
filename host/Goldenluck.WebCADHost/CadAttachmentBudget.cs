using System.IO;

namespace Goldenluck.WebCAD.Hosting
{
    // CAD transport policy belongs to this adapter, not the ERP workbench assembly.
    internal static class CadAttachmentBudget
    {
        internal static int ForName(string name)
        {
            switch (Path.GetExtension(name ?? "").ToLowerInvariant())
            {
                case ".step": case ".stp": case ".brep": case ".brp": case ".stl": return 256 * 1024 * 1024;
                case ".mesh": return 768 * 1024 * 1024;
                case ".webcad": return 1024 * 1024 * 1024;
                default: return 20 * 1024 * 1024;
            }
        }
    }
}
