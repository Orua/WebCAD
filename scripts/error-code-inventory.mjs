import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const excluded=new Set(['bin','obj','node_modules','__pycache__']);
function callArgs(text,start){
  const args=[];let begin=start,depth=0,quote=null,escaped=false;
  for(let i=start;i<text.length;i++){const c=text[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}
    if("'\"`".includes(c)){quote=c;continue;}if('([{'.includes(c))depth++;else if(')]}'.includes(c)){if(c===')'&&depth===0){args.push(text.slice(begin,i));return args;}depth--;}
    else if(c===','&&depth===0){args.push(text.slice(begin,i));begin=i+1;}
  }return args;
}
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>excluded.has(entry.name)?[]:entry.isDirectory()?files(path.join(directory,entry.name)):/\.(?:js|mjs|cs|py|cpp|h|hpp)$/.test(entry.name)?[path.join(directory,entry.name)]:[]);}
// Include literal producer arguments, conditional producer codes and code assignments.
// Uncoded native/JS exceptions are listed separately; dynamic third-party codes are never claimed enumerated.
export function errorCodeInventory(){
  const entries=new Map(),uncoded=[];
  for(const filename of ['src','services/WebCADServices'].flatMap(directory=>files(path.join(root,directory)))){
    const relative=path.relative(root,filename).replaceAll('\\','/');
    if(relative.startsWith('src/error-recovery'))continue;
    const text=fs.readFileSync(filename,'utf8'),lines=text.split(/\r?\n/);
    // Some factories take (message, code), rather than (code, message). Read their
    // actual local parameter order instead of assuming that the first argument is a code.
    const factories=new Map();
    for(const definition of text.matchAll(/(?:\bfunction\s+(\w+)\s*\(([^)]*)\)|\bconst\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>)/g)){
      const params=(definition[2]??definition[4]).split(','),position=params.findIndex(param=>/^\s*(?:code|c)\s*(?:=|$)/.test(param));
      if(position>=0)factories.set(definition[1]??definition[3],position);
    }
    for(const [name,position] of factories)for(const call of text.matchAll(new RegExp('\\b'+name+'\\s*\\(','g'))){
      const expression=callArgs(text,call.index+call[0].length)[position]??'',line=text.slice(0,call.index).split('\n').length;
      for(const match of expression.matchAll(/['"]([A-Z][A-Z0-9_]+|action_not_allowed|scope_denied|method_not_allowed|host_unavailable|lease_revoked|task_ended|task_binding_mismatch|idempotency_conflict|receipt_unavailable)['"]/g)){
        const code=match[1];if(!entries.has(code))entries.set(code,[]);entries.get(code).push({file:relative,line});
      }
    }
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      const patterns=[/\b(?:fail|bad|failure|domainError|serviceError|contractError|meshError|rejectCode|ServiceError|LogoVectorException|WorkerError|InputError|NativeError)\(([^,\n]{1,240})/g, /\b(?:code|Code)\s*(?::|=|\?\?=?|\|\|=?)\s*([^,;\n}]{1,300})/g];
      const codes=new Set();
      for(const pattern of patterns)for(const expression of line.matchAll(pattern))for(const match of expression[1].matchAll(/['"]([A-Z][A-Z0-9_]+|action_not_allowed|scope_denied|method_not_allowed|host_unavailable|lease_revoked|task_ended|task_binding_mismatch|idempotency_conflict|receipt_unavailable)['"]/g))codes.add(match[1]);
      for(const code of codes){
        if(code.endsWith('_')||['ENDSEC','ENTITIES','SECTION','CORRECT_PARAMETERS','READ_STATE_AND_REPLAN','READ_TOOL_AND_CORRECT_PARAMS','RESELECT_TOPOLOGY'].includes(code))continue;
        if(!entries.has(code))entries.set(code,[]);entries.get(code).push({file:relative,line:i+1});
      }
      if(/throw\s+new\s+(?:Error|TypeError|RangeError)\(/.test(line)&&!codes.size)uncoded.push({file:relative,line:i+1});
    }
  }
  return {version:1,scope:['src/**/*.js','services/WebCADServices/**/*.{cs,py,cpp,h,hpp}'],exclusions:['tests/build outputs/dependencies','dynamic third-party codes; conservative runtime fallback applies'],codes:[...entries].sort(([a],[b])=>a.localeCompare(b)).map(([code,sources])=>({code,sources:[...new Map(sources.map(source=>[source.file+':'+source.line,source])).values()]})),uncoded};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const inventory=errorCodeInventory();
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(inventory,null,2)+'\n');
  else process.stdout.write(JSON.stringify({count:inventory.codes.length,codes:inventory.codes.map(entry=>entry.code),uncoded:inventory.uncoded.length},null,2)+'\n');
}
