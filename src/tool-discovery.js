// Shared by the live page and the downloadable offline library. No network,
// browser globals, model calls or task-specific operation sequences.
export const SEARCH_VERSION = '2';
const clone = value => structuredClone(value);
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase();
const han = /\p{Script=Han}/u;
const stopWords = new Set('the a an and or to of for with please tool tools mm api 的 了 一个 一下 请 帮我 然后'.split(' '));

function terms(text) {
  const result = new Set();
  for (const part of normalize(text).match(/[\p{Script=Han}]+|[a-z][a-z0-9._-]*/gu) || []) {
    if (stopWords.has(part)) continue;
    result.add(part);
    if (han.test(part)) {
      // Overlapping CJK pairs allow unspaced sentences without a tokenizer model.
      const chars = [...part];
      for (let i = 0; i + 1 < chars.length; i++) {
        const pair = chars.slice(i, i + 2).join('');
        if (!stopWords.has(pair)) result.add(pair);
      }
    } else {
      for (const word of part.split(/[._-]/)) if (!stopWords.has(word)) {
        result.add(word);
        if(word.length>3 && word.endsWith('s') && !word.endsWith('ss')) result.add(word.slice(0,-1));
      }
    }
  }
  return result;
}

function schemaText(schema) {
  if (!schema || typeof schema !== 'object') return '';
  return Object.entries(schema).flatMap(([key, value]) => {
    if (['description', 'title', 'enum', 'const'].includes(key)) return JSON.stringify(value);
    if (key === 'properties') return Object.entries(value).map(([name, child]) => `${name} ${schemaText(child)}`);
    return typeof value === 'object' ? schemaText(value) : '';
  }).join(' ');
}

export function createToolIndex(cards) {
  const records = cards.map((card, order) => {
    const primary = [card.id, card.label, card.title, ...(card.synonyms || [])].filter(Boolean).map(normalize);
    const fields = [primary.join(' '), normalize(card.description),
      normalize(`${schemaText(card.inputSchema)} ${card.inputContract || ''}`)];
    return { id: card.id, category: card.category, order, primary, fields, tokens: fields.map(terms) };
  });
  const frequency = new Map();
  for (const record of records) {
    for (const token of new Set(record.tokens.flatMap(set => [...set])))
      frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  return Object.freeze({ search(query, { category } = {}) {
    const text = normalize(query).trim(), queryTerms = terms(text);
    const candidates = records.filter(record => !category || record.category === category);
    if (!text) return candidates.map(({ id }) => ({ id, score: 0, matchedTerms: [] }));
    return candidates.map(record => {
      let score = normalize(record.id) === text ? 1000 : 0;
      const matched = new Set();
      for (const phrase of record.primary) {
        if (phrase === text) score += 100;
        else if (phrase.length >= 2 && text.includes(phrase) && !stopWords.has(phrase)) {
          score += 20 + Math.min(phrase.length, 20); matched.add(phrase);
        }
      }
      for (const token of queryTerms) {
        const field = record.tokens.findIndex(set => set.has(token));
        if (field < 0) continue;
        const idf = Math.log(1 + records.length / (1 + (frequency.get(token) || 0)));
        score += [8, 3, 1][field] * idf;
        matched.add(token);
      }
      const coverage = [...queryTerms].filter(token => matched.has(token)).length / Math.max(1, queryTerms.size);
      score *= .25 + .75 * coverage;
      return { id: record.id, score: Math.round(score * 100) / 100, matchedTerms: [...matched].slice(0, 12), order: record.order };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.order - b.order)
      .map(({ order, ...item }) => item);
  } });
}

// Optional host-side cache: download index.json and tool-library.mjs once.
// The caller owns persistence; document/session IDs never belong in this cache.
export function createToolLibrary(snapshot) {
  if (snapshot?.metadata?.discovery?.searchVersion !== SEARCH_VERSION || !Array.isArray(snapshot.cards))
    throw new Error('Unsupported tool snapshot; refresh the library and index together.');
  const data = clone(snapshot), cards = new Map(data.cards.map(card => [card.id, card]));
  const index = createToolIndex(data.cards);
  return Object.freeze({
    metadata: () => clone(data.metadata),
    isCurrent: live => live?.catalogHash === data.metadata.catalogHash && live?.docsHash === data.metadata.docsHash,
    search(query, { limit = 8, category } = {}) {
      if (typeof query !== 'string' || query.length > 500 || !Number.isInteger(limit) || limit < 1 || limit > 50)
        throw new Error('Expected a query of at most 500 characters and limit 1..50.');
      return index.search(query, { category }).slice(0, limit).map(item => {
        const card = cards.get(item.id);
        return { ...item, title: card.title, label: card.label, category: card.category,
          version: card.version, docsHash: card.docsHash, runtimeAvailability: 'unknown' };
      });
    },
    get(id) { if (!cards.has(id)) throw new Error(`Unknown tool: ${id}`); return clone(cards.get(id)); },
    readDoc(id) { if (!Object.hasOwn(data.docs || {}, id)) throw new Error(`Unknown document: ${id}`); return data.docs[id]; },
  });
}
