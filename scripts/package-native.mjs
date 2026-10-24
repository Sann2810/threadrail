import {mkdir,mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const pkg=JSON.parse(await readFile('package.json','utf8')),directory=await mkdtemp(resolve(tmpdir(),'threadrail-local-release-'));
try{
  await cp('native',resolve(directory,'native'),{recursive:true});await mkdir(resolve(directory,'dist'));
  for(const name of ['threadrail.js','native-app.js','embedding-worker.js','models','runtime','licenses','THIRD_PARTY_NOTICES.md'])await cp(resolve('dist',name),resolve(directory,'dist',name),{recursive:true});
  await cp('NATIVE.md',resolve(directory,'README.md'));
  await writeFile(resolve(directory,'package.json'),JSON.stringify({name:'threadrail-local',version:pkg.version,private:true,type:'module',scripts:{start:'node native/server.mjs',native:'node native/server.mjs'},dependencies:{'@anthropic-ai/claude-agent-sdk':pkg.dependencies['@anthropic-ai/claude-agent-sdk']}},null,2)+'\n');
  await mkdir('release',{recursive:true});const output=resolve(`release/threadrail-local-${pkg.version}.zip`);await rm(output,{force:true});
  execFileSync('zip',['-q','-r',output,'native','dist','README.md','package.json'],{cwd:directory});console.log(`Packaged ${output}`);
}finally{await rm(directory,{recursive:true,force:true});}
