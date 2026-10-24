import {expandWord} from './search-ui.js';
import {test,expect} from '@playwright/test';

for(const width of [1280,390,320])test(`compact search at ${width}px keeps both modes adjacent and every result reachable`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.route('**/dist/models/**',route=>route.abort());
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.evaluate(()=>{
    for(let i=0;i<8;i++)window.fixture.addExchange(`Compass atlas input ${i}.`,`<p>Compass atlas answer ${i}.</p>`,{id:300+i});
  });
  await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('compass atlas');
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','fallback');
  const smart=page.getByRole('region',{name:'Smart matches',exact:true});
  const words=page.getByRole('region',{name:'Word matches',exact:true});
  await expect(smart.locator('.search-result')).toHaveCount(2);
  await expect(words.locator('.search-result:visible')).toHaveCount(0);
  await expandWord(page,'compass');
  await expect(words.locator('.search-result:visible')).toHaveCount(2);
  const a=await smart.boundingBox(),b=await words.boundingBox(),panel=await page.locator('.search-panel').boundingBox();
  expect(Math.abs(a.y-b.y)).toBeLessThan(2);expect(a.x+a.width).toBeLessThan(b.x);
  expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(width);
  await expect(page.locator('.preview-footer,.search-note')).toHaveCount(0);
  await smart.getByRole('button',{name:'More smart matches'}).click();
  expect(await smart.locator('.search-result').count()).toBeGreaterThan(2);
  const compass=page.getByRole('region',{name:'compass matches',exact:true});
  await compass.getByRole('button',{name:'More compass matches'}).click();
  await expect(compass.locator('.search-result')).toHaveCount(16);
  const excerpts=await compass.locator('.search-excerpt').allTextContents();
  expect(excerpts).toEqual(Array.from({length:8},(_,i)=>[`Compass atlas input ${i}.`,`Compass atlas answer ${i}.`]).flat());
  await expect(compass.getByRole('button',{name:'More compass matches'})).toHaveCount(0);
  await expandWord(page,'atlas');
  await expect(compass).toBeVisible();await expect(words.locator('.search-result:visible')).toHaveCount(18);
  await words.getByRole('button',{name:'atlas',exact:true}).click();
  await expect(words.locator('.search-result:visible')).toHaveCount(16);
  // New wording resets disclosure rather than inheriting the previous query's expansion.
  await page.locator('.search-input').fill('compass');
  await expect(words.locator('.search-result:visible')).toHaveCount(0);
  await expandWord(page,'compass');
  await expect(words.locator('.search-result:visible')).toHaveCount(2);
  await expect(smart.locator('.search-result')).toHaveCount(2);
  await page.screenshot({path:`test-results/compact-search-${width}.png`});
  // The second initial row is the answer, and must keep its exact navigation identity.
  await page.getByRole('region',{name:'compass matches',exact:true}).locator('.search-result').nth(1).click();
  await expect(page.locator('.toast')).toContainText('matching passage');
  const top=await page.locator('[data-message-id="assistant-300"]').evaluate(el=>el.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(65);expect(top).toBeLessThan(240);
});

test('blank search has no instructions and completed empty columns have explicit states',async({page})=>{
  await page.route('**/dist/models/**',route=>route.abort());
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.keyboard.press('Alt+Shift+f');
  await expect(page.locator('.search-results')).toHaveText('');
  await expect(page.locator('.search-status')).toHaveText('');
  await page.locator('.search-input').fill('unfindableword');
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','fallback');
  await expect(page.getByText('No smart matches',{exact:true})).toBeVisible();
  await expandWord(page,'unfindableword');
  await expect(page.getByText('No matches for “unfindableword”',{exact:true})).toBeVisible();
  await page.locator('.search-input').fill('the');
  await expect(page.locator('.search-word-label')).toHaveText(['the']);
  await expect(page.getByRole('button',{name:'More smart matches'})).toHaveCount(0);
});


test('changing chats resets disclosure even when the next chat has identical message text',async({page})=>{
  await page.route('**/dist/models/**',route=>route.abort());
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.evaluate(()=>{for(let i=0;i<4;i++)window.fixture.addExchange(`Compass input ${i}.`,`<p>Compass answer ${i}.</p>`,{id:500+i});});
  await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('compass');
  const smart=page.locator('.search-best');
  await expect(smart.locator('.search-result')).toHaveCount(2);
  await smart.getByRole('button',{name:'More smart matches'}).click();
  expect(await smart.locator('.search-result').count()).toBeGreaterThan(2);
  await page.evaluate(()=>history.pushState({},'', '/c/another-chat-with-identical-content'));
  await expect(page.locator('.search-panel')).toBeHidden();
  await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('compass');
  await expect(smart.locator('.search-result')).toHaveCount(2);
  await expect(page.locator('.search-words .search-result:visible')).toHaveCount(0);
  await expandWord(page,'compass');
  await expect(page.locator('.search-words .search-result:visible')).toHaveCount(2);
});

test('finishing smart ranking leaves the selected word, expanded rows and keyboard focus intact',async({page})=>{
  await page.addInitScript(()=>{
    window.rankingHeld=true;const queue=[];
    window.finishRanking=()=>{window.rankingHeld=false;queue.splice(0).forEach(send=>send());};
    window.Worker=class{
      postMessage(data){const send=()=>this.onmessage({data:{id:data.id,...(data.type==='embed'?{vectors:data.texts.map(()=>[1,0])}:{scores:data.texts.map(()=>0)})}});
        if(data.type==='rerank'&&window.rankingHeld)queue.push(send);else setTimeout(send,0);}
      terminate(){}
    };
  });
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
  await page.evaluate(()=>{for(let i=0;i<8;i++)window.fixture.addExchange(`Compass atlas input ${i}.`,`<p>Compass atlas answer ${i}.</p>`,{id:400+i});});
  await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('compass atlas');
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ranking');
  await page.locator('.search-words').getByRole('button',{name:'atlas',exact:true}).click();
  const atlas=page.getByRole('region',{name:'atlas matches',exact:true});
  await atlas.getByRole('button',{name:'More atlas matches'}).click();
  await expect(atlas.locator('.search-result')).toHaveCount(16);
  await atlas.locator('.search-result').nth(10).focus();
  await atlas.locator('.search-result').nth(10).evaluate(el=>window.browsedResult=el);
  await page.evaluate(()=>window.finishRanking());
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready');
  await expect(page.locator('.search-words').getByRole('button',{name:'atlas',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(atlas.locator('.search-result')).toHaveCount(16);
  expect(await page.evaluate(()=>window.browsedResult.isConnected&&window.browsedResult.getRootNode().activeElement===window.browsedResult)).toBe(true);
});
