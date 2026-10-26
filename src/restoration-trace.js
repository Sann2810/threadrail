import {fingerprint} from './archive-model.js';
// Diagnostic observations never choose a result or relax a source/range check.
// Keep text in this short-lived object only; summary() exports counts/hashes.
export class RestorationTrace {
  constructor(target,now=()=>Date.now()){
    this.target=target;this.now=now;this.began=now();this.phase='waiting';this.observed=new Map();this.windows=0;this.compactSource=target.sourceText.replace(/\s+/g,'');
  }
  observe(sources,controller){
    const target=this.target;
    for(const source of sources){
      const id=source.archiveId??source.id,old=this.observed.get(id);
      if(old?.text===source.sourceText)continue;
      const identity=target.nativeId?id===target.nativeId:undefined;
      this.observed.set(id,{text:source.sourceText,identity:identity||old?.identity,
        whole:old?.whole||source.sourceText===target.sourceText,
        excerpt:old?.excerpt||source.text.includes(target.matchText),
        // Whitespace equivalence is evidence only, never a source acceptance rule.
        compactWhole:old?.compactWhole||source.sourceText.replace(/\s+/g,'')===this.compactSource});
    }
    const s=controller.scroller;
    this.last={messages:sources.length,scrollTop:s?.scrollTop??null,scrollHeight:s?.scrollHeight??null,
      viewportHeight:s?.clientHeight??null,historyLoading:!!(s&&controller.adapter.historyLoading(controller.root,s)),
      earlierControl:!!controller.adapter.olderHistoryControl(controller.root),visibility:document.visibilityState};
    this.windows++;
  }
  summary(stop){
    const rows=[...this.observed.values()];
    return {phase:this.phase,stop,elapsedMs:this.now()-this.began,observations:this.windows,observedMessages:rows.length,
      nativeIdentityProvided:!!this.target.nativeId,identitySeen:rows.some(r=>r.identity),unchangedIdentitySeen:rows.some(r=>r.identity&&r.whole),
      excerptInIdentitySeen:rows.some(r=>r.identity&&r.excerpt),
      unchangedElsewhereSeen:rows.some(r=>!r.identity&&r.whole),excerptElsewhereSeen:rows.some(r=>!r.identity&&r.excerpt),
      whitespaceEquivalentSeen:rows.some(r=>r.compactWhole),
      targetIdentityFingerprint:fingerprint(String(this.target.nativeId??this.target.messageKey??'')),
      targetSourceFingerprint:fingerprint(this.target.sourceText),targetSourceLength:this.target.sourceText.length,
      targetExcerptLength:this.target.matchText.length,last:this.last};
  }
}
