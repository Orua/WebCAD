#include <TopoDS.hxx>
#include <BRep_Tool.hxx>
#include <TopExp_Explorer.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <TopExp_Explorer.hxx>
#include <iostream>
#include <BRepMesh_IncrementalMesh.hxx>
#include <Poly_Triangulation.hxx>
#include <TopoDS_Face.hxx>
static double meshVol(const TopoDS_Shape& s){BRepMesh_IncrementalMesh m(s,atof(getenv("DEF")),false,0.02);double v=0;for(TopExp_Explorer x(s,TopAbs_FACE);x.More();x.Next()){const TopoDS_Face& f=TopoDS::Face(x.Current());TopLoc_Location L;auto t=BRep_Tool::Triangulation(f,L);if(t.IsNull())continue;for(int i=1;i<=t->NbTriangles();i++){int a,b,c;t->Triangle(i).Get(a,b,c);if(f.Orientation()==TopAbs_REVERSED)std::swap(b,c);gp_Pnt p=t->Node(a).Transformed(L),q=t->Node(b).Transformed(L),r=t->Node(c).Transformed(L);v+=p.XYZ().Dot(q.XYZ().Crossed(r.XYZ()))/6;}}return v;}
#include <BRep_Tool.hxx>
#include <TopoDS.hxx>
#include <fstream>
int main(int c,char**v){TopoDS_Shape s;BRep_Builder b;std::ifstream f(v[1]);BRepTools::Read(s,f,b);GProp_GProps a,g;BRepGProp::VolumeProperties(s,a);double e=BRepGProp::VolumePropertiesGK(s,g,1e-9,true,true);int faces=0;for(TopExp_Explorer x(s,TopAbs_FACE);x.More();x.Next())faces++;
double mt=0;for(TopExp_Explorer x(s,TopAbs_EDGE);x.More();x.Next())mt=std::max(mt,BRep_Tool::Tolerance(TopoDS::Edge(x.Current())));std::cout.precision(12);{GProp_GProps q0(gp_Pnt(0,0,atof(getenv("Z"))));BRepGProp::VolumeProperties(s,q0);std::cout.precision(12);std::cout<<"loc "<<q0.Mass()<<"\n";GProp_GProps q;double er=BRepGProp::VolumeProperties(s,q,1e-7,true);std::cout.precision(12);std::cout<<"eps "<<q.Mass()<<" err "<<er<<"\n";}std::cout<<"mesh "<<meshVol(s)<<"\n";std::cout<<"maxEdgeTol "<<mt<<"\n";std::cout<<"{\"default\":"<<a.Mass()<<",\"gk\":"<<g.Mass()<<",\"gkErr\":"<<e<<",\"faces\":"<<faces<<",\"valid\":"<<BRepCheck_Analyzer(s).IsValid()<<"}\n";}
