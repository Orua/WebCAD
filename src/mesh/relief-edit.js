import {LIMITS} from '../limits.js';
import {checkedMesh,meshError} from './mesh-contract.js';
import {binaryHash} from '../contracts/operation-schema.js';
import {encodeMesh} from './mesh-codec.js';
import {prepareReliefField} from './relief-field.js';
import {prepareReliefProfile} from './relief-profile.js';

 const fail=(code,message,path)=>{throw Object.assign(meshError(code,message),path?{path}:{});};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const smooth=t=>t*t*(3-2*t);
const area2=ring=>ring.reduce((s,a,i)=>{const b=ring[(i+1)%ring.length];return s+a[0]*b[1]-b[0]*a[1];},0);
// Convex triangle intersection, in support XY. Heights are affine over each
// triangle, so extrema of the separation occur at overlap polygon vertices.
function overlap(a,b){
 let ring=a.map(q=>q.slice(0,2));const sign=Math.sign(area2(b));
 for(let i=0;i<3&&ring.length;i++){const c=b[i],d=b[(i+1)%3],side=q=>sign*((d[0]-c[0])*(q[1]-c[1])-(d[1]-c[1])*(q[0]-c[0])),out=[];
  for(let j=0;j<ring.length;j++){const p=ring[j],q=ring[(j+1)%ring.length],sp=side(p),sq=side(q);if(sp>=0)out.push(p);if((sp>=0)!==(sq>=0)){const t=sp/(sp-sq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}ring=out;
 }return ring.length>=3&&Math.abs(area2(ring))>1e-12?ring:[];
}
function clippedSegment(a,b,triangle){
 let lo=0,hi=1;const sign=Math.sign(area2(triangle));
 for(let i=0;i<3;i++){const p=triangle[i],q=triangle[(i+1)%3],side=v=>sign*((q[0]-p[0])*(v[1]-p[1])-(q[1]-p[1])*(v[0]-p[0])),s=side(a),d=side(b)-s;if(Math.abs(d)<1e-14){if(s<0)return [];continue;}const t=-s/d;if(d>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return [];}
 return [lo,(lo+hi)/2,hi].map(t=>a.map((v,k)=>v+t*(b[k]-v)));
}
export const meshGeometryHash=mesh=>binaryHash(encodeMesh(mesh));
export const RELIEF_EDIT_LIMITS=LIMITS.meshReliefEdit;

// Selection is resolved from physical support coordinates and an on-surface seed.
// Coordinate welding is an adjacency view only: source buffers/order stay intact.
export function editMeshRelief(mesh,p){
 checkedMesh(mesh);
 if(mesh.indices.length/3>RELIEF_EDIT_LIMITS.maxTriangles)fail('RELIEF_EDIT_CAPACITY','Local relief edit currently accepts at most 200000 triangles.');
 if(p.version!==1||p.units!=='mm'||p.topologyEpoch!==0)fail('RELIEF_EDIT_VERSION','Expected version 1, mm and fixed topology epoch 0.');
 const inputHash=meshGeometryHash(mesh);
 if(p.inputGeometryHash!==inputHash)fail('STALE_REFERENCE','Relief source geometry changed; inspect current meshReport.geometryHash.');
 const {originMm:o,xAxis:x,normal:n}=p.support||{};
 if(![o,x,n,p.seedMm].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite))||Math.abs(dot(x,x)-1)>1e-10||Math.abs(dot(n,n)-1)>1e-10||Math.abs(dot(x,n))>1e-10)fail('RELIEF_SUPPORT_INVALID','Explicit orthonormal support and on-surface seed in mm required.');
 const y=cross(n,x),toLocal=q=>{const d=sub(q,o);return [dot(d,x),dot(d,y),dot(d,n)];};
 const {centerMm:ctr,coreRadiusMm:r,transitionMm:band}=p.region||{};
 if(!Array.isArray(ctr)||ctr.length!==2||!ctr.every(Number.isFinite)||!Number.isFinite(r)||r<=0||!Number.isFinite(band)||band<0)fail('RELIEF_REGION_INVALID','Explicit core radius and nonnegative transition required.');
 const protectedRegions=p.protectedRegions||[];
 if(protectedRegions.length>64||protectedRegions.some(q=>!Array.isArray(q.centerMm)||q.centerMm.length!==2||!q.centerMm.every(Number.isFinite)||!Number.isFinite(q.radiusMm)||q.radiusMm<=0))fail('RELIEF_REGION_INVALID','Invalid hard protection disk.');
 if(!['scaleHeight','offset','flatten','replace','layers'].includes(p.mode)||(!['replace','layers'].includes(p.mode)&&!Number.isFinite(p.value))||p.mode==='scaleHeight'&&p.value<=0||!Number.isFinite(p.minThicknessMm)||p.minThicknessMm<=0)fail('RELIEF_CONSTRAINT_INVALID','Explicit height operation and positive minimum thickness required.');
 if(p.mode==='layers')return editReliefLayers(mesh,p);
 let field=p.mode==='replace'?(p.deformation?null:p.profile?prepareReliefProfile(p.profile):prepareReliefField(p.field)):null;
 const vertices=[],canonical=[],byCoordinate=new Map(),members=[];
 for(let i=0;i<mesh.positions.length;i+=3){const q=Array.from(mesh.positions.subarray(i,i+3)),key=q.join(',');let id=byCoordinate.get(key);if(id===undefined){id=vertices.length;byCoordinate.set(key,id);vertices.push(toLocal(q));members.push([]);}canonical.push(id);members[id].push(i/3);}
 const faces=[],edges=new Map(),incident=vertices.map(()=>[]);
 for(let i=0;i<mesh.indices.length;i+=3){const ids=Array.from(mesh.indices.subarray(i,i+3),j=>canonical[j]),[a,b,c]=ids.map(j=>vertices[j]),normal=cross(sub(b,a),sub(c,a));
  if(new Set(ids).size!==3||Math.hypot(...normal)<1e-12)fail('RELIEF_GEOMETRY_INVALID','Degenerate source triangle.');
  const f=faces.length;faces.push({ids,normal});ids.forEach(j=>incident[j].push(f));
  for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;if(!edges.has(key))edges.set(key,[]);edges.get(key).push({f,sign:a<b?1:-1});}
 }
 const adjacent=faces.map(()=>[]);
 for(const e of edges.values()){if(e.length!==2||e[0].sign+e[1].sign!==0)fail('RELIEF_NOT_CLOSED','Requires a closed consistently oriented source; no automatic welding/repair.');adjacent[e[0].f].push(e[1].f);adjacent[e[1].f].push(e[0].f);}
 const up=faces.map(f=>f.normal[2]>1e-10),groups=new Int32Array(faces.length).fill(-1);let groupCount=0;
 for(let i=0;i<faces.length;i++)if(up[i]&&groups[i]<0){const stack=[i];groups[i]=groupCount;while(stack.length){const f=stack.pop();for(const j of adjacent[f])if(up[j]&&groups[j]<0){groups[j]=groupCount;stack.push(j);}}groupCount++;}
 const heightAt=(f,u,v,values=vertices)=>{const [a,b,c]=f.ids.map(i=>values[i]),det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(det)<1e-12)return null;const w1=((b[1]-c[1])*(u-c[0])+(c[0]-b[0])*(v-c[1]))/det,w2=((c[1]-a[1])*(u-c[0])+(a[0]-c[0])*(v-c[1]))/det,w3=1-w1-w2;return Math.min(w1,w2,w3)<-1e-10?null:w1*a[2]+w2*b[2]+w3*c[2];};
 // Index density follows formal facet size as well as ROI. A large ROI on a
 // fine mesh must not turn every local test into a scan of thousands of facets.
 const projectedSize=Math.sqrt(faces.reduce((sum,f)=>sum+Math.abs(f.normal[2]),0)/faces.length);
 const bins=new Map(),cell=Math.max(.01,Math.min((r+band)/3,projectedSize*4));let entries=0;
 const cells=(minX,minY,maxX,maxY)=>{const out=[];for(let x=Math.floor(minX/cell);x<=Math.floor(maxX/cell);x++)for(let y=Math.floor(minY/cell);y<=Math.floor(maxY/cell);y++){if(out.length>100000)fail('RELIEF_EDIT_CAPACITY','Projected triangle exceeds spatial index budget.');out.push(`${x},${y}`);}return out;};
 faces.forEach((f,i)=>{const q=f.ids.map(j=>vertices[j]);f.box=[Math.min(...q.map(p=>p[0])),Math.min(...q.map(p=>p[1])),Math.max(...q.map(p=>p[0])),Math.max(...q.map(p=>p[1]))];for(const key of cells(...f.box)){if(++entries>2000000)fail('RELIEF_EDIT_CAPACITY','Spatial index budget exceeded.');if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);}});
 const at=(u,v)=>bins.get(`${Math.floor(u/cell)},${Math.floor(v/cell)}`)||[];
 const seed=toLocal(p.seedMm),seedGroups=new Set();
 for(const i of at(seed[0],seed[1]))if(up[i]){const z=heightAt(faces[i],seed[0],seed[1]);if(z!==null&&Math.abs(z-seed[2])<1e-6)seedGroups.add(groups[i]);}
 if(seedGroups.size!==1)fail('RELIEF_SELECTION_AMBIGUOUS','Seed must identify exactly one current upward connected surface.');
 const group=[...seedGroups][0],selected=faces.map((_,i)=>groups[i]===group),eligible=vertices.map((_,i)=>incident[i].some(f=>selected[f]));
 if(p.mode==='replace'&&p.deformation){
  const d=p.deformation;
  if(![d.pivotMm,d.translationMm,d.scale,d.sourceRegion?.centerMm].every(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite))||d.scale.some(v=>v<=0)||!Number.isFinite(d.sourceRegion.radiusMm)||d.sourceRegion.radiusMm<=0||!Number.isFinite(d.baseHeightMm)||!Number.isFinite(d.angleDeg)||!Number.isFinite(d.maxSourceSpacingMm)||d.maxSourceSpacingMm<=0)fail('RELIEF_DEFORMATION_INVALID','Explicit source region, base height, invertible in-plane transform and positive sampling bound required.');
  const angle=d.angleDeg*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle),spacing=d.maxSourceSpacingMm*Math.min(...d.scale);let lookups=0;
  field={spacingMm:[spacing,spacing],report:{composition:'source-height-pullback',sourceGeometryHash:inputHash,deformation:d,interpolation:'source-triangle-barycentric',approximationError:'not-certified'},sample(u,v){
   const x=u-d.pivotMm[0]-d.translationMm[0],y=v-d.pivotMm[1]-d.translationMm[1],a=d.pivotMm[0]+(co*x+si*y)/d.scale[0],b=d.pivotMm[1]+(-si*x+co*y)/d.scale[1];let height=null;
   if(Math.hypot(a-d.sourceRegion.centerMm[0],b-d.sourceRegion.centerMm[1])>d.sourceRegion.radiusMm)return d.baseHeightMm;
   for(const i of at(a,b)){if(++lookups>RELIEF_EDIT_LIMITS.maxRayTests)fail('RELIEF_EDIT_CAPACITY','Deformation source lookup budget exceeded.');if(!selected[i])continue;const z=heightAt(faces[i],a,b);if(z!==null){if(height!==null&&Math.abs(height-z)>1e-8)fail('RELIEF_MULTIVALUED','Transform samples an ambiguous source height.');height=z;}}
   if(height===null)fail('RELIEF_SAMPLE_OUTSIDE','Transformed sample is outside the selected source; adjust the declared domain or transform.');return height;
  }};
 }
 const weight=q=>{const d=Math.hypot(q[0]-ctr[0],q[1]-ctr[1]);return d<=r?1:band&&d<r+band?1-smooth((d-r)/band):0;};
 const hard=q=>protectedRegions.some(a=>Math.hypot(q[0]-a.centerMm[0],q[1]-a.centerMm[1])<=a.radiusMm);
 const next=vertices.map(q=>[...q]),changed=[];let protectedCount=0;
 vertices.forEach((q,i)=>{if(!eligible[i]||!weight(q))return;if(hard(q)){protectedCount++;return;}const target=field?field.sample(q[0],q[1]):p.mode==='scaleHeight'?q[2]*p.value:p.mode==='offset'?q[2]+p.value:p.value;const z=q[2]+(target-q[2])*weight(q);if(z===q[2])return;
  if(incident[i].some(f=>!selected[f]))fail('RELIEF_BOUNDARY_CONFLICT','Requested change reaches a fixed side/back boundary; shrink the core or add protection.');
  next[i][2]=z;changed.push(i);
 });
 const constraints=[];
 if(p.targets!==undefined){
  if(!Array.isArray(p.targets)||p.targets.length>64)fail('RELIEF_CONSTRAINT_INVALID','At most 64 explicit acceptance points are supported.');
  for(let k=0;k<p.targets.length;k++){const t=p.targets[k],path=`params.targets.${k}`;if(!Array.isArray(t.pointMm)||t.pointMm.length!==2||!t.pointMm.every(Number.isFinite)||!Number.isFinite(t.heightMm)||!Number.isFinite(t.toleranceMm)||t.toleranceMm<0)fail('RELIEF_CONSTRAINT_INVALID','Invalid target height or tolerance.',path);
   let value=null;for(const i of at(...t.pointMm))if(selected[i]){const h=heightAt(faces[i],...t.pointMm,next);if(h!==null){if(value!==null&&Math.abs(value-h)>1e-8)fail('RELIEF_MULTIVALUED','Target has ambiguous selected heights.',path);value=h;}}
   if(value===null)fail('RELIEF_TARGET_OUTSIDE',`No selected surface at target ${t.pointMm.join(',')} mm.`,path);
   if(Math.abs(value-t.heightMm)>t.toleranceMm+1e-10)fail('RELIEF_CONSTRAINT_CONFLICT',`Target ${t.pointMm.join(',')} mm requires ${t.heightMm} ± ${t.toleranceMm} mm, but protection/domain yields ${value} mm.`,path);
   constraints.push({...t,actualHeightMm:value,deviationMm:Math.abs(value-t.heightMm)});
  }
 }
 if(!changed.length)fail('NO_CHANGE','No editable samples in the declared region.');
 if(changed.length>RELIEF_EDIT_LIMITS.maxAffectedVertices)fail('RELIEF_EDIT_CAPACITY','Too many affected vertices for the current validation budget.');
 // A vertical, fixed-XY deformation preserves triangle orientation. Check rays at
 // all changed vertices and incident face centroids, against every source sheet.
 // This is sampled clearance, never a claim of exact general 3D self-intersection.
 const samples=changed.map(i=>({before:vertices[i],after:next[i]})),affected=new Set(changed.flatMap(i=>incident[i]));
 if(field)for(const i of affected){const q=faces[i].ids.map(j=>vertices[j]);for(let k=0;k<3;k++)if(Math.abs(q[k][0]-q[(k+1)%3][0])>field.spacingMm[0]+1e-9||Math.abs(q[k][1]-q[(k+1)%3][1])>field.spacingMm[1]+1e-9)fail('RELIEF_RESOLUTION_INSUFFICIENT','Source facet spacing exceeds target field spacing; use a resolved source or coarser field. No automatic remeshing.');}
 for(const i of affected){const f=faces[i];samples.push({before:[0,1,2].map(k=>f.ids.reduce((s,j)=>s+vertices[j][k],0)/3),after:[0,1,2].map(k=>f.ids.reduce((s,j)=>s+next[j][k],0)/3)});}
 let minThickness=Infinity,minClearance=Infinity,rayTests=0;
 for(const {before:a,after:b} of samples){let bottom=-Infinity;
  for(const i of at(a[0],a[1])){if(++rayTests>RELIEF_EDIT_LIMITS.maxRayTests)fail('RELIEF_EDIT_CAPACITY','Candidate exceeds the bounded clearance-check budget.');const z=heightAt(faces[i],a[0],a[1]);if(z===null)continue;
   if(selected[i]){if(Math.abs(z-a[2])>1e-7)fail('RELIEF_MULTIVALUED','Selected surface is not a single-valued graph on this support.');continue;}
   if(z<a[2]-1e-8)bottom=Math.max(bottom,z);
   const gap=z>a[2]?z-b[2]:b[2]-z;minClearance=Math.min(minClearance,gap);
   if(gap<1e-8)fail('RELIEF_INTERSECTION','Candidate crosses or touches an unselected sheet.');
  }
  if(!Number.isFinite(bottom))fail('RELIEF_THICKNESS_UNKNOWN','No underlying closed support found at an affected sample.');
  minThickness=Math.min(minThickness,b[2]-bottom);
 }
 // Complete projected facet overlaps supplement vertex/centroid rays. This
 // catches narrow nearby sheets between sample points, without changing XY.
 let overlapPairs=0;
 for(const i of affected){const f=faces[i],a=f.ids.map(j=>vertices[j]);const candidates=new Set(cells(...f.box).flatMap(key=>bins.get(key)||[]));
  for(const j of candidates){if(i===j)continue;if(++overlapPairs>RELIEF_EDIT_LIMITS.maxRayTests)fail('RELIEF_EDIT_CAPACITY','Facet overlap budget exceeded.');const other=faces[j],b=other.ids.map(k=>vertices[k]);
   if(Math.abs(other.normal[2])<1e-10){
    // A zero-area projection can cross a facet without any original corner
    // lying inside it. Clip every projected edge; conservatively use the full
    // obstacle height interval instead of overlooking a thin vertical wall.
    for(const q of b.flatMap((v,k)=>clippedSegment(v,b[(k+1)%3],a))){const z=heightAt(f,q[0],q[1]),after=heightAt(f,q[0],q[1],next);if(z!==null&&Math.abs(after-z)>1e-10&&Math.max(...b.map(v=>v[2]))>=Math.min(z,after)-1e-8&&Math.min(...b.map(v=>v[2]))<=Math.max(z,after)+1e-8)fail('RELIEF_INTERSECTION','A vertical unselected obstacle crosses the changed patch.');}continue;
   }
   const poly=overlap(a,b);if(!poly.length)continue;
   if(selected[j])fail('RELIEF_MULTIVALUED','Projected selected facets overlap; input is not a simple height surface.');
   for(const q of poly){const old=heightAt(f,...q),now=heightAt(f,...q,next),z=heightAt(other,...q),direction=Math.sign(z-old);if(!direction||direction*(z-now)<1e-8)fail('RELIEF_INTERSECTION','Candidate crosses an unselected facet between sampling points.');if(direction<0)minThickness=Math.min(minThickness,now-z);minClearance=Math.min(minClearance,direction*(z-now));}
  }
 }
 if(minThickness<p.minThicknessMm-1e-9)fail('RELIEF_THICKNESS','Candidate violates the declared minimum thickness.');
 const positions=mesh.positions.slice();for(const i of changed){const dz=next[i][2]-vertices[i][2];for(const original of members[i])for(let k=0;k<3;k++)positions[original*3+k]+=n[k]*dz;}
 const result={positions,indices:mesh.indices};
 const seedFace=at(seed[0],seed[1]).find(i=>selected[i]&&heightAt(faces[i],seed[0],seed[1],next)!==null),seedHeight=heightAt(faces[seedFace],seed[0],seed[1],next),continuationSeedMm=p.seedMm.map((v,k)=>v+n[k]*(seedHeight-seed[2]));
 return {mesh:result,report:{version:1,authoritativeEditableKind:'mesh-f64',topologyEpoch:0,inputGeometryHash:inputHash,geometryHash:meshGeometryHash(result),sourcePreserved:true,changedVertices:changed.reduce((s,i)=>s+members[i].length,0),hardProtectedVertices:protectedCount,protectedMaxChangeMm:0,minThicknessMm:minThickness,minClearanceMm:minClearance,constraints,continuationSeedMm,...(field?.report?{profile:field.report}:{}),selection:{support:p.support,region:p.region,seedMm:p.seedMm,protectedRegions},validation:{closedOriented:true,fixedXY:true,orientationPreserved:true,clearance:'projected-facet-overlap-and-vertex-rays',sampleCount:samples.length,rayTests,overlapPairs,generalSelfIntersection:'not-certified',limitation:'Planar single-valued relief only; unchanged source regions and arbitrary 3D self-intersections are not certified.'}}};
}

