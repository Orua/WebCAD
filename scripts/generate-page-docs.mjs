import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createStaticPageApiIndex, getTool, infoMetadata, readDocs, searchTools } from '../src/page-api-docs.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public', 'automation');
const metadata = infoMetadata();
const cards = [];
let cursor;
do {
  const page = searchTools({ query: '', limit: 50, ...(cursor ? { cursor } : {}) });
  cards.push(...page.items.map(item => getTool({ id: item.id })));
  cursor = page.nextCursor;
} while (cursor);
const docs = Object.fromEntries(metadata.docs.map(docId => [docId, readDocs({ docId }).text]));
const index = { generatedFrom: 'src/page-api-docs.js and src/operation-registry.js',
  metadata, cards, docs };
await mkdir(target, { recursive: true });
await writeFile(resolve(target, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
await writeFile(resolve(target, 'index.md'), createStaticPageApiIndex(), 'utf8');
console.log(`Generated ${cards.length} page cards in ${target}`);

await copyFile(resolve(root,'docs/examples/page-api-plate.js'),resolve(target,'page-api-plate.js'));
