export function shortAttachmentName(value,max=18){
  const name=String(value||'未命名文件');
  if(/^canvas_capture_.*\.(png|webp|jpg)$/i.test(name))return '画布截图.'+name.split('.').at(-1);
  const chars=Array.from(name);if(chars.length<=max)return name;
  const extension=/\.[a-z0-9]{1,7}$/i.exec(name)?.[0]||'';
  return chars.slice(0,max-extension.length-1).join('')+'…'+extension;
}
export function renderCadFiles(container,files,urlFor,createIcon,insertFor){
  container.querySelector('.file-list')?.remove();container.querySelector('.image-previews')?.remove();container.querySelector('.cad-files')?.remove();
  const doc=container.ownerDocument,grid=doc.createElement('div'),seen=new Set();grid.className='cad-files';
  for(const file of files){
    if(file.status&&file.status!=='ready'||seen.has(file.fileId))continue;seen.add(file.fileId);
    const name=file.originalName||file.name||'未命名文件',image=/\.(png|jpe?g|gif|webp|bmp)$/i.test(name),link=doc.createElement('a');
    link.className='cad-file'+(image?' cad-image':'');link.href=urlFor(file,image);link.target='_blank';link.rel='noopener noreferrer';link.title=name;link.setAttribute('aria-label','新窗口查看：'+name);
    if(image){
      const img=doc.createElement('img');img.src=link.href;img.alt='';img.loading='lazy';link.append(img);
    }else{
      const dot=name.lastIndexOf('.'),label=doc.createElement('span'),meta=doc.createElement('span'),extension=doc.createElement('span');
      label.className='cad-file-name';label.textContent=dot>0?name.slice(0,dot):name;
      meta.className='cad-file-meta';extension.className='cad-file-extension';extension.textContent=dot>0?name.slice(dot+1).toUpperCase():'文件';
      meta.append(extension,createIcon('attachment'));link.append(label,meta);
    }
    const insert=insertFor?.(file);
    if(insert){
      const entry=doc.createElement('div'),control=doc.createElement('button');
      entry.className='cad-file-entry';control.type='button';control.className='cad-file-insert';
      control.textContent='插入';control.title='插入当前工程';control.setAttribute('aria-label','插入当前工程：'+name);
      control.addEventListener('click',insert);entry.append(link,control);grid.append(entry);
    }else grid.append(link);
  }
  if(grid.childNodes.length)container.append(grid);
}
export function compactUploadNames(container){
  const update=()=>{for(const name of container.querySelectorAll('.attachment-name')){const full=name.dataset.fullName||name.textContent;name.dataset.fullName=full;name.title=full;const short=shortAttachmentName(full);if(name.textContent!==short)name.textContent=short;const chip=name.closest('.attachment');if(chip)chip.title=full;}};
  const observer=new MutationObserver(update);observer.observe(container,{childList:true,subtree:true});update();return ()=>observer.disconnect();
}
