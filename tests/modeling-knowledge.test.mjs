import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MODELING_DOCS,MODELING_ROUTES} from '../src/modeling-guidance.js';
import {discoveryMetadata,readDocs,getTool} from '../src/page-api-docs.js';
import {syncKnowledge,routeKnowledge,readLocalKnowledge} from '../skills/webcad-page-api/scripts/knowledge-cache.mjs';

test('modeling docs and branches resolve against the current page, not historical cards',()=>{
  const onboarding=discoveryMetadata().onboarding;
  assert.equal(onboarding.knowledge.modeling.entryDocId,'api.modeling.start');
  assert(!JSON.stringify(onboarding).includes(MODELING_DOCS['api.modeling.guide']));
  for(const [id,text] of Object.entries(MODELING_DOCS)){
    assert.equal(readDocs({docId:id,limitChars:16000}).text,text,id);
    for(const match of text.matchAll(/\]\((api\.modeling\.[^)]+)\)/g))assert(MODELING_DOCS[match[1]],match[1]);
    assert(!/scripts\/load\.mjs|tools\/cards\/|[FG]:[\\/]/.test(text),id);
  }
  for(const route of MODELING_ROUTES){
    assert(MODELING_DOCS[route.readFirst],route.id);
    for(const id of route.docs)assert(MODELING_DOCS[id],id);
    for(const branch of route.branches??[])for(const id of branch.tools)assert.equal(getTool({id}).id,id);
  }
});

test('downloaded modeling routes cover construction, process and diagnostics without bulk context',async()=>{
  const temp=process.env.WEBCAD_TEST_TMPDIR||tmpdir();
  await mkdir(temp,{recursive:true});
  const directory=await mkdtemp(join(temp,'modeling-knowledge-'));
  try{
    let downloads=0;
    const options={baseUrl:'https://example.invalid/webcad/',directory,fetchImpl:async url=>{
      downloads++;
      return new Response(await readFile(join('public/automation',new URL(url).pathname.split('/').at(-1))));
    }};
    const cache=await syncKnowledge(discoveryMetadata(),options);
    assert.equal(downloads,cache.downloadedFiles);
    assert.equal((await syncKnowledge(discoveryMetadata(),options)).cacheHit,true);
    assert.equal(downloads,cache.downloadedFiles,'unchanged complete package stays local');
    const cases=[['建立矩形板','solid-section'],['同轴空心圆筒','axisymmetric'],['方线沿路径扫掠','path-section'],['多截面放样','transition'],['在安装板上开两个通孔','cut-features'],['倒角C0.5','finishing'],['装配对齐','placement'],['刻字LOGO','logo'],['保持孔位加厚','editing'],['导出STL网格','inspection'],['按源图复刻','source-reconstruction'],['轮廓断点修复','profiles-2d'],['生成三视图工程图','drawings'],['CNC型腔刀具检查','manufacturing'],['可打印支撑检查','printability'],['轴承标准件导入','part-reuse'],['按密度计算重量估重','material-properties'],['制造交接发到打印机','handoff'],['怎么建模','plan']];
    for(const [query,id] of cases){
      const routes=await routeKnowledge(cache,query,{scope:'modeling'});
      const route=routes.find(r=>r.id==='modeling.'+id);assert(route,query);
      assert(!('text' in route));assert(!('card' in route));
      const selected=await readLocalKnowledge(cache,{docIds:[route.readFirst],maxChars:8000});
      assert.equal(selected.items.length,1);assert.equal(selected.items[0].status,'read');
      assert(selected.usedChars<8000);
    }
    for(const query of ['AMBIGUOUS_SELECTION','REVISION_CONFLICT','孔没出现导致失败','放样扭转失败','提交超时断线']){
      const route=(await routeKnowledge(cache,query,{scope:'modeling'}))[0];
      assert.equal(route.id,'modeling.diagnosis',query);
      assert.equal(route.readFirst,'api.modeling.problems.diagnosis');
    }
    const full=await readLocalKnowledge(cache,{toolIds:['hole']});
    assert.deepEqual(full.items[0].card,getTool({id:'hole'}));
    const budget=await readLocalKnowledge(cache,{docIds:['api.modeling.guide'],maxChars:1000});
    assert.equal(budget.items[0].status,'omitted');assert(!('text' in budget.items[0]));
    await assert.rejects(routeKnowledge(cache,'hole',{scope:'everything'}),{code:'KNOWLEDGE_QUERY_INVALID'});
  }finally{await rm(directory,{recursive:true,force:true});}
});
