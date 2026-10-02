import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
const oc=await init({wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});cad.setOC(oc);
const dispose=x=>{try{x?.delete?.();}catch{}};
export function heightSolid(values,width,height,depth){
 const rows=values.length,cols=values[0].length,owned=[];const hold=x=>(owned.push(x),x);
 const pts=values.map((row,j)=>row.map((v,i)=>[-width/2+i*width/(cols-1),-height/2+j*height/(rows-1),v*depth]));
 try{
  const spline=grid=>{
   const nr=grid.length,nc=grid[0].length,du=Math.min(3,nc-1),dv=Math.min(3,nr-1);
   const poles=hold(new oc.NCollection_Array2_gp_Pnt(1,nc,1,nr));
   for(let j=0;j<nr;j++)for(let i=0;i<nc;i++){const p=new oc.gp_Pnt(...grid[j][i]);poles.SetValue(i+1,j+1,p);p.delete();}
   const knots=(n,d)=>{const count=n-d+1,k=hold(new oc.NCollection_Array1_double(1,count)),m=hold(new oc.NCollection_Array1_int(1,count));for(let i=1;i<=count;i++){k.SetValue(i,i-1);m.SetValue(i,i===1||i===count?d+1:1);}return[k,m];};
   const [uk,um]=knots(nc,du),[vk,vm]=knots(nr,dv);
   const surface=hold(new oc.Geom_BSplineSurface(poles,uk,vk,um,vm,du,dv,false,false));
   const maker=hold(new oc.BRepBuilderAPI_MakeFace(surface,1e-7));
   return hold(cad.cast(maker.Face()));
  };
  const top=spline(pts);
  const bottom=z=>[z[0],z[1],-.05];
  const boundaries=[pts[0],pts.map(r=>r[cols-1]),[...pts[rows-1]].reverse(),pts.map(r=>r[0]).reverse()];
  const sides=boundaries.map(b=>spline([b,b.map(bottom)]));
  const floor=hold(cad.makePolygon([pts[0][0],pts[0][cols-1],pts[rows-1][cols-1],pts[rows-1][0]].map(bottom)));
  return cad.makeSolid([top,...sides,floor]);
 }finally{owned.reverse().forEach(dispose);}
}
const cases=JSON.parse(fs.readFileSync('agent/temp/relief-inputs.json','utf8'));
const results=[];
for(const c of cases){let source,tool,result,check;const start=performance.now();try{
 source=cad.makeBox([-20,-20,-3],[20,20,0]);const before=source.serialize();tool=heightSolid(c.values,24,24,1.2);result=cad.deserializeShape(before).fuse(tool);check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);
 const solids=result.solids,faces=result.faces;const volume=cad.measureVolume(result);const mesh=result.mesh({tolerance:.05});
 const row={name:c.name,grid:c.values.length,valid:check.IsValid(),solids:solids.length,faces:faces.length,volume,addedVolume:volume-4800,unchangedSource:source.serialize()===before,triangles:mesh.triangles.length/3,elapsedMs:Math.round(performance.now()-start)};
 solids.forEach(dispose);faces.forEach(dispose);results.push(row);console.log(JSON.stringify(row));
 }catch(e){results.push({name:c.name,error:String(e),stack:e.stack});console.log(c.name,String(e));}finally{[check,result,tool,source].forEach(dispose);}}
fs.writeFileSync('agent/output/relief-probe-results.json',JSON.stringify(results,null,2));
