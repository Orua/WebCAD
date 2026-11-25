import {checkedMesh,meshError} from '../../mesh/mesh-contract.js';
import {weldIndex} from '../../mesh/mesh-volume.js';
import {LIMITS} from '../../limits.js';

const MIN_EDGE_MM=1e-7;
const encoder=new TextEncoder();
const ascii=new TextDecoder();

function invalid(message){throw meshError('MESH_FACETED_STEP_INVALID',message);}

function triangleFrame(p,a,b,c){
  const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2];
  const vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const area2=Math.hypot(nx,ny,nz),edge=Math.hypot(ux,uy,uz);
  const longest=Math.max(edge,Math.hypot(vx,vy,vz),Math.hypot(vx-ux,vy-uy,vz-uz));
  if(!Number.isFinite(area2)||!(area2>longest*MIN_EDGE_MM))invalid('三角面退化，或最小高不足 0.0000001 mm。');
  return {normal:[nx/area2,ny/area2,nz/area2],direction:[ux/edge,uy/edge,uz/edge],cross:[nx,ny,nz]};
}

// Exact-coordinate vertex reuse, paired edges and a single face fan per vertex.
// Connected components remain separate shells. A negative shell can be a
// cavity, so interpreting it as an independent solid would add material.
function shellTopology(mesh){
  const {positions,indices}=checkedMesh(mesh),remap=weldIndex(positions);
  const vertexCount=remap.length,vertices=indices.map(i=>remap[i]);
  const keys=new Float64Array(vertices.length),next=i=>i%3===2?i-2:i+1;
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[next(i)];
    if(a===b)invalid('三角面包含重合顶点。');
    keys[i]=Math.min(a,b)*vertexCount+Math.max(a,b);
  }
  const order=vertices.map((_,i)=>i).sort((a,b)=>keys[a]-keys[b]);
  const twins=new Uint32Array(vertices.length),degree=new Uint32Array(vertexCount);
  for(let i=0;i<order.length;i+=2){
    const a=order[i],b=order[i+1];
    if(b===undefined||keys[a]!==keys[b]||keys[b]===keys[order[i+2]]||vertices[a]!==vertices[next(b)])
      invalid('网格有开放边、非流形边或不一致的面朝向。');
    twins[a]=b;twins[b]=a;degree[vertices[a]]++;degree[vertices[b]]++;
  }
  for(let i=0;i<vertices.length;i++){
    const v=vertices[i];
    if(!degree[v])continue;
    let count=0,j=i;
    do{count++;j=next(twins[j]);}while(j!==i);
    if(count!==degree[v])invalid('顶点连接了多个独立面扇。');
    degree[v]=0;
  }
  const visited=new Uint8Array(vertices.length/3),shells=[];
  for(let face=0;face<visited.length;face++){
    if(visited[face])continue;
    const faces=[face],origin=vertices[face*3]*3;
    let volume6=0;
    visited[face]=1;
    for(let i=0;i<faces.length;i++){
      const edge=faces[i]*3,a=vertices[edge]*3;
      const {cross}=triangleFrame(positions,a,vertices[edge+1]*3,vertices[edge+2]*3);
      for(let k=0;k<3;k++){
        volume6+=(positions[a+k]-positions[origin+k])*cross[k];
        const other=Math.floor(twins[edge+k]/3);
        if(!visited[other]){visited[other]=1;faces.push(other);}
      }
    }
    if(!Number.isFinite(volume6)||volume6<=0)invalid('壳体须有正体积且朝外；请检查翻面或内腔壳。');
    shells.push(faces);
  }
  return {positions,vertices,vertexCount,shells};
}

const real=value=>String(value).toUpperCase().replace(/^(-?\d+)(?=E|$)/,'$1.');
const point=(p,i)=>`(${real(p[i])},${real(p[i+1])},${real(p[i+2])})`;
const stepName=name=>"'"+String(name).replace(/[^\x20-\x7e]+|[\\']/g,chars=>{
  if(chars==="'")return "''";
  if(chars==='\\')return '\\\\';
  return '\\X2\\'+chars.split('').map(c=>c.charCodeAt(0).toString(16).padStart(4,'0').toUpperCase()).join('')+'\\X0\\';
})+"'";
const HEADER=`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Faceted B-rep, millimetres'),'2;1');
FILE_NAME('webcad.step','',(''),(''),'WebCAD','WebCAD','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
`;
const FOOTER='ENDSEC;\nEND-ISO-10303-21;\n';

