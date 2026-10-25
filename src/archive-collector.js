import { chatURL, fingerprint } from './archive-model.js';
import {locateText} from './message-text.js';
import { visible } from './chatgpt-adapter.js';
import {passageTarget,passageRange} from './search-range.js';
import {State} from './model.js';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class ArchiveCollector {
  constructor(controller){this.controller=controller;this.saved=new Map();this.queue=Promise.resolve();}
  schedule(){
    if(!globalThis.chrome?.runtime?.id||this.timer)return;
    this.timer=setTimeout(()=>{this.timer=null;this.capture().catch(()=>{});},1200);
  }
  async capture(force=false){
    const controller=this.controller,url=chatURL(location.href);
    if(!url||!globalThis.chrome?.runtime?.id||controller.destroyed)return;
    if(!force&&this.suppressedURL===url)return;
    controller.syncSearch();
    const sources=(controller.liveSearchSources??[]).filter(source=>source.role==='prompt'||!controller.adapter.contains(controller.adapter.scope(source.element),controller.profile.streaming));
    const streaming=new Set((controller.liveSearchSources??[]).filter(s=>!sources.includes(s)).map(s=>s.archiveId));
    const messages=controller.threadHistory.messages.filter(m=>!streaming.has(m.nativeId));
    if(!messages.length)return;
    const title=document.title.replace(/\s*[-–|·]\s*(ChatGPT|Claude|Gemini)\s*$/i,'').trim()||messages.find(m=>m.role==='prompt')?.text.slice(0,100)||'Conversation';
    const signature=fingerprint(JSON.stringify([title,messages.map(({capturedAt,...m})=>m)]));
    if(!force&&this.saved.get(url)===signature)return;
    const snapshot={url,title,provider:controller.profile.name,messages,capturedAt:Date.now()};
    const manual=!!this.manualIndex;
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      const response=await chrome.runtime.sendMessage({type:'threadrail:library-save',snapshot,manual});
      if(response?.error)throw new Error(response.error);
      if(!response?.skipped)this.saved.set(url,signature);
      return response;
    });
    return this.queue;
  }
  async discover(){
    const controller=this.controller,found=new Map();
    if(!['chatgpt.com','chat.openai.com','claude.ai','gemini.google.com'].includes(location.hostname))return {chats:[]};
    const inTranscript=link=>!!link.closest(`${controller.profile.user}, ${controller.profile.assistant}`);
    const collect=()=>{
      for(const link of document.querySelectorAll('a[href]')){
        if(inTranscript(link)||!visible(link))continue;
        const url=chatURL(link.href);
        if(url&&new URL(url).origin===location.origin)found.set(url,{url,title:link.innerText.trim().slice(0,300)||'Conversation',provider:controller.profile.name});
      }
      const current=chatURL(location.href);
      if(current)found.set(current,{url:current,title:document.title,provider:controller.profile.name});
    };
    this.cancelled=false;
    collect();
    const scrollers=new Set();
    for(const link of document.querySelectorAll('a[href]')){
      if(!chatURL(link.href)||inTranscript(link)||!visible(link))continue;
      for(let parent=link.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
        if(/auto|scroll/.test(getComputedStyle(parent).overflowY)&&parent.scrollHeight>parent.clientHeight+2){scrollers.add(parent);break;}
      }
    }
    // Read the site's own sidebar list, including rows materialized on scroll.
    // No private endpoints, navigation clicks, or composer events are used.
    for(const scroller of scrollers){
      const original=scroller.scrollTop;let unchanged=0,last=-1;
      try{
        for(let step=0;step<60&&!controller.destroyed&&!this.cancelled;step++){
          await pause(200);collect();
          if(found.size===last)unchanged++;else unchanged=0;last=found.size;
          if(scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-2&&unchanged>=4)break;
          scroller.scrollTop+=Math.max(120,scroller.clientHeight*.8);
        }
      }finally{scroller.scrollTop=original;}
    }
    return {chats:[...found.values()]};
  }
  matching(target,requireMatch=true,refresh=true){
    const controller=this.controller;if(refresh){controller.refresh();controller.syncSearch();}
    const sources=(controller.liveSearchSources??[]).filter(source=>!source.isPassage&&source.role===target.role&&source.element?.isConnected);
    const keys=new Map([...controller.threadHistory.live].map(([key,source])=>[source.element,key]));
    const sameIdentity=source=>target.nativeId?(source.archiveId??source.id)===target.nativeId:!target.messageKey||keys.get(source.element)===target.messageKey;
    const candidates=sources.filter(sameIdentity);
    let source=candidates.find(source=>source.sourceText===target.sourceText)??candidates.find(source=>controller.adapter.sourceEvidence(source.element,target.sourceText).unchanged);
    source??=candidates.find(source=>locateText(source.text,target.matchText));
    // Position-only and ephemeral keys cannot identify a message after a new
    // virtualized window/reopen. Recover only a unique unchanged whole message.
    if(!source&&(!target.nativeId||/:conversation-turn-\d+[:]|:exchange-\d+[:]/.test(target.nativeId))){
      const exact=sources.filter(source=>controller.adapter.sourceEvidence(source.element,target.sourceText).unchanged);
      if(exact.length===1)source=exact[0];
    }
    if(!source&&!requireMatch&&candidates.length===1)source=candidates[0];
    if(!source)return null;
    const offset=locateText(source.text,target.matchText)?.start??-1;
    if(requireMatch&&offset<0)return null;
    // Carry durable identity into the landing transaction. Later samples must
    // bind this same message even if its DOM node or its paired prompt changes.
    return {...source,nativeId:source.archiveId??source.id,matchText:target.matchText,
      matchOffset:source.sourceText===target.sourceText?target.matchOffset:offset};
  }

  async scan(target){
    if(this.scanning)throw new Error('This chat is already being read.');
    this.scanning=true;this.finding=!!target;this.manualIndex=!target;this.cancelled=false;this.restoreOnCancel=false;
    const controller=this.controller,began=Date.now();let matched=null,visited=0;
    const scanURL=chatURL(location.href);
    const active=()=>!controller.destroyed&&!this.cancelled&&chatURL(location.href)===scanURL&&Date.now()-began<45000;
    try{
      while(active()&&Date.now()-began<12000){
        controller.refresh();controller.syncSearch();
        if(controller.liveSearchSources?.length&&controller.scroller)break;
        await pause(350);
      }
      if(!controller.liveSearchSources?.length)throw new Error('No messages were readable. Check sign-in and open this chat normally.');
      if(target&&(matched=this.matching(target)))return {matched};
      await this.capture(true);
      let quiet=0,last='';
      while(active()){
        controller.scroller.scrollTo({top:0,behavior:'instant'});
        controller.adapter.olderHistoryControl(controller.root)?.click();
        await pause(500);controller.refresh();
        await this.capture();visited++;
        if(target&&(matched=this.matching(target)))return {matched};
        const signature=fingerprint((controller.liveSearchSources??[]).map(s=>s.id+s.text).join('|'));
        quiet=signature===last&&!controller.adapter.historyLoading(controller.root,controller.scroller)&&!controller.adapter.olderHistoryControl(controller.root)?quiet+1:0;last=signature;
        if(quiet>=4)break;
      }
      quiet=0;
      while(active()){
        controller.refresh();await this.capture();visited++;
        if(target&&(matched=this.matching(target)))return {matched};
        const scroller=controller.scroller,before=scroller.scrollTop;
        const signature=fingerprint((controller.liveSearchSources??[]).map(s=>s.archiveId+s.text).join('|'));
        controller.adapter.advanceHistory(controller.root,scroller);
        await pause(350);
        controller.refresh();
        const atBottom=scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-3;
        const unchanged=signature===fingerprint((controller.liveSearchSources??[]).map(s=>s.archiveId+s.text).join('|'));
        quiet=atBottom&&unchanged&&Math.abs(scroller.scrollTop-before)<3?quiet+1:0;
        if(quiet>=4)break;
      }
      if(!this.cancelled&&chatURL(location.href)===scanURL)await this.capture(true);
      return {ok:!this.cancelled,partial:true,visited,cancelled:this.cancelled};
    }finally{this.scanning=false;this.finding=false;this.manualIndex=false;}
  }
  async jump(target){
    target=passageTarget(target);
    this.landingProof=null;
    if(chatURL(location.href)!==target.chatURL)throw new Error('The chat address changed.');
    const controller=this.controller,scroller=controller.scroller,originalTop=scroller?.scrollTop;
    const anchor=(controller.liveSearchSources??[]).find(s=>s.element?.isConnected&&s.element.getBoundingClientRect().bottom>controller.adapter.viewport(scroller).top);
    const anchorTop=anchor?.element.getBoundingClientRect().top;
    controller.setState(State.JUMPING);
    controller.ui.announce('Finding saved passage…',{persistent:true,action:'Cancel',onAction:()=>this.cancel({restore:true})});
    try{
    const result=await this.scan(target);
    if(result.matched){
      const evidence=controller.adapter.sourceEvidence(result.matched.element,target.sourceText);
      if(!evidence.unchanged){controller.ui.announce('This message changed. Search again.');return {ok:false,reason:'Original message text changed',...evidence};}
      // Preserve the complete canonical body proved at restoration, before
      // host status labels collapse or change during the landing itself.
      this.landingProof={saved:target.sourceText,canonical:result.matched.sourceText,
        url:target.chatURL,role:target.role,nativeId:result.matched.nativeId};
      const landing=await controller.jumpSearch({...result.matched,restored:true});
      return landing??{ok:false,reason:'Passage navigation was interrupted'};
    }
    if((!result.cancelled||this.restoreOnCancel)&&chatURL(location.href)===target.chatURL&&controller.scroller){
      const live=(controller.liveSearchSources??[]).find(s=>s.archiveId===anchor?.archiveId);
      const top=live?.element?.isConnected?live.element.getBoundingClientRect().top+controller.scroller.scrollTop-anchorTop:originalTop;
      controller.scroller.scrollTo({top:top??0,behavior:'instant'});
    }
    controller.ui.announce(result.cancelled?'Search stopped':'Couldn’t open this passage',{persistent:!result.cancelled,
      action:result.cancelled?undefined:'Retry',onAction:()=>this.jump(target).catch(()=>controller.ui.announce('Couldn’t open this passage'))});
    return {ok:false};
    }finally{
      if(controller.state===State.JUMPING&&!controller.jumpFrame){controller.setState(State.NAVIGATING);controller.measure();controller.armIdle();}
    }
  }
  async verify(target,expectedPassage){
    const controller=this.controller,deadline=Date.now()+10000;
    while(Date.now()<deadline&&(controller.jumpFrame||controller.state===State.JUMPING))await pause(100);
    if(controller.destroyed||controller.jumpFrame||controller.state===State.JUMPING)return {ok:false,reason:'Jump did not settle'};
    if(chatURL(location.href)!==target.chatURL)return {ok:false,reason:'Wrong chat opened'};
    const source=this.matching(passageTarget(target),false);
    if(!source)return {ok:false,reason:'Original message was not restored',sourceIdentity:false};
    const proof=this.landingProof;
    const bound=proof&&proof.saved===target.sourceText&&proof.url===target.chatURL&&proof.role===target.role&&
      (proof.nativeId===source.nativeId||!target.nativeId||/:exchange-\d+[:]/.test(target.nativeId));
    const evidence=bound?{unchanged:source.sourceText===proof.canonical,comparison:'restored-message',
      savedLength:proof.canonical.length,currentLength:source.sourceText.length}:controller.adapter.sourceEvidence(source.element,target.sourceText);
    if(!evidence.unchanged)return {ok:false,reason:'Original message text changed',sourceIdentity:true,sourceUnchanged:false,...evidence,
      savedFingerprint:fingerprint(target.sourceText),currentFingerprint:fingerprint(source.sourceText)};
    const first=source.text.indexOf(expectedPassage);
    if(first>=0&&source.text.indexOf(expectedPassage,first+expectedPassage.length)>=0)return {ok:false,reason:'Expected passage repeats in this message. Use a longer quote.'};
    const range=passageRange(source.element,expectedPassage,source.text.indexOf(expectedPassage));
    if(!range)return {ok:false,reason:'Expected passage is missing from the original message'};
    const viewport=controller.adapter.viewport(controller.scroller),rect=range.getBoundingClientRect();
    const headerBottom=viewport.top+Math.max(0,controller.inset-16);
    const lines=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);
    const visible=lines.length>0&&lines.every(r=>r.top>=headerBottom-1&&r.bottom<=viewport.bottom+1&&r.left>=viewport.left-1&&r.right<=viewport.right+1);
    return {ok:visible,reason:visible?undefined:'Expected passage is outside the readable viewport',
      chatURL:chatURL(location.href),role:source.role,sourceIdentity:true,sourceUnchanged:true,comparison:evidence.comparison,textFound:true,
      top:rect.top,bottom:rect.bottom,headerBottom,viewportBottom:viewport.bottom};
  }
  cancel({restore=false}={}){this.controller.cancelJump();this.cancelled=true;this.restoreOnCancel=restore;this.manualIndex=false;}
  destroy(){clearTimeout(this.timer);this.cancel();this.landingProof=null;}
}
