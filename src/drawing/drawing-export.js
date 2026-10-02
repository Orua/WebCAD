const n=x=>Number(x.toFixed(5));
const xml=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function drawingSVG(scene){
 const elements=scene.primitives.map(p=>{const style=`fill="none" stroke="#17202b" stroke-width="${p.style==='outline'?.3:.16}"${p.style==='hidden'?' stroke-dasharray="2 1"':''}`;
  if(p.kind==='line')return `<path d="M${p.a.map(n).join(' ')}L${p.b.map(n).join(' ')}" ${style}/>`;
  if(p.kind==='circle')return `<circle cx="${n(p.center[0])}" cy="${n(p.center[1])}" r="${n(p.radius)}" ${style}/>`;
  return `<text x="${n(p.p[0])}" y="${n(p.p[1])}" font-size="${p.size}" fill="#17202b" font-family="Arial,Microsoft YaHei,sans-serif">${xml(p.text)}</text>`;
 });
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}mm" height="${scene.height}mm" viewBox="0 0 ${scene.width} ${scene.height}"><rect width="100%" height="100%" fill="white"/>${elements.join('')}</svg>`;
}
export function drawingDXF(scene){
 // CAD model space uses true millimetres, independent of the printed paper scale.
 const unit=v=>n(v/scene.scale);
 const pairs=[0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,4,0,'ENDSEC',0,'SECTION',2,'TABLES',0,'TABLE',2,'LTYPE',70,2,0,'LTYPE',2,'CONTINUOUS',70,0,3,'Solid',72,65,73,0,40,0,0,'LTYPE',2,'HIDDEN',70,0,3,'Hidden',72,65,73,2,40,3,49,2,74,0,49,-1,74,0,0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES'];
 let handle=32;const push=(type,style,subclass,...fields)=>pairs.push(0,type,5,(handle++).toString(16).toUpperCase(),100,'AcDbEntity',8,style==='hidden'?'HIDDEN':style==='dimension'?'DIMENSIONS':'DRAWING',6,style==='hidden'?'HIDDEN':'CONTINUOUS',100,subclass,...fields);
 for(const p of scene.primitives){
  if(p.kind==='line')push('LINE',p.style,'AcDbLine',10,unit(p.a[0]),20,unit(-p.a[1]),30,0,11,unit(p.b[0]),21,unit(-p.b[1]),31,0);
  else if(p.kind==='circle')push('CIRCLE',p.style,'AcDbCircle',10,unit(p.center[0]),20,unit(-p.center[1]),30,0,40,unit(p.radius));
  else push('TEXT',p.style,'AcDbText',10,unit(p.p[0]),20,unit(-p.p[1]),30,0,40,unit(p.size),1,p.text.replace(/[^\x20-\x7e]/g,c=>'\\U+'+c.charCodeAt(0).toString(16).padStart(4,'0').toUpperCase()));
 }
 pairs.push(0,'ENDSEC',0,'EOF');return pairs.join('\r\n')+'\r\n';
}
export function drawingPDF(scene){
 const pt=72/25.4,x=v=>n(v*pt),y=v=>n((scene.height-v)*pt),hex=s=>Array.from(String(s)).map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
 const ops=['0 0 0 RG','0 0 0 rg'];
 for(const p of scene.primitives){
  ops.push(`${x(p.style==='outline'?.3:.16)} w`,p.style==='hidden'?`[${x(2)} ${x(1)}] 0 d`:'[] 0 d');
  if(p.kind==='line')ops.push(`${x(p.a[0])} ${y(p.a[1])} m ${x(p.b[0])} ${y(p.b[1])} l S`);
  else if(p.kind==='circle'){const a=x(p.center[0]),b=y(p.center[1]),r=x(p.radius),k=r*.552284749831;ops.push(`${n(a+r)} ${b} m ${n(a+r)} ${n(b+k)} ${n(a+k)} ${n(b+r)} ${a} ${n(b+r)} c ${n(a-k)} ${n(b+r)} ${n(a-r)} ${n(b+k)} ${n(a-r)} ${b} c ${n(a-r)} ${n(b-k)} ${n(a-k)} ${n(b-r)} ${a} ${n(b-r)} c ${n(a+k)} ${n(b-r)} ${n(a+r)} ${n(b-k)} ${n(a+r)} ${b} c S`);}
  else{const latin=/^[\x20-\x7eØ]*$/.test(p.text),value=latin?'('+p.text.replace(/[()\\Ø]/g,c=>c==='Ø'?'\\330':'\\'+c)+')':'<'+hex(p.text)+'>';ops.push(`BT /${latin?'F2':'F1'} ${x(p.size)} Tf ${x(p.p[0])} ${y(p.p[1])} Td ${value} Tj ET`);}
 }
 const stream=ops.join('\n'),objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${x(scene.width)} ${x(scene.height)}] /Resources << /Font << /F1 5 0 R /F2 8 0 R >> >> /Contents 4 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [6 0 R] >>','<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 7 0 R /DW 1000 >>','<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 >>'];
 objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
 let file='%PDF-1.4\n',offsets=[0];for(const [i,o]of objects.entries()){offsets.push(file.length);file+=`${i+1} 0 obj\n${o}\nendobj\n`;}
 const start=file.length;file+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return new TextEncoder().encode(file);
}
export async function drawingJPEG(scene){
 const svg=drawingSVG(scene),blob=new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);
 try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('工程图图片生成失败'));image.src=url;});const canvas=document.createElement('canvas');canvas.width=Math.round(scene.width/25.4*300);canvas.height=Math.round(scene.height/25.4*300);const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(image,0,0,canvas.width,canvas.height);const result=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.95));if(!result)throw new Error('浏览器未能生成 JPG');return new Uint8Array(await result.arrayBuffer());}finally{URL.revokeObjectURL(url);}
}
