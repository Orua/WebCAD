import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {deflateSync} from 'node:zlib';
import {renderedLogoRaster,logoReviewArtifacts} from '../src/logo-vector-review.js';
const worker=process.env.LOGO_WORKER;
const sha=b=>createHash('sha256').update(b).digest('hex');
function pdf(objects){
 const chunks=[Buffer.from('%PDF-1.4\n')],offsets=[0];let length=chunks[0].length;
 objects.forEach((o,i)=>{offsets.push(length);const b=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),Buffer.from(o),Buffer.from('\nendobj\n')]);chunks.push(b);length+=b.length;});
 chunks.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));return Buffer.concat(chunks);
}
const stream=(data,extra='')=>Buffer.concat([Buffer.from(`<< /Length ${data.length} ${extra} >>\nstream\n`),Buffer.from(data),Buffer.from('\nendstream')]);
function fixture(kind){
 const image=kind==='image',text=kind==='text';
 const content=Buffer.from(image?'q 40 0 0 40 30 30 cm /Im0 Do Q':text?'BT /F1 40 Tf 30 30 Td (H) Tj ET':'0 g 30 30 40 40 re f');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << ${image?'/XObject << /Im0 5 0 R >>':text?'/Font << /F1 5 0 R >>':''} >> /Contents 4 0 R >>`,stream(content)];
 if(text)objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
 if(image)objects.push(stream(deflateSync(Buffer.alloc(16,0)),'/Type /XObject /Subtype /Image /Width 4 /Height 4 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode'));
 return pdf(objects);
}
test('controlled PDF renderer: text/image fallback, vector priority, source bytes and review artifacts',{skip:!worker},()=>{
 assert.ok(process.env.WEBCAD_TEST_OUTPUT?.startsWith('G:'),'write evidence directly to G:');
 const dir=mkdtempSync(join(process.env.WEBCAD_TEST_OUTPUT,'pdf-render-'));
 for(const kind of ['text','image','vector']){
  const bytes=fixture(kind),source=join(dir,kind+'.pdf'),output=join(dir,kind+'.json'),request=join(dir,kind+'-request.json');writeFileSync(source,bytes);
  writeFileSync(request,JSON.stringify({action:'convert',sourcePath:source,sourceName:kind+'.pdf',sourceHash:sha(bytes),outputPath:output,options:{mode:'vector',sizeMode:'targetWidth',targetWidthMm:30,sizeConfirmed:true,toleranceMm:.005}}));
  const run=spawnSync(worker,[request],{timeout:30000,windowsHide:true});assert.equal(run.status,0,String(run.stderr));
  const raw=JSON.parse(readFileSync(output,'utf8'));assert.equal(raw.GeometryValid,true,JSON.stringify(raw));
  const logo={...raw.Logo,source:raw.Logo.Source,regions:raw.Logo.Regions.map(r=>({outer:r.Outer,holes:r.Holes})),sizeMm:raw.Logo.SizeMm};
  if(kind==='vector'){assert.equal(raw.Report.Method,'pdf-vector-extraction');assert.equal(raw.ReviewRequired,false);assert.equal(logo.source.renderedRaster,undefined);continue;}
  assert.equal(raw.Report.Method,'pdf-raster-tracing');assert.equal(raw.ReviewRequired,true);assert.equal(raw.Status,'needsReview');assert.equal(logo.source.sha256,sha(bytes));
  const raster=renderedLogoRaster(logo);assert.ok(raster.length>24);assert.equal(sha(raster),logo.source.renderedRaster.sha256);assert.equal(logo.source.renderedRaster.page,1);
  assert.ok(logo.source.rasterOriginalContours);assert.ok(logo.source.rasterFrame);assert.ok(logoReviewArtifacts(logo).some(a=>a.kind==='rendered-source'&&sha(a.bytes)===sha(raster)));
  const bad=structuredClone(logo);bad.source.renderedRaster.sha256='0'.repeat(64);assert.throws(()=>renderedLogoRaster(bad),{code:'LOGO_RENDERED_IMAGE_INVALID'});
 }
});
