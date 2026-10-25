// Scores and cached vectors belong to this model, pooling and query format.
export const SEARCH_MODEL = {
  id:'bge-small-en-v1.5', pooling:'cls', semanticFloor:.58,
  // single: each text is embedded on its own (vectors no longer vary with batching).
  embeddingVersion:'bge-small-en-v1.5:ea104dacec62c0de699686887e3f920caeb4f3e3:cls:single-v2',
};
export const retrievalQuery = query => `Represent this sentence for searching relevant passages: ${query}`;
export const compatibleVector = (cached,document) => cached?.embeddingVersion === document.embeddingVersion && cached.embeddingText === document.embeddingText;
