export class EmbeddingClient {
  constructor() { this.sequence = 0; this.pending = new Map(); }
  // recheck: exact vectors for close calls, which the background may serve
  // from (and add to) its cache of earlier rechecks.
  async embed(texts,{priority=false,recheck=false}={}) {
    return this.request('embed',{texts,priority,recheck});
  }
  async rerank(query,texts) {
    return this.request('rerank',{query,texts});
  }
  async request(type,payload) {
    if (globalThis.chrome?.runtime?.id) {
      const response = await chrome.runtime.sendMessage({ type: `threadrail:${type}`, ...payload });
      if (!response?.vectors && !response?.scores) throw new Error(response?.error ?? 'Local model unavailable');
      return response.vectors ?? response.scores;
    }
    // Synthetic demo only. Website content scripts use extension messaging above.
    if (!this.worker) {
      this.worker = new Worker('/dist/embedding-worker.js', { type: 'module' });
      this.worker.onmessage = ({data}) => {
        const task = this.pending.get(data.id);
        if (!task) return;
        clearTimeout(task.timer); this.pending.delete(data.id);
        data.error ? task.reject(new Error(data.error)) : task.resolve(data.vectors ?? data.scores);
      };
      this.worker.onerror = () => this.destroy();
    }
    return new Promise((resolve,reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Local search timed out')); }, 60000);
      this.pending.set(id,{resolve,reject,timer});
      this.worker.postMessage({id,type,...payload});
    });
  }
  destroy() {
    this.worker?.terminate(); this.worker = null;
    for (const task of this.pending.values()) {clearTimeout(task.timer);task.reject(new Error('Search closed'));}
    this.pending.clear();
  }
}
