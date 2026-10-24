import {expandWord} from './search-ui.js';
import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {providerFixture} from './provider-fixtures.js';

test('Gemini search expands only the selected collapsed prompt before aligning its passage',async()=>{
  test.setTimeout(90000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-collapse-'));
  const extension=resolve('dist');
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try {
    const intro='The visual production plan needs clear scenes and carefully timed music. '.repeat(7);
    const target='After four context resets, the workers must move to a fresh thread carrying every decision and all working memory.';
    let html=providerFixture('gemini',{messages:[
      {prompt:intro+'An unrelated collapsed message.',answer:'<p>Other instructions.</p>'},
      {prompt:intro+target,answer:'<p>Understood.</p>'},
      {prompt:'A later exchange.',answer:'<div class="response">The conversation continues.</div>'},
    ]});
    html=html.replace('</head>','<style>.query-text.collapsed{max-height:48px;overflow:hidden}</style></head>')
      .replaceAll('class="query-text"','class="query-text collapsed"')
      .replaceAll('<button aria-label="Copy prompt">','<button data-test-id="luminous-expand-button" aria-label="Expand" onclick="setTimeout(()=>{const old=this.closest(\'user-query\').querySelector(\'.query-text\'),next=old.cloneNode(true);next.classList.remove(\'collapsed\');old.replaceWith(next);this.setAttribute(\'aria-label\',\'Collapse\')},200)">Expand</button><button aria-label="Copy prompt">');
    await context.route('https://gemini.google.com/**',r=>r.fulfill({body:html,contentType:'text/html'}));
    const page=await context.newPage();await page.goto('https://gemini.google.com/app/collapsed-test');
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','3');
    await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('workers taking their memories to a new conversation after repeated resets');
    await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready',{timeout:75000});
    await expect(page.locator('.search-best .search-result').first()).toContainText('four context resets');
    await page.locator('.search-best .search-result').first().click();
    await expect(page.locator('user-query').nth(1).locator('.query-text')).not.toHaveClass(/collapsed/);
    await expect(page.locator('user-query').nth(0).locator('.query-text')).toHaveClass(/collapsed/);
    await expect(page.locator('threadrail-navigation')).not.toHaveAttribute('data-state','JUMPING');
    await expect(page.locator('.toast')).toContainText('matching passage');
    const destination=await page.locator('user-query').nth(1).evaluate((e,target)=>{
      const text=e.querySelector('p').firstChild,start=text.data.indexOf(target);
      const range=document.createRange();range.setStart(text,start);range.setEnd(text,start+target.length);
      const r=range.getBoundingClientRect(),clip=e.querySelector('.query-text').getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,clipTop:clip.top,clipBottom:clip.bottom};
    },target);
    expect(destination.top).toBeGreaterThanOrEqual(65);expect(destination.top).toBeLessThan(240);
    expect(destination.bottom).toBeLessThan(800);
    expect(destination.top).toBeGreaterThanOrEqual(destination.clipTop);
    expect(destination.bottom).toBeLessThanOrEqual(destination.clipBottom);
    const revision=await page.locator('threadrail-navigation').getAttribute('data-revision');
    await page.locator('user-query').nth(1).locator('.query-text').evaluate(e=>e.replaceWith(e.cloneNode(true)));
    await expect(page.locator('threadrail-navigation')).not.toHaveAttribute('data-revision',revision);
    await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('workers taking their memories to a new conversation after repeated resets');
    await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready');
    await page.locator('.search-best .search-result').first().click();
    await expect(page.locator('.search-panel')).toBeHidden();
    await expect(page.locator('.toast')).toContainText('matching passage');
    // Literal results use the same reveal path, including when the host delayed
    // expansion. A second search must still reach the selected original text.
    await page.locator('user-query').nth(1).locator('.query-text').evaluate(e=>e.classList.add('collapsed'));
    await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('resets');
    await expandWord(page,'resets');
    await page.locator('.search-word-group[aria-label="resets matches"] .search-result').click();
    await expect(page.locator('user-query').nth(1).locator('.query-text')).not.toHaveClass(/collapsed/);
    await expect(page.locator('.toast')).toContainText('matching passage');
  } finally {await context.close();await rm(directory,{recursive:true,force:true});}
});
