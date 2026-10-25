export function shortAttachmentName(value,max=18){
  const name=String(value||'未命名文件');
  if(/^canvas_capture_.*\.(png|webp|jpg)$/i.test(name))return '画布截图.'+name.split('.').at(-1);
  const chars=Array.from(name);if(chars.length<=max)return name;
  const extension=/\.[a-z0-9]{1,7}$/i.exec(name)?.[0]||'';
  return chars.slice(0,max-extension.length-1).join('')+'…'+extension;
}
export function renderCadFiles(container,files,urlFor,createIcon){
  container.querySelector('.file-list')?.remove();container.querySelector('.image-previews')?.remove();container.querySelector('.cad-files')?.remove();
  const doc=container.ownerDocument,grid=doc.createElement('div'),seen=new Set();grid.className='cad-files';
  for(const file of files){
    if(file.status&&file.status!=='ready'||seen.has(file.fileId))continue;seen.add(file.fileId);
    const name=file.originalName||file.name||'未命名文件',image=/\.(png|jpe?g|gif|webp|bmp)$/i.test(name),link=doc.createElement('a');
    link.className='cad-file'+(image?' cad-image':'');link.href=urlFor(file,image);link.target='_blank';link.rel='noopener noreferrer';link.title=name;link.setAttribute('aria-label','新窗口查看：'+name);
    if(image){const img=doc.createElement('img');img.src=link.href;img.alt=name;img.loading='lazy';link.append(img);}else link.append(createIcon('attachment'));
    const label=doc.createElement('span');label.textContent=shortAttachmentName(name);link.append(label);grid.append(link);
  }
  if(grid.childNodes.length)container.append(grid);
}
export function compactUploadNames(container){
  const update=()=>{for(const name of container.querySelectorAll('.attachment-name')){const full=name.dataset.fullName||name.textContent;name.dataset.fullName=full;name.title=full;const short=shortAttachmentName(full);if(name.textContent!==short)name.textContent=short;const chip=name.closest('.attachment');if(chip)chip.title=full;}};
  const observer=new MutationObserver(update);observer.observe(container,{childList:true,subtree:true});update();return ()=>observer.disconnect();
}
