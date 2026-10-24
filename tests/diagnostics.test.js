import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticPlan,diagnosticGroundTruth,checkDiagnosticRank,diagnosticExport} from '../src/diagnostics-model.js';
import {libraryResults,libraryTarget,diagnosticAwait} from '../src/library-search.js';
import {installDiagnostics} from '../src/diagnostics-background.js';
const url='https://chatgpt.com/c/test',plan={query:'remember the broken appliance',expectedChatURL:url,expectedPassage:'The radiator stopped working.'};
test('diagnostic plans require explicit expected chats and passages and bound imported input',()=>{
  assert.deepEqual(diagnosticPlan({cases:[plan]}),[plan]);
  for(const cases of [[],[null],Array(13).fill(plan),[{...plan,expectedChatURL:'javascript:alert(1)'}],[{...plan,query:'x'}],[{...plan,expectedPassage:''}]])assert.throws(()=>diagnosticPlan(cases));
});
test('diagnostic ground truth must identify a captured message without ambiguity',()=>{
  const source={chatURL:url,text:plan.expectedPassage};
  assert.equal(diagnosticGroundTruth(plan,[source]).ok,true);
  assert.equal(diagnosticGroundTruth(plan,[]).ok,false);
  assert.equal(diagnosticGroundTruth(plan,[source,source]).ok,false);
});
test('diagnostics fail a wrong first chat or a wrong passage instead of choosing the expected row below it',()=>{
  const correct={chatURL:url,matchText:plan.expectedPassage};
  assert.equal(checkDiagnosticRank(plan,[correct]).ok,true);
  assert.deepEqual(checkDiagnosticRank(plan,[{chatURL:'https://claude.ai/chat/other'},correct]),{ok:false,reason:'Wrong chat ranked first',rank:2});
  assert.equal(checkDiagnosticRank(plan,[{...correct,matchText:'The weather was cold.'}]).ok,false);
  assert.equal(checkDiagnosticRank(plan,[{...correct,matchText:'Another clause.',sourceText:plan.expectedPassage}]).ok,true);
  assert.equal(checkDiagnosticRank(plan,[]).ok,false);
});
test('library and diagnostics share chat deduplication and canonical jump fields',()=>{
  const first={chatURL:url,role:'answer',messageKey:'stable',sourceText:'Original',matchText:'Original',matchOffset:0};
  const results=libraryResults([first,{...first,score:0},{chatURL:'https://claude.ai/chat/second'}]);
  assert.equal(results.length,2);assert.equal(results[0],first);assert.equal(libraryTarget(first).messageKey,'stable');
});
test('exported reports omit queries and excerpts; stopping ignores late model results',async()=>{
  const report={results:[{query:'private query',expectedPassage:'private passage',excerpt:'private excerpt',actualTitle:'Title',ok:true}]};
  assert.equal(diagnosticExport(report).results[0].query,undefined);
  assert.equal(diagnosticExport(report,true).results[0].query,'private query');assert.equal(report.results[0].query,'private query');
  const controller=new AbortController();let finish;
  const pending=diagnosticAwait(new Promise(resolve=>finish=resolve),controller.signal);controller.abort();
  await assert.rejects(pending,/Stopped/);finish('late model result');
  await assert.rejects(diagnosticAwait(Promise.reject(Error('late failure')),controller.signal),/Stopped/);
});
test('diagnostic actions reject website senders before opening any tab',async()=>{
  let listener,created=0;
  globalThis.chrome={runtime:{id:'test',getURL:p=>`chrome-extension://test/${p}`,onMessage:{addListener:fn=>listener=fn}},
    tabs:{onRemoved:{addListener(){}},create(){created++;},remove:async()=>{}},storage:{session:{get:async()=>({}),remove:async()=>{}}}};
  try{
    installDiagnostics({readyMessage:async()=>{},allowedURL:async()=>url});
    const response=await new Promise(resolve=>listener({type:'threadrail:diagnostic-begin',owner:1},{id:'test',url},resolve));
    assert.match(response.error,/Open ThreadRail diagnostics/);assert.equal(created,0);
  }finally{delete globalThis.chrome;}
});
