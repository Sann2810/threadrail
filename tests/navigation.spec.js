import { test, expect, chromium } from '@playwright/test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const rail = page => page.locator('.rail');
const preview = page => page.locator('.preview');
const host = page => page.locator('threadrail-navigation');

async function ready(page, scenario = 'normal') {
  await page.goto('/');
  await expect(host(page)).toHaveCount(1);
  await expect(host(page)).toHaveAttribute('data-revision', /\d+/);
  if (scenario !== 'normal') {
    const revision = await host(page).getAttribute('data-revision');
    await page.evaluate(value => window.fixture.load(value), scenario);
    await expect(host(page)).not.toHaveAttribute('data-revision', revision);
  }
  await expect(rail(page)).toBeHidden();
  await expect(host(page)).toHaveAttribute('data-state', scenario === 'single' ? 'IDLE' : 'READING_CURRENT');
}

async function reveal(page) {
  await page.evaluate(() => {
    const scroller = document.querySelector('#scroller');
    scroller.scrollTop = 10;
  });
  await expect(rail(page)).toBeVisible();
}

async function questionPreview(page, question) {
  const count = await page.locator('.marker').count();
  for (let index = 0; index < count; index++) {
    await page.locator('.marker').nth(index).click();
    const item = page.locator('.item').filter({ hasText: question });
    if (await item.count()) return item.first();
  }
  throw new Error(`Question not indexed: ${question}`);
}

test('reading history keeps navigation available after pausing; search is discoverable at the latest answer', async ({ page }) => {
  await ready(page);
  await expect(page.getByRole('button',{name:'Search this thread',exact:true})).toBeVisible();
  await expect(rail(page)).toBeHidden();
  await reveal(page);
  await page.waitForTimeout(2000);
  await expect(rail(page)).toBeVisible();
  await expect(page.locator('#conversation .user')).toHaveCount(8);
});

test('marker previews original text without scrolling; selecting it jumps and highlights', async ({ page }) => {
  await ready(page);
  await reveal(page);
  const before = await page.locator('#scroller').evaluate(node => node.scrollTop);
  const item = await questionPreview(page, 'What are some effective focus techniques?');
  expect(await page.locator('#scroller').evaluate(node => node.scrollTop)).toBe(before);
  await page.waitForTimeout(1700);
  await expect(rail(page)).toBeVisible();
  await expect(preview(page)).toBeVisible();
  await item.click();
  await expect(preview(page)).toBeHidden();
  await expect(page.locator('.toast')).toContainText('What are some effective focus techniques?');
  await expect(page.locator('.highlight')).toBeVisible();
  const top = await page.locator('[data-testid="conversation-turn-2"]').evaluate(node => node.getBoundingClientRect().top);
  expect(top).toBeGreaterThan(60);
  expect(top).toBeLessThan(120);
});

test('latest very long answer remains a reading region after completion', async ({ page }) => {
  await ready(page, 'long');
  const total = await page.locator('#scroller').evaluate(node => node.scrollTop);
  await page.locator('#scroller').evaluate(node => { node.scrollTop -= 600; });
  await page.waitForTimeout(100);
  expect(await page.locator('#scroller').evaluate(node => node.scrollTop)).toBeLessThan(total);
  await expect(rail(page)).toBeHidden();
  await reveal(page);
  await expect(rail(page)).toBeVisible();
});

test('streaming responses get no marker and add exactly one when complete', async ({ page }) => {
  await ready(page, 'streaming');
  await reveal(page);
  const indexed = new Set();
  const count = await page.locator('.marker').count();
  for (let i = 0; i < count; i++) {
    await page.locator('.marker').nth(i).click();
    for (const text of await page.locator('.question').allTextContents()) indexed.add(text);
  }
  expect(indexed.size).toBe(7);
  expect(indexed.has('How should I reflect on my progress at the end of each week?')).toBe(false);
  await page.getByRole('button', {name:'Close preview', exact:true}).click();
  await page.locator('[data-testid="stop-button"]').click();
  await page.waitForTimeout(250);
  await page.locator('#scroller').evaluate(node => { node.scrollTop = 20; });
  const question = await questionPreview(page, 'How should I reflect on my progress at the end of each week?');
  await expect(question).toHaveCount(1);
});

test('long press navigates directly, without a preview', async ({ page }) => {
  await ready(page);
  await reveal(page);
  await page.locator('#scroller').evaluate(node => { node.scrollTop = 500; });
  const box = await page.locator('.marker').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(520);
  await page.mouse.up();
  await expect(preview(page)).toBeHidden();
  await expect(page.locator('.toast')).toContainText('Help me plan');
  expect(await page.locator('#scroller').evaluate(node => node.scrollTop)).toBeLessThan(10);
});

