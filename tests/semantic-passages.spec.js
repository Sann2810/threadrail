import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {providerFixture} from './provider-fixtures.js';
import {semanticCases,semanticMessages} from './semantic-cases.js';

for(const provider of ['chatgpt','claude','gemini'])test(`${provider}: mixed-event vague queries retrieve verbatim passages and jump to the exact clause`,async()=>{
  test.setTimeout(180000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-passages-'));
  const extension=resolve('dist');
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const origin={chatgpt:'https://chatgpt.com',claude:'https://claude.ai',gemini:'https://gemini.google.com'}[provider];
  try{
    await context.route(`${origin}/**`,r=>r.fulfill({body:providerFixture(provider,{messages:semanticMessages}),contentType:'text/html'}));
    const outbound=[];context.on('request',r=>{if(!r.url().startsWith(origin+'/')&&!r.url().startsWith('chrome-extension://'))outbound.push(r.url());});
    const page=await context.newPage();await page.goto(origin+{chatgpt:'/c/mixed-events',claude:'/chat/mixed-events',gemini:'/app/mixed-events'}[provider]);
    const proof=[];
    for(const item of semanticCases){
      await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill(item.query);
      await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready',{timeout:120000});
      const rows=page.locator('.search-best .search-result'),texts=await rows.allTextContents();
      const rank=texts.findIndex(t=>t.includes(item.expected));expect(rank).toBeGreaterThanOrEqual(0);expect(rank).toBeLessThan(item.maxRank??1);
      const selected=rows.nth(rank);const excerpt=await selected.locator('.search-excerpt').innerText();
      const role=(await selected.locator('.search-result-label').innerText()).startsWith('You')?'prompt':'answer';
      await selected.click();await expect(page.locator('threadrail-navigation')).not.toHaveAttribute('data-state','JUMPING');
      await expect(page.locator('.toast')).toContainText('matching passage');
      // The original input also contains the mixed event. Follow the selected
      // role, then independently resolve its exact excerpt to a DOM text range.
      const rect=await page.evaluate(({expected,role})=>{
        const needle=expected.replace(/\s+/g,' ').trim();
        for(const source of document.querySelectorAll(role==='prompt'?'.user':'.assistant')){
          const walker=document.createTreeWalker(source,NodeFilter.SHOW_TEXT),positions=[];let text='';
          for(let n=walker.nextNode();n;n=walker.nextNode()){
            if(n.parentElement.closest('button,[aria-hidden="true"],.sr-only,.cdk-visually-hidden'))continue;
            for(let i=0;i<n.data.length;i++){const c=/\s/u.test(n.data[i])?' ':n.data[i];if(c===' '&&(!text||text.endsWith(' ')))continue;text+=c;positions.push({node:n,offset:i});}
          }
          const start=text.indexOf(needle);if(start<0)continue;
          const range=document.createRange(),a=positions[start],b=positions[start+needle.length-1];range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset+1);
          const r=range.getBoundingClientRect(),s=document.querySelector('#scroll');return{top:r.top,bottom:r.bottom,bottomClamped:Math.abs(s.scrollTop-(s.scrollHeight-s.clientHeight))<2};
        }
        throw Error('Excerpt missing from original source');
      },{expected:item.expected,role});
      expect(rect.top,item.query).toBeGreaterThanOrEqual(65);expect(rect.top<240||rect.bottomClamped,item.query).toBe(true);expect(rect.bottom,item.query).toBeLessThan(900);
      proof.push({query:item.query,rank:rank+1,excerpt,highlightTop:rect.top});
    }
    for(const query of ['a spacecraft landed on another planet','quantum cryptography over a satellite link','medical blood test results']){
      await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill(query);
      await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready');
      await expect(page.locator('.search-best .search-result')).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
    expect(outbound).toEqual([]);
    await writeFile(`test-results/mixed-events-${provider}.json`,JSON.stringify(proof,null,2));
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});
