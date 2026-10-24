import {build} from 'esbuild';
import {mkdir,cp,rm,access} from 'node:fs/promises';
const folder='desktop/claude-code';
await mkdir(folder+'/backend',{recursive:true});
await build({entryPoints:[folder+'/source/register.js'],outfile:folder+'/hooks/register.js',bundle:true,format:'esm',platform:'neutral',target:'es2022',define:{__THREADRAIL_NODE__:JSON.stringify(process.execPath)}});
// This is a development install on this computer. Resolve the two installed
// runtime libraries explicitly so Claude's cached plugin copy uses the same
// verified dependencies, without assuming it lives beside the workspace.
await build({entryPoints:[folder+'/source/helper.mjs'],outfile:folder+'/backend/helper.mjs',bundle:true,format:'esm',platform:'node',target:'node22',plugins:[{
  name:'installed-local-runtime',setup(build){build.onResolve({filter:/^(@anthropic-ai\/claude-agent-sdk|@huggingface\/transformers)$/},args=>({path:import.meta.resolve(args.path),external:true}));},
}]});
// The helper embeds with all-MiniLM-L6-v2, which npm run prepare:model places in models/.
try{await access('models/all-MiniLM-L6-v2/onnx/model_quantized.onnx');}
catch{throw new Error('models/all-MiniLM-L6-v2 is missing. Run npm run prepare:model first.');}
await rm(folder+'/models',{recursive:true,force:true});
await cp('models/all-MiniLM-L6-v2',folder+'/models/all-MiniLM-L6-v2',{recursive:true});
await cp('models/manifest.json',folder+'/models/manifest.json');
await cp('licenses/onnxruntime-MIT.txt',folder+'/models/ONNXRUNTIME_LICENSE.txt');
console.log('Built Claude Code in-app mod → '+folder);
