import {ownNativeBoolean} from '../io/native-boolean-lifetime.js';
import {distance,fail,readShape,scale,scope,unit,validShape} from './exact-input.js';

export function projectCurveOnFace(sources,params,cad) {
  const {hold,close}=scope(), oc=cad.getOC(), cache=new Map();
  try {
    const direction=unit(params.direction);
    if (!direction) fail('FREEFORM_PROJECTION','投影方向须为非零向量。');
    const target=readShape(sources,params.target,'faces',hold,cache);
    const targetBounds=hold(target.boundingBox).bounds;
    const cutters=params.curves.map(item=>{
      const edge=readShape(sources,item,'edges',hold,cache);
      const edgeBounds=hold(edge.boundingBox).bounds;
      const span=Math.max(...targetBounds.flatMap(p=>edgeBounds.map(q=>distance(p,q))))+
        distance(...targetBounds)+distance(...edgeBounds)+1;
      const both=params.reach==='both';
      const base=both?hold(edge.clone().translate(scale(direction,-span))):edge;
      const prism=hold(new oc.BRepPrimAPI_MakePrism(base.wrapped,hold(new oc.gp_Vec(...scale(direction,span*(both?2:1)))),false,true));
      return hold(cad.cast(prism.Shape()));
    });
    const tools=hold(cad.makeCompound(cutters.map(cutter=>cutter.clone())));
    let result, report;
    if(params.output==='curves'){
      const section=ownNativeBoolean(new oc.BRepAlgoAPI_Section(target.wrapped,tools.wrapped,false),hold);
      section.Approximation(true);section.Build();
      if (!section.IsDone()) fail('FREEFORM_PROJECTION','曲线和目标面无法求交。');
      const output=hold(cad.cast(section.Shape())), edges=output.edges.map(hold);
      if(!edges.length) fail('FREEFORM_PROJECTION','投影方向上没有命中目标面。');
      result=output;report={output:'curves',edgeCount:edges.length};
    }else{
      const splitter=ownNativeBoolean(new oc.BRepAlgoAPI_Splitter(),hold);
      const argumentsList=hold(new oc.NCollection_List_TopoDS_Shape()), toolList=hold(new oc.NCollection_List_TopoDS_Shape());
      argumentsList.Append(target.wrapped);
      for (const cutter of cutters) toolList.Append(cutter.wrapped);
      splitter.SetArguments(argumentsList);splitter.SetTools(toolList);splitter.Build();
      if (!splitter.IsDone()) fail('FREEFORM_PROJECTION','投影切分未能完成。');
      const output=hold(cad.cast(splitter.Shape())), faces=output.faces.map(hold);
      const sourceArea=cad.measureArea(target), areaDeviationMm2=Math.abs(cad.measureArea(output)-sourceArea);
      if(faces.length<2 || !(areaDeviationMm2<=Math.max(1e-5,sourceArea*1e-5))) {
        fail('FREEFORM_PROJECTION','投影线没有完整分开目标面，请检查线的端点或闭合轮廓。');
      }
      result=output;report={output:'faces',faceCount:faces.length,areaDeviationMm2};
    }
    if (!validShape(result,oc)) fail('FREEFORM_PROJECTION','投影结果的拓扑无效。');
    const copy=result.clone();copy.freeformReport=report;return copy;
  } finally {close();}
}
