import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {providerFixture} from './provider-fixtures.js';
import {expandWord} from './search-ui.js';

// Hosts as observed live: ChatGPT keeps only recent turns and loads older ones
// on upward wheel input at the top (a "Loading older messages…" status shows
// meanwhile); scroll position alone loads nothing. Claude draws only rows near
// the viewport of a very long transcript.
const wheelHistory=`<script>requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const scroll=document.querySelector('#scroll'),rows=[...scroll.children],batch=6,hidden=rows.slice(0,-batch);
  hidden.forEach(row=>row.remove());
  // Positioned like ChatGPT's: its hidden label scrolls with the transcript.
  const spinner=document.createElement('div');spinner.setAttribute('role','status');spinner.style.position='relative';
  spinner.innerHTML='<div style="height:30px">◌</div><span class="sr-only">Loading older messages…</span>';
  if(hidden.length)scroll.prepend(spinner);
  scroll.scrollTop=scroll.scrollHeight;let loading=false;window.wheelLoads=0;
  scroll.addEventListener('wheel',event=>{
    if(event.deltaY>=0||scroll.scrollTop>5||loading||!hidden.length)return;loading=true;
    setTimeout(()=>{const before=scroll.scrollHeight;spinner.after(...hidden.splice(-batch));scroll.scrollTop+=scroll.scrollHeight-before;
      loading=false;window.wheelLoads++;if(!hidden.length)spinner.remove();},700);
  });
}));</script></body>`;
const virtualized=`<script>requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const scroll=document.querySelector('#scroll'),rows=[...document.querySelector('[data-testid="transcript-list"]').children];
  const content=rows.map(row=>row.innerHTML);
  for(const row of rows){row.style.height=row.getBoundingClientRect().height+'px';row.style.boxSizing='border-box';}
  scroll.scrollTop=scroll.scrollHeight;
  const render=()=>{const box=scroll.getBoundingClientRect();
    rows.forEach((row,i)=>{const r=row.getBoundingClientRect(),inside=r.bottom>box.top-1200&&r.top<box.bottom+1200;
      if(inside&&!row.childElementCount)row.innerHTML=content[i];else if(!inside&&row.childElementCount)row.innerHTML='';});};
  scroll.addEventListener('scroll',render);render();
}));</script></body>`;

// Claude delivers older history in batches, each only while the top is in view.
const topBatches=`<script>requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const scroll=document.querySelector('#scroll'),list=document.querySelector('[data-testid="transcript-list"]'),rows=[...list.children],hidden=rows.slice(0,-20);
  hidden.forEach(row=>row.remove());scroll.scrollTop=scroll.scrollHeight;let loading=false;
  scroll.addEventListener('scroll',()=>{
    if(scroll.scrollTop>5||loading||!hidden.length)return;loading=true;
    setTimeout(()=>{const before=scroll.scrollHeight;list.prepend(...hidden.splice(-40));scroll.scrollTop+=scroll.scrollHeight-before;loading=false;},700);
  });
}));</script></body>`;
const cases=[
  {provider:'chatgpt',url:'https://chatgpt.com/c/history-restore',count:30,target:4,hard:wheelHistory},
  {provider:'claude',url:'https://claude.ai/chat/history-restore',count:250,target:242,hard:virtualized},
  {provider:'claude',url:'https://claude.ai/chat/history-start',count:200,target:1,hard:topBatches,name:'its first answer, behind batches of older history'},
];
for(const {provider,url,count,target,hard,name='a saved passage outside the drawn history'} of cases)test(`${provider}: ${name} is restored without a manual scroll`,async()=>{
  test.setTimeout(120000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-history-')),extension=resolve('dist');
  const launch=()=>chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const messages=Array.from({length:count},(_,i)=>({prompt:`Lantern question ${i}.`,
    answer:`<div class="response"><p>Lantern answer ${i}.</p>${i===target?'<p id="target">The quillfeather harbor opened at dawn.</p>':''}<p>Closing notes ${i}.</p></div>`}));
  let mode='full',context=await launch();
  const route=()=>context.route(`${new URL(url).origin}/**`,r=>r.fulfill({body:mode==='full'?providerFixture(provider,{messages}):providerFixture(provider,{messages}).replace('</body>',hard),contentType:'text/html'}));
  try{
    // Seen once in full, so the library holds the passage.
    await route();let page=await context.newPage();await page.goto(url);
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count',String(count));
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    await expect.poll(()=>worker.evaluate(async url=>{
      const db=await new Promise(resolve=>{const request=indexedDB.open('threadrail-library');request.onsuccess=()=>resolve(request.result);});
      if(!db.objectStoreNames.contains('chats')){db.close();return 0;}
      const chat=await new Promise(resolve=>{const request=db.transaction('chats').objectStore('chats').get(url);request.onsuccess=()=>resolve(request.result);});db.close();
      return chat?.messages?.length??0;
    },url),{timeout:30000}).toBe(count*2);
    // Reopened as the host really behaves: the passage is not drawn.
    await context.close();mode='hard';context=await launch();await route();page=await context.newPage();await page.goto(url);
    await expect(page.locator('#target')).toHaveCount(0);
    await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('quillfeather');
    const group=await expandWord(page,'quillfeather');
    await group.locator('.search-result').first().click();
    await expect(page.locator('.toast')).toContainText('matching passage',{timeout:45000});
    const top=await page.locator('#target').evaluate(el=>el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(60);expect(top).toBeLessThan(500);
    if(provider==='chatgpt')expect(await page.evaluate(()=>window.wheelLoads)).toBeGreaterThan(0);
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});
