import {expandWord} from './search-ui.js';
import { test, expect, chromium } from '@playwright/test';
import { mkdtemp,rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { providerFixture } from './provider-fixtures.js';

test('local meaning search retrieves paraphrased answer text and jumps to its passage', async ({page}) => {
  test.setTimeout(90000);
  const outbound=[];
  page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:4173'))outbound.push(request.url());});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.evaluate(()=>{
    window.fixture.addExchange('Continue the story in the kitchen.', '<p>Zen made a ridiculous mistake. She poured orange juice into the kettle instead of water, then tried to boil it. Everyone laughed at her foolish behavior.</p>',{id:21});
    window.fixture.addExchange('Tell me about mindfulness.', '<p>Zen meditation involves focused attention and breathing. The practice can improve concentration.</p>',{id:22});
    window.fixture.addExchange('Continue with another character.', '<p>Leila made a silly mistake and put salt in her coffee. She behaved foolishly.</p>',{id:23});
  });
  await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','11');
  await page.keyboard.press('Alt+Shift+F');
  await expect(page.locator('.search-panel')).toBeVisible();
  await page.getByRole('searchbox',{name:'Describe what you remember'}).fill('zen was being dumb where was this');
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready',{timeout:75000});
  await expect(page.locator('.search-result').first()).toContainText('orange juice');
  await page.screenshot({path:'test-results/threadrail-semantic-search.png'});
  await page.locator('.search-panel').screenshot({path:'test-results/threadrail-search-panel.png'});
  await page.locator('.search-result').first().click();
  await expect(page.locator('.search-panel')).toBeHidden();
  await expect(page.locator('.toast')).toContainText('matching passage');
  const rect=await page.locator('[data-message-id="assistant-21"]').evaluate(e=>e.getBoundingClientRect().top);
  expect(rect).toBeGreaterThan(50);expect(rect).toBeLessThan(180);
  expect(outbound).toEqual([]);expect(errors).toEqual([]);
});

