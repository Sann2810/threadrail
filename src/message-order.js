// Captured-array order is a fallback, not proof of conversation chronology.
// Retain observed precedence between stable message keys, including across
// unloaded gaps. A pinned latest reply is an anchor, never an insertion cursor.
export function orderMessages(messages,{observedKeys=[],prepend=false}={}) {
  const byKey=new Map(messages.map(m=>[m.key,m]));
  const children=new Map(messages.map(m=>[m.key,new Set()]));
  const parents=new Map(messages.map(m=>[m.key,new Set()]));
  const observed=observedKeys.filter(key=>byKey.has(key)),observedSet=new Set(observed);
  const add=(from,to)=>{
    if(from===to||!byKey.has(from)||!byKey.has(to)||children.get(from).has(to))return;
    // New DOM evidence wins over stale stored constraints. Reject an older edge
    // that would form a cycle, and persist only the reconciled acyclic graph.
    const pending=[to],seen=new Set();
    while(pending.length){const key=pending.pop();if(key===from)return;if(seen.has(key))continue;seen.add(key);pending.push(...children.get(key));}
    children.get(from).add(to);parents.get(to).add(from);
  };
  for(let i=1;i<observed.length;i++)add(observed[i-1],observed[i]);
  // Ordinals can be rebased when a host reveals older history. Compare only
  // positions from the same explicit numbering frame, never legacy bare ranks.
  const frames=new Map();
  for(const m of messages)if(m.positionFrame&&Number.isFinite(m.position)){
    if(!frames.has(m.positionFrame))frames.set(m.positionFrame,[]);frames.get(m.positionFrame).push(m);
  }
  for(const frame of frames.values()){
    frame.sort((a,b)=>a.position-b.position);
    for(let i=1;i<frame.length;i++)if(frame[i-1].position<frame[i].position)add(frame[i-1].key,frame[i].key);
  }
  for(const m of messages)for(const before of m.orderAfter??[])add(before,m.key);
  const indegree=new Map([...parents].map(([key,set])=>[key,set.size]));
  const priority=new Map(messages.map((m,index)=>[m.key,[prepend&&observedSet.has(m.key)?0:1,index]]));
  const less=(a,b)=>{const x=priority.get(a),y=priority.get(b);return x[0]<y[0]||(x[0]===y[0]&&x[1]<y[1]);};
  const heap=[];
  const push=key=>{heap.push(key);let i=heap.length-1;while(i){const p=(i-1)>>1;if(!less(heap[i],heap[p]))break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p;}};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&less(heap[c+1],heap[c]))c++;if(!less(heap[c],heap[i]))break;[heap[c],heap[i]]=[heap[i],heap[c]];i=c;}}return first;};
  for(const [key,count]of indegree)if(!count)push(key);
  const result=[];
  while(heap.length){
    const key=pop(),message=byKey.get(key);
    result.push({...message,order:result.length,orderAfter:[...parents.get(key)].sort()});
    for(const next of children.get(key)){const n=indegree.get(next)-1;indegree.set(next,n);if(!n)push(next);}
  }
  return result;
}
