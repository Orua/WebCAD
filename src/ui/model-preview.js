import {QUICK_MODEL_PREVIEWS} from '../quick-models/preview-assets.js';
// Tool-author generated assets: no runtime geometry Worker or WebGL renderer.
export function modelPreview(entry,{annotated=false}={}){
 const asset=QUICK_MODEL_PREVIEWS[entry.kind],figure=document.createElement('figure');figure.className='model-solid-preview'+(annotated?' annotated':'');figure.setAttribute('aria-label',entry.label+(annotated?' 默认参数尺寸指示图':' 实体预览'));
 const image=document.createElement('img');image.alt=entry.label+(annotated?' 默认参数与尺寸指示':' 按默认参数生成的实体');image.loading='lazy';image.decoding='async';
 const status=document.createElement('figcaption');status.textContent=annotated?'默认参数尺寸指示 · mm；创建参数以输入框为准':'';
 image.addEventListener('load',()=>{figure.dataset.previewReady='true';},{once:true});image.addEventListener('error',()=>{status.textContent='预览图片未能加载；仍可设置参数并创建。';figure.dataset.previewError='true';},{once:true});
 if(asset)image.src=new URL(annotated?asset.guide:asset.image,new URL(import.meta.env?.BASE_URL||'./',document.baseURI)).href;else{status.textContent='此工具缺少预制图片';figure.dataset.previewError='true';}
 figure.append(image,status);return figure;
}
