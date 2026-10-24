import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {startCompanion} from '../native/server.mjs';
const filler='The room was quiet and the books were arranged neatly on the shelves.';
const messages=(count,label)=>Array.from({length:count},(_,i)=>[{id:`${label}-u${i}`,role:'prompt',text:`Orchid question ${i}. Explain this example.`,complete:false},{id:`${label}-a${i}`,role:'answer',text:`Orchid answer ${i}. A short explanation about an ordinary sunny afternoon.`,complete:true}]).flat();
function fixtureProviders(){
  const codex={id:'codex:one',nativeId:'one',provider:'Codex',title:'Kitchen mystery',cwd:'/fixture',messages:messages(24,'codex')};
  codex.messages[7].text=Array(25).fill(filler).join('\n\n')+'\n\nZen poured orange juice into the kettle instead of water. Everyone laughed at her foolish mistake.\n\n'+Array(25).fill(filler).join('\n\n');
  const claude={id:'claude:two',nativeId:'two',provider:'Claude Code',title:'Winter repair',cwd:'/fixture',messages:messages(4,'claude')};
  claude.messages[3].text=Array(25).fill(filler).join('\n\n')+'\n\nThe radiator stopped working during the cold night. Ice formed on the bedroom windows.\n\n'+Array(25).fill(filler).join('\n\n');
  const byId=new Map([codex,claude].map(s=>[s.id,s]));
  return{async list(provider){const s=provider==='codex'?codex:claude;return{sessions:[{...s,messages:undefined}],nextCursor:null};},async read(id){return structuredClone(byId.get(id));},close(){}};
}
async function connectAndIndex(page,url){
  await page.goto(url);await page.getByRole('button',{name:'Connect Codex',exact:true}).click();await expect(page.locator('#sessions button')).toHaveCount(1);
  await page.getByRole('button',{name:'Connect Claude Code',exact:true}).click();await expect(page.locator('#sessions button')).toHaveCount(2);
  await page.getByRole('button',{name:'Index listed sessions',exact:true}).click();await expect(page.locator('#coverage')).toContainText('2 loaded');
}
test('native companion retrieves meaning across Codex and Claude Code and jumps deep inside the exact saved answer',async({page})=>{
  test.setTimeout(120000);const service=await startCompanion({port:0,providers:fixtureProviders()});const outbound=[],errors=[];
  page.on('request',r=>{if(!r.url().startsWith(service.url))outbound.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  try{
    await connectAndIndex(page,service.url);await page.getByRole('searchbox',{name:'Search saved sessions'}).fill('zen was being dumb where was this');
    await expect(page.locator('#search-status')).toHaveText('',{timeout:90000});
    await expect(page.locator('#best .result').first()).toContainText('Kitchen mystery');await expect(page.locator('#best .result').first()).toContainText('orange juice');
    await page.locator('#best .result').first().click();await expect(page.locator('threadrail-navigation')).not.toHaveAttribute('data-state','JUMPING');await expect(page.locator('.toast')).toContainText('matching passage');
    const geometry=await page.locator('[data-message-id="codex-a3"]').evaluate(el=>{const raw=el.firstChild,at=raw.textContent.indexOf('Zen poured');const range=document.createRange();range.setStart(raw,at);range.setEnd(raw,at+10);return{target:range.getBoundingClientRect().top,viewport:document.querySelector('main').getBoundingClientRect().top};});
    expect(geometry.target-geometry.viewport).toBeGreaterThan(0);expect(geometry.target-geometry.viewport).toBeLessThan(180);
    await page.getByRole('searchbox',{name:'Search saved sessions'}).fill('broken heating appliance');await expect(page.locator('#search-status')).toHaveText('',{timeout:15000});
    await expect(page.locator('#best .result').first()).toContainText('Winter repair');await expect(page.locator('#best .result').first()).toContainText('radiator');
    await page.locator('#best .result').first().click();await expect(page.locator('#session-title')).toHaveText('Winter repair');await expect(page.locator('threadrail-navigation')).not.toHaveAttribute('data-state','JUMPING');await expect(page.locator('.toast')).toContainText('matching passage');
    const last=await page.locator('[data-message-id="claude-a1"]').evaluate(el=>{const raw=el.firstChild,at=raw.textContent.indexOf('The radiator');const range=document.createRange();range.setStart(raw,at);range.setEnd(raw,at+12);return{target:range.getBoundingClientRect().top,viewport:document.querySelector('main').getBoundingClientRect().top};});
    expect(last.target-last.viewport).toBeGreaterThan(0);expect(last.target-last.viewport).toBeLessThan(180);
    await page.screenshot({path:'test-results/native-companion-passage.png'});expect(outbound).toEqual([]);expect(errors).toEqual([]);
  }finally{await service.close();}
});
test('native short coding answers retain their meaning after a long creative brief',async({page})=>{
  test.setTimeout(120000);
  const session={id:'claude:setup',nativeId:'setup',provider:'Claude Code',title:'Animation build',cwd:'/fixture',messages:[
    {id:'brief',role:'prompt',complete:false,text:'Act as a film director, art director, motion designer and creative developer. Build a complete renderable animated advertisement. Deliver the finished film and editable source code. Every visual must be created in code. Characters, landscapes, architecture, water, lighting and transitions must be procedural. Rendering a frame independently must produce the same result as rendering it within the complete film. Do not use wall-clock timers or uncontrolled CSS animations. Build reusable camera and lighting helpers.'},
    {id:'setup-answer',role:'answer',complete:true,text:"I'm installing a local Node toolchain (Node isn't on this machine). Remotion needs it."},
    {id:'render-answer',role:'answer',complete:true,text:'The landscape scene now renders with animated trees and a moving camera.\n\n'+Array(12).fill(filler).join('\n\n')},
  ]};
  const service=await startCompanion({port:0,providers:{async list(){return{sessions:[{...session,messages:undefined}],nextCursor:null};},async read(){return session;},close(){}}});
  try{
    await page.goto(service.url);await page.getByRole('button',{name:'Connect Claude Code',exact:true}).click();
    await page.locator('#sessions button').click();await expect(page.locator('#session-title')).toHaveText('Animation build');
    await page.getByRole('searchbox',{name:'Search saved sessions'}).fill('needed a JavaScript runtime before rendering animation');
    await expect(page.locator('#search-status')).toHaveText('',{timeout:90000});
    const result=page.locator('#best .result').first();await expect(result).toHaveAttribute('data-message-id','setup-answer');
    await expect(page.locator('.word-group[aria-label="JavaScript matches"] .count')).toHaveText('0');
    await result.click();await expect(page.locator('threadrail-navigation')).not.toHaveAttribute('data-state','JUMPING');
    const top=await page.locator('[data-message-id="setup-answer"]').evaluate(e=>e.getBoundingClientRect().top);
    const header=await page.locator('main').evaluate(e=>e.getBoundingClientRect().top);expect(top).toBeGreaterThan(header);expect(top-header).toBeLessThan(180);
  }finally{await service.close();}
});

test('native word groups preserve every input/output in order through pagination and click to the right session',async({page})=>{
  const service=await startCompanion({port:0,providers:fixtureProviders()});
  try{
    await page.route('**/dist/models/**',route=>route.abort());await connectAndIndex(page,service.url);
    await page.getByRole('searchbox',{name:'Search saved sessions'}).fill('orchid');const group=page.getByRole('region',{name:'orchid matches',exact:true});
    await expect(group.locator('.count')).toHaveText('54');await expect(group.locator('.result')).toHaveCount(20);
    await group.getByRole('button',{name:'More orchid matches'}).click();await group.getByRole('button',{name:'More orchid matches'}).click();
    await expect(group.locator('.result')).toHaveCount(54);
    const ids=await group.locator('.result').evaluateAll(rows=>rows.map(r=>r.dataset.messageId));
    const all=messages(24,'codex').filter(m=>m.id!=='codex-a3').concat(messages(4,'claude').filter(m=>m.id!=='claude-a1'));
    expect(ids).toEqual(all.map(m=>m.id));
    await group.locator('.result').last().click();await expect(page.locator('#session-title')).toHaveText('Winter repair');await expect(page.locator('.toast')).toContainText('matching passage');
  }finally{await service.close();}
});
test('native scope changes discard a pending old-scope session read',async({page})=>{
  let release;const providers=fixtureProviders(),read=providers.read;providers.read=async id=>{await new Promise(resolve=>release=resolve);return read(id);};
  const service=await startCompanion({port:0,providers});
  try{
    await page.goto(service.url);await page.getByRole('button',{name:'Connect Codex',exact:true}).click();await expect(page.locator('#sessions button')).toHaveCount(1);
    const response=page.waitForResponse(r=>r.url()===service.url+'/api/read');
    await page.locator('#sessions button').click();await expect.poll(()=>typeof release).toBe('function');await page.getByRole('checkbox',{name:'All projects',exact:true}).check();release();await response;
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await expect(page.locator('#coverage')).toContainText('0 loaded');await expect(page.locator('#transcript [data-message-id]')).toHaveCount(0);
    await expect(page.locator('#session-title')).toHaveText('Choose a saved session');
  }finally{release?.();await service.close();}
});

test('an opted-in Chrome extension copy cannot replace the companion rail',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'threadrail-native-coexist-')),extension=resolve(directory,'extension');
  const service=await startCompanion({port:0,providers:fixtureProviders()});let context;
  try{
    await cp('dist',extension,{recursive:true});const manifest=JSON.parse(await readFile(resolve(extension,'manifest.json'),'utf8'));manifest.host_permissions=['http://127.0.0.1/*'];await writeFile(resolve(extension,'manifest.json'),JSON.stringify(manifest));
    context=await chromium.launchPersistentContext(resolve(directory,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    const page=await context.newPage();await page.goto(service.url);await expect(page.locator('threadrail-navigation')).toHaveCount(1);
    await page.locator('threadrail-navigation').evaluate(el=>el.dataset.originalRail='true');
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    await worker.evaluate(async origin=>{const [tab]=await chrome.tabs.query({url:origin+'/*'});await chrome.scripting.executeScript({target:{tabId:tab.id},files:['threadrail.js']});},service.url);
    await expect(page.locator('threadrail-navigation')).toHaveCount(1);await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-original-rail','true');
    await page.getByRole('button',{name:'Connect Codex',exact:true}).click();await expect(page.locator('#sessions button')).toHaveCount(1);await page.locator('#sessions button').click();await expect(page.locator('threadrail-navigation')).toHaveAttribute('data-exchange-count','24');
  }finally{await context?.close();await service.close();await rm(directory,{recursive:true,force:true});}
});
