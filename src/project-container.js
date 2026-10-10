import {zipSync,Unzip,UnzipInflate} from 'three/examples/jsm/libs/fflate.module.js';
import {binaryHash} from './contracts/operation-schema.js';
import {validateTimeline} from './document-timeline.js';
const MAX_BYTES=20*1024*1024,MAX_ENTRIES=256,encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const validName=name=>['manifest.json','document.json'].includes(name)||/^artifacts\/[a-f0-9]{64}\.brep$/.test(name);
export function encodeProjectV3(document,{includeTimeline=true}={}){
 const data={...document,...(!includeTimeline?{timeline:undefined}:{}),compiledArtifacts:undefined};
 if(document.version!==3)fail('DOCUMENT_VERSION_UNSUPPORTED','ZIP 工程须明确标记版本 3');
 if(includeTimeline)validateTimeline(document);
 const documentBytes=encoder.encode(JSON.stringify(data)),artifacts=[],files={'document.json':documentBytes};let unpacked=documentBytes.length;
 for(const [hash,bytes]of Object.entries(document.compiledArtifacts||{})){
  if(!/^[a-f0-9]{64}$/.test(hash)||!(bytes instanceof Uint8Array)||binaryHash(bytes).slice(7)!==hash)fail('ARTIFACT_CORRUPT','检查点产物哈希无效');
  const name=`artifacts/${hash}.brep`;files[name]=bytes;artifacts.push({sha256:hash,bytes:bytes.length,format:'occt-text-brep-v1',brepVersion:3});unpacked+=bytes.length;
 }
 if(unpacked>MAX_BYTES||artifacts.length+2>MAX_ENTRIES)fail('SIZE_LIMIT','工程展开后超过已验收的浏览器容量');
 files['manifest.json']=encoder.encode(JSON.stringify({type:'webcad-project',version:3,documentSha256:binaryHash(documentBytes).slice(7),artifacts}));
 const bytes=zipSync(files,{level:6});if(bytes.length>MAX_BYTES)fail('SIZE_LIMIT','工程容器超过 20 MiB 文件限额');return bytes;
}
function directory(bytes){
 if(bytes.length>MAX_BYTES)fail('SIZE_LIMIT','工程文件超限');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))fail('PROJECT_FORMAT_INVALID','不支持多卷或损坏 ZIP');
 const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true),size=view.getUint32(end+12,true);if(count>MAX_ENTRIES||offset+size!==end)fail('SIZE_LIMIT','ZIP 目录数量或位置无效');
 let at=offset,total=0;const entries=new Map();
 for(let i=0;i<count;i++){
  if(at+46>end||view.getUint32(at,true)!==0x02014b50)fail('PROJECT_FORMAT_INVALID','ZIP 目录损坏');
  const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),unpacked=view.getUint32(at+24,true),nameLength=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true);
  if(flags&1||![0,8].includes(method)||at+46+nameLength+extra+comment>end)fail('PROJECT_FORMAT_INVALID','ZIP 加密或压缩格式不支持');
  const name=decoder.decode(bytes.subarray(at+46,at+46+nameLength));if(!validName(name)||entries.has(name))fail('PROJECT_FORMAT_INVALID','工程容器路径或重复条目无效');
  total+=unpacked;if(total>MAX_BYTES)fail('SIZE_LIMIT','工程解压预算超限');entries.set(name,unpacked);at+=46+nameLength+extra+comment;
 }
 if(at!==end||!entries.has('manifest.json')||!entries.has('document.json'))fail('PROJECT_FORMAT_INVALID','工程容器缺少必需条目');return entries;
}
export async function decodeProject(bytes){
 if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
 if(bytes[0]!==0x50||bytes[1]!==0x4b)return JSON.parse(decoder.decode(bytes));
 const expected=directory(bytes),files=new Map(),pending=[];let total=0,failure;
 const unzip=new Unzip(file=>{const chunks=[];let size=0;const done=new Promise((resolve,reject)=>{file.ondata=(error,data,final)=>{if(error){failure=error;reject(error);return;}size+=data.length;total+=data.length;if(!expected.has(file.name)||size>expected.get(file.name)||total>MAX_BYTES){file.terminate();failure=Object.assign(new Error('工程实际解压大小超限'),{code:'SIZE_LIMIT'});reject(failure);return;}chunks.push(data);if(final){if(size!==expected.get(file.name)||files.has(file.name)){failure=Object.assign(new Error('ZIP 条目长度或重复内容无效'),{code:'PROJECT_FORMAT_INVALID'});reject(failure);return;}const joined=new Uint8Array(size);let at=0;for(const part of chunks){joined.set(part,at);at+=part.length;}files.set(file.name,joined);resolve();}};file.start();});pending.push(done);done.catch(()=>{});});unzip.register(UnzipInflate);
 for(let at=0;at<bytes.length;at+=4096){if(failure)throw failure;unzip.push(bytes.subarray(at,at+4096),at+4096>=bytes.length);}
 await Promise.all(pending);if(files.size!==expected.size)fail('PROJECT_FORMAT_INVALID','ZIP 实际条目与目录不同');
 const manifest=JSON.parse(decoder.decode(files.get('manifest.json'))),docBytes=files.get('document.json');
 if(manifest.type!=='webcad-project'||manifest.version!==3||binaryHash(docBytes).slice(7)!==manifest.documentSha256||!Array.isArray(manifest.artifacts))fail('ARTIFACT_CORRUPT','工程 manifest 或正文完整性失败');
 const doc=JSON.parse(decoder.decode(docBytes));if(doc.version!==3)fail('DOCUMENT_VERSION_UNSUPPORTED','新容器不得伪装旧工程版本');doc.compiledArtifacts={};
 const used=new Set();for(const item of manifest.artifacts){const name=`artifacts/${item.sha256}.brep`,data=files.get(name);if(used.has(name)||!data||data.length!==item.bytes||binaryHash(data).slice(7)!==item.sha256||item.format!=='occt-text-brep-v1'||item.brepVersion!==3)fail('ARTIFACT_CORRUPT','保存的精确产物损坏');used.add(name);doc.compiledArtifacts[item.sha256]=data;}
 if(files.size!==used.size+2)fail('PROJECT_FORMAT_INVALID','存在未声明工程产物');return doc;
}
