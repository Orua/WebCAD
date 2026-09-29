// Isolated decoder: release the WASM heap by terminating this worker after reading.
self.onmessage=async({data})=>{
 let lib,dwg;
 try{
  const {LibreDwg,Dwg_File_Type}=await import('./cad-viewer/bindings/libredwg-web.js');
  lib=await LibreDwg.create(new URL('./cad-viewer/wasm',self.location.href).href);
  dwg=lib.dwg_read_data(new Uint8Array(data),Dwg_File_Type.DWG);
  if(!dwg)throw new Error('LibreDWG 无法读取文件');
  const db=lib.convert(dwg);
  self.postMessage({entities:db.entities});
 }catch(error){self.postMessage({error:error.message});}
 finally{if(dwg)try{lib.dwg_free(dwg);}catch{}}
};
