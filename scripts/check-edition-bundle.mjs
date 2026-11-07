import {build} from 'vite';
import {resolve} from 'node:path';
import {assertPublicModules} from './edition-build.mjs';
const root=resolve(import.meta.dirname,'..');
for(const edition of ['public','integrated']){
  const modules=new Set();
  // Compile in memory: no generated documents, package, server or deploy action.
  await build({root,configFile:false,publicDir:false,logLevel:'warn',
    resolve:{alias:{'#webcad-host':resolve(root,`src/editions/${edition}-host.js`)}},
    define:{__WEBCAD_BUILD__:JSON.stringify('edition-boundary-check'),__WEBCAD_EDITION__:JSON.stringify(edition)},
    build:{write:false,emptyOutDir:false,reportCompressedSize:false,minify:false,target:'es2022'},
    plugins:[{name:'check-edition-graph',generateBundle(_options,bundle){
      for(const chunk of Object.values(bundle))if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules))modules.add(id.replaceAll('\\','/'));
    }}]});
  if(edition==='public')assertPublicModules([...modules]);
  else if(![...modules].some(id=>id.endsWith('/src/agent/assistant-panel.js')))throw Error('Integrated assistant was lost');
  console.log(`${edition}: compiled ${modules.size} modules; edition boundary passed (no files written)`);
}
