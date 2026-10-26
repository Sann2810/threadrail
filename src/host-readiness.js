// A newly opened host can render readable rows before its own initial scroll,
// fonts and virtual window finish initializing. Do not compete with that scroll.
export async function waitForHost({read,active=()=>true,now=()=>performance.now(),
  pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeout=12000,minimum=1000,quiet=650,interval=250}){
  const began=now();let firstReady=null,quietSince=null,last=null;
  while(active()&&now()-began<timeout){
    const sample=read();
    if(sample?.ready){
      firstReady??=now();
      if(sample.signature===last)quietSince??=now();else quietSince=null;
      last=sample.signature;
      if(quietSince!==null&&now()-quietSince>=quiet&&now()-firstReady>=minimum)return {ok:true,elapsedMs:now()-began};
    }else{firstReady=null;quietSince=null;last=null;}
    // Each read syncs every drawn message, so poll sparingly.
    await pause(interval);
  }
  return {ok:false,reason:active()?'Chat initialization did not settle':'Restoration cancelled before chat initialization settled',elapsedMs:now()-began};
}
