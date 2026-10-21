using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using LogoVector.Contracts;
using LogoVector.Geometry;
using LogoVector.Worker;
using Newtonsoft.Json.Linq;

internal static class Program
{
    static int count;
    static void Check(bool value, string name) { if (!value) throw new Exception("FAILED " + name); count++; Console.WriteLine("PASS " + name); }
    static List<double[]> Ring(params double[] xy) { var ring = new List<double[]>(); for (int i = 0; i < xy.Length; i += 2) ring.Add(new[] { xy[i], xy[i + 1] }); return ring; }
    static List<LogoRegion> Source() => new List<LogoRegion> { new LogoRegion { Outer = Ring(0,0,20,0,20,20,0,20), Holes = new List<List<double[]>> { Ring(5,5,5,10,6,10,6,11,7,11,7,12,12,12,12,5) } }, new LogoRegion { Outer = Ring(8,7,9,7,9,8,8,8) } };
    static IEnumerable<List<double[]>> Rings(IEnumerable<LogoRegion> data) => data.SelectMany(r => new[] { r.Outer }.Concat(r.Holes));
    static LogoDocument Document(List<LogoRegion> regions) => LogoGeometry.Normalize("test", regions, new Dictionary<string,object>());
    static string Hash(byte[] bytes) { using(var sha=SHA256.Create())return string.Concat(sha.ComputeHash(bytes).Select(b=>b.ToString("x2"))); }
    static void Main(string[] args)
    {
        var original = Source(); string before = LogoGeometry.GeometryHash(Document(original)); RasterTracer.SmoothingReport report;
        var disabled = RasterTracer.SmoothContours(original, 0, out report);
        Check(before == LogoGeometry.GeometryHash(Document(disabled)) && report.Status == "disabled" && report.ActualPx == 0, "zero preserves original geometry");
        var smoothed = RasterTracer.SmoothContours(original, .5, out report);
        Check(report.Status == "applied" && report.ActualPx > 0 && report.ActualPx <= .5, "explicit smoothing applies one bounded pass");
        Check(report.PointsBefore == report.PointsAfter && smoothed.Count == 2 && smoothed[0].Holes.Count == 1, "nodes, tiny island and hole retained");
        Check(Document(original).SizeMm.SequenceEqual(Document(smoothed).SizeMm), "physical bounds unchanged");
        Check(before == LogoGeometry.GeometryHash(Document(original)), "source geometry untouched");
        var old = Rings(original).ToList(); var after = Rings(smoothed).ToList();
        double max = 0;
        for (int r = 0; r < old.Count; r++) for (int i = 0; i < old[r].Count; i++)
        {
            var a = old[r][i]; var b = after[r][i]; double dx = a[0] - b[0], dy = a[1] - b[1]; max = Math.Max(max, Math.Sqrt(dx*dx+dy*dy));
            for (int t = 0; t <= 10; t++) { double u=t/10.0; var next=(i+1)%old[r].Count; dx=(1-u)*(old[r][i][0]-after[r][i][0])+u*(old[r][next][0]-after[r][next][0]); dy=(1-u)*(old[r][i][1]-after[r][i][1])+u*(old[r][next][1]-after[r][next][1]); if(Math.Sqrt(dx*dx+dy*dy)>.5+1e-12)throw new Exception("edge displacement exceeds source-pixel bound"); }
        }
        Check(max <= report.ActualPx+1e-12, "vertex and corresponding edge displacement bounds");
        smoothed[0].Holes[0][0][0] += .01;
        Check(report.OriginalRegions[0].Holes[0][0][0] == original[0].Holes[0][0][0], "original readback has independent coordinate storage");
        var unsafeSource = new List<LogoRegion> { new LogoRegion { Outer=Ring(0,0,10,0,10,4,4,4,4,10,0,10) }, new LogoRegion { Outer=Ring(4.1,4.1,4.2,4.1,4.2,4.2,4.1,4.2) } };
        before=LogoGeometry.GeometryHash(Document(unsafeSource)); var rejected=RasterTracer.SmoothContours(unsafeSource,.5,out report);
        Check(report.Status=="rejected-topology" && report.ActualPx==0 && !string.IsNullOrEmpty(report.FailureCode) && before==LogoGeometry.GeometryHash(Document(rejected)), "unsafe inter-region candidate rejected without partial replacement");
        foreach(double invalid in new[]{-.1,.5001,double.NaN,double.PositiveInfinity}) { try { RasterTracer.SmoothContours(original,invalid,out report);throw new Exception("invalid pixel bound accepted"); } catch(LogoVectorException e) { if(e.Code!="INVALID_OPTIONS")throw;count++; } }
        using(var bitmap=new Bitmap(24,24))
        {
            for(int y=0;y<24;y++)for(int x=0;x<24;x++){bool foreground=(x-11.5)*(x-11.5)+(y-11.5)*(y-11.5)<100 && (x-11.5)*(x-11.5)+(y-11.5)*(y-11.5)>16;bitmap.SetPixel(x,y,foreground?Color.Black:Color.White);}
            using(var stream=new MemoryStream())
            {
                bitmap.Save(stream,ImageFormat.Png);byte[] bytes=stream.ToArray();int height;
                var baseline=RasterTracer.Trace(bytes,new RasterOptions(),out height);var raster=RasterTracer.Trace(bytes,new RasterOptions(),out height,.5,out report);
                Check(report.Status=="applied" && raster.Item1.Count==baseline.Item1.Count && raster.Item1.Sum(r=>r.Holes.Count)==baseline.Item1.Sum(r=>r.Holes.Count),"real decoded staircase image retains topology");
                Check(before!=null && report.OriginalRegions!=null && LogoGeometry.GeometryHash(Document(baseline.Item1))==LogoGeometry.GeometryHash(Document(report.OriginalRegions)),"original decoded pixel contours recover exactly");
                if(args.Length==2)
                {
                    string folder=args[1];Directory.CreateDirectory(folder);string image=Path.Combine(folder,"source-ring.png"),output=Path.Combine(folder,"result.json"),request=Path.Combine(folder,"request.json");File.WriteAllBytes(image,bytes);
                    var options=new JObject{["mode"]="raster",["sizeMode"]="targetWidth",["targetWidthMm"]=24,["sizeConfirmed"]=true,["raster"]=new JObject{["smoothingPx"]=.5}};
                    File.WriteAllText(request,new JObject{["action"]="convert",["sourcePath"]=image,["sourceName"]="source-ring.png",["sourceHash"]=Hash(bytes),["outputPath"]=output,["options"]=options}.ToString(),new UTF8Encoding(false));
                    var process=Process.Start(new ProcessStartInfo(args[0],"\""+request+"\""){UseShellExecute=false,CreateNoWindow=true});if(!process.WaitForExit(20000)){process.Kill();throw new Exception("worker timeout");}
                    var result=JObject.Parse(File.ReadAllText(output));var source=(JObject)result["Logo"]?["Source"];Check((string)result["Status"]=="needsReview" && (bool)result["ReviewRequired"] && source!=null,"Worker always retains raster review gate");
                    Check((string)source["rasterSmoothing"]?["status"]=="applied" && (int)source["rasterSmoothing"]["pointsBefore"]==(int)source["rasterSmoothing"]["pointsAfter"] && source["rasterOriginalContours"]?["Regions"] is JArray,"Worker returns original contour document and smoothing report");
                    Check((double)result["Report"]["ApproximationBoundMm"]>0 && result["Report"]["SourceReconstructionErrorMm"].Type==JTokenType.Null,"bounded mask deviation never claims original artwork accuracy");
                    Check((double)result["Report"]["RequestedToleranceMm"]==.5 && (string)source["conversion"]["approximationBasis"]=="thresholded-pixel-contours","raster requested tolerance uses explicit source pixels, not vector tolerance");
                }
            }
        }
        using(var bitmap=new Bitmap(4,4))using(var stream=new MemoryStream())
        {
            for(int y=0;y<4;y++)for(int x=0;x<4;x++)bitmap.SetPixel(x,y,(x==1&&y==1)||(x==2&&y==2)?Color.Black:Color.White);
            bitmap.Save(stream,ImageFormat.Png);int height;
            var traced=RasterTracer.Trace(stream.ToArray(),new RasterOptions(),out height,0,out report);
            Check(traced.Item1.Count==2 && report.DiagonalContacts==1 && report.CornerBoundPx<.18,"diagonal pixels remain separate valid islands with bounded corner bevel");
            Check(Document(traced.Item1).Regions.Count==2,"diagonal source passes independent geometry normalization");
        }
        Console.WriteLine("PASS raster smoothing checks: "+count);
    }
}
