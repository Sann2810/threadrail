import { installArchiveMessages } from './archive-background.js';
import { embeddings,rerank } from './embedding-engine.js';
import { BUILTIN_ORIGINS } from './extension-api.js';
import { readExact,writeExact } from './archive-store.js';
import { vectorTextKey } from './search-index.js';

// Exact rechecks reuse vectors cached by earlier searches; one-at-a-time
// embedding makes a cached vector identical to recomputing it. Nothing is
// cached from private windows or while saving is paused.
async function embedTexts(texts,base,priority,{recheck=false,persist=false}={}){
  if(!recheck)return embeddings(texts,base,priority);
  const keys=texts.map(vectorTextKey),cached=await readExact(keys).catch(()=>new Map());
  const missing=[...new Set(texts.filter((text,i)=>!cached.has(keys[i])))];
  const computed=missing.length?await embeddings(missing,base,priority):[],fresh=new Map(missing.map((text,i)=>[text,computed[i]]));
  if(persist&&missing.length)writeExact(missing.map((text,i)=>({key:vectorTextKey(text),vector:computed[i]}))).catch(()=>{});
  return texts.map((text,i)=>cached.has(keys[i])?Array.from(cached.get(keys[i])):fresh.get(text));
}

let registration = Promise.resolve();
function syncSites() {
  registration = registration.catch(() => {}).then(async () => {
    const { sites = {} } = await chrome.storage.local.get('sites');
    const scripts = [];
    for (const [origin, settings] of Object.entries(sites)) {
      if (!settings.enabled || BUILTIN_ORIGINS.includes(origin)) continue;
      const pattern = `${origin}/*`;
      if (await chrome.permissions.contains({ origins: [pattern] })) {
        scripts.push({ id: `threadrail-site-${scripts.length}`, matches: [pattern], js: ['threadrail.js'], runAt: 'document_idle', persistAcrossSessions: true });
      }
    }
    const existing = (await chrome.scripting.getRegisteredContentScripts()).filter(script => script.id.startsWith('threadrail-site-'));
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map(script => script.id) });
    if (scripts.length) await chrome.scripting.registerContentScripts(scripts);
  });
  return registration;
}
chrome.runtime.onInstalled.addListener(() => { syncSites().catch(console.warn); });
chrome.runtime.onStartup.addListener(() => { syncSites().catch(console.warn); });
chrome.permissions.onRemoved.addListener(() => { syncSites().catch(console.warn); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== 'threadrail:register' || sender.id !== chrome.runtime.id) return;
  syncSites().then(() => respond({ ok: true })).catch(error => respond({ error: error.message }));
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['threadrail:embed','threadrail:rerank'].includes(message.type) || sender.id !== chrome.runtime.id) return;
  const ranking=message.type==='threadrail:rerank';
  const texts = message.texts;
  if (!Array.isArray(texts) || texts.length < 1 || texts.length > (ranking?24:8) || texts.some(text => typeof text !== 'string' || text.length > 20000) ||
      (ranking&&(typeof message.query!=='string'||message.query.length>20000))) {
    respond({ error: 'Invalid search batch' }); return;
  }
  const embed=async()=>{
    const {libraryPaused=false}=await chrome.storage.local.get('libraryPaused');
    return embedTexts(texts,chrome.runtime.getURL(''),message.priority?1:0,{recheck:message.recheck===true,persist:!sender.tab?.incognito&&!libraryPaused});
  };
  (ranking?rerank(message.query,texts,chrome.runtime.getURL('')).then(scores=>({scores})):embed().then(vectors=>({vectors})))
    .then(respond).catch(error => respond({error:error.message}));
  return true;
});

installArchiveMessages();
