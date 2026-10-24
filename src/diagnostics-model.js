import {chatURL} from './archive-model.js';
const normalized=value=>String(value??'').replace(/\s+/g,' ').trim();
export function diagnosticPlan(value){
  const cases=Array.isArray(value)?value:value?.cases;
  if(!Array.isArray(cases)||!cases.length||cases.length>12)throw Error('Add between 1 and 12 tests.');
  return cases.map((item,index)=>{
    if(!item||typeof item!=='object'||['query','expectedChatURL','expectedPassage'].some(key=>typeof item[key]!=='string'))throw Error(`Test ${index+1}: enter a query, chat and expected passage.`);
    const query=normalized(item.query),expectedChatURL=chatURL(item.expectedChatURL),expectedPassage=normalized(item.expectedPassage);
    if(query.length<3||query.length>800)throw Error(`Test ${index+1}: enter a query (3–800 characters).`);
    if(!expectedChatURL)throw Error(`Test ${index+1}: choose a saved chat.`);
    if(expectedPassage.length<3||expectedPassage.length>1200)throw Error(`Test ${index+1}: enter the passage to find (3–1200 characters).`);
    return {query,expectedChatURL,expectedPassage};
  });
}
export function diagnosticGroundTruth(test,sources){
  const matches=sources.filter(source=>source.chatURL===test.expectedChatURL&&normalized(source.sourceText??source.text).includes(test.expectedPassage));
  if(!matches.length)return {ok:false,reason:'Expected passage is not in the saved chat'};
  if(matches.length>1)return {ok:false,reason:'Expected passage appears in several messages. Use a longer quote.'};
  return {ok:true};
}
export function checkDiagnosticRank(test,results){
  const first=results[0],rank=results.findIndex(r=>r.chatURL===test.expectedChatURL)+1;
  if(!first)return {ok:false,reason:'No smart match',rank:null};
  if(first.chatURL!==test.expectedChatURL)return {ok:false,reason:'Wrong chat ranked first',rank:rank||null};
  // A remembered event can span adjacent clauses within the selected message.
  // The live range check decides whether the expected words actually landed
  // in view; nearby excerpt context alone must never count as a jump pass.
  if(!normalized(first.sourceText??first.matchText).includes(test.expectedPassage))return {ok:false,reason:'Wrong passage ranked first',rank};
  return {ok:true,rank};
}
export function diagnosticExport(report,includeText=false){
  const copy=structuredClone(report);
  if(!includeText)for(const row of copy.results){delete row.query;delete row.expectedPassage;delete row.excerpt;}
  return copy;
}
