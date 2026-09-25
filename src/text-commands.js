// Small, explicit command language. Values may be JSON; no JavaScript is evaluated.
const fail=(message)=>{throw Object.assign(new Error(message),{code:'PARAM_SCHEMA_INVALID'});};
function words(line){
  const result=[];let start=-1,depth=0,quote=false,escape=false;
  for(let i=0;i<=line.length;i++){
    const c=line[i]??' ';
    if(i===line.length||(/\s/.test(c)&&!quote&&depth===0)){
      if(start>=0){result.push(line.slice(start,i));start=-1;}continue;
    }
    if(start<0)start=i;
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;}
    else if(c==='"')quote=true;
    else if(c==='['||c==='{')depth++;
    else if(c===']'||c==='}')depth--;
    if(depth<0)fail('Unbalanced command value');
  }
  if(quote||depth)fail('Unclosed command value');
  return result;
}
function value(raw){
  if(/^(?:true|false|null)$/.test(raw)||/^[\[{\"]/.test(raw)){
    try{return JSON.parse(raw);}catch{fail('Invalid JSON command value');}
  }
  if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)){
    const number=Number(raw);if(!Number.isFinite(number))fail('Non-finite command number');return number;
  }
  return raw;
}
export function compileTextCommands(text){
  if(typeof text!=='string'||!text.trim()||text.length>16_384)fail('Provide 1–16384 characters of command text');
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
  if(!lines.length||lines.length>20)fail('Provide 1–20 command lines');
  let lastAdd=null;
  return lines.map((line,index)=>{
    const tokens=words(line),id=`line${index+1}`,verb=tokens.shift()?.toLowerCase();
    if(verb==='add'){
      const op=tokens.shift();if(!op||!/^[a-zA-Z][a-zA-Z0-9]{0,50}$/.test(op))fail('add requires a registered operation ID');
      const params=Object.create(null);let name,refs=[];
      for(const token of tokens){
        const cut=token.indexOf('='),key=token.slice(0,cut),raw=token.slice(cut+1);
        if(cut<1||!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key)||!raw)fail(`Invalid argument: ${token}`);
        if(key==='__proto__'||key==='constructor'||key==='prototype'||Object.hasOwn(params,key))fail(`Unsafe or duplicate argument: ${key}`);
        const parsed=value(raw);
        if(key==='name'){if(typeof parsed!=='string'||parsed.length>150)fail('name must be short text');name=parsed;}
        else if(key==='refs'){refs=parsed==='$last'&&lastAdd?{$ref:`${lastAdd}.createdBodyIds`}:parsed;if(!Array.isArray(refs)&&!(refs&&typeof refs==='object'&&refs.$ref))fail('refs must be a JSON array or $last');}
        else params[key]=parsed;
      }
      lastAdd=id;
      return {id,method:'add',args:{op,params,refs,...(name?{name}:{})}};
    }
    if(verb==='measure'){
      if(tokens.length!==1)fail('measure requires one body ID or $last');
      const bodyId=tokens[0]==='$last'&&lastAdd?{$ref:`${lastAdd}.createdBodyIds.0`}:tokens[0];
      return {id,method:'measure',args:{bodyId}};
    }
    fail(`Unknown command: ${verb||''}`);
  });
}
