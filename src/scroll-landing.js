// Sample read() until it reports ready with an unchanged signature for `quiet`
// ms, at least `minimum` ms after the start (or after it first became ready).
// Timer-based, so it stays awaitable in a background or occluded tab.
export async function waitForStable({read,active=()=>true,now=()=>performance.now(),
  pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeout,minimum,quiet,interval,from='ready'}){
  const began=now();let firstReady=null,quietSince=null,last=null;
  while(active()&&now()-began<timeout){
    const sample=read();
    if(sample?.ready){
      firstReady??=now();
      if(sample.signature===last)quietSince??=now();else quietSince=null;
      last=sample.signature;
      if(quietSince!==null&&now()-quietSince>=quiet&&now()-(from==='start'?began:firstReady)>=minimum)return {ok:true,elapsedMs:now()-began};
    }else{firstReady=null;quietSince=null;last=null;}
    await pause(interval);
  }
  return {ok:false,elapsedMs:now()-began};
}

// One bounded navigation transaction: scroll to read().top and wait until the
// destination, its scroller and its geometry hold still there.
export async function settleScroll({read,signal,minimum=250,quiet=150,timeout=10000,
  now=()=>performance.now(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const ids=new WeakMap();let next=0;
  const id=object=>{if(!ids.has(object))ids.set(object,++next);return ids.get(object);};
  let lastScroll=null,lastMovement=now(),initial=true,failure=null;
  const settled=await waitForStable({now,pause,timeout,minimum,quiet,interval:50,from:'start',
    active:()=>!signal?.aborted&&!failure,read:()=>{
      try{
        const sample=read();
        if(!sample?.scroller||!Number.isFinite(sample.top))return null;
        const {scroller}=sample,top=Math.max(0,Math.min(sample.top,Math.max(0,scroller.scrollHeight-scroller.clientHeight)));
        if(lastScroll!==scroller.scrollTop){lastMovement=now();lastScroll=scroller.scrollTop;}
        const reached=Math.abs(scroller.scrollTop-top)<3;
        // Not scrollHeight: an answer still being written grows the transcript
        // below without moving the passage; top (clamped) and geometry catch moves.
        const signature=JSON.stringify([id(scroller),id(sample.element??scroller),top,scroller.scrollTop,scroller.clientHeight,sample.geometry]);
        if(!reached&&(initial||now()-lastMovement>=150)){
          scroller.scrollTo({top,behavior:initial&&sample.smooth?'smooth':'instant'});
          initial=false;lastMovement=now();
        }
        return {ready:reached&&sample.ready!==false,signature};
      }catch(error){failure=`Jump failed: ${error.message}`;return null;}
    }});
  if(signal?.aborted)return {ok:false,reason:'Jump cancelled'};
  if(failure)return {ok:false,reason:failure};
  return settled.ok?{ok:true}:{ok:false,reason:'Jump did not settle'};
}
