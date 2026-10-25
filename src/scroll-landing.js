// One bounded navigation transaction. Frame callbacks may be suspended in a
// background/occluded tab; timer progress and completion must remain awaitable.
export async function settleScroll({read,signal,minimum=250,quiet=150,timeout=10000,
  now=()=>performance.now(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const began=now();let stableSince=null,previous=null,lastScroll=null,lastMovement=began,initial=true;
  while(now()-began<timeout){
    if(signal?.aborted)return {ok:false,reason:'Jump cancelled'};
    try{
      const sample=read();
      if(!sample?.scroller||!Number.isFinite(sample.top)){stableSince=null;previous=null;await pause(50);continue;}
      const {scroller}=sample,top=Math.max(0,Math.min(sample.top,Math.max(0,scroller.scrollHeight-scroller.clientHeight)));
      if(lastScroll!==scroller.scrollTop){lastMovement=now();lastScroll=scroller.scrollTop;}
      const reached=Math.abs(scroller.scrollTop-top)<3;
      const signature=JSON.stringify([top,scroller.scrollTop,scroller.scrollHeight,scroller.clientHeight,sample.geometry]);
      const same=previous?.scroller===scroller&&previous?.element===sample.element&&previous?.signature===signature;
      if(reached&&sample.ready!==false&&same){stableSince??=now();}
      else stableSince=null;
      previous={scroller,element:sample.element,signature};
      if(reached&&stableSince!==null&&now()-stableSince>=quiet&&now()-began>=minimum)return {ok:true};
      if(!reached&&(initial||now()-lastMovement>=150)){
        scroller.scrollTo({top,behavior:initial&&sample.smooth?'smooth':'instant'});
        initial=false;lastMovement=now();
      }
    }catch(error){return {ok:false,reason:`Jump failed: ${error.message}`};}
    await pause(50);
  }
  return {ok:false,reason:'Jump did not settle'};
}
