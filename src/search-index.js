import { isUnavailableResponse } from './search-text.js';
import { semanticPassages } from './search-passages.js';
import { wordFamily } from './word-forms.js';
import { fingerprint } from './archive-model.js';
// Retrieval only: results always contain source text, never generated answers.
const STOP = new Set('a an the is are was were be been being i me my you your we our it its this that these those where when what which who why how do did does can could would should find show tell please remember thread chat conversation says said write wrote of to in on at for from with and or as by then there about off up down out into onto'.split(' '));
export const terms = text => (text.toLocaleLowerCase().normalize('NFKC').match(/[\p{L}\p{N}_][\p{L}\p{N}\p{M}_]*/gu) ?? []).filter(term => !STOP.has(term));
const counts = words => words.reduce((map, word) => map.set(word, (map.get(word) ?? 0) + 1), new Map());
// Word counts of one piece, packed: sorted ids into a shared vocabulary and
// their counts. Answers get/has exactly like a Map from word to count, in a
// fraction of the memory (a piece holds at most 140 words).
const vocabulary = new Map();
class TermCounts {
  constructor(map) {
    const entries = [...map].map(([word, count]) => {
      if (!vocabulary.has(word)) vocabulary.set(word, vocabulary.size);
      return [vocabulary.get(word), count];
    }).sort((a, b) => a[0] - b[0]);
    this.ids = Uint32Array.from(entries, entry => entry[0]);
    this.counts = Uint16Array.from(entries, entry => entry[1]);
  }
  get(word) {
    const id = vocabulary.get(word);
    if (id === undefined) return undefined;
    let low = 0, high = this.ids.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.ids[mid] === id) return this.counts[mid];
      if (this.ids[mid] < id) low = mid + 1; else high = mid - 1;
    }
    return undefined;
  }
  has(word) { return this.get(word) !== undefined; }
}
export function chunkText(text, size = 140, overlap = 28) {
  const words = [...text.matchAll(/\S+/g)];
  const chunks = [];
  for (let start = 0; start < words.length; start += size - overlap) {
    const end = Math.min(words.length, start + size);
    const offset = words[start].index;
    const until = words[end - 1].index + words[end - 1][0].length;
    chunks.push({ text: text.slice(offset, until), offset });
    if (end === words.length) break;
  }
  return chunks;
}
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}
// Identifies an embedded text without storing that text a second time.
export const vectorTextKey = text => `${text.length}:${fingerprint(text)}`;
const isVector = value => Array.isArray(value) || ArrayBuffer.isView(value);
// Compressed vectors: one signed byte per number plus one scale per vector, and
// the length of the rounding error. The exact similarity differs from the
// compressed one by query·error, which is at most (scale/2)·Σ|query_i| (each
// number moved by at most scale/2) and at most |query|·|error| (Cauchy-Schwarz).
// The smaller of the two is a guaranteed range, not a guess.
export function quantizeVector(vector) {
  let max = 0; for (const n of vector) max = Math.max(max, Math.abs(n));
  const scale = Math.fround(max / 127) || 1;
  const q = Int8Array.from(vector, n => Math.max(-127, Math.min(127, Math.round(n / scale))));
  let error = 0; for (let i = 0; i < q.length; i++) error += (vector[i] - scale * q[i]) ** 2;
  return { scale, q, residual: Math.fround(Math.sqrt(error) * 1.000001) };
}
const approxCosine = (approx, x) => { let sum = 0; for (let i = 0; i < x.length; i++) sum += approx.q[i] * x[i]; return sum * approx.scale; };
// The widest a compressed similarity can be from the exact one (with margins
// for floating-point rounding in the sums).
const approxError = (approx, queryL1, queryL2) => Math.min(approx.scale * .5000001 * queryL1,
  Number.isFinite(approx.residual) ? approx.residual * 1.000001 * queryL2 : Infinity) + 1e-7;
// Ready to search: an exact vector, or a compressed one with a known range.
export const hasVector = document => !!(document.vector || document.approx);
const bump = (map, key, delta) => { const n = (map.get(key) ?? 0) + delta; if (n) map.set(key, n); else map.delete(key); };

