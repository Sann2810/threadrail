import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {providerFixture} from './provider-fixtures.js';

async function fixture(){
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-diagnostics-'));
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${resolve('dist')}`,`--load-extension=${resolve('dist')}`]});
  let small=false,changed=false;
  const scenes=[
    {provider:'chatgpt',url:'https://chatgpt.com/c/diagnostics',query:'zen was being dumb where was this',text:'Zen made a ridiculous mistake. She poured orange juice into the kettle instead of water, then tried to boil it. Everyone laughed at her foolish behavior.',expected:'orange juice into the kettle'},
    {provider:'claude',url:'https://claude.ai/chat/diagnostics',query:'broken heating appliance',text:'The radiator stopped working during the cold night. Ice formed on the bedroom windows.',expected:'radiator stopped working'},
    {provider:'gemini',url:'https://gemini.google.com/app/diagnostics',query:'money back after a faulty purchase',text:'I asked the shop to reimburse me because the camera arrived damaged.',expected:'camera arrived damaged',prompt:true},
  ];
  for(const scene of scenes){
    await context.route(`${new URL(scene.url).origin}/**`,r=>{
      const messages=Array.from({length:20},(_,i)=>({prompt:`Entry ${i}. Describe the landscape.`,answer:'<p style="min-height:250px">Trees lined the path toward a bridge.</p>'}));
      const text=changed?'The original text was removed.':scene.text;
      messages[3]={prompt:scene.prompt?`<span id="remembered">${text}</span>`:'Continue this chapter.',answer:scene.prompt?'<p>Let us address that issue next.</p>':'<p>Books lined the quiet reading room.</p>'.repeat(25)+`<p id="remembered">${text}</p>`+'<p>Closing notes.</p>'.repeat(15)};
      const html=providerFixture(scene.provider,{messages}).replace('</body>',`<script>
        const parent=document.querySelector('${scene.provider==='claude'?'[data-testid="transcript-list"]':'#scroll'}'),rows=[...parent.children],factor=${scene.provider==='claude'?2:1};
        ${small?"rows.slice(0,17*factor).forEach(row=>row.remove());":''}
        document.querySelector('#scroll').addEventListener('scroll',()=>{if(document.querySelector('#scroll').scrollTop<=1)parent.prepend(...rows.slice(0,17*factor));});
      </script></body>`);
      return r.fulfill({body:html,contentType:'text/html'});
    });
  }
  const originals=[];
  for(const scene of scenes){
    const page=await context.newPage();await page.goto(scene.url);await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','20');
    await page.getByRole('textbox',{name:'Message',exact:true}).fill('Keep this unsent draft.');originals.push(page);
    await page.keyboard.press('Alt+Shift+f');const opened=context.waitForEvent('page');await page.getByRole('button',{name:'All chats',exact:false}).click();const library=await opened;
    await expect(library.locator('#coverage')).toContainText(`${originals.length} chat`);await library.close();
  }
  small=true;
  const worker=context.serviceWorkers()[0],id=new URL(worker.url()).host;
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/diagnostics.html`);
  const tests=scenes.map(s=>({query:s.query,expectedChatURL:s.url,expectedPassage:s.expected}));
  const load=async cases=>page.locator('#import').setInputFiles({name:'tests.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({cases}))});
  return {context,page,tests,originals,id,load,setChanged:()=>changed=true,close:async()=>{await context.close();await rm(directory,{recursive:true,force:true});}};
}

test('one user run ranks all providers, restores exact passages twice, exports scoped evidence and survives reopening without autorun',async()=>{
  test.setTimeout(180000);const f=await fixture();
  try{
    await f.load(f.tests);const existing=new Set(f.context.pages());await f.page.getByRole('button',{name:'Run tests',exact:true}).click();
    await expect(f.page.locator('#status')).toHaveText('Finished.',{timeout:150000});
    const report=await f.page.evaluate(async()=> (await chrome.storage.local.get('diagnosticReport')).diagnosticReport);
    await writeFile('test-results/diagnostics-report.json',JSON.stringify(report,null,2));
    await expect(f.page.locator('#summary')).toHaveText('6/6 passed');
    expect(report.results).toHaveLength(6);
    for(const row of report.results){expect(row.rank).toBe(1);expect(row.ok).toBe(true);expect(row.jump.first.ok).toBe(true);expect(row.jump.second.ok).toBe(true);expect(row.jump.second.top).toBeGreaterThanOrEqual(row.jump.second.headerBottom);}
    expect(new Set(f.context.pages())).toEqual(existing);
    for(const original of f.originals)await expect(original.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep this unsent draft.');
    const downloaded=f.page.waitForEvent('download');await f.page.getByRole('button',{name:'Export report',exact:true}).click();
    const download=await downloaded,exported=JSON.parse(await readFile(await download.path(),'utf8'));
    expect(exported.results[0].query).toBeUndefined();expect(exported.results[0].expectedPassage).toBeUndefined();
    await f.page.reload();await expect(f.page.locator('#summary')).toHaveText('6/6 passed');await expect(f.page.locator('.diagnostic-case')).toHaveCount(3);
    await expect(f.page.getByRole('button',{name:'Run tests',exact:true})).toBeEnabled();expect(new Set(f.context.pages())).toEqual(existing);
    await f.page.screenshot({path:'test-results/diagnostics-success.png'});await writeFile('test-results/diagnostics-report.json',JSON.stringify(report,null,2));
  }finally{await f.close();}
});

test('wrong first matches fail explicitly and never open the expected lower result',async()=>{
  test.setTimeout(120000);const f=await fixture();
  try{
    await f.load([{...f.tests[1],query:f.tests[0].query}]);const before=f.context.pages().length;let opened=0;f.context.on('page',()=>opened++);
    await f.page.getByRole('button',{name:'Run tests',exact:true}).click();await expect(f.page.locator('#status')).toHaveText('Finished.',{timeout:90000});
    await expect(f.page.locator('#summary')).toHaveText('0/2 passed');await expect(f.page.locator('#checks')).toContainText('Wrong chat ranked first');expect(opened).toBe(0);expect(f.context.pages()).toHaveLength(before);
  }finally{await f.close();}
});

test('closing the runner cancels only its temporary tabs and reports an interrupted run when reopened',async()=>{
  test.setTimeout(120000);const f=await fixture();
  try{
    await f.load(f.tests);const opened=f.context.waitForEvent('page');await f.page.getByRole('button',{name:'Run tests',exact:true}).click();const temporary=await opened;
    await f.page.close();await expect.poll(()=>temporary.isClosed(),{timeout:15000}).toBe(true);
    const next=await f.context.newPage();await next.goto(`chrome-extension://${f.id}/diagnostics.html`);await expect(next.locator('#summary')).toContainText('Interrupted');
    await expect(next.getByRole('button',{name:'Run tests',exact:true})).toBeEnabled();
    for(const original of f.originals){expect(original.isClosed()).toBe(false);await expect(original.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Keep this unsent draft.');}
  }finally{await f.close();}
});

test('passage verification rejects an offscreen range even when the last toast says the jump succeeded',async()=>{
  test.setTimeout(90000);const f=await fixture();
  try{
    await f.originals[0].bringToFront();
    const worker=f.context.serviceWorkers()[0],url=f.tests[0].expectedChatURL;
    const evidence=await worker.evaluate(async({url,expectedPassage})=>{
      const db=await new Promise(resolve=>{const r=indexedDB.open('threadrail-library');r.onsuccess=()=>resolve(r.result);});
      const chat=await new Promise(resolve=>{const r=db.transaction('chats').objectStore('chats').get(url);r.onsuccess=()=>resolve(r.result);});db.close();
      const source=chat.messages.find(m=>m.role==='answer'&&m.text.includes(expectedPassage)),[tab]=await chrome.tabs.query({active:true,currentWindow:true});
      const target={chatURL:url,role:source.role,nativeId:source.nativeId,messageKey:source.key,sourceText:source.text,matchText:expectedPassage,matchOffset:source.text.indexOf(expectedPassage)};
      await chrome.tabs.sendMessage(tab.id,{type:'threadrail:archive-jump',target});
      const first=await chrome.tabs.sendMessage(tab.id,{type:'threadrail:archive-verify',target,expectedPassage});
      return {first,target,tabId:tab.id};
    },{url,expectedPassage:f.tests[0].expectedPassage});
    expect(evidence.first.ok).toBe(true);
    await f.originals[0].locator('#scroll').evaluate(node=>node.scrollTop=0);
    await expect(f.originals[0].locator('.toast')).toContainText('matching passage');
    const second=await worker.evaluate(({tabId,target,expectedPassage})=>chrome.tabs.sendMessage(tabId,{type:'threadrail:archive-verify',target,expectedPassage}),{...evidence,expectedPassage:f.tests[0].expectedPassage});
    expect(second.ok).toBe(false);expect(second.reason).toMatch(/outside the readable viewport/);
  }finally{await f.close();}
});

test('clearing the library stops a running diagnostic and cannot resurrect saved tests or reports',async()=>{
  test.setTimeout(120000);const f=await fixture();
  try{
    await f.load(f.tests);const opened=f.context.waitForEvent('page');await f.page.getByRole('button',{name:'Run tests',exact:true}).click();const temporary=await opened;
    const library=await f.context.newPage();await library.goto(`chrome-extension://${f.id}/library.html`);
    await library.locator('#clear').click();await library.locator('#confirm-clear').click();
    await expect(library.locator('#coverage')).toContainText('0 chats');await expect.poll(()=>temporary.isClosed()).toBe(true);
    await expect(f.page.locator('#report')).toBeHidden();await expect(f.page.locator('#coverage')).toHaveText('0 saved chats');
    await expect(f.page.getByRole('button',{name:'Run tests',exact:true})).toBeEnabled();
    expect(await f.page.evaluate(()=>chrome.storage.local.get(['diagnosticPlan','diagnosticReport']))).toEqual({});
    await expect(f.page.locator('[name="query"]')).toHaveValue('');
  }finally{await f.close();}
});

test('a changed source cannot be reported as a successful saved-passage test',async()=>{
  test.setTimeout(120000);const f=await fixture();
  try{
    await f.load([f.tests[0]]);f.setChanged();await f.page.getByRole('button',{name:'Run tests',exact:true}).click();
    await expect(f.page.locator('#status')).toHaveText('Finished.',{timeout:90000});
    await expect(f.page.locator('#summary')).toHaveText('0/2 passed');
    const report=await f.page.evaluate(async()=> (await chrome.storage.local.get('diagnosticReport')).diagnosticReport);
    expect(report.results.every(row=>!row.ok)).toBe(true);expect(report.results[0].reason).toMatch(/restored|changed/);
  }finally{await f.close();}
});

test('verification rejects an edit elsewhere in the same answer even when the exact gold quote remains visible',async()=>{
  test.setTimeout(90000);const f=await fixture();
  try{
    const page=f.originals[0];await page.bringToFront();
    const worker=f.context.serviceWorkers()[0],url=f.tests[0].expectedChatURL,expectedPassage=f.tests[0].expectedPassage;
    const evidence=await worker.evaluate(async({url,expectedPassage})=>{
      const db=await new Promise(resolve=>{const r=indexedDB.open('threadrail-library');r.onsuccess=()=>resolve(r.result);});
      const chat=await new Promise(resolve=>{const r=db.transaction('chats').objectStore('chats').get(url);r.onsuccess=()=>resolve(r.result);});db.close();
      const source=chat.messages.find(m=>m.role==='answer'&&m.text.includes(expectedPassage)),[tab]=await chrome.tabs.query({active:true,currentWindow:true});
      const target={chatURL:url,role:source.role,nativeId:source.nativeId,messageKey:source.key,sourceText:source.text,matchText:expectedPassage,matchOffset:source.text.indexOf(expectedPassage)};
      const jump=await chrome.tabs.sendMessage(tab.id,{type:'threadrail:archive-jump',target});
      const first=await chrome.tabs.sendMessage(tab.id,{type:'threadrail:archive-verify',target,expectedPassage});
      return {jump,first,target,tabId:tab.id};
    },{url,expectedPassage});
    expect(evidence.jump.ok).toBe(true);expect(evidence.first.ok).toBe(true);
    await page.locator('#remembered').evaluate(node=>{node.closest('.assistant').querySelector('p').append(' A real change to the answer.');});
    const second=await worker.evaluate(({tabId,target,expectedPassage})=>chrome.tabs.sendMessage(tabId,{type:'threadrail:archive-verify',target,expectedPassage}),{...evidence,expectedPassage});
    expect(second.ok).toBe(false);expect(second.reason).toBe('Original message text changed');
    expect(second.sourceIdentity).toBe(true);expect(second.sourceUnchanged).toBe(false);
    expect(second.currentFingerprint).not.toBe(second.savedFingerprint);
    await page.locator('#remembered').evaluate(node=>{
      const source=node.closest('.assistant');source.querySelector('p').textContent='Books lined the quiet reading room.';
      source.closest('[data-turn-key]').dataset.turnKey='a-different-original-message';
    });
    const identity=await worker.evaluate(({tabId,target,expectedPassage})=>chrome.tabs.sendMessage(tabId,{type:'threadrail:archive-verify',target,expectedPassage}),{...evidence,expectedPassage});
    expect(identity.ok).toBe(false);expect(identity.sourceIdentity).toBe(false);expect(identity.reason).toBe('Original message was not restored');
  }finally{await f.close();}
});
