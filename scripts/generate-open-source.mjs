import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, lstatSync, readFileSync, readdirSync, realpathSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, isAbsolute, relative, resolve} from 'node:path';
import {zipSync, unzipSync} from 'three/addons/libs/fflate.module.js';
import {fingerprintBuildInputs, readBuildIdentity} from './build-identity.mjs';

const documents=['LICENSE.md','THIRD_PARTY_NOTICES.md','CORRESPONDING_SOURCE.md'];
const browserPackages=['three','replicad','replicad-opencascadejs','manifold-3d','polygon-clipping'];
const localPackages=['@modelcontextprotocol/sdk','ws','zod'];
const slash=path=>path.replaceAll('\\','/');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const parse=bytes=>JSON.parse(Buffer.from(bytes).toString('utf8'));
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const describe=(path,bytes)=>({path,sizeBytes:bytes.length,sha256:sha256(bytes)});
const fail=message=>{throw new Error(`开源材料校验失败：${message}`);};
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safePath(path){
  if(typeof path!=='string'||!path||path.includes('\\')||path.includes(':')||isAbsolute(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))fail(`不安全路径 ${path}`);
  return path;
}
function walk(root,part=''){
  const result=[];
  for(const item of readdirSync(resolve(root,part),{withFileTypes:true})){
    const path=part?part+'/'+item.name:item.name;
    if(item.isSymbolicLink())fail(`分发材料不得包含符号链接 ${path}`);
    if(item.isDirectory())result.push(...walk(root,path));
    else if(item.isFile())result.push(path);
  }
  return result.sort();
}
function packageAt(root,name){
  const directory=resolve(root,'node_modules',name);
  const metadata=parse(readFileSync(resolve(directory,'package.json')));
  return {directory,metadata};
}
const packageRoots=new Map();
function packageForModule(root,id){
  const path=slash(id).replace(/^\0/,'').split('?')[0];
  if(!isAbsolute(path)||!existsSync(path))return null;
  if(!packageRoots.has(root)){
    const lock=parse(readFileSync(resolve(root,'package-lock.json')));
    packageRoots.set(root,Object.keys(lock.packages).filter(p=>p.includes('node_modules/')&&existsSync(resolve(root,p,'package.json'))).map(p=>{
      const directory=resolve(root,p);
      return {directory,real:slash(realpathSync(directory)),logical:slash(directory),metadata:parse(readFileSync(resolve(directory,'package.json')))};
    }).sort((a,b)=>b.real.length-a.real.length));
  }
  for(const record of packageRoots.get(root)){
    const base=[record.logical,record.real].find(base=>path.toLowerCase().startsWith(base.toLowerCase()+'/'));
    if(base)return {...record,modulePath:path.slice(base.length+1)};
  }
  if(path.includes('/node_modules/'))fail(`无法识别构建依赖 ${id}`);
  return null;
}
function licenseFiles(directory,name){
  const paths=walk(directory).filter(path=>/^(?:licen[cs]e|copying|notice)(?:[.\-_]|$)/i.test(path.split('/').at(-1))&&!path.includes('node_modules/'));
  if(!paths.length&&name==='splaytree')paths.push('Readme.md');
  if(!paths.length)fail(`${name} 安装包缺少完整许可`);
  return paths;
}
const blockedPath=path=>/(^|\/)(?:\.git|node_modules|agent|webcad-skills|bin|obj|cache|data|logs|screenshots|quick-model-previews|trial-samples|examples)(\/|$)/i.test(path)||/(^|\/)(?:\.env(?:\..*)?|.*(?:secret|credential|private.key|local.settings|appsettings\.local).*)$/i.test(path);
export function snapshotAllowed(path){
  if(blockedPath(path))return false;
  if(!(/^(?:src|scripts|tests|docs|skills|contracts|corresponding-source|LICENSES|tools)\//.test(path)||documents.includes(path)||['index.html','package.json','package-lock.json','vite.config.mjs','PROJECT.md','README.md','.gitignore','.gitattributes','web.config'].includes(path)||path==='public/vector-dwg-worker.js'))return false;
  return /\.(?:[cm]?js|jsx|ts|tsx|json|md|txt|css|html|py|ps1|cmd|c|cpp|cc|h|hpp|in|yml|yaml|cmake|toml|xml|config|sh|spec|inc|i)$/i.test(path)||/(?:^|\/)(?:COPYING|LICENSE|AUTHORS|Makefile|CMakeLists\.txt|\.gitignore|\.gitattributes)$/.test(path);
}
function assertNoSecret(path,bytes){
  if(blockedPath(path)||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bAKIA[0-9A-Z]{16}\b/.test(bytes.toString('utf8')))fail(`源码快照疑似包含敏感内容 ${path}`);
}
function upstream(metadata){
  const repository=typeof metadata.repository==='string'?metadata.repository:metadata.repository?.url;
  let url=repository?.replace(/^git\+/,'').replace(/^git:\/\//,'https://').replace(/\.git$/,'');
  if(url?.startsWith('github:'))url='https://github.com/'+url.slice(7);
  if(!url&&/^replicad/.test(metadata.name))url='https://github.com/sgenoud/replicad';
  if(!url?.startsWith('https://'))return null;
  return {repository:url,version:metadata.version,gitHead:metadata.gitHead||null,
    sourceUrl:metadata.gitHead?`${url}/tree/${metadata.gitHead}`:null,
    status:metadata.gitHead?'package-declared-commit-not-rebuilt':'package-version-only-no-exact-source-claim'};
}
const runtimeSources=['cad-viewer/bindings/libredwg-web.js','cad-viewer/wasm/libredwg-web.js','cad-viewer/wasm/libredwg-web.wasm',
  'node_modules/replicad-opencascadejs/dist/replicad_single.wasm','node_modules/manifold-3d/manifold.wasm'];
function runtimeEvidence(root,artifacts){
  return runtimeSources.map(path=>{
    const input=describe(path,readFileSync(resolve(root,path)));
    const output=artifacts.filter(file=>file.sha256===input.sha256&&file.sizeBytes===input.sizeBytes);
    if(!output.length)fail(`实际分发缺少或改写了运行组件 ${path}`);
    return {input,outputs:output.map(file=>file.path)};
  });
}
const gaps=[
  {id:'occt-modeling-source',status:'missing',detail:'replicad-opencascadejs 1.1.0 包含生成 JS/WASM，不含完整 OCCT/opencascade.js 内核源、全部生成器/补丁/镜像 digest。包 gitHead 仅标识 replicad 仓库，不能证明内核精确版本；未完成内核重编译与替换/重链接验证。'},
  {id:'libredwg-rebuild',status:'unverified',detail:'随包保留已有 LibreDWG 源码子集、绑定和构建脚本；本轮未重编译，不宣称全部第三方/工具链源已齐或可逐字节复现。历史记录的源提交和运行文件哈希单独核对。'},
  {id:'manifold-native-closure',status:'unverified',detail:'manifold 安装包提供 Apache-2.0 全文，但不包含完整 C++ 内核及所有静态编入依赖的完整来源/配置记录。未凭 npm 版本声称其原生依赖许可闭包已齐。'},
  {id:'pymupdf-service',status:'separate-runtime-review-required',detail:'tools/logo-vector-import.py 的 PDF/AI 路径真实调用 PyMuPDF；1.26.4 安装 COPYING 仅双许可声明，另附该版本官方 AGPL-3.0 全文。Python/MuPDF 不在静态 dist；未核实实际部署的解释器、服务使用路径、完整 MuPDF 对应源及商业授权，不以“不在浏览器”免除服务许可审查。'},
  {id:'snapshot-scope',status:'partial-by-design',detail:'应用快照只收录白名单文本源码和已有 LibreDWG 子集；排除数据、secret、历史 agent、图片缓存、服务/宿主配置、第三方二进制、生成文档和依赖安装目录。完整 build identity 输入另外仅记哈希；该快照不是完整产品或全部第三方内核 Corresponding Source。'},
];

export async function generateOpenSource({root,outputDirectory,identity=readBuildIdentity(root),moduleIds=[]}){
  root=resolve(root);outputDirectory=resolve(outputDirectory);
  if(!existsSync(outputDirectory))fail('输出目录不存在');
  const current=readBuildIdentity(root);
  if(JSON.stringify(current)!==JSON.stringify(identity))fail('构建期间源码 identity 已变化');
  const written=new Map();
  const put=async(path,bytes)=>{
    safePath(path);bytes=Buffer.from(bytes);
    await mkdir(dirname(resolve(outputDirectory,path)),{recursive:true});
    await writeFile(resolve(outputDirectory,path),bytes);written.set(path,describe(path,bytes));
  };
  for(const file of documents)await put('open-source/'+file,readFileSync(resolve(root,file)));
  for(const file of walk(resolve(root,'LICENSES')))await put('open-source/LICENSES/'+file,readFileSync(resolve(root,'LICENSES',file)));
  const lock=parse(readFileSync(resolve(root,'package-lock.json')));
  const packages=new Map();
  const add=(record,scope,module)=>{
    const {directory,metadata}=record,key=metadata.name+'@'+metadata.version;
    let item=packages.get(key);
    if(!item){
      const entry=lock.packages?.[slash(relative(root,directory))];
      if(!entry||entry.version!==metadata.version)fail(`${key} 与 package-lock 不一致`);
      item={name:metadata.name,version:metadata.version,declaredLicense:metadata.license||null,scope:[],modules:[],directory,
        lock:{integrity:entry.integrity||null,resolved:entry.resolved||null},upstream:upstream(metadata),licenseFiles:[]};
      packages.set(key,item);
    }
    if(!item.scope.includes(scope))item.scope.push(scope);
    if(module&&!item.modules.includes(module))item.modules.push(module);
  };
  for(const id of moduleIds){
    const record=packageForModule(root,id);
    if(record)add(record,'browser-bundled',record.modulePath);
  }
  for(const name of browserPackages){
    if(![...packages.values()].some(p=>p.name===name&&p.scope.includes('browser-bundled')))fail(`构建模块图缺少 ${name}；Worker 模块也必须收集`);
  }
  for(const name of localPackages)add(packageAt(root,name),'local-node-not-static-browser');
  add(packageAt(root,'vite'),'build-tool-not-browser');
  for(const item of [...packages.values()].sort((a,b)=>(a.name+'@'+a.version).localeCompare(b.name+'@'+b.version))){
    const {directory}=item;
    const base='open-source/packages/'+item.name.replaceAll('/','__')+'@'+item.version+'/';
    for(const file of ['package.json',...licenseFiles(directory,item.name)]){
      const path=base+file,bytes=readFileSync(resolve(directory,file));
      await put(path,bytes);item.licenseFiles.push(describe(path,bytes));
    }
    item.modules=item.modules.sort().map(path=>describe(path,readFileSync(resolve(directory,path))));
    delete item.directory;
  }
  const supplemental=[
    ['fflate (three embedded)','0.8.2','MIT','node_modules/three/examples/jsm/libs/fflate.module.js',['LICENSES/fflate-0.8.2-MIT.txt']],
    ['svg-numbers (three SVGLoader embedded)','unversioned embedded copy','MIT','node_modules/three/examples/jsm/loaders/SVGLoader.js',['LICENSES/svg-numbers-MIT.txt']],
    ['LibreDWG','0.14.8556 / libredwg-web 0.7.9','GPL-3.0-or-later','cad-viewer/wasm/libredwg-web.wasm',['LICENSES/GPL-3.0-or-later.txt']],
    ['OCCT exception (retained legacy notice)','1.0','LGPL-2.1 exception','cad-viewer/vendor/occt-import-js/OCCT_LGPL_EXCEPTION.txt',['cad-viewer/vendor/occt-import-js/license.occt.txt','cad-viewer/vendor/occt-import-js/license.occt-import-js.txt','cad-viewer/vendor/occt-import-js/OCCT_LGPL_EXCEPTION.txt']],
    ['Studio Small 09 / Sergej Majboroda / Poly Haven','unmodified HDR','CC0-1.0','public/render-assets/studio-small-09.bin',['public/render-assets/studio-small-09.LICENSE.txt','LICENSES/CC0-1.0.txt']],
    ['PyMuPDF (optional local Python)','1.26.4 requirement; not deployed-version evidence','AGPL-3.0 OR Artifex commercial','tools/logo-vector-import.py',['LICENSES/PyMuPDF-1.26.4-COPYING.txt','LICENSES/PyMuPDF-1.26.4-AGPL-3.0.txt']],
  ];
  const components=[];
  for(const [name,version,license,input,notices] of supplemental){
    const files=[];
    for(const file of notices){const path='open-source/retained/'+file;const bytes=readFileSync(resolve(root,file));await put(path,bytes);files.push(describe(path,bytes));}
    components.push({name,version,license,input:describe(input,readFileSync(resolve(root,input))),licenseFiles:files});
  }
  const candidatePaths=[...new Set(git(root,['ls-files','-c','-o','--exclude-standard','-z']).split('\0').filter(Boolean))].sort();
  const archive={},sourceFiles=[];
  for(const path of candidatePaths){
    if(!snapshotAllowed(path)||!existsSync(resolve(root,path)))continue;
    if(!lstatSync(resolve(root,path)).isFile())fail(`源码不能使用链接 ${path}`);
    const bytes=readFileSync(resolve(root,path));assertNoSecret(path,bytes);
    archive[path]=[bytes,{mtime:new Date('2000-01-01T00:00:00Z')}];sourceFiles.push(describe(path,bytes));
  }
  const snapshot={status:'restricted-working-source-snapshot-not-complete-corresponding-source',files:sourceFiles,
    treeHash:sha256(encode(sourceFiles)),archivePath:'open-source/working-source.zip'};
  const archiveBytes=Buffer.from(zipSync(archive,{level:6}));
  snapshot.archive=describe(snapshot.archivePath,archiveBytes);await put(snapshot.archivePath,archiveBytes);
  const fingerprint=fingerprintBuildInputs(root);
  const buildInputs=fingerprint.paths.map(path=>describe(path,readFileSync(resolve(root,path))));
  await put('open-source/build-inputs.json',encode(buildInputs));
  await put('open-source/source-snapshot.json',encode(snapshot));
  const origin=git(root,['remote','get-url','origin']).trim().replace(/^(https:\/\/)[^/@]+@/,'$1');
  if(!/^(?:git@github\.com:|https:\/\/github\.com\/)Orua\/WebCAD(?:\.git)?$/.test(origin))fail('请先核对公开源码仓库，禁止将私有 remote 写入分发');
  const source={...identity,repository:'https://github.com/Orua/WebCAD',
    baseCommitUrl:`https://github.com/Orua/WebCAD/tree/${identity.commit}`,
    baseCommitIsExactWorkingSource:!identity.dirty,
    exactWorkingSource:'source-snapshot.json 和 working-source.zip 以逐文件 SHA-256 标识所收录的工作字节；不是 HEAD 链接或完整第三方源声明。',
    buildInputs:'open-source/build-inputs.json',snapshot:'open-source/source-snapshot.json',
    toolchain:{node:process.version,vite:packageAt(root,'vite').metadata.version},
    rebuild:'解压工作源码；安装匹配 package-lock 的依赖；npm run build。缺失的静态资源、服务/宿主与第三方内核源码须按 gaps 补齐；未证明逐字节可复现。',gaps};
  await put('open-source/build-source.json',encode(source));
  const artifacts=walk(outputDirectory).filter(p=>!p.startsWith('open-source/')&&p!=='open-source-notices.html'&&p!=='cad-viewer/open-source-notices.html')
    .map(path=>describe(path,readFileSync(resolve(outputDirectory,path))));
  const inventory={schemaVersion:1,identity,packages:[...packages.values()].sort((a,b)=>(a.name+'@'+a.version).localeCompare(b.name+'@'+b.version)),components,artifacts,runtimes:runtimeEvidence(root,artifacts),gaps};
  await put('open-source/inventory.json',encode(inventory));
  const rows=inventory.packages.map(p=>`<tr><td>${escape(p.name)}</td><td>${escape(p.version)}</td><td>${escape(p.declaredLicense)}</td><td>${escape(p.scope.join(', '))}</td><td>${p.licenseFiles.map(f=>`<a href="./${escape(f.path)}">${escape(f.path.split('/').at(-1))}</a>`).join(' · ')}</td></tr>`).join('');
  const retained=components.map(c=>`<li>${escape(c.name)} — ${escape(c.version)} — ${escape(c.license)}：${c.licenseFiles.map(f=>`<a href="./${escape(f.path)}">${escape(f.path.split('/').at(-1))}</a>`).join(' · ')}</li>`).join('');
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"><title>WebCAD 开源许可与构建源码</title><style>body{max-width:1120px;margin:2rem auto;padding:0 1rem;font:16px/1.7 system-ui;color:#243246;background:#fafbfc}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd4dd;padding:.5rem;text-align:left}code,td{overflow-wrap:anywhere}a{color:#1259a0}.warning{background:#fff1d1;padding:1rem}pre{white-space:pre-wrap}</style></head><body><a href="./">返回 WebCAD</a><h1>开源许可与构建源码</h1><p class="warning">本页为工程证据，不是法律合规结论。保留原始版权、各文件许可及既有组合分发声明；不将所有新增代码统一改为 GPL。完整第三方对应源尚有缺口。</p><p>Build ID：<code>${escape(identity.buildId)}</code><br>工作源码 SHA-256：<code>${identity.sourceHash}</code><br>基础提交：<a href="${escape(source.baseCommitUrl)}">${identity.commit}</a>（${identity.dirty?'working：该提交不等于当前工作字节':'Git 工作输入未修改；仍以指纹和快照为准'}）</p><ul>${documents.map(f=>`<li><a href="./open-source/${f}">${f}</a></li>`).join('')}<li><a href="./open-source/inventory.json">实际构建依赖、分发文件 SHA-256 清单</a></li><li><a href="./open-source/build-source.json">构建来源及缺口</a></li><li><a href="./open-source/build-inputs.json">完整 build identity 输入指纹</a></li><li><a href="./open-source/source-snapshot.json">受限源码快照逐文件清单</a> · <a href="./open-source/working-source.zip">下载工作源码快照（不含全部第三方内核）</a></li></ul><h2>实际安装包与构建模块图</h2><p>browser-bundled 来自 Vite 主构建与 Worker 模块图；local-node/build-tool 不属于浏览器运行库。安装包原文中的版权及 NOTICE 保持不变。声明的 npm 依赖并不自动等于浏览器实际打包依赖。</p><table><thead><tr><th>组件</th><th>安装版本</th><th>声明许可</th><th>范围</th><th>完整原文</th></tr></thead><tbody>${rows}</tbody></table><h2>内嵌组件与保留声明</h2><p>Manifold: Copyright 2021 The Manifold Authors. — Apache-2.0；使用 Open CASCADE Technology，保留 LGPL 及原有 exception，不将旧 exception 当作当前内核版本的证明。</p><ul>${retained}</ul><h2>未齐材料与验证边界</h2><ul>${gaps.map(g=>`<li><strong>${escape(g.id)} (${escape(g.status)})</strong>：${escape(g.detail)}</li>`).join('')}</ul></body></html>\n`;
  await put('open-source-notices.html',html);
  await put('cad-viewer/open-source-notices.html','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>WebCAD 开源许可</title><a href="../open-source-notices.html">查看本次 WebCAD 构建的完整开源许可与源码材料</a></html>\n');
  if(readBuildIdentity(root).buildId!==identity.buildId)fail('生成过程中源码已变化，请重新构建');
  await put('open-source/manifest.json',encode({schemaVersion:1,identity,files:[...written.values()].sort((a,b)=>a.path.localeCompare(b.path))}));
  return inventory;
}

export async function verifyOpenSource({root,outputDirectory,requireHomeLink=true}){
  root=resolve(root);outputDirectory=resolve(outputDirectory);
  const load=async path=>parse(await readFile(resolve(outputDirectory,safePath(path))));
  const manifest=await load('open-source/manifest.json');
  const identity=readBuildIdentity(root);
  if(JSON.stringify(manifest.identity)!==JSON.stringify(identity))fail('开源清单 build identity 过期');
  const paths=new Set();
  for(const file of manifest.files){
    safePath(file.path);
    if(paths.has(file.path))fail(`清单重复 ${file.path}`);paths.add(file.path);
    const bytes=await readFile(resolve(outputDirectory,file.path));
    if(bytes.length!==file.sizeBytes||sha256(bytes)!==file.sha256)fail(`文件哈希不匹配 ${file.path}`);
  }
  const actualMaterials=walk(outputDirectory).filter(p=>p.startsWith('open-source/')||p==='open-source-notices.html'||p==='cad-viewer/open-source-notices.html');
  if(actualMaterials.some(p=>p!=='open-source/manifest.json'&&!paths.has(p))||actualMaterials.length!==paths.size+1)fail('开源材料存在未登记或遗留文件');
  const inventory=await load('open-source/inventory.json'),source=await load('open-source/build-source.json');
  if(JSON.stringify(inventory.identity)!==JSON.stringify(identity)||source.buildId!==identity.buildId||source.sourceHash!==identity.sourceHash)fail('源码/依赖清单身份不一致');
  if(source.baseCommitUrl!==`https://github.com/Orua/WebCAD/tree/${identity.commit}`||source.baseCommitIsExactWorkingSource!==!identity.dirty)fail('基础提交被冒称工作源码');
  if(JSON.stringify(inventory.gaps)!==JSON.stringify(gaps)||JSON.stringify(source.gaps)!==JSON.stringify(gaps))fail('源码缺口声明遗漏');
  const fingerprint=fingerprintBuildInputs(root),buildInputs=await load('open-source/build-inputs.json');
  const expectedInputs=fingerprint.paths.map(path=>describe(path,readFileSync(resolve(root,path))));
  if(JSON.stringify(buildInputs)!==JSON.stringify(expectedInputs))fail('build identity 输入指纹不匹配');
  for(const document of documents){
    if(!readFileSync(resolve(root,document)).equals(await readFile(resolve(outputDirectory,'open-source',document))))fail(`许可文档过期 ${document}`);
  }
  for(const file of walk(resolve(root,'LICENSES'))){
    if(!readFileSync(resolve(root,'LICENSES',file)).equals(await readFile(resolve(outputDirectory,'open-source/LICENSES',file))))fail(`保留许可过期 ${file}`);
  }
  for(const name of browserPackages)if(!inventory.packages.some(p=>p.name===name&&p.scope.includes('browser-bundled')))fail(`缺少构建依赖 ${name}`);
  const lock=parse(readFileSync(resolve(root,'package-lock.json')));
  for(const item of inventory.packages){
    const {directory,metadata}=packageAt(root,item.name),entry=lock.packages['node_modules/'+item.name];
    if(metadata.version!==item.version||metadata.license!==item.declaredLicense||entry.version!==item.version||item.lock.integrity!==(entry.integrity||null))fail(`安装版本或许可变化 ${item.name}`);
    const base='open-source/packages/'+item.name.replaceAll('/','__')+'@'+item.version+'/';
    const expected=['package.json',...licenseFiles(directory,item.name)].sort();
    if(JSON.stringify(item.licenseFiles.map(f=>f.path.slice(base.length)).sort())!==JSON.stringify(expected))fail(`安装包许可/NOTICE 未齐 ${item.name}`);
    for(const file of expected){
      if(!readFileSync(resolve(directory,file)).equals(await readFile(resolve(outputDirectory,base,file))))fail(`安装包许可内容被改写 ${item.name}/${file}`);
    }
    for(const file of item.modules){
      if(!item.scope.includes('browser-bundled')||sha256(readFileSync(resolve(directory,safePath(file.path))))!==file.sha256)fail(`构建模块字节变化 ${item.name}`);
    }
  }
  const artifacts=walk(outputDirectory).filter(p=>!p.startsWith('open-source/')&&p!=='open-source-notices.html'&&p!=='cad-viewer/open-source-notices.html').map(path=>describe(path,readFileSync(resolve(outputDirectory,path))));
  if(JSON.stringify(artifacts)!==JSON.stringify(inventory.artifacts))fail('实际 dist 文件增删或哈希变化');
  if(JSON.stringify(runtimeEvidence(root,artifacts))!==JSON.stringify(inventory.runtimes))fail('内核运行文件来源不匹配');
  for(const component of inventory.components){
    if(sha256(readFileSync(resolve(root,safePath(component.input.path))))!==component.input.sha256)fail(`组件输入变化 ${component.name}`);
  }
  const snapshot=await load('open-source/source-snapshot.json'),archive=unzipSync(await readFile(resolve(outputDirectory,snapshot.archivePath)));
  if(snapshot.treeHash!==sha256(encode(snapshot.files))||Object.keys(archive).length!==snapshot.files.length)fail('源码 ZIP 清单不匹配');
  const candidates=[...new Set(git(root,['ls-files','-c','-o','--exclude-standard','-z']).split('\0').filter(path=>path&&snapshotAllowed(path)&&existsSync(resolve(root,path))))].sort();
  if(JSON.stringify(snapshot.files.map(f=>f.path))!==JSON.stringify(candidates))fail('工作源码快照遗漏或过期');
  for(const file of snapshot.files){
    safePath(file.path);
    const bytes=Buffer.from(archive[file.path]||[]);
    if(!snapshotAllowed(file.path)||sha256(bytes)!==file.sha256||bytes.length!==file.sizeBytes||!bytes.equals(readFileSync(resolve(root,file.path))))fail(`源码 ZIP 不匹配 ${file.path}`);
    assertNoSecret(file.path,bytes);
  }
  const page=await readFile(resolve(outputDirectory,'open-source-notices.html'),'utf8');
  if(!page.includes(identity.buildId)||!page.includes(identity.sourceHash))fail('许可页面 identity 不匹配');
  for(const [,href] of page.matchAll(/href="([^"]+)"/g)){
    if(href==='./'||href.startsWith('https://'))continue;
    if(!existsSync(resolve(outputDirectory,safePath(href.replace(/^\.\//,'')))))fail(`许可页面链接失效 ${href}`);
  }
  if(requireHomeLink){
    const home=await readFile(resolve(outputDirectory,'index.html'),'utf8');
    if(!/<a\b[^>]*\bhref=["']\.\/open-source-notices\.html["']/i.test(home))fail('首页缺少 ./open-source-notices.html 链接');
  }
  return {buildId:identity.buildId,packages:inventory.packages.length,materials:paths.size,sourceFiles:snapshot.files.length,gaps:inventory.gaps};
}

export function openSourcePlugin(root,identity){
  const modules=new Set();let outputDirectory,worker=false,buildFailed=false;
  const collector=()=>({
    name:'webcad-open-source-module-collector',
    generateBundle(){for(const id of this.getModuleIds())modules.add(id);},
  });
  return {
    ...collector(),name:'webcad-open-source-distribution',
    config(){return {worker:{plugins:()=>[collector()]}};},
    configResolved(config){outputDirectory=resolve(config.root,config.build.outDir);worker=Boolean(config.isWorker);},
    buildEnd(error){buildFailed=Boolean(error);},
    closeBundle:{order:'post',sequential:true,async handler(){
      if(!worker&&!buildFailed)await generateOpenSource({root,outputDirectory,identity,moduleIds:[...modules]});
    }},
  };
}
