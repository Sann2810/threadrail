import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {providerFixture} from './provider-fixtures.js';
import {expandWord} from './search-ui.js';

for(const provider of ['chatgpt','claude','gemini'])test(`${provider}: every query word has a vertical count and expands into word-form matches at the exact passage`,async()=>{
  test.setTimeout(60000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-word-list-')),extension=resolve('dist');
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const origin={chatgpt:'https://chatgpt.com',claude:'https://claude.ai',gemini:'https://gemini.google.com'}[provider];
  const filler='<p>The room had a wooden table beside a blue window.</p>'.repeat(30);
  const messages=[{prompt:'How to start?',answer:filler+'<p id="singing-target">Singing is an exercise. Keep singing.</p>'+filler},{prompt:'My next lesson.',answer:'<p>She sings each morning.</p>'},{prompt:'A place name.',answer:'<p>A single string in Singapore was used. Nothing else.</p>'}];
  try{
    await context.route(`${origin}/**`,route=>route.fulfill({body:providerFixture(provider,{messages}),contentType:'text/html'}));
    const page=await context.newPage();await page.goto(origin+{chatgpt:'/c/singing',claude:'/chat/singing',gemini:'/app/singing'}[provider]);
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','3');
    await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('how to start next sing');
    await expect(page.locator('.search-word-label')).toHaveText(['start','next','sing']);
    await expect(page.locator('.word-toggle .word-tag-count')).toHaveText(['1','1','2']);
    await expect(page.locator('.search-words .search-result')).toHaveCount(0);
    const buttons=page.locator('.word-toggle'),rects=await buttons.evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,bottom:r.bottom};}));
    expect(rects[0].x).toBe(rects[1].x);expect(rects[1].x).toBe(rects[2].x);
    expect(rects[1].y).toBeGreaterThan(rects[0].bottom);expect(rects[2].y).toBeGreaterThan(rects[1].bottom);
    const how=await expandWord(page,'start');await expect(how.locator('.search-result')).toHaveCount(1);
    const howBottom=(await how.boundingBox()).y+(await how.boundingBox()).height;
    expect((await buttons.nth(1).boundingBox()).y).toBeGreaterThan(howBottom);
    // Keyboard can collapse the word row, and another row expands independently.
    await buttons.nth(0).focus();await page.keyboard.press('Enter');await expect(how).toBeHidden();
    const sing=await expandWord(page,'sing');await expect(sing.locator('.search-result')).toHaveCount(2);
    await expect(sing.locator('mark')).toHaveText(['Singing','sings']);
    await page.locator('.search-panel').screenshot({path:`test-results/word-list-${provider}.png`});
    await sing.locator('.search-result').first().click();
    await expect(page.locator('.toast')).toContainText('matching passage');
    const top=await page.locator('#singing-target').evaluate(el=>el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(65);expect(top).toBeLessThan(240);
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});
