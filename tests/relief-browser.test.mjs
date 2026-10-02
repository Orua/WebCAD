// Propagate the caller's cache tag so a restarted dev server does not silently
// test an old module still retained by an unsaved CAD page.
const sourceVersion=new URL(import.meta.url).search;
const {readReliefImage,validateReliefSvg}=await import('../src/relief-image.js'+sourceVersion);
const {showReliefDialog}=await import('../src/ui/forms/relief-dialog.js'+sourceVersion);

// Actual browser DOM/image decoder; uses an isolated offscreen form, no second
// CAD kernel or document. Run through the authorized page development channel.
export async function runReliefBrowserTests(){
 const checks=[],check=(condition,label)=>{if(!condition)throw Error(label);checks.push(label);};
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><defs><linearGradient id="g"><stop stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="100" height="50" fill="url(#g)"/></svg>';
 const blob=new File([svg],'gradient.svg',{type:'image/svg+xml'});
 const decoded=await readReliefImage(blob,{name:blob.name,samples:17,whiteHigh:true});
 check(decoded.columns===17&&decoded.rows===9&&decoded.aspectRatio===2,'SVG viewBox aspect survives actual image decoding');
 check(decoded.values[4][0]<.1&&decoded.values[4].at(-1)>.9,'SVG gradient becomes continuously varying control heights');
 const threeByTwo=await readReliefImage(new Blob([svg.replace('100 50','150 100')]),{name:'three-by-two.svg',samples:65});
 check(threeByTwo.aspectRatio===1.5&&threeByTwo.rows===43,'exact SVG viewBox ratio survives integer raster dimensions');
 const physical=await readReliefImage(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="20mm"><rect width="100%" height="100%" fill="black"/></svg>']),{name:'physical.svg'});
 check(Math.abs(physical.aspectRatio-1.5)<1e-12,'absolute SVG physical units retain their precise ratio');
 for(const dimensions of ['width="100000" height="100000"','width="100%" height="100%"']){
  let rejected=false;try{validateReliefSvg(`<svg xmlns="http://www.w3.org/2000/svg" ${dimensions}/>`);}catch(e){rejected=['RELIEF_LIMIT','RELIEF_IMAGE_INVALID'].includes(e.code);}
  check(rejected,'unbounded SVG dimensions reject before rendering: '+dimensions);
 }
 for(const fragment of ['<script>1</script>','<image href="https://example.com/x.png"/>','<text>x</text>','<rect style="fill:url(https://example.com/x)"/>']){
  let error;try{validateReliefSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${fragment}</svg>`);}catch(e){error=e;}
  check(error?.code==='RELIEF_IMAGE_INVALID','unsupported/external SVG rejected: '+fragment.split('>')[0]+'>');
 }
 let error;try{await readReliefImage(new Blob(['invalid JPEG']),{name:'broken.jpg'});}catch(e){error=e;}
 check(error?.code==='RELIEF_IMAGE_INVALID','broken raster fails with a coded image error');
 const fixture=document.createElement('div');fixture.style.cssText='position:fixed;left:-10000px;top:0;width:400px';document.body.append(fixture);
 const element=(tag,attrs={},text)=>{const el=document.createElement(tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;return el;};
 const button=(text,fn,cls)=>{const b=element('button',{type:'button',class:cls},text);b.addEventListener('click',fn);return b;};
 const until=async predicate=>{const deadline=performance.now()+5000;while(!predicate()){if(performance.now()>deadline)throw Error('DOM test timed out');await new Promise(requestAnimationFrame);}};
 let dialog,closed=false,commitResult=false,previewCount=0,lastParams;
 try{
  showReliefDialog({getState:()=>({selectedTopology:{bodyId:'explicit-target',type:'face',ids:[5],point:[0,-20,20]}}),element,button,
   openDialog:()=>{dialog=element('section');fixture.append(dialog);return dialog;},close:()=>{closed=true;dialog._onClose();dialog.remove();},
   emit:async(action,args)=>{if(action==='preview'){previewCount++;lastParams=args.params;return {reliefReport:{rows:9,columns:17,mode:'emboss',addedMm3:1}};}if(action==='commitPreview')return commitResult;return true;}
  });
  const find=label=>[...dialog.querySelectorAll('button')].find(b=>b.textContent===label),preview=find('预览曲面'),apply=find('应用浮雕');
  check(dialog.dataset.previewCapable==='true','shared Escape, close and tool-switch paths know to cancel this preview');
  check(preview.disabled&&apply.disabled,'empty form cannot preview or apply');
  const transfer=new DataTransfer();transfer.items.add(blob);const input=dialog.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change'));
  await until(()=>!preview.disabled);check(apply.disabled,'decoded image still requires an explicit geometry preview');
  preview.click();await until(()=>!apply.disabled);
  check(lastParams._targetRefs[0]==='explicit-target'&&lastParams.faceId===5,'preview retains the explicitly selected source and face');
  check(JSON.stringify(lastParams.point)==='[0,-20,20]'&&lastParams.baseMm===.02,'cylinder preview retains clicked point and explicit base thickness');
  check(dialog.textContent.includes('总高度=基底+起伏'),'cylinder rectangular base layer is disclosed before application');
  const depth=dialog.querySelector('[aria-label="起伏高度 mm"]');depth.value='2';depth.dispatchEvent(new Event('input'));
  check(apply.disabled,'editing after preview blocks application of stale geometry');
  preview.click();await until(()=>!apply.disabled);apply.click();await until(()=>!preview.disabled);
  check(!closed&&apply.disabled&&dialog.textContent.includes('应用未完成'),'failed commit keeps task open and requires a fresh preview');
  preview.click();await until(()=>!apply.disabled);commitResult=true;apply.click();await until(()=>closed);
  check(previewCount===3&&closed,'successful commit closes only after a fresh matching preview');
  return {status:'passed',count:checks.length,checks};
 }finally{dialog?._onClose?.();fixture.remove();}
}
