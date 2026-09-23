async (page) => {
  const context=await page.context().browser().newContext();page=await context.newPage();
  // Separate UI regression: simulate a browser without the optional save-picker capability.
  // No fake permission/handle and no acceptance of an unsaved-replacement confirmation.
  await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined}));
  await page.goto('http://127.0.0.1:17670/');await page.waitForFunction(()=>window.webcad?.api.getState().summary?.kernelReady);
  await page.evaluate(async()=>{
    const a=window.webcad.api,card=a.getTool({id:'box'}),{revision,...c}=a.getState().context;
    const r=await a.execute({context:{...c,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),action:'feature.add',args:{op:'box',opVersion:card.version,schemaHash:card.schemaHash,params:{width:16,depth:12,height:3},refs:[]}});if(r.status!=='committed')throw new Error(JSON.stringify(r));
  });
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'保存工程',exact:true}).click();
  const file=await download;await file.saveAs('F:/Project/WebCAD/agent/output/page-api/ui-downloaded.webcad');
  const after=await page.evaluate(()=>window.webcad.api.getState());if(!after.summary.dirty)throw new Error('Download falsely cleared dirty');
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'新建',exact:true}).click();
  const rejected=await page.evaluate(()=>window.webcad.api.getState());if(rejected.context.revision!==after.context.revision)throw new Error('Dismissed replacement mutated model');
  await page.getByRole('button',{name:'页面 API',exact:false}).click();
  const help=await page.getByRole('dialog').innerText();if(!help.includes('window.webcad.api')||help.includes('127.0.0.1:667/mcp'))throw new Error('Wrong UI discovery entry');
  await page.getByRole('button',{name:'知道了',exact:true}).click();
  await page.screenshot({path:'F:/Project/WebCAD/agent/output/page-api/ui-regression.png'});
  await context.close();return{downloadName:file.suggestedFilename(),afterDownload:after,afterDismiss:rejected,help};
}
