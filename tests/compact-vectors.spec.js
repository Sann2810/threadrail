import {test,expect} from '@playwright/test';

test('vectors are stored compressed with a guaranteed range, per chat, for one model version only',async({page})=>{
  await page.goto('/');
  const proof=await page.evaluate(async()=>{
    await new Promise(resolve=>{const request=indexedDB.deleteDatabase('threadrail-library');request.onsuccess=request.onerror=request.onblocked=resolve;});
    // An existing version 3 library with batched number-array vectors.
    const text='Zen kept the tea warm while the kettle cooled on the window ledge.';
    const raw=Array.from({length:384},(_,i)=>Math.sin(i+1)),norm=Math.hypot(...raw),vector=raw.map(n=>Math.fround(n/norm));
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('threadrail-library',3);
      request.onupgradeneeded=()=>{const d=request.result;d.createObjectStore('chats',{keyPath:'url'});d.createObjectStore('vectors',{keyPath:'id'}).createIndex('chatURL','chatURL');d.createObjectStore('meta');};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const url='https://chatgpt.com/c/compact',other='https://claude.ai/chat/other';
    await new Promise(resolve=>{const tx=db.transaction(['chats','vectors'],'readwrite');
      tx.objectStore('chats').put({url,title:'Compact',provider:'ChatGPT',firstSeen:1,updatedAt:100,messages:[{key:'native:a:0',nativeId:'a',role:'answer',text,order:0}]});
      tx.objectStore('chats').put({url:other,title:'Other',provider:'Claude',firstSeen:2,updatedAt:200,messages:[]});
      tx.objectStore('vectors').put({id:`${url}::native:a:0:0`,chatURL:url,embeddingText:text,embeddingVersion:'batched',vector});
      tx.oncomplete=resolve;});db.close();

    const store=await import('/src/archive-store.js'),{SearchIndex,vectorTextKey}=await import('/src/search-index.js'),{SEARCH_MODEL}=await import('/src/search-model.js');
    const oldVectorsDropped=(await store.readVectors()).length===0,chatsKept=(await store.allChats()).length;
    const current=SEARCH_MODEL.embeddingVersion,now=Date.now();
    await store.writeVectors([
      {id:`${url}::native:a:0:0`,chatURL:url,embeddingText:text,embeddingVersion:current,vector,savedAt:now},
      {id:`${other}::x:0`,chatURL:other,embeddingText:'other',embeddingVersion:current,vector,savedAt:now},
      {id:`${url}::stale`,chatURL:url,embeddingText:'stale',embeddingVersion:'another-model',vector,savedAt:now}]);
    const records=await store.readVectors(url),[record]=records;
    const error=Math.max(...vector.map((n,i)=>Math.abs(n-record.scale*record.q[i])));
    const index=new SearchIndex(SEARCH_MODEL);
    index.sync([{id:`${url}::native:a:0`,exchangeId:'a',role:'answer',text,context:''}]);
    index.restoreVectors(records.map(r=>({...r,q:Array.from(r.q)})));      // as sent to a chat page
    const restored=index.documents.find(d=>!d.isFine);
    const since=(await store.chatsUpdatedSince(150)).map(chat=>chat.url),urls=(await store.chatURLs()).sort();
    await store.forgetChats(url);
    const afterForget=(await store.readVectors(url)).length,otherKept=(await store.readVectors(other)).length;
    // A different model version makes saved vectors unusable: none are returned.
    const raw2=await new Promise(resolve=>{const r=indexedDB.open('threadrail-library',4);r.onsuccess=()=>resolve(r.result);});
    await new Promise(resolve=>{const tx=raw2.transaction('meta','readwrite');tx.objectStore('meta').put('older-model','vectorVersion');tx.oncomplete=resolve;});raw2.close();
    const afterVersionChange=(await store.readVectors()).length;
    return {oldVectorsDropped,chatsKept,count:records.length,fields:Object.keys(record).sort(),bytes:record.q instanceof Int8Array&&record.q.length===384,
      withinRange:error<=record.scale/2+1e-9,keyMatches:record.textKey===vectorTextKey(text),
      restoredCompressed:!restored.vector&&restored.approx?.q.length===384&&restored.approx.scale===record.scale,
      since,urls,afterForget,otherKept,afterVersionChange};
  });
  expect(proof.oldVectorsDropped).toBe(true);expect(proof.chatsKept).toBe(2);
  expect(proof.count).toBe(1);
  expect(proof.fields).toEqual(['id','q','residual','scale','textKey']);
  expect(proof.bytes).toBe(true);expect(proof.withinRange).toBe(true);expect(proof.keyMatches).toBe(true);
  expect(proof.restoredCompressed).toBe(true);
  expect(proof.since).toEqual(['https://claude.ai/chat/other']);
  expect(proof.urls).toEqual(['https://chatgpt.com/c/compact','https://claude.ai/chat/other']);
  expect(proof.afterForget).toBe(0);expect(proof.otherKept).toBe(1);
  expect(proof.afterVersionChange).toBe(0);
});
