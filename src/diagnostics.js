import {allChats,readVectors,writeVectors} from './archive-store.js';
import {archiveSources} from './archive-model.js';
import {SearchIndex,hasVector} from './search-index.js';
import {SEARCH_MODEL} from './search-model.js';
import {EmbeddingClient} from './embedding-client.js';
import {libraryTarget,savedChatOrder,searchSavedIndex} from './library-search.js';
import {diagnosticPlan,diagnosticGroundTruth,checkDiagnosticRank,diagnosticExport} from './diagnostics-model.js';
const $=selector=>document.querySelector(selector);
const send=async(type,args={})=>{
  const result=await chrome.runtime.sendMessage({type:`threadrail:diagnostic-${type}`,...args});
  if(result?.error)throw Error(result.error);return result;
};
let chats=[],running=false,stopped=false,forgotten=false,token,report,runAbort;
const check=()=>{if(stopped||forgotten)throw Error('Stopped');};
function planSummary(){
  const cases=[...$('#cases').children];$('#plan-summary').textContent=`${cases.length} ${cases.length===1?'test':'tests'}`;
  cases.forEach((node,i)=>node.querySelector('legend').textContent=`Test ${i+1}`);
}
function addCase(test={}){
  const fieldset=document.createElement('fieldset');fieldset.className='diagnostic-case';
  const legend=document.createElement('legend');legend.textContent=`Test ${$('#cases').children.length+1}`;fieldset.append(legend);
  for(const [key,label,kind]of [['query','Vague query','input'],['expectedChatURL','Expected chat','select'],['expectedPassage','Expected passage','textarea']]){
    const wrapper=document.createElement('label');wrapper.textContent=label;
    const field=document.createElement(kind);field.name=key;field.required=true;
    if(kind==='select'){
      const empty=document.createElement('option');empty.value='';empty.textContent='Choose a saved chat';field.append(empty);
      for(const chat of chats){const option=document.createElement('option');option.value=chat.url;option.textContent=`${chat.provider} · ${chat.title}`;field.append(option);}
      if(test[key]&&!chats.some(chat=>chat.url===test[key])){const option=document.createElement('option');option.value=test[key];option.textContent=`Not saved · ${test[key]}`;field.append(option);}
    }else field.maxLength=key==='query'?800:1200;
    field.value=test[key]??'';wrapper.append(field);fieldset.append(wrapper);
  }
  const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='Remove test';remove.onclick=()=>{fieldset.remove();planSummary();};fieldset.append(remove);$('#cases').append(fieldset);planSummary();
}
function render(){
  $('#report').hidden=!report;
  if(!report)return;
  const passed=report.results.filter(r=>r.ok).length,total=report.results.length;
  $('#summary').textContent=`${passed}/${report.total??total} passed${report.state==='running'?' · Running':report.state==='stopped'?' · Stopped':report.state==='interrupted'?' · Interrupted':''}`;
  $('#checks').replaceChildren();
  for(const row of report.results){
    const item=document.createElement('li');item.className=`diagnostic-check ${row.ok?'pass':'fail'}`;
    const title=document.createElement('strong');title.textContent=`Round ${row.round} · Test ${row.case+1} · ${row.ok?'Passed':'Failed'}`;item.append(title);
    const detail=document.createElement('p');detail.textContent=row.reason??`First match: ${row.actualTitle}. Passage visible and stable.`;item.append(detail);
    if(row.jump?.second?.textFound){const metrics=document.createElement('p');metrics.className='notice';metrics.textContent=`Passage ${Math.round(row.jump.second.top)} px · Header ${Math.round(row.jump.second.headerBottom)} px`;item.append(metrics);}
    $('#checks').append(item);
  }
}
const saveReport=async()=>{if(!forgotten&&report)await chrome.storage.local.set({diagnosticReport:report});};
function setRunning(value){
  running=value;$('#run').disabled=value;$('#stop').hidden=!value;$('#import').disabled=value;$('#import-button').disabled=value;$('#add').disabled=value;
  for(const node of $('#cases').querySelectorAll('input,textarea,select,button'))node.disabled=value;
  $('#export').disabled=value;
}
async function stop(){stopped=true;runAbort?.abort();$('#status').textContent='Stopping…';if(token)await send('finish',{token}).catch(()=>{});}
$('#tests').onsubmit=async event=>{
  event.preventDefault();if(running)return;$('#error').textContent='';
  let tests;
  try{tests=diagnosticPlan([...$('#cases').children].map(row=>Object.fromEntries([...row.querySelectorAll('[name]')].map(field=>[field.name,field.value]))));}
  catch(error){$('#plan').open=true;$('#error').textContent=error.message;return;}
  stopped=false;forgotten=false;runAbort=new AbortController();setRunning(true);
  report={version:chrome.runtime.getManifest().version,embeddingVersion:SEARCH_MODEL.embeddingVersion,
    startedAt:new Date().toISOString(),state:'running',rounds:2,total:tests.length*2,results:[]};render();
  try{
    await chrome.storage.local.set({diagnosticPlan:{cases:tests}});await saveReport();
    const owner=await chrome.tabs.getCurrent();if(!owner?.id)throw Error('Open diagnostics in a tab.');({token}=await send('begin',{owner:owner.id}));check();
    for(const round of [1,2]){
      check();$('#status').textContent=`Round ${round}/2 · Loading saved chats…`;
      const saved=savedChatOrder(await allChats()),sources=archiveSources(saved),index=new SearchIndex(SEARCH_MODEL),client=new EmbeddingClient();
      index.sync(sources);index.restoreVectors(await readVectors());
      report.coverage={chats:saved.length,messages:index.messageCount,partial:true};
      try{for(const [number,test]of tests.entries()){
        check();const row={round,case:number,query:test.query,expectedChatURL:test.expectedChatURL,expectedPassage:test.expectedPassage,ok:false};
        try{
          const ground=diagnosticGroundTruth(test,sources);if(!ground.ok)throw Error(ground.reason);
          $('#status').textContent=`Round ${round}/2 · Test ${number+1}/${tests.length} · Searching…`;
          const results=await searchSavedIndex(index,client,test.query,{check,signal:runAbort.signal,onBatch:async batch=>{
            await writeVectors(batch.filter(d=>d.vector));check();
            $('#status').textContent=`Round ${round}/2 · Preparing search… ${index.documents.filter(hasVector).length}/${index.documents.length}`;
          }});
          const first=results[0];Object.assign(row,checkDiagnosticRank(test,results),{actualChatURL:first?.chatURL,actualTitle:first?.chatTitle,excerpt:first?.excerpt});
          if(row.ok){
            $('#status').textContent=`Round ${round}/2 · Test ${number+1}/${tests.length} · Checking passage…`;
            row.jump=await send('jump',{token,target:libraryTarget(first),expectedPassage:test.expectedPassage});check();
            row.ok=row.jump.ok;row.reason=row.jump.reason??(row.ok?undefined:'Passage check failed');
          }
        }catch(error){check();row.ok=false;row.reason=error.message;}
        check();report.results.push(row);render();await saveReport();
      }}finally{client.destroy();}
    }
    report.state='complete';$('#status').textContent='Finished.';
  }catch(error){
    if(stopped||forgotten){if(report)report.state='stopped';if(!forgotten)$('#status').textContent='Stopped.';}
    else{report.state='error';$('#error').textContent=error.message;$('#status').textContent='Run stopped.';}
  }finally{
    if(token)await send('finish',{token}).catch(()=>{});token=null;runAbort=null;
    if(report)report.finishedAt=new Date().toISOString();if(!forgotten){render();await saveReport();}setRunning(false);
  }
};
$('#stop').onclick=()=>stop();
$('#add').onclick=()=>{if($('#cases').children.length<12){addCase();$('#plan').open=true;}};
$('#import-button').onclick=()=>$('#import').click();
$('#import').onchange=async()=>{
  $('#error').textContent='';
  try{
    const file=$('#import').files[0];if(!file)return;if(file.size>30000)throw Error('Test file is too large.');
    const tests=diagnosticPlan(JSON.parse(await file.text()));$('#cases').replaceChildren();tests.forEach(addCase);$('#plan').open=false;
  }catch(error){$('#error').textContent=error.message;}
};
$('#export').onclick=()=>{
  if(!report||running)return;
  const blob=new Blob([JSON.stringify(diagnosticExport(report,$('#include-text').checked),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`threadrail-search-report-${report.startedAt.slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('pagehide',()=>{if(token)chrome.runtime.sendMessage({type:'threadrail:diagnostic-finish',token}).catch(()=>{});});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local'&&forgotten&&changes.diagnosticReport?.newValue)chrome.storage.local.remove('diagnosticReport');
  if(area==='local'&&changes.diagnosticPlan&&!changes.diagnosticPlan.newValue){
    forgotten=true;stop();report=null;chats=[];$('#coverage').textContent='0 saved chats';$('#cases').replaceChildren();addCase();$('#report').hidden=true;$('#status').textContent='Saved tests and report cleared.';
    allChats().then(saved=>{if(!forgotten)return;chats=savedChatOrder(saved);$('#coverage').textContent=`${chats.length} saved chats`;$('#cases').replaceChildren();addCase();});
  }
});
chats=savedChatOrder(await allChats());$('#coverage').textContent=`${chats.length} saved chats`;
const saved=await chrome.storage.local.get(['diagnosticPlan','diagnosticReport']);
try{if(saved.diagnosticPlan){diagnosticPlan(saved.diagnosticPlan).forEach(addCase);$('#plan').open=false;}else addCase();}catch{addCase();}
report=saved.diagnosticReport;if(report?.state==='running')report.state='interrupted';render();
