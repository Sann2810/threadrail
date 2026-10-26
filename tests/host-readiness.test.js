import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForHost} from '../src/host-readiness.js';
import {RestorationTrace} from '../src/restoration-trace.js';

test('host readiness waits through initial host scrolling, remounts and font loading without a permissive timeout',async()=>{
  let time=0;
  const result=await waitForHost({now:()=>time,pause:async ms=>{time+=ms;},read:()=>({ready:time>=500,signature:time<1100?'initial-window':'settled-window'})});
  assert.equal(result.ok,true);assert.ok(time>=1800);
  time=0;const busy=await waitForHost({timeout:1500,now:()=>time,pause:async ms=>{time+=ms;},read:()=>({ready:false})});
  assert.equal(busy.ok,false);assert.match(busy.reason,/initialization did not settle/);
});
test('restoration traces distinguish identity, text and loading failures without exporting text',()=>{
  const oldDocument=globalThis.document;globalThis.document={visibilityState:'visible'};
  try{
    const target={nativeId:'wanted',sourceText:'Private whole message',matchText:'whole message'},trace=new RestorationTrace(target,()=>0);
    const controller={scroller:{scrollTop:0,scrollHeight:900,clientHeight:600},adapter:{historyLoading:()=>true,olderHistoryControl:()=>null},root:{}};
    trace.observe([{archiveId:'different',sourceText:target.sourceText,text:target.sourceText}],controller);
    const report=trace.summary('deadline');
    assert.equal(report.identitySeen,false);assert.equal(report.unchangedElsewhereSeen,true);assert.equal(report.last.historyLoading,true);
    assert.ok(!JSON.stringify(report).includes('Private whole message'));assert.ok(!JSON.stringify(report).includes('wanted'));
  }finally{globalThis.document=oldDocument;}
});