for (const [provider, url] of [['chatgpt','https://chatgpt.com/c/search-test'],['claude','https://claude.ai/chat/search-test'],['gemini','https://gemini.google.com/app/search-test']]) test(`${provider}: installed MV3 service worker runs bundled embeddings with no remote model requests`, async () => {
  test.setTimeout(90000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-search-'));
  const extension=resolve('dist');
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try {
    await context.route(`${new URL(url).origin}/**`,route=>route.fulfill({body:providerFixture(provider),contentType:'text/html'}));
    const unexpected=[];
    context.on('request',request=>{if(!request.url().startsWith(new URL(url).origin+'/')&&!request.url().startsWith('chrome-extension://'))unexpected.push(request.url());});
    const page=await context.newPage();await page.goto(url);
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','8');
    await page.keyboard.press('Alt+Shift+F');
    await page.getByRole('searchbox',{name:'Describe what you remember'}).fill('Explain idea 3 in plain language');
    await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready',{timeout:75000});
    await expect(page.locator('.search-result').first()).toContainText('Question 3:');
    expect(unexpected).toEqual([]);
    await page.keyboard.press('Escape');await expect(page.locator('.search-panel')).toBeHidden();
  } finally {await context.close();await rm(directory,{recursive:true,force:true});}
});

test('search jumps inside a long answer and retrieves a paraphrase with no shared content words', async ({page}) => {
  test.setTimeout(90000);
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.evaluate(()=>{
    const filler='<p>A quiet evening in the library. The books were arranged in rows and the curtains were closed.</p>';
    window.fixture.addExchange('Continue the chapter.',filler.repeat(30)+'<p id="heating-scene">The radiator stopped working during the cold night. Ice formed on the bedroom windows.</p>'+filler.repeat(20),{id:30});
    window.fixture.addExchange('A different place.','<p>The beach was warm and sunny.</p>',{id:31});
  });
  await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','10');
  await page.keyboard.press('Alt+Shift+F');await page.locator('.search-input').fill('broken heating appliance');
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready',{timeout:75000});
  await expect(page.locator('.search-result').first()).toContainText('radiator stopped working');
  await page.locator('.search-result').first().click();
  await expect(page.locator('.toast')).toContainText('matching passage');
  const top=await page.locator('#heating-scene').evaluate(e=>e.getBoundingClientRect().top);
  expect(top).toBeGreaterThan(50);expect(top).toBeLessThan(180);
});

test('search icon, keyboard dismissal, edits and chat route changes stay scoped', async ({page}) => {
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.locator('#scroller').evaluate(e=>e.scrollTop=10);
  await page.getByRole('button',{name:'Search this thread',exact:true}).click();
  await page.locator('.search-input').fill('focus techniques');
  await expect(page.locator('.search-result').first()).toContainText('focus');
  await page.evaluate(()=>document.querySelector('[data-message-id="user-1"]').textContent='A replacement prompt about mountains');
  await page.locator('.search-input').fill('replacement mountains');
  await expect(page.locator('.search-result').first()).toContainText('replacement prompt');
  await page.keyboard.press('Escape');await expect(page.locator('.search-panel')).toBeHidden();
  await expect(page.getByRole('button',{name:'Search this thread',exact:true})).toBeFocused();
  await page.keyboard.press('Alt+Shift+F');
  await page.evaluate(()=>{history.pushState({},'','/c/different');window.fixture.load('single');});
  await expect(page.locator('.search-panel')).toBeHidden();
  await page.keyboard.press('Alt+Shift+F');await page.locator('.search-input').fill('replacement mountains');
  await expect(page.locator('.search-result')).toHaveCount(0);
  await expect(page.locator('.search-coverage')).toContainText('2 messages');
});

test('missing local model produces an honest word-search fallback', async ({page}) => {
  await page.route('**/dist/models/**',route=>route.abort());
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.keyboard.press('Alt+Shift+F');await page.locator('.search-input').fill('focus');
  await expect(page.locator('.search-status')).toContainText('Smart search unavailable');
  await expect(page.locator('.search-result').first()).toContainText('focus');
});

test('Load earlier indexes host-prepended history, restores position, and reruns the query', async ({page}) => {
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.evaluate(()=>{
    const scroller=document.querySelector('#scroller');let loaded=false;
    document.querySelectorAll('#conversation>article').forEach(row=>row.removeAttribute('data-testid'));
    const older=document.createElement('button');older.textContent='Load older messages';document.querySelector('#conversation').prepend(older);
    older.addEventListener('click',()=>{
      if(loaded)return;loaded=true;older.disabled=true;
      setTimeout(()=>{
        const {user,assistant}=window.fixture.addExchange('An earlier purchase.','<p>The ancient telescope receipt was inside the violet envelope.</p>',{id:-1});
        user.removeAttribute('data-testid');assistant.removeAttribute('data-testid');
        document.querySelector('#conversation').prepend(user,assistant);older.remove();
      },400);
    });
  });
  const before=await page.locator('[data-message-id="user-7"]').evaluate(e=>e.getBoundingClientRect().top);
  await page.keyboard.press('Alt+Shift+F');await page.locator('.search-input').fill('ancient telescope receipt');
  await expect(page.locator('.search-result')).toHaveCount(0);
  await page.getByRole('button',{name:'Load earlier'}).click();
  await expect(page.locator('.search-panel')).toBeHidden();
  await expect(page.locator('.search-panel')).toBeVisible({timeout:8000});
  await expect(page.locator('.search-result').first()).toContainText('violet envelope');
  await expect(page.getByRole('button',{name:'Load earlier'})).toBeHidden();
  const after=await page.locator('[data-message-id="user-7"]').evaluate(e=>e.getBoundingClientRect().top);
  expect(Math.abs(after-before)).toBeLessThan(3);
});

test('search stays within a narrow viewport and its icon has a visible, separate hit area', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.locator('#scroller').evaluate(e=>e.scrollTop=10);
  await expect(page.locator('.search-trigger')).toBeVisible();
  const icon=await page.locator('.search-trigger').boundingBox();const top=await page.locator('.top').boundingBox();
  expect(icon.x+icon.width).toBeLessThan(top.x);
  await page.locator('.search-trigger').click();
  const panel=await page.locator('.search-panel').boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(390);
  expect(panel.y).toBeGreaterThanOrEqual(0);expect(panel.y+panel.height).toBeLessThanOrEqual(844);
  await page.keyboard.press('Escape');
  await page.getByRole('textbox',{name:'Message ChatGPT'}).fill('Composer still works');
  await expect(page.getByRole('textbox',{name:'Message ChatGPT'})).toHaveValue('Composer still works');
});

