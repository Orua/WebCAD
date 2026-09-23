import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const dirty = !!execFileSync('git', ['status', '--porcelain'], {encoding:'utf8'}).trim();
export default defineConfig({base:'./', define:{__WEBCAD_BUILD__:JSON.stringify(`${commit}${dirty?'-working':''}`)}});
