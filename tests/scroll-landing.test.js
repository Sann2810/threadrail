import {test} from 'node:test';
import assert from 'node:assert/strict';
import {settleScroll} from '../src/scroll-landing.js';
function scene(){
  let time=0,top=400,element={},scroller={scrollTop:0,scrollHeight:3000,clientHeight:600,scrollTo({top}){this.scrollTop=top;}};
  const read=()=>({scroller,top,element,geometry:[top-scroller.scrollTop,100],ready:true});
  return {read,now:()=>time,pause:async ms=>{time+=ms;},get time(){return time;},set top(value){top=value;},remount(){element={};},replaceScroller(){scroller={...scroller,scrollTop:0};}};
}
test('landing is awaitable without animation frames and follows a late 51px layout shift and a replacement scroller',async()=>{
  const s=scene();let moved=false,remounted=false;
  const result=await settleScroll({read:s.read,now:s.now,minimum:1200,quiet:650,pause:async ms=>{
    await s.pause(ms);
    if(s.time>=900&&!moved){moved=true;s.top=451;}
    if(s.time>=1100&&!remounted){remounted=true;s.remount();s.replaceScroller();}
  }});
  assert.equal(result.ok,true);assert.ok(s.time>=1800);assert.equal(s.read().scroller.scrollTop,451);
});
test('a permanently missing, throwing, cancelled or unreachable destination never reports success',async()=>{
  for(const mode of ['missing','throw','cancel','unreachable']){
    const s=scene(),abort=new AbortController();
    if(mode==='unreachable')s.read().scroller.scrollTo=()=>{};
    const result=await settleScroll({now:s.now,timeout:1500,signal:abort.signal,pause:async ms=>{await s.pause(ms);if(mode==='cancel')abort.abort();},
      read:mode==='missing'?()=>null:mode==='throw'?()=>{throw Error('detached range');}:s.read});
    assert.equal(result.ok,false,mode);assert.match(result.reason,/settle|failed|cancelled/);
  }
});
test('font or hydration readiness is required even when scroll geometry is quiet',async()=>{
  const s=scene();
  const result=await settleScroll({now:s.now,pause:s.pause,minimum:1200,quiet:650,read:()=>({...s.read(),ready:s.time>=1900})});
  assert.equal(result.ok,true);assert.ok(s.time>=2550);
});