test('word tags expose every matching message chronologically and jump to a late exact occurrence', async ({page}) => {
  await page.route('**/dist/models/**',route=>route.abort());
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.evaluate(()=>{
    for(let i=0;i<23;i++) window.fixture.addExchange(`Scene ${i}.`, `<p>Chapter ${i}. Zen met San and Rey before the trip.</p>`,{id:100+i});
    window.fixture.addExchange('Zenith and Sandy.', '<p>A tripwire caught the light.</p>',{id:123});
    const filler='<p>The books were arranged in rows and the curtains were closed.</p>';
    window.fixture.addExchange('San arrives.',filler.repeat(30)+'<p id="keyword-target">Rey found the missing map.</p>'+filler.repeat(20),{id:124});
  });
  await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','33');
  await page.keyboard.press('Alt+Shift+F');await page.locator('.search-input').fill('Zen San Rey were off to a trip');
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','fallback');
  await expect(page.locator('.search-word-label')).toHaveText(['Zen','San','Rey','were','off','to','a','trip']);
  const zen=await expandWord(page,'Zen');
  await expect(zen.locator('.search-count')).toHaveText('23');
  await expect(zen.locator('.search-result')).toHaveCount(2);
  await zen.getByRole('button',{name:'More Zen matches'}).click();
  await zen.getByRole('button',{name:'More Zen matches'}).click();
  await expect(zen.locator('.search-result')).toHaveCount(23);
  const chapters=await zen.locator('.search-excerpt').allTextContents();
  chapters.forEach((text,i)=>expect(text).toContain(`Chapter ${i}.`));
  await expandWord(page,'San');
  await expect(page.getByRole('region',{name:'San matches',exact:true}).locator('.search-count')).toHaveText('24');
  await expandWord(page,'Rey');
  const rey=page.getByRole('region',{name:'Rey matches',exact:true});
  await expect(rey.locator('.search-count')).toHaveText('24');
  while(await rey.getByRole('button',{name:'More Rey matches'}).count()) await rey.getByRole('button',{name:'More Rey matches'}).click();
  await expect(rey.locator('.search-result').last()).toContainText('missing map');
  await expect(rey.locator('.search-result').last().locator('mark')).toHaveText('Rey');
  await rey.locator('.search-result').last().click();
  await expect(page.locator('.search-panel')).toBeHidden();
  await expect(page.locator('.toast')).toContainText('matching passage');
  const top=await page.locator('#keyword-target').evaluate(e=>e.getBoundingClientRect().top);
  expect(top).toBeGreaterThan(50);expect(top).toBeLessThan(220);
});

test('search remains interactive through empty hydration and histories with no completed answers', async ({page}) => {
  await page.route('**/dist/models/**',route=>route.abort());
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.evaluate(()=>document.querySelector('#conversation').replaceChildren());
  await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','0');
  await page.keyboard.press('Alt+Shift+F');
  await page.locator('.search-input').fill('Zen San');
  await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-state','SEARCH');
  await page.evaluate(()=>{
    for(let i=0;i<3;i++) {
      const {assistant}=window.fixture.addExchange(`Zen and San in scene ${i}.`,'<p>This response could not load.</p>',{id:200+i});
      assistant.remove();
    }
  });
  await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','3');
  await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-completed-count','0');
  await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-state','SEARCH');
  await expect(page.locator('.search-word-label')).toHaveText(['Zen','San']);
  await expandWord(page,'Zen');
  await expect(page.getByRole('region',{name:'Zen matches',exact:true}).locator('.search-result')).toHaveCount(2);
  await page.getByRole('button',{name:'More Zen matches'}).click();
  await expect(page.getByRole('region',{name:'Zen matches',exact:true}).locator('.search-result')).toHaveCount(3);
  await page.locator('.search-input').fill('San');
  await expect(page.locator('.search-word-label')).toHaveText(['San']);
  await page.getByRole('button',{name:'Close search',exact:true}).click();
  await expect(page.locator('.search-panel')).toBeHidden();
});

test('search shortcut survives editors that swallow key events without changing the draft', async ({page}) => {
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  const composer=page.getByRole('textbox',{name:'Message ChatGPT'});
  await composer.fill('Keep this draft.');
  await composer.evaluate(element=>element.addEventListener('keydown',event=>event.stopPropagation()));
  await composer.press('Alt+Shift+F');
  await expect(page.locator('.search-panel')).toBeVisible();
  await expect(page.locator('.search-input')).toBeFocused();
  await expect(composer).toHaveValue('Keep this draft.');
});

test('host type-anywhere handlers cannot redirect shadow search typing into the composer', async ({page}) => {
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  const composer=page.getByRole('textbox',{name:'Message ChatGPT'});
  await composer.fill('Keep this draft.');
  await page.evaluate(()=>{
    document.addEventListener('keydown',event=>{
      if(!event.target.matches('input,textarea,[contenteditable="true"]'))document.querySelector('textarea').focus();
    },{capture:true});
  });
  await composer.press('Alt+Shift+F');
  await page.locator('.search-input').pressSequentially('Zen San');
  await expect(page.locator('.search-input')).toHaveValue('Zen San');
  await expect(page.locator('.search-input')).toBeFocused();
  await expect(page.locator('.search-word-label')).toHaveText(['Zen','San']);
  await expect(composer).toHaveValue('Keep this draft.');
});

