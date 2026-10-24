import { PROFILES, SELECTOR_FIELDS, validateProfile, profileFor } from './profiles.js';
import { BUILTIN_ORIGINS, siteOrigin, saveSite, activateTab } from './extension-api.js';

const labels = { root: 'Conversation area', user: 'User message', assistant: 'Assistant message', userText: 'Question text inside a user message (optional)', turn: 'Outer turn container (optional)', streaming: 'Streaming indicator (optional)', complete: 'Completed response indicator (optional)', stop: 'Stop generating control (optional)' };
const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
let useCustom = false;
let loadToken = 0;
for (const field of SELECTOR_FIELDS) {
  const label = document.createElement('label'); label.htmlFor = field; label.textContent = labels[field];
  const input = document.createElement('input'); input.id = field; input.value = PROFILES.generic[field]; input.maxLength = 2000;
  input.addEventListener('input', () => { useCustom = true; loadToken++; });
  $('#fields').append(label, input);
}
async function loadSite() {
  const token = ++loadToken;
  if (!$('#site').value) return;
  try {
    const origin = siteOrigin($('#site').value);
    const { sites = {} } = await chrome.storage.local.get('sites');
    if (token !== loadToken) return;
    const config = sites[origin];
    useCustom = !!config?.profile;
    const profile = profileFor(new URL(origin).hostname, { profile: config?.profile }) ?? PROFILES.generic;
    for (const field of SELECTOR_FIELDS) $(`#${field}`).value = profile[field];
    $('#advanced').open = useCustom;
  } catch (error) { $('#error').textContent = error.message; }
}
$('#site').value = params.get('site') || '';
$('#site').addEventListener('change', loadSite);
$('#restore').onclick = () => { loadToken++; useCustom = false; for (const field of SELECTOR_FIELDS) $(`#${field}`).value = PROFILES.generic[field]; $('#advanced').open = false; $('#saved').textContent = 'Automatic detection selected'; };
$('#setup').onsubmit = async event => {
  event.preventDefault(); $('#error').textContent = ''; $('#saved').textContent = '';
  try {
    const origin = siteOrigin($('#site').value);
    const profile = useCustom ? validateProfile(Object.fromEntries(SELECTOR_FIELDS.map(field => [field, $(`#${field}`).value])), document) : undefined;
    if (!BUILTIN_ORIGINS.includes(origin)) {
      const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
      if (!granted) { $('#error').textContent = 'Site access was not granted. No settings were changed.'; return; }
    }
    await saveSite(origin, { enabled: true, ...(profile ? { profile } : {}) });
    const tabs = await chrome.tabs.query({ url: `${origin}/*` });
    // A discarded or error-page tab must not stop the others from activating.
    await Promise.allSettled(tabs.map(tab => activateTab(tab.id)));
    $('#saved').textContent = 'Saved. Open a conversation on this site.';
  } catch (error) { $('#error').textContent = error.message; }
};
loadSite();
