import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticQuery,isUnavailableResponse } from '../src/search-text.js';
import { SearchIndex } from '../src/search-index.js';

test('meaning queries normalize common spelling variants without altering identifiers or names',()=>{
  assert.equal(semanticQuery('keeping the same person recognisable while locations change'),'keeping the same person recognizable while locations change');
  assert.equal(semanticQuery('Recognisable colour and organised behaviour'),'Recognizable color and organized behavior');
  assert.equal(semanticQuery('Zen foo_recognisable recognisable42'),'Zen foo_recognisable recognisable42');
});
test('host unavailable-response placeholders never become semantic or literal answer hits',()=>{
  const index=new SearchIndex();
  index.sync([{id:'a',exchangeId:'a',role:'answer',text:'This response couldn’t load',context:'A meaningful question',inputText:'A meaningful question'},
    {id:'p',exchangeId:'p',role:'prompt',text:'This response couldn’t load',context:'',inputText:'This response couldn’t load'}]);
  assert.equal(index.documents.length,1);assert.equal(index.documents[0].role,'prompt');
  assert.equal(index.keywordGroups('response')[0].results.length,1);
  assert.equal(isUnavailableResponse('Here is why this response couldn’t load'),false);
});
test('a common literal overlap cannot outrank a passage with stronger meaning and the intended context',()=>{
  const index=new SearchIndex();
  const sources=[{id:'formats',exchangeId:'formats',role:'answer',text:'While the channel supports other formats, its identity stays distinct.',context:'',inputText:'Production notes'},
    {id:'character',exchangeId:'character',role:'answer',text:'A storyboard establishes the scene and its lighting. '.repeat(10)+'The same recurring character must retain a consistent appearance across new settings.',context:'',inputText:'Production notes'},
    ...Array.from({length:15},(_,i)=>({id:`filler-${i}`,exchangeId:`filler-${i}`,role:'answer',text:'An unrelated discussion about recipes and cookware.',context:'',inputText:'Other notes'}))];
  index.sync(sources);
  for(const document of index.documents)document.vector=document.id.startsWith('character:')?[.3,Math.sqrt(1-.3**2)]:[.1,Math.sqrt(1-.1**2)];
  assert.equal(index.search('keeping the same person recognizable while the locations change',[1,0])[0].exchangeId,'character');
});

test('answer vectors exclude inherited prompt instructions, while strong short answers remain eligible',()=>{
  const index=new SearchIndex();
  index.sync([{id:'prompt',exchangeId:'explanation',role:'prompt',text:'Come again I got nothing from this',context:'',inputText:''},
    {id:'transition',exchangeId:'explanation',role:'answer',text:"But here's what I really want you to understand.",context:'Come again I got nothing from this',inputText:''}]);
  assert.equal(index.documents[1].embeddingText,"But here's what I really want you to understand.");
  index.sync([{id:'short',exchangeId:'short',role:'answer',text:'The radiator failed.',context:'',inputText:''},
    {id:'unrelated',exchangeId:'other',role:'prompt',text:'A new recipe for lunch.',context:'',inputText:''}]);
  index.documents[0].vector=[.95,Math.sqrt(1-.95**2)];index.documents[1].vector=[.29,Math.sqrt(1-.29**2)];
  assert.equal(index.search('broken heating appliance',[1,0])[0].id,'short:0');
  assert.equal(index.keywordGroups('radiator')[0].results.length,1);
});

test('a self-contained native paragraph can encode its own text while retaining named input anchors',()=>{
  const index=new SearchIndex();index.sync([{id:'a',exchangeId:'a',role:'answer',text:'The radiator failed.',context:'A repair for Zen',embeddingContext:'',inputText:'A repair for Zen'}]);
  assert.equal(index.documents[0].embeddingText.trim(),'The radiator failed.');
  assert.equal(index.documents[0].context,'A repair for Zen');
});
