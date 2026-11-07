import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile, mkdir, mkdtemp, readFile, writeFile, unlink} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {generateOpenSource, verifyOpenSource, snapshotAllowed, openSourcePlugin} from './generate-open-source.mjs';
import {readBuildIdentity} from './build-identity.mjs';

const root=resolve(import.meta.dirname,'..');
const temporary=process.env.WEBCAD_TEST_TEMP_DIR||(process.platform==='win32'?'G:/CAD-Workspace/WebCAD/temp':tmpdir());
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const modules=[
  'three/build/three.module.js','three/build/three.core.js','three/examples/jsm/libs/fflate.module.js',
  'replicad/dist/replicad.js','replicad-opencascadejs/dist/replicad_single.js',
  'replicad-opencascadejs/dist/replicad_single.wasm?url','manifold-3d/manifold.js','manifold-3d/manifold.wasm?url',
  'polygon-clipping/dist/polygon-clipping.esm.js','robust-predicates/index.js','splaytree/dist/splaytree.js',
  'flatbush/index.js','flatqueue/index.js','opentype.js/dist/opentype.module.js','tiny-inflate/index.js',
  'string.prototype.codepointat/codepointat.js',
].map(path=>resolve(root,'node_modules',path));

test('源码白名单拒绝历史 agent、数据、配置、缓存和二进制',()=>{
  for(const path of ['src/main.js','scripts/generate-open-source.mjs','corresponding-source/libredwg-web-20260805/src/decode.c','LICENSES/MIT.txt'])assert.equal(snapshotAllowed(path),true,path);
  for(const path of ['agent/notes/history.md','webcad-skills/old.js','public/quick-model-previews/cache.png','services/configuration/secret.json','src/.env','src/credentials.json','tools/private.key','src/cache/a.json','src/data/customer.json','cad-data/open/fonts/Basic.ttf','src/test.wasm'])assert.equal(snapshotAllowed(path),false,path);
});

test('Vite 插件共享 Worker 收集器并在复制 runtime 后生成材料',()=>{
  const plugin=openSourcePlugin(root,readBuildIdentity(root));
  const worker=plugin.config().worker.plugins()[0];
  assert.equal(worker.name,'webcad-open-source-module-collector');
  assert.equal(typeof worker.generateBundle,'function');
  assert.equal(typeof plugin.generateBundle,'function');
  assert.equal(plugin.closeBundle.order,'post');
  assert.equal(plugin.closeBundle.sequential,true);
});

