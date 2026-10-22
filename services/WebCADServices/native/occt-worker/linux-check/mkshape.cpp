// test helper: write BRep of box / cylinder-with-hole
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepTools.hxx>
#include <gp_Ax2.hxx>
#include <fstream>
#include <string>
int main(int c,char**v){std::string k=v[1];TopoDS_Shape s;
 if(k=="box"){double w=atof(v[2]),d=atof(v[3]),h=atof(v[4]);s=BRepPrimAPI_MakeBox(gp_Pnt(-w/2,-d/2,0),w,d,h).Shape();}
 else {double r=atof(v[2]),h=atof(v[3]),hr=atof(v[4]),hx=atof(v[5]);s=BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0,0,0),gp_Dir(0,0,1)),r,h).Shape();if(hr>0)s=BRepAlgoAPI_Cut(s,BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(hx,0,-1),gp_Dir(0,0,1)),hr,h+2).Shape()).Shape();}
 std::ofstream o(v[c-1]);BRepTools::Write(s,o);}
