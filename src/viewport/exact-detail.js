import * as THREE from 'three';
import {EXACT_DISPLAY,requestedFaceTolerance} from './exact-display-policy.js';

// Disposable camera-dependent surfaces. Selection/topology and exports continue
// to use the body's original indices and exact kernel shape respectively.
export class ExactDisplayDetail {
  constructor(viewport){this.viewport=viewport;this.pending=false;this.lastError=null;this.nextRequest=0;}
  attach(entry){
    if(!entry.body.adaptiveDisplay)return;
    const group=new THREE.Group(),base=entry.mesh.geometry,positions=base.attributes.position;
    const patches=entry.body.faceGroups.map(({start,count,faceId,exactPolygon})=>{
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',positions);geometry.setAttribute('normal',base.attributes.normal);
      geometry.setIndex(new THREE.BufferAttribute(entry.body.indices.subarray(start,start+count),1));
      const box=new THREE.Box3();const point=new THREE.Vector3();
      for(let i=start;i<start+count;i++)box.expandByPoint(point.fromBufferAttribute(positions,entry.body.indices[i]));
      geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new THREE.Sphere());
      const piece=new THREE.Mesh(geometry,entry.mesh.material);piece.userData={type:'display-only',faceId,bodyId:entry.body.id};group.add(piece);
      const heavy=!!entry.body.adaptiveDisplay.heavyFaceIds?.includes(faceId);
      return {faceId,exactPolygon,piece,base:geometry,fine:null,tolerance:heavy?entry.body.adaptiveDisplay.initialTolerance:EXACT_DISPLAY.initialTolerance,lastUsed:0,limited:heavy};
    });
    entry.root.add(group);entry.exactDisplay={group,patches};
  }
  release(entry){for(const p of entry.exactDisplay?.patches||[]){p.base.dispose();p.fine?.dispose();}}
  update(active){
    const v=this.viewport,now=performance.now(),height=Math.max(1,v.host.clientHeight),candidates=[];
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(v.camera.projectionMatrix,v.camera.matrixWorldInverse));
    let visibleFaces=0,culledFaces=0,triangles=0,fullTriangles=0,refinedTriangles=0,totalFaces=0,screenErrorBudgetPx=0,approximate=false,budgetLimited=false;
    const all=[];
    for(const entry of v.objects.values()){
      if(!entry.exactDisplay)continue;
      screenErrorBudgetPx=Math.max(screenErrorBudgetPx,active?4:({draft:2,standard:1,fine:.5,ultra:.25}[entry.body.adaptiveDisplay.requestedQuality]??1));
      entry.mesh.visible=false;entry.exactDisplay.group.visible=true;
      for(const p of entry.exactDisplay.patches){
        totalFaces++;fullTriangles+=p.base.index.count/3;all.push(p);refinedTriangles+=p.fine?.index.count/3||0;
        const sphere=p.base.boundingSphere.clone().applyMatrix4(entry.root.matrixWorld);
        const visible=entry.root.visible&&frustum.intersectsSphere(sphere);p.piece.visible=visible;
        if(!visible){culledFaces++;continue;}visibleFaces++;p.lastUsed=now;
        const distance=Math.max(v.camera.position.distanceTo(sphere.center)-sphere.radius,.001);
        const mmPerPixel=v.camera.isOrthographicCamera?(v.camera.top-v.camera.bottom)/(v.camera.zoom*height):2*distance*Math.tan(THREE.MathUtils.degToRad(v.camera.fov/2))/height;
        const wanted=requestedFaceTolerance(mmPerPixel,active,entry.body.adaptiveDisplay.requestedQuality);
        p.piece.geometry=active?p.base:(p.fine||p.base);p.piece.material.wireframe=v.mode==='wire';
        triangles+=p.piece.geometry.index.count/3;approximate=true;
        if(!active&&!p.exactPolygon&&!entry.exactDisplay.blocked&&!p.limited&&p.tolerance>wanted*1.01)candidates.push({entry,p,wanted,priority:sphere.radius/mmPerPixel});
        budgetLimited ||= p.limited;
      }
      // Suppress subpixel edge annotations, not source edges or surface silhouettes.
      entry.edges.visible=!active&&(!entry.body.indices.length||v.mode!=='solid'||v.selectionMode==='edge');
      if(entry.edges.visible)for(const edge of entry.edges.children){
        if(!edge.geometry.boundingSphere)edge.geometry.computeBoundingSphere();
        const sphere=edge.geometry.boundingSphere.clone().applyMatrix4(entry.root.matrixWorld);
        const distance=Math.max(v.camera.position.distanceTo(sphere.center)-sphere.radius,.001);
        const mmPerPixel=v.camera.isOrthographicCamera?(v.camera.top-v.camera.bottom)/(v.camera.zoom*height):2*distance*Math.tan(THREE.MathUtils.degToRad(v.camera.fov/2))/height;
        edge.visible=frustum.intersectsSphere(sphere)&&sphere.radius*2/mmPerPixel>=.75;
      }
    }
    // Bound GPU refinement storage. Offscreen refinements are expendable and can
    // be regenerated when revisited; the original coarse surface always remains.
    if(refinedTriangles>EXACT_DISPLAY.maxRefinedTriangles){
      for(const p of all.filter(p=>p.fine&&!p.piece.visible).sort((a,b)=>a.lastUsed-b.lastUsed)){
        refinedTriangles-=p.fine.index.count/3;p.piece.geometry=p.base;p.fine.dispose();p.fine=null;p.tolerance=EXACT_DISPLAY.initialTolerance;
        if(refinedTriangles<EXACT_DISPLAY.maxRefinedTriangles*.8)break;
      }
    }
    candidates.sort((a,b)=>b.priority-a.priority);
    if(!active&&!this.pending&&now>=this.nextRequest&&candidates.length&&v.callbacks.onRefineDisplay){
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
            p.piece.geometry=geometry;p.fine?.dispose();p.fine=geometry;p.tolerance=result.tolerance;
          }
          this.lastError=null;v.lastFrameKey=null;
        }).catch(error=>{this.lastError={code:error.code||'DISPLAY_REFINEMENT_FAILED',message:error.message};if(error.code!=='STALE_DISPLAY')first.entry.exactDisplay.blocked=true;})
          .finally(()=>{this.pending=false;this.nextRequest=Math.max(this.nextRequest,performance.now()+80);});
      }
    }
    return totalFaces?{phase:active?'interactive-preview':this.pending||candidates.length&&!budgetLimited?'refining-visible':'screen-detail',
      adaptiveExact:true,approximate,sourceChanged:false,totalFaces,visibleFaces,culledFaces,previewTriangles:triangles,fullTriangles,patchCount:totalFaces,
      refinedTriangles,pending:this.pending,budgetLimited,screenErrorBudgetPx,
      selectionSource:'base-display-mesh; exact BRep topology',culling:'face bounding-sphere frustum; no occlusion inference',refinementError:this.lastError}:null;
  }
}
