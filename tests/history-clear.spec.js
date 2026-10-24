import {expandWord} from './search-ui.js';
import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {providerFixture} from './provider-fixtures.js';

test('Remove and Clear invalidate retained offscreen text in an open thread and prevent cache resurrection',async()=>{
  test.setTimeout(45000);
  const dir=await mkdtemp(resolve(tmpdir(),'threadrail-forget-live-')),extension=resolve('dist');
  const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:true,reducedMotion:'reduce',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
    const messages=Array.from({length:8},(_,i)=>({prompt:`Review office document ${i}.`,answer:i===0?'<p>Zen hid the compass inside the blue suitcase.</p>':'<div class="response"><p>The office documents were filed.</p></div>'}));
    await context.route('https://gemini.google.com/**',r=>r.fulfill({body:providerFixture('gemini',{messages}),contentType:'text/html'}));
    const page=await context.newPage();await page.goto('https://gemini.google.com/app/forget-test');
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','8');
    await page.evaluate(()=>document.querySelector('#turn-0').remove());
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','7');
    await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('Zen');
    const count=page.locator('.search-word-group[aria-label="Zen matches"] .search-count');await expect(count).toHaveText('1');
    const worker=context.serviceWorkers()[0],id=new URL(worker.url()).host;
    const library=await context.newPage();await library.goto(`chrome-extension://${id}/library.html`);
    await expect(library.locator('#coverage')).toContainText('16 messages',{timeout:10000});
    await library.locator('#manage-title').click();
    await library.locator('#chat-list button').click();
    await expect(count).toHaveText('0');
    await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready',{timeout:20000});
    await expect.poll(()=>worker.evaluate(async()=>{
      const db=await new Promise(resolve=>{const r=indexedDB.open('threadrail-library');r.onsuccess=()=>resolve(r.result);});
      const counts=await Promise.all(['chats','vectors'].map(name=>new Promise(resolve=>{const r=db.transaction(name).objectStore(name).count();r.onsuccess=()=>resolve(r.result);})));db.close();return counts;
    })).toEqual([0,0]);
    await library.locator('#clear').click();await library.locator('#confirm-clear').click();
    expect(await worker.evaluate(()=>chrome.storage.local.get('libraryPaused'))).toEqual({libraryPaused:true});
    await expect(count).toHaveText('0');
  }finally{await context.close();await rm(dir,{recursive:true,force:true});}
});
