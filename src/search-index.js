import { isUnavailableResponse } from './search-text.js';
import { semanticPassages } from './search-passages.js';
import { wordFamily } from './word-forms.js';
// Retrieval only: results always contain source text, never generated answers.
const STOP = new Set('a an the is are was were be been being i me my you your we our it its this that these those where when what which who why how do did does can could would should find show tell please remember thread chat conversation says said write wrote of to in on at for from with and or as by then there about off up down out into onto'.split(' '));
export const terms = text => (text.toLocaleLowerCase().normalize('NFKC').match(/[\p{L}\p{N}_][\p{L}\p{N}\p{M}_]*/gu) ?? []).filter(term => !STOP.has(term));
const counts = words => words.reduce((map, word) => map.set(word, (map.get(word) ?? 0) + 1), new Map());
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
export class SearchIndex {
  constructor({semanticFloor=.28,embeddingVersion='minilm:passages-v2'} = {}) {
    this.documents = []; this.revision = 0; this.semanticFloor=semanticFloor; this.embeddingVersion=embeddingVersion;
    this.sourceCache=new Map();this.vectorCache=new Map();
  }
  sync(sources) {
    sources = sources.filter(source => source.role !== 'answer' || !isUnavailableResponse(source.text));
    // Canonical whole messages only: semantic paragraph/chunk candidates must
    // never duplicate word matches. Posting order follows conversation order.
    this.wordForms = new Map();
    const seenMessages = new Set();
    for (const source of sources) {
      if (source.isPassage || seenMessages.has(source.id)) continue;
      seenMessages.add(source.id);
      const seenFamilies = new Set();
      for (const match of source.text.matchAll(/[\p{L}\p{N}_][\p{L}\p{N}\p{M}_]*/gu)) {
        const word = match[0].toLocaleLowerCase().normalize('NFKC');
        const family = wordFamily(word);
        if (!seenFamilies.has(family)) {
          seenFamilies.add(family);
          if (!this.wordForms.has(family)) this.wordForms.set(family, []);
          this.wordForms.get(family).push({...source,wordOffset:match.index,wordLength:match[0].length});
        }

      }
    }
    const previous=new Map(this.documents.map(d=>[d.id,d]));
    const documents = [];
    const sourceCache=new Map();
    for (const source of sources) {
      const signature=JSON.stringify([source.text,source.embeddingContext,source.blockRanges]);
      let prepared=this.sourceCache.get(source.id);
      if(prepared?.signature!==signature){
        const chunks = chunkText(source.text).map((chunk,index)=>({...chunk,key:String(index),isFine:false}));
        const candidates=[...chunks,...semanticPassages(source.text).map(p=>({...p,key:`passage:${p.offset}:${p.text.length}`,isFine:true}))];
        for(const [start,end] of source.blockRanges??[]){
          if(start<0||end>source.text.length||end<=start)continue;
          const text=source.text.slice(start,end);
          for(const p of [...chunkText(text),...semanticPassages(text)])candidates.push({...p,offset:start+p.offset,key:`passage:${start+p.offset}:${p.text.length}`,isFine:true});
        }
        const seen=new Set();
        prepared={signature,chunks:candidates.filter(p=>{const key=`${p.offset}:${p.text.length}`;if(seen.has(key))return false;seen.add(key);return true;}).map(chunk=>{
          const embeddingText=source.embeddingContext?`${source.embeddingContext.slice(0,180)}\n${chunk.text}`:chunk.text;
          const termsMap=counts(terms(chunk.text));
          return {...chunk,embeddingText,terms:termsMap,length:[...termsMap.values()].reduce((a,b)=>a+b,0)};
        })};
      }
      sourceCache.set(source.id,prepared);
      for (const chunk of prepared.chunks) {
        const id = `${source.id}:${chunk.key}`;
        // Prompt instructions and unrelated events must not dominate an answer's
        // vector. Context still disambiguates names during ranking; only explicit
        // semantic context (for example a runtime label) enters the embedding.
        documents.push({ ...source, ...chunk, id,sourceId:source.id, embeddingVersion:this.embeddingVersion, sourceText:source.sourceText ?? source.text,
          passageContext:chunk.key.startsWith('passage:')?source.text:null,
          vector:this.vectorCache.get(chunk.embeddingText)??(previous.get(id)?.embeddingText===chunk.embeddingText?previous.get(id).vector:undefined) });
      }
    }
    const changed = documents.length !== this.documents.length || documents.some((d, i) => d.id !== this.documents[i]?.id || d.embeddingText !== this.documents[i]?.embeddingText);
    this.documents = documents;
    this.sourceCache=sourceCache;
    if (changed) this.revision++;
    this.frequency = new Map();
    // Passage counts depend on formatting and message length. Rarity must use
    // original messages so adding finer candidates cannot change name anchors.
    const canonical = sources.filter(source=>!source.isPassage);
    this.messageCount = canonical.length;
    this.entities = new Set();
    for (const source of canonical) for (const match of source.text.matchAll(/[\p{L}\p{N}_]+/gu)) {
      const token=match[0], prefix=source.text.slice(0,match.index);
      // A rare ordinary word is not an identity constraint. Use identifiers,
      // numbers and capitalized names occurring inside a sentence as anchors.
      if (/[\p{N}_]/u.test(token) || /\p{Ll}\p{Lu}/u.test(token) ||
          (/^\p{Lu}\p{Ll}/u.test(token) && prefix.trim() && !/[.!?]\s*$/.test(prefix)))
        this.entities.add(token.toLocaleLowerCase().normalize('NFKC'));
    }
    for (const source of canonical) for (const term of new Set(terms(source.text))) this.frequency.set(term, (this.frequency.get(term) ?? 0) + 1);
    this.averageLength = documents.reduce((sum, d) => sum + d.length, 0) / Math.max(1, documents.length);
    return changed;
  }
  keywordGroups(query) {
    const seen = new Set();
    const groups=[...query.matchAll(/[\p{L}\p{N}_][\p{L}\p{N}\p{M}_]*/gu)].flatMap(match => {
      const word = match[0].toLocaleLowerCase().normalize('NFKC');
      if (seen.has(word)) return [];
      seen.add(word);
      const results = (this.wordForms?.get(wordFamily(word)) ?? []).map(source => {
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
      if (d.vector || (windowsOnly&&d.isFine) || seen.has(d.embeddingText)) return false;
      seen.add(d.embeddingText); return true;
    }).sort((a,b)=>Math.min(1024,a.embeddingText.length)-Math.min(1024,b.embeddingText.length)).slice(0,limit);
  }
  accept(batch, vectors) {
    const ready = new Map(batch.map((document,index) => [document.embeddingText,vectors[index]]));
    for(const [text,vector] of ready){if(this.vectorCache.size>=8192)this.vectorCache.delete(this.vectorCache.keys().next().value);this.vectorCache.set(text,vector);}
    for (const document of this.documents) if (ready.has(document.embeddingText)) document.vector = ready.get(document.embeddingText);
  }
  restoreVectors(records){
    const ready=records.filter(r=>r.embeddingVersion===this.embeddingVersion&&Array.isArray(r.vector));
    this.accept(ready,ready.map(r=>r.vector));
  }
  search(query, queryVector, limit = 6, {semanticWeight = .9, lexicalCoverage = true, dedupe = true,windowsOnly=false,semanticFloor=this.semanticFloor,documents=this.documents} = {}) {
    const queryTerms = [...new Set(terms(query))];
    if (!queryTerms.length) return [];
    const n = this.messageCount;
    // Rare terms (names, code identifiers, numbers) keep a semantic paraphrase
    // about the wrong person from outranking a matching passage about the right one.
    const anchors = queryTerms.filter(term => this.entities.has(term) && this.frequency.has(term) && this.frequency.get(term) / Math.max(1, n) < .45);
    const scored = documents.filter(d=>!windowsOnly||!d.isFine).map(document => {
      let lexical = 0;
      for (const term of queryTerms) {
        const tf = document.terms.get(term) ?? 0;
        const df = this.frequency.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + .5) / (df + .5));
        lexical += idf * tf * 2.2 / (tf + 1.2 * (.25 + .75 * document.length / Math.max(1, this.averageLength)));
      }
      const semantic = cosine(document.vector, queryVector);
      const coverage = queryTerms.filter(term => document.terms.has(term)).length / queryTerms.length;
      const anchorCoverage = anchors.length ? anchors.filter(term => document.terms.has(term) || terms(document.context).includes(term)).length / anchors.length : 1;
      const lexicalScore = lexical / (lexical + 2) * (lexicalCoverage ? coverage : 1);
      // Each vector describes this passage itself. Short, substantive answers
      // must compete equally with inputs, without a role/word-count penalty.
      const score = (queryVector ? semanticWeight * Math.max(0, semantic) + (1 - semanticWeight) * lexicalScore : lexical / (lexical + 2)) * (.65 + .35 * anchorCoverage);
      return { ...document, lexical, semantic, score, coverage };
    }).filter(d => queryVector && d.vector ? d.semantic >= semanticFloor || (d.lexical > 1 && d.coverage >= .5) : d.lexical > 0);
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
