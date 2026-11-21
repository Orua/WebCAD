import {checkedInputTriangleCount,checkedMesh,checkedSourceBytes,MESH_LIMITS,meshError,meshScale} from './mesh-contract.js';

// Raw bytes remain authoritative. No welding, deletion, orientation repair,
// normal rewriting or watertightness assumption takes place on import.
function decodeBinary(bytes,count,units,scale){
 checkedInputTriangleCount(count);
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),positions=new Float64Array(count*9),indices=new Uint32Array(count*3);
 let degenerateTriangles=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let face=0;face<count;face++){
  for(let j=0;j<9;j++){
   const p=v.getFloat32(84+face*50+12+j*4,true)*scale;
   if(!Number.isFinite(p))throw meshError('MESH_NONFINITE','STL contains nonfinite coordinates.');
   positions[face*9+j]=p;min[j%3]=Math.min(min[j%3],p);max[j%3]=Math.max(max[j%3],p);
  }
  for(let j=0;j<3;j++)indices[face*3+j]=face*3+j;
  const at=face*9,a=positions.subarray(at,at+3),b=positions.subarray(at+3,at+6),c=positions.subarray(at+6,at+9),ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  if(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])===0)degenerateTriangles++;
 }
 return {positions,indices,bounds:{min,max},report:{geometryType:'rawMesh',sourceFormat:'binary-stl',unitsDeclared:units,scaleMm:scale,triangleCount:count,vertexCount:count*3,degenerateTriangles,rawBytesChanged:false,topology:'not-checked',selfIntersection:'not-checked',solidEligibility:'not-checked'}};
}

const whitespace=byte=>byte===9||byte===10||byte===11||byte===12||byte===13||byte===32;
class STLScanner{
 constructor(bytes){this.bytes=bytes;this.pos=bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf?3:0;}
 skipWhitespace(){while(this.pos<this.bytes.length&&whitespace(this.bytes[this.pos]))this.pos++;}
 token(){
  this.skipWhitespace();if(this.pos>=this.bytes.length)return null;
  const start=this.pos;while(this.pos<this.bytes.length&&!whitespace(this.bytes[this.pos]))this.pos++;
  return {start,end:this.pos};
 }
 skipLine(){while(this.pos<this.bytes.length&&this.bytes[this.pos]!==10&&this.bytes[this.pos]!==13)this.pos++;if(this.bytes[this.pos]===13)this.pos++;if(this.bytes[this.pos]===10)this.pos++;}
}
function isWord(bytes,token,word){
 if(!token||token.end-token.start!==word.length)return false;
 for(let i=0;i<word.length;i++){let byte=bytes[token.start+i];if(byte>=65&&byte<=90)byte+=32;if(byte!==word.charCodeAt(i))return false;}
 return true;
}
function requireWord(scanner,word){if(!isWord(scanner.bytes,scanner.token(),word))throw meshError('MESH_SOURCE_INVALID',`ASCII STL expected '${word}'.`);}
const decimal=/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;
const nonfinite=/^[+-]?(?:nan|inf(?:inity)?)$/i;
function readNumber(scanner){
 const token=scanner.token();if(!token)throw meshError('MESH_SOURCE_INVALID','ASCII STL ended inside a numeric field.');
 const length=token.end-token.start;
 if(length>1024)throw meshError('MESH_SOURCE_INVALID','ASCII STL numeric token is too long.');
 for(let i=0;i<length;i++){
  const byte=scanner.bytes[token.start+i];if(byte>127)throw meshError('MESH_SOURCE_INVALID','ASCII STL numeric fields must use ASCII characters.');
 }
 const raw=String.fromCharCode(...scanner.bytes.subarray(token.start,token.end));if(nonfinite.test(raw))throw meshError('MESH_NONFINITE','STL contains nonfinite coordinates.');
 if(!decimal.test(raw))throw meshError('MESH_SOURCE_INVALID','ASCII STL contains an invalid numeric field.');
 const value=Number(raw);if(!Number.isFinite(value))throw meshError('MESH_NONFINITE','STL contains nonfinite coordinates.');return value;
}
const maxInputTriangles=Math.min(MESH_LIMITS.maxInputTriangles,MESH_LIMITS.maxResultTriangles,Math.floor(MESH_LIMITS.maxVertices/3));

