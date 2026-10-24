import {expandWord} from './search-ui.js';
import {test,expect} from '@playwright/test';

async function open(page){await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);}

test('reranking has its own status and never blanks the usable preliminary results',async({page})=>{
  await page.addInitScript(()=>{
    window.rankingHeld=true;const queued=[];
    window.finishRanking=()=>{window.rankingHeld=false;queued.splice(0).forEach(run=>run());};
    window.Worker=class{
      postMessage(data){const send=()=>this.onmessage({data:{id:data.id,...(data.type==='embed'?{vectors:data.texts.map(()=>[1,0])}:{scores:data.texts.map(()=>0)})}});
        if(data.type==='rerank'&&window.rankingHeld)queued.push(send);else setTimeout(send,0);}
      terminate(){}
    };
  });
  await open(page);await page.getByRole('button',{name:'Search this thread',exact:true}).click();
  await page.locator('.search-input').fill('focus techniques');
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ranking');
  await expect(page.locator('.search-status')).toHaveText('Ranking matches…');
  await expect(page.locator('.search-best .search-result').first()).toBeVisible();
  await page.evaluate(()=>window.finishRanking());
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','ready');
  await expect(page.locator('.search-status')).toHaveText('');
  await expect(page.getByRole('textbox',{name:'Message ChatGPT'})).toHaveValue('');
});

test('short repeated picker prompts retain their text and show distinct answer context',async({page})=>{
  await open(page);
  await page.evaluate(()=>{
    window.fixture.addExchange('yes','<p>The compass points towards the northern ridge.</p>',{id:91});
    window.fixture.addExchange('yes','<p>The telescope is stored beside the green window.</p>',{id:92});
    document.querySelector('#scroller').scrollTop=10;
  });
  await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','10');
  await page.locator('.marker').last().click();
  const rows=page.locator('.item').filter({has:page.locator('.question').filter({hasText:/^yes$/})});
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('.answer-context')).toContainText('compass');
  await expect(rows.nth(1).locator('.answer-context')).toContainText('telescope');
  await expect(rows.nth(1)).toHaveAccessibleName(/Jump to: yes.*telescope/);
  await rows.nth(1).click();await expect(page.locator('.toast')).toContainText('Jumped to: yes');
});

test('every query word has its own expandable count without dropping chronological matches',async({page})=>{
  await open(page);
  await page.evaluate(()=>window.fixture.addExchange('We had no telescope.','<p>No telescope was available that evening.</p>',{id:93}));
  await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('had no telescope');
  const telescope=await expandWord(page,'telescope');
  await expect(telescope.locator('.search-count')).toHaveText('2');
  await expect(telescope.locator('.search-result').first()).toContainText('You');
  await expect(telescope.locator('.search-result').last()).toContainText('Answer');
  const no=page.locator('.search-word-group[aria-label="no matches"]');
  await expect(no).toBeHidden();
  await expandWord(page,'no');await expect(no).toBeVisible();
  await expect(no.locator('.search-count')).toHaveText('2');
  await page.locator('.search-input').fill('no');await expandWord(page,'no');await expect(no).toBeVisible();
  await expect(no.locator('.search-count')).toHaveText('2');
});

test('unavailable saved jumps restore the reading position and offer a visible retry and cancel',async({page})=>{
  await open(page);
  await page.evaluate(()=>window.fixture.addExchange('A lost object.','<p>The ancient telescope was packed away.</p>',{id:94}));
  await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('telescope');
  await expandWord(page,'telescope');
  await expect(page.locator('.search-word-group[aria-label="telescope matches"] .search-result')).toHaveCount(1);
  await page.evaluate(()=>document.querySelector('[data-message-id="assistant-94"]').remove());
  await expect(page.locator('.search-coverage')).toContainText('18 messages');
  const before=await page.locator('#scroller').evaluate(e=>e.scrollTop);
  await page.clock.install();
  await page.locator('.search-word-group[aria-label="telescope matches"] .search-result').click();
  await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeVisible();
  await page.clock.fastForward(46000);
  await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Couldn’t open this passage');
  expect(Math.abs(await page.locator('#scroller').evaluate(e=>e.scrollTop)-before)).toBeLessThan(3);
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.clock.fastForward(1000);
  await expect(page.locator('.toast')).toContainText('Search stopped');
  await expect(page.locator('threadrail-navigation')).not.toHaveAttribute('data-state','JUMPING');
});
