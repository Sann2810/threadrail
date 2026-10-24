import {expandWord} from './search-ui.js';
import { test,expect,chromium } from '@playwright/test';
import { mkdtemp,rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { providerFixture } from './provider-fixtures.js';

for(const [provider,url] of [['chatgpt','https://chatgpt.com/c/launch'],['chatgpt','https://chatgpt.com/codex/tasks/task-launch'],['claude','https://claude.ai/chat/launch'],['claude','https://claude.ai/code/session-launch'],['gemini','https://gemini.google.com/app/launch']]) test(`${provider} ${new URL(url).pathname}: All chats button opens the library with the query and current snapshot`,async()=>{
  test.setTimeout(60000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-launch-')),extension=resolve('dist');
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try {
    await context.route(`${new URL(url).origin}/**`,route=>route.fulfill({body:providerFixture(provider,{count:2}),contentType:'text/html'}));
    const page=await context.newPage();await page.goto(url);
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','2');
    await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep this unsent draft.');
    await page.keyboard.press('Alt+Shift+F');
    const query='Question 1 & its explanation';await page.locator('.search-input').fill(query);
    const opened=context.waitForEvent('page');await page.getByRole('button',{name:'All chats',exact:false}).click();
    const library=await opened;await library.waitForLoadState();
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    expect(library.url()).toBe(`chrome-extension://${new URL(worker.url()).host}/library.html#${encodeURIComponent(query)}`);
    await expect(library.locator('#query')).toHaveValue(query);
    await expect(library.locator('#coverage')).toContainText('1 chat');
    await expect(library.locator('#coverage')).toContainText('4 messages');
    await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep this unsent draft.');
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});

for(const failure of ['sync','async','response']) test(`All chats reports ${failure} launch errors and permits retry`,async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(failure=>{
    window.launchFailure=failure;window.launchRequests=[];
    window.chrome={runtime:{id:'local-test',onMessage:{addListener(){}},sendMessage(message){
      if(message.type!=='threadrail:library-show')return Promise.resolve({error:'Test model unavailable'});
      window.launchRequests.push(message);
      if(window.launchFailure==='sync')throw new Error('Extension context invalidated.');
      if(window.launchFailure==='async')return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
      return Promise.resolve(window.launchFailure==='response'?{error:'The chat library is unavailable in private browsing.'}:{ok:true});
    }}};
  },failure);
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.keyboard.press('Alt+Shift+F');
  await page.getByRole('button',{name:'All chats',exact:false}).click();
  await expect(page.locator('.search-library-error')).toHaveText(failure==='response'?'The chat library is unavailable in private browsing.':'Refresh this page, then try All chats again.');
  await expect(page.getByRole('button',{name:'All chats',exact:false})).toBeEnabled();
  await page.evaluate(()=>window.launchFailure=null);
  await page.getByRole('button',{name:'All chats',exact:false}).click();
  await expect(page.locator('.search-library-error')).toBeHidden();
  expect(await page.evaluate(()=>window.launchRequests.length)).toBe(2);
  expect(errors).toEqual([]);
});

test('saved-chat library persists across tabs, finds meaning across providers and opens the exact passage',async()=>{
  test.setTimeout(120000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-library-'));
  const extension=resolve('dist');
  let context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const outside=[];const errors=[];
  context.on('request',request=>{if(!/^(chrome-extension:|https:\/\/(chatgpt.com|claude.ai|gemini.google.com)\/)/.test(request.url()))outside.push(request.url());});
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  const scenes={
    chatgpt:{url:'https://chatgpt.com/c/kitchen',title:'Kitchen mistake',question:'Continue the kitchen chapter.',answer:'Zen made a foolish mistake. She poured orange juice into the kettle instead of water. Everyone laughed at her ridiculous behavior.'},
    claude:{url:'https://claude.ai/chat/meditation',title:'Quiet meditation',question:'How can Zen help with focus?',answer:'Zen meditation improves awareness through breathing and stillness.'},
    gemini:{url:'https://gemini.google.com/app/radiator',title:'Winter evening',question:'Continue the winter chapter.',answer:'The radiator stopped working during the cold night. Ice formed on the bedroom windows.'},
  };
  try{
    for(const [provider,scene]of Object.entries(scenes)){
      const messages=Array.from({length:8},(_,i)=>({prompt:i===2?scene.question:`Question ${i+1}: Explain idea ${i+1} in plain language.`,answer:i===2?`<p>${scene.answer}</p>`:`<div class="response"><p>Answer ${i+1}. This is a local test response.</p></div>`}));
      const html=providerFixture(provider,{messages}).replace(/<title>.*?<\/title>/,`<title>${scene.title}</title>`);
      await context.route(`${new URL(scene.url).origin}/**`,route=>route.fulfill({body:html,contentType:'text/html'}));
      const page=await context.newPage();await page.goto(scene.url);
      await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','8');
      // A visible sidebar link exercises discovery; ordinary transcript links
      // must never become crawl targets.
      await page.evaluate(url=>{const nav=document.createElement('nav');const link=document.createElement('a');link.href=url;link.textContent='Older saved chat';nav.append(link);document.body.append(nav);},scene.url.replace(/[^/]+$/,'older'));
    }
    let worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    const id=new URL(worker.url()).host;
    const library=await context.newPage();await library.goto(`chrome-extension://${id}/library.html`);
    await expect(library.locator('#coverage')).toContainText('3 chats',{timeout:15000});
    await library.locator('#query').fill('zen was being dumb where was this');
    await expect(library.locator('#search-status')).not.toContainText('Searching',{timeout:75000});
    await expect(library.locator('#best .library-result').first()).toContainText('orange juice',{timeout:75000});
    await expect(library.locator('#best .library-result').first()).toContainText('Kitchen mistake');
    await library.screenshot({path:'test-results/library-smart-search.png'});
    const newTab=context.waitForEvent('page');await library.locator('#best .library-result').filter({hasText:'Kitchen mistake'}).click();const destination=await newTab;
    await expect(destination).toHaveURL(scenes.chatgpt.url);
    await expect(destination.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','8');
    await expect(destination.locator('.toast')).toContainText('matching passage',{timeout:20000});
    const top=await destination.locator('[data-chatgpt-search-unit-key$=":assistant"]').nth(2).evaluate(el=>el.getBoundingClientRect().top);
    expect(top).toBeGreaterThan(50);expect(top).toBeLessThan(220);
    await library.bringToFront();await library.locator('#query').fill('broken heating appliance');
    await expect(library.locator('#best .library-result').first()).toContainText('radiator stopped working',{timeout:15000});
    await expect(library.locator('#best .library-result').first()).toContainText('Winter evening');
    const nextGemini=context.waitForEvent('page');await library.locator('#best .library-result').filter({hasText:'Winter evening'}).click();const gemini=await nextGemini;
    await expect(gemini).toHaveURL(scenes.gemini.url);await expect(gemini.locator('.toast')).toContainText('matching passage',{timeout:15000});
    await library.bringToFront();await library.locator('#query').fill('awareness through breathing');
    await expect(library.locator('#best .library-result').first()).toContainText('Quiet meditation',{timeout:15000});
    const nextClaude=context.waitForEvent('page');await library.locator('#best .library-result').filter({hasText:'Quiet meditation'}).click();const claude=await nextClaude;
    await expect(claude).toHaveURL(scenes.claude.url);await expect(claude.locator('.toast')).toContainText('matching passage',{timeout:15000});
    const claudeTop=await claude.locator('[data-testid="assistant-message"]').nth(2).evaluate(el=>el.getBoundingClientRect().top);expect(claudeTop).toBeGreaterThan(60);expect(claudeTop).toBeLessThan(220);
    await context.close();
    context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    const remembered=await context.newPage();await remembered.goto(`chrome-extension://${id}/library.html#orange%20juice`);
    await expect(remembered.locator('#best .library-result').first()).toContainText('Kitchen mistake',{timeout:15000});
    await remembered.setViewportSize({width:390,height:844});
    expect(await remembered.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await remembered.screenshot({path:'test-results/library-mobile.png'});
    await remembered.locator('#saving').uncheck();
    await remembered.locator('#clear').click();await remembered.locator('#confirm-clear').click();
    await expect(remembered.locator('#coverage')).toContainText('0 chats');
    await expect(remembered.locator('#saving')).not.toBeChecked();
    expect(outside).toEqual([]);expect(errors).toEqual([]);
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});

test('Index saved chats discovers all three sidebars, captures unvisited chats, preserves drafts and exposes every word match',async()=>{
  test.setTimeout(120000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-crawl-')),extension=resolve('dist');
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
    const originals=[];
    for(const [provider,origin,path]of [['chatgpt','https://chatgpt.com','/c/'],['claude','https://claude.ai','/chat/'],['gemini','https://gemini.google.com','/app/']]){
      await context.route(`${origin}/**`,route=>{
        const older=route.request().url().includes('/older');
        const messages=[0,1].map(i=>({prompt:`librarykeyword ${provider} ${older?'older':'current'} prompt ${i}.${i===0?` <a href="${origin}${path}ignore-transcript-link">A conversation mentioned inside a message</a>`:''}`,answer:`<p>librarykeyword ${provider} ${older?'older':'current'} answer ${i}.</p>`}));
        const title=`${provider} ${older?'older':'current'}`;
        const html=providerFixture(provider,{messages}).replace(/<title>.*?<\/title>/,`<title>${title}</title>`).replace('</main>',`<nav><a href="${origin}${path}older">${provider} older</a></nav></main>`);
        return route.fulfill({body:html,contentType:'text/html'});
      });
      const page=await context.newPage();await page.goto(`${origin}${path}current`);
      await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','2');
      await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep this draft');originals.push(page);
    }
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
    const library=await context.newPage();await library.goto(`chrome-extension://${id}/library.html`);
    await library.locator('#scan').click();await expect(library.locator('#scan')).toBeEnabled({timeout:90000});
    await expect(library.locator('#coverage')).toContainText('6 chats');await expect(library.locator('#coverage')).toContainText('24 messages');
    await expect(library.locator('#scan-status')).toContainText('6 chats added');
    for(const page of originals)await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep this draft');
    await library.locator('#query').fill('librarykeyword');
    const group=await expandWord(library,'librarykeyword',{library:true});
    await expect(group.locator('.library-count')).toHaveText('24');await expect(group.locator('.library-result')).toHaveCount(2);
    await expect(library.locator('#best .library-result')).toHaveCount(2);
    const bestBounds=await library.locator('#best').boundingBox(),wordBounds=await library.locator('#words').boundingBox();
    expect(Math.abs(bestBounds.y-wordBounds.y)).toBeLessThan(2);expect(bestBounds.x+bestBounds.width).toBeLessThan(wordBounds.x);
    await library.setViewportSize({width:390,height:844});
    const smallBest=await library.locator('#best').boundingBox(),smallWords=await library.locator('#words').boundingBox();
    expect(smallBest.x+smallBest.width).toBeLessThan(smallWords.x);expect(smallWords.x+smallWords.width).toBeLessThanOrEqual(390);
    await library.screenshot({path:'test-results/library-compact-mobile.png'});
    await library.setViewportSize({width:1280,height:900});
    await library.screenshot({path:'test-results/library-compact.png'});
    await group.getByRole('button',{name:'More librarykeyword matches'}).click();await group.getByRole('button',{name:'More librarykeyword matches'}).click();await expect(group.locator('.library-result')).toHaveCount(24);
    const roles=await group.locator('.library-result-meta').allTextContents();roles.forEach((role,i)=>expect(role).toContain(i%2?'Answer':'You'));
    const titles=await group.locator('.library-result-title').allTextContents();for(let i=0;i<24;i+=4)expect(new Set(titles.slice(i,i+4)).size).toBe(1);
    await library.screenshot({path:'test-results/library-word-matches.png'});
    // A second run can be cancelled and closes only its temporary scan tab.
    const pagesBefore=context.pages().length;await library.locator('#scan').click();
    await expect(library.locator('#scan-status')).toContainText('Adding',{timeout:10000});await library.locator('#stop').click();
    await expect(library.locator('#scan')).toBeEnabled({timeout:10000});await expect(library.locator('#scan-status')).toContainText('Stopped');
    await expect.poll(()=>context.pages().length).toBe(pagesBefore);
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});

test('reopening a saved result loads an initially absent older turn and lands deep inside its answer',async()=>{
  test.setTimeout(90000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-library-history-')),extension=resolve('dist');
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
    const filler='<p>The shelves were full of books, and the curtains were closed for the evening.</p>'.repeat(35);
    const older=`<div data-turn-key="older-turn"><div data-talvt-turn-state="complete"><div data-chatgpt-search-unit-key="older:0:user" data-chatgpt-search-message-ids="older-user"><div data-user-message-bubble="true">An older expedition.</div></div><div data-chatgpt-search-unit-key="older:1:assistant">${filler}<p id="archive-target">The amber compass was hidden in the observatory drawer.</p>${filler}</div></div></div>`;
    const html=providerFixture('chatgpt',{count:2}).replace('</body>',`<script>let olderLoaded=false;document.querySelector('#scroll').addEventListener('scroll',()=>{if(olderLoaded||document.querySelector('#scroll').scrollTop>1)return;olderLoaded=true;setTimeout(()=>{document.querySelector('#scroll').insertAdjacentHTML('afterbegin',${JSON.stringify(older)});},300);});</script></body>`);
    await context.route('https://chatgpt.com/**',route=>route.fulfill({body:html,contentType:'text/html'}));
    const page=await context.newPage();await page.goto('https://chatgpt.com/c/earlier');await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','2');
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
    const library=await context.newPage();await library.goto(`chrome-extension://${id}/library.html`);
    await library.locator('#scan').click();await expect(library.locator('#scan')).toBeEnabled({timeout:60000});
    await expect(library.locator('#coverage')).toContainText('6 messages');
    await library.locator('#query').fill('amber compass');
    const row=(await expandWord(library,'amber',{library:true})).locator('.library-result');await expect(row).toHaveCount(1);
    const opened=context.waitForEvent('page');await row.click();const target=await opened;
    await expect(target.locator('#archive-target')).toBeAttached({timeout:15000});
    await expect(target.locator('.toast')).toContainText('matching passage',{timeout:15000});
    const top=await target.locator('#archive-target').evaluate(el=>el.getBoundingClientRect().top);expect(top).toBeGreaterThan(50);expect(top).toBeLessThan(220);
    await target.screenshot({path:'test-results/library-older-passage.png'});
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','2');
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});

test('Remove and Clear cannot be undone by stale snapshots or delayed vector writes',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const store=await import('/src/archive-store.js');
    const before=Date.now()-1000;
    const snapshot={url:'https://chatgpt.com/c/race',title:'Private test',provider:'ChatGPT',capturedAt:before,messages:[{key:'one',role:'answer',text:'A local-only source.',context:'',inputText:'Test'}]};
    await store.saveChat(snapshot);await store.forgetChats();
    await store.saveChat(snapshot);
    await store.writeVectors([{id:'stale',chatURL:snapshot.url,savedAt:before,embeddingText:'old private text',vector:[1,0]}]);
    const cleared={chats:(await store.allChats()).length,vectors:(await store.readVectors()).length};
    await store.saveChat({...snapshot,capturedAt:Date.now()+1});
    const fresh=(await store.allChats()).length;
    await store.forgetChats(snapshot.url);
    await store.saveChat(snapshot);
    await store.writeVectors([{id:'stale-again',chatURL:snapshot.url,savedAt:before,embeddingText:'old private text',vector:[1,0]}]);
    return {cleared,fresh,removed:{chats:(await store.allChats()).length,vectors:(await store.readVectors()).length}};
  });
  expect(result).toEqual({cleared:{chats:0,vectors:0},fresh:1,removed:{chats:0,vectors:0}});
});
