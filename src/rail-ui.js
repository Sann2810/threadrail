import css from './rail.css';
import { clamp } from './model.js';
import { renderSearchColumns, resetSearchColumns } from './search-results-view.js';

const chevron = direction => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${direction === 'up' ? 'm5 12 5-5 5 5' : 'm5 8 5 5 5-5'}"/></svg>`;
const arrow = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5"/></svg>';

export class RailUI {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.groups = [];
    this.host = document.createElement('threadrail-navigation');
    this.host.dataset.threadrail = 'true';
    this.host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483000!important;pointer-events:none!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css;
    this.shadow.append(style);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <nav class="rail" aria-label="Conversation navigation" hidden>
        <div class="cap"><span>Top</span><button class="top" aria-label="Jump to first exchange">${chevron('up')}</button></div>
        <div class="track" aria-label="Completed exchanges"></div>
        <div class="cap bottom"><button class="bottom" aria-label="Jump to latest message">${chevron('down')}</button><span>Bottom</span></div>
      </nav>
      <button class="search-trigger" aria-label="Search this thread" title="Search this thread (Alt+Shift+F)" hidden><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg></button>
      <section class="preview" aria-label="Jump to a message" hidden>
        <div class="preview-header"><span class="preview-title">Jump to a message</span><button class="close" aria-label="Close preview"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8"/></svg></button></div>
        <div class="items"></div>
      </section>
      <section class="search-panel" aria-label="Search this thread" hidden>
        <div class="preview-header"><span class="preview-title">Search</span><button class="search-close close" aria-label="Close search">×</button></div>
        <input class="search-input" type="search" aria-label="Describe what you remember" placeholder="What do you remember?" maxlength="800" autocomplete="off" spellcheck="false">
        <div class="search-status" role="status" aria-live="polite"></div>
        <div class="search-results" aria-label="Search results"><section class="search-best" aria-label="Smart matches"></section><section class="search-words" aria-label="Word matches"></section></div>
        <div class="search-coverage"></div>
        <button class="search-history" hidden>Load earlier</button>
        <button class="search-library">All chats <span aria-hidden="true">↗</span></button>
        <div class="search-library-error" role="alert" hidden></div>
      </section>
      <div class="toast" hidden><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="m6 10 3 3 5-6"/></svg><span></span><button class="toast-action" hidden></button></div>
      <div class="highlight" hidden></div><div class="live" role="status" aria-live="polite" aria-atomic="true"></div>`;
    this.shadow.append(wrapper);
    for (const name of ['rail', 'track', 'preview', 'items', 'toast', 'highlight', 'live']) this[name] = this.shadow.querySelector(`.${name}`);
    this.searchPanel = this.shadow.querySelector('.search-panel');
    this.searchInput = this.shadow.querySelector('.search-input');
    this.searchResults = this.shadow.querySelector('.search-results');
    this.shadow.querySelector('.search-trigger').addEventListener('click', () => callbacks.onSearchOpen());
    this.shadow.querySelector('.search-close').addEventListener('click', () => callbacks.onSearchClose(true));
    this.libraryButton = this.shadow.querySelector('.search-library');
    this.libraryButton.addEventListener('click', () => callbacks.onLibrary?.());
    this.libraryButton.hidden = !globalThis.chrome?.runtime?.id;
    this.shadow.querySelector('.search-history').addEventListener('click', () => callbacks.onSearchHistory());
    this.searchInput.addEventListener('input', () => callbacks.onSearchQuery(this.searchInput.value));
    this.searchPanel.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' && event.target === this.searchInput) {event.preventDefault(); [...this.searchResults.querySelectorAll('button')].find(button=>button.checkVisibility())?.focus();}
      else if (['ArrowDown','ArrowUp'].includes(event.key) && event.target.closest('.search-result, .search-more, .search-tag')) {
        event.preventDefault(); const rows = [...this.searchResults.querySelectorAll('button')].filter(button=>button.checkVisibility());
        rows[clamp(rows.indexOf(event.target.closest('button')) + (event.key === 'ArrowDown' ? 1 : -1), 0, rows.length-1)]?.focus();
      }
    });
    this.shadow.querySelector('.top').addEventListener('click', () => callbacks.onTop());
    this.shadow.querySelector('.bottom').addEventListener('click', () => callbacks.onBottom());
    this.shadow.querySelector('.close').addEventListener('click', () => callbacks.onClose(true));
    this.shadow.querySelectorAll('.cap button').forEach(button => {
      button.addEventListener('pointerdown', event => event.preventDefault());
    });
    this.track.addEventListener('pointerdown', event => this.pointerDown(event));
    this.track.addEventListener('pointermove', event => this.pointerMove(event));
    this.track.addEventListener('pointerup', event => this.pointerUp(event));
    this.track.addEventListener('pointercancel', () => this.cancelPointer());
    this.track.addEventListener('lostpointercapture', () => this.cancelPointer());
    this.track.addEventListener('click', event => {
      const marker = event.target.closest('.marker');
      // Pointer activation is handled on release; native keyboard/AT clicks have detail 0.
      if (marker && event.detail === 0 && !this.suppressClick) this.openGroup(marker, true);
    });
    this.track.addEventListener('keydown', event => this.markerKey(event));
    this.preview.addEventListener('keydown', event => this.previewKey(event));
    this.host.addEventListener('pointerenter', callbacks.onActivity);
    this.host.addEventListener('focusin', callbacks.onActivity);
    // Host apps see a shadow input as the custom-element host. Their global
    // "type anywhere" shortcuts can otherwise redirect search typing into the
    // chat composer. Keep interactions with our controls inside the extension.
    for (const type of ['keydown','keypress','keyup','beforeinput','input','pointerdown','mousedown','click']) {
      this.host.addEventListener(type, event => event.stopPropagation());
    }
    document.documentElement.append(this.host);
  }

  layout(viewport) {
    const root = document.documentElement;
    const scheme = getComputedStyle(root).colorScheme;
    const dark = root.classList.contains('dark') || root.dataset.theme === 'dark' || scheme === 'dark';
    const light = root.classList.contains('light') || root.dataset.theme === 'light' || scheme === 'light';
    this.host.dataset.theme = dark ? 'dark' : light ? 'light' : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const height = Math.max(180, Math.min(500, viewport.height * .72, innerHeight - 148));
    this.rail.style.height = `${height}px`;
    this.rail.style.top = `${clamp(viewport.top + (viewport.height - height) / 2, 72, Math.max(72, innerHeight - height - 88))}px`;
    this.rail.style.left = `${Math.min(innerWidth - 46, viewport.right - 46)}px`;
    const search=this.shadow.querySelector('.search-trigger');
    search.style.top=`${parseFloat(this.rail.style.top)+16}px`;
    search.style.left=`${parseFloat(this.rail.style.left)-35}px`;
    if (!this.preview.hidden) this.positionPreview();
    if (!this.searchPanel.hidden) this.positionSearch();
    return height - 104;
  }

  setVisible(visible, state) {
    this.rail.hidden = !visible;
    this.host.dataset.state = state;
    if (!visible) this.cancelPointer();
  }

  setSearchAvailable(available){this.shadow.querySelector('.search-trigger').hidden=!available;}

  render(groups, activeId) {
    const key = groups.map(group => `${group.key}:${group.fraction}`).join(';');
    if (key !== this.groupKey) {
      this.groupKey = key;
      this.groups = groups;
      this.track.replaceChildren();
      for (const [index, group] of groups.entries()) {
        const marker = document.createElement('button');
        marker.className = 'marker';
        marker.dataset.index = index;
        marker.dataset.exchangeId = group.members[0].id;
        marker.setAttribute('aria-haspopup', 'true');
        marker.setAttribute('aria-expanded', 'false');
        marker.setAttribute('aria-label', `Exchange ${group.members[0].ordinal}. Preview: ${group.members[0].inputText.slice(0, 180)}`);
        this.track.append(marker);
      }
    } else this.groups = groups;
    this.host.dataset.windowStart = String(groups[0]?.members[0].ordinal ?? 0);
    this.host.dataset.windowEnd = String(groups.at(-1)?.members[0].ordinal ?? 0);
    [...this.track.children].forEach((marker, index) => {
      const member = groups[index].members[0];
      marker.setAttribute('aria-label', `Exchange ${member.ordinal}. Preview: ${member.inputText.slice(0, 180)}`);
    });
    [...this.track.children].forEach((marker, index) => {
      if (groups[index].members.some(member => member.id === activeId)) marker.setAttribute('aria-current', 'step');
      else marker.removeAttribute('aria-current');
      marker.setAttribute('aria-expanded', String(!this.preview.hidden && groups[index].members.some(member => this.previewSelectedId === member.id)));
    });
  }

  openGroup(marker, keyboard = false) {
    const group = this.groups[Number(marker.dataset.index)];
    if (!group) return;
    this.lastMarkerIndex = Number(marker.dataset.index);
    this.callbacks.onPreview(this.groups.flatMap(item => item.members), group.fraction, keyboard, group.members[0].id);
  }

  showPreview(members, fraction, keyboard = false, selectedId = members[0]?.id) {
    this.previewSignatures=members.map(member=>JSON.stringify([member.inputText,member.previewContext]));
    this.previewIds = members.map(member => member.id);
    this.previewFraction = fraction;
    this.previewSelectedId = selectedId;
    this.items.replaceChildren();
    this.shadow.querySelector('.preview-title').textContent = members.length > 1 ? 'Nearby messages' : 'Jump to a message';
    for (const member of members) {
      const row = document.createElement('button');
      row.className = 'item';
      row.dataset.exchangeId = member.id;
      if (member.id === selectedId) row.dataset.selected = 'true';
      row.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="item-copy"><span class="question"></span></span>${arrow}`;
      row.querySelector('.question').textContent = member.inputText;
      if(member.previewContext){
        const context=document.createElement('span');context.className='answer-context';context.textContent=member.previewContext;
        row.querySelector('.item-copy').append(context);
      }
      row.setAttribute('aria-label', `Jump to: ${member.inputText}${member.previewContext?` — ${member.previewContext}`:''}`);
      row.addEventListener('click', () => this.callbacks.onJump(member.id, keyboard));
      this.items.append(row);
    }
    this.preview.hidden = false;
    this.positionPreview();
    const selected = [...this.items.children].find(row => row.dataset.exchangeId === selectedId);
    selected?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    if (keyboard) selected?.focus({ preventScroll: true });
  }

  positionPreview() {
    const rail = this.rail.getBoundingClientRect();
    const marker = [...this.track.children].find(node => node.dataset.exchangeId === this.previewSelectedId);
    const markerRect = marker?.getBoundingClientRect();
    const anchorY = markerRect ? markerRect.top + markerRect.height / 2 : rail.top + rail.height / 2;
    const rect = this.preview.getBoundingClientRect();
    this.preview.style.left = `${Math.max(8, rail.left - rect.width - 8)}px`;
    this.preview.style.top = `${clamp(anchorY - rect.height / 2, 12, Math.max(12, innerHeight - rect.height - 16))}px`;
  }

  closePreview(restoreFocus = false) {
    this.preview.hidden = true;
    this.previewIds = [];
    this.track.querySelectorAll('[aria-expanded="true"]').forEach(marker => marker.setAttribute('aria-expanded', 'false'));
    if (restoreFocus) this.track.children[this.lastMarkerIndex ?? 0]?.focus({ preventScroll: true });
  }

  pointerDown(event) {
    if (event.button !== 0 || !event.isPrimary) return;
    const marker = event.target.closest('.marker');
    if (!marker) return;
    event.preventDefault();
    this.callbacks.onActivity();
    this.cancelPointer();
    this.gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, marker, moved: false, held: false };
    this.track.setPointerCapture(event.pointerId);
    if (marker) this.holdTimer = setTimeout(() => {
      if (!this.gesture || this.gesture.moved) return;
      const group = this.groups[Number(marker.dataset.index)];
      if (!group) return;
      this.gesture.held = true;
      this.callbacks.onJump(group.members[0].id);
    }, 450);
  }

  pointerMove(event) {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) {
      gesture.moved = true;
      clearTimeout(this.holdTimer);
    }
    if (gesture.moved && !gesture.held) {
      // Pointer capture retargets events to the track. Hit-test the visible button
      // boxes explicitly, never the transparent gaps between them.
      const trackRect = this.track.getBoundingClientRect();
      if (event.clientX < trackRect.left || event.clientX > trackRect.right || event.clientY < trackRect.top || event.clientY > trackRect.bottom) return;
      const marker = [...this.track.children].find(node => {
        const rect = node.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      });
      if (marker && marker !== this.lastScrubMarker) {
        this.lastScrubMarker = marker;
        this.openGroup(marker);
      }
    }
  }

  pointerUp(event) {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== event.pointerId) return;
    if (!gesture.held && !gesture.moved && gesture.marker) this.openGroup(gesture.marker);
    this.suppressClick = true;
    setTimeout(() => { this.suppressClick = false; }, 0);
    this.cancelPointer();
  }

  cancelPointer() {
    clearTimeout(this.holdTimer);
    const id = this.gesture?.id;
    this.gesture = null;
    this.lastScrubMarker = null;
    if (id !== undefined && this.track.hasPointerCapture(id)) this.track.releasePointerCapture(id);
  }

  markerKey(event) {
    const marker = event.target.closest('.marker');
    if (!marker) return;
    const index = Number(marker.dataset.index);
    let next;
    if (event.key === 'ArrowDown') next = Math.min(this.groups.length - 1, index + 1);
    if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = this.groups.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      this.callbacks.onActivity();
      this.track.children[next]?.focus({ preventScroll: true });
    }
  }

  previewKey(event) {
    const rows = [...this.items.children];
    const index = rows.indexOf(this.shadow.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = Math.min(rows.length - 1, index + 1);
    if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = rows.length - 1;
    if (next !== undefined) { event.preventDefault(); rows[next]?.focus(); }
  }

  announce(text,{persistent=false,action,onAction}={}) {
    clearTimeout(this.toastTimer);
    this.live.textContent = text;
    this.toast.querySelector('span').textContent = text;
    this.toast.hidden = false;
    const button=this.shadow.querySelector('.toast-action');button.hidden=!action;button.textContent=action??'';button.onclick=onAction??null;
    if(!persistent)this.toastTimer = setTimeout(() => { this.toast.hidden = true; }, 3500);
  }

  openSearch(query = '') {
    this.setLibraryError('');
    this.closePreview();
    this.searchPanel.hidden = false;
    this.searchInput.value = query;
    this.shadow.querySelector('.search-trigger').setAttribute('aria-expanded','true');
    this.positionSearch();
    this.searchInput.focus({preventScroll:true});
  }

  closeSearch(restoreFocus = false) {
    this.searchPanel.hidden = true;
    this.shadow.querySelector('.search-trigger').setAttribute('aria-expanded','false');
    if (restoreFocus) this.shadow.querySelector('.search-trigger').focus({preventScroll:true});
  }

  setLibraryError(text) {
    const error = this.shadow.querySelector('.search-library-error');
    error.textContent = text;
    error.hidden = !text;
    if (!this.searchPanel.hidden) this.positionSearch();
  }

  positionSearch() {
    const rail = this.rail.getBoundingClientRect();
    const panel = this.searchPanel.getBoundingClientRect();
    this.searchPanel.style.left = `${Math.max(8, rail.left-panel.width-48)}px`;
    this.searchPanel.style.top = `${clamp(rail.top, 12, Math.max(12, innerHeight-panel.height-16))}px`;
  }

  searchRow(result) {
    const button = document.createElement('button');
    button.className = 'search-result'; button.dataset.searchId = result.id;
    const label = document.createElement('span'); label.className = 'search-result-label';
    label.textContent = result.role === 'answer' ? 'Answer' : 'You';
    const excerpt = document.createElement('span'); excerpt.className = 'search-excerpt';
    if (result.highlightLength) {
      const text = result.matchText;
      const mark = document.createElement('mark');
      mark.textContent = text.slice(result.highlightStart, result.highlightStart + result.highlightLength);
      excerpt.append(`${result.matchOffset ? '…' : ''}${text.slice(0,result.highlightStart)}`, mark,
        `${text.slice(result.highlightStart + result.highlightLength)}${result.matchOffset + text.length < result.sourceText.length ? '…' : ''}`);
    } else excerpt.textContent = result.excerpt ?? result.text;
    button.append(label,excerpt);
    button.addEventListener('click', () => this.callbacks.onSearchJump(result));
    return button;
  }

  showSearch(results, { status, coverage, phase, query, keywordGroups = [], historyAvailable = false }) {
    // Hidden result rows and pagination closures must not keep an unloaded
    // transcript subtree alive. The controller resolves bindings on selection.
    results=results.map(({element,...result})=>result);
    keywordGroups=keywordGroups.map(group=>({...group,results:group.results.map(({element,...result})=>result)}));
    this.searchPanel.dataset.phase = phase;
    this.shadow.querySelector('.search-history').hidden=!historyAvailable;
    this.shadow.querySelector('.search-status').textContent = status;
    this.shadow.querySelector('.search-status').hidden = !status;
    this.shadow.querySelector('.search-coverage').textContent = coverage;
    const focusId = this.shadow.activeElement?.dataset.searchId;
    const scroll = query === this.lastSearchQuery ? this.searchResults.scrollTop : 0;
    this.lastSearchQuery = query;
    const best = this.shadow.querySelector('.search-best');
    const words = this.shadow.querySelector('.search-words');
    renderSearchColumns(best, words, results, keywordGroups, {
      query, settled: phase === 'ready' || phase === 'fallback', row: result => this.searchRow(result),
    });
    if (focusId) [...this.searchResults.querySelectorAll('.search-result')].find(button => button.dataset.searchId === focusId)?.focus({preventScroll:true});
    this.searchResults.scrollTop = scroll;
    this.positionSearch();
  }

  setTopLoading(loading) {
    const button = this.shadow.querySelector('.top');
    button.disabled = loading;
    button.setAttribute('aria-busy', String(loading));
    this.shadow.querySelector('.cap > span').textContent = loading ? 'Loading' : 'Top';
  }

  highlightElement(element) {
    clearTimeout(this.highlightTimer);
    const rect = element.getBoundingClientRect();
    Object.assign(this.highlight.style, { top: `${rect.top - 5}px`, left: `${rect.left - 5}px`, width: `${rect.width + 10}px`, height: `${Math.min(rect.height + 10, innerHeight - rect.top - 12)}px` });
    this.highlight.hidden = false;
    this.highlightTimer = setTimeout(() => { this.highlight.hidden = true; }, 1100);
  }

  reset() {
    this.cancelPointer();
    this.closePreview();
    this.closeSearch();
    resetSearchColumns(this.shadow.querySelector('.search-best'), this.shadow.querySelector('.search-words'));
    this.toast.hidden = true;
    this.highlight.hidden = true;
    this.rail.hidden = true;
    this.setSearchAvailable(false);
    this.setTopLoading(false);
  }

  destroy() {
    this.reset();
    clearTimeout(this.toastTimer);
    clearTimeout(this.highlightTimer);
    this.host.remove();
  }
}
