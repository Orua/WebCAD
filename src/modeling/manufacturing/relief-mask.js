import {validateRegions} from '../../logo-model.js';
import {contourWire,wireFromContourPlan} from './relief-curves.js';
import {planRegionContours} from './relief-region-plan.js';
import {mergeStrokeRegions} from './relief-strokes.js';

const dispose=x=>{try{x?.delete?.();}catch{}};
const fail=message=>{throw Object.assign(new Error(message),{code:'RELIEF_INVALID'});};

// Contours are independent of the low-resolution height controls. Only material
// inside these contours may change; holes and the surrounding host stay intact.
export function maskReliefTool(tool,p,frame,oc,cad,onProgress,{regionGroups}={}){
 if(!p.regions&&!p.strokes){if(p.surfaceMode==='flat')fail('平顶浮雕需要明确图案轮廓');return tool;}
 let regions;
 const scaleRing=(ring,divide=false)=>ring.map(([x,y])=>divide?[x/p.widthMm,y/p.heightMm]:[x*p.widthMm,y*p.heightMm]);
 try{const groups=regionGroups?.length>1?regionGroups:[p.regions??[]];regions=p.regions?groups.flatMap(group=>validateRegions({regions:group.map(r=>({outer:scaleRing(r.outer),holes:(r.holes??[]).map(h=>scaleRing(h))}))},{maxRegions:1024,maxVertices:64000})).map(r=>({outer:scaleRing(r.outer,true),holes:r.holes.map(h=>scaleRing(h,true))})):[];}catch(e){fail('浮雕轮廓无效：'+e.message);}
 try{regions=mergeStrokeRegions(regions,p.strokes,p.widthMm,p.heightMm,p.contourSnapMm??0);}catch(e){fail('轮廓清理或刻线合并失败：'+e.message);}
 for(const r of regions)for(const ring of [r.outer,...r.holes])for(const [x,y]of ring){
  if(Math.abs(x)>.5+1e-9||Math.abs(y)>.5+1e-9)fail('浮雕轮廓必须位于归一化图案范围 -0.5…0.5');
 }
 const owned=[],hold=x=>(owned.push(x),x),sign=p.mode==='engrave'?-1:1,conversions=[];
 const flat=p.surfaceMode==='flat',sag=frame.radius?frame.radius*(1-Math.cos(p.widthMm/frame.radius/2)):0;
 const strategy=p.maskStrategy??'cutHoleSolids';
 if(!['cutHoleSolids','faceWithHolesExtrude'].includes(strategy))fail('未知浮雕轮廓刀具策略');
 if(flat&&sign<0&&p.depthMm<=sag)fail('平顶凹雕深度须超过图案范围的柱面弓高');
 const patchRaise=Math.max(0,...(p.localPatches??[]).flatMap(patch=>patch.deltaMm.flat()));
 const low=sign>0?-sag-.01:-sag-p.depthMm-(p.baseMm??0)-.02,high=sign>0?p.depthMm+(p.baseMm??0)+patchRaise+.02:.01;
 const at=(xy,h)=>frame.point(xy[0]*p.widthMm,xy[1]*p.heightMm,h);
 try{
  const wire=(ring,bottom,closed=true,tolerance=p.curveToleranceMm??0,orientation=1,role='outer',planned=null)=>{
   const signed=ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-p[1]*q[0];},0);
   if(closed&&signed*orientation<0)ring=[...ring].reverse();
   const report=value=>conversions.push({...value,role});
   if(planned){const plan=orientation<0?{...planned,segments:[...planned.segments].reverse().map(s=>({...s,start:s.end,end:s.start}))}:planned;return hold(wireFromContourPlan(plan,cad,report));}
   return hold(contourWire(ring.map(xy=>at(xy,bottom)),frame.normal,cad,tolerance,closed,report));
  };
  const extrude=(face,bottom,top)=>{
   const v=hold(new cad.Vector(frame.normal.map(n=>n*(top-bottom))));
   const solid=hold(cad.basicFaceExtrusion(face,v));
   if(!(solid instanceof cad.Solid)||!oc.BRepLib.OrientClosedSolid(solid.wrapped))fail('浮雕轮廓刀具未闭合');
   return solid;
  };
  const boolean=(type,a,b)=>{
   const builder=hold(new oc[type]()),args=hold(new oc.NCollection_List_TopoDS_Shape()),tools=hold(new oc.NCollection_List_TopoDS_Shape());
   args.Append(a.wrapped);tools.Append(b.wrapped);builder.SetArguments(args);builder.SetTools(tools);builder.SetNonDestructive(true);builder.SetFuzzyValue(1e-7);builder.Build();
   if(builder.HasErrors())fail('浮雕轮廓布尔计算失败');
   return hold(cad.cast(builder.Shape()));
  };
  const pieces=[];
  for(const [index,r] of regions.entries()){
   const regionOwnedStart=owned.length;let retained;
   try{
   if(index%10===0)onProgress?.({phase:'relief-contour',completed:index,total:regions.length});
   let failure='';
   const bottom=flat&&sign<0?-p.depthMm:low,top=flat&&sign>0?p.depthMm:high;
   const build=(tolerance)=>{
    const planned=p.curvePolicy?planRegionContours([r.outer,...r.holes].map(ring=>{const signed=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-a[1]*b[0];},0);return (signed<0?[...ring].reverse():ring).map(xy=>at(xy,bottom));}),frame.normal,tolerance,p.curvePolicy):null;
    const outer=wire(r.outer,bottom,true,tolerance,1,'outer',planned?.plans[0]),base=hold(cad.makeFace(outer));
    let mask;
    if(strategy==='faceWithHolesExtrude'){
     const holes=r.holes.map((h,i)=>wire(h,bottom,true,tolerance,-1,'hole',planned?.plans[i+1]));
     const face=holes.length?hold(cad.addHolesInFace(base,holes)):base;
     const faceCheck=hold(new oc.BRepCheck_Analyzer(face.wrapped,true,false,false));
     if(!faceCheck.IsValid())fail('带孔面无效，未切换刀具策略');
     mask=extrude(face,bottom,top);
    }else mask=extrude(base,bottom,top);
    if(strategy==='cutHoleSolids'&&r.holes.length){
     const holes=r.holes.map((h,i)=>extrude(hold(cad.makeFace(wire(h,bottom,true,tolerance,1,'hole',planned?.plans[i+1]))),bottom,top));
     mask=boolean('BRepAlgoAPI_Cut',mask,hold(cad.makeCompound(holes)));
    }
    const check=hold(new oc.BRepCheck_Analyzer(mask.wrapped,true,false,false));
    const maskSolids=mask.solids;owned.push(...maskSolids);
    if(!maskSolids.length){failure='孔裁切后刀具为空';return null;}
    if(!check.IsValid()){failure='轮廓挤出无效';return null;}
    const piece=boolean('BRepAlgoAPI_Common',tool,mask),analyzer=hold(new oc.BRepCheck_Analyzer(piece.wrapped,true,false,false)),solids=piece.solids;owned.push(...solids);
    if(!solids.length){failure='柱面交集为空，请检查轮廓中的微小边或近重合点';return null;}
    if(!analyzer.IsValid()){failure='柱面交集实体无效';return null;}
    return piece;
   };
   const reportStart=conversions.length;let piece=build(p.curveToleranceMm??0);
   // Legacy recipes retain their existing fallback. An explicitly selected
   // strategy is one candidate and never retries with changed contours.
   if(!piece&&!p.maskStrategy&&!p.curvePolicy&&(p.curveToleranceMm??0)>0){conversions.length=reportStart;piece=build(0);}
   if(!piece)fail(`第 ${index+1} 个图案轮廓无法生成有效刀具（${failure}）`);
   const solids=piece.solids;owned.push(...solids);
   if(!solids.length)fail(`第 ${index+1} 个图案轮廓没有覆盖可加工的高度`);
   retained=piece.clone();
   }finally{owned.splice(regionOwnedStart).reverse().forEach(dispose);}
   pieces.push(hold(retained));
  }
  // Separate islands form one compound cutter; the subsequent boolean with the
  // source must still produce exactly one valid solid, never a grouped overlay.
  let result;
  if(regionGroups?.length>1&&pieces.length>1){
   const builder=hold(new oc.BRepAlgoAPI_Fuse()),args=hold(new oc.NCollection_List_TopoDS_Shape()),tools=hold(new oc.NCollection_List_TopoDS_Shape());args.Append(pieces[0].wrapped);for(const piece of pieces.slice(1))tools.Append(piece.wrapped);builder.SetArguments(args);builder.SetTools(tools);builder.SetNonDestructive(true);builder.SetFuzzyValue(1e-7);builder.Build();if(builder.HasErrors())fail('同高层精确材料合组失败');result=cad.cast(builder.Shape());
  }else result=cad.makeCompound(pieces);
  const sum=key=>conversions.reduce((s,r)=>s+(r[key]??0),0),area=key=>conversions.reduce((s,r)=>s+(r.role==='hole'?-1:1)*(r[key]??0),0);
  result.curveConversionReport={maskStrategy:strategy,legacyPolylineFallbackAllowed:!p.maskStrategy,reference:'supplied-polyline-after-explicit-cleanup',sourceRegionCount:p.regions?.length??0,regionCount:regions.length,holeCount:regions.reduce((s,r)=>s+r.holes.length,0),sourceEdgeCount:sum('sourceEdgeCount'),resultEdgeCount:sum('resultEdgeCount'),sourceAreaMm2:area('sourceAreaMm2'),resultAreaMm2:area('resultAreaMm2'),maxSampledDeviationMm:Math.max(0,...conversions.map(r=>r.maxSampledDeviationMm)),sampleCount:sum('sampleCount'),errorBound:'sampled-not-global',connectionCheck:'exact-kernel-mask-validity',sourceSplineDeviation:'unknown',rings:conversions,ringCount:conversions.length,truncated:false};
  return result;
 }finally{owned.reverse().forEach(dispose);}
}
