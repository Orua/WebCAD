// Mesh welding never alters exact BRep geometry.
export function weldedMesh(vertices,triangles,tolerance=1e-7){
  const points=[],indices=[],map=new Map(),source=[];
  for(let i=0;i<vertices.length;i+=3){const p=Array.from(vertices.slice(i,i+3)),key=p.map(v=>Math.round(v/tolerance)).join(',');let id=map.get(key);if(id===undefined){id=points.length/3;map.set(key,id);points.push(...p);}source.push(id);}
  let degenerateTriangles=0;
  for(let i=0;i<triangles.length;i+=3){const t=[source[triangles[i]],source[triangles[i+1]],source[triangles[i+2]]];if(new Set(t).size!==3){degenerateTriangles++;continue;}indices.push(...t);}
  return {vertices:points,triangles:indices,degenerateTriangles,weldToleranceMm:tolerance};
}
export function meshIntegrity(vertices,triangles,{faceCount,faceGroups=[],brepVolumeMm3,weldToleranceMm=1e-7}={}){
  const mesh=weldedMesh(vertices,triangles,weldToleranceMm),edges=new Map();let volume=0;
  const point=i=>mesh.vertices.slice(i*3,i*3+3);
  for(let i=0;i<mesh.triangles.length;i+=3){
    const t=mesh.triangles.slice(i,i+3),[a,b,c]=t.map(point);
    volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    for(let j=0;j<3;j++){const x=t[j],y=t[(j+1)%3],key=x<y?`${x}:${y}`:`${y}:${x}`,row=edges.get(key)||{count:0,balance:0};row.count++;row.balance+=x<y?1:-1;edges.set(key,row);}
  }
  const rows=[...edges.values()],boundaryEdges=rows.filter(e=>e.count===1).length,nonManifoldEdges=rows.filter(e=>e.count>2).length,inconsistentEdges=rows.filter(e=>e.count===2&&e.balance!==0).length;
  const covered=new Set(faceGroups.filter(g=>g.count>0).map(g=>g.faceId)),untriangulatedFaceIds=Number.isInteger(faceCount)?Array.from({length:faceCount},(_,i)=>i).filter(i=>!covered.has(i)):[];
  const meshVolumeMm3=Math.abs(volume),volumeErrorRatio=typeof brepVolumeMm3==='number'&&brepVolumeMm3>0?Math.abs(meshVolumeMm3-brepVolumeMm3)/brepVolumeMm3:null;
  return {status:untriangulatedFaceIds.length?'incomplete':'complete',untriangulatedFaceIds,watertight:boundaryEdges===0&&nonManifoldEdges===0&&inconsistentEdges===0&&mesh.triangles.length>0,boundaryEdges,nonManifoldEdges,inconsistentEdges,meshVolumeMm3,brepVolumeMm3:brepVolumeMm3??null,volumeErrorRatio,degenerateTriangles:mesh.degenerateTriangles,weldToleranceMm};
}
export function binaryStl(mesh){
  const welded=weldedMesh(mesh.vertices,mesh.triangles),bytes=new Uint8Array(84+welded.triangles.length/3*50),view=new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('WebCAD shared-edge welded STL'));view.setUint32(80,welded.triangles.length/3,true);
  for(let i=0;i<welded.triangles.length;i+=3){
    const [a,b,c]=welded.triangles.slice(i,i+3).map(id=>welded.vertices.slice(id*3,id*3+3)),u=b.map((v,j)=>v-a[j]),v=c.map((q,j)=>q-a[j]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1,at=84+i/3*50;
    [...n.map(x=>x/len),...a,...b,...c].forEach((x,j)=>view.setFloat32(at+j*4,x,true));
  }
  return bytes;
}
