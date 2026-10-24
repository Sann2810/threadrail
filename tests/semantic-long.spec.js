import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {providerFixture} from './provider-fixtures.js';
import {terms} from '../src/search-index.js';

const topics=[
 ['Describe the garden.','The roses opened beside the wooden fence. Bees moved among the flowers.'],
 ['Explain a library habit.','Return borrowed books to the desk and keep the shelves tidy.'],
 ['Discuss a coastal walk.','Waves rolled onto the shore while seabirds circled overhead.'],
 ['Describe the painting.','The canvas used broad strokes of blue and green beside a red square.'],
 ['Plan a music practice.','The pianist repeated scales slowly before rehearsing the new melody.'],
 ['Describe the evening sky.','Clouds drifted across the moon and the stars appeared above the hills.'],
 ['Explain a pottery technique.','Shape the clay on a rotating wheel and leave the bowl to dry.'],
 ['Describe a hiking route.','The path crossed a wooden bridge and climbed between tall pine trees.'],
 ['Discuss a chess puzzle.','The knight guarded the central squares while the bishop watched the diagonal.'],
 ['Describe a market stall.','Apples and pears were arranged in baskets beside bunches of fresh herbs.'],
];
const messages=Array.from({length:200},(_,i)=>({prompt:`Entry ${i+1}. ${topics[i%topics.length][0]}`,answer:`<p>Entry ${i+1}. ${topics[i%topics.length][1]}</p>`}));
const filler='<p>A quiet evening in the library. The books were arranged in rows and the curtains were closed.</p>';
messages[29]={prompt:'Continue the kitchen chapter.',answer:filler.repeat(35)+'<p id="semantic-zen">Zen made a ridiculous mistake. She poured orange juice into the kettle instead of water, then tried to boil it. Everyone laughed at her foolish behavior.</p>'+filler.repeat(20)};
messages[100]={prompt:'Tell me about mindfulness.',answer:'<p>Zen meditation involves focused attention and breathing. The practice can improve concentration.</p>'};
messages[169]={prompt:'Continue with another character.',answer:'<p>Leila made a silly mistake and put salt in her coffee. She behaved foolishly.</p>'};
const radiator='The radiator stopped working during the cold night. Ice formed on the bedroom windows.';
messages[97]={prompt:'Continue the winter chapter.',answer:filler.repeat(35)+`<p id="semantic-radiator">${radiator}</p>`+filler.repeat(20)};
const refund='I asked the shop to reimburse me because the camera arrived damaged.';
messages[154]={prompt:`<span id="semantic-refund">${refund}</span>`,answer:'<p>Let us address that issue next.</p>'};
const cases=[
 {query:'zen was being dumb where was this',expected:'orange juice into the kettle',target:'#semantic-zen',role:'Answer'},
 {query:'broken heating appliance',expected:'radiator stopped working',target:'#semantic-radiator',role:'Answer',source:radiator},
 {query:'money back after a faulty purchase',expected:'camera arrived damaged',target:'#semantic-refund',role:'You',source:refund},
];
for(const item of cases.filter(c=>c.source))expect(terms(item.query).filter(t=>terms(item.source).includes(t))).toEqual([]);

for(const provider of ['chatgpt','claude','gemini'])test(`${provider}: real smart search retrieves paraphrased inputs and long outputs among 200 exchanges`,async()=>{
  test.setTimeout(180000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-semantic-long-'));
  const extension=resolve('dist');
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const origin={chatgpt:'https://chatgpt.com',claude:'https://claude.ai',gemini:'https://gemini.google.com'}[provider];
  const path={chatgpt:'/c/semantic-long',claude:'/chat/semantic-long',gemini:'/app/semantic-long'}[provider];
  const proof={provider,exchanges:200,realBundledModel:true,cases:[]};
  try{
    await context.route(`${origin}/**`,route=>route.fulfill({body:providerFixture(provider,{messages}),contentType:'text/html'}));
    const outbound=[];context.on('request',r=>{if(!r.url().startsWith(origin+'/')&&!r.url().startsWith('chrome-extension://'))outbound.push(r.url());});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+path);await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','200');
    for(const item of cases){
      await page.keyboard.press('Alt+Shift+F');await page.locator('.search-input').fill(item.query);
      await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready',{timeout:150000});
      const best=page.getByRole('region',{name:'Smart matches',exact:true}).locator('.search-result').first();
      await expect(best).toContainText(item.expected);
      await expect(best.locator('.search-result-label')).toContainText(item.role);
      await best.click();
      await expect(page.locator('threadrail-navigation')).not.toHaveAttribute('data-state','JUMPING');
      await expect(page.locator('.toast')).toContainText('matching passage');
      const rect=await page.locator(item.target).boundingBox();
      expect(rect.y).toBeGreaterThanOrEqual(65);expect(rect.y).toBeLessThan(210);
      proof.cases.push({query:item.query,rank:1,role:item.role,exactPassageTop:Math.round(rect.y),noSharedContentWords:!!item.source});
    }
    expect(errors).toEqual([]);expect(outbound).toEqual([]);proof.externalRequests=outbound.length;
    await writeFile(`test-results/semantic-long-${provider}.json`,JSON.stringify(proof,null,2));
    await page.keyboard.press('Alt+Shift+F');await page.locator('.search-input').fill(cases[0].query);
    await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready');
    await page.screenshot({path:`test-results/semantic-long-${provider}.png`});
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});
