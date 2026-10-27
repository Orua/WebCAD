using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using LogoVector.Contracts;
using LogoVector.Geometry;
using LogoVector.Worker;

internal static class Program
{
    static int checks;
    static void Check(bool value,string name){if(!value)throw new Exception("FAILED "+name);checks++;Console.WriteLine("PASS "+name);}
    static byte[] Picture(Action<Graphics> draw)
    {
        using(var bitmap=new Bitmap(128,128,PixelFormat.Format32bppArgb))
        using(var graphics=Graphics.FromImage(bitmap))
        using(var stream=new MemoryStream())
        { draw(graphics);bitmap.Save(stream,ImageFormat.Png);return stream.ToArray(); }
    }
    static AutoRasterTracer.Result Trace(byte[] bytes)=>AutoRasterTracer.Trace(bytes,new ConversionOptions{Mode="raster",SizeMode="targetWidth",TargetWidthMm=35,SizeConfirmed=true});
    static double SegmentDistance(double[] p,double[] a,double[] b)
    {
        double dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d==0?0:Math.Max(0,Math.Min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d));
        return Math.Sqrt(Math.Pow(p[0]-a[0]-t*dx,2)+Math.Pow(p[1]-a[1]-t*dy,2));
    }
    static double CurveToPolyline(AutoRasterTracer.CurveRing curve,System.Collections.Generic.List<double[]> polygon)
    {
        double max=0;var start=curve.Start;
        foreach(var segment in curve.Segments)
        {
            if(segment.Cubic)for(int i=0;i<=64;i++)
            {
                double t=i/64.0,u=1-t;var p=new[]{u*u*u*start[0]+3*u*u*t*segment.Control[0]+3*u*t*t*segment.Control2[0]+t*t*t*segment.End[0],u*u*u*start[1]+3*u*u*t*segment.Control[1]+3*u*t*t*segment.Control2[1]+t*t*t*segment.End[1]};
                double nearest=double.PositiveInfinity;for(int j=0;j<polygon.Count;j++)nearest=Math.Min(nearest,SegmentDistance(p,polygon[j],polygon[(j+1)%polygon.Count]));
                max=Math.Max(max,nearest);
            }
            start=segment.End;
        }
        return max;
    }
    static double MaxJoinAngle(AutoRasterTracer.CurveRing curve)
    {
        var starts=new System.Collections.Generic.List<double[]>();var ends=new System.Collections.Generic.List<double[]>();var p=curve.Start;
        foreach(var s in curve.Segments)
        {
            starts.Add(s.Cubic?new[]{s.Control[0]-p[0],s.Control[1]-p[1]}:new[]{s.End[0]-p[0],s.End[1]-p[1]});
            var c=s.Cubic?s.Control2:p;ends.Add(new[]{s.End[0]-c[0],s.End[1]-c[1]});p=s.End;
        }
        double max=0;for(int i=0;i<starts.Count;i++)
        {
            var a=ends[(i+starts.Count-1)%starts.Count];var b=starts[i];double den=Math.Sqrt((a[0]*a[0]+a[1]*a[1])*(b[0]*b[0]+b[1]*b[1]));
            if(den>1e-12)max=Math.Max(max,Math.Acos(Math.Max(-1,Math.Min(1,(a[0]*b[0]+a[1]*b[1])/den)))*180/Math.PI);
        }
        return max;
    }
    static double MaxLineLength(AutoRasterTracer.CurveRing curve)
    {
        double max=0;var p=curve.Start;foreach(var s in curve.Segments){if(!s.Cubic)max=Math.Max(max,Math.Sqrt(Math.Pow(s.End[0]-p[0],2)+Math.Pow(s.End[1]-p[1],2)));p=s.End;}return max;
    }
    static void Main()
    {
        try { Run(); }
        catch(Exception error) { Console.Error.WriteLine(error.Message); Environment.ExitCode=1; }
    }
    static void Run()
    {
        var square=Trace(Picture(g=>{g.Clear(Color.White);g.FillRectangle(Brushes.Black,16,16,96,96);g.FillRectangle(Brushes.White,44,44,40,40);}));
        Check(!square.UsesAlpha&&!square.Invert&&square.Threshold>0&&square.Threshold<255,"automatic black-on-white threshold");
        Check(square.Regions.Count==1&&square.Regions[0].Holes.Count==1&&square.FitStatus=="applied","square hole and topology retained");
        Check(square.ProtectedCorners>=4&&square.QuadraticSegments==0&&square.CubicSegments==0&&square.LinearSegments>=4,"square corners and straight edges remain sharp");
        foreach(var p in square.OriginalRegions[0].Outer)
            Check(square.Regions[0].Outer.Any(q=>Math.Abs(p[0]-q[0])<1e-9&&Math.Abs(p[1]-q[1])<1e-9),"square outer corner retained");

        var inverted=Trace(Picture(g=>{g.Clear(Color.Black);g.FillRectangle(Brushes.White,20,30,80,60);}));
        Check(inverted.Invert&&!inverted.UsesAlpha&&inverted.Regions.Count==1,"dark background selects light foreground");
        var transparent=Trace(Picture(g=>{g.Clear(Color.Transparent);g.FillRectangle(Brushes.White,20,30,80,60);}));
        Check(transparent.UsesAlpha&&transparent.Regions.Count==1,"transparent white mark uses alpha coverage");

        var round=Trace(Picture(g=>{g.Clear(Color.White);g.SmoothingMode=SmoothingMode.AntiAlias;g.FillEllipse(Brushes.Black,8,8,112,112);g.FillEllipse(Brushes.White,34,34,60,60);}));
        Check(round.Regions.Count==1&&round.Regions[0].Holes.Count==1,"antialiased ring retains its hole");
        Console.WriteLine("ring fit="+round.FitStatus+" reason="+round.FailureCode+" curves="+round.CubicSegments+" points="+round.PointsBefore+"->"+round.PointsAfter+" corners="+round.ProtectedCorners);
        Console.WriteLine("round outer max SVG tangent change="+MaxJoinAngle(round.Curves[0].Outer)+" line segments="+round.Curves[0].Outer.Segments.Count(x=>!x.Cubic)+" straightened="+round.StraightenedLines+" longest line="+MaxLineLength(round.Curves[0].Outer));
        Check(round.FitStatus=="applied"&&round.CubicSegments>0,"rounded boundary produces cubic curves");
        Check(MaxLineLength(round.Curves[0].Outer)<8,"smooth circle is not flattened at raster extrema");
        Check(MaxJoinAngle(round.Curves[0].Outer)<30,"smooth circle curve joins do not form sharp kinks");
        foreach(int axis in new[]{0,1})
        {
            var raw=round.OriginalRegions[0].Outer;var fitted=round.Regions[0].Outer;
            Check(Math.Abs(raw.Min(p=>p[axis])-fitted.Min(p=>p[axis]))<1e-9&&Math.Abs(raw.Max(p=>p[axis])-fitted.Max(p=>p[axis]))<1e-9,"round source bounds remain exact");
        }
        Check(round.ApproximationBoundPx>0&&round.PointsBefore>0&&round.PointsAfter>0,"automatic tolerance and contour counts reported");
        Check(CurveToPolyline(round.Curves[0].Outer,round.Regions[0].Outer)<=round.FlattenLimit+1e-7&&CurveToPolyline(round.Curves[0].Holes[0],round.Regions[0].Holes[0])<=round.FlattenLimit+1e-7,"SVG curves and sampled CAD contours remain within the reported bound");
        var normalized=LogoGeometry.Normalize("round",round.Regions,new System.Collections.Generic.Dictionary<string,object>());
        var minX=round.Regions.Min(r=>r.Outer.Min(p=>p[0]));var maxX=round.Regions.Max(r=>r.Outer.Max(p=>p[0]));
        var minY=round.Regions.Min(r=>r.Outer.Min(p=>p[1]));var maxY=round.Regions.Max(r=>r.Outer.Max(p=>p[1]));
        string svg=AutoRasterTracer.ToSvg(normalized,round,1,(minX+maxX)/2,(minY+maxY)/2);
        Check(svg.Contains("C")&&svg.Contains("fill-rule=\"evenodd\""),"SVG exposes the fitted cubic curves and holes");

        var staircase=new System.Collections.Generic.List<double[]>();
        for(int x=0;x<=80;x++)staircase.Add(new[]{(double)x,x*.25+(x%2==0?.35:-.35)});
        staircase.Add(new[]{80.0,40.0});staircase.Add(new[]{0.0,40.0});
        var anchors=new bool[staircase.Count];anchors[0]=anchors[80]=anchors[81]=anchors[82]=true;
        var smoothed=BezierFitter.Fit(staircase,anchors,.75,.025);
        Console.WriteLine("staircase ripples="+smoothed.RipplePoints+" cubics="+smoothed.Cubics+" straightened="+smoothed.StraightenedLines+" fitBound="+smoothed.Bound);
        Check(smoothed.RipplePoints>0&&smoothed.Cubics<20,"alternating pixel ripple fitted with long curves");
        Check(smoothed.StraightenedLines>0,"post-fit pass restores a confirmed straight stroke");
        Check(staircase.Where((p,i)=>anchors[i]).All(p=>smoothed.Points.Any(q=>Math.Abs(p[0]-q[0])<1e-9&&Math.Abs(p[1]-q[1])<1e-9)),"protected corners remain exact");
        Check(CurveToPolyline(smoothed.Curve,smoothed.Points)<=.025+1e-7,"new cubic SVG and CAD samples agree");
        Check(CurveToPolyline(smoothed.Curve,staircase)<=smoothed.Bound+1e-7,"reported fitted-curve bound encloses sampled curve deviation");
        Check(CurveToPolyline(round.Curves[0].Outer,round.OriginalRegions[0].Outer)<=round.ApproximationBoundPx+1e-7,"reported raster bound encloses sampled round contour deviation");

        // Long raster runs can be represented only by their endpoints.  Do not
        // allow a fitted curve to bow between those otherwise matching vertices.
        var sparseA=new System.Collections.Generic.List<double[]>{new[]{0.0,0.0},new[]{20.0,0.0},new[]{25.0,40.0},new[]{55.0,40.0},new[]{60.0,0.0},new[]{80.0,0.0},new[]{55.0,90.0},new[]{25.0,90.0}};
        var sparsePins=new bool[sparseA.Count];sparsePins[0]=sparsePins[5]=sparsePins[6]=sparsePins[7]=true;
        var sparseFit=BezierFitter.Fit(sparseA,sparsePins,.75,.025);
        Console.WriteLine("sparse contour bound="+sparseFit.Bound+" tolerance="+sparseFit.FitTolerance);
        Check(sparseFit.Bound<=sparseFit.FitTolerance+1e-7,"whole sparse contour stays within the automatic fitting bound");
        Check(CurveToPolyline(sparseFit.Curve,sparseA)<=sparseFit.FitTolerance+1e-7,"long straight contour is not bowed between sampled vertices");
        Check(sparseFit.Lines>0&&sparseFit.ContinuousSplits>0,"unsafe cubic spans split and retain straight segments");

        var fittedPoints=smoothed.FittedPoints.Select(p=>(double[])p.Clone()).ToList();int fittedCubics=smoothed.FittedCubics;
        smoothed.Points=new System.Collections.Generic.List<double[]>{new[]{0.0,0.0},new[]{80.0,40.0},new[]{0.0,40.0},new[]{80.0,0.0}};
        smoothed.Curve=new AutoRasterTracer.CurveRing{Start=(double[])smoothed.Points[0].Clone()};
        Check(AutoRasterTracer.PreserveUnsafeRing(smoothed,staircase)==false&&smoothed.StraightenedLines==0&&smoothed.Cubics==fittedCubics&&smoothed.Points.SequenceEqual(fittedPoints,PointArrayComparer.Instance),"unsafe straight recovery returns to its fitted curve before raw pixels");
        Check(smoothed.Curve.Segments.Any(x=>x.Cubic),"unsafe straight recovery retains cubic SVG geometry");

        var islands=Trace(Picture(g=>{g.Clear(Color.White);g.FillRectangle(Brushes.Black,16,16,40,40);g.FillRectangle(Brushes.Black,100,100,1,1);}));
        Check(islands.OriginalRegions.Count==2&&islands.Regions.Count==2,"one-pixel island is retained");
        Console.WriteLine("PASS automatic raster checks: "+checks);
    }
}

internal sealed class PointArrayComparer : System.Collections.Generic.IEqualityComparer<double[]>
{
    public static readonly PointArrayComparer Instance=new PointArrayComparer();
    public bool Equals(double[] a,double[] b)=>a.Length==b.Length&&a.Zip(b,(x,y)=>Math.Abs(x-y)<1e-9).All(x=>x);
    public int GetHashCode(double[] value)=>0;
}
