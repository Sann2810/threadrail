import {expandWord} from './search-ui.js';
import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {providerFixture} from './provider-fixtures.js';

test('saved Claude passage crosses giant answers and paged gaps instead of timing out at an early window',async()=>{
  test.setTimeout(35000);
  const directory=await mkdtemp(resolve(tmpdir(),'rail-paged-'));
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',
    args:[`--disable-extensions-except=${resolve('dist')}`,`--load-extension=${resolve('dist')}`]});
  const messages=Array.from({length:64},(_,i)=>({prompt:`Discuss topic ${i+1}.`,answer:`<p style="height:14000px">A long discussion with room to scroll.</p><p ${i===37?'id="saved-compass"':''}>${i===37?'The compass was left beside the green telescope.':'The notes are on the desk.'}</p>`}));
  const html=providerFixture('claude',{messages}).replace('</body>',`<script>
    const parent=document.querySelector('[data-testid="transcript-list"]'),scroller=document.querySelector('#scroll'),rows=[...parent.children];
    rows.forEach((row,i)=>{row.id='durable-row-'+i;row.setAttribute('role','article');row.setAttribute('aria-label','Message '+(i+1)+' of 128');});
    let start=0,resetOnTop=false;window.loads=0;
    function showWindow(at){start=at;parent.replaceChildren(...rows.slice(at,at+8));
      if(at+8<124){const more=document.createElement('button');more.textContent='Load later messages';more.onclick=()=>{window.loads++;showWindow(start+8);};parent.append(more,...rows.slice(124));}
      scroller.scrollTop=Math.min(1,scroller.scrollHeight-scroller.clientHeight);
    }
    window.crop=()=>{showWindow(120);scroller.scrollTop=scroller.scrollHeight;resetOnTop=true;};
    scroller.addEventListener('scroll',()=>{if(resetOnTop&&scroller.scrollTop<2){resetOnTop=false;showWindow(0);}});
  </script></body>`);
  try{
    await context.route('https://claude.ai/**',route=>route.fulfill({body:html,contentType:'text/html'}));
    const page=await context.newPage();await page.goto('https://claude.ai/chat/paged-test');
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','64');
    await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('compass');
    await expandWord(page,'compass');
    await expect(page.locator('.search-word-group[aria-label="compass matches"] .search-result')).toHaveCount(1);
    await page.evaluate(()=>window.crop());
    await expect(page.locator('#saved-compass')).toHaveCount(0);
    await page.locator('.search-word-group[aria-label="compass matches"] .search-result').click();
    await expect(page.locator('.toast')).toContainText('Finding saved passage');
    await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeVisible();
    await expect(page.locator('#saved-compass')).toHaveCount(1,{timeout:15000});
    await expect(page.locator('.toast')).toContainText('Jumped to the matching passage',{timeout:15000});
    const box=await page.locator('#saved-compass').boundingBox();expect(box.y).toBeGreaterThanOrEqual(65);expect(box.y).toBeLessThan(240);
    expect(await page.evaluate(()=>window.loads)).toBe(9);
    await page.screenshot({path:'test-results/saved-paged-jump.png'});
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});
