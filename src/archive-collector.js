import {waitForHost} from './host-readiness.js';
import {RestorationTrace} from './restoration-trace.js';
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
    this.scanTrace?.observe(sources,controller);
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
    const trace=target?new RestorationTrace(target):null;this.scanTrace=trace;
    const scanURL=chatURL(location.href);
    const active=()=>!controller.destroyed&&!this.cancelled&&chatURL(location.href)===scanURL&&Date.now()-began<45000;
    try{
      const initialized=await waitForHost({active,read:()=>{
        controller.refresh();controller.syncSearch();
        const sources=(controller.liveSearchSources??[]).filter(source=>source.element?.isConnected),scroller=controller.scroller;
        if(trace)trace.observe(sources.filter(source=>source.role===target.role),controller);
        const rect=scroller&&controller.adapter.viewport(scroller);
        // An answer still being written keeps growing the transcript (and may
        // scroll it); that is not the host starting up, so leave it out.
        const streaming=new Set(sources.filter(source=>source.role==='answer'&&controller.adapter.contains(controller.adapter.scope(source.element),controller.profile.streaming)));
        return {ready:!!sources.length&&!!scroller&&rect.height>0&&document.fonts?.status!=='loading'&&
          !controller.adapter.historyLoading(controller.root,scroller),
          signature:JSON.stringify([streaming.size?null:scroller?.scrollTop,streaming.size?null:scroller?.scrollHeight,rect?.height,rect?.top,
            sources.map(source=>[source.archiveId??source.id,streaming.has(source)?null:source.sourceText.length])])};
      },...(performance.now()>10000?{minimum:0,quiet:300}:{})});
      // No readable message is an error (signed out, or not a chat), so a
      // library scan reports it instead of counting the chat as added.
      if(!initialized.ok&&!this.cancelled&&!controller.liveSearchSources?.length)throw new Error('No messages were readable. Check sign-in and open this chat normally.');
      // A jump needs a settled host; indexing reads whatever is readable.
      if(!initialized.ok&&(target||this.cancelled))return {ok:false,partial:true,cancelled:this.cancelled,reason:initialized.reason,
        restoration:trace?.summary('initialization-not-settled')};
      if(target&&(matched=this.matching(target)))return {matched,restoration:trace?.summary('matched')};
      this.capture(true).catch(()=>{});
      if(trace)trace.phase='earlier';
      // Nothing older arrives and the host shows no loader or older-history button.
      const historySignature=()=>`${controller.scroller.scrollHeight}|${fingerprint((controller.liveSearchSources??[]).map(s=>s.id+s.text).join('|'))}`;
      const historyPending=()=>controller.adapter.historyLoading(controller.root,controller.scroller)||!!controller.adapter.olderHistoryControl(controller.root);
      // Some hosts (Gemini) show no loader and deliver the next batch of older
      // history only after a couple of seconds, so history counts as ended
      // only after several quiet checks spanning at least five seconds.
      let quiet=0,last='',changed=Date.now();
      const ended=signature=>{
        if(signature!==last||historyPending()){quiet=0;changed=Date.now();}else quiet++;
        last=signature;return quiet>=4&&Date.now()-changed>=5000;
      };
      // Where the passage sits in the saved conversation (0 = first message,
      // 1 = latest) decides where to search first. Either way the whole chat
      // is still covered.
      const saved=controller.threadHistory?.messages??[];
      const position=target?saved.findIndex(m=>m.key===target.messageKey||(target.nativeId&&m.nativeId===target.nativeId)):-1;
      const fraction=position>=0&&saved.length>1?position/(saved.length-1):null;
      if(target&&(fraction===null||fraction>=.75)){
        // Search outward from where the chat opened. Virtualized hosts draw only
        // rows near the viewport, so a passage just above the opening position
        // is found within a few steps instead of after a walk down the whole
        // chat from its first message. At the top, ask the host for older
        // messages until none arrive; then cover what lies below the start.
        const fromBottom=controller.scroller.scrollHeight-controller.scroller.scrollTop;
        while(active()){
          const scroller=controller.scroller,atTop=scroller.scrollTop<=2;
          if(atTop){scroller.scrollTo({top:0,behavior:'instant'});controller.adapter.requestOlderHistory(controller.root,scroller);}
          else controller.adapter.retreatHistory(controller.root,scroller);
          await pause(atTop?400:250);visited++;
          if(matched=this.matching(target))return {matched,restoration:trace?.summary('matched')};
          if(!atTop){quiet=0;changed=Date.now();continue;}
          const signature=historySignature();
          if(ended(signature))break;
        }
        if(active())controller.scroller.scrollTo({top:Math.max(0,controller.scroller.scrollHeight-fromBottom),behavior:'instant'});
      }else{
        // Indexing, or a passage before the newest quarter: stay at the top and
        // take each batch of older history as the host delivers it (hosts load
        // the next batch only while the top is in view).
        let probed=false;
        while(active()){
          controller.scroller.scrollTo({top:0,behavior:'instant'});
          controller.adapter.requestOlderHistory(controller.root,controller.scroller);
          await this.batchArrival(()=>controller.scroller.scrollHeight,historyPending);visited++;
          if(target){
            if(matched=this.matching(target))return {matched,restoration:trace?.summary('matched')};
            // Once the oldest drawn message is at or before the passage, the
            // passage is loaded: look for it now instead of loading the rest of
            // the history first. If that look fails, loading goes on as before.
            const loaded=!probed&&this.loadedFraction(target);
            if(loaded){probed=true;if(matched=await this.probeFrom(loaded.fraction,target,active))return {matched,restoration:trace?.summary('matched')};last='';quiet=0;changed=Date.now();continue;}
          }
          else{controller.refresh();await this.capture();}
          const signature=historySignature();
          if(ended(signature))break;
        }
        // With the whole history loaded, look where the passage should be:
        // the same fraction of the transcript as of the saved conversation.
        if(target&&active()&&(matched=await this.probeFrom(fraction,target,active)))return {matched,restoration:trace?.summary('matched')};
      }
      if(trace)trace.phase='forward';
      quiet=0;
      while(active()){
        // Saving every window is for indexing; a jump only needs to find its passage.
        controller.refresh();if(!target)await this.capture();visited++;
        if(target&&(matched=this.matching(target)))return {matched,restoration:trace?.summary('matched')};
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
      return {ok:!this.cancelled,partial:true,visited,cancelled:this.cancelled,
        restoration:trace?.summary(this.cancelled?'cancelled':chatURL(location.href)!==scanURL?'address-changed':Date.now()-began>=45000?'deadline':'end-of-readable-history')};
    }finally{this.scanTrace=null;this.scanning=false;this.finding=false;this.manualIndex=false;}
  }
  // Wait up to half a second for the host's next batch of older history:
  // return as soon as it has arrived and stopped changing.
  async batchArrival(signature,pending,limit=500){
    const began=Date.now(),first=signature();let last=first,stable=Date.now();
    while(Date.now()-began<limit){
      await pause(50);
      const now=signature();if(now!==last){last=now;stable=Date.now();}
      if(last!==first&&!pending()&&Date.now()-stable>=100)return true;
    }
    return last!==first;
  }
  // Where the passage sits among the loaded messages, once the oldest drawn
  // message is at or before it in the saved conversation; otherwise null.
  loadedFraction(target){
    const controller=this.controller,messages=controller.threadHistory?.messages??[];
    const index=new Map(messages.map((m,i)=>[m.key,i]));
    const position=messages.findIndex(m=>m.key===target.messageKey||(target.nativeId&&m.nativeId===target.nativeId));
    const drawn=[...controller.threadHistory.live.keys()].map(key=>index.get(key)).filter(Number.isInteger);
    if(position<0||!drawn.length)return null;
    const oldest=Math.min(...drawn),last=messages.length-1;
    if(oldest>position)return null;
    return {fraction:last>oldest?(position-oldest)/(last-oldest):0};
  }
  // Search outward from an estimated place, alternating up and down. Each probe
  // covers every message the host has drawn around the viewport, and the next
  // probe starts where that coverage ends, so no part is skipped. In a very
  // long transcript this reaches a passage in the middle without walking to
  // it from either end.
  async probeFrom(fraction,target,active){
    const controller=this.controller,selector=`${controller.profile.user}, ${controller.profile.assistant}`;
    const covered=()=>{
      const scroller=controller.scroller,viewport=controller.adapter.viewport(scroller),top=scroller.scrollTop;
      const rects=[...controller.root.querySelectorAll(selector)].filter(node=>visible(node)&&!node.parentElement?.closest(selector))
        .map(node=>controller.adapter.anchor(node).getBoundingClientRect());
      return [Math.min(top,...rects.map(r=>r.top-viewport.top+top)),Math.max(top+viewport.height,...rects.map(r=>r.bottom-viewport.top+top))];
    };
    const scroller=controller.scroller,end=()=>Math.max(0,scroller.scrollHeight-scroller.clientHeight);
    scroller.scrollTo({top:Math.max(0,(fraction??1)*end()-scroller.clientHeight/2),behavior:'instant'});
    await pause(300);
    let matched=this.matching(target);if(matched)return matched;
    let [low,high]=covered(),upward=true;
    while(active()&&(low>0||high<scroller.scrollHeight)){
      const up=low>0&&(high>=scroller.scrollHeight||upward);upward=!upward;
      scroller.scrollTo({top:up?Math.max(0,low-scroller.clientHeight+40):Math.min(end(),high-40),behavior:'instant'});
      await pause(250);
      if(matched=this.matching(target))return matched;
      const [a,b]=covered(),grew=a<low||b>high;
      low=Math.min(low,a);high=Math.max(high,b);
      // Nothing new drawn there: move on by a screen so the probe still advances.
      if(!grew){if(up)low=Math.max(0,low-scroller.clientHeight);else high+=scroller.clientHeight;}
    }
    return null;
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
    // Show the saved text right away; it stays if the passage cannot be opened.
    controller.ui.showPassage(target);
    try{
    const result=await this.scan(target);
    if(result.matched||result.cancelled)controller.ui.hidePassage();
    if(result.matched){
      const evidence=controller.adapter.sourceEvidence(result.matched.element,target.sourceText);
      if(!evidence.unchanged){controller.ui.announce('This message changed. Search again.');return {ok:false,reason:'Original message text changed',...evidence};}
      // Preserve the complete canonical body proved at restoration, before
      // host status labels collapse or change during the landing itself.
      this.landingProof={saved:target.sourceText,canonical:result.matched.sourceText,
        url:target.chatURL,role:target.role,nativeId:result.matched.nativeId};
      const landing=await controller.jumpSearch({...result.matched,restored:true});
      return {...(landing??{ok:false,reason:'Passage navigation was interrupted'}),restoration:result.restoration};
    }
    if((!result.cancelled||this.restoreOnCancel)&&chatURL(location.href)===target.chatURL&&controller.scroller){
      const live=(controller.liveSearchSources??[]).find(s=>s.archiveId===anchor?.archiveId);
      const top=live?.element?.isConnected?live.element.getBoundingClientRect().top+controller.scroller.scrollTop-anchorTop:originalTop;
      controller.scroller.scrollTo({top:top??0,behavior:'instant'});
    }
    controller.ui.announce(result.cancelled?'Search stopped':'Couldn’t open this passage',{persistent:!result.cancelled,
      action:result.cancelled?undefined:'Retry',onAction:()=>this.jump(target).catch(()=>controller.ui.announce('Couldn’t open this passage'))});
    return {ok:false,reason:result.reason??(result.cancelled?'Search stopped':'The saved passage could not be restored.'),restoration:result.restoration};
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
