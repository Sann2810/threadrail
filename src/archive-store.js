import {mergeMessages,normalizeArchiveMessages} from './archive-model.js';
let connection;
export function archiveDB() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('threadrail-library', 3);
    request.onupgradeneeded = () => {
      if(!request.result.objectStoreNames.contains('chats'))request.result.createObjectStore('chats', {keyPath:'url'});
      if(!request.result.objectStoreNames.contains('vectors'))request.result.createObjectStore('vectors', {keyPath:'id'});
      if(!request.result.objectStoreNames.contains('meta'))request.result.createObjectStore('meta');
      const vectors=request.transaction.objectStore('vectors');
      if(!vectors.indexNames.contains('chatURL'))vectors.createIndex('chatURL','chatURL');
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
      const request=transaction.objectStore('vectors').openCursor();
      request.onsuccess=()=>{const cursor=request.result;if(cursor){if(cursor.value.chatURL===url)cursor.delete();cursor.continue();}};
    } else {transaction.objectStore('chats').clear();transaction.objectStore('vectors').clear();transaction.objectStore('meta').clear();transaction.objectStore('meta').put(Date.now(),'clearedAt');}
    transaction.oncomplete=()=>{
      if(globalThis.chrome?.runtime?.id)chrome.runtime.sendMessage({type:'threadrail:library-forgotten',url,at:Date.now()}).catch(()=>{}).finally(resolve);
      else resolve();
    };transaction.onerror=()=>reject(transaction.error);
  });
}
export async function readVectors(url) {
  const db=await archiveDB(),store=db.transaction('vectors').objectStore('vectors');
  return resultOf(url?store.index('chatURL').getAll(url):store.getAll());
}
export async function writeVectors(documents) {
  const db=await archiveDB();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(['vectors','meta'],'readwrite'),store=transaction.objectStore('vectors'),meta=transaction.objectStore('meta');
    const cleared=meta.get('clearedAt');
    for(const document of documents) if(document.vector){
      const forgotten=meta.get(`forgot:${document.chatURL}`);
      forgotten.onsuccess=()=>{if((document.savedAt??0)>Math.max(cleared.result??0,forgotten.result??0))store.put({id:document.id,chatURL:document.chatURL,embeddingText:document.embeddingText,embeddingVersion:document.embeddingVersion,vector:document.vector});};
    }
    transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
  });
}
