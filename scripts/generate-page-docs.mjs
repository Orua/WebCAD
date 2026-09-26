import { mkdir, writeFile, copyFile, readFile, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createStaticPageApiIndex, getTool, infoMetadata, readDocs, searchTools } from '../src/page-api-docs.js';
import { UI_API_ROUTES, requireUIRoute } from '../src/ui-api-coverage.js';
import { TOOL_CATEGORIES } from '../src/ui-toolbars.js';
import { UI_LAYOUT } from '../src/ui-layout.js';
import { CONNECTION_POLICY } from '../src/automation-guidance.js';
import { generateAgentEntry } from './generate-agent-entry.mjs';
import { generateAgentKit } from './generate-agent-kit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public', 'automation');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',cwd:root}).trim();
const dirty=!!execFileSync('git',['status','--porcelain'],{encoding:'utf8',cwd:root}).trim();
const metadata = infoMetadata({buildId:`${commit}${dirty?'-working':''}`});
const cards = [];
let cursor;
do {
  const page = searchTools({ query: '', limit: 50, ...(cursor ? { cursor } : {}) });
  cards.push(...page.items.map(item => getTool({ id: item.id })));
  cursor = page.nextCursor;
} while (cursor);
const docs = Object.fromEntries(metadata.docs.map(docId => {
  let cursor,text='';do{const page=readDocs({docId,limitChars:16000,...(cursor?{cursor}:{})});text+=page.text;cursor=page.nextCursor;}while(cursor);
  return [docId,text];
}));
const docHashes = Object.fromEntries(metadata.docs.map(docId => [docId, readDocs({docId,limitChars:1000}).docsHash]));
// Refuse a new UI action without a discoverable public interface.
const uiSource=await readFile(resolve(root,'src/ui.js'),'utf8');
for(const match of uiSource.matchAll(/\b(?:emit|run)\('([^']+)'/g))requireUIRoute(match[1]);
for(const groups of Object.values(TOOL_CATEGORIES))for(const [,actions] of groups)for(const action of actions)requireUIRoute(action);
for(const item of UI_LAYOUT.header)requireUIRoute(item.action);
for(const control of Object.values(UI_LAYOUT.controls))for(const [,value] of control.items)requireUIRoute(control.action||value);
for(const [action,route] of Object.entries(UI_API_ROUTES))for(const id of route.tools){
  if(!cards.some(card=>card.id===id))throw new Error(`UI action ${action} lacks public tool documentation: ${id}`);
}
const index = { generatedFrom: 'src/page-api-docs.js and src/operation-registry.js',
  metadata, cards, docs };
await mkdir(target, { recursive: true });
await writeFile(resolve(target, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
await writeFile(resolve(target, 'index.md'), createStaticPageApiIndex(), 'utf8');
await mkdir(resolve(target,'tools'),{recursive:true});
await mkdir(resolve(target,'docs'),{recursive:true});
for(const [folder,expected] of [['tools',new Set(cards.map(card=>card.id+'.json'))],['docs',new Set(Object.keys(docs).map(id=>id+'.md'))]]){
  for(const name of await readdir(resolve(target,folder))){if(!expected.has(name)&&name.endsWith(folder==='tools'?'.json':'.md'))await unlink(resolve(target,folder,name));}
}
for(const card of cards)await writeFile(resolve(target,'tools',card.id+'.json'),JSON.stringify(card,null,2)+'\n');
for(const [id,text] of Object.entries(docs))await writeFile(resolve(target,'docs',id+'.md'),'# '+id+'\n\n'+text+'\n');
const manifest={version:metadata.pageApiVersion,buildId:metadata.buildId,searchVersion:metadata.discovery.searchVersion,catalogHash:metadata.catalogHash,docsHash:metadata.docsHash,
  apiMethods:[...(metadata.methods||[])],
  tools:cards.map(c=>({id:c.id,title:c.title,label:c.label,category:c.category,version:c.version,docsHash:c.docsHash,url:'tools/'+c.id+'.json'})),
  docs:Object.keys(docs).map(id=>({id,docsHash:docHashes[id],url:'docs/'+id+'.md'})),
  cache:{scope:'static contracts and docs only',removeMissingIds:true,validateWith:'window.webcad.api.connect'},
  downloads:{markdown:'knowledge.md',json:'index.json',library:'tool-library.mjs'}};
await writeFile(resolve(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const knowledge=['# WebCAD AI 完整知识库',`API ${metadata.pageApiVersion} · ${metadata.catalogHash}`,
  '这是一份构建时的完整快照。调用前读取页面 info() 对比版本和目录哈希；变化时更新相关工具卡。尺寸单位 mm。',
  ...Object.entries(docs).map(([id,text])=>'## '+id+'\n\n'+text),
  ...cards.map(c=>'## 工具 '+c.id+' · '+c.title+'\n\n```json\n'+JSON.stringify(c,null,2)+'\n```')].join('\n\n')+'\n';
await writeFile(resolve(target,'knowledge.md'),knowledge);
const quickstart = [
  '# WebCAD AI 连接与工具发现', '',
  '首次使用：[AGENT 从这里开始](agent-start.html) · [机器可读入口](agent-start.json) · [本地安装包](agent-kit.json) · [真实操作路由](routes.json)。首次握手的 onboarding 返回相同入口。', '',
  CONNECTION_POLICY, '',
  '## 先选后台通道', '',
  '本地可搜索目录：[操作 API 目录](index.html)，按关键词和分类查找页面方法与工具契约；原始索引：[manifest.json](manifest.json)。', '',
  '当前 Codex Chrome/IAB 开发宿主：绑定目标标签页后检查 tab.capabilities.list()；若提供 cdp，先读 (await tab.capabilities.get("cdp")).documentation()，确认允许当前任务后用 Runtime.evaluate（awaitPromise:true、returnByValue:true）调用公开 API。只读 DOM evaluate 与该能力不同；不要直接改用填表。其他宿主使用其实际支持的授权脚本通道。完整说明：[api.connection](docs/api.connection.md)。', '',
  '## 一次读取状态、相关完整卡与批次说明', '',
  '将下面表达式交给已确认的页面脚本通道；按任务替换能力词。无需点击页面、读取全目录或构造查询用的 run 批次。', '',
  '```js',
  'JSON.stringify((()=>{',
  '  const api = window.webcad.api;',
  '  return {',
  '    connection: api.connect({queries:["需要的能力关键词"],limit:2,includeContracts:true}),',
  '    run: api.readDocs({docId:"api.run"})',
  '  };',
  '})())',
  '```', '',
  '- connect 使用 queries:[字符串]；searchTools 使用 query:字符串。不要混用。',
  '- 已知工具用 connect({toolIds:["advancedLoft","transform"]})，直接返回完整卡与实时上下文。模板用 template.* 单独读卡，按卡内 minimalExample 执行 quickModel。',
  '- 检查 canExecute/blockers/nextAction；ready 仅代表内核已加载。页面缺少 connect 时先报告旧版本，不沿用旧 action/execute/ready，也不自动刷新工程。',
  '- 完整卡已在 connection.contracts.items[].card；不要再逐项 getTool。补充工具用 getTools({ids:[实际ID]}) 批量读取，已知 ID 可直接读卡。',
  '- queries 最多4项，支持中英文；每项默认返回5个候选。includeContracts:true 可连同前20个命中卡一次取回。',
  '- 搜索是候选排序，不是执行计划。依据完整卡核对参数、约束及可用性；未知 ID 逐项返回错误。',
  '- 建模使用 api.run 的 add/execute 步骤；返回的 connection.requestContext 可用于请求，后续实体用 $ref 引用回执。查询面边后再决定操作时重新核对 revision。',
  '- CDP 异步表达式使用 (async()=>JSON.stringify(await window.webcad.api.run(请求对象)))()，并设置 awaitPromise:true；不要直接使用顶层 await。',
  '- 检查逐步 status、partial/unknown 和 displayMatchesContext；批次不是全有全无事务。',
  '- [建模与失败恢复流程](docs/api.workflow.md)：复杂模型分部件规划、每批最多20步、测量关键尺寸并检查画面。失败时按 progress 和 recovery 只规划剩余步骤，不重复创建已经提交的部件。',
  '- 已持有完整卡时传 getTools 的 knownHashes，未变只返回 not_modified。文档可传 knownHash。禁止缓存工程状态、实体/面边编号作为下一次操作依据。',
  '- 可选离线库：[index.json](index.json) + [tool-library.mjs](tool-library.mjs)。下载由宿主持久保存，按 catalogHash/docsHash 更新，检索后只读取所需内容。不要把全库送入模型上下文。',
  '- 完整缓存说明：[api.discovery](docs/api.discovery.md)。无页面脚本能力时，目录：[manifest.json](manifest.json)；执行仍需宿主实际支持的通道。', '',
  '- 可下载 [WebCAD Agent Skill](webcad-page-api/SKILL.md)，由宿主安装一次以便新任务发现；网页不会自动安装技能或服务。', '',
].join('\n');
await writeFile(resolve(target, 'quickstart.md'), quickstart, 'utf8');
await copyFile(resolve(root,'src/tool-discovery.js'),resolve(target,'tool-library.mjs'));
await mkdir(resolve(target,'webcad-page-api'),{recursive:true});
await copyFile(resolve(root,'skills/webcad-page-api/SKILL.md'),resolve(target,'webcad-page-api/SKILL.md'));
console.log(`Generated ${cards.length} page cards in ${target}`);

await copyFile(resolve(root,'docs/examples/page-api-plate.js'),resolve(target,'page-api-plate.js'));
await copyFile(resolve(root,'docs/examples/frame-placement.js'),resolve(target,'frame-placement.js'));
await mkdir(resolve(root,'public','docs'),{recursive:true});
await copyFile(resolve(root,'docs/USER-GUIDE.zh-CN.md'),resolve(root,'public','docs','USER-GUIDE.zh-CN.md'));
await generateAgentKit({root,target,metadata,routes:UI_API_ROUTES});
await generateAgentEntry({root,target,metadata});