test('search paste keeps its native default without reaching the host composer paste handler', async ({page}) => {
  await page.addInitScript(()=>{
    document.addEventListener('paste',event=>{
      const composer=document.querySelector('textarea');
      if(composer){event.preventDefault();composer.value+=event.clipboardData.getData('text/plain');composer.focus();}
    },{capture:true});
  });
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  const composer=page.getByRole('textbox',{name:'Message ChatGPT'});
  await composer.fill('Keep this draft.');await composer.press('Alt+Shift+F');
  const nativeDefaultPreserved=await page.locator('.search-input').evaluate(input=>{
    const data=new DataTransfer();data.setData('text/plain','Zen San');
    const paste=new ClipboardEvent('paste',{bubbles:true,composed:true,cancelable:true,clipboardData:data});
    return input.dispatchEvent(paste)&&!paste.defaultPrevented;
  });
  expect(nativeDefaultPreserved).toBe(true);
  await expect(composer).toHaveValue('Keep this draft.');
  await expect(page.locator('.search-input')).toBeFocused();
});

test('host render-failure UI is excluded while its original prompt remains searchable',async({page})=>{
  test.setTimeout(90000);
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.evaluate(()=>window.fixture.addExchange('Which cricket bats use willow rather than other timber?','<div data-dil-render-failed role="status">Response temporarily unavailable</div>',{id:81}));
  await page.keyboard.press('Alt+Shift+F');await page.locator('.search-input').fill('unavailable');
  const group=await expandWord(page,'unavailable');
  await expect(group.locator('.search-count')).toHaveText('0');
  await page.locator('.search-input').fill('cricket equipment for telling different woods apart');
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready',{timeout:75000});
  await expect(page.locator('.search-best .search-result').first()).toContainText('Which cricket bats');
  await expect(page.locator('.search-best')).not.toContainText('temporarily unavailable');
});

test('a vague British-spelled description retrieves character continuity rather than formats or layout',async({page})=>{
  test.setTimeout(90000);
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.evaluate(()=>{
    const filler='<p>The shelves were full of books and the curtains were closed for the evening.</p>'.repeat(25);
    window.fixture.addExchange('Production planning notes.', '<p>While the studio can publish both long and short videos, each channel has a separate identity.</p>'+filler+'<p id="continuity-target">Keep the same protagonist recognizable across changing locations. Reuse a character reference to preserve facial features, clothing, and appearance between scenes.</p>'+filler,{id:82});
    window.fixture.addExchange('Team coordination notes.','<p>All workers must share the exact same creative vision. Layout, sound, and transitions should feel coherent and connected.</p>',{id:83});
  });
  await page.keyboard.press('Alt+Shift+F');await page.locator('.search-input').fill('keeping the same person recognisable while the locations keep changing');
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready',{timeout:75000});
  await expect(page.locator('.search-best .search-result').first()).toContainText('character reference');
  await page.locator('.search-best .search-result').first().click();
  await expect(page.locator('.toast')).toContainText('matching passage');
  const target=await page.locator('#continuity-target').evaluate(el=>el.getBoundingClientRect().top);expect(target).toBeGreaterThan(50);expect(target).toBeLessThan(220);
});

test('remembering a confused input reaches that input instead of a generic answer transition',async({page})=>{
  test.setTimeout(90000);
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.evaluate(()=>{
    const filler='<p>A quantum computer works with amplitudes and probabilities. Its calculations can combine possible outcomes through interference.</p>';
    window.fixture.addExchange('Come again I got nothing from this', '<p>Okay, I made that unnecessarily complicated.</p>'+filler.repeat(15)+"<p>But here's what I really want you to understand.</p>"+filler.repeat(15),{id:84});
  });
  await page.keyboard.press('Alt+Shift+F');await page.locator('.search-input').fill('I was completely lost and needed that explained again');
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready',{timeout:75000});
  const result=page.locator('.search-best .search-result').first();
  await expect(result.locator('.search-result-label')).toContainText('You');
  await expect(result.locator('.search-excerpt')).toHaveText('Come again I got nothing from this');
  await result.click();await expect(page.locator('.toast')).toContainText('matching passage');
  const top=await page.locator('[data-message-id="user-84"]').evaluate(el=>el.getBoundingClientRect().top);
  expect(top).toBeGreaterThan(50);expect(top).toBeLessThan(220);
});
