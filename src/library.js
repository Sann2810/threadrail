import { allChats, chatURLs, chatsUpdatedSince, forgetChats, readChat, readVectors, saveChat, writeVectors } from './archive-store.js';
import { archiveSources } from './archive-model.js';
import { SearchIndex, hasVector } from './search-index.js';
import { SEARCH_MODEL } from './search-model.js';
import {libraryResults,libraryTarget,libraryQueryVector,savedChatOrder} from './library-search.js';
import { RankedSearch } from './search-ranker.js';
import { EmbeddingClient } from './embedding-client.js';
import { renderSearchColumns } from './search-results-view.js';
const $=selector=>document.querySelector(selector);
const index=new SearchIndex(SEARCH_MODEL),client=new EmbeddingClient(),queries=new Map();
const rankedSearch=new RankedSearch(index,client,render);
// Chats and their search sources are cached; reloads read only changed chats.
let chats=[],chatMap=new Map(),chatSources=new Map(),loaded=false,lastUpdated=0;
let indexing=false,searchToken=0,searchTimer,refreshTimer,scanning=false,stopped=false,modelFailed=false;
async function send(type,args={}){
  const response=await chrome.runtime.sendMessage({type:`threadrail:library-${type}`,...args});
  if(response?.error)throw new Error(response.error);return response;
}
const setError=error=>$('#error').textContent=error?.message??'';
const text=(tag,className,value)=>{const node=document.createElement(tag);node.className=className;node.textContent=value;return node;};
function resultRow(result){
  const button=document.createElement('button');button.className='library-result';
  button.append(text('span','library-result-title',result.chatTitle||'Conversation'),text('span','library-result-meta',`${result.provider} · ${result.role==='answer'?'Answer':'You'}`));
  const excerpt=text('span','library-excerpt','');
  if(result.highlightLength){
    const mark=text('mark','',result.matchText.slice(result.highlightStart,result.highlightStart+result.highlightLength));
    excerpt.append(result.matchOffset?'…':'',result.matchText.slice(0,result.highlightStart),mark,result.matchText.slice(result.highlightStart+result.highlightLength));
  }else excerpt.textContent=result.excerpt;
  button.append(excerpt);
  button.onclick=async()=>{
    setError();button.disabled=true;
    try{await send('open',{target:libraryTarget(result)});}catch(error){setError(error);}finally{button.disabled=false;}
  };
  return button;
}
function render(){
  const query=$('#query').value.trim(),vector=queries.get(query);
  const pending=index.documents.filter(d=>!hasVector(d)).length;
  const ranked=query?rankedSearch.get(query,vector):null;
  $('#search-status').textContent=!query?'':modelFailed?'Smart search unavailable. Reopen to retry.':pending?`Preparing search… ${index.documents.length-pending}/${index.documents.length}`:!vector?'Searching…':ranked?.pending?'Ranking matches…':ranked?.error?'Smart ranking unavailable':'';
  if(!query){renderSearchColumns($('#best'),$('#words'),[],[],{query});return;}
  const results=libraryResults(ranked&&!ranked.pending?ranked.results:index.search(query,vector,index.documents.length));
  const groups=index.keywordGroups(query);
  renderSearchColumns($('#best'),$('#words'),results,groups,{
    query, settled: !ranked?.pending&&(!pending||modelFailed)&&(Boolean(vector)||modelFailed), row:resultRow,prefix:'library',
  });
}
function querySearch(){
  clearTimeout(searchTimer);const query=$('#query').value.trim(),token=++searchToken;render();
  if(!query||queries.has(query))return;
  searchTimer=setTimeout(async()=>{
    try{const vector=await libraryQueryVector(client,query);if(queries.size>16)queries.clear();queries.set(query,vector);}
    catch{modelFailed=true;}
    if(token===searchToken)render();
  },180);
}
async function embedIndex(){
  if(indexing||modelFailed)return;indexing=true;
  try{
    for(let batch;(batch=index.pending()).length;){
      // Float32Array holds the model's float32 output exactly in half the memory.
      const vectors=(await client.embed(batch.map(document=>document.embeddingText))).map(vector=>Float32Array.from(vector));
      index.accept(batch,vectors);
      // Persist only vectors accepted by the current text version.
      const texts=new Set(batch.map(document=>document.embeddingText));
      await writeVectors(index.documents.filter(document=>texts.has(document.embeddingText)&&document.vector));
      render();
    }
  }catch{modelFailed=true;render();}finally{indexing=false;}
}
// Load every chat once, then only the chat named by an update, or the chats
// changed since the last load.
async function loadChats(url){
  if(!loaded){
    chatMap=new Map((await allChats()).map(chat=>[chat.url,chat]));
    index.restoreVectors(await readVectors());loaded=true;
  }else if(url){
    const chat=await readChat(url);if(chat)chatMap.set(url,chat);else chatMap.delete(url);
    index.restoreVectors(await readVectors(url));
  }else{
    const urls=new Set(await chatURLs());
    for(const key of chatMap.keys())if(!urls.has(key))chatMap.delete(key);
    for(const chat of await chatsUpdatedSince(lastUpdated)){chatMap.set(chat.url,chat);index.restoreVectors(await readVectors(chat.url));}
  }
  for(const chat of chatMap.values())lastUpdated=Math.max(lastUpdated,chat.updatedAt??0);
}
function sourcesOf(chat){
  let cached=chatSources.get(chat.url);
  if(cached?.chat!==chat){cached={chat,sources:archiveSources([chat])};chatSources.set(chat.url,cached);}
  return cached.sources;
}
async function refresh(url){
  await loadChats(url);
  chats=savedChatOrder([...chatMap.values()]);
  for(const key of chatSources.keys())if(!chatMap.has(key))chatSources.delete(key);
  index.sync(chats.flatMap(sourcesOf));
  const saved=chats.filter(chat=>chat.messages?.length),messages=saved.reduce((sum,chat)=>sum+sourcesOf(chat).length,0);
  $('#coverage').textContent=`${saved.length} ${saved.length===1?'chat':'chats'} · ${messages} ${messages===1?'message':'messages'} · History may be incomplete`;
  $('#empty').hidden=saved.length>0;$('#manage-title').textContent=`Saved on this device · ${saved.length} ${saved.length===1?'chat':'chats'}`;
  $('#chat-list').replaceChildren();
  for(const chat of chats){
    const row=document.createElement('div');row.className='saved-chat';
    const info=document.createElement('div');info.append(text('strong','',chat.title||'Conversation'),text('span','library-result-meta',`${chat.provider} · ${chat.messages?.length??0} messages${chat.messages?.length?'':' · Not indexed'}`));
    const remove=text('button','text-button','Remove');remove.setAttribute('aria-label',`Remove ${chat.title||'conversation'} from this device`);
    remove.onclick=async()=>{try{await forgetChats(chat.url);await refresh(chat.url);}catch(error){setError(error);}};
    row.append(info,remove);$('#chat-list').append(row);
  }
  render();embedIndex();
}
$('#query').addEventListener('input',querySearch);
$('#scan').onclick=async()=>{
  setError();scanning=true;stopped=false;$('#scan').disabled=true;$('#stop').hidden=false;$('#scan-status').textContent='Finding chats…';
  try{
    const found=await send('discover');
    for(const chat of found.chats){if(stopped)break;await saveChat({...chat,messages:[]});}
    if(!found.chats.length)throw new Error('Open a signed-in chat site with its chat list visible, then try again.');
    let completed=0,failed=0;
    for(const chat of found.chats){
      if(stopped)break;
      $('#scan-status').textContent=`Adding ${completed+failed+1}/${found.chats.length} · ${chat.title}`;
      try{await send('scan',{url:chat.url});completed++;}catch(error){if(!stopped){failed++;setError(error);}}
      await refresh(chat.url);
    }
    $('#scan-status').textContent=`${stopped?'Stopped · ':''}${completed} chats added${failed?` · ${failed} unavailable`:''}`;
  }catch(error){setError(error);$('#scan-status').textContent='';}
  finally{scanning=false;$('#scan').disabled=false;$('#stop').hidden=true;await refresh();}
};
$('#stop').onclick=()=>{stopped=true;send('stop').catch(setError);$('#scan-status').textContent='Stopping…';};
$('#saving').onchange=()=>chrome.storage.local.set({libraryPaused:!$('#saving').checked});
$('#clear').onclick=()=>{$('#clear-confirm').hidden=false;};
$('#cancel-clear').onclick=()=>{$('#clear-confirm').hidden=true;};
$('#confirm-clear').onclick=async()=>{
  try{stopped=true;if(scanning)await send('stop');await chrome.storage.local.set({libraryPaused:true});$('#saving').checked=false;await forgetChats();$('#clear-confirm').hidden=true;loaded=false;await refresh();}catch(error){setError(error);}
};
// Updates name their chat; several at once fall back to a changed-since reload.
let updated=new Set();
chrome.runtime.onMessage.addListener(message=>{
  if(message.type!=='threadrail:archive-updated')return;
  updated.add(message.url??null);clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>{const urls=updated;updated=new Set();refresh(urls.size===1&&!urls.has(null)?[...urls][0]:undefined).catch(setError);},400);
});
window.addEventListener('pagehide',()=>{if(scanning)send('stop').catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!scanning)refresh().catch(setError);});
const {libraryPaused=false}=await chrome.storage.local.get('libraryPaused');$('#saving').checked=!libraryPaused;
try{$('#query').value=decodeURIComponent(location.hash.slice(1));}catch{}
await refresh().catch(setError);querySearch();
