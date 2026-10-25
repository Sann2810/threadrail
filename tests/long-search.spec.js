import {expandWord} from './search-ui.js';
import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {providerFixture} from './provider-fixtures.js';

const words=['Zen','San','Rey','trip'];
const messages=Array.from({length:200},(_,i)=>{
  const special=[0,97,199].includes(i);
  const promptWords=words.filter((_,n)=>special||i%[11,9,13,17][n]===0);
  const answerWords=words.filter((_,n)=>special||i%[7,13,5,19][n]===0);
  const filler='<p>The library shelves held books and maps. A quiet afternoon passed beside the window.</p>';
  const prompt=`<span id="proof-${i}-prompt">Input proof-${i}-prompt. ${promptWords.join(' ')}.</span>`;
  const answer=(special?filler.repeat(35):'')+`<p id="proof-${i}-answer">Output proof-${i}-answer. <strong>${answerWords.join(' ')}</strong>. A second mention: ${answerWords.join(' ')}.</p>`+(special?filler.repeat(20):'<p>Closing notes.</p>');
  return {prompt,answer,promptWords,answerWords};
});
const expected=Object.fromEntries(words.map(word=>[word,messages.flatMap((m,i)=>['prompt','answer'].filter(role=>m[`${role}Words`].includes(word)).map(role=>`${i}-${role}`))]));

for(const provider of ['chatgpt','claude','gemini']) test(`${provider}: 200 exchanges preserve every exact input/output match and precise long-answer jumps`,async()=>{
  test.setTimeout(240000);
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-long-'));
  const extension=resolve('dist');
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const origin={chatgpt:'https://chatgpt.com',claude:'https://claude.ai',gemini:'https://gemini.google.com'}[provider];
  const path={chatgpt:'/c/long-proof',claude:'/chat/long-proof',gemini:'/app/long-proof'}[provider];
  const proof={provider,exchanges:200,groups:{},jumps:[]};
  try{
    await context.route(`${origin}/**`,route=>route.fulfill({body:providerFixture(provider,{messages}),contentType:'text/html'}));
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+path);
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','200');
    const open=async()=>{await page.keyboard.press('Alt+Shift+F');await page.locator('.search-input').fill('Zen San Rey were off to a trip');};
    const expand=async(word)=>{
      await expandWord(page,word);
      const group=page.getByRole('region',{name:`${word} matches`,exact:true});
      while(await group.getByRole('button',{name:`More ${word} matches`,exact:true}).count()) await group.getByRole('button',{name:`More ${word} matches`,exact:true}).click();
      return group;
    };
    await open();await expect(page.locator('.search-word-label')).toHaveText(['Zen','San','Rey','trip']);
    for(const word of words){
      const group=await expand(word);
      await expect(group.locator('.search-count')).toHaveText(String(expected[word].length));
      const actual=await group.locator('.search-excerpt').allTextContents();
      const ids=actual.map(text=>text.match(/proof-(\d+)-(prompt|answer)/)?.slice(1).join('-'));
      expect(ids).toEqual(expected[word]);
      expect(new Set(ids).size).toBe(ids.length);
      proof.groups[word]={count:ids.length,ordered:true,unique:true,inputs:ids.filter(id=>id.endsWith('prompt')).length,outputs:ids.filter(id=>id.endsWith('answer')).length};
    }
    await mkdir('test-results',{recursive:true});
    // Click every row in every word group, including both roles, all pages,
    // and matches deep inside long answers at the beginning, middle, and end.
    for(const word of words) for(const id of expected[word]){
      const [ordinal,role]=id.split('-');const i=Number(ordinal);
      const group=await expand(word);
      const targetIndex=expected[word].indexOf(`${i}-${role}`);
      const button=group.locator('.search-result').nth(targetIndex);
      await expect(button.locator('mark')).toHaveText(word);
      await button.click();
      await expect(page.locator('.search-panel')).toBeHidden();
      await expect(page.locator('threadrail-navigation')).not.toHaveAttribute('data-state','JUMPING');
      await expect(page.locator('.toast')).toContainText('matching passage');
      const rect=await page.locator(`#proof-${i}-${role}`).boundingBox();
      expect(rect.y,`${word} ${i}-${role}`).toBeGreaterThanOrEqual(65);
      expect(rect.y,`${word} ${i}-${role}`).toBeLessThan(210);
      proof.jumps.push({word,message:`${i}-${role}`,top:Math.round(rect.y),exact:true});
      await open();
    }
    expect(errors).toEqual([]);
    // Virtualization can leave loaded answers without any of their prompts.
    // They must still be searchable and navigable, with no invented rail rows.
    await page.evaluate(()=>document.querySelectorAll('.user').forEach(element=>element.remove()));
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','0');
    const orphanGroup=await expand('Zen');
    const orphanExpected=expected.Zen;
    await expect(orphanGroup.locator('.search-count')).toHaveText(String(orphanExpected.length));
    const orphanIds=(await orphanGroup.locator('.search-excerpt').allTextContents()).map(text=>text.match(/proof-(\d+)-(prompt|answer)/)?.slice(1).join('-'));
    expect(orphanIds).toEqual(orphanExpected);
    await orphanGroup.locator('.search-result').nth(orphanExpected.indexOf('0-answer')).click();
    await expect(page.locator('threadrail-navigation')).not.toHaveAttribute('data-state','JUMPING');
    await expect(page.locator('.toast')).toContainText('matching passage');
    const orphanRect=await page.locator('#proof-0-answer').boundingBox();
    expect(orphanRect.y).toBeGreaterThanOrEqual(65);expect(orphanRect.y).toBeLessThan(210);
    proof.unpairedAnswers={count:orphanIds.length,ordered:true,jumpTop:Math.round(orphanRect.y)};
    await open();
    const group=await expand('trip');await group.locator('.search-result').first().focus();
    await page.screenshot({path:`test-results/long-${provider}.png`});
    await writeFile(`test-results/long-${provider}.json`,JSON.stringify(proof,null,2));
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});

for(const provider of ['chatgpt','claude','gemini']) test(`${provider}: unpaired answer-only window uses its nested scroller and exact passage`,async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-unpaired-'));
  const extension=resolve('dist');
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,reducedMotion:'reduce',viewport:{width:1280,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const origin={chatgpt:'https://chatgpt.com',claude:'https://claude.ai',gemini:'https://gemini.google.com'}[provider];
  try{
    await context.route(`${origin}/**`,route=>route.fulfill({body:providerFixture(provider,{messages:messages.slice(0,3)}),contentType:'text/html'}));
    const page=await context.newPage();await page.goto(origin+'/chat/unpaired-test');
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','3');
    await page.evaluate(()=>document.querySelectorAll('.user').forEach(element=>element.remove()));
    await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','0');
    await page.keyboard.press('Alt+Shift+F');await page.locator('.search-input').fill('Zen');
    const group=await expandWord(page,'Zen');
    await expect(group.locator('.search-count')).toHaveText('2');
    await expect(page.locator('.search-coverage')).toContainText('6 messages');
    await group.locator('.search-result').nth(1).click();
    await expect(page.locator('threadrail-navigation')).not.toHaveAttribute('data-state','JUMPING');
    await expect(page.locator('.toast')).toContainText('matching passage');
    const rect=await page.locator('#proof-0-answer').boundingBox();
    expect(rect.y).toBeGreaterThanOrEqual(65);expect(rect.y).toBeLessThan(210);
  }finally{await context.close();await rm(directory,{recursive:true,force:true});}
});
