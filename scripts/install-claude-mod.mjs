import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=process.env.THREADRAIL_CLAUDE_BIN||'claude';
const marketplace=fileURLToPath(new URL('../desktop/',import.meta.url));
for(const args of [['plugin','validate',marketplace+'claude-code'],['plugin','install','threadrail','--marketplace',marketplace,'--scope','user']]){
  const result=spawnSync(cli,args,{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
console.log('Installed for Claude Code local desktop and terminal sessions. In an open session run /reload-plugins, then /threadrail.');
