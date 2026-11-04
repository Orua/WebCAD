import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const json=async p=>JSON.parse(await readFile(join(root,p),'utf8'));
// These are candidates with reasons, not automatic geometry plans.
export function routeTask(text){
 const q=String(text).toLowerCase().replace(/(?:不要|不做|禁止)[^，,。；;]*[，,。；;]?/g,''),matches=[];let exportFormat=null;
 const add=(id,branch,reason)=>{if(!matches.some(x=>x.id===id&&x.branch===branch))matches.push({id,branch,reason});};
 if(/复刻|源图|图纸重建|实物重建|按.{0,4}图.{0,4}建模/.test(q))add('source-reconstruction','source','bind product/revision/views before geometry');
 if(/工程图|三视图|标注图|投影图/.test(q))add('drawings','drawing','derive views and annotations from current geometry');
 if(/轮廓修复|断点修复/.test(q))add('profiles-2d','repair','repair only explicit source issue within allowed movement');
 else if(/轮廓偏移|等距偏移/.test(q))add('profiles-2d','offset','preserve analytic curves and explicit offset semantics');
 else if(/dxf|二维轮廓|切割轮廓|解析轮廓/.test(q))add('profiles-2d','read','separate closed material contours and open markings');
 if(/cnc|刀具|型腔|机加工/.test(q))add('manufacturing','cnc','process-specific evidence, no unsupported CAM claim');
 else if(/拔模|倒扣|压铸|注塑/.test(q))add('manufacturing','molding','confirmed pull and applicable rules');
 else if(/钣金|折弯|冲压|展开料/.test(q))add('manufacturing','sheet','thickness and bend conventions; projection is not unfold');
 if(/打印检查|可打印|支撑检查|悬垂/.test(q))add('printability','inspect','actual mesh scale and supported measurements');
 if(/估重|克重|密度|计算重量/.test(q))add('material-properties','mass','physical material differs from render appearance');
 if(/标准件|轴承|供应商模型/.test(q))add('part-reuse','import','trace exact part identity before importing');
 if(/圆周阵列|周向阵列|分度/.test(q))add('part-reuse','circular','count axis phase and independent bodies');
 else if(/线性阵列|等距复制|重复件/.test(q))add('part-reuse','linear','repeat intended geometry without identity or merge mistakes');
 if(/切片|发到打印机|供应商下单|制造交接|机器人.{0,5}仿真/.test(q))add('handoff','artifacts','external consumer actions are separate capabilities and authorization');
 if(/param_schema_invalid|param_range_invalid|revision_conflict|stale_reference|ambiguous_selection|geometry_invalid|超时|断线|没出现|不见了|失败|扭转|零厚度/.test(q))return {matches:[],problem:true,reason:'diagnose before retry',needsClarification:false};
 if(/导出|输出.{0,8}(step|stl|文件)|\bexport\b/.test(q)){
  exportFormat=/\bstl\b/.test(q)?'stl':/\b(step|stp)\b/.test(q)?'step':null;
  add('inspection',exportFormat,'format must be explicit; STEP and STL differ');
 }
 if(/截图|视图|剖切|看背面/.test(q))add('inspection','visual','choose a view that exposes affected geometry, then exact checks');
 if(/导入/.test(q))add('editing','import','preserve source identity, confirm units and actual imported geometry');
 if(/保存|\bsave\b/.test(q))add('inspection','save','project persistence differs from geometry export');
 if(/测量|检查|检验|验收|量一下|量孔|\bmeasure\b/.test(q))add('inspection','measure','choose evidence matching dimensions');
 if(/修改|改成|加深|减浅|加厚|变薄|已有模型|撤销|恢复/.test(q))add('editing',/撤销/.test(q)?'undo':'edit','preserve current model and unaffected structure');
 if(/倒角|\bchamfer\b|c\s*[0-9]/.test(q))add('finishing','chamfer','C is a bevel, not radius R');
 else if(/圆角|\bfillet\b|r\s*[0-9]/.test(q))add('finishing','fillet','confirm exact radius and edge scope');
 if(/沉头|沉孔|锥孔|斜底孔/.test(q))add('cut-features','wizard','special hole type requires explicit entrance and bottom');
 else if(/打.{0,10}孔|钻.{0,10}孔|开孔|通孔|盲孔|双孔|两孔|多孔|四孔|孔位|\bhole\b/.test(q))add('cut-features',/两个|双孔|两孔|多孔|四孔|[2-9]\s*个|多处|阵列/.test(q)?'multi-hole':'plain-hole','hole depth, direction and through condition come from source');
 else if(/挖槽|切除|布尔|去料/.test(q))add('cut-features','boolean','target first, explicit tool region');
 if(/轴套|垫圈|圆筒|空心圆柱|\btube\b/.test(q))add('axisymmetric','tube','coaxial straight tube only if wall geometry agrees');
 else if(/铆钉|铆柱|柱脚|圆柱|轴对称|旋转体|\bcylinder\b/.test(q))add('axisymmetric',/带头|钉头|台阶|盲孔|腰槽|旋转体/.test(q)?'revolve':'cylinder','decompose head, shaft, steps and cavities before template choice');
 if(/扫掠|弯线|方线|线材|沿.{0,6}路径|\bsweep\b/.test(q))add('path-section','sweep','section and path must match source');
 if(/放样|多截面|截面过渡|\bloft\b/.test(q))add('transition',/引导/.test(q)?'guided':'loft','ordered sections and correspondence');
 if(/对齐|定位|装配|拼合|融合|合并实体/.test(q))add('placement',/融合|合并实体|拼合/.test(q)?'join':'align','check manufactured part identity and functional datums');
 if(/logo|字母|字形|标志|刻字/.test(q))add('logo','contours','review actual glyph source and target face');
 if(/拉伸|板件|矩形板|安装板|底片|圆片|轮廓/.test(q)&&!matches.some(x=>['axisymmetric','path-section','logo'].includes(x.id)))add('solid-section',/轮廓|拉伸/.test(q)?'profile':'box','choose actual section before construction');
 return {matches,problem:false,exportFormat,needsClarification:matches.length===0||matches.some(x=>x.id==='inspection'&&x.branch===null),requiresGeometryConfirmation:true};
}
export async function load(task='',options={}){
 const cat=await json('catalog.json');
 if(options.tool){const index=await json('tools/index.json'),card=index.find(c=>c.id===options.tool);if(!card)throw Error('Unknown bundled tool '+options.tool);const content=await readFile(join(root,card.file),'utf8');if(content.length>(options.maxChars??cat.loading.maxContextChars))throw Object.assign(Error('CONTEXT_BUDGET_EXCEEDED: explicit larger maxChars required for this complete card'),{files:[{file:card.file,chars:content.length}]});return {task,phase:'single-complete-card',matches:[],files:[card.file],toolIds:[card.id],contextChars:content.length,content};}
 const r=options.problem?{matches:[],problem:true,needsClarification:false}:options.route?{matches:[{id:options.route,branch:options.branch??null,reason:'explicit route selection'}],needsClarification:!options.branch}:routeTask(task);
 const files=['SKILL.md','GUIDE.md'];const toolIds=[];
 if(r.problem)files.push('problems/diagnosis.md','methods/verification.md');
 else{files.push('methods/construction-choice.md');for(const hit of r.matches){const route=cat.routes.find(x=>x.id===hit.id);if(!route)throw Error('Unknown route '+hit.id);files.push(route.entry,...route.methodDependencies);if(options.tools){const branch=route.branches.find(b=>b.id===hit.branch);if(!branch)throw Error('Choose one branch before loading tools: '+route.branches.map(x=>x.id).join(', '));toolIds.push(...branch.tools);}}}
 if(!r.problem&&!r.matches.length)files.push('methods/brief-and-datums.md');
 if(options.tools)files.push(...[...new Set(toolIds)].map(id=>'tools/cards/'+id+'.json'));
 const parts=await Promise.all([...new Set(files)].map(async file=>({file,text:await readFile(join(root,file),'utf8')})));
 const content=parts.map(p=>'## '+p.file+'\n'+p.text).join('\n\n'),limit=options.maxChars??cat.loading.maxContextChars;
 if(content.length>limit){const e=Error('CONTEXT_BUDGET_EXCEEDED: select narrower route/tool; complete schemas are never truncated');e.files=parts.map(p=>({file:p.file,chars:p.text.length}));throw e;}
 return {...r,task,files:parts.map(p=>p.file),toolIds:[...new Set(toolIds)],contextChars:content.length,content};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),opt={},text=[];for(let i=0;i<args.length;i++){if(args[i]==='--tools')opt.tools=true;else if(['--route','--branch','--problem','--tool','--max-chars'].includes(args[i])){const k=args[i].slice(2);opt[k==='max-chars'?'maxChars':k]=k==='max-chars'?Number(args[++i]):args[++i];}else text.push(args[i]);}
 try{console.log(JSON.stringify(await load(text.join(' '),opt),null,2));}catch(e){console.error(JSON.stringify({error:e.message,files:e.files}));process.exitCode=1;}
}
