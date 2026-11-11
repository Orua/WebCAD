#pragma once
#include <BRepAlgoAPI_Fuse.hxx>
#include <BRepFilletAPI_MakeFillet.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepLProp_SLProps.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRep_Tool.hxx>
#include <Geom2d_Curve.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <set>

// All indices are transient in this process. Only geometric intent or the
// current Boolean history selects edges; browser topology numbers never cross.
static bool seamSharp(const TopoDS_Edge& edge,const TopTools_ListOfShape& faces){
 if(BRep_Tool::Degenerated(edge)||faces.Extent()!=2)return false;
 gp_Dir normals[2];int i=0;
 for(TopTools_ListIteratorOfListOfShape it(faces);it.More();it.Next()){
  const auto face=TopoDS::Face(it.Value());if(BRep_Tool::IsClosed(edge,face))return false;
  double first,last;const auto curve=BRep_Tool::CurveOnSurface(edge,face,first,last);
  if(curve.IsNull())throw BooleanFailure("SELECTOR_UNCERTAIN","Edge has no surface parameter curve");
  const auto uv=curve->Value((first+last)/2);BRepAdaptor_Surface surface(face);
  BRepLProp_SLProps props(surface,uv.X(),uv.Y(),1,1e-9);
  if(!props.IsNormalDefined())throw BooleanFailure("SELECTOR_UNCERTAIN","Edge surface normal is undefined");
  normals[i]=props.Normal();if(face.Orientation()==TopAbs_REVERSED)normals[i].Reverse();++i;
 }
 return normals[0].Angle(normals[1])>1e-3;
}
static TopoDS_Shape exactSeamBlend(const TopoDS_Shape& source,const std::vector<TopoDS_Edge>& edges,const json& requested,json& report){
 if(edges.empty())throw BooleanFailure("SELECTOR_EMPTY","No sharp edge matched the requested seam; source retained");
 if(edges.size()>64)throw BooleanFailure("SELECTION_LIMIT","Select at most 64 sharp seam edges per operation");
 double maximum,minimum,ratio=.75;int limit=1;
 if(requested.is_number()){maximum=minimum=requested.get<double>();}
 else {keys(requested,{"maxMm","minMm","stepRatio","maxAttempts"});maximum=requested.at("maxMm");minimum=requested.at("minMm");ratio=requested.value("stepRatio",.75);limit=requested.value("maxAttempts",6);}
 if(!std::isfinite(maximum)||!std::isfinite(minimum)||minimum<=0||maximum<minimum||maximum>10000||!std::isfinite(ratio)||ratio<=0||ratio>=1||limit<1||limit>6)throw BooleanFailure("PARAM_SCHEMA_INVALID","Explicit finite radius or bounded radius range required");
 json tried=json::array();double radius=maximum;
 for(int attempt=0;attempt<limit;++attempt){
  BRepFilletAPI_MakeFillet fillet(source);for(const auto& edge:edges)fillet.Add(radius,edge);
  bool valid=false;TopoDS_Shape result;std::string reason;
  try{fillet.Build();if(fillet.IsDone()){result=fillet.Shape();measure(result);valid=true;}else reason="OCCT build incomplete";}
  catch(const Standard_Failure& e){reason=e.GetMessageString()?e.GetMessageString():"OCCT failure";}
  catch(const std::exception& e){reason=e.what();}
  tried.push_back({{"radiusMm",radius},{"ok",valid},{"faultyContours",fillet.NbFaultyContours()},{"reason",reason.substr(0,200)}});
  if(valid){report={{"status","applied"},{"requestedRadiusMm",requested},{"radiusUsedMm",radius},{"processedEdgeCount",edges.size()},
   {"attemptCount",tried.size()},{"tried",tried},{"numericIndicesTransferred",false},{"scope","selected-sharp-edges"}};return result;}
  if(radius<=minimum||attempt+1>=limit)break;
  radius=attempt+2==limit?minimum:std::max(minimum,radius*ratio);
 }
 BooleanFailure failure("BLEND_BUILD_FAILED","No valid complete seam blend in the explicitly requested radius range; source retained");
 failure.details={{"requestedRadiusMm",requested},{"tried",tried},{"selectedEdgeCount",edges.size()},{"pointsMm",json::array()}};
 for(size_t i=0;i<edges.size()&&i<16;i++){BRepAdaptor_Curve curve(edges[i]);const auto p=curve.Value((curve.FirstParameter()+curve.LastParameter())/2);failure.details["pointsMm"].push_back({p.X(),p.Y(),p.Z()});}
 throw failure;
}
static TopoDS_Shape runSeamOperation(const TopoDS_Shape& source,const json& params,bool isUnion,json& unionReport,json& blendReport,
 std::string& stage,const std::function<void()>& progress){
 TopoDS_Shape current=source;std::vector<TopoDS_Edge> targets;
 if(isUnion){
  keys(params,{"toolPaths","blendRadiusMm","blendMode","fuzzyMm","glue"});
  const auto& paths=params.at("toolPaths");if(!paths.is_array()||paths.empty()||paths.size()>32)throw BooleanFailure("BOOLEAN_INPUT_LIMIT","Union requires 2 to 33 solid inputs");
  std::vector<TopoDS_Shape> inputs{source};TopTools_ListOfShape args,tools;args.Append(source);
  double largest=measure(source).at("volumeMm3"),sum=largest;
  stage="read-union-tools";progress();
  for(const auto& path:paths){
   std::ifstream file(path.get<std::string>(),std::ios::binary|std::ios::ate);
   if(!file||file.tellg()<=0||file.tellg()>20*1024*1024)throw BooleanFailure("BOOLEAN_INPUT_LIMIT","Missing or oversized union source");
   file.seekg(0);TopoDS_Shape shape;BRep_Builder builder;BRepTools::Read(shape,file,builder);
   const double v=measure(shape).at("volumeMm3");sum+=v;largest=std::max(largest,v);inputs.push_back(shape);tools.Append(shape);
  }
  const double fuzzy=params.value("fuzzyMm",0.0);const auto glue=params.value("glue",std::string("off"));
  if(!std::isfinite(fuzzy)||fuzzy<0||fuzzy>.1||glue!="off"&&glue!="shift"&&glue!="full")throw BooleanFailure("PARAM_SCHEMA_INVALID","Invalid explicit Boolean tolerance/glue");
  if(params.contains("blendMode")&&params.at("blendMode")!="fillet")throw BooleanFailure("OPERATION_UNAVAILABLE","Native union supports exact constant seam radius only");
  stage="boolean-union";progress();BRepAlgoAPI_Fuse fusion;fusion.SetArguments(args);fusion.SetTools(tools);fusion.SetNonDestructive(true);fusion.SetRunParallel(false);fusion.SetFuzzyValue(fuzzy);
  fusion.SetGlue(glue=="shift"?BOPAlgo_GlueShift:glue=="full"?BOPAlgo_GlueFull:BOPAlgo_GlueOff);fusion.Build();
  if(!fusion.IsDone()||fusion.HasErrors())throw BooleanFailure("BOOLEAN_BUILD_FAILED","Native fusion failed; inputs retained");
  current=fusion.Shape();const double v=measure(current).at("volumeMm3");
  if(v<largest-1e-7-sum*1e-8||v>sum+1e-7+sum*1e-8)throw BooleanFailure("BOOLEAN_MATERIAL_INVALID","Fusion material range is invalid");
  unionReport={{"status","applied"},{"inputCount",inputs.size()},{"volumeBeforeSumMm3",sum},{"largestInputVolumeMm3",largest},{"volumeAfterMm3",v},{"fuzzyMm",fuzzy},{"glue",glue},{"strategy","multi-fuse"}};
  if(params.contains("blendRadiusMm")){
   TopTools_IndexedMapOfShape resultFaces;TopExp::MapShapes(current,TopAbs_FACE,resultFaces);std::vector<std::set<int>> origins(resultFaces.Extent()+1);
   const auto bind=[&](const TopoDS_Shape& face,int input){const int index=resultFaces.FindIndex(face);if(index)origins[index].insert(input);};
   for(int input=0;input<(int)inputs.size();++input)for(TopExp_Explorer ex(inputs[input],TopAbs_FACE);ex.More();ex.Next()){
    bind(ex.Current(),input);
    for(const auto* history:{&fusion.Modified(ex.Current()),&fusion.Generated(ex.Current())})
     for(TopTools_ListIteratorOfListOfShape it(*history);it.More();it.Next())bind(it.Value(),input);
   }
   TopTools_IndexedDataMapOfShapeListOfShape ancestors;TopExp::MapShapesAndAncestors(current,TopAbs_EDGE,TopAbs_FACE,ancestors);
   for(int i=1;i<=ancestors.Extent();++i){const auto& faces=ancestors.FindFromIndex(i);if(faces.Extent()!=2)continue;
    const auto& a=origins[resultFaces.FindIndex(faces.First())];const auto& b=origins[resultFaces.FindIndex(faces.Last())];
    if(a.size()==1&&b.size()==1&&*a.begin()!=*b.begin()&&seamSharp(TopoDS::Edge(ancestors.FindKey(i)),faces))targets.push_back(TopoDS::Edge(ancestors.FindKey(i)));
   }
  }else return current;
 }else{
  keys(params,{"radius","selector"});const auto& proximity=params.at("selector").at("edgesNear");keys(params.at("selector"),{"edgesNear"});keys(proximity,{"pointMm","radiusMm","sharpOnly"});
  const auto& p=proximity.at("pointMm");if(!p.is_array()||p.size()!=3)throw BooleanFailure("PARAM_SCHEMA_INVALID","World point requires three finite coordinates");
  for(const auto& x:p)if(!x.is_number()||!std::isfinite(x.get<double>())||std::abs(x.get<double>())>100000)throw BooleanFailure("PARAM_SCHEMA_INVALID","Invalid world point");
  const double distance=proximity.at("radiusMm");if(!std::isfinite(distance)||distance<=0||distance>10000||proximity.value("sharpOnly",true)!=true)throw BooleanFailure("PARAM_SCHEMA_INVALID","Positive local sharp-edge selection required");
  const auto vertex=BRepBuilderAPI_MakeVertex(gp_Pnt(p[0],p[1],p[2])).Vertex();TopTools_IndexedDataMapOfShapeListOfShape ancestors;TopExp::MapShapesAndAncestors(current,TopAbs_EDGE,TopAbs_FACE,ancestors);
  for(int i=1;i<=ancestors.Extent();++i){const auto edge=TopoDS::Edge(ancestors.FindKey(i));BRepExtrema_DistShapeShape query(vertex,edge);if(!query.IsDone())throw BooleanFailure("SELECTOR_UNCERTAIN","Exact point-edge distance unavailable");if(query.Value()<=distance&&seamSharp(edge,ancestors.FindFromIndex(i)))targets.push_back(edge);}
 }
 stage="blend-selected-seam";progress();return exactSeamBlend(current,targets,isUnion?params.at("blendRadiusMm"):params.at("radius"),blendReport);
}
