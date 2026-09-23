// Playwright CLI run-code --filename tests/m1-browser-regression.js
// Separate developer UI regression; NOT part of the product's zero-mouse MCP test.
async (page) => {
  await page.waitForFunction(()=>window.webcad?.getState().kernelReady&&!window.webcad.getState().busy);
  const initial=await page.evaluate(()=>window.webcad.getState());
  if(initial.document.features.length===0){
    await page.getByRole('tab',{name:'创建',exact:true}).click();
    await page.getByRole('button',{name:'长方体',exact:true}).click();
    const dialog=page.getByRole('dialog');
    for(const [name,value]of [['宽度','50'],['深度','30'],['高度','3']])await dialog.getByRole('spinbutton',{name,exact:true}).fill(value);
    await dialog.getByRole('button',{name:'确定',exact:true}).click();
    await page.waitForFunction(()=>window.webcad.getState().document.features.length===1&&!window.webcad.getState().busy);
    await page.getByRole('tab',{name:'加工',exact:true}).click();
    await page.getByRole('button',{name:'多位置打孔',exact:true}).click();
  }
  const d=page.getByRole('dialog');
  await d.getByRole('spinbutton',{name:'孔半径',exact:true}).fill('2');
  await d.getByRole('spinbutton',{name:'孔深',exact:true}).fill('5');
  await d.getByRole('combobox',{name:'钻孔轴',exact:true}).selectOption('Z');
  await d.getByRole('combobox',{name:'钻孔方向',exact:true}).selectOption('-1');
  await d.getByRole('textbox').fill('5,5,4\n45,5,4\n5,25,4\n45,25,4');
  await d.getByRole('button',{name:'确定',exact:true}).click();
  await page.waitForFunction(()=>window.webcad.getState().document.features.length===2&&!window.webcad.getState().busy);
  const plate=await page.evaluate(()=>window.webcad.getState());
  await page.evaluate(id=>{window.__m1SavedIdentity=id;},plate.document.documentId);
  if(Math.abs(plate.bodies[0].volume-(4500-48*Math.PI))>.01)throw new Error('UI/MCP volume mismatch');
  if(plate.bodies[0].solidCount!==1)throw new Error('UI solid count mismatch');
  await page.screenshot({path:'F:/Project/WebCAD/agent/output/m1/ui-plate.png'});
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'保存工程',exact:true}).click();
  const download=await downloadEvent;await download.saveAs('F:/Project/WebCAD/agent/output/m1/ui-plate.webcad');
  console.log(JSON.stringify({status:'pass',uiVolume:plate.bodies[0].volume,documentId:plate.document.documentId,nativeSaved:true}));
}
