import {test,expect} from '@playwright/test';

async function open(page){
  await page.route('**/dist/models/**',route=>route.abort());
  await page.goto('/');await expect(page.locator('threadrail-navigation')).toHaveCount(1);
}

test('completed search has no history action when the captured conversation starts at the beginning',async({page})=>{
  await open(page);await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('focus');
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','fallback');
  await expect(page.getByRole('button',{name:'Load earlier'})).toBeHidden();
  // Loading older messages is separate from result pagination.
  await expect(page.getByRole('button',{name:'More smart matches'})).toHaveCount(0);
});

test('an initially cropped numbered history offers earlier loading but retained searchable history does not',async({page})=>{
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('#conversation>article').forEach((row,i)=>{row.removeAttribute('data-testid');row.setAttribute('role','article');row.setAttribute('aria-label',`Message ${i+11} of 26`);});
  }));
  await open(page);await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('focus');
  await expect(page.getByRole('button',{name:'Load earlier'})).toBeVisible();
  await page.evaluate(()=>{
    const {user,assistant}=window.fixture.addExchange('The first message.','<p>The beginning.</p>',{id:90});
    user.removeAttribute('data-testid');assistant.removeAttribute('data-testid');
    user.setAttribute('role','article');user.setAttribute('aria-label','Message 1 of 26');
    assistant.setAttribute('role','article');assistant.setAttribute('aria-label','Message 2 of 26');
    document.querySelector('#conversation').prepend(user,assistant);
  });
  await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','9');
  await expect(page.getByRole('button',{name:'Load earlier'})).toBeHidden();
  await page.evaluate(()=>document.querySelectorAll('[aria-label="Message 1 of 26"],[aria-label="Message 2 of 26"]').forEach(el=>el.remove()));
  await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','8');
  await expect(page.getByRole('button',{name:'Load earlier'})).toBeHidden();
});

test('unknown history and quoted loading buttons do not invent an earlier-history action',async({page})=>{
  await open(page);
  await page.evaluate(()=>{
    document.querySelectorAll('#conversation>article').forEach(el=>el.removeAttribute('data-testid'));
    document.querySelector('[data-message-id="assistant-1"]').insertAdjacentHTML('beforeend','<button>Load older messages</button>');
  });
  await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('focus');
  await expect(page.getByRole('button',{name:'Load earlier'})).toBeHidden();
});


test('history actions follow the native control availability instead of query completion',async({page})=>{
  await open(page);
  await page.evaluate(()=>{
    document.querySelectorAll('#conversation>article').forEach(el=>el.removeAttribute('data-testid'));
    const control=document.createElement('button');control.id='host-older';control.textContent='Load older messages';control.disabled=true;
    document.querySelector('#conversation').prepend(control);
  });
  await page.keyboard.press('Alt+Shift+f');await page.locator('.search-input').fill('focus');
  await expect(page.locator('.search-panel')).toHaveAttribute('data-phase','fallback');
  await expect(page.getByRole('button',{name:'Load earlier'})).toBeHidden();
  await page.locator('#host-older').evaluate(el=>{el.disabled=false;});
  await expect(page.getByRole('button',{name:'Load earlier'})).toBeVisible();
  await page.locator('#host-older').evaluate(el=>{el.setAttribute('aria-disabled','true');});
  await expect(page.getByRole('button',{name:'Load earlier'})).toBeHidden();
});
