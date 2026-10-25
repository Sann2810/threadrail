import {MESSAGE_OMITTED,TEXT_BLOCKS,locateText} from './message-text.js';
// Resolve an excerpt to real DOM text without editing the site's messages.
export function passageTarget(result){
  const text=result.matchText??result.text,offset=result.matchOffset??result.offset??0;
  return result.highlightLength?{...result,matchText:text.slice(result.highlightStart,result.highlightStart+result.highlightLength),
    matchOffset:offset+result.highlightStart,highlightLength:undefined}:{...result,matchText:text,matchOffset:offset};
}
export function passageRange(element, text, offset = 0) {
  // Mirrors messageText: block edges and <br> become one space.
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const positions = [];
  let normalized = '', block = null, edge = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) { if (node.matches('br') && !node.closest(MESSAGE_OMITTED)) edge = true; continue; }
    if (node.parentElement.closest(MESSAGE_OMITTED)) continue;
    const owner = node.parentElement.closest(TEXT_BLOCKS);
    if (owner !== block) { block = owner; edge = true; }
    if (edge && normalized && !normalized.endsWith(' ')) { normalized += ' '; positions.push(positions.at(-1)); }
    edge = false;
    for (let i = 0; i < node.data.length; i++) {
      const char = /\s/u.test(node.data[i]) ? ' ' : node.data[i];
      if (char === ' ' && (!normalized || normalized.endsWith(' '))) continue;
      normalized += char; positions.push({node,offset:i});
    }
  }
  const needle = text.replace(/\s+/g,' ').trim();
  if (!needle) return null;
  const found = locateText(normalized, needle, offset-2);
  if (!found) return null;
  const first = positions[found.start], last = positions[found.start + found.length - 1];
  const range = document.createRange();
  range.setStart(first.node,first.offset); range.setEnd(last.node,last.offset+1);
  return range;
}