// Scan the byte source twice: validate/count without materializing token or
// point arrays, then allocate the bounded typed buffers once and fill them.
function scanASCII(bytes,scale,mesh){
 const scanner=new STLScanner(bytes);let token=scanner.token();
 if(!isWord(bytes,token,'solid'))throw meshError('MESH_SOURCE_INVALID','Source is neither a length-matched binary nor a complete ASCII STL.');
 let triangles=0,degenerateTriangles=0;
 const min=mesh?[Infinity,Infinity,Infinity]:null,max=mesh?[-Infinity,-Infinity,-Infinity]:null;
 const points=mesh?new Float64Array(9):null;
 while(token){
  if(!isWord(bytes,token,'solid'))throw meshError('MESH_SOURCE_INVALID','ASCII STL expected a solid block.');
  scanner.skipLine();
  while((token=scanner.token())&&!isWord(bytes,token,'endsolid')){
   if(!isWord(bytes,token,'facet'))throw meshError('MESH_SOURCE_INVALID','ASCII STL expected a facet or endsolid.');
   requireWord(scanner,'normal');
   for(let i=0;i<3;i++)readNumber(scanner);
   requireWord(scanner,'outer');requireWord(scanner,'loop');
   for(let vertex=0;vertex<3;vertex++){
    requireWord(scanner,'vertex');
    for(let axis=0;axis<3;axis++){
     const value=readNumber(scanner)*scale;
     if(!Number.isFinite(value))throw meshError('MESH_NONFINITE','STL contains nonfinite coordinates.');
     if(mesh){points[vertex*3+axis]=value;min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);}
    }
   }
   requireWord(scanner,'endloop');requireWord(scanner,'endfacet');
   triangles++;if(triangles>maxInputTriangles)throw meshError('MESH_SIZE_LIMIT','STL triangle count exceeds the bounded input mesh limits.');
   if(mesh){
    const face=triangles-1,at=face*9;mesh.positions.set(points,at);
    const a=points.subarray(0,3),b=points.subarray(3,6),c=points.subarray(6,9),ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    if(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])===0)degenerateTriangles++;
    for(let j=0;j<3;j++)mesh.indices[face*3+j]=face*3+j;
   }
  }
  if(!token)throw meshError('MESH_SOURCE_INVALID','ASCII STL is missing its endsolid marker.');
  scanner.skipLine();token=scanner.token();
  if(token&&!isWord(bytes,token,'solid'))throw meshError('MESH_SOURCE_INVALID','ASCII STL has trailing data after a solid.');
 }
 if(!triangles)throw meshError('MESH_SOURCE_INVALID','ASCII STL contains no facets.');
 return {triangles,degenerateTriangles,bounds:mesh?{min,max}:undefined};
}
function decodeASCII(bytes,units,scale){
 const {triangles}=scanASCII(bytes,scale,null);checkedInputTriangleCount(triangles);
 const mesh={positions:new Float64Array(triangles*9),indices:new Uint32Array(triangles*3)};
 const parsed=scanASCII(bytes,scale,mesh);
 if(parsed.triangles!==triangles)throw meshError('MESH_SOURCE_INVALID','ASCII STL changed during parsing.');
 return {...mesh,bounds:parsed.bounds,report:{geometryType:'rawMesh',sourceFormat:'ascii-stl',unitsDeclared:units,scaleMm:scale,triangleCount:triangles,vertexCount:triangles*3,degenerateTriangles:parsed.degenerateTriangles,rawBytesChanged:false,topology:'not-checked',selfIntersection:'not-checked',solidEligibility:'not-checked'}};
}

export function decodeBinarySTL(bytes,units){
 checkedSourceBytes(bytes);const scale=meshScale(units);
 if(bytes.length>=84){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=view.getUint32(80,true);
  if(84+count*50===bytes.length)return decodeBinary(bytes,count,units,scale);
 }
 return decodeASCII(bytes,units,scale);
}

export function exportBinarySTL(mesh){
 checkedMesh(mesh);const count=mesh.indices.length/3,bytes=new Uint8Array(84+count*50),view=new DataView(bytes.buffer);view.setUint32(80,count,true);let maxQuantizationErrorMm=0;
 for(let f=0;f<count;f++){
  const points=[];for(let j=0;j<3;j++){const at=mesh.indices[f*3+j]*3,p=Array.from(mesh.positions.subarray(at,at+3));points.push(p);for(let k=0;k<3;k++){const value=Math.fround(p[k]);if(!Number.isFinite(value))throw meshError('MESH_EXPORT_PRECISION','Coordinates exceed STL float range.');maxQuantizationErrorMm=Math.max(maxQuantizationErrorMm,Math.abs(p[k]-value));view.setFloat32(84+f*50+12+(j*3+k)*4,value,true);}}
  const [a,b,c]=points,u=b.map((x,i)=>x-a[i]),w=c.map((x,i)=>x-a[i]),n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],length=Math.hypot(...n);for(let k=0;k<3;k++)view.setFloat32(84+f*50+k*4,length?n[k]/length:0,true);
 }
 if(maxQuantizationErrorMm>.005)throw meshError('MESH_EXPORT_PRECISION','STL quantization exceeds 0.005 mm; use the Float64 mesh asset.');
 return {bytes,report:{maxQuantizationErrorMm,triangleCount:count,source:'authoritative-mesh',units:'mm'}};
}
