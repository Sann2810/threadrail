export const BUILTIN_ORIGINS = ['https://chatgpt.com', 'https://chat.openai.com', 'https://claude.ai', 'https://gemini.google.com'];

export function siteOrigin(url) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Open a chat website to use ThreadRail. Browser settings and native apps are not web pages.');
  return parsed.origin;
}

export async function activateTab(tabId) {
  try { await chrome.tabs.sendMessage(tabId, { type: 'threadrail:reload' }); }
  catch { await chrome.scripting.executeScript({ target: { tabId }, files: ['threadrail.js'] }); }
}

export async function saveSite(origin, settings) {
  const { sites = {} } = await chrome.storage.local.get('sites');
  sites[origin] = settings;
  await chrome.storage.local.set({ sites });
  const result = await chrome.runtime.sendMessage({ type: 'threadrail:register' });
  if (result?.error) throw new Error(result.error);
}
