import * as THREE from 'three';
import {EXACT_DISPLAY,requestedFaceTolerance} from './exact-display-policy.js';

// Disposable camera-dependent surfaces. Selection/topology and exports continue
// to use the body's original indices and exact kernel shape respectively.
export class ExactDisplayDetail {
  constructor(viewport){this.viewport=viewport;this.pending=false;this.lastError=null;this.nextRequest=0;this.version=0;this.cachedKey=null;}
  attach(entry){
    this.version++;this.cachedKey=null;
    if(!entry.body.adaptiveDisplay||entry.body.faceSolidIndices)return;
    const {body,mesh}=entry,faces=body.faceGroups,adaptive=body.adaptiveDisplay;
    // Exact planar polygons have no screen-dependent refinement. Reuse the
    // installed indexed surface instead of allocating one draw object per face.
    // Require complete, contiguous coverage; mixed/limited/unsupported displays
    // retain the original per-face path and all original topology/picking data.
    let cursor=0;
    const planar=Array.isArray(faces)&&faces.length>0&&!adaptive.heavy&&!adaptive.heavyFaceIds?.length&&!(adaptive.splinePoles>0)&&
      !body.displayPatches&&!body.displayReport?.untriangulatedFaceIds?.length&&body.geometryType!=='rawMesh'&&
      !Array.isArray(mesh.material)&&mesh.geometry.index?.count===body.indices.length&&!mesh.geometry.groups.length&&
      mesh.geometry.drawRange.start===0&&mesh.geometry.drawRange.count>=body.indices.length&&
      faces.every(face=>{if(face.exactPolygon!==true||face.start!==cursor||!Number.isInteger(face.count)||face.count<=0||face.count%3)return false;cursor+=face.count;return true;})&&cursor===body.indices.length;
    if(planar){entry.exactDisplay={planarBatch:true,group:null,patches:[],faceCount:faces.length};return;}
    // Keep unchanged triangles in one indexed draw. Per-face metadata still
    // drives exact refinement and picking; only refined faces need a Mesh.
    cursor=0;
    const surfaceBatch=!body.displayPatches&&!Array.isArray(mesh.material)&&!mesh.geometry.groups.length&&
      mesh.geometry.drawRange.start===0&&mesh.geometry.drawRange.count>=body.indices.length&&
      faces.every(face=>{if(face.start!==cursor||!Number.isInteger(face.count)||face.count<0||face.count%3)return false;cursor+=face.count;return true;})&&cursor===body.indices.length;
    const group=new THREE.Group(),base=entry.mesh.geometry,positions=base.attributes.position;
    let coarse;
    if(surfaceBatch){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',positions);geometry.setAttribute('normal',base.attributes.normal);geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(body.indices),1));geometry.computeBoundingSphere();coarse=new THREE.Mesh(geometry,mesh.material);coarse.userData={type:'display-only',bodyId:body.id};group.add(coarse);}
    const patches=entry.body.faceGroups.filter(face=>face.count>0).map(({start,count,faceId,exactPolygon,recovered})=>{
      const geometry=surfaceBatch?{index:{count}}:new THREE.BufferGeometry();
      if(!surfaceBatch){geometry.setAttribute('position',positions);geometry.setAttribute('normal',base.attributes.normal);geometry.setIndex(new THREE.BufferAttribute(entry.body.indices.subarray(start,start+count),1));}
      const box=new THREE.Box3();const point=new THREE.Vector3();
      for(let i=start;i<start+count;i++)box.expandByPoint(point.fromBufferAttribute(positions,entry.body.indices[i]));
      geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new THREE.Sphere());
      let piece=null;if(!surfaceBatch){piece=new THREE.Mesh(geometry,entry.mesh.material);piece.userData={type:'display-only',faceId,bodyId:entry.body.id};group.add(piece);}
      const heavy=!!entry.body.adaptiveDisplay.heavyFaceIds?.includes(faceId);
      return {start,count,faceId,exactPolygon,piece,base:geometry,fine:null,visible:false,tolerance:heavy?entry.body.adaptiveDisplay.initialTolerance:EXACT_DISPLAY.initialTolerance,lastUsed:0,limited:heavy||recovered};
    });
    entry.root.add(group);entry.exactDisplay={group,patches,surfaceBatch,coarse,coarseKey:null};
  }
  release(entry){this.version++;this.cachedKey=null;for(const p of entry.exactDisplay?.patches||[]){p.base.dispose?.();p.fine?.dispose();}}
  syncCoarse(entry,active){
    const display=entry.exactDisplay;if(!display.surfaceBatch)return;
    const key=active?'base':display.patches.filter(p=>p.fine).map(p=>p.faceId).join(',');
    if(key===display.coarseKey)return;
    const indices=display.coarse.geometry.index.array;let count=0;
    for(const p of display.patches)if(active||!p.fine){indices.set(entry.body.indices.subarray(p.start,p.start+p.count),count);count+=p.count;}
    display.coarse.geometry.setDrawRange(0,count);display.coarse.geometry.index.needsUpdate=true;display.coarseKey=key;
  }
  update(active){
    const v=this.viewport,now=performance.now(),height=Math.max(1,v.host.clientHeight),candidates=[];
    const viewKey=JSON.stringify([this.version,active,height,v.mode,v.selectionMode,!!v.busy,v.camera.matrixWorld.elements,v.camera.projectionMatrix.elements,[...v.objects.values()].map(e=>[e.body.id,e.body.renderVersion,e.root.visible,e.root.matrixWorld.elements,e.body.adaptiveDisplay?.requestedQuality])]);
    const dispatchDue=!active&&!v.busy&&!this.pending&&now>=this.nextRequest&&this.cachedCandidates>0&&this.cachedRefinedTriangles<EXACT_DISPLAY.maxRefinedTriangles&&!!v.callbacks.onRefineDisplay;
    if(viewKey===this.cachedKey&&!dispatchDue)return this.cachedState?{...this.cachedState,pending:this.pending}:null;
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(v.camera.projectionMatrix,v.camera.matrixWorldInverse));
    let visibleFaces=0,culledFaces=0,triangles=0,fullTriangles=0,refinedTriangles=0,totalFaces=0,screenErrorBudgetPx=0,approximate=false,budgetLimited=false,planarBatchedBodies=0,surfaceBatchedBodies=0;
    const all=[];
    for(const entry of v.objects.values()){
      if(!entry.exactDisplay)continue;
      screenErrorBudgetPx=Math.max(screenErrorBudgetPx,active?4:({draft:2,standard:1,fine:.5,ultra:.25}[entry.body.adaptiveDisplay.requestedQuality]??1));
      if(entry.exactDisplay.planarBatch){
        // Keep mesh.visible independent of camera culling: evidence capture uses
        // an isolated camera and must still see the full retained surface.
        entry.mesh.visible=true;entry.mesh.material.wireframe=v.mode==='wire';
        if(!entry.mesh.geometry.boundingSphere)entry.mesh.geometry.computeBoundingSphere();
        const sphere=entry.mesh.geometry.boundingSphere.clone().applyMatrix4(entry.mesh.matrixWorld),count=entry.mesh.geometry.index.count/3,faces=entry.exactDisplay.faceCount;
        totalFaces+=faces;fullTriangles+=count;planarBatchedBodies++;approximate=true;
        if(entry.root.visible&&frustum.intersectsSphere(sphere)){visibleFaces+=faces;triangles+=count;}else culledFaces+=faces;
      }else{
      entry.mesh.visible=false;entry.exactDisplay.group.visible=true;
      const batched=entry.exactDisplay.surfaceBatch;if(batched){surfaceBatchedBodies++;entry.exactDisplay.coarse.material.wireframe=v.mode==='wire';}
      for(const p of entry.exactDisplay.patches){
        totalFaces++;fullTriangles+=p.base.index.count/3;all.push(p);refinedTriangles+=p.fine?.index.count/3||0;
        const sphere=p.base.boundingSphere.clone().applyMatrix4(entry.root.matrixWorld);
        const visible=entry.root.visible&&frustum.intersectsSphere(sphere);p.visible=visible;if(p.piece)p.piece.visible=visible&&(!batched||!active&&!!p.fine);
        if(!visible){culledFaces++;continue;}visibleFaces++;p.lastUsed=now;
        const distance=Math.max(v.camera.position.distanceTo(sphere.center)-sphere.radius,.001);
        const mmPerPixel=v.camera.isOrthographicCamera?(v.camera.top-v.camera.bottom)/(v.camera.zoom*height):2*distance*Math.tan(THREE.MathUtils.degToRad(v.camera.fov/2))/height;
        const wanted=requestedFaceTolerance(mmPerPixel,active,entry.body.adaptiveDisplay.requestedQuality);
        if(!batched){p.piece.geometry=active?p.base:(p.fine||p.base);p.piece.material.wireframe=v.mode==='wire';}
        triangles+=(active?p.base:(p.fine||p.base)).index.count/3;approximate=true;
        if(!active&&!p.exactPolygon&&!entry.exactDisplay.blocked&&!p.limited&&p.tolerance>wanted*1.01)candidates.push({entry,p,wanted,priority:sphere.radius/mmPerPixel});
        budgetLimited ||= p.limited;
      }
      this.syncCoarse(entry,active);
      }
      // Suppress subpixel edge annotations, not source edges or surface silhouettes.
      entry.edges.visible=!active&&(!entry.body.indices.length||v.mode!=='solid'||v.selectionMode==='edge');
      if(entry.edges.visible&&entry.root.visible)for(const edge of entry.edges.children){
        if(!edge.geometry.boundingSphere)edge.geometry.computeBoundingSphere();
        const sphere=edge.geometry.boundingSphere.clone().applyMatrix4(entry.root.matrixWorld);
        const distance=Math.max(v.camera.position.distanceTo(sphere.center)-sphere.radius,.001);
        const mmPerPixel=v.camera.isOrthographicCamera?(v.camera.top-v.camera.bottom)/(v.camera.zoom*height):2*distance*Math.tan(THREE.MathUtils.degToRad(v.camera.fov/2))/height;
        const visible=frustum.intersectsSphere(sphere)&&sphere.radius*2/mmPerPixel>=.75;
        if(entry.edgeBatch){if(edge.userData.displayVisible!==visible){edge.userData.displayVisible=visible;entry.edgeBatch.invalidate();}}else edge.visible=visible;
      }
    }
    // Bound GPU refinement storage. Offscreen refinements are expendable and can
    // be regenerated when revisited; the original coarse surface always remains.
    if(refinedTriangles>EXACT_DISPLAY.maxRefinedTriangles){
      for(const p of all.filter(p=>p.fine&&!p.visible).sort((a,b)=>a.lastUsed-b.lastUsed)){
        refinedTriangles-=p.fine.index.count/3;if(p.piece){p.piece.visible=false;if(p.base.isBufferGeometry)p.piece.geometry=p.base;else{p.piece.parent?.remove(p.piece);p.piece=null;}}p.fine.dispose();p.fine=null;p.tolerance=EXACT_DISPLAY.initialTolerance;
        if(refinedTriangles<EXACT_DISPLAY.maxRefinedTriangles*.8)break;
      }
      for(const entry of v.objects.values())this.syncCoarse(entry,active);
    }
    candidates.sort((a,b)=>b.priority-a.priority);
    if(!active&&!v.busy&&!this.pending&&now>=this.nextRequest&&candidates.length&&v.callbacks.onRefineDisplay){
      if(refinedTriangles>=EXACT_DISPLAY.maxRefinedTriangles)budgetLimited=true;
      else{
        const first=candidates[0],chosen=candidates.filter(c=>c.entry===first.entry&&c.wanted===first.wanted).slice(0,EXACT_DISPLAY.maxFacesPerRequest);
        this.pending=true;const version=first.entry.body.renderVersion;
        Promise.resolve(v.callbacks.onRefineDisplay({bodyId:first.entry.body.id,renderVersion:version,faceIds:chosen.map(c=>c.p.faceId),tolerance:first.wanted})).then(result=>{
          if(!result)return;
          const current=v.objects.get(result.bodyId);
          if(current!==first.entry||current.body.renderVersion!==result.renderVersion)return;
          for(const patch of result.patches){
            const p=current.exactDisplay.patches.find(p=>p.faceId===patch.faceId);if(!p)continue;
            if(patch.limited){p.limited=true;continue;}
            const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(patch.positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(patch.normals,3));geometry.setIndex(new THREE.BufferAttribute(patch.indices,1));geometry.computeBoundingSphere();
            if(!p.piece){p.piece=new THREE.Mesh(geometry,current.mesh.material);p.piece.userData={type:'display-only',faceId:p.faceId,bodyId:current.body.id};current.exactDisplay.group.add(p.piece);}
            p.piece.geometry=geometry;p.fine?.dispose();p.fine=geometry;p.tolerance=result.tolerance;
          }
          this.cachedKey=null;this.lastError=null;v.lastFrameKey=null;
        }).catch(error=>{this.cachedKey=null;this.lastError={code:error.code||'DISPLAY_REFINEMENT_FAILED',message:error.message};if(error.code!=='STALE_DISPLAY')first.entry.exactDisplay.blocked=true;})
          .finally(()=>{this.pending=false;this.nextRequest=Math.max(this.nextRequest,performance.now()+80);});
      }
    }
    const state=totalFaces?{phase:active?'interactive-preview':this.pending||candidates.length&&!budgetLimited?'refining-visible':'screen-detail',
      adaptiveExact:true,approximate,sourceChanged:false,totalFaces,visibleFaces,culledFaces,previewTriangles:triangles,fullTriangles,patchCount:totalFaces,
      refinedTriangles,pending:this.pending,budgetLimited,screenErrorBudgetPx,planarBatchedBodies,surfaceBatchedBodies,
      selectionSource:'base-display-mesh; exact BRep topology',culling:planarBatchedBodies?'body bounding-sphere for planar batches; face bounding-sphere otherwise; no occlusion inference':'face bounding-sphere frustum; no occlusion inference',refinementError:this.lastError}:null;
    this.cachedKey=viewKey;this.cachedState=state;this.cachedCandidates=candidates.length;this.cachedRefinedTriangles=refinedTriangles;return state;
  }
}