test('Top and Bottom reach their destinations; latest response hides rail', async ({ page }) => {
  await ready(page);
  await reveal(page);
  await page.locator('#scroller').evaluate(node => { node.scrollTop = 300; });
  await page.getByRole('button', { name: 'Jump to first exchange', exact: true }).click();
  await expect.poll(() => page.locator('#scroller').evaluate(node => node.scrollTop)).toBeLessThan(10);
  await expect(host(page)).not.toHaveAttribute('data-state', 'JUMPING');
  await page.getByRole('button', { name: 'Jump to latest message' }).click();
  await expect(rail(page)).toBeHidden();
  expect(await page.locator('#scroller').evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(2);
});

test('single exchanges never show navigation, including after route changes', async ({ page }) => {
  await ready(page);
  await reveal(page);
  await page.evaluate(() => { history.pushState({}, '', '/c/another-chat'); window.fixture.load('single'); });
  await expect(rail(page)).toBeHidden();
  await page.locator('#scroller').evaluate(node => { node.scrollTop = 0; });
  await page.waitForTimeout(200);
  await expect(rail(page)).toBeHidden();
  await expect(page.locator('.marker')).toHaveCount(0);
});

test('200 exchanges show ten nearby visible targets and rewindow as the reader moves', async ({ page }) => {
  await ready(page, 'dense');
  await reveal(page);
  await expect(page.locator('.marker')).toHaveCount(10);
  await expect(host(page)).toHaveAttribute('data-window-start', '1');
  let previousBottom = -1;
  for (const marker of await page.locator('.marker').all()) {
    const box = await marker.boundingBox();
    expect(box.y).toBeGreaterThan(previousBottom);
    previousBottom = box.y + box.height;
    expect(await marker.evaluate(e => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    await expect(marker).toHaveText('');
  }
  await page.locator('#scroller').evaluate(node => {
    const target = document.querySelector('[data-testid="conversation-turn-198"]');
    node.scrollTop += target.getBoundingClientRect().top - node.getBoundingClientRect().top - 60;
  });
  await expect(host(page)).toHaveAttribute('data-window-start', '96');
  await expect(host(page)).toHaveAttribute('data-window-end', '105');
  await page.locator('.marker').nth(4).click();
  await expect(page.locator('.item')).toHaveCount(10);
  await expect(page.locator('.item[data-selected]')).toContainText('Question 100:');
  await page.screenshot({ path: 'test-results/threadrail-nearby-window.png' });
  await page.locator('#scroller').evaluate(node => { node.scrollTop = 10; });
  await expect(host(page)).toHaveAttribute('data-window-start', '96');
  await page.getByRole('button', {name:'Close preview', exact:true}).click();
  await page.locator('#scroller').evaluate(node => { node.scrollTop = 20; });
  await expect(host(page)).toHaveAttribute('data-window-start', '1');
  await page.locator('#scroller').evaluate(node => {
    const target = document.querySelector('[data-testid="conversation-turn-396"]');
    node.scrollTop += target.getBoundingClientRect().top - node.getBoundingClientRect().top - 60;
  });
  await expect(host(page)).toHaveAttribute('data-window-end', '200');
  const last = await questionPreview(page, 'Question 200:');
  await last.click();
  await expect(page.locator('.toast')).toContainText('Question 200:');
});

test('blank rail gaps neither intercept clicks nor open a picker', async ({ page }) => {
  await ready(page);
  await reveal(page);
  const first = await page.locator('.marker').first().boundingBox();
  const second = await page.locator('.marker').nth(1).boundingBox();
  const x = first.x + first.width / 2;
  const y = (first.y + first.height + second.y) / 2;
  expect(await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.tagName, {x,y})).not.toBe('THREADRAIL-NAVIGATION');
  await page.mouse.move(x,y);
  await page.mouse.click(x,y);
  await expect(preview(page)).toBeHidden();
  await page.locator('.marker').nth(2).click();
  await expect(page.locator('.item[data-selected]')).toContainText('Give me a checklist');
});

test('Top follows delayed prepended history batches until the actual beginning', async ({ page }) => {
  await ready(page);
  await reveal(page);
  await page.evaluate(() => {
    const scroller = document.querySelector('#scroller');
    let remaining = 3;
    let loading = false;
    scroller.addEventListener('scroll', () => {
      if (scroller.scrollTop > 2 || !remaining || loading) return;
      loading = true;
      const status = document.createElement('div');
      status.textContent = 'Loading older messages…';
      document.querySelector('#conversation').prepend(status);
      setTimeout(() => {
        const before = scroller.scrollHeight;
        const {user, assistant} = window.fixture.addExchange(`Older batch ${remaining}`, '<p>Older answer</p>', {id:-remaining});
        status.after(user, assistant);
        status.remove();
        scroller.scrollTop += scroller.scrollHeight - before;
        remaining--; loading = false;
      }, remaining === 3 ? 3200 : 650);
    });
    scroller.scrollTop = 300;
  });
  await page.locator('.top').click();
  await expect(page.locator('.top')).toHaveAttribute('aria-busy','true');
  await expect(host(page)).toHaveAttribute('data-exchange-count','11', {timeout:8500});
  await expect(host(page)).not.toHaveAttribute('data-state','JUMPING', {timeout:12000});
  expect(await page.locator('#scroller').evaluate(e=>e.scrollTop)).toBe(0);
  await expect(page.locator('#conversation .user').first()).toHaveText('Older batch 1');
  await expect(page.locator('.toast')).toContainText('Reached the top');
});

test('Top reports a continuation instead of success when history loading exceeds its deadline', async ({ page }) => {
  await ready(page);
  await reveal(page);
  await page.clock.install();
  await page.evaluate(() => {
    const status = document.createElement('div');
    status.textContent = 'Loading older messages…';
    document.querySelector('#conversation').prepend(status);
  });
  await page.locator('.top').click();
  await page.clock.fastForward(45000);
  await expect(page.locator('.toast')).toContainText('Earlier history is still loading');
  await expect(page.locator('.top')).toBeEnabled();
  await expect(host(page)).not.toHaveAttribute('data-state','JUMPING');
});

test('Escape cancels Top while history is loading', async ({ page }) => {
  await ready(page);
  await reveal(page);
  await page.evaluate(() => {
    const status = document.createElement('div'); status.setAttribute('role','status');
    status.textContent='Loading older messages…'; document.querySelector('#conversation').prepend(status);
  });
  await page.locator('.top').click();
  await expect(page.locator('.top')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('.top')).toBeEnabled();
  await expect(host(page)).not.toHaveAttribute('data-state','JUMPING');
  await page.locator('#scroller').evaluate(node => {node.scrollTop=300;});
  await page.waitForTimeout(400);
  expect(await page.locator('#scroller').evaluate(node=>node.scrollTop)).toBe(300);
});

test('keyboard users can open, navigate, dismiss, and jump from a hidden rail', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Alt+Shift+ArrowUp');
  await expect(page.locator('.toast')).toContainText('Can you suggest a small project');
  await expect(rail(page)).toBeVisible();
  await page.locator('.marker').first().focus();
  await page.keyboard.press('Enter');
  await expect(preview(page)).toBeVisible();
  await expect(page.locator('.item').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(preview(page)).toBeHidden();
  await expect(page.locator('.marker').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.marker').nth(1)).toBeFocused();
});

test('new prompts, edits, regeneration, and assistant continuations do not duplicate exchanges', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.fixture.addExchange('A <script>literal question</script>', '<p>First response.</p>', { id: 8 });
    const assistant = document.querySelector('#conversation').lastElementChild;
    const continuation = document.createElement('div');
    continuation.dataset.messageAuthorRole = 'assistant'; continuation.textContent = 'Continued tool result and final answer.';
    assistant.prepend(continuation);
    const input = document.querySelector('[data-message-id="user-8"]');
    input.textContent = 'Edited <b>original</b> question';
    const output = document.querySelector('[data-message-id="assistant-8"]');
    output.textContent = 'Regenerated final response.';
  });
  await page.waitForTimeout(250);
  await reveal(page);
  const edited = await questionPreview(page, 'Edited <b>original</b> question');
  await expect(edited).toHaveCount(1);
  await expect(edited.locator('b')).toHaveCount(0);
  const indexed = new Set();
  for (let i = 0; i < await page.locator('.marker').count(); i++) {
    await page.locator('.marker').nth(i).click();
    for (const text of await page.locator('.question').allTextContents()) indexed.add(text);
  }
  expect(indexed.size).toBe(9);
});

