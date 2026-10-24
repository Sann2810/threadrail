import {expandWord} from './search-ui.js';
import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { providerFixture } from './provider-fixtures.js';

async function extensionContext(customPermission = false) {
  const directory = await mkdtemp(resolve(tmpdir(), 'threadrail-providers-'));
  let extension = resolve('dist');
  if (customPermission) {
    extension = resolve(directory, 'extension');
    await cp('dist', extension, { recursive: true });
    const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
    // Only the test package pregrants access to this synthetic origin.
    manifest.host_permissions = ['https://threadrail-fixture.example/*'];
    await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(manifest));
  }
  const context = await chromium.launchPersistentContext(resolve(directory, 'profile'), {
    channel: 'chromium', headless: true, reducedMotion: 'reduce', viewport: { width: 1200, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  return { context, cleanup: async () => { await context.close(); await rm(directory, { recursive: true, force: true }); } };
}

for (const [provider, url] of [
  ['chatgpt', 'https://chatgpt.com/c/current-dom'],
  ['chatgpt', 'https://chatgpt.com/codex/tasks/task-fixture'],
  ['claude', 'https://claude.ai/chat/current-dom'],
  ['claude', 'https://claude.ai/code/session-fixture'],
  ['gemini', 'https://gemini.google.com/app/current-dom'],
]) test(`${provider} ${new URL(url).pathname}: installed extension indexes, previews, jumps, and excludes streams`, async () => {
  const { context, cleanup } = await extensionContext();
  try {
    await context.route('**/*', route => route.fulfill({ body: providerFixture(provider), contentType: 'text/html' }));
    const page = await context.newPage();
    const host = page.locator('threadrail-navigation');
    await page.goto(url);
    await expect(host).toHaveAttribute('data-exchange-count', '8');
    await expect(host).toHaveAttribute('data-completed-count', '8');
    await expect(host).toHaveAttribute('data-provider', provider);
    await expect(host).toHaveAttribute('data-state', 'READING_CURRENT');
    await page.locator('#scroll').evaluate(node => { node.scrollTop = 10; });
    await expect(page.locator('.rail')).toBeVisible();
    const position = await page.locator('#scroll').evaluate(node => node.scrollTop);
    await page.locator('.marker').first().click();
    await expect(page.locator('.question').first()).toHaveText('Question 1: Explain idea 1 in plain language.');
    expect(await page.locator('#scroll').evaluate(node => node.scrollTop)).toBe(position);
    await page.locator('.item').first().click();
    await expect(page.locator('.toast')).toContainText('Question 1:');
    await page.evaluate(provider => {
      if (provider === 'chatgpt') document.querySelectorAll('[data-talvt-turn-state]').item(7).dataset.talvtTurnState = 'running';
      if (provider === 'claude') document.querySelectorAll('[data-testid="assistant-message"]').item(7).dataset.isStreaming = 'true';
      if (provider === 'gemini') {
        const button = document.createElement('button'); button.setAttribute('aria-label', 'Stop response'); button.textContent = 'Stop'; document.querySelector('form').append(button);
      }
    }, provider);
    await expect(host).toHaveAttribute('data-completed-count', '7');
    const typed = page.getByRole('textbox');
    await typed.fill('The composer still works.');
    await expect(typed).toHaveValue('The composer still works.');
  } finally { await cleanup(); }
});

test('cloud shell skips empty and hidden main regions for the live transcript', async () => {
  const { context, cleanup } = await extensionContext();
  try {
    const html = providerFixture('chatgpt').replace('<body>', '<body><main id="empty-shell" style="height:0"></main><div role="main" hidden><div data-chatgpt-search-unit-key="stale:user">Stale prompt</div></div>');
    await context.route('https://chatgpt.com/**', route => route.fulfill({ body: html, contentType: 'text/html' }));
    const page = await context.newPage();
    await page.goto('https://chatgpt.com/c/cloud-shell');
    const host = page.locator('threadrail-navigation');
    await expect(host).toHaveAttribute('data-completed-count', '8');
    await page.locator('#scroll').evaluate(node => { node.scrollTop = 10; });
    await page.locator('.marker').first().click();
    await expect(page.locator('.question').first()).toHaveText('Question 1: Explain idea 1 in plain language.');
    await page.locator('.item').first().click();
    await expect(page.locator('.toast')).toContainText('Question 1:');
    await page.getByRole('textbox', {name:'Message',exact:true}).press('Alt+Shift+f');
    await page.getByRole('searchbox', {name:'Describe what you remember',exact:true}).fill('idea');
    const words = await expandWord(page,'idea');
    await expect(words.locator('.search-result')).toHaveCount(2);
    await words.getByRole('button',{name:'More idea matches'}).click();
    await expect(words.locator('.search-result')).toHaveCount(8);
    await words.locator('.search-result').last().click();
    await expect(host).not.toHaveAttribute('data-state','JUMPING');
    const top = await page.locator('[data-chatgpt-search-unit-key="turn-7:0:user"]').evaluate(e=>e.getBoundingClientRect().top);
    expect(top).toBeGreaterThan(60); expect(top).toBeLessThan(260);
  } finally { await cleanup(); }
});

test('Claude Code action timestamps stay out of search and passage offsets', async () => {
  const { context, cleanup } = await extensionContext();
  try {
    const messages = [
      {prompt:'Remember Zen at the harbor.', answer:'<h2 class="sr-only">Claude responded: Zen waited.</h2><p>Zen waited by the green suitcase.</p><div role="toolbar" aria-label="Message actions"><button aria-label="Copy">Copy</button><time>1 minute ago</time></div>'},
      {prompt:'Continue with the books.', answer:'<div class="response">The books were arranged by color.</div>'},
    ];
    await context.route('https://claude.ai/**', route => route.fulfill({body:providerFixture('claude',{messages}),contentType:'text/html'}));
    const page=await context.newPage();
    await page.goto('https://claude.ai/code/session-toolbar');
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-completed-count','2');
    await page.getByRole('textbox',{name:'Message',exact:true}).press('Alt+Shift+f');
    const query=page.getByRole('searchbox',{name:'Describe what you remember',exact:true});
    await query.fill('Zen minute');
    const words=await expandWord(page,'Zen');
    await expect(words.locator('.search-result')).toHaveCount(2);
    await expect(page.locator('.search-word-group[aria-label="minute matches"] .search-count')).toHaveText('0');
    const answer=words.locator('.search-result').last();
    await expect(answer.locator('.search-excerpt')).toHaveText('Zen waited by the green suitcase.');
    await answer.click();
    await expect(page.locator('.toast')).toContainText('matching passage');
    await expect(page.locator('threadrail-navigation')).not.toHaveAttribute('data-state','JUMPING');
    const top=await page.locator('[data-testid="assistant-message"] p').evaluate(e=>e.getBoundingClientRect().top);
    expect(top).toBeGreaterThan(60);expect(top).toBeLessThan(260);
    await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('');
  } finally { await cleanup(); }
});

test('other sites receive no script until enabled; custom selectors and pause persist', async () => {
  const { context, cleanup } = await extensionContext(true);
  try {
    await context.route('https://threadrail-fixture.example/**', route => route.fulfill({ body: providerFixture('custom'), contentType: 'text/html' }));
    const page = await context.newPage();
    await page.goto('https://threadrail-fixture.example/chat');
    await expect(page.locator('threadrail-navigation')).toHaveCount(0);
    let worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html?site=https%3A%2F%2Fthreadrail-fixture.example`);
    await options.locator('summary').click();
    for (const [id, value] of Object.entries({ root: 'main', user: '.question', assistant: '.answer', userText: '', turn: 'article', streaming: '[aria-busy="true"]', complete: '.done', stop: '' })) await options.locator(`#${id}`).fill(value);
    await options.getByRole('button', { name: 'Enable and save' }).click();
    await expect(options.locator('#saved')).toContainText('Saved.');
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count', '8');
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-provider', 'custom');
    await page.reload();
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count', '8');
    const registered = await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts());
    expect(registered.flatMap(script => script.matches)).toEqual(['https://threadrail-fixture.example/*']);
    const saved = await worker.evaluate(() => chrome.storage.local.get());
    expect(Object.keys(saved)).toEqual(['sites']);
    expect(saved.sites['https://threadrail-fixture.example'].profile.user).toBe('.question');
    await worker.evaluate(async () => {
      const { sites } = await chrome.storage.local.get('sites'); sites['https://threadrail-fixture.example'].enabled = false;
      await chrome.storage.local.set({ sites });
    });
    await page.evaluate(() => {});
    const tabs = await worker.evaluate(() => chrome.tabs.query({ url: 'https://threadrail-fixture.example/*' }));
    await worker.evaluate(async tabId => { await chrome.tabs.sendMessage(tabId, { type: 'threadrail:reload' }); }, tabs[0].id);
    await expect(page.locator('threadrail-navigation')).toHaveCount(0);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByRole('button', { name: 'Set up another chat interface' })).toBeVisible();
  } finally { await cleanup(); }
});

