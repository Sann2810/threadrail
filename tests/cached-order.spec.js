import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {providerFixture} from './provider-fixtures.js';
import {expandWord} from './search-ui.js';

for(const provider of ['chatgpt','claude','gemini'])test(`${provider}: legacy cached order repairs from host windows, persists and keeps saved passage identities`,async()=>{
  test.setTimeout(120000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-order-')),extension=resolve('dist');
  const origin={chatgpt:'https://chatgpt.com',claude:'https://claude.ai',gemini:'https://gemini.google.com'}[provider];
  const url=origin+{chatgpt:'/c/cache-order',claude:'/chat/cache-order',gemini:'/app/cache-order'}[provider];
  const launch=()=>chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const messages=Array.from({length:20},(_,i)=>({prompt:`Orchid input ${i}.`,answer:`<p id="orchid-${i}">Orchid answer ${i}.</p><div style="height:250px">Closing notes.</div>`}));
  let small=false,context=await launch();
  const route=()=>context.route(`${origin}/**`,r=>r.fulfill({body:providerFixture(provider,{messages}).replace('</body>',`<script>
    const parent=document.querySelector('${provider==='claude'?'[data-testid="transcript-list"]':'#scroll'}');
    const rows=[...parent.children],factor=${provider==='claude'?2:1};
    window.unload=()=>{rows.slice(0,17*factor).forEach(row=>row.remove());document.querySelector('#scroll').scrollTop=document.querySelector('#scroll').scrollHeight;};
    window.restore=()=>parent.prepend(...rows.slice(0,17*factor));
    ${small?'window.unload();':''}
    document.querySelector('#scroll').addEventListener('scroll',()=>{if(document.querySelector('#scroll').scrollTop<=1)window.restore();});
  </script></body>`),contentType:'text/html'}));
  const records=worker=>worker.evaluate(async url=>{
    if(!(await indexedDB.databases()).some(db=>db.name==='threadrail-library'))return [];
    const db=await new Promise(resolve=>{const request=indexedDB.open('threadrail-library');request.onsuccess=()=>resolve(request.result);});
    if(!db.objectStoreNames.contains('chats')){db.close();return [];}
    const chat=await new Promise(resolve=>{const request=db.transaction('chats').objectStore('chats').get(url);request.onsuccess=()=>resolve(request.result);});db.close();return chat?.messages??[];
  },url);
  try{
    await route();let page=await context.newPage();await page.goto(url);
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','20');
    let worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    await expect.poll(async()=>(await records(worker)).length).toBe(40);
    const originalKeys=(await records(worker)).map(m=>m.key);
    await worker.evaluate(async url=>{
      const db=await new Promise(resolve=>{const request=indexedDB.open('threadrail-library');request.onsuccess=()=>resolve(request.result);});
      await new Promise((resolve,reject)=>{const tx=db.transaction('chats','readwrite'),store=tx.objectStore('chats'),get=store.get(url);
        get.onsuccess=()=>{const chat=get.result;chat.messages=chat.messages.slice(34).concat(chat.messages.slice(0,34)).map(({orderAfter,positionFrame,...m},order)=>({...m,order}));store.put(chat);};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    },url);
    await context.close();small=true;context=await launch();await route();page=await context.newPage();await page.goto(url);
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','3');
    await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('orchid');
    await expect(page.locator('.search-coverage')).toContainText('40 messages');
    await page.getByRole('button',{name:'Close search',exact:true}).click();
    await page.locator('#scroll').evaluate(el=>{el.scrollTop=1;});
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','20');
    await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('orchid');
    let group=await expandWord(page,'orchid');
    while(await group.getByRole('button',{name:'More orchid matches'}).count())await group.getByRole('button',{name:'More orchid matches'}).click();
    const expected=Array.from({length:20},(_,i)=>[`Orchid input ${i}.`,`Orchid answer ${i}. Closing notes.`]).flat();
    expect(await group.locator('.search-excerpt').allTextContents()).toEqual(expected);
    await expect.poll(async()=>{
      const saved=await records(context.serviceWorkers()[0]);return saved.map(m=>m.text);
    }).toEqual(expected);
    expect(new Set((await records(context.serviceWorkers()[0])).map(m=>m.key))).toEqual(new Set(originalKeys));
    await page.evaluate(()=>window.unload());await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','3');
    await group.locator('.search-result').nth(1).click();
    await expect(page.locator('.toast')).toContainText('matching passage',{timeout:15000});
    const top=await page.locator('#orchid-0').evaluate(el=>el.getBoundingClientRect().top);expect(top).toBeGreaterThanOrEqual(65);expect(top).toBeLessThan(240);
    await context.close();context=await launch();await route();page=await context.newPage();await page.goto(url);
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','3');
    await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('orchid');group=await expandWord(page,'orchid');
    await expect(group.locator('.search-excerpt')).toHaveText(expected.slice(0,2));
    worker=context.serviceWorkers()[0];const id=new URL(worker.url()).host;
    const library=await context.newPage();await library.goto(`chrome-extension://${id}/library.html#orchid`);
    const libraryGroup=await expandWord(library,'orchid',{library:true});
    await expect(libraryGroup.locator('.library-excerpt')).toHaveText(expected.slice(0,2));
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});