test('dragging cancels long press and scrubs without changing the scroll position', async ({ page }) => {
  await ready(page);
  await reveal(page);
  const before = await page.locator('#scroller').evaluate(node => node.scrollTop);
  const box = await page.locator('.marker').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const destination = await page.locator('.marker').nth(3).boundingBox();
  await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 4 });
  await page.waitForTimeout(520);
  await page.mouse.up();
  await expect(preview(page)).toBeVisible();
  expect(await page.locator('#scroller').evaluate(node => node.scrollTop)).toBe(before);
  await page.locator('header .chat-title').click();
  await expect(preview(page)).toBeHidden();
});

test('narrow touch viewport keeps rail and preview in bounds after resize', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await ready(page);
  await reveal(page);
  const marker = await page.locator('.marker').first().boundingBox();
  await page.touchscreen.tap(marker.x + marker.width / 2, marker.y + marker.height / 2);
  await expect(preview(page)).toBeVisible();
  const box = await preview(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(100);
  const resized = await preview(page).boundingBox();
  expect(resized.x + resized.width).toBeLessThanOrEqual(320);
  expect(resized.y + resized.height).toBeLessThanOrEqual(568);
  await page.screenshot({ path: 'test-results/threadrail-mobile.png' });
  await context.close();
});

test('unsupported DOM fails closed without touching the composer', async ({ page }) => {
  await ready(page);
  await reveal(page);
  await page.evaluate(() => document.querySelector('#conversation').replaceChildren());
  await expect(rail(page)).toBeHidden();
  await page.getByRole('textbox', { name: 'Message ChatGPT' }).fill('Still works');
  await expect(page.getByRole('textbox')).toHaveValue('Still works');
});

