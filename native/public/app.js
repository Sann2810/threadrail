import { SearchIndex } from '../../src/search-index.js';
import { EmbeddingClient } from '../../src/embedding-client.js';
import { codingSemanticContext,nativeMeaningQueries,nativeQueryVector } from '../semantic-context.mjs';
import { SEARCH_MODEL, retrievalQuery } from '../../src/search-model.js';
import { RankedSearch } from '../../src/search-ranker.js';
const $=selector=>document.querySelector(selector),index=new SearchIndex(SEARCH_MODEL),client=new EmbeddingClient();
const rankedSearch=new RankedSearch(index,client,renderResults);
const sessions=new Map(),snapshots=new Map(),cursors=new Map(),queryVectors=new Map();
let selected=null,indexing=false,scanToken=0,scopeRevision=0,openToken=0,embedding=false,modelFailed=false,queryTimer,queryToken=0,noticeTimer,bestKey,wordsKey;
const node=(tag,cls,value)=>{const n=document.createElement(tag);n.className=cls;n.textContent=value;return n;};
const error=value=>{const el=$('#error');el.textContent=value?.message??'';el.hidden=!value;};
const notice=value=>{$('#notice').textContent=value;$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,5000);};
async function api(action,args){const response=await fetch(`/api/${action}`,{method:'POST',headers:{'Content-Type':'application/json','X-ThreadRail':'local'},body:JSON.stringify(args)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not read saved sessions.');return data;}
function renderSessions(){
  $('#sessions').replaceChildren();
  for(const session of sessions.values()){
    const button=node('button',session.id===selected?'active':'',session.title);button.dataset.sessionId=session.id;
    button.append(node('small','',session.provider));button.onclick=()=>openSession(session.id).catch(error);$('#sessions').append(button);
  }
  $('#more').hidden=![...cursors.values()].some(Boolean);$('#index-sessions').disabled=!sessions.size||indexing;
  $('#coverage').textContent=`${snapshots.size} loaded · ${sessions.size} listed sessions · Partial history`;
}
async function connect(provider,more=false){
  error();const button=$(`#connect-${provider}`),revision=scopeRevision;button.disabled=true;
  try{
    const data=await api('list',{provider,cursor:more?cursors.get(provider):null,allProjects:$('#all-projects').checked});
    if(revision!==scopeRevision)return;
    for(const s of data.sessions)sessions.set(s.id,s);cursors.set(provider,data.nextCursor);renderSessions();
    $('#source-status').textContent=data.sessions.length?`Connected · ${data.sessions.length} sessions read`:'No saved sessions in this scope. Try All projects.';
    button.textContent=provider==='codex'?'Refresh Codex':'Refresh Claude Code';
  }catch(e){error(e);}finally{button.disabled=false;}
}
function sources(){
  return [...snapshots.values()].flatMap(session=>{let input='';return session.messages.flatMap(message=>{
    const text=message.text.replace(/\s+/g,' ').trim();if(message.role==='prompt')input=text;
    // Saved coding answers often change topic after a long initial brief.
    // Encode the answer itself; retain its prompt for name/context anchoring.
    const source={id:`${session.id}::${message.id}`,exchangeId:`${session.id}::${message.id}`,sessionId:session.id,messageId:message.id,chatTitle:session.title,provider:session.provider,role:message.role,text,sourceText:text,inputText:input,context:input,embeddingContext:codingSemanticContext(text)};
    const blocks=[];let cursor=0;
    if(message.role==='answer'&&text.split(/\s+/).length>140)for(const [i,raw]of message.text.split(/\n\s*\n/).entries()){
      const block=raw.replace(/\s+/g,' ').trim();if(!block)continue;
      const offset=text.indexOf(block,cursor);if(offset<0)continue;cursor=offset+block.length;
      // Encode a self-contained saved paragraph on its own. Keep its original
      // input as anchor context so names still disambiguate otherwise similar text.
      blocks.push({...source,id:`${source.id}:block:${i}`,text:block,isPassage:true,sourceOffset:offset,embeddingContext:codingSemanticContext(block)});
    }
    return[source,...blocks];
  });});
}
function syncIndex(){index.sync(sources());renderSessions();renderResults();if($('#query').value.trim())embedIndex();}
async function embedIndex(){
  if(embedding||modelFailed)return;embedding=true;
  try{for(let batch;$('#query').value.trim()&&(batch=index.pending()).length;){index.accept(batch,await client.embed(batch.map(d=>d.embeddingText)));renderResults();}}
  catch{modelFailed=true;renderResults();}finally{embedding=false;}
}
async function openSession(id,result,refresh=false){
  error();const revision=scopeRevision,token=++openToken;$('#source-status').textContent='Reading saved session…';
  const session=refresh||!snapshots.has(id)?await api('read',{id}):snapshots.get(id);
  if(revision!==scopeRevision||token!==openToken)return;
  snapshots.set(id,session);selected=id;syncIndex();
  const transcript=$('#transcript'),oldTop=transcript.scrollTop;
  transcript.replaceChildren();$('#session-title').textContent=session.title;$('#session-meta').textContent=`${session.provider} · ${session.messages.length} saved messages${session.partial?' · Partial history':''}`;
  $('#refresh-session').disabled=$('#resume-command').disabled=false;
  for(const message of session.messages){
    const article=node('article',`message ${message.role==='prompt'?'user':'answer'}`,'');
    const body=node('div','message-text',message.text);body.dataset.messageAuthorRole=message.role==='prompt'?'user':'assistant';body.dataset.messageId=message.id;
    if(message.complete)body.dataset.messageStatus='complete';
    article.append(node('div','message-label',message.role==='prompt'?'You':session.provider),body);transcript.append(article);
  }
  if(!session.messages.length)transcript.append(node('div','empty','No saved input/output text was readable in this session.'));
  const controller=globalThis.__threadrail?.controller;controller?.refresh();
  if(result){
    const target=[...transcript.querySelectorAll('[data-message-id]')].find(el=>el.dataset.messageId===result.messageId);
    if(!target)throw new Error('That saved passage is no longer available. Refresh the session.');
    $('#query').value='';renderResults();controller?.refresh();
    if(controller)controller.jumpSearch({...result,matchOffset:(result.sourceOffset??0)+(result.matchOffset??0),element:target});else target.scrollIntoView({block:'start'});
  }else transcript.scrollTop=refresh?oldTop:0;
  renderSessions();
  $('#source-status').textContent='Session loaded';
}
function resultRow(result){
  const row=node('button','result','');row.dataset.messageId=result.messageId;row.dataset.sessionId=result.sessionId;
  row.append(node('strong','',result.chatTitle),node('small','',`${result.provider} · ${result.role==='prompt'?'You':'Answer'}`));
  const excerpt=node('span','excerpt','');
  if(result.highlightLength){const mark=node('mark','',result.matchText.slice(result.highlightStart,result.highlightStart+result.highlightLength));excerpt.append(result.matchText.slice(0,result.highlightStart),mark,result.matchText.slice(result.highlightStart+result.highlightLength));}
  else excerpt.textContent=result.excerpt;
  row.append(excerpt);row.onclick=()=>openSession(result.sessionId,result).catch(error);return row;
}
function renderResults(){
  const query=$('#query').value.trim(),pending=index.documents.filter(d=>!d.vector).length,vector=queryVectors.get(query);
  $('#results').hidden=!query;
  const ranked=query?rankedSearch.get(query,vector):null;
  $('#search-status').textContent=modelFailed?'Word search only':query&&(pending||!vector||ranked?.pending)?`Searching… ${index.documents.length-pending}/${index.documents.length}`:ranked?.error?'Passage ranking unavailable':'';
  if(!query){$('#best').replaceChildren();$('#words').replaceChildren();bestKey=wordsKey=null;return;}
  const seen=new Set(),best=(ranked&&!ranked.pending?ranked.results:index.search(query,vector,index.documents.length)).filter(r=>{if(seen.has(r.sessionId))return false;seen.add(r.sessionId);return true;}).slice(0,12);
  const nextBest=JSON.stringify(best.map(r=>[r.id,r.excerpt]));
  if(nextBest!==bestKey){bestKey=nextBest;$('#best').replaceChildren();if(best.length)$('#best').append(node('h2','','Best matches'),...best.map(resultRow));}
  const groups=index.keywordGroups(query);
  const nextWords=JSON.stringify([query,groups.map(g=>[g.word,g.results.map(r=>[r.id,r.excerpt])])]);
  if(nextWords!==wordsKey){wordsKey=nextWords;$('#words').replaceChildren();
  for(const group of groups){
    const section=node('section','word-group','');section.setAttribute('aria-label',`${group.label} matches`);
    const heading=node('h3','','');heading.append(node('span','tag',group.label),node('span','count',String(group.results.length)));section.append(heading);
    let shown=0;const more=node('button','more-matches','Show more');more.setAttribute('aria-label',`More ${group.label} matches`);
    const append=()=>{more.remove();section.append(...group.results.slice(shown,shown+20).map(resultRow));shown+=20;if(shown<group.results.length)section.append(more);};more.onclick=append;append();$('#words').append(section);
  }
  if(groups.length)$('#words').prepend(node('h2','','By word'));
  }
  if(!best.length&&!groups.some(g=>g.results.length)&&(!pending||modelFailed)&&!ranked?.pending&&(!query||vector||modelFailed))$('#search-status').textContent=snapshots.size?'No matches':'Load or index sessions first';
}
$('#query').oninput=()=>{
  clearTimeout(queryTimer);const query=$('#query').value.trim(),token=++queryToken;renderResults();if(!query)return;
  embedIndex();
  if(queryVectors.has(query))return;
  queryTimer=setTimeout(async()=>{try{const vectors=await client.embed(nativeMeaningQueries(query).map(retrievalQuery));queryVectors.set(query,nativeQueryVector(vectors));}catch{modelFailed=true;}if(token===queryToken)renderResults();},180);
};
for(const provider of ['codex','claude'])$(`#connect-${provider}`).onclick=()=>connect(provider);
$('#more').onclick=async()=>{for(const [provider,cursor]of cursors)if(cursor)await connect(provider,true);};
$('#all-projects').onchange=()=>{scanToken++;scopeRevision++;sessions.clear();snapshots.clear();cursors.clear();selected=null;syncIndex();$('#transcript').replaceChildren();$('#session-title').textContent='Choose a saved session';$('#session-meta').textContent='Connect a source in the selected scope.';$('#refresh-session').disabled=$('#resume-command').disabled=true;$('#scope-note').textContent=$('#all-projects').checked?'All local projects · Saved text only':'This project · Saved text only';};
$('#index-sessions').onclick=async()=>{
  const token=++scanToken;indexing=true;renderSessions();$('#stop-index').hidden=false;
  try{for(const session of sessions.values()){if(token!==scanToken)break;$('#source-status').textContent=`Reading ${session.provider} sessions…`;try{const snapshot=await api('read',{id:session.id});if(token!==scanToken)break;snapshots.set(session.id,snapshot);syncIndex();}catch(e){error(e);}}$('#source-status').textContent=token===scanToken?'Listed sessions indexed':'Indexing stopped';}
  finally{indexing=false;$('#stop-index').hidden=true;renderSessions();}
};
$('#stop-index').onclick=()=>{scanToken++;};
$('#refresh-session').onclick=()=>openSession(selected,null,true).catch(error);
const quote=value=>`'${String(value).replaceAll("'","'\\''")}'`;
$('#resume-command').onclick=async()=>{
  const s=sessions.get(selected);if(!s)return;
  const command=`${s.cwd?`cd -- ${quote(s.cwd)} && `:''}${s.provider==='Codex'?'codex resume':'claude --resume'} ${quote(s.nativeId)}`;
  try{await navigator.clipboard.writeText(command);notice('Resume command copied. Run it in your terminal when ready.');}catch{error(new Error('Clipboard unavailable. Session ID: '+s.nativeId));}
};
