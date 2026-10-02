import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readdirSync,readFileSync,existsSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';

// Source inputs only. Generated discovery snapshots, reports, test outputs and
// timestamps must not change identity when the same source is rebuilt.
const inputs=['src','scripts','docs','skills','LICENSES','public',
  'cad-viewer/bindings','cad-viewer/wasm','cad-viewer/open-source-notices.html',
  'index.html','package.json','package-lock.json','vite.config.mjs','PROJECT.md'];
const generated=['public/automation','public/docs','public/llms.txt'];
const excluded=path=>generated.some(prefix=>path===prefix||path.startsWith(prefix+'/'));

export function fingerprintBuildInputs(root){
  const paths=[];
  const visit=relative=>{
    if(excluded(relative)||!existsSync(resolve(root,relative)))return;
    const entry=lstatSync(resolve(root,relative));
    if(entry.isDirectory()){
      for(const child of readdirSync(resolve(root,relative),{withFileTypes:true})){
        if(child.isSymbolicLink())throw new Error(`Build input cannot be a symbolic link: ${relative}/${child.name}`);
        visit(relative+'/'+child.name);
      }
    }else if(entry.isFile())paths.push(relative);
    else throw new Error(`Unsupported build input: ${relative}`);
  };
  for(const input of inputs)visit(input);
  paths.sort();
  const hash=createHash('sha256');
  for(const path of paths){
    const bytes=readFileSync(resolve(root,path));
    hash.update(path+'\0'+bytes.length+'\0').update(bytes);
  }
  return {sourceHash:hash.digest('hex'),paths};
}

export function readBuildIdentity(root){
  const {sourceHash,paths}=fingerprintBuildInputs(root);
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
  const commit=git(['rev-parse','HEAD']).trim();
  const changed=git(['status','--porcelain=v1','-z','--untracked-files=all','--no-renames','--',...inputs]).split('\0')
    .filter(Boolean).map(row=>row.slice(3).replaceAll('\\','/'));
  const dirty=changed.some(path=>!excluded(path));
  return {buildId:`${commit}-src-${sourceHash.slice(0,16)}${dirty?'-working':''}`,commit,sourceHash,sourceFileCount:paths.length,dirty};
}