test('invalid custom CSS cannot replace a working site configuration', async () => {
  const { context, cleanup } = await extensionContext(true);
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html?site=https%3A%2F%2Fthreadrail-fixture.example`);
    await page.locator('summary').click();
    await page.locator('#user').fill('[');
    await page.getByRole('button', { name: 'Enable and save' }).click();
    await expect(page.locator('#error')).toHaveText('Invalid user CSS selector.');
    expect(await worker.evaluate(() => chrome.storage.local.get())).toEqual({});
  } finally { await cleanup(); }
});

test('skipped offscreen turns and history layout shifts preserve history previews', async () => {
  const { context, cleanup } = await extensionContext();
  try {
    await context.route('https://chatgpt.com/**', route => route.fulfill({ body: providerFixture('chatgpt'), contentType: 'text/html' }));
    const page = await context.newPage();
    await page.goto('https://chatgpt.com/c/lazy-history');
    const host = page.locator('threadrail-navigation');
    await expect(host).toHaveAttribute('data-exchange-count', '8');
    await page.evaluate(() => {
      const last = document.querySelectorAll('[data-turn-key]')[7];
      last.style.contentVisibility = 'hidden';
      last.style.height = '800px';
      document.querySelector('#scroll').scrollTop = 250;
    });
    await expect(page.locator('.rail')).toBeVisible();
    await expect.poll(() => host.evaluate(n => Number(n.dataset.latestTop) > Number(n.dataset.readingLine))).toBe(true);
    await page.locator('.marker').first().click();
    await expect(page.locator('.preview')).toBeVisible();
    await page.evaluate(() => {
      const first = document.querySelector('[data-turn-key]');
      first.style.paddingTop = '180px';
      const last = document.querySelectorAll('[data-turn-key]')[7];
      last.style.contentVisibility = 'visible';
      last.style.height = '';
    });
    await page.waitForTimeout(1700);
    await expect(page.locator('.preview')).toBeVisible();
    await expect(page.locator('.rail')).toBeVisible();
    await expect(page.locator('.question').first()).toContainText('Question 1:');
  } finally { await cleanup(); }
});
