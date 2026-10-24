import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {providerFixture} from './provider-fixtures.js';

test('All chats ranks vague queries across providers after a browser restart and repeated reopening, then restores exact input and answer passages',async()=>{
  test.setTimeout(240000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-library-smart-')),extension=resolve('dist');
  const launch=()=>chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const scenes=[
    {provider:'chatgpt',path:'/c/kitchen-smart',title:'Kitchen chapter',query:'zen was being dumb where was this',text:'Zen made a ridiculous mistake. She poured orange juice into the kettle instead of water, then tried to boil it. Everyone laughed at her foolish behavior.',expected:'orange juice into the kettle'},
    {provider:'claude',path:'/chat/winter-smart',title:'Winter chapter',query:'broken heating appliance',text:'The radiator stopped working during the cold night. Ice formed on the bedroom windows.',expected:'radiator stopped working'},
    {provider:'gemini',path:'/app/purchase-smart',title:'Shop correspondence',query:'money back after a faulty purchase',text:'I asked the shop to reimburse me because the camera arrived damaged.',expected:'camera arrived damaged',prompt:true},
    {provider:'chatgpt',path:'/c/meditation-smart',title:'Mindfulness practice',text:'Zen meditation involves focused attention and breathing. The practice can improve concentration.'},
    {provider:'claude',path:'/chat/drinks-smart',title:'Making a warm drink',text:'The copper kettle warmed the water on the kitchen stove while everyone waited for tea.'},
    {provider:'gemini',path:'/app/photo-smart',title:'Photography exhibition',text:'The camera captured the river and the hills. The gallery displayed a collection of landscape photographs.'},
  ].map(s=>({...s,url:({chatgpt:'https://chatgpt.com',claude:'https://claude.ai',gemini:'https://gemini.google.com'}[s.provider])+s.path}));
  const filler='<p>The books were arranged in rows beside the quiet reading desk. The curtains were closed.</p>';
  let context=await launch(),small=false;
  const outbound=[],proof=[];
  const route=async()=>{
    context.on('request',r=>{if(!/^(chrome-extension:|https:\/\/(chatgpt.com|claude.ai|gemini.google.com)\/)/.test(r.url()))outbound.push(r.url());});
    for(const scene of scenes){
      const messages=Array.from({length:20},(_,i)=>({prompt:`Entry ${i}. Describe the landscape.`,answer:'<p style="min-height:250px">The path climbed past trees toward a wooden bridge. Birds circled above the hills.</p>'}));
      messages[3]={prompt:scene.prompt?`<span id="remembered">${scene.text}</span>`:'Continue this chapter.',answer:scene.prompt?'<p>Let us address that issue next.</p>':filler.repeat(25)+`<p id="remembered">${scene.text}</p>`+filler.repeat(15)};
      const html=providerFixture(scene.provider,{messages}).replace(/<title>.*?<\/title>/,`<title>${scene.title}</title>`).replace('</body>',`<script>
        const parent=document.querySelector('${scene.provider==='claude'?'[data-testid="transcript-list"]':'#scroll'}'),rows=[...parent.children],factor=${scene.provider==='claude'?2:1};
        const restore=()=>parent.prepend(...rows.slice(0,17*factor));
        ${small?"rows.slice(0,17*factor).forEach(row=>row.remove());":''}
        document.querySelector('#scroll').addEventListener('scroll',()=>{if(document.querySelector('#scroll').scrollTop<=1)restore();});
      </script></body>`);
      await context.route(scene.url,r=>r.fulfill({body:html,contentType:'text/html'}));
    }
  };
  try{
    await route();
    for(const [i,scene]of scenes.entries()){
      const page=await context.newPage();await page.goto(scene.url);
      await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','20');
      await page.keyboard.press('Alt+Shift+f');const opened=context.waitForEvent('page');await page.getByRole('button',{name:'All chats',exact:false}).click();
      const library=await opened;await expect(library.locator('#coverage')).toContainText(`${i+1} chat`);await library.close();
    }
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
    await context.close();small=true;context=await launch();await route();
    for(const round of [1,2]){
      const library=await context.newPage();await library.goto(`chrome-extension://${id}/library.html`);
      await expect(library.locator('#coverage')).toContainText('6 chats · 240 messages');
      for(const scene of scenes.filter(s=>s.query)){
        await library.locator('#query').fill(scene.query);
        await expect(library.locator('#search-status')).toHaveText('',{timeout:150000});
        const first=library.locator('#best .library-result').first();
        await expect(first.locator('.library-result-title')).toHaveText(scene.title);
        await expect(first.locator('.library-excerpt')).toContainText(scene.expected);
        await expect(first.locator('.library-result-meta')).toContainText(scene.prompt?'You':'Answer');
        const excerpt=await first.locator('.library-excerpt').innerText();
        const opened=context.waitForEvent('page');await first.click();const destination=await opened;
        await expect(destination).toHaveURL(scene.url);
        await expect(destination.locator('.toast')).toContainText('matching passage',{timeout:20000});
        // The remembered message starts absent from the reopened host window.
        // Resolve the actual excerpt, rather than merely its outer message.
        const rect=await destination.locator('#remembered').evaluate((node,needle)=>{
          const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),points=[];let text='';
          for(let n=walker.nextNode();n;n=walker.nextNode())for(let i=0;i<n.data.length;i++){text+=n.data[i];points.push({node:n,offset:i});}
          const start=text.indexOf(needle);if(start<0)throw Error('Remembered clause missing');
          const range=document.createRange(),a=points[start],b=points[start+needle.length-1];range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset+1);
          const r=range.getBoundingClientRect();return {top:r.top,bottom:r.bottom};
        },scene.expected);
        expect(rect.top).toBeGreaterThanOrEqual(65);expect(rect.bottom).toBeLessThan(830);
        await expect(destination.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('');
        proof.push({round,provider:scene.provider,query:scene.query,rank:1,title:scene.title,excerpt,exactClause:rect});
        await destination.close();await library.bringToFront();
      }
      await library.close();
    }
    expect(outbound).toEqual([]);
    await writeFile('test-results/library-smart-reopen.json',JSON.stringify(proof,null,2));
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});
