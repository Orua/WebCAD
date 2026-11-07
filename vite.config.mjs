import {editionBuildPlugin} from './scripts/edition-build.mjs';
import { defineConfig } from 'vite';
import {mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readBuildIdentity} from './scripts/build-identity.mjs';
import {openSourcePlugin} from './scripts/generate-open-source.mjs';
const root=import.meta.dirname;
const identity=readBuildIdentity(root);
const {buildId}=identity;
let outputDirectory;
export default defineConfig({
  base:'./',
  resolve:{alias:{'#webcad-host':resolve(root,identity.edition==='public'?'src/editions/public-host.js':'src/editions/integrated-host.js')}},
  ...(identity.edition==='public'?{publicDir:false}:{}),
  build:{outDir:process.env.WEBCAD_DIST_DIR||'dist',...(process.env.WEBCAD_DIST_DIR&&resolve(process.env.WEBCAD_DIST_DIR).replaceAll('\\','/').toLowerCase()==='f:/webcadservices-local/frontend-dist'?{emptyOutDir:true}:{})},
  plugins:[{
    name:'vector-dwg-runtime',
    configResolved(config){outputDirectory=resolve(config.root,config.build.outDir);},
    async closeBundle(){
      const runtime=['bindings/libredwg-web.js','wasm/libredwg-web.js','wasm/libredwg-web.wasm'];
      const files=[...runtime.map(file=>[`cad-viewer/${file}`,`cad-viewer/${file}`]),
        ...['MIT.txt','GPL-3.0-or-later.txt'].map(file=>[`LICENSES/${file}`,`cad-viewer/LICENSES/${file}`])];
      for(const [source,target] of files){const destination=resolve(outputDirectory,target);await mkdir(resolve(destination,'..'),{recursive:true});await copyFile(resolve(root,source),destination);}
    },
  },openSourcePlugin(root,identity),editionBuildPlugin(root,identity)],
  define:{__WEBCAD_BUILD__:JSON.stringify(buildId),__WEBCAD_EDITION__:JSON.stringify(identity.edition)},
});
