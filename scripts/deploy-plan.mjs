import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, relative} from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function releaseFiles(directory) {
  const root = resolve(directory), files = [];
  function visit(path) {
    for (const entry of readdirSync(path, {withFileTypes:true})) {
      const absolute = resolve(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Release symlink: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const path = relative(root, absolute).replaceAll('\\','/');
        // Site configuration and user data never belong to a frontend release.
        if (/(^|\/)(web\.config|\.deploy-manifest\.json|app_data|uploads|jobs|projects|\.git|agent)(\/|$)/i.test(path)) continue;
        const bytes=readFileSync(absolute);
        files.push({path:`webcad/${path}`, local:absolute, size:bytes.length,sha256:sha256(bytes)});
      }
    }
  }
  visit(root);
  if (!files.some(f=>f.path==='webcad/index.html') || !files.some(f=>f.path==='webcad/automation/manifest.json'))
    throw new Error('Not a complete WebCAD build');
  return files.sort((a,b)=>a.path.localeCompare(b.path));
}
export function changedFiles(files, manifest) {
  const known = new Map((manifest.files||[]).map(f=>[f.path,f.sha256.toLowerCase()]));
  return files.filter(f=>known.get(f.path)!==f.sha256);
}
export function localBaseline(files, directory) {
  const existing=[];
  for (const file of files) {
    const path=resolve(directory,file.path.substring('webcad/'.length));
    if(existsSync(path)) existing.push({path:file.path,sha256:sha256(readFileSync(path))});
  }
  return {files:existing};
}
export function publishOrder(files) {
  const rank=f=>f.path==='webcad/index.html'?3:f.path==='webcad/automation/manifest.json'?2:1;
  return [...files].sort((a,b)=>rank(a)-rank(b)||a.path.localeCompare(b.path));
}
export function mergeManifest(manifest, files) {
  const entries = new Map((manifest.files||[]).map(f=>[f.path,f]));
  for (const {path,size,sha256} of files) entries.set(path,{path,size,sha256});
  return {...manifest, generatedAtUtc:new Date().toISOString(), files:[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
if (process.argv[1] && resolve(process.argv[1])===resolve(import.meta.filename)) {
  const [directory, manifest] = process.argv.slice(2);
  const files = releaseFiles(directory);
  const baseline = process.argv[4]==='--local-root' ? localBaseline(files,process.argv[5])
    : JSON.parse(readFileSync(manifest,'utf8').replace(/^\uFEFF/,''));
  process.stdout.write(JSON.stringify({files,changed:publishOrder(changedFiles(files,baseline)),manifest:mergeManifest(baseline,files)}));
}
