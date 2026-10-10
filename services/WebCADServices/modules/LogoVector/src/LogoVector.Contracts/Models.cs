using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace LogoVector.Contracts
{
    public interface ILogoVectorConverter
    {
        ConverterCapabilities GetCapabilities();
        Task<InspectionResult> InspectAsync(Stream input, SourceDescriptor source, InspectOptions options, CancellationToken cancellationToken);
        Task<ConversionResult> ConvertAsync(Stream input, SourceDescriptor source, ConversionOptions options, CancellationToken cancellationToken);
    }

    public sealed class SourceDescriptor
    {
        public string FileName { get; set; }
        public string MimeType { get; set; }
        public string ExpectedSha256 { get; set; }
    }

    public sealed class InspectOptions { public int? Page { get; set; } }
    public sealed class ConversionOptions
    {
        public string Mode { get; set; } = "vector";
        public int? Page { get; set; }
        public string SizeMode { get; set; } = "sourceUnits";
        public double? TargetWidthMm { get; set; }
        public double? MmPerSourceUnit { get; set; }
        public bool SizeConfirmed { get; set; }
        public double ToleranceMm { get; set; } = 0.005;
        // Zero selects a tolerance proportional to the complete PDF logo width.
        // A positive value remains an explicit millimetre override.
        public double PdfJoinToleranceMm { get; set; } = 0;
        public RasterOptions Raster { get; set; } = new RasterOptions();
    }
    public sealed class RasterOptions
    {
        public int Threshold { get; set; } = 128;
        public bool Invert { get; set; }
        public int AlphaThreshold { get; set; } = 1;
    }
    public sealed class ConverterCapabilities
    {
        public string ApiVersion { get; set; } = "0.1";
        public Dictionary<string, string> Formats { get; set; } = new Dictionary<string, string>();
    }
    public sealed class InspectionResult
    {
        public string Status { get; set; }
        public string SourceSha256 { get; set; }
        public string DetectedFormat { get; set; }
        public int? PageCount { get; set; }
        public int? SelectedPage { get; set; }
        public string Message { get; set; }
    }
    public sealed class ConversionResult
    {
        public string Status { get; set; }
        public bool GeometryValid { get; set; }
        public bool ReviewRequired { get; set; }
        public LogoDocument Logo { get; set; }
        public string Svg { get; set; }
        public ConversionReport Report { get; set; }
        public ConversionError Error { get; set; }
    }
    public sealed class ConversionError
    {
        public string Code { get; set; }
        public string Message { get; set; }
    }
    public sealed class ConversionReport
    {
        public string Method { get; set; }
        public double RequestedToleranceMm { get; set; }
        public double? ApproximationBoundMm { get; set; }
        public double? SourceReconstructionErrorMm { get; set; }
        public string GeometryHash { get; set; }
        public List<string> Warnings { get; set; } = new List<string>();
    }
    public sealed class LogoDocument
    {
        public string Type { get; set; } = "webcad-logo";
        public int Version { get; set; } = 1;
        public string Units { get; set; } = "mm";
        public string Name { get; set; }
        public double[] SizeMm { get; set; }
        public Dictionary<string, object> Source { get; set; } = new Dictionary<string, object>();
        public List<LogoRegion> Regions { get; set; } = new List<LogoRegion>();
    }
    public sealed class LogoRegion
    {
        public List<double[]> Outer { get; set; } = new List<double[]>();
        public List<List<double[]>> Holes { get; set; } = new List<List<double[]>>();
    }
    public sealed class LogoVectorException : Exception
    {
        public string Code { get; }
        public LogoVectorException(string code, string message) : base(message) { Code = code; }
    }
}
