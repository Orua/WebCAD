import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),git=args=>execFileSync('git',args,{cwd:root,windowsHide:true,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean),changed=[...new Set([...git(['diff','--name-only','HEAD']),...git(['ls-files','--others','--exclude-standard'])])];
const map=JSON.parse(await fs.readFile(path.join(root,'contracts/operation-impact-map.json'))),rows=map.operations.filter(row=>changed.some(file=>row.sourcePaths.some(prefix=>file.startsWith(prefix))));
const tests=[...new Set(rows.flatMap(row=>row.targetedTests))];
const serviceTest=file=>['services-runtime','services-compute','services-native-bridge','services-boolean-native','services-round-native','services-shoulder-native','services-relief','services-store-faults','services-support-intent'].some(name=>file.includes(name));
console.log(JSON.stringify({operations:rows.map(row=>row.operation),unitTests:tests.filter(file=>!serviceTest(file)),servicesRequired:tests.some(serviceTest),nativeChanges:changed.some(file=>file.startsWith('services/WebCADServices/native/')),changedPaths:changed}));
