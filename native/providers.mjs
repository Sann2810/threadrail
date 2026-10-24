import { listSessions,getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import { CodexReader } from './codex-client.mjs';

const textBlocks = content => typeof content==='string' ? content : (Array.isArray(content)?content:[]).filter(block=>['text','input_text','output_text'].includes(block.type)&&typeof block.text==='string').map(block=>block.text).join('\n\n');
export function codexUserText(raw) {
  let text=raw.trim().replace(/^(?:<(environment_context|external_codex_apps_open_page)>[\s\S]*?<\/\1>\s*)+/,'');
  const reply=text.match(/^<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>$/);
  if(reply){try{const answers=JSON.parse(reply[1]);if(Array.isArray(answers)&&answers.every(a=>typeof a.answer==='string'))return answers.map(a=>a.answer).join('\n\n');}catch{}}
  // Desktop attachment/annotation envelopes put the actual typed request last.
  // Keep ordinary Markdown headings and quoted examples unchanged.
  if(/^# (?:Files |Response annotations:|Applications mentioned by the user:)/.test(text)){
    const marker=/^## My request:\s*$/m.exec(text);
    if(marker)text=text.slice(marker.index+marker[0].length).trim();
  }
  return text;
}
export function codexMessages(turns) {
  const messages=[],seen=new Set();
  for(const turn of turns)for(const item of turn.items??[]){
    const role=item.type==='userMessage'?'prompt':item.type==='agentMessage'?'answer':null;
    const text=role==='prompt'?codexUserText(textBlocks(item.content)):role==='answer'?item.text:'';
    if(!role||!text?.trim()||seen.has(item.id))continue;seen.add(item.id);
    messages.push({id:item.id,role,text,complete:role==='answer'&&turn.status==='completed'});
  }
  return messages;
}
export function claudeMessages(items) {
  return items.filter(item=>['user','assistant'].includes(item.type)&&!item.parent_tool_use_id).flatMap(item=>{
    const text=textBlocks(item.message?.content);if(!text.trim())return [];
    return [{id:item.uuid,role:item.type==='user'?'prompt':'answer',text,complete:item.type==='assistant'&&item.message?.stop_reason==='end_turn'}];
  });
}
const title=value=>String(value??'Conversation').replace(/\s+/g,' ').slice(0,160);
export class NativeProviders {
  constructor({project=process.cwd(),codex=new CodexReader(),claude={listSessions,getSessionMessages}}={}){this.project=project;this.codex=codex;this.claude=claude;this.known=new Map();}
  async list(provider,{cursor,allProjects=false}={}){
    let sessions,nextCursor;
    if(provider==='codex'){
      await this.codex.start();
      const response=await this.codex.call('thread/list',{limit:50,cursor:cursor||null,sortKey:'updated_at',useStateDbOnly:true,sourceKinds:['cli','vscode','appServer','exec','unknown'],...(allProjects?{}:{cwd:this.project})});
      sessions=response.data.map(s=>({id:`codex:${s.id}`,nativeId:s.id,provider:'Codex',title:title(s.name||s.preview),cwd:s.cwd,updatedAt:s.updatedAt*1000}));nextCursor=response.nextCursor;
    }else if(provider==='claude'){
      const offset=Number(cursor||0);if(!Number.isSafeInteger(offset)||offset<0)throw new Error('Invalid session page.');
      const rows=await this.claude.listSessions({limit:50,offset,includeProgrammatic:false,...(allProjects?{}:{dir:this.project,includeWorktrees:false})});
      sessions=rows.map(s=>({id:`claude:${s.sessionId}`,nativeId:s.sessionId,provider:'Claude Code',title:title(s.customTitle||s.summary||s.firstPrompt),cwd:s.cwd,updatedAt:s.lastModified}));nextCursor=rows.length===50?String(offset+50):null;
    }else throw new Error('Unknown session source.');
    for(const session of sessions)this.known.set(session.id,session);
    return {sessions,nextCursor:nextCursor??null};
  }
  async read(id){
    const session=this.known.get(id);if(!session)throw new Error('Choose a session from the connected source first.');
    let messages,partial=false;
    if(id.startsWith('codex:')){
      const turns=[],cursors=new Set();let cursor;
      try{
        do{
          const page=await this.codex.call('thread/turns/list',{threadId:session.nativeId,itemsView:'full',sortDirection:'asc',limit:100,cursor:cursor||null});
          turns.push(...page.data);cursor=page.nextCursor;
          if(cursor&&cursors.has(cursor))throw new Error('Codex returned a repeated history cursor.');
          cursors.add(cursor);
          if(turns.length>=5000&&cursor){partial=true;break;}
        }while(cursor);
      }catch(error){
        if(error.code!==-32601)throw error;
        const response=await this.codex.call('thread/read',{threadId:session.nativeId,includeTurns:true});turns.push(...response.thread.turns);
      }
      messages=codexMessages(turns);
    }else messages=claudeMessages(await this.claude.getSessionMessages(session.nativeId,session.cwd?{dir:session.cwd}:{}));
    return {...session,messages,partial};
  }
  close(){this.codex.close();}
}