test('quiet content without completion signals never becomes a finished marker', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => document.querySelector('#conversation').lastElementChild.querySelector('.actions').remove());
  await page.waitForTimeout(150);
  await reveal(page);
  await page.locator('.marker').first().click();
  await page.waitForTimeout(2100);
  const indexed = new Set();
  for (let i = 0; i < await page.locator('.marker').count(); i++) {
    await page.locator('.marker').nth(i).click();
    for (const text of await page.locator('.question').allTextContents()) indexed.add(text);
  }
  expect(indexed.size).toBe(7);
  expect(indexed.has('How should I reflect on my progress at the end of each week?')).toBe(false);
});

test('smooth scrolling settles at the selected exchange when motion is enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await ready(page);
  await reveal(page);
  const item = await questionPreview(page, 'What laptop would be good for design and development?');
  await item.click();
  await expect(page.locator('.toast')).toContainText('What laptop would be good');
  await expect(host(page)).not.toHaveAttribute('data-state', 'JUMPING');
  const top = await page.locator('[data-testid="conversation-turn-6"]').evaluate(node => node.getBoundingClientRect().top);
  expect(top).toBeGreaterThan(60); expect(top).toBeLessThan(120);
});

test('document scrolling works when the host has no nested scrolling container', async ({ page }) => {
  await ready(page);
  await page.addStyleTag({ content: 'body { height:auto; overflow:visible; } .guide { display:none; } main { display:block; } #scroller { overflow:visible; } header { position:sticky; top:0; z-index:1; }' });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(rail(page)).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 10));
  await expect(rail(page)).toBeVisible();
  const item = await questionPreview(page, 'What are some effective focus techniques?');
  await item.click();
  await expect(page.locator('.toast')).toContainText('What are some effective focus techniques?');
  expect(await page.locator('[data-testid="conversation-turn-2"]').evaluate(node => node.getBoundingClientRect().top)).toBeGreaterThan(60);
});

test('installed MV3 extension injects on chatgpt.com and sends no network requests', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'threadrail-test-'));
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, reducedMotion: 'reduce',
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const html = (await readFile('demo/index.html', 'utf8')).replace('<script src="/dist/threadrail.js"></script>', '');
    const requests = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      requests.push(url.pathname);
      if (url.pathname === '/demo/style.css') await route.fulfill({ path: 'demo/style.css', contentType: 'text/css' });
      else if (url.pathname === '/demo/fixture.js') await route.fulfill({ path: 'demo/fixture.js', contentType: 'text/javascript' });
      else if (url.pathname === '/c/extension-test') await route.fulfill({ body: html, contentType: 'text/html' });
      else await route.abort();
    });
    const page = await context.newPage();
    await page.goto('https://chatgpt.com/c/extension-test');
    await expect(host(page)).toHaveCount(1);
    await expect(host(page)).toHaveAttribute('data-state', 'READING_CURRENT');
    await reveal(page);
    await page.locator('.marker').first().click();
    await expect(preview(page)).toBeVisible();
    await page.screenshot({ path: 'test-results/threadrail-desktop.png' });
    expect(requests.filter(path => !['/c/extension-test', '/demo/style.css', '/demo/fixture.js', '/favicon.ico'].includes(path))).toEqual([]);
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});
