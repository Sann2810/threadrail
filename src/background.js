import { installArchiveMessages } from './archive-background.js';
import { embeddings,rerank } from './embedding-engine.js';
import { BUILTIN_ORIGINS } from './extension-api.js';

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
  (ranking?rerank(message.query,texts,chrome.runtime.getURL('')).then(scores=>({scores})):embeddings(texts,chrome.runtime.getURL(''),message.priority?1:0).then(vectors=>({vectors})))
    .then(respond).catch(error => respond({error:error.message}));
  return true;
});

installArchiveMessages();
