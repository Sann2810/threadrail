import {expandWord} from './search-ui.js';
import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {providerFixture} from './provider-fixtures.js';

const query='someone made a foolish kitchen mistake';
const target='Zen accidentally poured orange juice into the kettle instead of water.';
const messages=Array.from({length:200},(_,i)=>({prompt:i===97?'Continue the kitchen chapter.':`Review office item ${i+1}.`,
  answer:i===97?'<p>The quiet room contained shelves and maps.</p>'.repeat(25)+`<p id="remembered-scene">${target}</p>`+'<p>The quiet room contained shelves and maps.</p>'.repeat(20):'<div class="response"><p>The office documents were reviewed and filed.</p></div>'}));

for(const provider of ['chatgpt','claude','gemini'])test(`${provider}: 200-exchange text and vectors survive unmounts and a browser restart; saved results reload exact passages`,async()=>{
  test.setTimeout(150000);
  const dir=await mkdtemp(resolve(tmpdir(),'threadrail-retained-')),extension=resolve('dist');
  const origin={chatgpt:'https://chatgpt.com',claude:'https://claude.ai',gemini:'https://gemini.google.com'}[provider],path={chatgpt:'/c/retained',claude:'/chat/retained',gemini:'/app/retained'}[provider];
  const launch=()=>chromium.launchPersistentContext(dir,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  let context=await launch(),small=false;
  const body=()=>providerFixture(provider,{messages}).replace('</body>',`<script>
    const parent=document.querySelector('${provider==='claude'?'[data-testid="transcript-list"]':'#scroll'}');
    const all=[...parent.children],factor=${provider==='claude'?2:1};
    window.unloadHistory=()=>all.slice(0,195*factor).forEach(e=>e.remove());
    window.restoreRemembered=()=>parent.prepend(...all.slice(94*factor,101*factor).map(e=>e.cloneNode(true)));
    ${small?'window.unloadHistory();':''}
    let restored=false;document.querySelector('#scroll').addEventListener('scroll',()=>{
      if(!restored&&document.querySelector('#scroll').scrollTop<2&&!document.querySelector('#remembered-scene')){restored=true;window.restoreRemembered();}
    });
  </script></body>`);
  const route=()=>context.route(`${origin}/**`,r=>r.fulfill({body:body(),contentType:'text/html'}));
  try{
    await route();let page=await context.newPage();const cold=Date.now();await page.goto(origin+path);
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','200');
    await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill(query);
    await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready',{timeout:90000});
    await expect(page.locator('.search-best .search-result').first()).toContainText('orange juice');
    const coldMs=Date.now()-cold;
    await page.evaluate(()=>window.unloadHistory());
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','5');
    await expect(page.locator('#remembered-scene')).toHaveCount(0);
    await expect(page.locator('.search-coverage')).toContainText('400 messages');
    await page.locator('.search-input').fill('Zen');
    await expect(page.locator('.search-word-group[aria-label="Zen matches"] .search-count')).toHaveText('1');
    // Captures persist the merged history rather than just the last DOM window.
    await expect.poll(async()=>{
      const worker=context.serviceWorkers()[0];
      return worker.evaluate(async url=>{
        const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('threadrail-library');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
        const record=await new Promise(resolve=>{const r=db.transaction('chats').objectStore('chats').get(url);r.onsuccess=()=>resolve(r.result);});db.close();return record?.messages.length??0;
      },origin+path);
    }).toBe(400);
    await context.close();small=true;context=await launch();await route();
    page=await context.newPage();const warm=Date.now();await page.goto(origin+path);
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','5');
    await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill(query);
    await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready',{timeout:20000});
    const warmMs=Date.now()-warm;
    await expect(page.locator('.search-status')).toHaveText('');
    await expect(page.locator('.search-best .search-result').first()).toContainText('orange juice');
    await expect(page.locator('#remembered-scene')).toHaveCount(0);
    await page.locator('.search-best .search-result').first().click();
    await expect(page.locator('#remembered-scene')).toHaveCount(1,{timeout:15000});
    await expect(page.locator('.toast')).toContainText('matching passage',{timeout:15000});
    const rect=await page.locator('#remembered-scene').boundingBox();
    expect(rect.y).toBeGreaterThanOrEqual(65);expect(rect.y).toBeLessThan(230);expect(rect.y+rect.height).toBeLessThan(830);
    await page.screenshot({path:`test-results/retained-${provider}.png`});
    await writeFile(`test-results/retained-${provider}.json`,JSON.stringify({provider,messages:400,coldMs,restartReadyMs:warmMs,rank:1,passageTop:rect.y},null,2));
  }finally{await context.close();await rm(dir,{recursive:true,force:true});}
});
