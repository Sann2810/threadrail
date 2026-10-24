import {orderMessages} from './message-order.js';
import { isUnavailableResponse } from './search-text.js';
// Persistent identities and snapshot merging are shared by collection and retrieval.
export const fingerprint = text => {
  let a = 2166136261, b = 2246822507;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b ^ text.charCodeAt(i), 3266489909); }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
};
export function normalizeArchiveMessages(messages){
  const result=[],positions=new Map();
  for(const source of messages){
    let message=source;
    // Earlier builds numbered Claude's answer relative to whichever prompt
    // happened to remain loaded. Its UUID identifies the actual row instead.
    if(/^claude:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?:-hub-reply)?:answer:\d+$/i.test(source.nativeId??'')){
      const nativeId=source.nativeId.replace(/:answer:\d+$/,':answer:0');
      const key=source.key.replace(`native:${source.nativeId}:`,`native:${nativeId}:`);
      message={...source,nativeId,key,groupKey:source.groupKey===source.key?key:source.groupKey};
    }
    const found=positions.get(message.key);
    if(found===undefined){positions.set(message.key,result.length);result.push(message);}
    else result[found]=message;
  }
  return orderMessages(result);
}
export function chatURL(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const path = url.pathname.replace(/\/+$/, '');
    const rules = {
      'chatgpt.com': /^(?:\/(?:g\/[^/]+\/)?c\/[^/]+|\/codex\/tasks\/[^/]+)$/,
      'chat.openai.com': /^\/(?:g\/[^/]+\/)?c\/[^/]+$/,
      'claude.ai': /^\/(?:chat|code)\/[^/]+$/,
      'gemini.google.com': /^\/(?:u\/\d+\/)?app\/[^/]+$/,
    };
    if (rules[url.hostname] ? !rules[url.hostname].test(path) : !path) return null;
    return `${url.origin}${path}${rules[url.hostname] ? '' : url.search}`;
  } catch { return null; }
}
export function snapshotMessages(sources) {
  const whole = sources.filter(source => !source.isPassage && source.text.trim() && (source.role !== 'answer' || !isUnavailableResponse(source.text)));
  const used = new Map();
  return whole.map((source, order) => {
    const candidate = source.archiveId ?? source.id;
    const nativeId = /:exchange-\d+(?=:|$)/.test(candidate) ? null : candidate;
    // Repeated prompts are disambiguated by their following answer when the host
    // doesn't provide a durable message ID. Whole messages retain their order.
    const next = source.role === 'prompt' && whole[order + 1]?.role === 'answer' ? whole[order + 1].text : '';
    const context=source.role==='prompt'?next:source.context||(source.inputText==='Earlier answer'?'':source.inputText)||'';
    const base = nativeId ? `native:${nativeId}` : Number.isFinite(source.position)?`position:${source.position}:${source.role}`: `text:${fingerprint(`${source.role}\n${source.text}\n${context}`)}`;
    const occurrence = used.get(base) ?? 0; used.set(base, occurrence + 1);
    return { key: `${base}:${occurrence}`, nativeId, role: source.role, text: source.text,
      inputText: source.inputText, context: source.context ?? '', pending: source.role === 'prompt' && !next, order,
      exchangeId:source.exchangeId,blockRanges:source.blockRanges,position:source.position,positionFrame:Number.isFinite(source.position)?source.positionFrame??'position':undefined,capturedAt:source.capturedAt??Date.now() };
  });
}
export function mergeMessages(previous, incoming, {prepend=false,observed=true}={}) {
  const result = previous.map(message => ({...message}));
  const firstAnchor = incoming.map(message => result.findIndex(item => item.key === message.key)).find(index => index >= 0);
  let cursor = prepend?0:firstAnchor??result.length;
  const processed = new Set();
  for (const message of incoming) {
    let found = result.findIndex(item => item.key === message.key);
    if(found<0&&!message.nativeId&&message.role==='answer'){
      const candidates=result.map((item,i)=>({item,i})).filter(({item})=>!item.nativeId&&item.role==='answer'&&item.text===message.text&&item.inputText===message.inputText&&!processed.has(item.key));
      if(candidates.length===1)found=candidates[0].i;
    }
    if (found < 0 && message.role === 'prompt' && !message.nativeId && !message.pending) {
      found = result.findIndex(item => item.pending && !item.nativeId && !processed.has(item.key) && item.role === 'prompt' && item.text === message.text);
    }
    if (found >= 0) {
      const old=result[found];
      result[found] = {...message,
        orderAfter:[...new Set([...(old.orderAfter??[]),...(message.orderAfter??[])])],
        capturedAt:old.text===message.text?old.capturedAt:message.capturedAt,
        pending:old.text===message.text&&old.pending===false?false:message.pending,
        inputText:message.inputText==='Earlier answer'?old.inputText:message.inputText,
        context:message.context||old.context,
        exchangeId:message.exchangeId?.startsWith('unpaired:')?old.exchangeId??message.exchangeId:message.exchangeId};
      cursor = found + 1;
    }
    else {
      const position=Number.isFinite(message.position)?result.findIndex(item=>item.positionFrame===message.positionFrame&&Number.isFinite(item.position)&&item.position>message.position):-1;
      const at=position>=0?position:cursor;
      result.splice(at, 0, {...message});cursor=at+1;
    }
    processed.add(message.key);
  }
  return orderMessages(result,{observedKeys:observed?incoming.map(m=>m.key):[],prepend});
}
export function archiveSources(chats) {
  return chats.flatMap(chat => normalizeArchiveMessages(chat.messages ?? []).filter(message => message.role !== 'answer' || !isUnavailableResponse(message.text)).map(message => ({
    id: `${chat.url}::${message.key}`, exchangeId: `${chat.url}::${message.key}`,
    chatURL: chat.url, chatTitle: chat.title, provider: chat.provider,
    messageKey: message.key, nativeId: message.nativeId, role: message.role,
    text: message.text, sourceText: message.text, inputText: message.inputText,
    context: message.context ?? '', savedAt: chat.updatedAt,
    blockRanges:message.blockRanges,
  })));
}
