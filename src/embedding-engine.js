import { env, AutoModel, AutoModelForSequenceClassification, BertTokenizer, FeatureExtractionPipeline } from '@huggingface/transformers';
import { SEARCH_MODEL } from './search-model.js';
let extractor;
const jobs=[],vectors=new Map();let running=false;
function schedule(run,priority=0){
  return new Promise((resolve,reject)=>{
    jobs.push({run,priority,resolve,reject});jobs.sort((a,b)=>b.priority-a.priority);
    if(!running)drain();
  });
}
async function drain(){
  running=true;
  while(jobs.length){const job=jobs.shift();try{job.resolve(await job.run());}catch(error){job.reject(error);}}
  running=false;
}
let reranker;
export function embeddings(texts, base, priority=0) {
  return schedule(async () => {
    const result=new Map(texts.filter(text=>vectors.has(text)).map(text=>[text,vectors.get(text)]));
    const missing=[...new Set(texts)].filter(text=>!vectors.has(text));
    if(!missing.length)return texts.map(text=>vectors.get(text));
    if (!extractor) {
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = `${base}models/`;
      env.useBrowserCache = false;
      env.backends.onnx.wasm.wasmPaths = { wasm: `${base}runtime/ort-wasm-simd-threaded.asyncify.wasm` };
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
      extractor = (async () => {
        const folder = `${base}models/${SEARCH_MODEL.id}/`;
        const json = async file => {const response = await fetch(folder+file);if (!response.ok) throw new Error('Packaged model file unavailable');return response.json();};
        const [tokenizerJSON, tokenizerConfig, model] = await Promise.all([
          json('tokenizer.json'), json('tokenizer_config.json'),
          AutoModel.from_pretrained(SEARCH_MODEL.id, { device: 'wasm', dtype: 'q8' }),
        ]);
        return new FeatureExtractionPipeline({ task:'feature-extraction', model, tokenizer:new BertTokenizer(tokenizerJSON,tokenizerConfig) });
      })();
    }
    try {
      const model = await extractor;
      const output = await model(missing, { pooling: SEARCH_MODEL.pooling, normalize: true, truncation: true, max_length: 256 });
      output.tolist().forEach((vector,i)=>{if(vectors.size>=8192)vectors.delete(vectors.keys().next().value);vectors.set(missing[i],vector);result.set(missing[i],vector);});
      return texts.map(text=>result.get(text));
    } catch (error) { extractor = null; throw error; }
  },priority);
}

export function rerank(query,texts,base) {
  return schedule(async()=>{
    if(!reranker){
      env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=`${base}models/`;env.useBrowserCache=false;
      env.backends.onnx.wasm.wasmPaths={wasm:`${base}runtime/ort-wasm-simd-threaded.asyncify.wasm`};
      env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
      reranker=(async()=>{
        const folder=`${base}models/ms-marco-MiniLM-L-6-v2/`;
        const json=async file=>{const r=await fetch(folder+file);if(!r.ok)throw Error('Packaged ranker unavailable');return r.json();};
        const [model,tokenizer,config]=await Promise.all([
          AutoModelForSequenceClassification.from_pretrained('ms-marco-MiniLM-L-6-v2',{device:'wasm',dtype:'q8'}),json('tokenizer.json'),json('tokenizer_config.json')]);
        return{model,tokenizer:new BertTokenizer(tokenizer,config)};
      })();
    }
    try{
      const {model,tokenizer}=await reranker,scores=[];
      for(let i=0;i<texts.length;i+=4){
        const batch=texts.slice(i,i+4),inputs=tokenizer(batch.map(()=>query),{text_pair:batch,padding:true,truncation:true,max_length:256});
        const result=await model(inputs);scores.push(...result.logits.data);
      }
      return scores;
    }catch(error){reranker=null;throw error;}
  },2);
}

