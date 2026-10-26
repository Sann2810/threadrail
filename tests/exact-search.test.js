import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchIndex,quantizeVector} from '../src/search-index.js';
import {rankPassages,exactSearch} from '../src/search-ranker.js';

// Deterministic pseudo-random numbers, so a failure can be replayed.
const random=seed=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
const unit=values=>{const norm=Math.hypot(...values);return values.map(v=>Math.fround(v/norm));};
const words='kettle harbor orchid lantern meadow copper violin glacier pepper ribbon canyon walnut'.split(' ');

function library(seed){
  const next=random(seed),query=unit(Array.from({length:384},()=>next()-.5)),sources=[],vectors=new Map();
  for(let chat=0;chat<14;chat++)for(let message=0;message<6;message++){
    const text=Array.from({length:12+Math.floor(next()*30)},()=>words[Math.floor(next()*words.length)]).join(' ')+'. '+
      Array.from({length:10},()=>words[Math.floor(next()*words.length)]).join(' ')+'.';
    sources.push({id:`https://chat/${chat}::m${message}`,exchangeId:`https://chat/${chat}::m${message}`,chatURL:`https://chat/${chat}`,role:message%2?'answer':'prompt',text,context:''});
  }
  const exact=new SearchIndex({semanticFloor:.3}),compressed=new SearchIndex({semanticFloor:.3});
  exact.sync(sources);compressed.sync(sources);
  // Vectors lean toward the query by random amounts, so scores crowd together.
  for(const d of exact.documents)if(!vectors.has(d.embeddingText)){const lean=next();vectors.set(d.embeddingText,unit(query.map(q=>lean*q+(next()-.5)*.08)));}
  exact.accept(exact.documents,exact.documents.map(d=>vectors.get(d.embeddingText)));
  compressed.restoreVectors(compressed.documents.map(d=>({textKey:d.textKey,...quantizeVector(vectors.get(d.embeddingText))})));
  return {query,exact,compressed,vectors};
}
const client=vectors=>{const calls={embedded:0};return {calls,
  embed:async texts=>{calls.embedded+=texts.length;return texts.map(text=>vectors.get(text));},
  rerank:async(query,texts)=>texts.map(text=>[...text].reduce((h,c)=>(h*31+c.charCodeAt(0))%997,7)/997)};};

test('compressed vectors with exact rechecks rank exactly like exact vectors',async()=>{
  let rechecked=0,total=0;
  for(let seed=1;seed<=40;seed++){
    const {query,exact,compressed,vectors}=library(seed),c=client(vectors);
    for(const q of ['kettle harbor','orchid meadow lantern','copper violin','glacier']){
      const a=await rankPassages(exact,q,query,c,exact.documents.length);
      const b=await rankPassages(compressed,q,query,c,compressed.documents.length);
      assert.deepEqual(b.map(d=>[d.id,d.score]),a.map(d=>[d.id,d.score]),`seed ${seed}, query ${q}`);
      const first=list=>list.slice(0,12),options={windowsOnly:true,semanticFloor:-1};
      const windows=first(await exactSearch(compressed,q,query,c,compressed.documents,first,12,options));
      assert.deepEqual(windows.map(d=>d.id),first(exact.search(q,query,1e9,{...options,dedupe:false})).map(d=>d.id),`seed ${seed}, windows ${q}`);
    }
    rechecked+=c.calls.embedded;total+=compressed.documents.length;
  }
  // Only close calls are recomputed, not the whole library.
  assert.ok(rechecked<total,`${rechecked} exact vectors for ${total} pieces`);
});

test('exact rechecks finish when a live page rebuilds the index during them',async()=>{
  const {query,exact,compressed,vectors}=library(7),sources=exact.documents.filter(d=>d.key==='0').map(d=>({id:d.sourceId,exchangeId:d.exchangeId,chatURL:d.chatURL,role:d.role,text:d.text,context:''}));
  const c=client(vectors),embed=c.embed;
  // Every embed call coincides with a host re-render: new source objects, new pieces.
  c.embed=async texts=>{compressed.sync(sources.map(s=>({...s})));return embed(texts);};
  const result=await Promise.race([rankPassages(compressed,'kettle harbor',query,c,compressed.documents.length),new Promise(resolve=>setTimeout(()=>resolve('timed out'),5000))]);
  assert.notEqual(result,'timed out');
  assert.deepEqual(result.map(d=>[d.id,d.score]),(await rankPassages(exact,'kettle harbor',query,client(vectors),exact.documents.length)).map(d=>[d.id,d.score]));
});

test('a compressed similarity always stays within its stated range',()=>{
  const next=random(99);
  for(let i=0;i<500;i++){
    const v=unit(Array.from({length:384},()=>next()-.5)),x=unit(Array.from({length:384},()=>next()-.5));
    const index=new SearchIndex({semanticFloor:-1});index.sync([{id:'a',exchangeId:'a',role:'answer',text:'kettle harbor',context:''}]);
    index.restoreVectors([{textKey:index.documents[0].textKey,...quantizeVector(v)}]);
    const exact=v.reduce((sum,value,j)=>sum+value*x[j],0);
    const [low]=index.search('kettle',x,1,{semanticBound:-1}),[high]=index.search('kettle',x,1,{semanticBound:1});
    assert.ok(low.semantic<=exact&&exact<=high.semantic,`${low.semantic} <= ${exact} <= ${high.semantic}`);
  }
});
