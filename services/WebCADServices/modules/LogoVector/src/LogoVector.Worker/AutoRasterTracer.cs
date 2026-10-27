using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using LogoVector.Contracts;
using LogoVector.Geometry;
using StbImageSharp;

namespace LogoVector.Worker
{
    // The automatic path keeps the legacy pixel contours as a reversible source.
    // Fitted SVG curves and CAD polylines are generated from the same segments.
    internal static class AutoRasterTracer
    {
        internal sealed class Result
        {
            public List<LogoRegion> Regions, OriginalRegions;
            public List<CurveRegion> Curves;
            public RasterTracer.SmoothingReport PixelReport;
            public int Width, Height, Threshold, ForegroundPixels, ProtectedCorners, QuadraticSegments, CubicSegments, LinearSegments, ContinuousSplits, StraightenedLines, RipplePoints, PartialPreservedRings, PointsBefore, PointsAfter;
            public bool Invert, UsesAlpha;
            public string Confidence, FitStatus, FailureCode;
            public double Contrast, PixelTolerance, RefineLimit, SmoothLimit, SimplifyLimit, CurveLimit, FlattenLimit, FitTolerance, FitBound, ApproximationBoundPx;
        }
        internal sealed class CurveRegion { public CurveRing Outer; public List<CurveRing> Holes = new List<CurveRing>(); }
        internal sealed class CurveRing { public double[] Start; public List<CurveSegment> Segments = new List<CurveSegment>(); }
        internal sealed class CurveSegment { public bool Cubic, CornerAfter; public int SourceFirst, SourceLast; public double[] Control, Control2, End; }

