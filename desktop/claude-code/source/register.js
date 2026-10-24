import {SearchIndex} from '../../../src/search-index.js';
import {searchSources,exchangesOf,nearby} from './sources.js';
import {NODE} from './runtime.js';

const PANE='threadrail',ROSE='#c6a2ad',IVORY='#f5f0e6',GOLD='#d8c79f';
const normalize=text=>String(text||'').replace(/\s+/g,' ').trim();
function redraw($){return $.ui.invalidate('ui.render');}
const sync=s=>s.index.sync(searchSources(s.rows));
function reset(s){
  s.epoch++;s.generation++;s.debounce?.cancel();s.debounce=null;s.pendingQuery=null;
  s.rows=[];s.query='';s.results=[];s.busy=false;s.error='';s.loaded=false;s.preview=false;
  s.activeId=null;s.groupPage=0;s.wordPages.clear();s.rendered.clear();s.shown.clear();sync(s);
}

async function readHistory($,s){
  const id=await $.session.id();
  if(s.sessionId&&id!==s.sessionId)reset(s);
  s.sessionId=id;s.cwd=await $.session.cwd();s.root=$.plugin.root;
  const epoch=s.epoch;
  const response=await $.process.run([NODE,s.root+'/backend/helper.mjs'],{stdin:JSON.stringify({op:'history',sessionId:id,cwd:s.cwd}),timeoutMs:30000});
  if(response.exitCode!==0)throw Error(response.stderr||'Saved history unavailable.');
  if(epoch!==s.epoch)return;
  const rows=JSON.parse(response.stdout).rows;
  if(!Array.isArray(rows))throw Error('Saved history returned no messages.');
  // Appends may arrive while the SDK reads the saved file. Preserve those ids.
  const live=s.rows.filter(row=>!rows.some(saved=>saved.id===row.id));
  s.rows=[...rows,...live];s.loaded=true;sync(s);
}
async function reveal($,s,row,block='start'){
  let requestId=row.messageId||row.id;
  const text=normalize(row.matchText||row.text);
  const exact=s.rendered.get(requestId);
  const candidates=[...s.rendered.values()].filter(r=>r.role===row.role&&text&&normalize(r.text).includes(text));
  if(!exact&&candidates.length===1)requestId=candidates[0].id;
  try{
    const outcome=await $.ui.scroll({to:{requestId},block});
    if(outcome.deny)throw Error(outcome.deny);
    s.error='';s.preview=false;await $.ui.toast('Jumped to message');
  }catch(error){s.error='Could not jump: '+String(error.message).slice(0,160);}
  redraw($);
}
async function runSearch($,s,value){
  const token=++s.generation,epoch=s.epoch;
  if(!value.trim()){s.results=[];s.busy=false;redraw($);return;}
  s.pendingQuery={value,token,epoch};s.busy=true;redraw($);
  if(s.job)return;
  s.job=(async()=>{
    while(s.pendingQuery){const current=s.pendingQuery;s.pendingQuery=null;
      try{
        if(!s.loaded)await readHistory($,s);
        if(current.epoch!==s.epoch)continue;
        const response=await $.process.run([NODE,s.root+'/backend/helper.mjs'],{stdin:JSON.stringify({op:'search',query:current.value,rows:s.rows}),timeoutMs:120000});
        if(response.exitCode!==0)throw Error(response.stderr||'Meaning search unavailable.');
        const data=JSON.parse(response.stdout);
        if(current.token===s.generation&&current.epoch===s.epoch){s.results=data.results;s.error='';}
      }catch(e){if(current.token===s.generation){s.results=[];s.error='Word search only · '+String(e.message).slice(0,150);}}
    }
  })();
  try{await s.job;}finally{s.job=null;s.busy=false;redraw($);}
}
async function openPane($,s,search=false){
  try{await readHistory($,s);}catch(e){s.error=String(e.message).slice(0,180);}
  s.open=true;s.dismissed=false;if(search)s.preview=false;
  await $.ui.open({id:PANE,title:'ThreadRail',focus:true,closeOnEscape:true,columns:36,rows:24});redraw($);
}
async function captureRow($,s,e,next){
  const role=e.component==='UserMessage'?'prompt':'answer';
  if(e.props.view?.agentId)return next(e);
  if(role==='prompt'&&e.props.origin?.kind&&!['composer','bridge','sdk','unclassified'].includes(e.props.origin.kind))return next(e);
  s.rendered.set(e.requestId,{id:e.requestId,role,text:e.props.text});
  if(e.props.onScreen)s.shown.set(e.requestId,e.props.onScreen);else s.shown.delete(e.requestId);
  const normalized=[...s.shown.keys()].map(id=>s.rendered.get(id)).filter(Boolean);
  const first=s.rows.find(row=>normalized.some(r=>r.id===row.id||normalize(r.text)&&normalize(row.text)===normalize(r.text)));
  if(first){let active;for(const row of s.rows){if(row.role==='prompt')active=row.id;if(row.id===first.id){s.activeId=active;break;}}}
  const exchanges=exchangesOf(s.rows),latest=exchanges.at(-1)?.id;
  if(s.activeId===latest)s.dismissed=false;
  if(s.loaded&&!s.open&&!s.dismissed&&exchanges.length>1&&s.activeId&&s.activeId!==latest){
    s.open=true;try{await $.ui.open({id:PANE,title:'ThreadRail',columns:36,rows:24});}catch{s.open=false;}
  }
  return next(e);
}
function drawPane($,s,e){
  const {Box,Text,Button,Input}= $.ui.resolve(e);
  const button=(key,label,onPress)=>Button({key,label,plain:true,onPress});
  const first=s.rows.find(r=>r.role==='prompt'),last=s.rows.at(-1);
  const children=[Box({flexDirection:'row',columnGap:2,children:[
    button('top','↑ Top',async()=>{if(first)await reveal($,s,{...first,messageId:first.id});}),
    button('search','⌕',async()=>{s.preview=false;redraw($);try{await $.ui.focus({requestId:PANE,key:'query'});}catch{s.error='Select the search field to type.';redraw($);}}),
    button('bottom','↓ Bottom',async()=>{if(last)await reveal($,s,{...last,messageId:last.id},'end');}),
  ]}),Input({key:'query',label:'Search',placeholder:'What do you remember?',value:s.query,submitLabel:'Search',onInput:value=>{
    s.query=value;s.results=[];s.generation++;s.debounce?.cancel();s.wordPages.clear();s.groupPage=0;sync(s);redraw($);
    if(value.trim())s.debounce=$.clock.after(350,()=>runSearch($,s,s.query));else{s.pendingQuery=null;s.busy=false;}
  },onSubmit:value=>{s.debounce?.cancel();s.query=value;return runSearch($,s,value);}})];
  if(s.busy)children.push(Text({color:GOLD,children:['Searching…']}));
  if(s.error)children.push(Text({color:ROSE,children:[s.error]}));
  if(s.query.trim()){
    if(s.results.length)children.push(Text({color:GOLD,children:['Best matches']}));
    for(const result of s.results)children.push(button('best:'+result.id,result.excerpt,()=>reveal($,s,result)));
    const groups=s.index.keywordGroups(s.query);
    if(groups.length)children.push(Text({color:ROSE,children:['By word · Oldest first']}));
    for(const group of groups.slice(s.groupPage*6,s.groupPage*6+6)){children.push(Text({color:ROSE,children:[group.label+' · '+group.results.length]}));
      const page=s.wordPages.get(group.word)||0;
      for(const result of group.results.slice(page*20,page*20+20))children.push(button(result.id,(result.role==='prompt'?'You · ':'Answer · ')+result.excerpt,()=>reveal($,s,result)));
      if(page)children.push(button('previous:'+group.word,'Previous matches',()=>{s.wordPages.set(group.word,page-1);redraw($);}));
      if(group.results.length>(page+1)*20)children.push(button('more:'+group.word,'Next matches',()=>{s.wordPages.set(group.word,page+1);redraw($);}));
    }
    if(s.groupPage)children.push(button('previous-words','Previous words',()=>{s.groupPage--;redraw($);}));
    if(groups.length>(s.groupPage+1)*6)children.push(button('more-words','More words',()=>{s.groupPage++;redraw($);}));
  }else{
    const exchanges=exchangesOf(s.rows),reading=s.activeId||exchanges.at(-1)?.id;
    const window=nearby(s.rows,reading);
    if(s.preview){children.push(Text({color:ROSE,children:['Jump to a conversation']}));for(const exchange of window)children.push(button('preview:'+exchange.id,normalize(exchange.text).slice(0,280),()=>reveal($,s,{...exchange,messageId:exchange.id,role:'prompt'})));}
    else for(const exchange of window)children.push(button('marker:'+exchange.id,(exchange.id===reading?'━ ':'─ ')+exchange.text.slice(0,90),()=>{s.preview=true;redraw($);}));
    if(!window.length)children.push(Text({color:IVORY,children:[s.rows.length?'No completed exchanges yet.':'No saved messages.']}));
  }
  children.push(Text({dimColor:true,children:[s.rows.length+' messages · Current thread']}));
  return Box({flexDirection:'column',rowGap:1,children});
}
export function register(on){
  const s={rows:[],sessionId:'',cwd:'',root:'',query:'',results:[],busy:false,error:'',generation:0,epoch:0,open:false,dismissed:false,preview:false,activeId:null,loaded:false,rendered:new Map(),shown:new Map(),index:new SearchIndex(),wordPages:new Map(),groupPage:0,debounce:null,job:null,pendingQuery:null};
  on('session.start',async($,e,next)=>{
    s.root=$.plugin.root;s.cwd=e.cwd;
    await $.command.register({name:'threadrail',description:'Open the conversation rail and search',immediate:true});
    try{await readHistory($,s);}catch{}
    return next(e);
  });
  on('command.run',{command:'threadrail'},async($)=>{await openPane($,s,true);return {};});
  on('session.end',async($,e,next)=>{reset(s);s.sessionId='';redraw($);return next(e);});
  on('session.append',async($,e,next)=>{
    const result=await next(e),message=result.message||e.message;
    const visibleOrigin=message.type!=='user'||!e.origin?.kind||['composer','bridge','sdk','unclassified'].includes(e.origin.kind);
    if(!e.agentId&&visibleOrigin&&['user','assistant'].includes(message.type)&&!message.isMeta){
      const content=message.content;
      const text=typeof content==='string'?content:(Array.isArray(content)?content:[]).filter(b=>b.type==='text').map(b=>b.text).join('\n\n');
      if(text.trim()){
        const row={id:e.uuid,role:message.type==='user'?'prompt':'answer',text,complete:false};
        const position=s.rows.findIndex(r=>r.id===row.id);if(position<0)s.rows.push(row);else s.rows[position]=row;
        sync(s);if(s.open)redraw($);
      }
    }
    return result;
  });
  on('turn.complete',async($,e,next)=>{
    const result=await next(e);
    if(!e.agentId&&!e.isAborted&&(!e.reason||e.reason==='answer')){const last=s.rows.at(-1);if(last?.role==='answer')last.complete=true;if(s.open)redraw($);}
    return result;
  });
  on('ui.render',{component:'UserMessage'},async($,e,next)=>captureRow($,s,e,next));
  on('ui.render',{component:'AssistantMessage'},async($,e,next)=>captureRow($,s,e,next));
  on('ui.close',async($,e,next)=>{if(e.id===PANE){s.open=false;s.dismissed=e.origin?.kind==='person';}return next(e);});
  on('ui.render',{component:'AbovePrompt'},async($,e,next)=>{
    if(e.props.view?.agentId)return next(e);
    const original=await next(e),{Box,Button}= $.ui.resolve(e);
    return Box({flexDirection:'column',children:[original,Button({key:'threadrail-open',label:'⌕ ThreadRail',plain:true,onPress:()=>openPane($,s,true)})]});
  });
  on('ui.render',{component:'Pane'},async($,e,next)=>e.requestId===PANE?drawPane($,s,e):next(e));
}
