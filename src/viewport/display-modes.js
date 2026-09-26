import * as THREE from 'three';
export function applyViewportDisplay(viewport,mode){
  if(mode==='transparentEdges')viewport.setProjection('perspective');
  viewport.mode=mode;
  for(const entry of viewport.objects.values()){
    entry.mesh.visible=mode!=='wire';entry.edges.visible=!entry.body.indices.length||mode!=='solid'||viewport.selectionMode==='edge';
    if(mode==='transparentEdges'&&!entry.surfaceGrid){
      entry.surfaceGrid=new THREE.LineSegments(new THREE.WireframeGeometry(entry.mesh.geometry),new THREE.LineBasicMaterial({color:0x6484aa,transparent:true,opacity:.18,depthWrite:false}));
      entry.surfaceGrid.userData={type:'surface-display-grid'};entry.root.add(entry.surfaceGrid);
    }
    if(entry.surfaceGrid)entry.surfaceGrid.visible=mode==='transparentEdges';
  }
  viewport.applyTemporaryDisplay();
}
