import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// Read-only protocol boundary: this client cannot start/resume turns or execute tools.
const READ_METHODS = new Set(['initialize','thread/list','thread/read','thread/turns/list','thread/items/list']);
export class CodexReader {
  constructor({command=process.env.THREADRAIL_CODEX_BIN || 'codex',spawnProcess=spawn}={}) {
    this.command=command;this.spawnProcess=spawnProcess;this.pending=new Map();this.sequence=0;
  }
  async start() {
    if(this.ready)return this.ready;
    this.ready=(async()=>{
      const child=this.spawnProcess(this.command,['app-server','--listen','stdio://','-c','analytics.enabled=false'],{stdio:['pipe','pipe','pipe']});
      this.child=child;
      // Never forward session payloads or app-server diagnostics to the browser/log.
      child.stderr.on('data',()=>{});
      child.stdin.on('error',()=>this.fail(new Error('Codex reader disconnected.')));
      child.on('error',()=>this.fail(new Error('Codex could not start. Set THREADRAIL_CODEX_BIN to the installed Codex executable.')));
      child.on('exit',()=>{if(this.child===child){this.child=null;this.ready=null;this.fail(new Error('Codex reader disconnected. Reconnect to retry.'));}});
      const lines=createInterface({input:child.stdout});
      lines.on('line',line=>{
        let message;try{message=JSON.parse(line);}catch{return;}
        if(message.method&&message.id!==undefined){
          child.stdin.write(JSON.stringify({id:message.id,error:{code:-32601,message:'ThreadRail is a read-only client.'}})+'\n');return;
        }
        const task=this.pending.get(message.id);if(!task)return;
        clearTimeout(task.timer);this.pending.delete(message.id);
        if(message.error){const error=new Error(message.error.message);error.code=message.error.code;task.reject(error);}else task.resolve(message.result);
      });
      await this.call('initialize',{clientInfo:{name:'threadrail_reader',title:'ThreadRail Local',version:'1.6.0'}});
      child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
    })().catch(error=>{this.ready=null;this.close();throw error;});
    return this.ready;
  }
  call(method,params={}) {
    if(!READ_METHODS.has(method))return Promise.reject(new Error('Only read-only history methods are allowed.'));
    if(!this.child||this.child.killed)return Promise.reject(new Error('Codex reader is not connected.'));
    return new Promise((resolve,reject)=>{
      const id=++this.sequence;
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Codex history read timed out.'));},30000);
      this.pending.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,method,params})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(new Error('Codex reader disconnected.'));}});
    });
  }
  fail(error){for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(error);}this.pending.clear();}
  close(){this.fail(new Error('Codex reader closed.'));this.child?.stdin.end();this.child?.kill();this.child=null;this.ready=null;}
}
