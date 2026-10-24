import {snapshotMessages,mergeMessages,normalizeArchiveMessages} from './archive-model.js';
import {isUnavailableResponse} from './search-text.js';

// Text belongs to the conversation; an element is only a temporary binding to
// its currently rendered window. Never keep detached DOM subtrees in history.
export class ThreadHistory {
  constructor(url){this.url=url;this.messages=[];this.live=new Map();}
  observe(sources,{prepend=false}={}){
    const whole=sources.filter(s=>!s.isPassage&&s.text.trim()&&(s.role!=='answer'||!isUnavailableResponse(s.text))),incoming=snapshotMessages(whole);
    const bindings=new Map([...this.live].map(([key,source])=>[source.element,key]));
    for(const [i,message] of incoming.entries()){
      const old=bindings.get(whole[i].element);
      if(old&&!message.nativeId)message.key=old;
    }
    const groups=new Map(incoming.filter(m=>m.role==='prompt').map(m=>[m.exchangeId,m.key]));
    for(const message of incoming)message.groupKey=groups.get(message.exchangeId)??this.messages.find(m=>m.key===message.key)?.groupKey??message.key;
    this.live=new Map(incoming.map((m,i)=>[m.key,whole[i]]));
    this.messages=mergeMessages(this.messages,incoming,{prepend});
    return this.sources();
  }
  restore(messages){this.messages=mergeMessages(normalizeArchiveMessages(messages),this.messages,{observed:false});return this.sources();}
  sources(){
    return this.messages.map(m=>{
      const live=this.live.get(m.key),element=live?.element?.isConnected?live.element:null;
      return {id:`${this.url}::${m.key}`,exchangeId:m.groupKey??m.key,liveExchangeId:live?.exchangeId,
        searchGroup:m.groupKey??m.key,chatURL:this.url,
        messageKey:m.key,nativeId:m.nativeId,role:m.role,text:m.text,sourceText:m.text,
        inputText:m.inputText,context:m.context??'',blockRanges:m.blockRanges,
        element,savedAt:m.capturedAt,retained:!element};
    });
  }
}