// Every retrieval piece of one message: whole-message windows first, then
// sentence/clause passages.
function messagePieces(source) {
  const chunks = chunkText(source.text).map((chunk,index)=>({...chunk,key:String(index),isFine:false}));
  const candidates=[...chunks,...semanticPassages(source.text).map(p=>({...p,key:`passage:${p.offset}:${p.text.length}`,isFine:true}))];
  for(const [start,end] of source.blockRanges??[]){
    if(start<0||end>source.text.length||end<=start)continue;
    const text=source.text.slice(start,end);
    for(const p of [...chunkText(text),...semanticPassages(text)])candidates.push({...p,offset:start+p.offset,key:`passage:${start+p.offset}:${p.text.length}`,isFine:true});
  }
  const seen=new Set();
  return candidates.filter(p=>{const key=`${p.offset}:${p.text.length}`;if(seen.has(key))return false;seen.add(key);return true;}).map(chunk=>{
    const embeddingText=source.embeddingContext?`${source.embeddingContext.slice(0,180)}\n${chunk.text}`:chunk.text;
    const termsMap=counts(terms(chunk.text));
    return {...chunk,embeddingText,textKey:vectorTextKey(embeddingText),terms:new TermCounts(termsMap),length:[...termsMap.values()].reduce((a,b)=>a+b,0)};
  });
}

// Word positions, name anchors and distinct terms of one whole message.
function messageStats(text) {
  const families = new Map();
  for (const match of text.matchAll(/[\p{L}\p{N}_][\p{L}\p{N}\p{M}_]*/gu)) {
    const family = wordFamily(match[0].toLocaleLowerCase().normalize('NFKC'));
    if (!families.has(family)) families.set(family, [match.index, match[0].length]);
  }
  const entities = new Set();
  for (const match of text.matchAll(/[\p{L}\p{N}_]+/gu)) {
    const token = match[0];
    // A rare ordinary word is not an identity constraint. Use identifiers,
    // numbers and capitalized names occurring inside a sentence as anchors:
    // some text precedes the word, and its last non-space character does not
    // end a sentence.
    let before = match.index - 1;
    while (before >= 0 && /\s/.test(text[before])) before--;
    if (/[\p{N}_]/u.test(token) || /\p{Ll}\p{Lu}/u.test(token) ||
        (/^\p{Lu}\p{Ll}/u.test(token) && before >= 0 && !'.!?'.includes(text[before])))
      entities.add(token.toLocaleLowerCase().normalize('NFKC'));
  }
  return { families, entities, terms: new Set(terms(text)) };
}

