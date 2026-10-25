// The server owns final times. Only the currently observed phase is extended
// while running; old logs never acquire invented model or tool measurements.
export function timingTotals(totalMs, snapshot, running=false){
  const total=Number.isFinite(totalMs)?Math.max(0,totalMs):null;
  if(!snapshot||snapshot.version!==1)return {totalMs:total,modelWaitMs:null,toolExecutionMs:null,unclassifiedMs:total};
  const value=name=>Math.max(0,Number.isFinite(snapshot[name])?snapshot[name]:0);
  const values={modelWaitMs:value('modelWaitMs'),toolExecutionMs:value('toolExecutionMs'),unclassifiedMs:value('unclassifiedMs')};
  const recorded=values.modelWaitMs+values.toolExecutionMs+values.unclassifiedMs;
  const resolved=Math.max(total??0,recorded);
  const phase=running&&!snapshot.complete?snapshot.phase:'unclassified';
  const key={model:'modelWaitMs',tool:'toolExecutionMs'}[phase]||'unclassifiedMs';
  values[key]+=resolved-recorded;
  return {totalMs:resolved,...values};
}

// A continuous account of observable events. Silence alone never proves thinking.
export function createTurnTimeline(startedAt){
  const start=Date.parse(startedAt),tools=new Set(),spans=[];
  let cursor=0,phase='preparing';
  function close(end){
    end=Math.max(cursor,Number.isFinite(end)?end:cursor);
    if(end>cursor){
      const last=spans.at(-1);
      if(last?.phase===phase&&last.endMs===cursor)last.endMs=end;
      else spans.push({startMs:cursor,endMs:end,phase});
    }
    cursor=end;
  }
  return {
    observe(event){
      close(Date.parse(event.time)-start);
      const sdk=event.sdkEventType||'';
      if(event.stepKind==='tool'&&event.itemId){
        if(sdk==='step/started')tools.add(event.itemId);
        if(sdk==='step/completed')tools.delete(event.itemId);
      }
      if(event.terminal){tools.clear();phase='finishing';return;}
      if(tools.size){phase='tool';return;}
      if(sdk==='step/completed'||sdk==='turn/started')phase='model';
      else if(event.type==='reasoning'&&/summaryTextDelta|plan\/delta/.test(sdk))phase='summary';
      else if(event.type==='agent'&&(event.isDelta||event.isFinal))phase='reply';
      else if(event.type==='reasoning'&&['commentary','plan','agentMessage'].includes(event.itemType))phase='summary';
      else if(sdk==='turn/completed')phase='finishing';
      else if(/compact/i.test(sdk)||event.itemType==='contextCompaction')phase=sdk==='item/completed'?'model':'compacting';
      else if(event.type==='error')phase='unknown';
    },
    read(totalMs){
      const end=Math.max(cursor,Number.isFinite(totalMs)?totalMs:cursor);
      const result=spans.map(span=>({...span}));
      const last=result.at(-1);
      if(end>cursor){if(last?.phase===phase)last.endMs=end;else result.push({startMs:cursor,endMs:end,phase});}
      return result;
    }
  };
}

export const timelineLabels={preparing:'准备 / 等待启动',model:'等待模型响应',summary:'接收思考摘要',tool:'工具执行',reply:'生成回复',compacting:'压缩上下文',finishing:'核对与收尾',unknown:'等待 / 状态未确认'};
