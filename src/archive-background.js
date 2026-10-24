import { chatURL } from './archive-model.js';
import {saveChat,readChat,readVectors,writeVectors} from './archive-store.js';
import {SEARCH_MODEL} from './search-model.js';
import {installDiagnostics} from './diagnostics-background.js';
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
let scanTab, discoveryTab, scanCancelled=false, discoveryCancelled=false;
const extensionPage = sender => sender.url?.startsWith(chrome.runtime.getURL(''));
async function allowedURL(value) {
  const url=chatURL(value);if(!url)throw new Error('Open a saved conversation first.');
  const origin=new URL(url).origin;
  const builtin=['https://chatgpt.com','https://chat.openai.com','https://claude.ai','https://gemini.google.com'].includes(origin);
  const {sites={}}=await chrome.storage.local.get('sites');
  if(sites[origin]?.enabled===false || (!builtin && !sites[origin]?.enabled))throw new Error('ThreadRail is paused on this site.');
  return url;
}
async function readyMessage(tabId,message,deadline=15000,cancelled=()=>false) {
  const end=Date.now()+deadline;
  while(Date.now()<end){
    if(cancelled())throw new Error('Indexing stopped.');
    try{const response=await chrome.tabs.sendMessage(tabId,message);if(response?.error==='ThreadRail is not active on this page.'){await pause(400);continue;}return response;}catch(error){if(cancelled())throw new Error('Indexing stopped.');await pause(400);}
  }
  throw new Error('Chat did not open. Check that you are signed in.');
}
export function installArchiveMessages() {
  installDiagnostics({readyMessage,allowedURL});
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id || !message.type?.startsWith('threadrail:library-'))return;
    const run=async()=>{
      if(message.type==='threadrail:library-thread'){
        if(!sender.tab||sender.tab.incognito)return {chat:null,vectors:[]};
        const url=await allowedURL(sender.url);
        return {chat:await readChat(url),vectors:await readVectors(url)};
      }
      if(message.type==='threadrail:library-thread-vectors'){
        if(!sender.tab||sender.tab.incognito)return {skipped:true};
        const {libraryPaused=false}=await chrome.storage.local.get('libraryPaused');if(libraryPaused)return {skipped:true};
        const url=await allowedURL(sender.url),documents=message.documents;
        if(!Array.isArray(documents)||documents.length>8||documents.some(d=>typeof d.id!=='string'||!d.id.startsWith(`${url}::`)||typeof d.embeddingText!=='string'||d.embeddingText.length>20000||d.embeddingVersion!==SEARCH_MODEL.embeddingVersion||!Array.isArray(d.vector)||d.vector.length!==384||d.vector.some(n=>!Number.isFinite(n))||!Number.isFinite(d.savedAt)))throw Error('Invalid thread vectors.');
        await writeVectors(documents.map(d=>({...d,chatURL:url})));return {ok:true};
      }
      if(message.type==='threadrail:library-save') {
        if(!sender.tab || sender.tab.incognito)return {skipped:true};
        const {libraryPaused=false}=await chrome.storage.local.get('libraryPaused');if(libraryPaused&&!message.manual)return {skipped:true};
        const url=await allowedURL(sender.url);
        if(url!==message.snapshot?.url)throw new Error('Chat address changed.');
        const snapshot=message.snapshot;
        if(!Array.isArray(snapshot.messages)||snapshot.messages.length>10000||snapshot.messages.some(m=>!['prompt','answer'].includes(m.role)||typeof m.key!=='string'||typeof m.text!=='string'||m.text.length>2000000))throw new Error('Invalid chat snapshot.');
        const saved=await saveChat({...snapshot,title:String(snapshot.title??'Conversation').slice(0,300),provider:String(snapshot.provider??'Chat').slice(0,60)});
        chrome.runtime.sendMessage({type:'threadrail:archive-updated'}).catch(()=>{});return saved;
      }
      if(message.type==='threadrail:library-show') {
        if(sender.tab?.incognito)throw new Error('The chat library is unavailable in private browsing.');
        const query=typeof message.query==='string'?message.query.slice(0,800):'';
        await chrome.tabs.create({url:chrome.runtime.getURL(`library.html#${encodeURIComponent(query)}`)});return {ok:true};
      }
      if(!extensionPage(sender))throw new Error('Open the ThreadRail library to use this action.');
      if(message.type==='threadrail:library-forgotten'){
        await chrome.storage.local.remove(['diagnosticPlan','diagnosticReport']);
        const tabs=await chrome.tabs.query({});
        await Promise.all(tabs.map(tab=>chrome.tabs.sendMessage(tab.id,{type:'threadrail:archive-reset',url:message.url}).catch(()=>{})));
        return {ok:true};
      }
      if(message.type==='threadrail:library-discover') {
        // Discovery has its own flag so it never revives a stopped scan.
        discoveryCancelled=false;
        const tabs=await chrome.tabs.query({});const chats=new Map();const sites=new Set();
        for(const tab of tabs){
          if(discoveryCancelled)break;
          if(tab.incognito)continue;
          try{
            discoveryTab=tab.id;
            const found=await chrome.tabs.sendMessage(tab.id,{type:'threadrail:archive-discover'});
            if(found?.chats)for(const chat of found.chats){
              const url=await allowedURL(chat.url);chats.set(url,{...chat,url});sites.add(new URL(url).hostname);
            }
          }catch{}finally{discoveryTab=null;}
        }
        return {chats:[...chats.values()],sites:[...sites]};
      }
      if(message.type==='threadrail:library-scan') {
        if(scanTab)throw new Error('A chat is already being indexed.');
        const url=await allowedURL(message.url);scanCancelled=false;
        const tab=await chrome.tabs.create({url:'about:blank',active:false});scanTab=tab.id;
        try {
          if(scanCancelled)throw new Error('Indexing stopped.');
          await chrome.storage.session.set({libraryScanTab:scanTab});
          await chrome.tabs.update(tab.id,{url});
          const response=await readyMessage(tab.id,{type:'threadrail:archive-scan'},15000,()=>scanCancelled);
          if(response?.error)throw new Error(response.error);
          if(scanCancelled)throw new Error('Indexing stopped.');
          return response;
        }finally{
          try{await chrome.tabs.remove(tab.id);}catch{}
          scanTab=null;await chrome.storage.session.remove('libraryScanTab');
        }
      }
      if(message.type==='threadrail:library-stop') {
        scanCancelled=true;discoveryCancelled=true;if(discoveryTab){try{await chrome.tabs.sendMessage(discoveryTab,{type:'threadrail:archive-cancel'});}catch{}}
        if(scanTab){try{await chrome.tabs.remove(scanTab);}catch{}}
        return {ok:true};
      }
      if(message.type==='threadrail:library-open') {
        const target=message.target;const url=await allowedURL(target?.chatURL);
        if(typeof target.matchText!=='string'||target.matchText.length>20000)throw new Error('Invalid passage.');
        const tab=await chrome.tabs.create({url:'about:blank',active:true});
        await chrome.tabs.update(tab.id,{url});
        // The passage is delivered privately through extension messaging, never
        // put into a website URL, a composer, or the clipboard.
        readyMessage(tab.id,{type:'threadrail:archive-jump',target}).catch(()=>{});
        return {ok:true,tabId:tab.id};
      }
      throw new Error('Unknown library action.');
    };
    run().then(value=>respond(value??{ok:true})).catch(error=>respond({error:error.message}));return true;
  });
  // Recover an interrupted background scan without touching user-owned tabs.
  chrome.storage.session.get('libraryScanTab').then(async({libraryScanTab})=>{
    if(libraryScanTab && libraryScanTab!==scanTab){try{await chrome.tabs.remove(libraryScanTab);}catch{}await chrome.storage.session.remove('libraryScanTab');}
  });
}
