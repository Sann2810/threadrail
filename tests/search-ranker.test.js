import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchIndex} from '../src/search-index.js';
import {RankedSearch} from '../src/search-ranker.js';
const setup=()=>{const index=new SearchIndex();index.sync([{id:'a',exchangeId:'a',role:'answer',text:'A meaningful source passage.',context:''}]);index.accept(index.documents,[[1,0]]);return index;};
test('pair ranking cannot restore stale results after messages change',async()=>{
  const index=setup();let finish,search;
  const changed=new Promise(resolve=>{search=new RankedSearch(index,{rerank:()=>new Promise(resolve=>{finish=resolve;})},resolve);});
  assert.equal(search.get('meaningful',[1,0]).pending,true);
  index.sync([{id:'b',exchangeId:'b',role:'answer',text:'A different current passage.',context:''}]);
  finish([2]);await changed;
  assert.ok([...search.cache.values()].every(v=>!v.results?.length));
});
test('pair ranking failure preserves semantic retrieval with an explicit failure flag',async()=>{
  const index=setup();let search;
  await new Promise(resolve=>{search=new RankedSearch(index,{rerank:async()=>{throw Error('Missing model');}},resolve);search.get('meaningful',[1,0]);});
  const result=search.get('meaningful',[1,0]);assert.equal(result.error,true);assert.equal(result.pending,false);assert.equal(result.results[0].exchangeId,'a');
});
test('cached rankings rebind unchanged passages to the current DOM source without reranking',async()=>{
  const index=setup();let search,calls=0;
  await new Promise(resolve=>{search=new RankedSearch(index,{rerank:async()=>{calls++;return [2];}},resolve);search.get('meaningful',[1,0]);});
  const element={current:true};
  const changed=index.sync([{id:'a',exchangeId:'a',role:'answer',text:'A meaningful source passage.',context:'',element}]);
  assert.equal(changed,false);
  assert.equal(search.get('meaningful',[1,0]).results[0].element,element);
  assert.equal(calls,1);
});
