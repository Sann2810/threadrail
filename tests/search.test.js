import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchIndex, chunkText } from '../src/search-index.js';
const source = (id,text,role='answer',context='A story') => ({id,exchangeId:id,role,text,context,inputText:context});
test('overlapping chunks cover an entire long answer without truncating its end', () => {
  const text = Array.from({length:1000},(_,i)=>`word${i}`).join(' ');
  const chunks = chunkText(text);
  assert.ok(chunks.length > 6);
  assert.ok(chunks.at(-1).text.endsWith('word999'));
  for (const chunk of chunks) assert.equal(text.slice(chunk.offset,chunk.offset+chunk.text.length),chunk.text);
  assert.ok(chunks[1].text.includes('word112'));
});
test('exact terms search both roles and an answer-only occurrence', () => {
  const index = new SearchIndex();
  index.sync([source('a','A quiet afternoon','prompt'),source('b','Zen hid the car keys in a teapot.')]);
  assert.equal(index.search('where were the car keys')[0].exchangeId,'b');
  assert.deepEqual(index.search('quantum giraffes'),[]);
});
test('semantic retrieval can return a paraphrase without shared query terms', () => {
  const index = new SearchIndex();
  index.sync([source('a','She behaved foolishly.'),source('b','The weather was sunny.')]);
  index.accept(index.documents,[[1,0],[0,1]]);
  assert.equal(index.search('idiotic conduct',[1,0])[0].exchangeId,'a');
});
test('edited chunks invalidate embeddings, unchanged chunks retain them, deleted sources disappear', () => {
  const index = new SearchIndex();
  index.sync([source('a','Original response'),source('b','Unchanged response')]);
  index.accept(index.documents,[[1,0],[0,1]]);
  index.sync([source('a','Edited response'),source('b','Unchanged response')]);
  assert.equal(index.documents[0].vector,undefined);
  assert.deepEqual(index.documents[1].vector,[0,1]);
  index.sync([source('b','Unchanged response')]);
  assert.deepEqual(index.documents.map(d=>d.exchangeId),['b']);
});
test('stale inference cannot overwrite an edited passage', () => {
  const index = new SearchIndex();index.sync([source('a','Old version')]);const batch=index.pending();
  index.sync([source('a','New version')]);index.accept(batch,[[1,0]]);
  assert.equal(index.documents[0].vector,undefined);
});
test('multiple matching chunks from one answer do not crowd out other exchanges', () => {
  const index=new SearchIndex();index.sync([source('a','needle '.repeat(500)),source('b','Another needle')]);
  assert.equal(index.search('needle').length,2);
});
test('word groups exhaust both roles in conversation order, including query words without chunk duplicates', () => {
  const index = new SearchIndex();
  const sources = [source('first','Zen and San planned the trip.','prompt')];
  for (let i=0;i<25;i++) sources.push(source(`a${i}`,`Chapter ${i}. Zen met Rey. ${'A quiet evening. '.repeat(150)} Zen returned.`));
  sources.push({...source('block','Zen met Rey.'),isPassage:true});
  index.sync(sources);
  const groups=index.keywordGroups('Zen san REY were off to a trip Zen');
  assert.deepEqual(groups.map(group=>group.word),['zen','san','rey','trip']);
  assert.deepEqual(groups.map(group=>group.label),['Zen','san','REY','trip']);
  assert.equal(groups[0].results.length,26);
  assert.deepEqual(groups[0].results.map(result=>result.id),['word:zen:first',...Array.from({length:25},(_,i)=>`word:zen:a${i}`)]);
  assert.equal(groups[1].results[0].role,'prompt');
  assert.equal(groups[2].results.length,25);
});
test('exact word groups respect Unicode boundaries and normalization, with source-correct jump offsets', () => {
  const index=new SearchIndex();
  const text='Filler '.repeat(300)+'Ｚｅｎ, SAN! café; zenith sandy tripwire.';
  index.sync([source('a',text),source('b','zenith sandy tripwire')]);
  const groups=index.keywordGroups('zen san trip CAFE\u0301');
  assert.deepEqual(groups.map(group=>group.results.length),[1,1,0,1]);
  for(const group of groups) for(const result of group.results) {
    assert.equal(text.slice(result.matchOffset,result.matchOffset+result.matchText.length),result.matchText);
    assert.equal(result.matchText.slice(result.highlightStart,result.highlightStart+result.highlightLength).toLowerCase().normalize('NFKC'),group.word);
  }
  index.sync([source('a','No names remain.')]);
  assert.equal(index.keywordGroups('zen')[0].results.length,0);
});


test('word forms find singing and plural variants once per message with exact source offsets',()=>{
  const index=new SearchIndex();
  const sources=[source('p','How to practise?','prompt'),source('a','Singing, singing and sings all refer to the same activity.'),source('b','Sing a note.'),source('c','A single string was used in Singapore.'),source('d','Running laps and planning trips.')];
  index.sync(sources);
  const groups=index.keywordGroups('how to sing');
  assert.deepEqual(groups.map(g=>g.word),['sing']);
  assert.deepEqual(groups.map(g=>g.results.length),[2]);
  assert.deepEqual(index.keywordGroups('how to').map(g=>g.word),['how','to']);
  assert.deepEqual(groups[0].results.map(r=>r.sourceId??r.id),['word:sing:a','word:sing:b']);
  for(const result of groups[0].results){
    const matched=result.matchText.slice(result.highlightStart,result.highlightStart+result.highlightLength);
    assert.ok(['Singing','Sing'].includes(matched));
    assert.equal(result.sourceText.slice(result.matchOffset+result.highlightStart,result.matchOffset+result.highlightStart+result.highlightLength),matched);
  }
  assert.deepEqual(index.keywordGroups('singing')[0].results.map(r=>r.sourceText),groups[0].results.map(r=>r.sourceText));
  assert.equal(index.keywordGroups('run')[0].results.length,1);
  assert.equal(index.keywordGroups('trip')[0].results.length,1);
  index.sync([source('a','The activity ended.')]);assert.equal(index.keywordGroups('sing')[0].results.length,0);
});
