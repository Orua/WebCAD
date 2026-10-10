import { defineConfig } from 'vite';
import {mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readBuildIdentity} from './scripts/build-identity.mjs';
const root=import.meta.dirname;
const {buildId}=readBuildIdentity(root);
let outputDirectory;
export default defineConfig({
  base:'./',
  build:{outDir:process.env.WEBCAD_DIST_DIR||'dist',...(process.env.WEBCAD_DIST_DIR&&resolve(process.env.WEBCAD_DIST_DIR).replaceAll('\\','/').toLowerCase()==='f:/webcadservices-local/frontend-dist'?{emptyOutDir:true}:{})},
  plugins:[{
    name:'vector-dwg-runtime',
    configResolved(config){outputDirectory=resolve(config.root,config.build.outDir);},
    async closeBundle(){
      const runtime=['bindings/libredwg-web.js','wasm/libredwg-web.js','wasm/libredwg-web.wasm','open-source-notices.html'];
      const files=[...runtime.map(file=>[`cad-viewer/${file}`,`cad-viewer/${file}`]),
        ...['MIT.txt','GPL-3.0-or-later.txt'].map(file=>[`LICENSES/${file}`,`cad-viewer/LICENSES/${file}`])];
      for(const [source,target] of files){const destination=resolve(outputDirectory,target);await mkdir(resolve(destination,'..'),{recursive:true});await copyFile(resolve(root,source),destination);}
    },
  }],
  define:{__WEBCAD_BUILD__:JSON.stringify(buildId)},
});
