import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import {mkdir,copyFile} from 'node:fs/promises';
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const dirty = !!execFileSync('git', ['status', '--porcelain'], {encoding:'utf8'}).trim();
export default defineConfig({
  base:'./',
  plugins:[{
    name:'vector-dwg-runtime',
    async closeBundle(){
      const runtime=['bindings/libredwg-web.js','wasm/libredwg-web.js','wasm/libredwg-web.wasm','open-source-notices.html'];
      const files=[...runtime.map(file=>[`cad-viewer/${file}`,`dist/cad-viewer/${file}`]),
        ...['MIT.txt','GPL-3.0-or-later.txt'].map(file=>[`LICENSES/${file}`,`dist/cad-viewer/LICENSES/${file}`])];
      for(const [source,target] of files){await mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});await copyFile(source,target);}
    },
  }],
  define:{__WEBCAD_BUILD__:JSON.stringify(`${commit}${dirty?'-working':''}`)},
});
