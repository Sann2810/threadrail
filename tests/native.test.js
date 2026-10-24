import test from 'node:test';
import assert from 'node:assert/strict';
import { codexMessages,codexUserText,claudeMessages,NativeProviders } from '../native/providers.mjs';
import { CodexReader } from '../native/codex-client.mjs';
import { startCompanion } from '../native/server.mjs';
import { codingSemanticContext,nativeMeaningQueries,nativeQueryVector } from '../native/semantic-context.mjs';

test('native meaning labels recognize runtime names without indexing unrelated node or bun text',()=>{
  assert.equal(codingSemanticContext('Installing the Node toolchain.'),'JavaScript runtime');
  assert.equal(codingSemanticContext('The service uses Node.js.'),'JavaScript runtime');
  assert.equal(codingSemanticContext('Bun is our TypeScript runtime.'),'JavaScript runtime');
  assert.equal(codingSemanticContext('A graph node connects two edges.'),'');
  assert.equal(codingSemanticContext('A warm bun with coffee.'),'');
});
test('native remembered events retain the full query while emphasizing the event over its temporal background',()=>{
  assert.deepEqual(nativeMeaningQueries('needed a JavaScript runtime before rendering animation'),['needed a JavaScript runtime before rendering animation','needed a JavaScript runtime']);
  assert.deepEqual(nativeMeaningQueries('broken heating appliance'),['broken heating appliance']);
  assert.deepEqual(nativeMeaningQueries('what happened before rendering animation'),['what happened before rendering animation']);
  assert.deepEqual(nativeMeaningQueries('Zen after the journey'),['Zen after the journey']);
  const vector=nativeQueryVector([[1,0],[0,1]]);assert.ok(vector[1]>vector[0]);assert.ok(Math.abs(Math.hypot(...vector)-1)<1e-9);
});

test('Codex history keeps visible inputs/outputs in turn order and excludes tools and reasoning',()=>{
  const messages=codexMessages([{status:'completed',items:[{id:'u',type:'userMessage',content:[{type:'text',text:'A question'},{type:'image',url:'private'}]},{id:'tool',type:'commandExecution',aggregatedOutput:'hidden output'},{id:'r',type:'reasoning',text:'hidden reasoning'},{id:'a',type:'agentMessage',text:'Visible answer'}]},{status:'inProgress',items:[{id:'a',type:'agentMessage',text:'Duplicate'},{id:'b',type:'agentMessage',text:'Still being saved'}]}]);
  assert.deepEqual(messages,[{id:'u',role:'prompt',text:'A question',complete:false},{id:'a',role:'answer',text:'Visible answer',complete:true},{id:'b',role:'answer',text:'Still being saved',complete:false}]);
});
test('Codex desktop previews show the typed request and form answer rather than transport envelopes',()=>{
  assert.equal(codexUserText('# Files mentioned by the user:\nfile.txt\n\n## My request:\nFind the missing passage.'),'Find the missing passage.');
  assert.equal(codexUserText('# Response annotations:\n<response-annotations>metadata</response-annotations>\n\n## My request:\nKeep the old style.'),'Keep the old style.');
  assert.equal(codexUserText('# Applications mentioned by the user:\n<appshot>Application metadata</appshot>\n\n## My request:\nOpen the document.'),'Open the document.');
  assert.equal(codexUserText('<send_user_message_question_reply>\n[{"questionItemId":"private-id","answer":"Both interfaces"}]\n</send_user_message_question_reply>'),'Both interfaces');
  assert.equal(codexUserText('<environment_context>context only</environment_context>'),'');
  assert.equal(codexUserText('# Notes\n## My request:\nThis is ordinary Markdown.'),'# Notes\n## My request:\nThis is ordinary Markdown.');
});
test('Claude Code history excludes tool-result inputs, thinking, nested tool messages and system text',()=>{
  const item=(type,uuid,content,extra={})=>({type,uuid,parent_tool_use_id:null,message:{content,...extra}});
  const messages=claudeMessages([item('user','u',[{type:'text',text:'Where is it?'}]),item('user','tool',[{type:'tool_result',content:'private tool output'}]),item('assistant','a',[{type:'thinking',thinking:'hidden'},{type:'text',text:'In the drawer.'}],{stop_reason:'end_turn'}),{...item('assistant','nested',[{type:'text',text:'nested'}]),parent_tool_use_id:'tool'},item('system','s','system')]);
  assert.deepEqual(messages.map(m=>[m.id,m.role,m.text,m.complete]),[['u','prompt','Where is it?',false],['a','answer','In the drawer.',true]]);
});
test('Codex reader rejects generation, resume, shell and mutation methods before sending',async()=>{
  const reader=new CodexReader();for(const method of ['turn/start','thread/resume','command/exec','thread/delete'])await assert.rejects(reader.call(method),/read-only/);
});
test('native Codex pagination reads every page chronologically without resuming',async()=>{
  const calls=[];const codex={async start(){},close(){},async call(method,params){calls.push({method,params});if(method==='thread/list')return{data:[{id:'id',preview:'Example',cwd:'/project',updatedAt:2}],nextCursor:null};return{data:[{status:'completed',items:[{type:'agentMessage',id:params.cursor?'second':'first',text:params.cursor?'Second':'First'}]}],nextCursor:params.cursor?null:'page2'};}};
  const providers=new NativeProviders({project:'/project',codex});const listed=await providers.list('codex');const session=await providers.read(listed.sessions[0].id);
  assert.deepEqual(session.messages.map(m=>m.text),['First','Second']);assert.equal(calls[0].params.cwd,'/project');assert.equal(calls[0].params.useStateDbOnly,true);assert.ok(calls.slice(1).every(c=>c.method==='thread/turns/list'&&c.params.sortDirection==='asc'&&c.params.itemsView==='full'));
  await assert.rejects(providers.read('codex:unlisted'),/Choose a session/);
});
test('native Claude uses SDK project scope and pagination, with no inference call',async()=>{
  const seen=[];const claude={async listSessions(options){seen.push(options);return[{sessionId:'id',summary:'Example',cwd:'/project',lastModified:1}];},async getSessionMessages(id,options){seen.push({id,...options});return[{type:'assistant',uuid:'a',message:{content:'Saved text'}}];}};
  const providers=new NativeProviders({project:'/project',claude});await providers.list('claude',{cursor:'50'});assert.equal(seen[0].dir,'/project');assert.equal(seen[0].offset,50);
  assert.equal((await providers.read('claude:id')).messages[0].text,'Saved text');await providers.list('claude',{allProjects:true});assert.equal(seen.at(-1).dir,undefined);
  await assert.rejects(providers.list('claude',{cursor:'-1'}),/Invalid session page/);
});
test('local history API requires its own cookie, custom header and origin; arbitrary files are not served',async()=>{
  const providers={async list(){return{sessions:[],nextCursor:null};},close(){}};
  const service=await startCompanion({port:0,providers});
  try{
    const root=await fetch(service.url);const cookie=root.headers.get('set-cookie').split(';')[0];
    const request=headers=>fetch(service.url+'/api/list',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{"provider":"codex"}'});
    assert.equal((await request({})).status,403);assert.equal((await request({Cookie:cookie})).status,403);
    assert.equal((await request({Cookie:cookie,'X-ThreadRail':'local',Origin:'https://other.example'})).status,403);
    assert.equal((await request({Cookie:cookie,'X-ThreadRail':'local',Origin:service.url})).status,200);
    assert.equal((await fetch(service.url+'/native/providers.mjs')).status,404);assert.equal((await fetch(service.url+'/api/list')).status,403);
  }finally{await service.close();}
});
