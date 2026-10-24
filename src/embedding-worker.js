import { embeddings,rerank } from './embedding-engine.js';
self.onmessage = async event => {
  const { id, type, texts, query, priority } = event.data;
  try {
    const base=new URL('./',import.meta.url).href;
    self.postMessage(type==='rerank'?{id,scores:await rerank(query,texts,base)}:{id,vectors:await embeddings(texts,base,priority?1:0)});
  }
  catch (error) { self.postMessage({ id, error: error.message }); }
};
