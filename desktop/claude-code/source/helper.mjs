import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {getSessionMessages} from '@anthropic-ai/claude-agent-sdk';
import {env,AutoModel,BertTokenizer,FeatureExtractionPipeline} from '@huggingface/transformers';
import {SearchIndex} from '../../../src/search-index.js';
import {codingSemanticContext,nativeMeaningQueries,nativeQueryVector} from '../../../native/semantic-context.mjs';
import {searchSources} from './sources.js';

const json=async path=>JSON.parse(await readFile(path,'utf8'));
async function main(request){
  if(request.op==='history'){
    if(typeof request.sessionId!=='string'||!/^[a-zA-Z0-9_-]{1,150}$/.test(request.sessionId)||typeof request.cwd!=='string')throw Error('Invalid current session.');
    const messages=await getSessionMessages(request.sessionId,{dir:request.cwd});
    return {rows:messages.filter(m=>['user','assistant'].includes(m.type)&&!m.parent_tool_use_id).flatMap(m=>{
      const content=m.message?.content;
      const text=typeof content==='string'?content:(Array.isArray(content)?content:[]).filter(b=>b.type==='text').map(b=>b.text).join('\n\n');
      return text.trim()?[{id:m.uuid,role:m.type==='user'?'prompt':'answer',text,complete:m.type==='assistant'&&m.message?.stop_reason==='end_turn'}]:[];
    })};
  }
  if(request.op!=='search'||typeof request.query!=='string'||!Array.isArray(request.rows))throw Error('Invalid search.');
  const index=new SearchIndex();
  index.sync(searchSources(request.rows).map(source=>({...source,embeddingContext:codingSemanticContext(source.text)})));
  const folder=fileURLToPath(new URL('../models/',import.meta.url));
  const modelFolder=join(folder,'all-MiniLM-L6-v2');
  env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=folder;env.useBrowserCache=false;
  const [model,tokenizer,tokenizerConfig]=await Promise.all([
    AutoModel.from_pretrained('all-MiniLM-L6-v2',{device:'cpu',dtype:'q8'}),
    json(join(modelFolder,'tokenizer.json')),json(join(modelFolder,'tokenizer_config.json')),
  ]);
  const pipeline=new FeatureExtractionPipeline({task:'feature-extraction',model,tokenizer:new BertTokenizer(tokenizer,tokenizerConfig)});
  const embed=async texts=>(await pipeline(texts,{pooling:'mean',normalize:true,truncation:true,max_length:256})).tolist();
  const cacheFolder=join(homedir(),'.cache','threadrail','claude-code');
  await mkdir(cacheFolder,{recursive:true,mode:0o700});
  const cacheFile=join(cacheFolder,'meaning-v1.json');let cache={};try{cache=await json(cacheFile);}catch{}
  const digest=text=>createHash('sha256').update(text).digest('hex');
  for(const document of index.documents){const vector=cache[digest(document.embeddingText)];if(Array.isArray(vector)&&vector.length===384&&vector.every(Number.isFinite))document.vector=vector;}
  for(let batch;(batch=index.pending(24)).length;){const vectors=await embed(batch.map(d=>d.embeddingText));index.accept(batch,vectors);for(let i=0;i<batch.length;i++)cache[digest(batch[i].embeddingText)]=vectors[i];}
  // Cache vectors/fingerprints only, never prompts or answer text.
  const used={};for(const document of index.documents)used[digest(document.embeddingText)]=document.vector;
  const temp=cacheFile+'.'+randomUUID();await writeFile(temp,JSON.stringify(used),{mode:0o600});await rename(temp,cacheFile);
  const queryVector=nativeQueryVector(await embed(nativeMeaningQueries(request.query)));
  return {results:index.search(request.query,queryVector,8).map(r=>({id:r.id,messageId:r.messageId,role:r.role,inputText:r.inputText.slice(0,110),excerpt:r.excerpt,matchText:r.matchText,matchOffset:(r.sourceOffset||0)+r.matchOffset})),documents:index.documents.length};
}
// Decode as one stream so multi-byte characters split across chunks stay intact.
process.stdin.setEncoding('utf8');
let input='';for await(const chunk of process.stdin)input+=chunk;
try{console.log(JSON.stringify(await main(JSON.parse(input))));}catch(error){console.error(error.message);process.exitCode=1;}
