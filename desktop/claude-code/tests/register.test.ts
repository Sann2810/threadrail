import {expect,mock,test} from 'claude-code/testing';

const rows=Array.from({length:14},(_,i)=>[
  {id:'u'+i,role:'prompt',text:'Orchid request '+i,complete:false},
  {id:'a'+i,role:'answer',text:i===3?'Zen poured juice into a kettle by mistake.':'Orchid reply '+i,complete:true},
]).flat();
const PANE={plugin:'threadrail',component:'Pane',requestId:'threadrail',viewport:{columns:140,rows:45,isFullscreen:true},props:{title:'ThreadRail',isFocused:true,bodyColumns:36,placement:'dock',scroll:{offset:0,bodyRows:40},view:{}}} as const;
function world(on,{data=rows,failSearch=false}={}){
  const clock=mock.clock(on),opens=[],toasts=[],runs=[];
  on('command.register',()=>({value:undefined}));
  on('session.id',()=>({value:'fixture-session'}));on('session.cwd',()=>({value:'/fixture'}));
  on('session.start',()=>({cwd:'/fixture'}));on('session.end',()=>({sessionId:'fixture-session'}));
  on('ui.open',($,e)=>{opens.push(e);return{value:undefined};});
  on('ui.focus',()=>({value:{}}));
  // 2.1.300's test kit does not dispatch $.ui.scroll to this stub. The
  // corresponding test below checks the visible failure, not a fictitious jump.
  on('ui.scroll',()=>({}));
  on('ui.toast',($,e)=>{toasts.push(e.text);return{value:undefined};});
  on('process.run',($,e)=>{
    const request=JSON.parse(e.init?.stdin||'{}');runs.push(request);
    if(request.op==='history')return{value:{exitCode:0,stdout:JSON.stringify({rows:data}),stderr:''}};
    return{value:{exitCode:failSearch?1:0,stderr:failSearch?'Local model unavailable':'',stdout:JSON.stringify({results:[{id:'a3:0',messageId:'a3',role:'answer',excerpt:data.find(r=>r.id==='a3')?.text||'Meaning match',matchText:data.find(r=>r.id==='a3')?.text||'Meaning match'}]})}};
  });
  on('ui.render',()=>({type:'Text',props:{},children:['Original host drawing']}));
  return{clock,opens,toasts,runs};
}
async function start($){await $.session.start({surface:'desktop',isInteractive:true,cwd:'/fixture'});await $.command.run({command:'threadrail',args:'',origin:{kind:'composer'}});}

test('desktop and terminal render ten unnumbered prompts and a matching preview',async($,on)=>{
  const w=world(on);await start($);
  for(const surface of ['desktop','terminal'] as const){
    const ui=await $.ui.mount({...PANE,surface});
    expect(await ui.find({key:'marker:u4'})).toBeDefined();expect(await ui.find({key:'marker:u3'})).toBeUndefined();
    expect((await ui.find({key:'marker:u4'})).props.label).toBe('─ Orchid request 4');
    await ui.press({key:'marker:u4'});expect(await ui.find({key:'preview:u4'})).toBeDefined();
    expect(w.toasts).toEqual([]);await ui.unmount();await $.session.end({reason:'clear',resume:{}});await start($);
  }
});
test('word groups include both roles, in order across bounded pages',async($,on)=>{
  world(on);await start($);const ui=await $.ui.mount({...PANE,surface:'desktop'});
  await ui.input({key:'query',text:'Orchid',kind:'change'});
  expect(await ui.find({type:'Text',text:'Orchid · 27'})).toBeDefined();
  expect(await ui.find({key:'word:orchid:u0'})).toBeDefined();expect(await ui.find({key:'word:orchid:a0'})).toBeDefined();
  expect(await ui.find({key:'word:orchid:a13'})).toBeUndefined();await ui.press({key:'more:orchid'});
  expect(await ui.find({key:'word:orchid:a13'})).toBeDefined();expect(await ui.find({key:'word:orchid:u0'})).toBeUndefined();
  await ui.press({key:'previous:orchid'});expect(await ui.find({key:'word:orchid:u0'})).toBeDefined();
});
test('meaning results are separate from literal results and no prompt is submitted',async($,on)=>{
  world(on);let submitted=0;on('prompt.submit',()=>{submitted++;return{text:'unexpected'};});
  await start($);const ui=await $.ui.mount({...PANE,surface:'desktop'});
  await ui.input({key:'query',text:'Zen was being foolish'});
  expect(await ui.find({key:'best:a3:0'})).toBeDefined();expect(await ui.find({key:'word:zen:a3'})).toBeDefined();expect(submitted).toBe(0);
});
test('an unavailable host scroll is visible and never announces success',async($,on)=>{
  const w=world(on);await start($);const ui=await $.ui.mount({...PANE,surface:'desktop'});
  await ui.press({key:'top'});expect(await ui.find({type:'Text',text:/Could not jump: no implementation for ui.scroll/})).toBeDefined();expect(w.toasts).toEqual([]);
});
test('model failure preserves literal search',async($,on)=>{
  world(on,{failSearch:true});await start($);const ui=await $.ui.mount({...PANE,surface:'desktop'});
  await ui.input({key:'query',text:'Zen'});expect(await ui.find({type:'Text',text:/Word search only/})).toBeDefined();expect(await ui.find({key:'word:zen:a3'})).toBeDefined();
});
test('AbovePrompt preserves the host drawing and offers the native search button',async($,on)=>{
  world(on);await start($);const ui=await $.ui.mount({plugin:'threadrail',surface:'desktop',component:'AbovePrompt',requestId:'band',props:{view:{}}});
  expect(await ui.find({type:'Text',text:'Original host drawing'})).toBeDefined();expect(await ui.find({key:'threadrail-open'})).toBeDefined();
});
test('session end clears old search and all messages',async($,on)=>{
  world(on);await start($);const ui=await $.ui.mount({...PANE,surface:'desktop'});await ui.input({key:'query',text:'Zen'});
  await $.session.end({reason:'clear',resume:{}});
  expect(await ui.find({key:'best:a3:0'})).toBeUndefined();expect(await ui.find({type:'Text',text:'No saved messages.'})).toBeDefined();expect((await ui.find({key:'query'})).props.value).toBe('');
});
