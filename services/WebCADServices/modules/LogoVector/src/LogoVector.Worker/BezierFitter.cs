using System;
using System.Collections.Generic;
using System.Linq;
using LogoVector.Contracts;

namespace LogoVector.Worker
{
    // Independent implementation of bounded, piecewise cubic least-squares fitting.
    // The corner split and curve-fit ideas follow Potrace (Selinger, 2003) and
    // Schneider, Graphics Gems (1990); the original image is not recoverable exactly.
    internal static class BezierFitter
    {
        internal sealed class Result
        {
            public AutoRasterTracer.CurveRing Curve;
            public List<double[]> Points;
            public AutoRasterTracer.CurveRing FittedCurve;
            public List<double[]> FittedPoints;
            public int Cubics, Lines, RipplePoints, ContinuousSplits, StraightenedLines;
            public int FittedCubics, FittedLines;
            public double FitTolerance, Bound;
            public double FittedBound;
        }
        sealed class Range { public int First, Last; }
        static double[] Add(double[] a,double[] b) => new[]{a[0]+b[0],a[1]+b[1]};
        static double[] Sub(double[] a,double[] b) => new[]{a[0]-b[0],a[1]-b[1]};
        static double[] Mul(double[] a,double k) => new[]{a[0]*k,a[1]*k};
        static double Dot(double[] a,double[] b) => a[0]*b[0]+a[1]*b[1];
        static double Norm(double[] a) => Math.Sqrt(Dot(a,a));
        static double Dist(double[] a,double[] b) => Norm(Sub(a,b));
        static double[] Mix(double[] a,double[] b,double t) => Add(Mul(a,1-t),Mul(b,t));
        static double[] Unit(double[] v,double[] fallback)
        { double n=Norm(v);return n>1e-12?Mul(v,1/n):fallback; }
        static double[] At(IList<double[]> ring,int index) => ring[(index%ring.Count+ring.Count)%ring.Count];
        static double PointSegmentDistance(double[] p,double[] a,double[] b)
        {
            var v=Sub(b,a);double d=Dot(v,v),t=d>0?Math.Max(0,Math.Min(1,Dot(Sub(p,a),v)/d)):0;
            return Dist(p,Add(a,Mul(v,t)));
        }
        static double[] Step(IList<double[]> ring,int index,int direction,double length)
        {
            var p=At(ring,index);double remain=length;
            for(int i=1;i<=ring.Count;i++)
            {
                var q=At(ring,index+i*direction);double d=Dist(p,q);
                if(d>=remain&&d>0)return Mix(p,q,remain/d);
                remain-=d;p=q;
            }
            return p;
        }
        static double Turn(IList<double[]> ring,int index,double radius)
        {
            var p=At(ring,index);var a=Sub(p,Step(ring,index,-1,radius));var b=Sub(Step(ring,index,1,radius),p);
            double d=Norm(a)*Norm(b);return d<1e-12?0:Math.Acos(Math.Max(-1,Math.Min(1,Dot(a,b)/d)))*180/Math.PI;
        }
        static bool Sharp(IList<double[]> ring,int index)
            => Turn(ring,index,2)>=70&&Turn(ring,index,4)>=65;
        static double[] Tangent(IList<double[]> ring,int index,int direction,double radius,bool corner)
        {
            var p=At(ring,index);var neighbor=Step(ring,index,direction,radius);
            var fallback=Unit(Sub(neighbor,p),new[]{(double)direction,0.0});
            if(corner)return fallback;
            var forward=Sub(Step(ring,index,1,radius),Step(ring,index,-1,radius));
            return Mul(Unit(forward,Mul(fallback,direction)),direction);
        }
        // A small alternating signed offset from a multi-pixel chord is evidence
        // of a raster staircase. Persistent turns at both scales are protected.
        static double EstimateRipple(IList<double[]> ring,bool[] pins,out int count)
        {
            var signed=new double[ring.Count];
            for(int i=0;i<ring.Count;i++)
            {
                if(pins[i]||Turn(ring,i,4)>=35)continue;
                var a=Step(ring,i,-1,3);var b=Step(ring,i,1,3);var ab=Sub(b,a);double len=Norm(ab);
                if(len>1e-9)signed[i]=(ab[0]*(ring[i][1]-a[1])-ab[1]*(ring[i][0]-a[0]))/len;
            }
            var values=new List<double>();
            for(int i=0;i<ring.Count;i++)
            {
                double v=signed[i],m=Math.Abs(v);if(m<.06||m>1.25)continue;
                bool alternating=false;
                for(int k=1;k<=3;k++)if(v*signed[(i+k)%ring.Count]<-.0036||v*signed[(i-k+ring.Count)%ring.Count]<-.0036){alternating=true;break;}
                if(alternating)values.Add(m);
            }
            count=values.Count;if(count==0)return 0;values.Sort();return values[count/2];
        }
        static double[] Evaluate(double[][] q,double t)
        {
            double u=1-t;return Add(Add(Mul(q[0],u*u*u),Mul(q[1],3*u*u*t)),Add(Mul(q[2],3*u*t*t),Mul(q[3],t*t*t)));
        }
        static double[] Derivative(double[][] q,double t)
        {
            double u=1-t;return Add(Add(Mul(Sub(q[1],q[0]),3*u*u),Mul(Sub(q[2],q[1]),6*u*t)),Mul(Sub(q[3],q[2]),3*t*t));
        }
        static double[] SecondDerivative(double[][] q,double t)
            => Add(Mul(Add(Sub(q[2],Mul(q[1],2)),q[0]),6*(1-t)),Mul(Add(Sub(q[3],Mul(q[2],2)),q[1]),6*t));
        static double[] Parameters(IList<double[]> ring,int first,int last)
        {
            var u=new double[last-first+1];for(int i=1;i<u.Length;i++)u[i]=u[i-1]+Dist(At(ring,first+i-1),At(ring,first+i));
            double len=u[u.Length-1];if(len<=1e-12){for(int i=1;i<u.Length;i++)u[i]=(double)i/(u.Length-1);}
            else for(int i=1;i<u.Length;i++)u[i]/=len;
            return u;
        }
        static double[][] FitCubic(IList<double[]> ring,int first,int last,double[] u,double[] left,double[] right)
        {
            var a=At(ring,first);var b=At(ring,last);double c00=0,c01=0,c11=0,x0=0,x1=0;
            for(int i=0;i<u.Length;i++)
            {
                double t=u[i],v=1-t,b0=v*v*v,b1=3*v*v*t,b2=3*v*t*t,b3=t*t*t;
                var v0=Mul(left,b1);var v1=Mul(right,b2);
                var residual=Sub(At(ring,first+i),Add(Mul(a,b0+b1),Mul(b,b2+b3)));
                c00+=Dot(v0,v0);c01+=Dot(v0,v1);c11+=Dot(v1,v1);x0+=Dot(v0,residual);x1+=Dot(v1,residual);
            }
            double det=c00*c11-c01*c01,chord=Dist(a,b),alpha=0,beta=0;
            if(Math.Abs(det)>1e-12){alpha=(x0*c11-x1*c01)/det;beta=(x1*c00-x0*c01)/det;}
            double cap=Math.Max(chord*2,1);if(alpha<=chord*1e-4||beta<=chord*1e-4||alpha>cap||beta>cap){alpha=chord/3;beta=chord/3;}
            return new[]{a,Add(a,Mul(left,alpha)),Add(b,Mul(right,beta)),b};
        }
        static double MaxError(IList<double[]> ring,int first,double[] u,double[][] q,out int split)
        {
            double maximum=0;split=u.Length/2;
            for(int i=1;i<u.Length-1;i++){double d=Dist(At(ring,first+i),Evaluate(q,u[i]));if(d>maximum){maximum=d;split=i;}}
            return maximum;
        }
        static bool RefineParameters(IList<double[]> ring,int first,double[] u,double[][] q)
        {
            var next=(double[])u.Clone();
            for(int i=1;i<u.Length-1;i++)
            {
                var diff=Sub(Evaluate(q,u[i]),At(ring,first+i));var d1=Derivative(q,u[i]);var d2=SecondDerivative(q,u[i]);
                double denominator=Dot(d1,d1)+Dot(diff,d2);
                if(Math.Abs(denominator)>1e-12)next[i]=Math.Max(0,Math.Min(1,u[i]-Dot(diff,d1)/denominator));
            }
            for(int i=1;i<next.Length;i++)if(next[i]<=next[i-1]+1e-9)return false;
            Array.Copy(next,u,u.Length);return true;
        }
        static void Split(double[][] q,double t,out double[][] left,out double[][] right)
        {
            var a=Mix(q[0],q[1],t);var b=Mix(q[1],q[2],t);var c=Mix(q[2],q[3],t);
            var d=Mix(a,b,t);var e=Mix(b,c,t);var f=Mix(d,e,t);
            left=new[]{q[0],a,d,f};right=new[]{f,e,c,q[3]};
        }
        // The control points of (Bezier - corresponding polyline segment) bound
        // that entire difference by the convex-hull property, not just samples.
        static double DifferenceBound(IList<double[]> ring,int first,double[] u,double[][] q,out int worstInterval)
        {
            double bound=0;worstInterval=0;
            for(int i=0;i<u.Length-1;i++)
            {
                double[][] before,discard,portion;Split(q,u[i+1],out before,out discard);
                if(u[i]>0){double[][] ignored;Split(before,u[i]/u[i+1],out ignored,out portion);}else portion=before;
                var p=At(ring,first+i);var next=At(ring,first+i+1);
                var linear=new[]{p,Mix(p,next,1.0/3),Mix(p,next,2.0/3),next};
                for(int k=0;k<4;k++)
                {
                    double distance=Dist(portion[k],linear[k]);
                    if(distance>bound){bound=distance;worstInterval=i;}
                }
            }
            return bound;
        }
        static void AppendPoint(List<double[]> points,double[] p)
        { if(points.Count==0||Dist(points[points.Count-1],p)>1e-9)points.Add((double[])p.Clone()); }
        static AutoRasterTracer.CurveRing CloneCurve(AutoRasterTracer.CurveRing source)
        {
            var copy=new AutoRasterTracer.CurveRing{Start=(double[])source.Start.Clone()};
            foreach(var segment in source.Segments)copy.Segments.Add(new AutoRasterTracer.CurveSegment{Cubic=segment.Cubic,CornerAfter=segment.CornerAfter,SourceFirst=segment.SourceFirst,SourceLast=segment.SourceLast,Control=segment.Control==null?null:(double[])segment.Control.Clone(),Control2=segment.Control2==null?null:(double[])segment.Control2.Clone(),End=(double[])segment.End.Clone()});
            return copy;
        }
        internal static bool RestoreFittedCurve(Result result)
        {
            if(result==null||result.StraightenedLines==0||result.FittedCurve==null||result.FittedPoints==null)return false;
            result.Curve=CloneCurve(result.FittedCurve);result.Points=result.FittedPoints.Select(p=>(double[])p.Clone()).ToList();
            result.Cubics=result.FittedCubics;result.Lines=result.FittedLines;result.Bound=result.FittedBound;result.StraightenedLines=0;
            return true;
        }
        static void Flatten(double[][] q,double limit,List<double[]> points)
        {
            var pending=new Stack<Tuple<double[][],int>>();pending.Push(Tuple.Create(q,0));int emitted=0;
            while(pending.Count>0)
            {
                var item=pending.Pop();var curve=item.Item1;
                double flat=Math.Max(PointSegmentDistance(curve[1],curve[0],curve[3]),PointSegmentDistance(curve[2],curve[0],curve[3]));
                if(flat<=limit){AppendPoint(points,curve[3]);if(++emitted>1000000)throw new LogoVectorException("RASTER_AUTO_LIMIT","曲线采样超出限制。");continue;}
                if(item.Item2>=24)throw new LogoVectorException("RASTER_AUTO_LIMIT","曲线无法在允许误差内采样。");
                double[][] left,right;Split(curve,.5,out left,out right);pending.Push(Tuple.Create(right,item.Item2+1));pending.Push(Tuple.Create(left,item.Item2+1));
            }
        }
        static void AppendLine(Result result,IList<double[]> ring,int first,int last,bool corner)
        { result.Curve.Segments.Add(new AutoRasterTracer.CurveSegment{End=(double[])At(ring,last).Clone(),SourceFirst=first,SourceLast=last,CornerAfter=corner});result.Lines++;AppendPoint(result.Points,At(ring,last)); }
        // A straight run has bounded distance to its chord and progresses along
        // it without doubling back. The distance bound also covers the portions
        // between sparse vertices because point-to-segment distance is convex.
        static bool TryStraight(IList<double[]> ring,bool[] pins,int first,int last,double tolerance,out double bound)
        {
            var start=At(ring,first);var end=At(ring,last);var axis=Sub(end,start);double length2=Dot(axis,axis);
            bound=0;if(length2<9)return false;
            double previous=-1e-6;var deviations=new List<double>();
            for(int i=first+1;i<last;i++)
            {
                var point=At(ring,i);double position=Dot(Sub(point,start),axis)/length2;
                if(position<previous-1e-6||position>1+1e-6)return false;
                previous=position;bound=Math.Max(bound,PointSegmentDistance(point,start,end));
                double signed=(axis[0]*(point[1]-start[1])-axis[1]*(point[0]-start[0]))/Math.Sqrt(length2);
                deviations.Add(signed);
                if(bound>tolerance)return false;
            }
            double center=deviations.Count==0?0:(deviations.Min()+deviations.Max())/2;
            var residualSigns=deviations.Select(x=>x-center).Where(x=>Math.Abs(x)>.08).Select(x=>x>0?1:-1).ToList();
            // Remove the contour's local pixel-phase bias before testing whether
            // high-frequency raster residuals alternate around a straight chord.
            if(bound>.15&&residualSigns.Count>=4)
            {
                int switches=0;for(int i=1;i<residualSigns.Count;i++)if(residualSigns[i]!=residualSigns[i-1])switches++;
                if(switches<(residualSigns.Count-1)*.45)return false;
            }
            else if(bound>.15)return false;
            var direction=Unit(axis,new[]{1.0,0.0});
            bool sharpStart=pins[first%ring.Count]&&Sharp(ring,first),sharpEnd=pins[last%ring.Count]&&Sharp(ring,last);
            // A short chord across a curved edge is not a real straight run.
            if(!sharpStart&&Dot(direction,Tangent(ring,first,1,8,false))<.999390827)return false;
            if(!sharpEnd&&Dot(Mul(direction,-1),Tangent(ring,last,-1,8,false))<.999390827)return false;
            return true;
        }
        // The cubic pass first fits every ambiguous span. Only afterwards does
        // this pass replaces a run with a line when the source contour residuals
        // and both endpoint tangents agree with that chord at subpixel scale.
        static void PostFitStraighten(IList<double[]> ring,bool[] pins,Result result,double flatten)
        {
            var source=result.Curve.Segments.ToList();var output=new List<AutoRasterTracer.CurveSegment>();
            for(int i=0;i<source.Count;)
            {
                int best=-1;double bestBound=0;int cap=Math.Min(source.Count-1,i+127);
                for(int j=i;j<=cap;j++)
                {
                    if(j>i&&(source[j-1].CornerAfter||source[j].SourceFirst!=source[j-1].SourceLast))break;
                    int first=source[i].SourceFirst,last=source[j].SourceLast;if(last-first<2)continue;
                    double bound;if(!TryStraight(ring,pins,first,last,Math.Min(.85,result.FitTolerance),out bound))
                    {
                        // A short prefix may not yet contain enough signed
                        // residuals to distinguish a raster staircase from a
                        // smooth arc. Extend it before rejecting the run.
                        if(last-first<8)continue;
                        break;
                    }
                    var a=At(ring,first);var b=At(ring,last);
                    // Keep joins to adjacent curves within two degrees unless
                    // the run starts/ends at a protected true corner.
                    int previousIndex=(i+source.Count-1)%source.Count;bool cornerStart=source[previousIndex].CornerAfter,cornerEnd=source[j].CornerAfter;
                    var chord=Unit(Sub(b,a),new[]{1.0,0.0});
                    if(!cornerStart)
                    {
                        var previous=source[previousIndex];var incoming=previous.Cubic?Sub(previous.End,previous.Control2):Sub(previous.End,At(ring,previous.SourceFirst));
                        if(Norm(incoming)>1e-12&&Dot(Unit(incoming,chord),chord)<.999390827)break;
                    }
                    if(!cornerEnd&&j+1<source.Count)
                    {
                        var next=source[j+1];var outgoing=next.Cubic?Sub(next.Control, next.End):Sub(At(ring,next.SourceLast),At(ring,next.SourceFirst));
                        // For a next segment, its start tangent points forward from its source start.
                        if(next.Cubic)outgoing=Sub(next.Control,At(ring,next.SourceFirst));
                        else outgoing=Sub(At(ring,next.SourceLast),At(ring,next.SourceFirst));
                        if(Norm(outgoing)>1e-12&&Dot(Unit(outgoing,chord),chord)<.999390827)break;
                    }
                    if(Dist(a,b)>=3){best=j;bestBound=bound;}
                    if(source[j].CornerAfter)break;
                }
                if(best>=i)
                {
                    var last=source[best];output.Add(new AutoRasterTracer.CurveSegment{End=(double[])last.End.Clone(),SourceFirst=source[i].SourceFirst,SourceLast=last.SourceLast,CornerAfter=last.CornerAfter});
                    result.Bound=Math.Max(result.Bound,bestBound);result.StraightenedLines++;i=best+1;
                }
                else output.Add(source[i++]);
            }
            result.Curve.Segments.Clear();result.Curve.Segments.AddRange(output);
            result.Cubics=output.Count(x=>x.Cubic);result.Lines=output.Count(x=>!x.Cubic);
            result.Points=new List<double[]>();AppendPoint(result.Points,result.Curve.Start);var p=(double[])result.Curve.Start.Clone();
            foreach(var segment in output)
            {
                if(segment.Cubic)Flatten(new[]{p,segment.Control,segment.Control2,segment.End},flatten,result.Points);
                else AppendPoint(result.Points,segment.End);
                p=segment.End;
            }
            if(result.Points.Count>1&&Dist(result.Points[0],result.Points[result.Points.Count-1])<=1e-9)result.Points.RemoveAt(result.Points.Count-1);
        }
        static void ClampControls(double[][] q,double[] bounds)
        {
            if(bounds==null)return;
            for(int i=1;i<=2;i++)q[i]=new[]{Math.Max(bounds[0],Math.Min(bounds[2],q[i][0])),Math.Max(bounds[1],Math.Min(bounds[3],q[i][1]))};
        }
        static bool TrySmoothEdge(IList<double[]> ring,bool[] pins,int first,int last,double[] bounds,double flatten,Result result)
        {
            int n=ring.Count;if(pins[first%n]&&Sharp(ring,first)||pins[last%n]&&Sharp(ring,last))return false;
            var a=At(ring,first);var b=At(ring,last);var chord=Sub(b,a);double length=Norm(chord);if(length<1e-9)return false;
            var direction=Mul(chord,1/length);var left=Tangent(ring,first,1,4,false);var right=Tangent(ring,last,-1,4,false);
            double leftAlignment=Dot(direction,left),rightAlignment=Dot(Mul(direction,-1),right);
            if(leftAlignment>=.996194698&&rightAlignment>=.996194698)return false;
            if(leftAlignment<=0||rightAlignment<=0)return false;
            var q=new[]{a,Add(a,Mul(left,length/3)),Add(b,Mul(right,length/3)),b};ClampControls(q,bounds);
            double l2=length*length,t1=Dot(Sub(q[1],a),chord)/l2,t2=Dot(Sub(q[2],a),chord)/l2;
            if(t1<0||t1>1||t2<0||t2>1)return false;
            double bound=Math.Max(PointSegmentDistance(q[1],a,b),PointSegmentDistance(q[2],a,b));
            if(bound>result.FitTolerance)return false;
            result.Bound=Math.Max(result.Bound,bound);result.Curve.Segments.Add(new AutoRasterTracer.CurveSegment{Cubic=true,Control=q[1],Control2=q[2],End=q[3],SourceFirst=first,SourceLast=last,CornerAfter=pins[last%n]&&Sharp(ring,last)});
            result.Cubics++;Flatten(q,flatten,result.Points);return true;
        }
        internal static Result Fit(IList<double[]> ring,bool[] pins,double baseTolerance,double flatten,double[] bounds=null)
        {
            int ripple;double noise=EstimateRipple(ring,pins,out ripple);
            var result=new Result{RipplePoints=ripple,FitTolerance=Math.Max(.65,Math.Min(1.0,baseTolerance+noise*.5))};
            var anchors=Enumerable.Range(0,ring.Count).Where(i=>pins[i]).ToList();
            if(anchors.Count==0)anchors.Add(0);
            if(anchors.Count==1)anchors.Add((anchors[0]+ring.Count/2)%ring.Count);
            anchors.Sort();result.Curve=new AutoRasterTracer.CurveRing{Start=(double[])ring[anchors[0]].Clone()};
            result.Points=new List<double[]>();AppendPoint(result.Points,result.Curve.Start);long budget=5000000;
            for(int k=0;k<anchors.Count;k++)
            {
                int start=anchors[k],end=k+1<anchors.Count?anchors[k+1]:anchors[0]+ring.Count;
                var pending=new Stack<Range>();pending.Push(new Range{First=start,Last=end});
                while(pending.Count>0)
                {
                    var part=pending.Pop();int count=part.Last-part.First+1;
                    if(count<=2){if(!TrySmoothEdge(ring,pins,part.First,part.Last,bounds,flatten,result))AppendLine(result,ring,part.First,part.Last,pins[part.Last%ring.Count]&&Sharp(ring,part.Last));continue;}
                    budget-=count;
                    if(budget<0){for(int j=part.First+1;j<=part.Last;j++)AppendLine(result,ring,j-1,j,pins[j%ring.Count]&&Sharp(ring,j));continue;}
                    var u=Parameters(ring,part.First,part.Last);double arc=0;for(int i=part.First;i<part.Last;i++)arc+=Dist(At(ring,i),At(ring,i+1));
                    double radius=Math.Max(.5,Math.Min(4,arc/3));
                    var left=Tangent(ring,part.First,1,radius,pins[part.First%ring.Count]&&Sharp(ring,part.First));
                    var right=Tangent(ring,part.Last,-1,radius,pins[part.Last%ring.Count]&&Sharp(ring,part.Last));
                    double[][] q=null;double error=double.PositiveInfinity;int split=count/2;
                    for(int iteration=0;iteration<4;iteration++)
                    {
                        q=FitCubic(ring,part.First,part.Last,u,left,right);ClampControls(q,bounds);error=MaxError(ring,part.First,u,q,out split);
                        if(error<=result.FitTolerance||!RefineParameters(ring,part.First,u,q))break;
                    }
                    if(error>result.FitTolerance)
                    {
                        int mid=part.First+Math.Max(1,Math.Min(count-2,split));
                        pending.Push(new Range{First=mid,Last=part.Last});pending.Push(new Range{First=part.First,Last=mid});continue;
                    }
                    int worstInterval;double continuousBound=DifferenceBound(ring,part.First,u,q,out worstInterval);
                    if(continuousBound>result.FitTolerance)
                    {
                        // Vertex-only residuals miss a curve that bows between
                        // endpoints of one long raster edge. Split at that edge.
                        int mid=part.First+Math.Max(1,Math.Min(count-2,worstInterval+1));
                        pending.Push(new Range{First=mid,Last=part.Last});pending.Push(new Range{First=part.First,Last=mid});result.ContinuousSplits++;continue;
                    }
                    result.Bound=Math.Max(result.Bound,continuousBound);
                    result.Curve.Segments.Add(new AutoRasterTracer.CurveSegment{Cubic=true,Control=q[1],Control2=q[2],End=q[3],SourceFirst=part.First,SourceLast=part.Last,CornerAfter=pins[part.Last%ring.Count]&&Sharp(ring,part.Last)});
                    result.Cubics++;Flatten(q,flatten,result.Points);
                }
            }
            result.FittedCurve=CloneCurve(result.Curve);result.FittedPoints=result.Points.Select(p=>(double[])p.Clone()).ToList();
            result.FittedCubics=result.Cubics;result.FittedLines=result.Lines;result.FittedBound=result.Bound;
            PostFitStraighten(ring,pins,result,flatten);
            if(result.Points.Count>1&&Dist(result.Points[0],result.Points[result.Points.Count-1])<=1e-9)result.Points.RemoveAt(result.Points.Count-1);
            return result;
        }
    }
}
