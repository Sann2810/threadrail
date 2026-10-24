// Both search surfaces share the same disclosure rules. Result objects are
// passed through untouched so layout never changes ranking or jump identity.
const views = new WeakMap();
let nextId = 0;
const node = (tag, className, value) => {
  const element = document.createElement(tag); element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
};
function pageResults(section, results, row, state, key, prefix, label) {
  let shown = state.limits.get(key) ?? 2;
  section.append(...results.slice(0, shown).map(row));
  const more = node('button', prefix === 'search' ? 'search-more' : 'secondary', 'Show more');
  more.setAttribute('aria-label', label);
  const appendMore = () => { if (shown < results.length) section.append(more); };
  more.onclick = () => {
    const focused = more.getRootNode().activeElement === more;
    const next = results.slice(shown, shown + 20).map(row);
    shown += next.length; state.limits.set(key, shown);
    more.replaceWith(...next); appendMore();
    if (focused) next[0]?.focus({preventScroll:true});
  };
  appendMore();
}
export function renderSearchColumns(best, words, results, groups, {query, settled, row, prefix = 'search'}) {
  let state = views.get(best);
  if (!state || state.query !== query) {
    state = {query, limits:new Map(), expanded:new Set(), id:++nextId}; views.set(best,state);
  }
  if (!query) { best.replaceChildren(); words.replaceChildren(); return; }
  const heading = prefix === 'search' ? 'h3' : 'h2';
  const titleClass = prefix === 'search' ? '' : 'library-section-title';
  const smartKey = JSON.stringify([settled, results.map(r=>[r.id,r.excerpt??r.text])]);
  if (smartKey !== state.smartKey) {
    state.smartKey = smartKey; best.replaceChildren(node(heading,titleClass,'Smart matches'));
    pageResults(best, results, row, state, 'smart', prefix, 'More smart matches');
    if (!results.length && settled) best.append(node('p','search-empty','No smart matches'));
  }
  const wordKey = JSON.stringify([groups.map(g=>[g.word,g.label,g.secondary,g.results.map(r=>[r.id,r.excerpt])])]);
  if (wordKey === state.wordKey) {
    words.querySelectorAll('.search-empty').forEach(element=>{element.hidden=!settled;});
    return;
  }
  const focusedWord = words.getRootNode().activeElement?.dataset.word;
  state.wordKey = wordKey;
  const title = node(heading,titleClass,'Word matches');
  title.append(node('span','word-order','Oldest first')); words.replaceChildren(title);
  if (!groups.length) { const empty=node('p','search-empty','No word matches');empty.hidden=!settled;words.append(empty);return; }
  const list = node('div','word-list'); words.append(list);
  for (const [index, group] of groups.entries()) {
    const item = node('div','word-item');
    const button = node('button',`${prefix}-tag word-toggle`);
    button.setAttribute('aria-label',group.label);button.dataset.word=group.word;
    const count=node('span',`${prefix}-count word-tag-count`,String(group.results.length));
    const countId=`threadrail-word-count-${state.id}-${index}`;count.id=countId;
    button.setAttribute('aria-describedby',countId);
    button.append(node('span',`${prefix}-word-label`,group.label),count,node('span','word-chevron','›'));
    button.lastChild.setAttribute('aria-hidden','true');
    const section = node('section',`${prefix}-word-group`);
    section.id = `threadrail-words-${state.id}-${index}`;
    section.setAttribute('aria-label',`${group.label} matches`);
    button.setAttribute('aria-controls',section.id);
    section.append(node('span',`${prefix}-count sr-only`,String(group.results.length)));
    let populated = false;
    const update = () => {
      section.hidden = !state.expanded.has(group.word);
      button.setAttribute('aria-expanded',String(!section.hidden));
      if (!section.hidden && !populated) {
        populated = true;
        pageResults(section,group.results,row,state,`word:${group.word}`,prefix,`More ${group.label} matches`);
        if (!group.results.length) {
          const empty=node('p','search-empty',`No matches for “${group.label}”`);empty.hidden=!settled;section.append(empty);
        }
      }
    };
    button.onclick = () => {
      if(state.expanded.has(group.word))state.expanded.delete(group.word);else state.expanded.add(group.word);
      update();
    };
    item.append(button,section);list.append(item);update();
  }
  if (focusedWord) [...words.querySelectorAll('button[data-word]')].find(button=>button.dataset.word===focusedWord)?.focus({preventScroll:true});
}

export function resetSearchColumns(best, words) {
  views.delete(best); best.replaceChildren(); words.replaceChildren();
}
