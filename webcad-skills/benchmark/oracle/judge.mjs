import {volume,required,section,surface,sectionCases,surfaceCases} from './reference.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
// Observation values come from the evaluator's geometry reader, never the LLM.
export function judgeGeometry(caseId,observation={}){
 const checks=[];
 const add=(id,pass,detail)=>checks.push({id,status:pass===null?'UNVERIFIED':pass?'PASS':'FAIL',detail});
 const near=(id,actual,expected,tolerance)=>add(id,finite(actual)?Math.abs(actual-expected)<=tolerance:null,{actual:actual??null,expected,tolerance});
 add('independentReader',observation.reader?.independent===true?true:null,observation.reader??null);
 add('brepValid',typeof observation.brepValid==='boolean'?observation.brepValid:null);
 const targetType=['S06','S07','S08','S09'].includes(caseId)?'surface':'solid';
 add('targetType',observation.targetType?observation.targetType===targetType:null);
 if(targetType==='solid')near('solidCount',observation.solidCount,1,0);
 add('units',observation.units?observation.units==='mm':null);
 if(volume[caseId]!==undefined)near('volume',observation.volume,volume[caseId],Math.abs(volume[caseId])*1e-4);
 for(const id of required[caseId]??[]){
  if(caseId==='B01'&&id==='envelope'){
   for(const [axis,expected] of Object.entries({minX:-20,maxX:20,minY:-15,maxY:15,minZ:0,maxZ:4}))near(`envelope:${axis}`,observation.bounds?.[axis],expected,.01);
  }else if(caseId==='B01'&&id==='holes'){
   const holes=observation.holes;
   if(!Array.isArray(holes))add('holes',null);
   else{
    near('holeCount',holes.length,2,0);
    for(const [i,hole] of [...holes].sort((a,b)=>a.x-b.x).entries()){
     near(`hole:${i}:x`,hole.x,[-12,12][i],.01);near(`hole:${i}:y`,hole.y,0,.01);near(`hole:${i}:diameter`,hole.diameter,4,.01);
     near(`hole:${i}:minZ`,hole.minZ,0,.01);near(`hole:${i}:maxZ`,hole.maxZ,4,.01);
    }
   }
  }else if(caseId==='M04'&&id==='counterboreDepth'){
   near('counterboreBottom',observation.counterboreBottomZ,7,.01);near('counterboreDepth',observation.counterboreDepth,3,.01);
  }else if(id==='sections'&&sectionCases.includes(caseId)&&observation.sections?.length){
   const seen=new Set();
   for(const sample of observation.sections){
    if(!finite(sample.t)||sample.t<0||sample.t>1){add('sectionStation',false);continue;}
    seen.add(sample.t);
    for(const [key,value] of Object.entries(section(caseId,sample.t)))near(`section:${sample.t}:${key}`,sample[key],value,key==='angleDeg'?0.05:0.05);
   }
   add('sectionCoverage',[0,0.25,0.5,0.75,1].every(t=>seen.has(t))?true:null);
  }else if(id==='surfaceSamples'&&surfaceCases.includes(caseId)&&observation.surfaceSamples?.length){
   const seen=new Set();
   for(const sample of observation.surfaceSamples){
    if(!finite(sample.u)||!finite(sample.v)||sample.u<0||sample.u>1||sample.v<0||sample.v>1){add('surfaceStation',false);continue;}
    const expected=surface(caseId,sample.u,sample.v);if(!expected)continue;
    seen.add(`${sample.u},${sample.v}`);
    const actual=sample.point;near(`surface:${sample.u}:${sample.v}`,Array.isArray(actual)&&actual.length===3&&actual.every(finite)?Math.hypot(...actual.map((x,i)=>x-expected[i])):null,0,0.05);
   }
   const stations=[0,.25,.5,.75,1];
   add('surfaceCoverage',stations.every(u=>stations.every(v=>!surface(caseId,u,v)||seen.has(`${u},${v}`)))?true:null);
  }else{
   // Additional specialized checks must carry raw measurement evidence and a checker ID.
   const check=observation.checks?.[id];
   add(id,check?.checkerId&&check?.evidence&&typeof check.pass==='boolean'?check.pass:null,check??null);
  }
 }
 return {status:checks.some(x=>x.status==='FAIL')?'FAIL':checks.some(x=>x.status==='UNVERIFIED')?'UNVERIFIED':'PASS',checks};
}
