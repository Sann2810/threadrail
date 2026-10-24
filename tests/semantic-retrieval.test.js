import test from 'node:test';
import assert from 'node:assert/strict';
import {env,pipeline,AutoModelForSequenceClassification,BertTokenizer} from '@huggingface/transformers';
import {readFile} from 'node:fs/promises';
import {SearchIndex} from '../src/search-index.js';
import {SEARCH_MODEL,retrievalQuery} from '../src/search-model.js';
import {rankPassages} from '../src/search-ranker.js';
import {semanticCases,semanticMessages} from './semantic-cases.js';

test('real local model retrieves mixed-event paraphrases, preserves offsets, and rejects unrelated memories',async()=>{
  env.allowRemoteModels=false;env.localModelPath=process.cwd()+'/models/';
  const model=await pipeline('feature-extraction',SEARCH_MODEL.id,{device:'cpu',dtype:'q8'});
  const ranker=await AutoModelForSequenceClassification.from_pretrained('ms-marco-MiniLM-L-6-v2',{device:'cpu',dtype:'q8'});
  const tokenizer=new BertTokenizer(JSON.parse(await readFile('models/ms-marco-MiniLM-L-6-v2/tokenizer.json')),JSON.parse(await readFile('models/ms-marco-MiniLM-L-6-v2/tokenizer_config.json')));
  const client={rerank:async(query,texts)=>Array.from((await ranker(tokenizer(texts.map(()=>query),{text_pair:texts,padding:true,truncation:true,max_length:256}))).logits.data)};
  try{
    const embed=async texts=>(await model(texts,{pooling:SEARCH_MODEL.pooling,normalize:true,truncation:true,max_length:256})).tolist();
    const sources=semanticMessages.flatMap((m,i)=>[
      {id:`p${i}`,exchangeId:`ex${i}`,role:'prompt',text:m.prompt,context:m.prompt},
      {id:`a${i}`,exchangeId:`ex${i}`,role:'answer',text:m.answer.replace(/<[^>]*>/g,''),context:m.prompt},
    ]);
    const index=new SearchIndex(SEARCH_MODEL);index.sync(sources);
    for(let batch;(batch=index.pending(32)).length;)index.accept(batch,await embed(batch.map(d=>d.embeddingText)));
    for(const item of semanticCases){
      const [vector]=await embed([retrievalQuery(item.query)]),results=await rankPassages(index,item.query,vector,client);
      const rank=results.findIndex(result=>result.matchText.includes(item.expected));
      assert.ok(rank>=0&&rank<(item.maxRank??1),`${item.query}: ${results[0]?.matchText??'no results'}`);
      const best=results[rank];
      assert.equal(best.sourceText.slice(best.matchOffset,best.matchOffset+best.matchText.length),best.matchText);
    }
    for(const query of ['a spacecraft landed on another planet','quantum cryptography over a satellite link','medical blood test results']){
      const [vector]=await embed([retrievalQuery(query)]);assert.equal((await rankPassages(index,query,vector,client)).length,0,query);
    }
    // A generic answer must stand on its own, without borrowing a remembered
    // event or request from its original prompt.
    index.sync([{id:'p',exchangeId:'e',role:'prompt',text:'Come again I got nothing from this',context:''},
      {id:'a',exchangeId:'e',role:'answer',text:"But here's what I really want you to understand.",context:'Come again I got nothing from this'},
      {id:'feedback',exchangeId:'other',role:'answer',text:'Try “I had trouble finding the next step” and explain what you expected to happen.',context:'How do I give and receive useful design feedback?'}]);
    for(let batch;(batch=index.pending()).length;)index.accept(batch,await embed(batch.map(d=>d.embeddingText)));
    const [vector]=await embed([retrievalQuery('I was completely lost and needed that explained again')]);
    assert.equal((await rankPassages(index,'I was completely lost and needed that explained again',vector,client))[0].role,'prompt');
  }finally{await model.dispose();await ranker.dispose();}
});