// Preserve the exact writer's entities and ID references byte for byte.
// The faceted parts have their own product definition and root representation.
function exactData(bytes){
  if(!bytes)return {prefix:encoder.encode(HEADER),lastId:0};
  const schema=/FILE_SCHEMA\s*\(\s*\(\s*'(AUTOMOTIVE_DESIGN|AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF)\b/.exec(ascii.decode(bytes.subarray(0,4096)));
  if(!schema)
    throw meshError('MESH_STEP_SCHEMA_UNSUPPORTED','请分别导出精确实体组与网格组：当前精确 STEP 模式不支持附加分面实体。');
  const tail=ascii.decode(bytes.subarray(-64));
  const footer=/ENDSEC;\s*END-ISO-10303-21;\s*$/.exec(tail);
  if(!footer)throw meshError('MESH_STEP_SCHEMA_UNSUPPORTED','无法定位精确 STEP 的数据段结尾，请按几何类型分组导出。');
  const prefix=bytes.subarray(0,bytes.length-footer[0].length);
  let lastId=0;
  for(let i=0;i<prefix.length;i++){
    if(prefix[i]!==35||(i&&prefix[i-1]!==10))continue;
    let id=0,j=i+1;
    while(prefix[j]>=48&&prefix[j]<=57)id=id*10+prefix[j++]-48;
    while(prefix[j]===32||prefix[j]===9)j++;
    if(prefix[j]===61)lastId=Math.max(lastId,id);
  }
  return {prefix,lastId,ap242:schema[1].startsWith('AP242')};
}

function stepWriter(exactBytes){
  const {prefix,lastId,ap242}=exactData(exactBytes);
  const chunks=[prefix];
  let size=prefix.length,lines='',id=lastId;
  function flush(){
    if(!lines)return;
    const bytes=encoder.encode(lines);
    size+=bytes.length;
    if(size>LIMITS.meshExport.maxFacetedStepBytes)throw meshError('SIZE_LIMIT','分面 STEP 文件超过 128 MiB，请分组选取实体。');
    chunks.push(bytes);
    lines='';
  }
  function append(line){
    lines+=line;
    if(lines.length>=64*1024)flush();
  }
  return {
    ap242,
    entity(value){append(`#${++id}=${value};\n`);return id;},
    shell(faceIds){
      const shellId=++id;
      append(`#${shellId}=CLOSED_SHELL('',(`);
      for(let i=0;i<faceIds.length;i++)append(`${i?',':''}#${faceIds[i]}${i%16===15?'\n':''}`);
      append('));\n');
      return shellId;
    },
    finish(){
      append(FOOTER);flush();
      const data=new Uint8Array(size);
      let offset=0;
      for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
      return data;
    }
  };
}

export function exportFacetedSTEP(items,exactBytes,withBody){
  const writer=stepWriter(exactBytes),{entity}=writer;
  const application=entity(writer.ap242?"APPLICATION_CONTEXT('Managed model based 3d engineering')":"APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
  const protocol=writer.ap242?"'ap242_managed_model_based_3d_engineering',2013":"'automotive_design',2000";
  entity(`APPLICATION_PROTOCOL_DEFINITION('international standard',${protocol},#${application})`);
  const productContext=entity(`PRODUCT_CONTEXT('',#${application},'mechanical')`);
  const definitionContext=entity(`PRODUCT_DEFINITION_CONTEXT('part definition',#${application},'design')`);
  const mm=entity('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))');
  const radians=entity('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))');
  const steradians=entity('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())');
  const tolerance=entity(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-7),#${mm},'distance_accuracy_value','')`);
  const context=entity(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${tolerance})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${mm},#${radians},#${steradians})) REPRESENTATION_CONTEXT('','3D'))`);
  const origin=entity("CARTESIAN_POINT('',(0.,0.,0.))");
  const placement=entity(`AXIS2_PLACEMENT_3D('',#${origin},$,$)`);
  const bodies=items.map(item=>withBody(item,()=>{
    const {positions,vertices,vertexCount,shells}=shellTopology(item.shape.transformed());
    const pointIds=new Uint32Array(vertexCount),name=stepName(item.name),solids=[];
    for(const faces of shells){
      const faceIds=new Uint32Array(faces.length);
      for(let i=0;i<faces.length;i++){
        const face=faces[i]*3,a=vertices[face],b=vertices[face+1],c=vertices[face+2];
        for(const vertex of [a,b,c]){
          if(!pointIds[vertex])pointIds[vertex]=entity(`CARTESIAN_POINT('',${point(positions,vertex*3)})`);
        }
        const {normal,direction}=triangleFrame(positions,a*3,b*3,c*3);
        const z=entity(`DIRECTION('',${point(normal,0)})`),x=entity(`DIRECTION('',${point(direction,0)})`);
        const frame=entity(`AXIS2_PLACEMENT_3D('',#${pointIds[a]},#${z},#${x})`);
        const plane=entity(`PLANE('',#${frame})`);
        const loop=entity(`POLY_LOOP('',(#${pointIds[a]},#${pointIds[b]},#${pointIds[c]}))`);
        const bound=entity(`FACE_OUTER_BOUND('',#${loop},.T.)`);
        faceIds[i]=entity(`FACE_SURFACE('',(#${bound}),#${plane},.T.)`);
      }
      solids.push(entity(`FACETED_BREP(${name},#${writer.shell(faceIds)})`));
    }
    const product=entity(`PRODUCT(${stepName(item.id)},${name},'',(#${productContext}))`);
    entity(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(#${product}))`);
    const formation=entity(`PRODUCT_DEFINITION_FORMATION('','',#${product})`);
    const definition=entity(`PRODUCT_DEFINITION('design','',#${formation},#${definitionContext})`);
    const shape=entity(`PRODUCT_DEFINITION_SHAPE('','',#${definition})`);
    const representation=entity(`FACETED_BREP_SHAPE_REPRESENTATION(${name},(#${placement},#${solids.join(',#')}),#${context})`);
    entity(`SHAPE_DEFINITION_REPRESENTATION(#${shape},#${representation})`);
    return {id:item.id,geometryType:'faceted-brep',triangleCount:vertices.length/3,solidCount:solids.length};
  }));
  return {data:writer.finish(),bodies};
}
