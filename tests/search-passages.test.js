import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticPassages} from '../src/search-passages.js';
import {SearchIndex} from '../src/search-index.js';
import {compatibleVector,SEARCH_MODEL} from '../src/search-model.js';
import {eventSentence,eventPrompt} from './semantic-cases.js';

test('independent events and nested instructions produce verbatim passages with original offsets',()=>{
  for(const text of [eventSentence,eventPrompt,`An earlier sentence describes a quiet office.\n${eventSentence}`]){
    const passages=semanticPassages(text);
    assert.ok(passages.some(p=>p.text==='Zen accidentally poured juice into the kettle'));
    assert.ok(passages.some(p=>p.text==='San packed a blue suitcase for the ferry.'));
    for(const p of passages)assert.equal(text.slice(p.offset,p.offset+p.text.length),p.text);
  }
});

test('persisted vectors cannot cross model or query-format versions',()=>{
  const document={embeddingText:'An unchanged message.',embeddingVersion:SEARCH_MODEL.embeddingVersion};
  assert.equal(compatibleVector({embeddingText:document.embeddingText,vector:[1]},document),false);
  assert.equal(compatibleVector({...document,embeddingVersion:'previous-model'},document),false);
  assert.equal(compatibleVector({...document,embeddingText:'An edited message.'},document),false);
  assert.equal(compatibleVector({...document,vector:[1]},document),true);
});

test('finer semantic candidates preserve canonical word postings, rarity and cached vectors',()=>{
  const source={id:'a',exchangeId:'a',role:'answer',text:eventSentence,context:eventPrompt};
  const index=new SearchIndex();index.sync([source]);
  assert.ok(index.documents.length>1);
  assert.equal(index.messageCount,1);assert.equal(index.frequency.get('zen'),1);
  assert.equal(index.keywordGroups('Zen San')[0].results.length,1);
  const vectors=index.documents.map((d,i)=>[i,1]);index.accept(index.documents,vectors);
  const before=index.documents.map(d=>({id:d.id,vector:d.vector}));
  index.sync([source]);assert.deepEqual(index.documents.map(d=>({id:d.id,vector:d.vector})),before);
  index.sync([{...source,text:'An entirely different event occurs here.'}]);
  assert.ok(index.documents.every(d=>!d.vector));
  assert.equal(index.keywordGroups('Zen')[0].results.length,0);
});
