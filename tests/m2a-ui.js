// Separate developer UI regression. Not part of MCP-only product acceptance.
async (page) => {
  const browser=page.context().browser(),first=await browser.newContext(),second=await browser.newContext();
  const ui=await first.newPage(),reopen=await second.newPage();
  const errors=[];for(const tab of [ui,reopen])tab.on('pageerror',error=>errors.push(error.message));
  try{
    await ui.goto('http://127.0.0.1:17668/');
    await ui.waitForFunction(()=>window.webcad?.getState().kernelReady&&!window.webcad.getState().busy);
    await ui.getByRole('tab',{name:'创建',exact:true}).click();await ui.getByRole('button',{name:'长方体',exact:true}).click();
    const dialog=ui.getByRole('dialog');for(const [name,value]of [['宽度','10'],['深度','8'],['高度','4']])await dialog.getByRole('spinbutton',{name,exact:true}).fill(value);
    await dialog.getByRole('button',{name:'确定',exact:true}).click();await ui.waitForFunction(()=>window.webcad.getState().document.features.length===1&&!window.webcad.getState().busy);
    const original=await ui.evaluate(()=>window.webcad.getState());if(Math.abs(original.bodies[0].volume-320)>.01)throw new Error('UI box volume incorrect');
    const download=ui.waitForEvent('download');await ui.getByRole('button',{name:'保存工程',exact:true}).click();await (await download).saveAs('F:/Project/WebCAD/agent/output/m2a/ui/ui-box.webcad');
    if(!(await ui.evaluate(()=>window.webcad.getState().dirty)))throw new Error('Browser download must not claim verified disk save');
    await reopen.goto('http://127.0.0.1:17668/');await reopen.waitForFunction(()=>window.webcad?.getState().kernelReady&&!window.webcad.getState().busy);
    const [chooser]=await Promise.all([reopen.waitForEvent('filechooser'),reopen.getByRole('button',{name:'打开',exact:true}).click()]);await chooser.setFiles('F:/Project/WebCAD/agent/output/m2a/ui/ui-box.webcad');
    await reopen.waitForFunction(()=>window.webcad.getState().document.features.length===1&&!window.webcad.getState().busy);
    const loaded=await reopen.evaluate(()=>window.webcad.getState());if(loaded.document.documentId!==original.document.documentId||Math.abs(loaded.bodies[0].volume-320)>.01||loaded.dirty)throw new Error('UI native reopen failed');
    if(errors.length)throw new Error(errors.join('\n'));
    await reopen.screenshot({path:'F:/Project/WebCAD/agent/output/m2a/ui/ui-reopen.png'});
    return {status:'pass',category:'UI_ONLY',nativeRoundtrip:true,browserDownloadKeepsDirty:true,volume:loaded.bodies[0].volume,pageErrors:errors};
  }finally{await first.close();await second.close();}
}