test('真实安装包生成、ZIP 与哈希、HTML 链接、版本范围及破坏性校验',{timeout:120000},async t=>{
  assert.ok(existsSync(temporary),'外部临时目录必须已存在');
  const outputDirectory=await mkdtemp(temporary+'/open-source-test-');
  await mkdir(resolve(outputDirectory,'assets'),{recursive:true});
  await writeFile(resolve(outputDirectory,'index.html'),'<a href="./open-source-notices.html">开源许可</a>');
  const runtimePaths=[
    ['cad-viewer/bindings/libredwg-web.js','cad-viewer/bindings/libredwg-web.js'],
    ['cad-viewer/wasm/libredwg-web.js','cad-viewer/wasm/libredwg-web.js'],
    ['cad-viewer/wasm/libredwg-web.wasm','cad-viewer/wasm/libredwg-web.wasm'],
    ['node_modules/replicad-opencascadejs/dist/replicad_single.wasm','assets/replicad.wasm'],
    ['node_modules/manifold-3d/manifold.wasm','assets/manifold.wasm'],
  ];
  for(const [source,target] of runtimePaths){
    await mkdir(resolve(outputDirectory,target,'..'),{recursive:true});
    await copyFile(resolve(root,source),resolve(outputDirectory,target));
  }
  const identity=readBuildIdentity(root);
  const moduleIds=modules.filter(id=>existsSync(id.split('?')[0]));
  assert.equal(moduleIds.length,modules.length,'测试模块必须来自真实安装包');
  const inventory=await generateOpenSource({root,outputDirectory,identity,moduleIds});
  const result=await verifyOpenSource({root,outputDirectory});
  assert.ok(result.packages>=16);
  assert.ok(result.sourceFiles>100);
  assert.equal(result.buildId,identity.buildId);
  assert.equal(inventory.packages.find(p=>p.name==='manifold-3d').declaredLicense,'Apache-2.0');
  assert.equal(inventory.packages.find(p=>p.name==='@modelcontextprotocol/sdk').scope.includes('browser-bundled'),false);
  assert.equal(inventory.packages.find(p=>p.name==='splaytree').licenseFiles.some(f=>f.path.endsWith('/Readme.md')),true);
  assert.equal(inventory.runtimes.length,5);
  const earcut=inventory.components.find(item=>item.name==='Earcut (three embedded)');
  assert.equal(earcut.version,'3.0.1');
  assert.equal(earcut.browserDistributed,true);
  assert.deepEqual(earcut.distributionScopes,['public-web','integrated-web']);
  assert.equal(inventory.components.find(item=>item.name.startsWith('PyMuPDF')).browserDistributed,false);
  assert.deepEqual(inventory.components.find(item=>item.name.startsWith('PyMuPDF')).distributionScopes,['services']);
  assert.equal(inventory.components.find(item=>item.name.startsWith('OCCT exception')).browserDistributed,false);
  const policy=JSON.parse(await readFile(resolve(outputDirectory,'open-source/distribution-policy.json'),'utf8'));
  assert.equal(policy.scopes.find(item=>item.scope==='public-web').allowed,false,'未闭合许可不能被材料完整性通过掩盖');
  assert.match(await readFile(resolve(outputDirectory,'open-source-notices.html'),'utf8'),/href="\.\/open-source\/distribution-policy\.json"/);
  const before=await readFile(resolve(outputDirectory,'open-source/manifest.json'));
  await generateOpenSource({root,outputDirectory,identity,moduleIds});
  assert.deepEqual(await readFile(resolve(outputDirectory,'open-source/manifest.json')),before,'相同输入生成应稳定');
  const corrupt=async(path,replacement,pattern)=>{
    const original=await readFile(resolve(outputDirectory,path));
    await writeFile(resolve(outputDirectory,path),replacement);
    try{await assert.rejects(verifyOpenSource({root,outputDirectory}),pattern);}
    finally{await writeFile(resolve(outputDirectory,path),original);}
  };
  await t.test('拒绝许可被截断',()=>corrupt('open-source/LICENSES/manifold-3d-3.5.4-Apache-2.0.txt','Apache-2.0',/文件哈希不匹配/));
  await t.test('拒绝运行二进制哈希漂移',()=>corrupt('assets/manifold.wasm','changed',/实际 dist 文件增删或哈希变化/));
  await t.test('拒绝工作源码 ZIP 被更换',()=>corrupt('open-source/working-source.zip','changed',/文件哈希不匹配/));
  await t.test('拒绝缺少许可文件',async()=>{
    const path=resolve(outputDirectory,'open-source/LICENSES/MIT.txt'),bytes=await readFile(path);
    await unlink(path);
    try{await assert.rejects(verifyOpenSource({root,outputDirectory}),/ENOENT/);}
    finally{await writeFile(path,bytes);}
  });
  await t.test('重算manifest不能把未闭合范围伪造成批准',async()=>{
    const path=resolve(outputDirectory,'open-source/distribution-policy.json'),saved=await readFile(path);
    const altered=JSON.parse(saved);altered.scopes[0].allowed=true;altered.scopes[0].blockers=[];
    const bytes=Buffer.from(JSON.stringify(altered)),manifest=JSON.parse(before);
    Object.assign(manifest.files.find(file=>file.path==='open-source/distribution-policy.json'),{sha256:sha256(bytes),sizeBytes:bytes.length});
    await writeFile(path,bytes);await writeFile(resolve(outputDirectory,'open-source/manifest.json'),JSON.stringify(manifest));
    try{await assert.rejects(verifyOpenSource({root,outputDirectory}),/分发范围审计报告过期或被改写/);}
    finally{await writeFile(path,saved);await writeFile(resolve(outputDirectory,'open-source/manifest.json'),before);}
  });
  await t.test('拒绝分发包混入未登记资源',async()=>{
    const path=resolve(outputDirectory,'unapproved-resource.jpg');await writeFile(path,'unreviewed fixture');
    try{await assert.rejects(verifyOpenSource({root,outputDirectory}),/实际 dist 文件增删或哈希变化/);}
    finally{await unlink(path);}
  });
  await t.test('拒绝 manifest 冒称其他 build',async()=>{
    const stale=JSON.parse(before);stale.identity.buildId='HEAD';
    await corrupt('open-source/manifest.json',JSON.stringify(stale),/build identity 过期/);
  });
  await t.test('首页必须有真实链接而不只是文案',async()=>{
    const home=await readFile(resolve(outputDirectory,'index.html'));
    const manifest=JSON.parse(before);
    const changed=Buffer.from('<p>./open-source-notices.html</p>');
    await writeFile(resolve(outputDirectory,'index.html'),changed);
    const invPath=resolve(outputDirectory,'open-source/inventory.json');
    const saved=await readFile(invPath),inv=JSON.parse(saved);
    Object.assign(inv.artifacts.find(f=>f.path==='index.html'),{sha256:sha256(changed),sizeBytes:changed.length});
    const bytes=Buffer.from(JSON.stringify(inv));await writeFile(invPath,bytes);
    Object.assign(manifest.files.find(f=>f.path==='open-source/inventory.json'),{sha256:sha256(bytes),sizeBytes:bytes.length});
    await writeFile(resolve(outputDirectory,'open-source/manifest.json'),JSON.stringify(manifest));
    try{await assert.rejects(verifyOpenSource({root,outputDirectory}),/首页缺少/);}
    finally{await writeFile(resolve(outputDirectory,'index.html'),home);await writeFile(invPath,saved);await writeFile(resolve(outputDirectory,'open-source/manifest.json'),before);}
  });
  const report={outputDirectory,...result,scope:'仅针对开源生成器；测试输出模拟 dist，不是全项目构建或发布包',identity};
  await writeFile(resolve(outputDirectory,'test-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('开源针对性测试产物：'+outputDirectory);
});

test('PyMuPDF 原声明与官方全文分别保留；上游版权完整',()=>{
  assert.match(readFileSync(resolve(root,'tools/logo-vector-import.py'),'utf8'),/import pymupdf as fitz/);
  const notice=readFileSync(resolve(root,'LICENSES/PyMuPDF-1.26.4-COPYING.txt'),'utf8');
  assert.match(notice,/Artifex Commercial License/);
  const full=readFileSync(resolve(root,'LICENSES/PyMuPDF-1.26.4-AGPL-3.0.txt'),'utf8');
  assert.ok(full.length>30000);assert.match(full,/13\. Remote Network Interaction/);assert.match(full,/END OF TERMS AND CONDITIONS/);
  const apache=readFileSync(resolve(root,'LICENSES/manifold-3d-3.5.4-Apache-2.0.txt'),'utf8');
  assert.equal(apache.replaceAll('\r\n','\n'),readFileSync(resolve(root,'node_modules/manifold-3d/LICENSE'),'utf8').replaceAll('\r\n','\n'));
});
