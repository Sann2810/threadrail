import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {providerFixture} from './provider-fixtures.js';
import {expandWord} from './search-ui.js';

test('All chats keeps every cached provider message in order after reopening and restores exact early and late word passages',async()=>{
  test.setTimeout(120000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-library-order-')),extension=resolve('dist');
  const launch=()=>chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const scenes=[['chatgpt','https://chatgpt.com/c/library-order'],['claude','https://claude.ai/chat/library-order'],['gemini','https://gemini.google.com/app/library-order']];
  const expected=scenes.flatMap(([provider])=>Array.from({length:20},(_,i)=>[`${provider} Orchid input ${i}.`,`${provider} Orchid answer ${i}. Closing notes.`]).flat());
  let context=await launch(),small=false;
  const route=async()=>{
    for(const [provider,url]of scenes){
      const messages=Array.from({length:20},(_,i)=>({prompt:`${provider} Orchid input ${i}.`,answer:`<p id="orchid-${i}">${provider} Orchid answer ${i}.</p><div style="height:250px">Closing notes.</div>`}));
      const html=providerFixture(provider,{messages}).replace('</body>',`<script>
        const parent=document.querySelector('${provider==='claude'?'[data-testid="transcript-list"]':'#scroll'}'),rows=[...parent.children],factor=${provider==='claude'?2:1};
        window.restore=()=>parent.prepend(...rows.slice(0,17*factor));
        ${small?"rows.slice(0,17*factor).forEach(row=>row.remove());":''}
        document.querySelector('#scroll').addEventListener('scroll',()=>{if(document.querySelector('#scroll').scrollTop<=1)window.restore();});
      </script></body>`);
      await context.route(`${new URL(url).origin}/**`,r=>r.fulfill({body:html,contentType:'text/html'}));
    }
  };
  const expandAll=async library=>{
    const group=await expandWord(library,'orchid',{library:true});
    while(await group.getByRole('button',{name:'More orchid matches'}).count())await group.getByRole('button',{name:'More orchid matches'}).click();
    await expect(group.locator('.library-excerpt')).toHaveText(expected);
    return group;
  };
  try{
    await route();
    for(const [,url]of scenes){
      const page=await context.newPage();await page.goto(url);
      await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','20');
      await page.keyboard.press('Alt+Shift+f');const opened=context.waitForEvent('page');await page.getByRole('button',{name:'All chats',exact:false}).click();
      // Wait for persisted capture before opening the next provider. This also
      // establishes deterministic saved-chat order, independently of row order.
      const library=await opened;
      await expect(library.locator('#coverage')).toContainText(`${scenes.findIndex(s=>s[1]===url)+1} chat`);
      await library.close();
    }
    let worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    const id=new URL(worker.url()).host;
    // Disrupt only fixture-owned stored array order, preserving the ordering
    // evidence captured through the actual installed content script.
    await worker.evaluate(async()=>{
      const db=await new Promise(resolve=>{const req=indexedDB.open('threadrail-library');req.onsuccess=()=>resolve(req.result);});
      await new Promise((resolve,reject)=>{const tx=db.transaction('chats','readwrite'),store=tx.objectStore('chats'),get=store.getAll();
        get.onsuccess=()=>{for(const chat of get.result){chat.messages=chat.messages.slice(34).concat(chat.messages.slice(0,34));store.put(chat);}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    });
    await context.close();small=true;context=await launch();await route();
    let library=await context.newPage();await library.goto(`chrome-extension://${id}/library.html#orchid`);
    await expect(library.locator('#coverage')).toContainText('3 chats · 120 messages');
    await expandAll(library);
    await library.close();library=await context.newPage();await library.goto(`chrome-extension://${id}/library.html#orchid`);
    let group=await expandAll(library);
    for(const [provider,url]of scenes){
      for(const i of [0,19]){
        const selected=group.locator('.library-result').filter({hasText:`${provider} Orchid answer ${i}. Closing notes.`});
        const opened=context.waitForEvent('page');await selected.click();const destination=await opened;
        await expect(destination).toHaveURL(url);
        await expect(destination.locator('.toast')).toContainText('matching passage',{timeout:20000});
        const target=destination.locator(`#orchid-${i}`);
        const rect=await target.evaluate(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom}));
        expect(rect.top).toBeGreaterThanOrEqual(65);expect(rect.bottom).toBeLessThan(830);
        await expect(destination.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('');
        await destination.close();await library.bringToFront();group=await expandAll(library);
      }
    }
    await library.screenshot({path:'test-results/library-cached-order.png'});
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});
