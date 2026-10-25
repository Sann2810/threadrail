import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {providerFixture} from './provider-fixtures.js';

// The user's unchanged queries and expected quotes, surrounded by synthetic
// content. This verifies mechanics; it is not evidence from their live library.
const cases=[
  {provider:'chatgpt',url:'https://chatgpt.com/c/restoration',query:'I asked for a daily voice coach for about three months',expectedPassage:'I can teach you for 100 days',text:'Yes. I can teach you for 100 days, 20–30 minutes daily, starting with your speaking voice and working toward singing like Charlie Puth.'},
  {provider:'claude',url:'https://claude.ai/chat/restoration',query:'we had almost no headroom left to improve',expectedPassage:'There was almost nothing left to improve on speed.',text:'Why it tied: the old method was already almost perfect at balancing experts. There was almost nothing left to improve on speed. Your formula reduced moves, but could not make an already balanced system much faster.'},
  {provider:'gemini',url:'https://gemini.google.com/app/restoration',query:'keep the characters looking the same in different scenes',expectedPassage:'we will create recurring figures as reusable characters in Higgsfield.',text:'Shot-by-Shot Worlds & Character Continuity: To maintain continuity across scenes, we will create recurring figures as reusable characters in Higgsfield.'},
];

test('unchanged vague queries survive reopening, explicit history restoration, source remounts, late layout shifts and strict double verification',async()=>{
  test.setTimeout(180000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-lifecycle-'));
  const launch=()=>chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${resolve('dist')}`,`--load-extension=${resolve('dist')}`]});
  let context=await launch(),reopened=false;
  const route=async()=>{
    for(const scene of cases){
      const messages=Array.from({length:24},(_,i)=>({prompt:`Describe woodland ${i}.`,answer:'<p style="min-height:250px">The books and maps were arranged in the reading room.</p>'}));
      messages[3]={prompt:scene.provider==='chatgpt'?'How to sing that way? Can you be my daily music teacher for 100 days?':scene.provider==='claude'?'Why did the performance tie?':'How can we maintain character continuity?',answer:'<p>Quiet shelves of books.</p>'.repeat(25)+`<p id="remembered">${scene.text}</p>`+'<p>Closing notes.</p>'.repeat(15)};
      const html=providerFixture(scene.provider,{messages}).replace('</body>',`<script>
        const scroller=document.querySelector('#scroll'),parent=document.querySelector('${scene.provider==='claude'?'[data-testid="transcript-list"]':'#scroll'}');
        const rows=[...parent.children],factor=${scene.provider==='claude'?2:1};
        rows.forEach((row,i)=>{if(${JSON.stringify(scene.provider)}==='claude'){row.id='durable-row-'+i;row.setAttribute('role','article');row.setAttribute('aria-label','Message '+(i+1)+' of 48');}});
        const answer=document.querySelector('#remembered').closest('.assistant');
        answer.style.contentVisibility='auto';answer.style.containIntrinsicSize='auto 2500px';
        const status=document.createElement('div');status.setAttribute('data-find-omitted','');status.setAttribute('data-cds','TurnStatus');status.textContent='Thinking about the answer';answer.prepend(status);
        if(${reopened}){
          status.innerHTML='<span>Thinking about the answer</span><span role="status">Thinking about the answer</span>';
          rows.slice(0,20*factor).forEach(row=>row.remove());
          const earlier=document.createElement('button');earlier.textContent='Load earlier messages';earlier.onclick=()=>{
            earlier.disabled=true;earlier.setAttribute('aria-busy','true');
            setTimeout(()=>{parent.prepend(...rows.slice(0,20*factor).map(row=>row.cloneNode(true)));earlier.remove();},450);
          };parent.prepend(earlier);
          let scheduled=false;
          scroller.addEventListener('scroll',()=>{
            const p=document.querySelector('#remembered');if(!p||scheduled)return;
            const r=p.getBoundingClientRect();if(r.top<0||r.top>700)return;
            scheduled=true;
            setTimeout(()=>{const source=p.closest('.assistant'),clone=source.cloneNode(true);clone.dataset.remounted='true';source.replaceWith(clone);},300);
            setTimeout(()=>{
              const current=document.querySelector('#remembered'),space=document.createElement('div');space.style.height='51px';current.before(space);
              const host=current.closest('.assistant').querySelector('[data-cds="TurnStatus"]');host.textContent='Done';
              current.dataset.shifted='true';
            },650);
          });
        }
      </script></body>`);
      await context.route(`${new URL(scene.url).origin}/**`,r=>r.fulfill({body:html,contentType:'text/html'}));
    }
  };
  try{
    await route();
    for(const [i,scene]of cases.entries()){
      const page=await context.newPage();await page.goto(scene.url);await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','24');
      await page.keyboard.press('Alt+Shift+f');const opened=context.waitForEvent('page');await page.getByRole('button',{name:'All chats',exact:false}).click();const library=await opened;
      await expect(library.locator('#coverage')).toContainText(`${i+1} chat`);await library.close();
    }
    const worker=context.serviceWorkers()[0],id=new URL(worker.url()).host;
    // Simulate a pre-boundary Claude archive with one status label. The
    // reopened host renders a label plus a duplicate live region, then changes
    // that status while landing. The actual answer must stay byte-for-byte.
    for(const original of context.pages())await original.close();
    await worker.evaluate(async({url,quote})=>{
      const db=await new Promise(resolve=>{const r=indexedDB.open('threadrail-library');r.onsuccess=()=>resolve(r.result);});
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('chats','readwrite'),store=tx.objectStore('chats'),r=store.get(url);
        r.onsuccess=()=>{const chat=r.result,message=chat.messages.find(m=>m.text.includes(quote)),prefix='Thinking about the answer';
          message.text=prefix+message.text;message.blockRanges=message.blockRanges?.map(([a,b])=>[a+prefix.length,b+prefix.length]);store.put(chat);};
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });db.close();
    },{url:cases[1].url,quote:cases[1].expectedPassage});
    await context.close();reopened=true;context=await launch();await route();
    let verified=0;
    const page=await context.newPage();await page.goto(`chrome-extension://${id}/diagnostics.html`);
    await page.locator('#import').setInputFiles({name:'unchanged-queries.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({cases:cases.map(({query,url,expectedPassage})=>({query,expectedChatURL:url,expectedPassage}))}))});
    // Observe the actual destination DOM independently of the runner's claims.
    context.on('page',destination=>{
      destination.waitForURL(/https:\/\/(chatgpt.com|claude.ai|gemini.google.com)/).then(async()=>{
        await expect(destination.locator('#remembered')).toHaveAttribute('data-shifted','true',{timeout:25000});
        await expect(destination.locator('.assistant[data-remounted="true"]')).toHaveCount(1);verified++;
      }).catch(()=>{});
    });
    await page.getByRole('button',{name:'Run tests',exact:true}).click();
    await expect(page.locator('#status')).toHaveText('Finished.',{timeout:150000});
    const report=await page.evaluate(async()=> (await chrome.storage.local.get('diagnosticReport')).diagnosticReport);
    await writeFile('test-results/restoration-unchanged-queries.json',JSON.stringify(report,null,2));
    expect(report.results).toHaveLength(6);expect(verified).toBe(6);
    for(const result of report.results){expect(result.rank).toBe(1);expect(result.ok,JSON.stringify(result)).toBe(true);
      expect(result.jump.first.sourceUnchanged).toBe(true);
      if(result.case===1&&result.round===1)expect(result.jump.first.comparison).toBe('restored-message');expect(result.jump.second.sourceIdentity).toBe(true);
      expect(Math.abs(result.jump.first.top-result.jump.second.top)).toBeLessThan(3);}
    await expect(page.locator('#summary')).toHaveText('6/6 passed');
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});

test('message capture, legacy verification and exact ranges share a content boundary without accepting edited answers',async({page})=>{
  await page.goto('/');
  const proof=await page.evaluate(async()=>{
    const {messageText,sourceEvidence}=await import('/src/message-text.js');
    const {passageRange}=await import('/src/search-range.js');
    const element=document.createElement('div');element.innerHTML='<div data-find-omitted data-cds="TurnStatus">ThinkingThinking</div><p>The answer is <b>forty two</b>.</p><div hidden>old draft</div><div data-testid="message-actions">Today</div>';
    document.body.append(element);
    const saved=messageText(element);const legacy=element.cloneNode(true);legacy.querySelector('[hidden]').remove();legacy.querySelector('[data-testid="message-actions"]').remove();
    const {LEGACY_OMITTED}=await import('/src/message-text.js');const old=messageText(legacy,LEGACY_OMITTED);
    const legacyProof=sourceEvidence(legacy,old);
    legacy.querySelector('[data-cds]').innerHTML='<span>Thinking</span><span role="status">Thinking</span>';
    const deduplicated=sourceEvidence(legacy,old.replace('ThinkingThinking','Thinking'));
    const unknown=sourceEvidence(legacy,'Unrecognized prefix '+saved);
    element.querySelector('[data-cds]').textContent='Done';
    const unchanged=sourceEvidence(element,saved),range=passageRange(element,'forty two',0)?.toString();
    element.querySelector('p').append(' This answer was edited.');
    const changed=sourceEvidence(element,saved);
    return {saved,legacyProof,deduplicated,unknown,unchanged,range,changed};
  });
  expect(proof.saved).toBe('The answer is forty two.');expect(proof.legacyProof.unchanged).toBe(true);expect(proof.legacyProof.comparison).toBe('legacy-host-chrome');
  expect(proof.deduplicated.unchanged).toBe(true);expect(proof.unknown.unchanged).toBe(false);
  expect(proof.unchanged.unchanged).toBe(true);expect(proof.range).toBe('forty two');expect(proof.changed.unchanged).toBe(false);
});

test('occluded-frame navigation follows a changing header without animation-frame callbacks',async({page})=>{
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.evaluate(()=>window.fixture.addExchange('Continue the remembered chapter.','<p>Books on shelves.</p>'.repeat(45)+'<p id="occluded-proof">The telescope is beside the green compass.</p>'+'<p>Closing notes.</p>'.repeat(20),{id:800}));
  await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','9');
  const result=await page.evaluate(async()=>{
    const controller=window.__threadrail.controller;
    const source=controller.searchSources.find(s=>s.role==='answer'&&s.text.includes('The telescope is beside the green compass.'));
    window.requestAnimationFrame=()=>0;
    const jumping=controller.jumpSearch({...source,restored:true,matchText:'The telescope is beside the green compass.',matchOffset:source.text.indexOf('The telescope is beside the green compass.')});
    setTimeout(()=>document.styleSheets[0].insertRule('header{position:fixed!important;top:0!important;left:0;right:0;height:120px!important;z-index:99}',document.styleSheets[0].cssRules.length),100);
    const landing=await jumping,p=document.querySelector('#occluded-proof'),rect=p.getBoundingClientRect(),header=document.querySelector('header').getBoundingClientRect();
    return {landing,top:rect.top,bottom:rect.bottom,headerBottom:header.bottom,viewportBottom:controller.adapter.viewport(controller.scroller).bottom,active:!!controller.jumpFrame};
  });
  expect(result.landing.ok,JSON.stringify(result)).toBe(true);expect(result.active).toBe(false);
  expect(result.top).toBeGreaterThanOrEqual(result.headerBottom);expect(result.bottom).toBeLessThanOrEqual(result.viewportBottom);
});