export class SearchIndex {
  constructor({semanticFloor=.28,embeddingVersion='minilm:passages-v2'} = {}) {
    this.documents = []; this.revision = 0; this.semanticFloor=semanticFloor; this.embeddingVersion=embeddingVersion;
    this.sourceCache=new Map();this.vectorCache=new Map();this.storedVectors=new Map();this.storedApprox=new Map();
    this.statsCache=new Map();this.statCounts=new Map();this.frequency=new Map();this.entities=new Map();this.postings=new Map();
    this.wordSources=[];this.wordOrder=new Map();this.sourceOrder=new Map();
    this.messageCount=0;this.averageLength=0;
  }
  makeDocument(source, chunk, previous) {
    const id = `${source.id}:${chunk.key}`, old = previous?.get(id);
    // Prompt instructions and unrelated events must not dominate an answer's
    // vector. Context still disambiguates names during ranking; only explicit
    // semantic context (for example a runtime label) enters the embedding.
    const same = old?.embeddingText === chunk.embeddingText;
    const vector = this.vectorCache.get(chunk.embeddingText)??this.storedVectors.get(chunk.textKey)??(same?old.vector:undefined);
    return { ...source, ...chunk, id,sourceId:source.id, embeddingVersion:this.embeddingVersion, sourceText:source.sourceText ?? source.text,
      passageContext:chunk.key.startsWith('passage:')?source.text:null,
      vector, approx:vector?undefined:this.storedApprox.get(chunk.textKey)??(same?old.approx:undefined) };
  }
  sync(sources) {
    sources = sources.filter(source => source.role !== 'answer' || !isUnavailableResponse(source.text));
    // Canonical whole messages only: semantic paragraph/chunk candidates must
    // never duplicate word matches or rarity. Statistics are applied as changes,
    // so only messages whose text changed are read again.
    const occurrences = new Map(), statsCache = new Map(), wordSources = [], seenMessages = new Set();
    let messageCount = 0;
    for (const source of sources) {
      if (source.isPassage) continue;
      let cached = statsCache.get(source.id) ?? this.statsCache.get(source.id);
      if (cached?.text !== source.text) cached = { text: source.text, stats: messageStats(source.text) };
      statsCache.set(source.id, cached);
      occurrences.set(cached.stats, (occurrences.get(cached.stats) ?? 0) + 1); messageCount++;
      // Word matches list each message once, in conversation order.
      if (!seenMessages.has(source.id)) { seenMessages.add(source.id); wordSources.push({ source, stats: cached.stats }); }
    }
    const apply = (stats, delta) => {
      for (const term of stats.terms) bump(this.frequency, term, delta);
      for (const entity of stats.entities) bump(this.entities, entity, delta);
      for (const family of stats.families.keys()) {
        if (!this.postings.has(family)) this.postings.set(family, new Map());
        const posting = this.postings.get(family); bump(posting, stats, delta);
        if (!posting.size) this.postings.delete(family);
      }
    };
    for (const [stats, n] of occurrences) { const old = this.statCounts.get(stats) ?? 0; if (n !== old) apply(stats, n - old); }
    for (const [stats, old] of this.statCounts) if (!occurrences.has(stats)) apply(stats, -old);
    this.statCounts = occurrences; this.statsCache = statsCache; this.messageCount = messageCount;
    this.wordSources = wordSources; this.wordOrder = new Map(wordSources.map((entry, index) => [entry.stats, index]));

    const previous=new Map(this.documents.map(d=>[d.id,d]));
    const documents = [], sourceCache = new Map(), sourceOrder = new Map();
    let lengths = 0;
    for (const source of sources) {
      let prepared=sourceCache.get(source.id)??this.sourceCache.get(source.id);
      // The same source object yields the same documents (and their vectors).
      if(prepared?.source!==source){
        const signature=JSON.stringify([source.text,source.embeddingContext,source.blockRanges]);
        if(prepared?.signature!==signature){
          const pieces=messagePieces(source);
          prepared={signature,pieces,lengths:pieces.reduce((sum,p)=>sum+p.length,0)};
        }
        prepared={...prepared,source,docs:prepared.pieces.map(chunk=>this.makeDocument(source,chunk,previous))};
      }
      sourceCache.set(source.id,prepared);
      if(!sourceOrder.has(source.id))sourceOrder.set(source.id,sourceOrder.size);
      documents.push(...prepared.docs);
      lengths += prepared.lengths;
    }
    const changed = documents.length !== this.documents.length || documents.some((d, i) => d.id !== this.documents[i]?.id || d.embeddingText !== this.documents[i]?.embeddingText);
    this.documents = documents;
    this.sourceCache=sourceCache; this.sourceOrder=sourceOrder;
    if (changed) this.revision++;
    // Lengths are whole numbers, so summing per message gives the exact average.
    this.averageLength = lengths / Math.max(1, documents.length);
    return changed;
  }
  // Every piece overlapping the given windows, in index order.
  expand(windows) {
    const bySource = new Map();
    for (const window of windows) { if (!bySource.has(window.sourceId)) bySource.set(window.sourceId, []); bySource.get(window.sourceId).push(window); }
    return [...bySource.keys()].sort((a, b) => (this.sourceOrder.get(a) ?? 0) - (this.sourceOrder.get(b) ?? 0)).flatMap(id => {
      const selected = bySource.get(id);
      return (this.sourceCache.get(id)?.docs ?? []).filter(d => selected.some(w => d.offset < w.offset + w.text.length && d.offset + d.text.length > w.offset));
    });
  }
  keywordGroups(query) {
    const seen = new Set();
    const matches=[...query.matchAll(/[\p{L}\p{N}_][\p{L}\p{N}\p{M}_]*/gu)];
    // Filler words (how, to, the…) match nearly every message; list them only
    // when the query contains nothing else.
    const content=matches.filter(match=>!STOP.has(match[0].toLocaleLowerCase().normalize('NFKC')));
    const groups=(content.length?content:matches).flatMap(match => {
      const word = match[0].toLocaleLowerCase().normalize('NFKC');
      if (seen.has(word)) return [];
      seen.add(word);
      const family = wordFamily(word);
      // Each message once, in conversation order, with its first occurrence.
      const results = [...(this.postings.get(family)?.keys() ?? [])].map(stats => this.wordOrder.get(stats)).filter(index => index !== undefined)
        .sort((a, b) => a - b).map(index => {
          const {source: message, stats} = this.wordSources[index], [wordOffset, wordLength] = stats.families.get(family);
          return {...message, wordOffset, wordLength};
        }).map(source => {
        let start = Math.max(0, source.wordOffset - 70);
        if (start) {
          const boundary = source.text.lastIndexOf(' ', start);
          if (boundary >= start - 30) start = boundary + 1;
        }
        const end = Math.min(source.text.length, Math.max(start + 260, source.wordOffset + source.wordLength));
        const matchText = source.text.slice(start, end);
        return { ...source, id: `word:${word}:${source.id}`, sourceText: source.sourceText ?? source.text,
          matchText, matchOffset: start, highlightStart: source.wordOffset - start, highlightLength: source.wordLength,
          excerpt: `${start ? '…' : ''}${matchText}${end < source.text.length ? '…' : ''}` };
      });
      return [{ word, label: match[0], results }];
    });
    return groups;
  }
  pending(limit = 8,{windowsOnly=false,documents=this.documents}={}) {
    const seen = new Set();
    return documents.filter(d => {
      if (hasVector(d) || (windowsOnly&&d.isFine) || seen.has(d.embeddingText)) return false;
      seen.add(d.embeddingText); return true;
    }).sort((a,b)=>Math.min(1024,a.embeddingText.length)-Math.min(1024,b.embeddingText.length)).slice(0,limit);
  }
  accept(batch, vectors) {
    const ready = new Map(batch.map((document,index) => [document.embeddingText,vectors[index]]));
    for(const [text,vector] of ready){if(this.vectorCache.size>=8192)this.vectorCache.delete(this.vectorCache.keys().next().value);this.vectorCache.set(text,vector);}
    for (const document of this.documents) if (ready.has(document.embeddingText)) document.vector = ready.get(document.embeddingText);
  }
  // Saved records identify their text by key (older records carry the text).
  // Compressed records ({scale,q}) become approximate vectors; exact vectors
  // are computed only when a ranking needs them (see exactSearch).
  restoreVectors(records){
    for (const record of records) {
      if (record.embeddingVersion !== undefined && record.embeddingVersion !== this.embeddingVersion) continue;
      const key = record.textKey ?? (typeof record.embeddingText === 'string' ? vectorTextKey(record.embeddingText) : null);
      if (!key) continue;
      if (isVector(record.q) && record.q.length && Number.isFinite(record.scale)) this.storedApprox.set(key, { scale: record.scale, q: Int8Array.from(record.q), residual: record.residual });
      else if (isVector(record.vector)) this.storedVectors.set(key, record.vector);
    }
    for (const document of this.documents) {
      if (document.vector) continue;
      const vector = this.storedVectors.get(document.textKey);
      if (vector) document.vector = vector; else document.approx ??= this.storedApprox.get(document.textKey);
    }
  }
  // semanticBound -1/+1 scores compressed vectors at the low/high end of their
  // guaranteed range (0: the compressed estimate). Exact vectors are unaffected.
  search(query, queryVector, limit = 6, {semanticWeight = .9, lexicalCoverage = true, dedupe = true,windowsOnly=false,semanticFloor=this.semanticFloor,documents=this.documents,semanticBound=0} = {}) {
    const queryTerms = [...new Set(terms(query))];
    if (!queryTerms.length) return [];
    const n = this.messageCount;
    // Rare terms (names, code identifiers, numbers) keep a semantic paraphrase
    // about the wrong person from outranking a matching passage about the right one.
    const anchors = queryTerms.filter(term => this.entities.has(term) && this.frequency.has(term) && this.frequency.get(term) / Math.max(1, n) < .45);
    let queryL1 = 0, queryL2 = 0; if (queryVector) for (const value of queryVector) { queryL1 += Math.abs(value); queryL2 += value * value; }
    queryL2 = Math.sqrt(queryL2);
    const scored = documents.filter(d=>!windowsOnly||!d.isFine).map(document => {
      let lexical = 0;
      for (const term of queryTerms) {
        const tf = document.terms.get(term) ?? 0;
        const df = this.frequency.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + .5) / (df + .5));
        lexical += idf * tf * 2.2 / (tf + 1.2 * (.25 + .75 * document.length / Math.max(1, this.averageLength)));
      }
      const semantic = document.vector || !document.approx || !queryVector ? cosine(document.vector, queryVector)
        : approxCosine(document.approx, queryVector) + semanticBound * approxError(document.approx, queryL1, queryL2);
      const coverage = queryTerms.filter(term => document.terms.has(term)).length / queryTerms.length;
      const anchorCoverage = anchors.length ? anchors.filter(term => document.terms.has(term) || terms(document.context).includes(term)).length / anchors.length : 1;
      const lexicalScore = lexical / (lexical + 2) * (lexicalCoverage ? coverage : 1);
      // Each vector describes this passage itself. Short, substantive answers
      // must compete equally with inputs, without a role/word-count penalty.
      const score = (queryVector ? semanticWeight * Math.max(0, semantic) + (1 - semanticWeight) * lexicalScore : lexical / (lexical + 2)) * (.65 + .35 * anchorCoverage);
      return { ...document, lexical, semantic, score, coverage };
    }).filter(d => queryVector && hasVector(d) ? d.semantic >= semanticFloor || (d.lexical > 1 && d.coverage >= .5) : d.lexical > 0);
    scored.sort((a,b) => b.score - a.score || b.coverage - a.coverage);
    // One best passage per exchange, so one long answer doesn't fill the list.
    const seen = new Set();
    return scored.filter(d => { if (!dedupe) return true; if (seen.has(d.exchangeId)) return false; seen.add(d.exchangeId); return true; }).slice(0, limit).map(document => {
      const term = queryTerms.filter(term => document.terms.has(term)).sort((a,b) => this.frequency.get(a) - this.frequency.get(b))[0];
      const position = term ? document.text.toLocaleLowerCase().indexOf(term) : 0;
      let start = Math.max(0, position - 70);
      // Snap to nearby spaces only; text without spaces (CJK, URLs, code) keeps
      // the character boundary instead of collapsing the excerpt.
      if (start) {
        const boundary = document.text.lastIndexOf(' ',start);
        if (boundary >= start - 30) start = boundary + 1;
      }
      let end = Math.min(document.text.length,start+340);
      if (end < document.text.length) {
        const boundary = document.text.lastIndexOf(' ',end);
        if (boundary > Math.max(start, position + (term?.length ?? 0))) end = boundary;
      }
      const matchText = document.text.slice(start,end);
      // Retrieval and navigation use the precise passage. The visible excerpt
      // keeps neighboring context so a short sentence is still understandable.
      let excerpt=`${start ? '…' : ''}${matchText}${end < document.text.length ? '…' : ''}`;
      if(document.passageContext){
        const from=Math.max(0,document.offset+start-70),to=Math.min(document.passageContext.length,from+340);
        excerpt=`${from?'…':''}${document.passageContext.slice(from,to)}${to<document.passageContext.length?'…':''}`;
      }
      return {...document,matchText,matchOffset:document.offset+start,excerpt};
    });
  }
}
