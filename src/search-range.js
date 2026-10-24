// Resolve an excerpt to real DOM text without editing the site's messages.
export function passageTarget(result){
  const text=result.matchText??result.text,offset=result.matchOffset??result.offset??0;
  return result.highlightLength?{...result,matchText:text.slice(result.highlightStart,result.highlightStart+result.highlightLength),
    matchOffset:offset+result.highlightStart,highlightLength:undefined}:{...result,matchText:text,matchOffset:offset};
}
export function passageRange(element, text, offset = 0) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const positions = [];
  let normalized = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement.closest('button,nav,script,style,[role="toolbar"],[hidden],[aria-hidden="true"],.sr-only,.cdk-visually-hidden,.visually-hidden,.screen-reader-only,[data-markdown-copy="exclude"]')) continue;
    for (let i = 0; i < node.data.length; i++) {
      const char = /\s/u.test(node.data[i]) ? ' ' : node.data[i];
      if (char === ' ' && (!normalized || normalized.endsWith(' '))) continue;
      normalized += char; positions.push({node,offset:i});
    }
  }
  const needle = text.replace(/\s+/g,' ').trim();
  if (!needle) return null;
  let start = normalized.indexOf(needle, Math.max(0,offset-2));
  if (start < 0) start = normalized.indexOf(needle);
  if (start < 0) return null;
  const first = positions[start], last = positions[start + needle.length - 1];
  const range = document.createRange();
  range.setStart(first.node,first.offset); range.setEnd(last.node,last.offset+1);
  return range;
}
