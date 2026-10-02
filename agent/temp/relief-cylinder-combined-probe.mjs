// Experimental selected-face gate + mapped relief construction, one OCCT instance.
import fs from 'node:fs';
import * as cad from 'replicad';
import {run} from './relief-cylinder-probe.mjs';
import {testFootprint} from './relief-cylinder-footprint-probe.mjs';
const dispose=x=>{try{x?.delete?.();}catch{}};
const inputs=JSON.parse(fs.readFileSync(new URL('relief-inputs.json',import.meta.url),'utf8'));
const images=Array.isArray(inputs)?inputs:Object.entries(inputs).map(([name,value])=>({name,...(Array.isArray(value)?{values:value}:value)}));
const report={experimental:true,notIntegrated:true,scope:'Actual finite outer cylindrical face, fixed radius 20 and arc 1.4 rad; no UI/API integration',cases:[],started:new Date().toISOString()};
const owned=[],hold=x=>(owned.push(x),x);
try{
 const source=hold(cad.makeCylinder(20,40));
 const rotated=hold(cad.deserializeShape(source.serialize()).rotate(31,[0,0,0],[1,2,0])),moved=hold(rotated.translate([23,-17,12]));
 const theta=Math.PI;
 const originalGate=testFootprint(source,{name:'original finite face',theta,expected:true});
 const movedGate=testFootprint(moved,{name:'transformed finite face',theta,expected:true});
 report.gates=[originalGate,movedGate];
 for(const image of images)for(const mode of ['emboss','engrave']){
  const name=image.name??image.file,values=image.values??image.grid;
  const original=run(name,values,mode,{source,frame:originalGate.frame,theta,baseMm:.02});
  const transformed=run(name,values,mode,{source:moved,frame:movedGate.frame,theta,baseMm:.02});
  const volumeDifference=Math.abs(original.volume-transformed.volume);
  report.cases.push({name,mode,original,transformed,volumeDifference});
  if(volumeDifference>1e-3)throw Error('Rigid transform exceeded 0.001 mm3 volume tolerance: '+volumeDifference);
 }
 report.status='passed';
}catch(error){report.status='failed';report.error={message:error.message,record:error.record};process.exitCode=1;}
finally{owned.reverse().forEach(dispose);report.finished=new Date().toISOString();fs.writeFileSync(new URL('../output/relief-cylinder-combined-probe.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
