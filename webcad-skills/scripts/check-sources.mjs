import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {root} from './load.mjs';
if(!process.argv.includes('--installed-root'))throw Error('Explicit --installed-root needed for live source verification');
const sourceRoot=process.argv[process.argv.indexOf('--installed-root')+1],coverage=JSON.parse(await readFile(join(root,'references/source-coverage.json'),'utf8'));
const actual=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='.git')continue;const path=join(dir,e.name);if(e.isDirectory())await walk(path);else if(e.isFile())actual.push(relative(sourceRoot,path).split(String.fromCharCode(92)).join('/'));}}await walk(sourceRoot);
assert.deepEqual(actual.sort(),coverage.files.map(f=>f.path).sort());for(const f of coverage.files){const b=await readFile(join(sourceRoot,f.path));assert.equal(b.length,f.bytes,f.path);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256,f.path);}
console.log(JSON.stringify({status:'passed',sourceFiles:actual.length,integrity:'sizes and SHA256 match full installed plugin snapshot'}));
