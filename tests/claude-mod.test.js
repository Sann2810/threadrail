// These tests exercise production callbacks with a recording host. They prove
// requested message targets and state logic, not scrolling in a real app.
import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from '../desktop/claude-code/source/register.js';

const fixture=(count=14)=>Array.from({length:count},(_,i)=>[
  {id:'u'+i,role:'prompt',text:'Orchid request '+i,complete:false},
  {id:'a'+i,role:'answer',text:i===3?'Zen poured juice into a kettle by mistake.':'Orchid reply '+i,complete:true},
]).flat();
const pane={component:'Pane',requestId:'threadrail',surface:'desktop',props:{view:{}}};
function harness({rows=fixture(),deny='',search}={}){
  const hooks=[],scrolls=[],toasts=[],opens=[],timers=[];let data=structuredClone(rows);
  register((event,match,handle)=>{if(typeof match==='function'){handle=match;match={};}hooks.push({event,match,handle});});
  const constructor=type=>props=>({type,props,children:props.children||[]});
  const $={plugin:{root:'/plugin'},session:{id:async()=> 'fixture',cwd:async()=>'/fixture'},
    command:{register:async()=>{}},clock:{after:(ms,fn)=>{const timer={fn,cancelled:false,cancel(){this.cancelled=true;}};timers.push(timer);return timer;}},
    ui:{invalidate:()=>{},resolve:()=>Object.fromEntries(['Box','Text','Button','Input'].map(name=>[name,constructor(name)])),open:async args=>{opens.push(args);},focus:async()=>({}),scroll:async args=>{scrolls.push(args);return deny?{deny}:{};},toast:text=>toasts.push(text)},
    process:{run:async(argv,init)=>{const request=JSON.parse(init.stdin);return{exitCode:0,stdout:JSON.stringify(request.op==='history'?{rows:data}:await(search?.(request)||{results:[{id:'a3:0',messageId:'a3',role:'answer',excerpt:rows.find(r=>r.id==='a3')?.text,matchText:rows.find(r=>r.id==='a3')?.text}]})),stderr:''};}},
  };
  const original={type:'Text',props:{},children:['Original host drawing']};
  async function fire(event,e={}){
    const selected=hooks.filter(h=>h.event===event&&Object.entries(h.match).every(([k,v])=>e[k]===v));
    const run=i=>i===selected.length?Promise.resolve(event==='ui.render'?original:event==='session.append'?{message:e.message}:{}):selected[i].handle($,e,()=>run(i+1));
    return run(0);
  }
  const draw=()=>fire('ui.render',pane);
  const elements=tree=>[tree,...(tree.children||[]).filter(c=>typeof c==='object').flatMap(elements)];
  const find=async key=>elements(await draw()).find(el=>el.props.key===key);
  const press=async key=>{const el=await find(key);assert.ok(el,`button ${key}`);await el.props.onPress();};
  const change=async value=>(await find('query')).props.onInput(value);
  const submit=async value=>(await find('query')).props.onSubmit(value);
  const start=async()=>{await fire('session.start',{cwd:'/fixture'});await fire('command.run',{command:'threadrail'});};
  return{$,fire,draw,elements,find,press,change,submit,start,scrolls,toasts,opens,timers,setData:value=>{data=structuredClone(value);}};
}

test('Claude mod preview, Top and Bottom request original message ids only after a click',async()=>{
  const h=harness();await h.start();assert.deepEqual(h.scrolls,[]);
  const markers=h.elements(await h.draw()).filter(e=>e.props.key?.startsWith('marker:'));
  assert.deepEqual(markers.map(e=>e.props.key),Array.from({length:10},(_,i)=>'marker:u'+(i+4)));
  await h.press('marker:u4');assert.deepEqual(h.scrolls,[]);await h.press('preview:u4');
  await h.press('top');await h.press('bottom');
  assert.deepEqual(h.scrolls,[{to:{requestId:'u4'},block:'start'},{to:{requestId:'u0'},block:'start'},{to:{requestId:'a13'},block:'end'}]);
});
test('Claude mod all word pages preserve every input and output in source order and target their ids',async()=>{
  const rows=fixture(201),h=harness({rows});await h.start();await h.change('Orchid');
  const seen=[];
  for(;;){
    const results=h.elements(await h.draw()).filter(e=>e.props.key?.startsWith('word:orchid:'));
    assert.ok(results.length<=20);for(const result of results){seen.push(result.props.key.slice('word:orchid:'.length));await result.props.onPress();}
    if(!await h.find('more:orchid'))break;await h.press('more:orchid');
  }
  const expected=rows.filter(row=>row.text.includes('Orchid')).map(row=>row.id);
  assert.deepEqual(seen,expected);assert.deepEqual(h.scrolls.map(s=>s.to.requestId),expected);
});
test('Claude mod meaning matches request their original answer and refusals never report success',async()=>{
  const h=harness({deny:'not person-initiated'});await h.start();await h.submit('Zen was being foolish');await h.press('best:a3:0');
  assert.deepEqual(h.scrolls,[{to:{requestId:'a3'},block:'start'}]);assert.deepEqual(h.toasts,[]);
  assert.ok(h.elements(await h.draw()).some(e=>e.children.includes('Could not jump: not person-initiated')));
});
test('Claude mod repeated text cannot redirect a raw message id to another occurrence',async()=>{
  const h=harness();await h.start();
  for(const id of ['other-1','other-2'])await h.fire('ui.render',{component:'UserMessage',requestId:id,props:{text:'Orchid request 0',origin:{kind:'composer'}}});
  await h.press('top');assert.equal(h.scrolls[0].to.requestId,'u0');
});
test('Claude mod ignores a stale meaning result after the query changes or session ends',async()=>{
  let resolve;const h=harness({search:()=>new Promise(done=>{resolve=done;})});await h.start();
  const pending=h.submit('old query');await new Promise(done=>setImmediate(done));await h.change('new query');
  resolve({results:[{id:'stale',excerpt:'stale'}]});await pending;assert.equal(await h.find('best:stale'),undefined);
  const pending2=h.submit('another query');await new Promise(done=>setImmediate(done));await h.fire('session.end');
  resolve({results:[{id:'stale-again',excerpt:'stale'}]});await pending2;
  assert.equal(await h.find('best:stale-again'),undefined);assert.equal((await h.find('query')).props.value,'');
  assert.equal(h.timers.every(t=>t.cancelled),true);
});
test('Claude mod live appends and turn completion add a new completed exchange without rewriting host messages',async()=>{
  const h=harness();await h.start();
  for(const [type,uuid,text]of [['user','new-u','A new request'],['assistant','new-a','A new answer']]){
    const message={type,content:[{type:'text',text}]};const result=await h.fire('session.append',{message,uuid,origin:{kind:type==='user'?'composer':'model'}});assert.equal(result.message,message);
  }
  await h.fire('turn.complete',{});assert.ok(await h.find('marker:new-u'));
  const result=await h.fire('ui.render',{component:'AssistantMessage',requestId:'new-a',props:{text:'A new answer'}});assert.deepEqual(result.children,['Original host drawing']);
});