        static double Distance(double[] a, double[] b) => Math.Sqrt((a[0]-b[0])*(a[0]-b[0])+(a[1]-b[1])*(a[1]-b[1]));
        static IEnumerable<List<double[]>> Rings(IEnumerable<LogoRegion> regions) => regions.SelectMany(r => new[]{r.Outer}.Concat(r.Holes));
        static int CountPoints(IEnumerable<LogoRegion> regions) => Rings(regions).Sum(r=>r.Count);
        static double Area(IList<double[]> ring) { double a=0;for(int i=0;i<ring.Count;i++){var p=ring[i];var q=ring[(i+1)%ring.Count];a+=p[0]*q[1]-q[0]*p[1];}return a/2; }
        static byte Luma(byte[] rgba,int index) { int p=index*4;return (byte)((rgba[p]*299+rgba[p+1]*587+rgba[p+2]*114)/1000); }
        static int Median(int[] histogram,int total)
        {
            if(total<=0)return 255;int n=0;for(int i=0;i<256;i++){n+=histogram[i];if(n*2>=total)return i;}return 255;
        }
        // Otsu chooses a split; the midpoint between measured class means avoids
        // the strict-inequality zero-threshold trap on a pure black/white image.
        static int AutomaticThreshold(int[] histogram,out double contrast)
        {
            long total=0,sum=0;for(int i=0;i<256;i++){total+=histogram[i];sum+=(long)i*histogram[i];}
            long lowCount=0,lowSum=0;double best=-1;int split=-1;
            for(int i=0;i<255;i++)
            {
                lowCount+=histogram[i];lowSum+=(long)i*histogram[i];long highCount=total-lowCount;
                if(lowCount==0||highCount==0)continue;
                double low=(double)lowSum/lowCount,high=(double)(sum-lowSum)/highCount;
                double between=(double)lowCount*highCount*(low-high)*(low-high);
                if(between>best){best=between;split=i;}
            }
            if(split<0){contrast=0;return 128;}
            long n0=0,n1=0,s0=0,s1=0;for(int i=0;i<256;i++){if(i<=split){n0+=histogram[i];s0+=(long)i*histogram[i];}else{n1+=histogram[i];s1+=(long)i*histogram[i];}}
            double a=(double)s0/n0,b=(double)s1/n1;contrast=b-a;
            return Math.Max(1,Math.Min(254,(int)Math.Round((a+b)/2,MidpointRounding.AwayFromZero)));
        }
        internal static Result Trace(byte[] bytes, ConversionOptions options)
        {
            ImageInfo? info;using(var stream=new MemoryStream(bytes))info=ImageInfo.FromStream(stream);
            if(!info.HasValue||info.Value.Width<1||info.Value.Height<1||info.Value.Width>20000||info.Value.Height>20000||(long)info.Value.Width*info.Value.Height>20000000)
                throw new LogoVectorException("FILE_TOO_LARGE","位图尺寸超出限制。");
            var image=ImageResult.FromMemory(bytes,ColorComponents.RedGreenBlueAlpha);int w=image.Width,h=image.Height,n=w*h;
            var border=new int[256];int borderCount=0,transparentBorder=0,alphaMin=255,alphaMax=0;
            for(int y=0;y<h;y++)for(int x=0;x<w;x++)
            {
                int i=y*w+x,a=image.Data[i*4+3];alphaMin=Math.Min(alphaMin,a);alphaMax=Math.Max(alphaMax,a);
                if(x==0||y==0||x==w-1||y==h-1){borderCount++;if(a<16)transparentBorder++;else border[Luma(image.Data,i)]++;}
            }
            bool alphaMode=alphaMin<16&&alphaMax>16&&transparentBorder>borderCount/2;
            int visibleBorder=border.Sum(),background=Median(border,visibleBorder);var values=new byte[n];var hist=new int[256];
            for(int i=0;i<n;i++)
            {
                int a=image.Data[i*4+3];int value=alphaMode?a:(Luma(image.Data,i)*a+background*(255-a)+127)/255;
                values[i]=(byte)value;hist[value]++;
            }
            double contrast;int threshold=AutomaticThreshold(hist,out contrast);bool invert=!alphaMode&&background<threshold;
            var strength=new byte[n];var mask=new bool[n];int foreground=0;
            for(int i=0;i<n;i++)
            {
                int ink=alphaMode?values[i]:invert?values[i]:255-values[i];strength[i]=(byte)ink;
                mask[i]=alphaMode?values[i]>=threshold:invert?values[i]>=threshold:values[i]<threshold;
                if(mask[i])foreground++;
            }
            int level=alphaMode||invert?threshold:256-threshold;
            RasterTracer.SmoothingReport pixelReport;var traced=RasterTracer.TraceMask(mask,w,h,0,out pixelReport);
            var original=RasterTracer.CopyRegions(traced.Item1);
            double factor=options.SizeMode=="targetWidth"&&options.TargetWidthMm>0?options.TargetWidthMm.Value/w:
                options.SizeMode=="mmPerSourceUnit"&&options.MmPerSourceUnit>0?options.MmPerSourceUnit.Value:1;
            // A raster's half-pixel uncertainty must not collapse to zero merely
            // because a low-resolution image is assigned a large physical size.
            // The actual conservative bound is reported in pixels and millimetres.
            double tolerance=Math.Min(.75,Math.Max(.6,.05/factor));
            var result=new Result { Width=w,Height=h,Threshold=threshold,Invert=invert,UsesAlpha=alphaMode,ForegroundPixels=foreground,
                Confidence=contrast>=64&&foreground>0&&foreground<n?"high":"low",Contrast=contrast,PixelReport=pixelReport,
                OriginalRegions=original,PointsBefore=CountPoints(original),PixelTolerance=tolerance,RefineLimit=tolerance*.2,SmoothLimit=tolerance*.3,
                SimplifyLimit=0,CurveLimit=0,FlattenLimit=Math.Min(.025,tolerance*.05) };
            Fit(result,strength,level);
            return result;
        }
        static double[] Step(IList<double[]> ring,int index,int direction,double length)
        {
            var current=ring[index];double remain=length;
            for(int s=1;s<=ring.Count;s++)
            {
                int j=(index+direction*s)%ring.Count;if(j<0)j+=ring.Count;var next=ring[j];double d=Distance(current,next);
                if(d>=remain&&d>0){double t=remain/d;return new[]{current[0]+(next[0]-current[0])*t,current[1]+(next[1]-current[1])*t};}
                remain-=d;current=next;
            }
            return current;
        }
        static double Turn(IList<double[]> ring,int index,double distance)
        {
            var p=ring[index];var a=Step(ring,index,-1,distance);var b=Step(ring,index,1,distance);
            double x1=p[0]-a[0],y1=p[1]-a[1],x2=b[0]-p[0],y2=b[1]-p[1],den=Math.Sqrt((x1*x1+y1*y1)*(x2*x2+y2*y2));
            return den<1e-12?0:Math.Acos(Math.Max(-1,Math.Min(1,(x1*x2+y1*y2)/den)))*180/Math.PI;
        }
        static bool[] Protected(IList<double[]> ring,double minX,double minY,double maxX,double maxY,out int corners)
        {
            var pin=new bool[ring.Count];corners=0;
            double span=Math.Max(ring.Max(p=>p[0])-ring.Min(p=>p[0]),ring.Max(p=>p[1])-ring.Min(p=>p[1]));
            for(int i=0;i<ring.Count;i++)
            {
                bool corner=span<=4||Turn(ring,i,2)>=55&&Turn(ring,i,4)>=50;
                pin[i]=corner;if(corner)corners++;
            }
            // Keep the overall source bounds without freezing both ends of a
            // raster plateau on an otherwise round extremum. True corners stay pinned.
            PinExtremumRuns(ring,pin,0,minX);PinExtremumRuns(ring,pin,0,maxX);
            PinExtremumRuns(ring,pin,1,minY);PinExtremumRuns(ring,pin,1,maxY);
            return pin;
        }
        static void PinExtremumRuns(IList<double[]> ring,bool[] pin,int axis,double value)
        {
            int n=ring.Count,start=-1;for(int i=0;i<n;i++)if(ring[i][axis]!=value){start=i;break;}
            if(start<0){pin[0]=true;return;}
            int step=1;
            while(step<=n)
            {
                int index=(start+step)%n;if(ring[index][axis]!=value){step++;continue;}
                var run=new List<int>();while(step<=n&&ring[(start+step)%n][axis]==value){run.Add((start+step)%n);step++;}
                double mid=(ring[run[0]][1-axis]+ring[run[run.Count-1]][1-axis])/2;
                int selected=run.OrderBy(i=>Math.Abs(ring[i][1-axis]-mid)).First();pin[selected]=true;
            }
        }
        static double[] Refine(double[] p,byte[] strength,int w,int h,int level,double limit)
        {
            double x=p[0]-.5,y=-p[1]-.5;int ix=(int)Math.Floor(x),iy=(int)Math.Floor(y);
            if(ix<0||iy<0||ix+1>=w||iy+1>=h||limit<=0)return (double[])p.Clone();
            double u=x-ix,v=y-iy,a=strength[iy*w+ix],b=strength[iy*w+ix+1],c=strength[(iy+1)*w+ix],d=strength[(iy+1)*w+ix+1];
            double value=(1-u)*(1-v)*a+u*(1-v)*b+(1-u)*v*c+u*v*d;
            double gx=(1-v)*(b-a)+v*(d-c),gy=(1-u)*(c-a)+u*(d-b),g2=gx*gx+gy*gy;
            if(g2<16)return (double[])p.Clone();double scale=(level-value)/g2,dx=gx*scale,dy=gy*scale,len=Math.Sqrt(dx*dx+dy*dy);
            if(len>limit){dx*=limit/len;dy*=limit/len;}return new[]{p[0]+dx,p[1]-dy};
        }
        // If post-fit line recovery makes this ring unsafe, try its saved smooth
        // cubic fit before falling back to the original pixel contour.
        internal static bool IsSafeRingFit(BezierFitter.Result fit,IList<double[]> original)
        {
            double oldArea=Area(original),newArea=Area(fit.Points);
            if(Math.Sign(oldArea)!=Math.Sign(newArea)||Math.Abs(newArea-oldArea)>Math.Max(1,Math.Abs(oldArea)*.08))return false;
            try{LogoGeometry.Normalize("auto-raster-ring",new[]{new LogoRegion{Outer=fit.Points}},new Dictionary<string,object>(),false);return true;}
            catch(LogoVectorException){return false;}
        }
        internal static bool PreserveUnsafeRing(BezierFitter.Result fit,IList<double[]> original)
        {
            if(IsSafeRingFit(fit,original))return false;
            if(BezierFitter.RestoreFittedCurve(fit)&&IsSafeRingFit(fit,original))return false;
            PreserveRingAreaForSafety(fit,original);return true;
        }
        static void PreserveRingAreaForSafety(BezierFitter.Result fit,IList<double[]> original)
        {
            fit.Points=original.Select(p=>(double[])p.Clone()).ToList();fit.Curve=new CurveRing{Start=(double[])fit.Points[0].Clone()};
            for(int i=1;i<=fit.Points.Count;i++)fit.Curve.Segments.Add(new CurveSegment{End=(double[])fit.Points[i%fit.Points.Count].Clone(),SourceFirst=i-1,SourceLast=i});
            fit.Cubics=0;fit.Lines=fit.Points.Count;fit.ContinuousSplits=0;fit.StraightenedLines=0;fit.Bound=0;
        }
        static CurveRing LinearCurve(IList<double[]> points)
        {
            var ring=new CurveRing{Start=(double[])points[0].Clone()};
            for(int i=1;i<=points.Count;i++)ring.Segments.Add(new CurveSegment{End=(double[])points[i%points.Count].Clone(),SourceFirst=i-1,SourceLast=i});
            return ring;
        }
        static bool IsValidRegion(LogoRegion region)
        {
            try{LogoGeometry.Normalize("auto-raster-region",new[]{region},new Dictionary<string,object>(),false);return true;}
            catch(LogoVectorException){return false;}
        }
        static void Fit(Result result,byte[] strength,int level)
        {
            var source=result.OriginalRegions;double minX=source.Min(r=>r.Outer.Min(p=>p[0])),maxX=source.Max(r=>r.Outer.Max(p=>p[0]));
            double minY=source.Min(r=>r.Outer.Min(p=>p[1])),maxY=source.Max(r=>r.Outer.Max(p=>p[1]));
            var refined=RasterTracer.CopyRegions(source);var before=Rings(source).ToList();var after=Rings(refined).ToList();var pins=new List<bool[]>();
            for(int r=0;r<before.Count;r++)
            {
                int corners;var pin=Protected(before[r],minX,minY,maxX,maxY,out corners);pins.Add(pin);result.ProtectedCorners+=corners;
                for(int i=0;i<before[r].Count;i++)if(!pin[i])after[r][i]=Refine(before[r][i],strength,result.Width,result.Height,level,result.RefineLimit);
            }
            for(int r=0;r<after.Count;r++)
            {
                var ring=after[r];var copy=ring.Select(p=>(double[])p.Clone()).ToList();
                for(int i=0;i<ring.Count;i++)if(!pins[r][i])
                {
                    var p=copy[i];var prev=copy[(i+ring.Count-1)%ring.Count];var next=copy[(i+1)%ring.Count];double dx=(prev[0]+next[0])/2-p[0],dy=(prev[1]+next[1])/2-p[1],d=Math.Sqrt(dx*dx+dy*dy);
                    if(d>0){double weight=Math.Min(.5,result.SmoothLimit/d);ring[i]=new[]{p[0]+dx*weight,p[1]+dy*weight};}
                }
                for(int i=0;i<ring.Count;i++)ring[i]=new[]{Math.Max(minX,Math.Min(maxX,ring[i][0])),Math.Max(minY,Math.Min(maxY,ring[i][1]))};
            }
            try
            {
                var regions=new List<LogoRegion>();var curves=new List<CurveRegion>();int at=0,regionIndex=0,cubics=0,lines=0,continuousSplits=0,straightenedLines=0,ripples=0,partial=0;double fitBound=0,fitTolerance=0;var bounds=new[]{minX,minY,maxX,maxY};
                foreach(var r in refined)
                {
                    var sourceRegion=source[regionIndex];var outer=BezierFitter.Fit(r.Outer,pins[at++],result.PixelTolerance,result.FlattenLimit,bounds);
                    var fits=new List<BezierFitter.Result>{outer};var originals=new List<List<double[]>>{sourceRegion.Outer};var preserved=new List<bool>();
                    preserved.Add(PreserveUnsafeRing(outer,sourceRegion.Outer));if(preserved[0])partial++;
                    var region=new LogoRegion{Outer=outer.Points};var path=new CurveRegion{Outer=outer.Curve};
                    int holeIndex=0;
                    foreach(var hole in r.Holes)
                    {
                        var fit=BezierFitter.Fit(hole,pins[at++],result.PixelTolerance,result.FlattenLimit,bounds);
                        var original=sourceRegion.Holes[holeIndex++];bool restored=PreserveUnsafeRing(fit,original);if(restored)partial++;
                        fits.Add(fit);originals.Add(original);preserved.Add(restored);region.Holes.Add(fit.Points);path.Holes.Add(fit.Curve);
                    }
                    bool validRegion=IsValidRegion(region);
                    for(int k=0;!validRegion&&k<fits.Count;k++)if(!preserved[k])
                    {
                        bool restored=BezierFitter.RestoreFittedCurve(fits[k])&&IsSafeRingFit(fits[k],originals[k]);
                        if(!restored){PreserveRingAreaForSafety(fits[k],originals[k]);preserved[k]=true;partial++;}
                        if(k==0){region.Outer=fits[k].Points;path.Outer=fits[k].Curve;}
                        else{region.Holes[k-1]=fits[k].Points;path.Holes[k-1]=fits[k].Curve;}
                        validRegion=IsValidRegion(region);
                    }
                    if(!validRegion){region=RasterTracer.CopyRegions(new[]{sourceRegion}).Single();path=new CurveRegion{Outer=LinearCurve(sourceRegion.Outer)};path.Holes=sourceRegion.Holes.Select(LinearCurve).ToList();partial+=preserved.Count(x=>!x);fits.Clear();}
                    foreach(var fit in fits){cubics+=fit.Cubics;lines+=fit.Lines;continuousSplits+=fit.ContinuousSplits;straightenedLines+=fit.StraightenedLines;ripples+=fit.RipplePoints;fitBound=Math.Max(fitBound,fit.Bound);fitTolerance=Math.Max(fitTolerance,fit.FitTolerance);}
                    regions.Add(region);curves.Add(path);regionIndex++;
                }
                LogoGeometry.Normalize("auto-raster",regions,new Dictionary<string,object>(),false);
                var originalRings=Rings(source).ToList();var candidateRings=Rings(regions).ToList();
                if(originalRings.Count!=candidateRings.Count||source.Count!=regions.Count)throw new LogoVectorException("RASTER_AUTO_TOPOLOGY","轮廓数量发生变化。");
                for(int i=0;i<originalRings.Count;i++)
                {
                    double oldArea=Area(originalRings[i]),newArea=Area(candidateRings[i]);
                    if(Math.Sign(oldArea)!=Math.Sign(newArea)||Math.Abs(newArea-oldArea)>Math.Max(1,Math.Abs(oldArea)*.08))throw new LogoVectorException("RASTER_AUTO_DETAIL","候选轮廓改变了细节或方向。");
                }
                result.Regions=regions;result.Curves=curves;result.CubicSegments=cubics;result.LinearSegments=lines;result.ContinuousSplits=continuousSplits;result.StraightenedLines=straightenedLines;result.RipplePoints=ripples;result.PartialPreservedRings=partial;result.FitBound=fitBound;result.FitTolerance=fitTolerance;result.FitStatus=partial>0?"partially-preserved":"applied";
                result.ApproximationBoundPx=result.PixelReport.CornerBoundPx+result.RefineLimit+result.SmoothLimit+fitBound+result.FlattenLimit;
            }
            catch(LogoVectorException error)
            {
                result.Regions=RasterTracer.CopyRegions(source);result.Curves=null;result.QuadraticSegments=0;result.CubicSegments=0;result.FitStatus="original-preserved";result.FailureCode=error.Code;
                result.ApproximationBoundPx=result.PixelReport.CornerBoundPx;
            }
            result.PointsAfter=CountPoints(result.Regions);
        }
        static string F(double value) => value.ToString("0.#########",CultureInfo.InvariantCulture);
        static string X(double[] p,double factor,double cx) => F(p[0]*factor-cx);
        static string Y(double[] p,double factor,double cy) => F(-(p[1]*factor-cy));
        internal static string ToSvg(LogoDocument logo,Result result,double factor,double cx,double cy)
        {
            if(result.Curves==null)return LogoGeometry.ToSvg(logo);
            var b=new StringBuilder().Append("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"").Append(F(logo.SizeMm[0])).Append("mm\" height=\"").Append(F(logo.SizeMm[1])).Append("mm\" viewBox=\"").Append(F(-logo.SizeMm[0]/2)).Append(' ').Append(F(-logo.SizeMm[1]/2)).Append(' ').Append(F(logo.SizeMm[0])).Append(' ').Append(F(logo.SizeMm[1])).Append("\">");
            foreach(var region in result.Curves)
            {
                b.Append("<path fill=\"#000000\" fill-rule=\"evenodd\" stroke=\"none\" d=\"");
                foreach(var ring in new[]{region.Outer}.Concat(region.Holes))
                {
                    b.Append('M').Append(X(ring.Start,factor,cx)).Append(' ').Append(Y(ring.Start,factor,cy)).Append(' ');
                    foreach(var segment in ring.Segments)
                    {
                        if(segment.Cubic)b.Append('C').Append(X(segment.Control,factor,cx)).Append(' ').Append(Y(segment.Control,factor,cy)).Append(' ').Append(X(segment.Control2,factor,cx)).Append(' ').Append(Y(segment.Control2,factor,cy)).Append(' ');
                        else b.Append('L');
                        b.Append(X(segment.End,factor,cx)).Append(' ').Append(Y(segment.End,factor,cy)).Append(' ');
                    }
                    b.Append("Z ");
                }
                b.Append("\"/>");
            }
            return b.Append("</svg>").ToString();
        }
    }
}
