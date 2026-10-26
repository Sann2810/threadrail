import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {providerFixture} from './provider-fixtures.js';

// A chat page stores vectors for its 140-word windows only; sentence passages
// with saved vectors prove the background built the rest after the chat was saved.
test('a saved chat gets every passage vector in the background, ready before any search',async()=>{
  test.setTimeout(120000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-background-')),extension=resolve('dist');
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const url='https://chatgpt.com/c/background-vectors';
  const messages=Array.from({length:4},(_,i)=>({prompt:`Kettle question ${i}.`,answer:`<p>The kettle cooled on the ledge while the tea steeped ${i}. Then the harbor lights came on slowly.</p>`}));
  try{
    await context.route('https://chatgpt.com/**',route=>route.fulfill({body:providerFixture('chatgpt',{messages}),contentType:'text/html'}));
    const page=await context.newPage();await page.goto(url);
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','4');
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    const stored=()=>worker.evaluate(async url=>{
      const db=await new Promise(resolve=>{const request=indexedDB.open('threadrail-library');request.onsuccess=()=>resolve(request.result);});
      if(!db.objectStoreNames.contains('vectors')){db.close();return [];}
      const keys=await new Promise(resolve=>{const request=db.transaction('vectors').objectStore('vectors').getAllKeys(IDBKeyRange.bound(`${url}::`,`${url}::￿`));request.onsuccess=()=>resolve(request.result);});
      db.close();return keys;
    },url);
    await expect.poll(async()=>(await stored()).filter(id=>id.includes(':passage:')).length,{timeout:60000}).toBeGreaterThan(0);
    // No search was opened: every piece of the saved chat has a vector.
    const ids=await stored();
    expect(ids.filter(id=>!id.includes(':passage:')).length).toBeGreaterThanOrEqual(8);
    await expect(page.locator('.search-panel')).toBeHidden();
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});
