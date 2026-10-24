import test from 'node:test';
import assert from 'node:assert/strict';
import {ThreadHistory} from '../src/thread-history.js';
import {SearchIndex} from '../src/search-index.js';
const url='https://claude.ai/chat/local';
const source=(id,text,position)=>({id,archiveId:`claude:${id}:answer:0`,exchangeId:id,role:'answer',text,context:'',inputText:id,position,element:{isConnected:true}});
test('unloaded windows retain text, chronology and vectors without retaining detached DOM',()=>{
  const history=new ThreadHistory(url),a=source('a','Zen packed a blue suitcase.',1),b=source('b','Rey fixed the broken radiator.',2);
  history.observe([a,b]);const index=new SearchIndex();index.sync(history.sources());index.accept(index.documents,index.documents.map(()=>[1,0]));
  a.element.isConnected=false;history.observe([b]);index.sync(history.sources());
  assert.equal(history.sources()[0].element,null);assert.equal(history.sources()[0].retained,true);
  assert.equal(index.keywordGroups('Zen')[0].results.length,1);assert.ok(index.documents.every(d=>d.vector));
  history.observe([{...a,element:{isConnected:true}},b]);index.sync(history.sources());
  assert.ok(history.sources()[0].element.isConnected);assert.ok(index.documents.every(d=>d.vector));
  history.observe([{...a,text:'Zen left the bag behind.',element:{isConnected:true}},b]);index.sync(history.sources());
  assert.equal(index.keywordGroups('suitcase')[0].results.length,0);assert.equal(history.messages.length,2);
});
test('disjoint earlier windows use host ordinals and restoration cannot overwrite a live edit',()=>{
  const history=new ThreadHistory(url),late=source('z','The original ending.',32);
  history.observe([late]);history.observe([source('a','The earlier chapter.',1)]);
  assert.deepEqual(history.messages.map(m=>m.position),[1,32]);
  const saved=structuredClone(history.messages);history.observe([{...late,text:'The edited ending.'}]);history.restore(saved);
  assert.equal(history.messages.at(-1).text,'The edited ending.');
});
test('disjoint windows without ordinals preserve a known prepend direction',()=>{
  const history=new ThreadHistory(url);history.observe([source('b','The second chapter.')]);history.observe([source('a','The first chapter.')],{prepend:true});
  assert.deepEqual(history.messages.map(m=>m.inputText),['a','b']);
});
test('persisted vectors are reused by version and text, with length-bucketed missing batches',()=>{
  const index=new SearchIndex({embeddingVersion:'current'});
  index.sync([source('long','An extended passage about paperwork. '.repeat(100)),source('short','The suitcase is blue.')]);
  const batch=index.pending(8);assert.ok(batch.every((d,i)=>i===0||Math.min(1024,d.embeddingText.length)>=Math.min(1024,batch[i-1].embeddingText.length)));
  index.restoreVectors([{embeddingText:'The suitcase is blue.',embeddingVersion:'old',vector:[1,0]}]);
  assert.equal(index.documents.find(d=>d.text==='The suitcase is blue.').vector,undefined);
  index.restoreVectors([{embeddingText:'The suitcase is blue.',embeddingVersion:'current',vector:[1,0]}]);
  assert.deepEqual(index.documents.find(d=>d.text==='The suitcase is blue.').vector,[1,0]);
});
test('a fallback identity edit in the same element replaces its old remembered text',()=>{
  const history=new ThreadHistory(url),element={isConnected:true};
  const first={id:'claude:exchange-1:answer:0',role:'answer',text:'The old compass was blue.',inputText:'Continue',element};
  history.observe([first]);history.observe([{...first,text:'The new compass is green.'}]);
  assert.equal(history.messages.length,1);assert.equal(history.messages[0].text,'The new compass is green.');
});
test('identical fallback answers remain distinct across partial windows and restoration',()=>{
  const history=new ThreadHistory(url);
  const rows=Array.from({length:4},(_,i)=>({id:`claude:exchange-${i+1}:answer:0`,role:'answer',text:'The documents were reviewed.',inputText:`Review item ${i}.`,context:`Review item ${i}.`,element:{isConnected:true}}));
  history.observe(rows);rows.slice(0,3).forEach(r=>r.element.isConnected=false);history.observe(rows.slice(-1));
  assert.equal(history.messages.length,4);assert.equal(history.sources().filter(s=>s.retained).length,3);
  const reopened=new ThreadHistory(url);reopened.observe([{...rows[3],id:'claude:exchange-99:answer:0',element:{isConnected:true}}]);reopened.restore(structuredClone(history.messages));
  assert.equal(reopened.messages.length,4);assert.equal(new Set(reopened.sources().map(s=>s.id)).size,4);
});
test('a history larger than the vector reuse cache never evicts its active index vectors',()=>{
  const index=new SearchIndex(),rows=Array.from({length:8300},(_,i)=>source(`m${i}`,`Review unique office document ${i}.`));
  index.sync(rows);index.accept(index.documents,index.documents.map(()=>[1,0]));index.sync(rows);
  assert.equal(index.pending().length,0);
});

test('earlier windows precede a tail even when the newest reply remains pinned',()=>{
  const history=new ThreadHistory(url);
  const rows=['a','b','c','d'].map(id=>source(id,`Orchid ${id}.`));
  history.observe(rows.slice(2));
  history.observe([rows[0],rows[1],rows[3]],{prepend:true});
  assert.deepEqual(history.messages.map(m=>m.inputText),['a','b','c','d']);
  assert.equal(history.messages.length,4);
});
test('fresh windows repair already-misordered cached messages and persist proof across restart',()=>{
  const history=new ThreadHistory(url),rows=['a','b','c','d'].map((id,i)=>source(id,`Orchid ${id}.`,i+1));
  const legacy=rows.map(s=>({key:`native:${s.archiveId}:0`,nativeId:s.archiveId,role:s.role,text:s.text,inputText:s.inputText,position:s.position}));
  history.restore([legacy[2],legacy[3],legacy[0],legacy[1]]);
  const before=new Set(history.sources().map(s=>s.id));
  history.observe(rows.slice(2));history.observe([rows[0],rows[1],rows[3]],{prepend:true});
  assert.deepEqual(history.messages.map(m=>m.inputText),['a','b','c','d']);
  assert.deepEqual(new Set(history.sources().map(s=>s.id)),before);
  const reopened=new ThreadHistory(url);reopened.restore([history.messages[2],history.messages[0],history.messages[3],history.messages[1]]);
  assert.deepEqual(reopened.messages.map(m=>m.inputText),['a','b','c','d']);
  reopened.observe([rows[3]]);
  assert.deepEqual(reopened.messages.map(m=>m.inputText),['a','b','c','d']);
});
test('changing ordinal totals cannot interleave old numbering with newly revealed history',()=>{
  const history=new ThreadHistory(url);
  const late={...source('d','Orchid final.',4),positionFrame:'messages:4'};
  history.observe([late]);
  const earlier=['a','b','c'].map((id,i)=>({...source(id,`Orchid ${id}.`,i+1),positionFrame:'messages:12'}));
  history.observe([...earlier,{...late,position:12,positionFrame:'messages:12'}],{prepend:true});
  assert.deepEqual(history.messages.map(m=>m.inputText),['a','b','c','d']);
  assert.deepEqual(history.messages.map(m=>m.position),[1,2,3,12]);
});
