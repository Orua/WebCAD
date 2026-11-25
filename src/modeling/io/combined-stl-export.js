import {meshError} from '../../mesh/mesh-contract.js';
import {writeSTLFacets} from '../../mesh/stl-source.js';
import {LIMITS} from '../../limits.js';

export function exportCombinedSTL(items,exactSTL,withBody){
  let count=0;
  const parts=items.map(item=>withBody(item,()=>{
    const raw=item.shape.geometryType==='mesh';
    const original=raw?item.shape.originalSTL():exactSTL(item.shape).data;
    const triangles=raw?item.shape.mesh.indices.length/3:(original.length-84)/50;
    const binary=original?.length===84+triangles*50
      &&new DataView(original.buffer,original.byteOffset,original.byteLength).getUint32(80,true)===triangles;
    count+=triangles;
    if(count>LIMITS.meshExport.maxCombinedStlTriangles)
      throw meshError('SIZE_LIMIT',`STL 输出总量超过 ${LIMITS.meshExport.maxCombinedStlTriangles} 个三角面，请分组选取实体。`);
    return {item,triangles,records:binary?original.subarray(84):null};
  }));
  const data=new Uint8Array(84+count*50),view=new DataView(data.buffer);
  data.set(new TextEncoder().encode('WebCAD separate shell STL'));
  view.setUint32(80,count,true);
  let offset=84;
  const bodies=parts.map(({item,triangles,records})=>withBody(item,()=>{
    const geometryType=item.shape.geometryType==='mesh'?'rawMesh':'brep';
    const report=records
      ?(data.set(records,offset),{maxQuantizationErrorMm:0})
      :writeSTLFacets(item.shape.transformed(),view,offset);
    offset+=triangles*50;
    return {id:item.id,geometryType,triangleCount:triangles,
      ...(geometryType==='rawMesh'?{maxQuantizationErrorMm:report.maxQuantizationErrorMm}: {})};
  }));
  return {data,mime:'model/stl',extension:'stl',report:{units:'mm',triangleCount:count,bodies}};
}
