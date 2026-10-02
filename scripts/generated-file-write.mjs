import {writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

// Windows intermittently rejected opening existing generated index/routes files
// with libuv UNKNOWN (-4094). Retry only that observed open failure, once; never
// suppress a persistent error or a failure after the file has been opened.
export async function writeGeneratedFile(path,data,options,{write=writeFile,wait=delay,platform=process.platform,warn=console.warn}={}){
 try{return await write(path,data,options);}
 catch(error){
  if(platform!=='win32'||error.code!=='UNKNOWN'||error.errno!==-4094||error.syscall!=='open')throw error;
  warn(`Generated file open failed on Windows; retrying once in 150 ms: ${String(path)}`);
  await wait(150);
  return write(path,data,options);
 }
}
