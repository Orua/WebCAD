import {evaluateExpression} from '../../../src/parameter-calculator.js';
const functions={sqrt:Math.sqrt,abs:Math.abs,sin:Math.sin,cos:Math.cos,tan:Math.tan,min:Math.min,max:Math.max};
// Pure host arithmetic, using the application's bounded parser. No eval, I/O,
// geometry, reference answers or model-selected executable code is available.
export function sampleCoordinates({coordinates,axes}={}){
 if(!Array.isArray(coordinates)||coordinates.length!==3||coordinates.some(x=>typeof x!=='string')||!Array.isArray(axes)||axes.length<1||axes.length>2)throw Error('HOST_COORDINATE_INPUT_INVALID');
 const names=new Set();let total=1;
 for(const axis of axes){
  if(!axis||!/^[a-z][a-z0-9_]{0,15}$/.test(axis.name)||axis.name==='pi'||Object.hasOwn(functions,axis.name)||names.has(axis.name)||!Number.isFinite(axis.min)||!Number.isFinite(axis.max)||axis.max<=axis.min||!Number.isInteger(axis.count)||axis.count<2||axis.count>(axes.length===1?64:12))throw Error('HOST_COORDINATE_AXIS_INVALID');
  names.add(axis.name);total*=axis.count;
 }
 if(total>144)throw Error('HOST_COORDINATE_SAMPLE_LIMIT');
 const at=variables=>coordinates.map(expression=>evaluateExpression(expression,{
  number:value=>value,identifier:name=>{if(name==='pi')return Math.PI;if(Object.hasOwn(variables,name))return variables[name];throw Error('Unknown arithmetic variable: '+name);},
  unary:(op,value)=>op==='-'?-value:value,
  binary:(op,a,b)=>({'+':()=>a+b,'-':()=>a-b,'*':()=>a*b,'/':()=>a/b,'^':()=>a**b})[op](),
  call:(name,args)=>functions[name](...args),finite:Number.isFinite,
 }));
 const sample=(index,variables)=>{const axis=axes[index];return Array.from({length:axis.count},(_,i)=>{const next={...variables,[axis.name]:axis.min+(axis.max-axis.min)*i/(axis.count-1)};return index+1===axes.length?at(next):sample(index+1,next);});};
 return {status:'computed',points:sample(0,{}),pointCount:total,coordinateOrder:['x','y','z'],axisOrder:axes.map(a=>a.name),geometryChanged:false};
}
