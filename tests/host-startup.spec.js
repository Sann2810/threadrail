import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {providerFixture} from './provider-fixtures.js';

for(const provider of ['chatgpt','claude'])test(`${provider}: saved navigation waits for the host startup scroll and virtual-window remount`,async()=>{
  test.setTimeout(30000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-startup-'));
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${resolve('dist')}`,`--load-extension=${resolve('dist')}`]});
  const origin=provider==='chatgpt'?'https://chatgpt.com':'https://claude.ai',url=origin+(provider==='chatgpt'?'/c/startup':'/chat/startup');
  const quote='The old compass was beside the green telescope.';
  const messages=Array.from({length:16},(_,i)=>({prompt:`Discuss page ${i}.`,answer:i===3?`<p id="startup-gold">${quote}</p>`:'<p style="height:250px">The books were on the shelf.</p>'}));
  const html=providerFixture(provider,{messages}).replace('</body>',`<script>
    const parent=document.querySelector('${provider==='claude'?'[data-testid="transcript-list"]':'#scroll'}'),scroller=document.querySelector('#scroll'),rows=[...parent.children],factor=${provider==='claude'?2:1};
    if(${JSON.stringify(provider)}==='claude')rows.forEach((row,i)=>row.id='stable-row-'+i);
    rows.slice(0,13*factor).forEach(row=>row.remove());
    window.earlyNavigation=false;let booting=true;const original=scroller.scrollTo.bind(scroller);
    scroller.scrollTo=options=>{if(booting)window.earlyNavigation=true;original(options);};
    const earlier=document.createElement('button');earlier.textContent='Load earlier messages';earlier.disabled=true;parent.prepend(earlier);
    earlier.onclick=()=>{parent.prepend(...rows.slice(0,13*factor));earlier.remove();};
    setTimeout(()=>scroller.scrollTop=scroller.scrollHeight,300);
    setTimeout(()=>{scroller.style.paddingTop='100px';scroller.scrollTop=scroller.scrollHeight;},600);
    setTimeout(()=>{for(const row of rows.slice(13*factor)){if(row.isConnected)row.replaceWith(row.cloneNode(true));}booting=false;earlier.disabled=false;scroller.scrollTop=scroller.scrollHeight;},1100);
  </script></body>`);
  try{
    await context.route(origin+'/**',r=>r.fulfill({body:html,contentType:'text/html'}));
    const page=await context.newPage();await page.goto(url);
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','3');
    await page.bringToFront();
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    const target={chatURL:url,role:'answer',nativeId:provider==='chatgpt'?'chatgpt:turn-3:answer:0':'claude:stable-row-7:answer:0',sourceText:quote,matchText:quote,matchOffset:0};
    const result=await worker.evaluate(async({url,target,quote})=>{
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      const jump=await chrome.tabs.sendMessage(tab.id,{type:'threadrail:archive-jump',target});
      const verification=await chrome.tabs.sendMessage(tab.id,{type:'threadrail:archive-verify',target,expectedPassage:quote});
      return {jump,verification};
    },{url,target,quote});
    expect(await page.evaluate(()=>window.earlyNavigation)).toBe(false);
    expect(result.jump.ok,JSON.stringify(result)).toBe(true);expect(result.verification.ok,JSON.stringify(result)).toBe(true);
    expect(result.jump.restoration.stop).toBe('matched');
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});
