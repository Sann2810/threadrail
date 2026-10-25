// Capture and DOM ranges share exactly the same content boundary. Host status,
// action bars and accessibility duplicates are not part of a saved message.
export const LEGACY_OMITTED='button,nav,script,style,[role="toolbar"],[aria-hidden="true"],.sr-only,.cdk-visually-hidden,.visually-hidden,.screen-reader-only,[data-markdown-copy="exclude"]';
const HOST_CHROME='[hidden],[data-cds="TurnStatus"],[data-testid="message-actions"]';
export const MESSAGE_OMITTED=`${LEGACY_OMITTED},${HOST_CHROME}`;
// Text in different blocks (a heading and its paragraph, list items, cells)
// is separated by a space, so words at block edges never fuse together.
export const TEXT_BLOCKS='address,article,aside,blockquote,dd,details,div,dl,dt,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,ol,p,pre,section,summary,table,tbody,td,tfoot,th,thead,tr,ul';
export const normalizeText=text=>String(text??'').replace(/\s+/g,' ').trim();
export function messageText(element,selector=MESSAGE_OMITTED,{blocks=true}={}){
  const copy=element.cloneNode(true);
  copy.querySelectorAll(selector).forEach(node=>node.remove());
  if(blocks){
    copy.querySelectorAll('br').forEach(node=>node.replaceWith(' '));
    copy.querySelectorAll(TEXT_BLOCKS).forEach(node=>{node.prepend(' ');node.append(' ');});
  }
  return normalizeText(copy.textContent);
}
// Find a saved excerpt in message text. Excerpts saved before block spacing
// lack the spaces at block edges, so fall back to a match that ignores spaces.
export function locateText(text,needle,from=0){
  let start=text.indexOf(needle,Math.max(0,from));if(start<0)start=text.indexOf(needle);
  if(start>=0)return {start,length:needle.length};
  const target=needle.replace(/\s+/g,'');if(!target)return null;
  const map=[];let compact='';
  for(let i=0;i<text.length;i++)if(text[i]!==' '){compact+=text[i];map.push(i);}
  const hit=compact.indexOf(target);if(hit<0)return null;
  start=map[hit];return {start,length:map[hit+target.length-1]+1-start};
}
// Legacy snapshots can contain one or both of a status label and its live-
// region duplicate. Every conversation character is mandatory; only text nodes
// inside currently recognized host chrome may be absent from the old snapshot.
function legacyChromeMatches(element,saved){
  const copy=element.cloneNode(true);
  copy.querySelectorAll(LEGACY_OMITTED).forEach(node=>node.remove());
  const walker=document.createTreeWalker(copy,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  let states=new Map([['0:false',{at:0,space:false}]]),block=null,edge=false;
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    if(node.nodeType===Node.ELEMENT_NODE){if(node.matches('br'))edge=true;continue;}
    const owner=node.parentElement.closest(TEXT_BLOCKS);
    if(owner!==block){block=owner;edge=true;}
    if(edge){for(const state of [...states.values()])if(state.at&&!state.space)states.set(`${state.at}:true`,{at:state.at,space:true});edge=false;}
    const optional=!!node.parentElement.closest(HOST_CHROME),next=new Map(optional?states:[]);
    for(const state of states.values()){
      let {at,space}=state,valid=true;
      for(const char of node.data){
        if(/\s/u.test(char)){if(at)space=true;continue;}
        if(space){if(saved[at++]!==' '){valid=false;break;}space=false;}
        if(saved.slice(at,at+char.length)!==char){valid=false;break;}at+=char.length;
      }
      if(valid)next.set(`${at}:${space}`,{at,space});
    }
    states=next;if(!states.size)return false;
  }
  return [...states.values()].some(state=>state.at===saved.length);
}
export function sourceEvidence(element,saved,current=messageText(element)){
  saved=normalizeText(saved);
  if(saved===current)return {unchanged:true,comparison:'message'};
  if(saved===messageText(element,MESSAGE_OMITTED,{blocks:false}))return {unchanged:true,comparison:'legacy-block-spacing'};
  // Compare the entire mandatory message, never a surviving quote or a
  // freely stripped prefix. Unknown metadata and real answer edits still fail.
  if(saved===messageText(element,LEGACY_OMITTED)||saved===messageText(element,LEGACY_OMITTED,{blocks:false})||legacyChromeMatches(element,saved))return {unchanged:true,comparison:'legacy-host-chrome'};
  return {unchanged:false,comparison:'changed',savedLength:saved.length,currentLength:current.length};
}
