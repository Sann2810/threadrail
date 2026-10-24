import test from 'node:test';
import assert from 'node:assert/strict';
import {chatURL,snapshotMessages,mergeMessages,archiveSources,normalizeArchiveMessages} from '../src/archive-model.js';
const message=(key,text=key)=>({key,role:'answer',text});
test('legacy Claude answer indices migrate to their row UUID without duplicating the message',()=>{
  const id='claude:01a0f25b-02fd-74a1-a225-67a8e4e4d577:answer:';
  const rows=[0,1].map(i=>({nativeId:id+i,key:`native:${id+i}:0`,role:'answer',text:'One original answer.'}));
  const normalized=normalizeArchiveMessages(rows);
  assert.equal(normalized.length,1);assert.equal(normalized[0].nativeId,id+'0');
  assert.equal(normalizeArchiveMessages([{...rows[0],nativeId:'custom:shared:answer:0',key:'custom:0'},{...rows[1],nativeId:'custom:shared:answer:1',key:'custom:1'}]).length,2);
});
test('archive URLs accept saved conversations and reject home, login and foreign schemes',()=>{
  assert.equal(chatURL('https://chatgpt.com/c/abc?ref=foo#bar'),'https://chatgpt.com/c/abc');
  assert.equal(chatURL('https://chatgpt.com/g/g-project/c/abc'),'https://chatgpt.com/g/g-project/c/abc');
  assert.equal(chatURL('https://chatgpt.com/codex/tasks/task_abc?tab=log'),'https://chatgpt.com/codex/tasks/task_abc');
  assert.equal(chatURL('https://claude.ai/code/session_abc?tab=log'),'https://claude.ai/code/session_abc');
  assert.equal(chatURL('https://chatgpt.com/codex/cloud'),null);
  assert.equal(chatURL('https://gemini.google.com/u/1/app/abc'),'https://gemini.google.com/u/1/app/abc');
  for(const url of ['https://chatgpt.com/','https://claude.ai/login','https://gemini.google.com/app','javascript:alert(1)','https://user:password@claude.ai/chat/abc'])assert.equal(chatURL(url),null);
});
test('merging virtual windows preserves chronology, edits, and unique native messages',()=>{
  let messages=[message('b'),message('c')];
  messages=mergeMessages(messages,[message('a'),message('b'),message('c')]);
  messages=mergeMessages(messages,[message('c','edited c'),message('d')]);
  assert.deepEqual(messages.map(m=>m.key),['a','b','c','d']);
  assert.equal(messages[2].text,'edited c');
  messages=mergeMessages(messages,[message('e'),message('f')]);
  assert.deepEqual(messages.map(m=>m.key),['a','b','c','d','e','f']);
  assert.deepEqual(messages.map(m=>m.order),[0,1,2,3,4,5]);
});
test('fallback identities distinguish repeated prompts and survive ephemeral DOM identities',()=>{
  const source=(id,role,text)=>({id,role,text,inputText:'Continue',context:''});
  const sources=[source('claude:exchange-1:prompt:0','prompt','Continue'),source('claude:exchange-1:answer:0','answer','The kettle filled with juice.'),source('claude:exchange-2:prompt:0','prompt','Continue'),source('claude:exchange-2:answer:0','answer','The beach was warm.')];
  const first=snapshotMessages(sources),second=snapshotMessages(sources.map((s,i)=>({...s,id:`claude:exchange-${i+20}:${s.role}:0`})));
  assert.notEqual(first[0].key,first[2].key);assert.deepEqual(first.map(m=>m.key),second.map(m=>m.key));
});
test('archive search IDs stay isolated between chats with identical native message IDs',()=>{
  const messages=[{key:'same',role:'prompt',text:'Zen and the kettle',context:'',inputText:'Zen'}];
  const sources=archiveSources([{url:'https://claude.ai/chat/a',messages},{url:'https://claude.ai/chat/b',messages}]);
  assert.notEqual(sources[0].id,sources[1].id);assert.notEqual(sources[0].exchangeId,sources[1].exchangeId);
});
test('a fallback prompt captured before its answer is completed without duplicating the input',()=>{
  const prompt={id:'claude:exchange-1:prompt:0',role:'prompt',text:'Continue',inputText:'Continue',context:''};
  const pending=snapshotMessages([prompt]);
  const completed=snapshotMessages([prompt,{id:'claude:exchange-1:answer:0',role:'answer',text:'Zen found the compass.',inputText:'Continue',context:'Continue'}]);
  const merged=mergeMessages(pending,completed);
  assert.deepEqual(merged.map(message=>message.role),['prompt','answer']);
  assert.equal(merged[0].pending,false);
  const twoPending=snapshotMessages([prompt,{...prompt,id:'claude:exchange-2:prompt:0'}]);
  const later=snapshotMessages([prompt,{...prompt,id:'claude:exchange-2:prompt:0'},{id:'claude:exchange-2:answer:0',role:'answer',text:'Zen found the compass.',inputText:'Continue',context:'Continue'}]);
  const repeated=mergeMessages(twoPending,later);
  assert.deepEqual(repeated.map(message=>message.role),['prompt','prompt','answer']);
  assert.equal(repeated[0].pending,true);
  assert.equal(repeated[1].pending,false);
});

test('persisted snapshots preserve ordering evidence instead of treating their array as a live window',()=>{
  const rows=['a','b','c'].map(key=>({...message(key),orderAfter:key==='a'?[]:[String.fromCharCode(key.charCodeAt(0)-1)]}));
  const merged=mergeMessages([rows[2],rows[0],rows[1]],[rows[2],rows[0],rows[1]],{observed:false});
  assert.deepEqual(merged.map(m=>m.key),['a','b','c']);
  assert.deepEqual(archiveSources([{url:'https://claude.ai/chat/order',messages:[merged[2],merged[0],merged[1]]}]).map(s=>s.messageKey),['a','b','c']);
});
test('new observed order overrides contradictory stale cached edges without losing sources',()=>{
  const previous=[{...message('a'),orderAfter:['b']},message('b'),{...message('c'),orderAfter:['a']}];
  const merged=mergeMessages(previous,[message('a'),message('b'),message('c')]);
  assert.deepEqual(merged.map(m=>m.key),['a','b','c']);
  assert.equal(new Set(merged.map(m=>m.key)).size,3);
  assert.deepEqual(normalizeArchiveMessages(merged).map(m=>m.key),['a','b','c']);
});
