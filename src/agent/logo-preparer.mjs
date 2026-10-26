// Finite, hash-verified host software. Shared with the page; no CAD decisions,
// network access, credentials, browser state or model-supplied code.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fitLogoToMachining} from '../logo-machining-optimization.js';
import {validateRegions,inspectLogoMachiningCapacity} from '../logo-model.js';
import {logoContourBounds} from '../logo-vector-review.js';
import {fitLogoWidth} from '../logo-width.js';

const [input,output,preview]=process.argv.slice(2);
if(!input||!output||!preview)throw new Error('Expected input, output and preview paths supplied by the host.');
const raw=JSON.parse(readFileSync(input,'utf8')),packet=raw.logoDocument??raw.logo??raw;
if(packet.type!=='webcad-logo'||packet.version!==1||packet.units!=='mm')throw new Error('Expected a millimeter LOGO document.');
const width=process.argv[5]?Number(process.argv[5]):raw.targetWidthMm??undefined;
const sized=fitLogoWidth(packet,width);
const logo=packet.source?.contourEditing?sized:fitLogoToMachining(sized,raw.machining??undefined);validateRegions(logo);
const text=JSON.stringify(logo),bytes=Buffer.from(text),hash=createHash('sha256').update(bytes).digest('hex');
writeFileSync(output,bytes);
const [x0,y0,x1,y1]=logoContourBounds(logo),pad=Math.max(x1-x0,y1-y0)*.05;
const paths=logo.regions.map(r=>`<path fill-rule="evenodd" d="${[r.outer,...(r.holes??[])].map(ring=>ring.map(([x,y],i)=>`${i?'L':'M'}${x} ${-y}`).join(' ')+' Z').join(' ')}"/>`).join('');
writeFileSync(preview,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0-pad} ${-y1-pad} ${x1-x0+pad*2} ${y1-y0+pad*2}"><g fill="#296a89">${paths}</g></svg>`);
console.log(JSON.stringify({status:'vectorized',size:bytes.length,sha256:hash,capacity:inspectLogoMachiningCapacity(logo),adaptation:logo.source?.endpointAdaptation??null}));
