import fs from 'node:fs';import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const groups={meshHeightfieldRelief:['src/mesh/heightfield-relief.js'],meshBoolean:['src/mesh/mesh-boolean.js'],meshReliefPlate:['src/mesh/relief-plate.js'],meshReliefEdit:['src/mesh/relief-edit.js'],relief:['src/modeling/manufacturing/relief.js','src/modeling/manufacturing/cylindrical-relief.js','src/relief-sculpt.js'],logo:['src/logo-model.js']};
const codes=text=>[...new Set([...text.matchAll(/(?:meshError|fail|contractError)\(\s*['"]([A-Z][A-Z0-9_]+)['"]|code\s*:\s*['"]([A-Z][A-Z0-9_]+)['"]/g)].map(m=>m[1]||m[2]))].sort();
const data=Object.fromEntries(Object.entries(groups).map(([id,sourcePaths])=>[id,{sourcePaths,codes:[...new Set(sourcePaths.flatMap(p=>codes(fs.readFileSync(resolve(root,p),'utf8'))))].sort()}]));
const target=resolve(root,'contracts/operation-source-errors.json'),next=JSON.stringify(data,null,2)+'\n';if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==next)fs.writeFileSync(target,next);
