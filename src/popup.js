import { BUILTIN_ORIGINS, siteOrigin, saveSite, activateTab } from './extension-api.js';

const $ = selector => document.querySelector(selector);
$('.version').textContent=chrome.runtime.getManifest().version;
let tab, origin, enabled = false;
async function inspect() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  origin = siteOrigin(tab.url);
  const { sites = {} } = await chrome.storage.local.get('sites');
  let status;
  try { status = await chrome.tabs.sendMessage(tab.id, { type: 'threadrail:status' }); } catch {}
  enabled = status?.enabled ?? sites[origin]?.enabled ?? BUILTIN_ORIGINS.includes(origin);
  $('#provider').textContent = status?.provider || new URL(origin).hostname;
  $('#status').textContent = status?.enabled
    ? `${status.completed} completed exchanges · ${status.exchanges} questions detected`
    : enabled ? 'Ready. Refresh this tab to start navigation.' : 'Paused or not enabled on this website.';
  if (status?.enabled && status.exchanges === 0) $('#status').textContent = 'No exchanges detected yet. Open a conversation, or configure this website’s message selectors.';
  $('#toggle').disabled = false;
  $('#toggle').textContent = enabled ? 'Pause on this site' : 'Enable on this site';
}
$('#toggle').onclick = async () => {
  $('#error').textContent = '';
  try {
    if (!enabled && !BUILTIN_ORIGINS.includes(origin)) {
      const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
      if (!granted) return;
    }
    const { sites = {} } = await chrome.storage.local.get('sites');
    await saveSite(origin, { ...sites[origin], enabled: !enabled });
    await activateTab(tab.id);
    await inspect();
  } catch (error) { $('#error').textContent = error.message; }
};
$('#configure').onclick = async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${origin ? `?site=${encodeURIComponent(origin)}&tab=${tab.id}` : ''}`) });
};
inspect().catch(error => { $('#provider').textContent = 'Open a chat website'; $('#status').textContent = error.message; });

$('#library').onclick = () => chrome.tabs.create({url:chrome.runtime.getURL('library.html')});
$('#diagnostics').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('diagnostics.html')});
