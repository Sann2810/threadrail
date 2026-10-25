import {mergeMessages,normalizeArchiveMessages} from './archive-model.js';
import {vectorTextKey,quantizeVector} from './search-index.js';
import {SEARCH_MODEL} from './search-model.js';
// Vectors are stored compressed: one byte per number plus a scale, a quarter of
// a Float32Array. Searches recompute exact vectors only for close calls. The
// embedded text is identified by key instead of being stored a second time, a
// chat's vectors are found by their id prefix, and the model version is kept
// once in meta: vectors from another version are cleared, never mixed.
const compactVector = record => ({id:record.id,textKey:record.textKey??vectorTextKey(record.embeddingText),...quantizeVector(record.vector)});
const chatRange = url => IDBKeyRange.bound(`${url}::`,`${url}::￿`);
let connection;
export function archiveDB() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('threadrail-library', 4);
    request.onupgradeneeded = event => {
      const db=request.result;
      if(!db.objectStoreNames.contains('chats'))db.createObjectStore('chats', {keyPath:'url'});
      if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');
      // Earlier vectors came from batched embedding and a larger format; they
      // are rebuilt rather than mixed with one-at-a-time vectors.
      if(event.oldVersion<4){
        if(db.objectStoreNames.contains('vectors'))db.deleteObjectStore('vectors');
        db.createObjectStore('vectors', {keyPath:'id'});
      }
      const chats=request.transaction.objectStore('chats');
      if(!chats.indexNames.contains('updatedAt'))chats.createIndex('updatedAt','updatedAt');
    };
    request.onsuccess = () => { request.result.onversionchange = () => {request.result.close();connection=null;};resolve(request.result); };
    request.onerror = () => {connection=null;reject(request.error);};
  });
  return connection;
}
const resultOf = request => new Promise((resolve,reject) => {request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
export async function allChats() {
  const db=await archiveDB(),chats=await resultOf(db.transaction('chats').objectStore('chats').getAll());
  return chats.map(chat=>({...chat,messages:normalizeArchiveMessages(chat.messages??[])}));
}
// Incremental reloads: which chats exist, and which changed after a time.
export async function chatURLs(){const db=await archiveDB();return resultOf(db.transaction('chats').objectStore('chats').getAllKeys());}
export async function chatsUpdatedSince(time){
  const db=await archiveDB(),chats=await resultOf(db.transaction('chats').objectStore('chats').index('updatedAt').getAll(IDBKeyRange.lowerBound(time)));
  return chats.map(chat=>({...chat,messages:normalizeArchiveMessages(chat.messages??[])}));
}
export async function readChat(url){const db=await archiveDB(),chat=await resultOf(db.transaction('chats').objectStore('chats').get(url));return chat?{...chat,messages:normalizeArchiveMessages(chat.messages??[])}:undefined;}
export async function saveChat(snapshot) {
  const db=await archiveDB(),capturedAt=snapshot.capturedAt??Date.now();
  return new Promise((resolve,reject) => {
    const transaction=db.transaction(['chats','meta'],'readwrite'),store=transaction.objectStore('chats'),meta=transaction.objectStore('meta');
    let record;
    const cleared=meta.get('clearedAt'),forgotten=meta.get(`forgot:${snapshot.url}`);
    forgotten.onsuccess=()=>{
      // A snapshot collected before Remove/Clear cannot resurrect local text.
      if(capturedAt<=Math.max(cleared.result??0,forgotten.result??0))return;
      const get=store.get(snapshot.url);
      get.onsuccess=()=>{
        const old=get.result;
        record={...old,...snapshot,firstSeen:old?.firstSeen??Date.now(),updatedAt:Date.now(),
          messages:mergeMessages(normalizeArchiveMessages(old?.messages??[]),normalizeArchiveMessages(snapshot.messages??[]),{observed:false}),partial:true};
        store.put(record);
      };
    };
    transaction.oncomplete=()=>resolve(record?{url:record.url,messages:record.messages.length}:{skipped:true});
    transaction.onerror=()=>reject(transaction.error);
    transaction.onabort=()=>reject(transaction.error??new Error('Local library write failed'));
  });
}
export async function forgetChats(url) {
  const db=await archiveDB();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(['chats','vectors','meta'],'readwrite');
    if(url) {
      transaction.objectStore('meta').put(Date.now(),`forgot:${url}`);
      transaction.objectStore('chats').delete(url);
      transaction.objectStore('vectors').delete(chatRange(url));
    } else {transaction.objectStore('chats').clear();transaction.objectStore('vectors').clear();transaction.objectStore('meta').clear();transaction.objectStore('meta').put(Date.now(),'clearedAt');}
    transaction.oncomplete=()=>{
      if(globalThis.chrome?.runtime?.id)chrome.runtime.sendMessage({type:'threadrail:library-forgotten',url,at:Date.now()}).catch(()=>{}).finally(resolve);
      else resolve();
    };transaction.onerror=()=>reject(transaction.error);
  });
}
// Saved vectors ({id,textKey,scale,q}) of one chat, or of all chats; none when
// they were made by another model version.
export async function readVectors(url) {
  const db=await archiveDB(),transaction=db.transaction(['vectors','meta']),store=transaction.objectStore('vectors');
  const version=await resultOf(transaction.objectStore('meta').get('vectorVersion'));
  if(version!==SEARCH_MODEL.embeddingVersion)return [];
  return resultOf(url?store.getAll(chatRange(url)):store.getAll());
}
export async function writeVectors(documents) {
  const db=await archiveDB();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(['vectors','meta'],'readwrite'),store=transaction.objectStore('vectors'),meta=transaction.objectStore('meta');
    const cleared=meta.get('clearedAt'),version=meta.get('vectorVersion');
    version.onsuccess=()=>{
      if(version.result!==SEARCH_MODEL.embeddingVersion){store.clear();meta.put(SEARCH_MODEL.embeddingVersion,'vectorVersion');}
      for(const document of documents) if(document.vector&&document.embeddingVersion===SEARCH_MODEL.embeddingVersion){
        const forgotten=meta.get(`forgot:${document.chatURL}`);
        forgotten.onsuccess=()=>{if((document.savedAt??0)>Math.max(cleared.result??0,forgotten.result??0))store.put(compactVector(document));};
      }
    };
    transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
  });
}
