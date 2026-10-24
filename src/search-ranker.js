// Query/passage pairs distinguish a remembered event from a merely related
// topic. Relative pair scores let an uncertain ranker defer to dense retrieval.
export async function rankPassages(index,query,vector,client,limit=6,documents=index.documents) {
  const seenText=new Set(),counts=new Map();
  const candidates=index.search(query,vector,documents.length,{dedupe:false,documents}).filter(d=>{
    const group=d.searchGroup??d.chatURL??d.sessionId??d.exchangeId;
    const key=`${d.exchangeId}\n${d.text}`,count=counts.get(group)??0;
    if(seenText.has(key)||count>=4)return false;
    seenText.add(key);counts.set(group,count+1);return true;
  }).slice(0,24);
  if(!candidates.length)return [];
  const scores=await client.rerank(query,candidates.map(d=>d.embeddingText));
  if(scores.length!==candidates.length||scores.some(n=>!Number.isFinite(n)))throw Error('Invalid passage ranking');
  const maximum=Math.max(...scores),weights=scores.map(score=>Math.exp(score-maximum)),total=weights.reduce((a,b)=>a+b,0);
  const ranked=candidates.map((d,i)=>({...d,score:.8*d.score+.2*weights[i]/total}));
  ranked.sort((a,b)=>b.score-a.score);
  const exchanges=new Set();
  return ranked.filter(d=>{if(exchanges.has(d.exchangeId))return false;exchanges.add(d.exchangeId);return true;}).slice(0,limit);
}

export async function rankSelectedPassages(index,query,vector,client,{onVectors=()=>{},onProgress=()=>{}}={}){
  // Small or nearly complete indexes are cheaper to finish directly than to
  // pay for a second ranking pass. Fully warm indexes use the original path.
  if(index.pending(65).length<=64){
    const revision=index.revision;
    for(let batch;index.revision===revision&&(batch=index.pending()).length;){
      index.accept(batch,await client.embed(batch.map(d=>d.embeddingText),{priority:true}));
      await onVectors(batch);onProgress();
    }
    return index.revision===revision?rankPassages(index,query,vector,client):[];
  }
  // First search inexpensive overlapping windows over the entire history. Fine
  // sentence/clause vectors are computed only inside the selected windows, not
  // for every sentence in every long answer before the query can finish.
  const windows=index.search(query,vector,index.documents.length,{dedupe:false,windowsOnly:true,semanticFloor:-1}).slice(0,12);
  if(!windows.length)return [];
  const scores=await client.rerank(query,windows.map(d=>d.embeddingText));
  if(scores.length!==windows.length||scores.some(n=>!Number.isFinite(n)))throw Error('Invalid window ranking');
  const maximum=Math.max(...scores),weights=scores.map(n=>Math.exp(n-maximum)),total=weights.reduce((a,b)=>a+b,0);
  const selected=new Map(windows.slice(0,2).map(d=>[d.id,d]));
  windows.map((d,i)=>({...d,priority:.8*d.score+.2*weights[i]/total})).sort((a,b)=>b.priority-a.priority).slice(0,4).forEach(d=>selected.set(d.id,d));
  // Exact high-coverage memories retain their direct route to a source even
  // when the dense window's other events reduce its semantic score.
  windows.filter(d=>d.coverage>=.5).slice(0,2).forEach(d=>selected.set(d.id,d));
  const ids=new Set(index.documents.filter(d=>[...selected.values()].some(w=>d.sourceId===w.sourceId&&d.offset<w.offset+w.text.length&&d.offset+d.text.length>w.offset)).map(d=>d.id));
  const revision=index.revision;
  for(let batch;index.revision===revision&&(batch=index.pending(8,{documents:index.documents.filter(d=>ids.has(d.id))})).length;){
    index.accept(batch,await client.embed(batch.map(d=>d.embeddingText),{priority:true}));
    await onVectors(batch);onProgress();
  }
  if(index.revision!==revision)return [];
  // Apply the unchanged passage threshold and final ranker to original text.
  return rankPassages(index,query,vector,client,6,index.documents.filter(d=>ids.has(d.id)));
}

export class RankedSearch {
  constructor(index,client,onChange,{selective=false,onVectors}={}){this.index=index;this.client=client;this.onChange=onChange;this.cache=new Map();this.selective=selective;this.onVectors=onVectors;}
  get(query,vector){
    if(!vector||this.index.documents.some(d=>!d.vector&&(!this.selective||!d.isFine)))return null;
    const revision=this.index.revision,key=`${revision}\n${query}`;
    if(this.cache.has(key)){
      const cached=this.cache.get(key);
      // Rankings survive host remounts; DOM handles must always come from the
      // current index. Reusing cached elements makes every later click stale.
      const current=new Map(this.index.documents.map(d=>[d.id,d]));
      return {...cached,results:cached.results.map(result=>current.has(result.id)?{...result,...current.get(result.id)}:null).filter(Boolean)};
    }
    if(this.cache.size>=16)this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key,{pending:true,results:[]});
    const task=this.selective?rankSelectedPassages(this.index,query,vector,this.client,{onVectors:this.onVectors,onProgress:this.onChange}):rankPassages(this.index,query,vector,this.client,this.index.documents.length);
    task.then(results=>{
      if(this.index.revision===revision)this.cache.set(key,{pending:false,results:results.map(({element,...result})=>result)});
    }).catch(()=>{
      if(this.index.revision===revision)this.cache.set(key,{pending:false,error:true,results:this.index.search(query,vector,this.index.documents.length).map(({element,...result})=>result)});
    }).finally(()=>this.onChange());
    return this.cache.get(key);
  }
}
