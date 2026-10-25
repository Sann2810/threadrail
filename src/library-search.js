import {semanticQuery} from './search-text.js';
import {retrievalQuery} from './search-model.js';
import {rankPassages} from './search-ranker.js';

// First seen, then address: the same order as reading the store, which lists
// chats by address, regardless of how the chats were collected.
export const savedChatOrder=chats=>[...chats].sort((a,b)=>a.firstSeen-b.firstSeen||(a.url<b.url?-1:a.url>b.url?1:0));
export function libraryResults(results){
  const seen=new Set();
  return results.filter(result=>{if(seen.has(result.chatURL))return false;seen.add(result.chatURL);return true;}).slice(0,12);
}
export function libraryTarget(result){
  return {chatURL:result.chatURL,role:result.role,nativeId:result.nativeId,messageKey:result.messageKey,
    sourceText:result.sourceText,matchText:result.matchText,matchOffset:result.matchOffset,
    highlightStart:result.highlightStart,highlightLength:result.highlightLength};
}
export async function libraryQueryVector(client,query){
  const [vector]=await client.embed([retrievalQuery(semanticQuery(query))],{priority:true});return vector;
}
export function diagnosticAwait(promise,signal){
  if(!signal)return promise;
  if(signal.aborted){Promise.resolve(promise).catch(()=>{});return Promise.reject(Error('Stopped'));}
  return new Promise((resolve,reject)=>{
    const aborted=()=>reject(Error('Stopped'));signal.addEventListener('abort',aborted,{once:true});
    promise.then(value=>{signal.removeEventListener('abort',aborted);resolve(value);},error=>{signal.removeEventListener('abort',aborted);reject(error);});
  });
}
// Both the page and diagnostics use the same encoding, final ranker, and
// one-result-per-chat selection. Diagnostics fail if either local model fails.
export async function searchSavedIndex(index,client,query,{check=()=>{},onBatch=async()=>{},signal}={}){
  check();const vector=await diagnosticAwait(libraryQueryVector(client,query),signal);check();
  for(let batch;(batch=index.pending()).length;){
    check();index.accept(batch,await diagnosticAwait(client.embed(batch.map(d=>d.embeddingText),{priority:true}),signal));
    check();await onBatch(batch);
  }
  const results=await diagnosticAwait(rankPassages(index,query,vector,client,index.documents.length),signal);check();
  return libraryResults(results);
}
