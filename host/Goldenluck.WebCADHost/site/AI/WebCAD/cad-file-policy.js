// CAD-only adapter policy. Ordinary workbench/chat attachments retain their own limits.
export function validateCadFiles(files){
 const mib=1024*1024,budgets={step:256,stp:256,brep:256,brp:256,stl:256,mesh:768,webcad:1024};
 if(files.length>5)throw new Error('每次最多添加 5 个附件。');
 const names=new Set();let total=0;
 for(const file of files){
  const name=String(file.name||''),budget=(budgets[name.split('.').pop().toLowerCase()]||20)*mib;
  if(!Number.isSafeInteger(file.size)||file.size<0||file.size>budget)throw new Error(`单个附件不能超过 ${budget/mib} MiB：${name}`);
  const key=name.toLowerCase();if(names.has(key))throw new Error('附件名称重复：'+name);names.add(key);total+=file.size;
 }
 if(total>1024*mib)throw new Error('CAD 附件合计不能超过 1024 MiB。');
 return files;
}