function editReliefLayers(source,p){
 const layers=p.layers;
 if(!Array.isArray(layers)||!layers.length||layers.length>16||new Set(layers.map(l=>l.id)).size!==layers.length)fail('RELIEF_LAYERS_INVALID','Supply 1..16 layers with unique IDs.');
 if(layers.filter(l=>l.enabled&&l.kind==='surface').length*source.indices.length/3>1000000)fail('RELIEF_EDIT_CAPACITY','Layer count times formal triangles exceeds 1000000.');
 const active=layers.filter(l=>l.enabled&&l.kind==='surface'),lastId=active.at(-1)?.id,freeze=[...(p.protectedRegions||[])],reports=[];let mesh=source,seed=p.seedMm,last=null;
 for(const layer of layers){
  if(!layer.enabled){reports.push({id:layer.id,status:'disabled'});continue;}
  if(layer.kind==='freeze'){freeze.push(...layer.regions);if(freeze.length>64)fail('RELIEF_EDIT_CAPACITY','At most 64 accumulated hard protection disks.');reports.push({id:layer.id,status:'protected',regions:layer.regions});continue;}
  const r=layer.region,outer=p.region.coreRadiusMm+p.region.transitionMm;
  if(!r||Math.hypot(r.centerMm[0]-p.region.centerMm[0],r.centerMm[1]-p.region.centerMm[1])+r.coreRadiusMm+r.transitionMm>outer+1e-9)fail('RELIEF_REGION_INVALID',`Layer ${layer.id} exceeds the declared total edit domain.`);
  if(!['add','remove','replace'].includes(layer.blend)||layer.blend!=='replace'&&(layer.attachment!=='followHeight'||!Number.isFinite(layer.heightMm)||layer.heightMm<=0)||layer.blend==='replace'&&layer.attachment!=='absolute')fail('RELIEF_LAYERS_INVALID','Layer blend and attachment disagree.');
  const params={version:1,units:'mm',topologyEpoch:0,inputGeometryHash:meshGeometryHash(mesh),support:p.support,seedMm:seed,region:r,protectedRegions:freeze,minThicknessMm:p.minThicknessMm,...(layer.id===lastId&&p.targets?{targets:p.targets}:{}),...(layer.blend==='replace'?(layer.field?{mode:'replace',field:layer.field}:layer.profile?{mode:'replace',profile:layer.profile}:{mode:'flatten',value:layer.heightMm}):{mode:'offset',value:layer.heightMm*(layer.blend==='remove'?-1:1)})};
  try{const out=editMeshRelief(mesh,params);mesh=out.mesh;last=out.report;seed=last.continuationSeedMm;reports.push({id:layer.id,status:'applied',role:layer.role,blend:layer.blend,attachment:layer.attachment,report:out.report});}
  catch(error){if(error.code==='NO_CHANGE'){reports.push({id:layer.id,status:'no_change'});continue;}error.path=`params.layers.${layers.indexOf(layer)}${error.path?'.'+error.path.replace(/^params\./,''):''}`;throw error;}
 }
 if(!last)fail('NO_CHANGE','No layer changed the current surface.');
 let changed=0;for(let i=0;i<source.positions.length;i+=3)if([0,1,2].some(k=>mesh.positions[i+k]!==source.positions[i+k]))changed++;
 return {mesh,report:{...last,inputGeometryHash:p.inputGeometryHash,geometryHash:meshGeometryHash(mesh),changedVertices:changed,layerSemanticsVersion:1,validationScope:'per-layer affected regions; unchanged regions are not certified',minThicknessMm:Math.min(...reports.filter(r=>r.report).map(r=>r.report.minThicknessMm)),minClearanceMm:Math.min(...reports.filter(r=>r.report).map(r=>r.report.minClearanceMm)),layers:reports,selection:{support:p.support,region:p.region,seedMm:p.seedMm,protectedRegions:p.protectedRegions},continuationSeedMm:seed}};
}
