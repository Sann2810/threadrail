import { ArchiveCollector } from './archive-collector.js';
import {chatURL} from './archive-model.js';
import {ThreadHistory} from './thread-history.js';
import { semanticQuery } from './search-text.js';
import { SEARCH_MODEL, retrievalQuery } from './search-model.js';
import { RankedSearch } from './search-ranker.js';
import { SearchIndex } from './search-index.js';
import { EmbeddingClient } from './embedding-client.js';
import { passageRange,passageTarget } from './search-range.js';
import { ConversationAdapter } from './chatgpt-adapter.js';
import { profileFor } from './profiles.js';
import { State, activeExchange, isReadingCurrent, nearbyExchanges, clamp } from './model.js';
import { RailUI } from './rail-ui.js';

class ThreadRail {
  constructor(profile) {
    this.profile = profile;
    this.adapter = new ConversationAdapter(profile);
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.exchanges = [];
    this.searchSources = [];
    this.liveSearchSources = [];
    this.searchIndex = new SearchIndex(SEARCH_MODEL);
    this.embeddingClient = new EmbeddingClient();
    this.rankedSearch = this.createRankedSearch();
    this.queryVectors = new Map();
    this.searchToken = 0;
    this.state = State.IDLE;
    this.route = this.routeKey();
    this.threadHistory=new ThreadHistory(chatURL(location.href)??this.route);
    this.ui = new RailUI({
      onSearchOpen: () => this.openSearch(),
      onLibrary: () => this.openLibrary(),
      onSearchClose: focus => this.closeSearch(focus),
      onSearchQuery: query => this.querySearch(query),
      onSearchJump: result => this.jumpSearch(result),
      onSearchHistory: () => this.loadSearchHistory(),
      onTop: () => this.jumpTop(),
      onBottom: () => this.jumpBottom(),
      onJump: (id, keyboard) => this.jump(id, keyboard),
      onPreview: (members, fraction, keyboard, selectedId) => this.preview(members, fraction, keyboard, selectedId),
      onClose: restoreFocus => this.closePreview(restoreFocus),
      onActivity: () => this.armIdle(),
    });
    this.archive = new ArchiveCollector(this);
    this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
    this.mutations = new MutationObserver(records => {
      if (records.every(record => record.target === this.ui.host || this.ui.host.contains(record.target))) return;
      this.scheduleRefresh();
    });
    this.mutations.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['data-is-streaming', 'data-message-status', 'data-message-author-role', 'data-role', 'data-author', 'data-talvt-turn-state', 'data-perf-row-streaming', 'aria-busy', 'aria-label', 'aria-posinset', 'disabled', 'aria-disabled', 'data-message-id', 'hidden', 'aria-hidden', 'class', 'style'],
    });
    window.addEventListener('resize', () => this.scheduleMeasure(), { signal });
    window.visualViewport?.addEventListener('resize', () => this.scheduleMeasure(), { signal });
    document.addEventListener('pointerdown', event => {
      if (!event.composedPath().includes(this.ui.host)) this.archive.cancel();
      if (this.state === State.SEARCH && !event.composedPath().includes(this.ui.host)) this.closeSearch();
      if (this.state === State.PREVIEW && !event.composedPath().includes(this.ui.host)) this.closePreview();
      if (!event.composedPath().includes(this.ui.host)) {
        this.ui.highlight.hidden = true;
        if (this.state === State.JUMPING) {
          this.cancelJump();
          this.setState(State.NAVIGATING);
          this.armIdle();
        }
      }
    }, { capture: true, signal });
    // Capture our explicit shortcuts before host editors stop propagation.
    document.addEventListener('keydown', event => this.keydown(event), { signal, capture: true });
    // Claude's global paste handler treats a retargeted shadow input as page
    // background and sends its text to the composer. Stop host paste handlers
    // before document capture, while leaving the browser's input paste intact.
    window.addEventListener('paste', event => {
      if (event.composedPath().includes(this.ui.searchInput)) event.stopImmediatePropagation();
    }, { signal, capture: true });
    for (const type of ['wheel', 'touchstart']) document.addEventListener(type, event => {
      if (!event.composedPath().includes(this.ui.host)) this.archive.cancel();
      if (this.state === State.JUMPING && !event.composedPath().includes(this.ui.host)) {
        this.cancelJump();
        this.setState(State.NAVIGATING);
        this.scheduleMeasure(true);
        this.armIdle();
      }
    }, { passive: true, signal });
    // A route check handles SPA navigation even if no DOM mutation accompanies it.
    this.routeTimer = setInterval(() => {
      if (this.routeKey() !== this.route) this.refresh();
    }, 700);
    this.refresh();
    this.restoreThreadCache();
  }

  routeKey() { return location.pathname + location.search; }
  createRankedSearch(){return new RankedSearch(this.searchIndex,this.embeddingClient,()=>this.renderSearch(),{selective:true,onVectors:batch=>this.saveThreadVectors(batch)});}

  scheduleRefresh() {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => { this.refreshTimer = null; this.refresh(); }, 120);
  }

  refresh() {
    try {
      const route = this.routeKey();
      if (route !== this.route) {
        this.archive.cancel();
        this.route = route;
        this.cancelJump();
        this.searchToken++;
        this.searchIndex = new SearchIndex(SEARCH_MODEL);
        this.threadHistory=new ThreadHistory(chatURL(location.href)??route);
        this.restoreThreadCache();
        this.rankedSearch = this.createRankedSearch();
        this.queryVectors.clear();
        this.ui.reset();
        this.state = State.IDLE;
        this.lastScrollAt = 0;
        clearTimeout(this.idleTimer);
        this.adapter = new ConversationAdapter(this.profile);
      }
      const result = this.adapter.read();
      const firstMessage = result.exchanges[0]?.inputElement ?? this.adapter.unpairedOutputs(result.root,[])[0];
      const scroller = result.root ? this.adapter.findScroller(result.root,firstMessage) : null;
      if (scroller !== this.scroller) {
        this.scrollAbort?.abort();
        this.scroller = scroller;
        this.scrollAbort = new AbortController();
        const target = scroller === document.scrollingElement ? window : scroller;
        target?.addEventListener('scroll', () => this.onScroll(), { passive: true, signal: this.scrollAbort.signal });
      }
      this.root = result.root;
      this.exchanges = result.exchanges;
      // Capture every readable window, even before search is opened. Later host
      // unmounts remove bindings, never text or its accepted vectors.
      this.syncSearch();
      this.ui.host.dataset.provider = this.profile.id;
      this.ui.host.dataset.exchangeCount = String(this.exchanges.length);
      this.ui.host.dataset.completedCount = String(this.exchanges.filter(exchange => exchange.completed).length);
      this.resizeObserver.disconnect();
      if (this.root) this.resizeObserver.observe(this.root);
      if (this.scroller) this.resizeObserver.observe(this.scroller);
      for (const exchange of this.exchanges) {
        this.resizeObserver.observe(exchange.startElement);
        for (const output of exchange.outputs) this.resizeObserver.observe(output);
      }
      if (this.state === State.PREVIEW) {
        const available = new Set(this.exchanges.filter(exchange => exchange.completed).map(exchange => exchange.id));
        if (!this.ui.previewIds?.every(id => available.has(id))) this.closePreview();
        else {
          // Keep original questions fresh after edits or replacement DOM nodes.
          const members = this.exchanges.filter(exchange => this.ui.previewIds.includes(exchange.id));
          if (members.some((member, index) => JSON.stringify([member.inputText,member.previewContext])!==this.ui.previewSignatures?.[index])) {
            this.ui.showPreview(members, this.ui.previewFraction, false, this.ui.previewSelectedId);
          }
        }
      }
      if (this.state === State.JUMPING && this.jumpId && !this.exchanges.some(exchange => exchange.id === this.jumpId)) { this.cancelJump(); this.setState(State.NAVIGATING); }
      if (this.state === State.SEARCH) {
        this.ensureSearchIndex();
        this.renderSearch();
      }
      this.archive.schedule();
      clearTimeout(this.warmTimer);
      this.warmTimer=setTimeout(()=>this.ensureSearchIndex(),300);
      this.measure();
      this.ui.host.dataset.revision = String((Number(this.ui.host.dataset.revision) || 0) + 1);
    } catch (error) {
      // A changed host layout must never prevent the underlying conversation working.
      this.cancelJump();
      this.ui.reset();
      this.state = State.IDLE;
      console.warn('[ThreadRail] Navigation paused; the chat layout could not be read.', error);
    }
  }

  scheduleMeasure(fromScroll = false) {
    this.scrollPending ||= fromScroll;
    if (this.measureFrame) return;
    this.measureFrame = requestAnimationFrame(() => {
      this.measureFrame = null;
      const scrolled = this.scrollPending;
      this.scrollPending = false;
      this.measure(scrolled);
    });
  }

  onScroll() {
    this.archive.schedule();
    this.lastScrollAt = performance.now();
    this.ui.highlight.hidden = true;
    this.scheduleMeasure(true);
  }

  measure(fromScroll = false) {
    this.ui.setSearchAvailable(!!this.root&&!!this.scroller&&this.searchSources.some(source=>source.element?.isConnected));
    if(this.archive.finding){this.setState(State.JUMPING);if(this.scroller)this.ui.layout(this.adapter.viewport(this.scroller));return;}
    if (!this.scroller || !this.root || (this.exchanges.length < 2 && this.state !== State.SEARCH) || !this.exchanges.length) {
      // Search can open before history hydrates or while answers fail to load.
      // Keep its explicit intent alive independently of marker eligibility.
      if (this.state === State.SEARCH || (this.state === State.JUMPING && this.scroller && this.root)) {
        const viewport = this.scroller ? this.adapter.viewport(this.scroller) : {top:0,right:innerWidth,height:innerHeight};
        this.inset = this.root ? this.adapter.headerInset(this.root,viewport) : 20;
        this.ui.layout(viewport);
        this.ui.render([],null);
        return;
      }
      this.cancelJump();
      this.ui.closePreview();
      this.ui.render([], null);
      this.setState(State.IDLE);
      return;
    }
    const viewport = this.adapter.viewport(this.scroller);
    const inset = this.adapter.headerInset(this.root, viewport);
    this.inset = inset;
    this.viewport = viewport;
    const scrollTop = this.scroller.scrollTop;
    for (const exchange of this.exchanges) {
      exchange.top = exchange.startElement.getBoundingClientRect().top - viewport.top + scrollTop;
    }
    const readingLine = scrollTop + inset + Math.min(70, viewport.height * .1);
    const currentIndex = activeExchange(this.exchanges, readingLine);
    const atBottom = this.scroller.scrollHeight - scrollTop - this.scroller.clientHeight < 24;
    this.activeId = (atBottom ? this.exchanges.at(-1) : this.exchanges[Math.max(0, currentIndex)])?.id;
    this.readingCurrent = atBottom || isReadingCurrent(this.exchanges, readingLine);
    this.ui.host.dataset.latestTop = String(Math.round(this.exchanges.at(-1).top));
    this.ui.host.dataset.readingLine = String(Math.round(readingLine));
    this.contentEnd = this.scroller.scrollHeight;
    this.ui.layout(viewport);
    // Freeze visible targets during an open picker or pointer gesture.
    const pinned = this.state === State.PREVIEW || this.ui.gesture;
    const members = pinned
      ? this.ui.groups.flatMap(group => group.members).map(member => {
        const current = this.exchanges.find(exchange => exchange.id === member.id);
        return current && { ...current, ordinal: this.exchanges.indexOf(current) + 1 };
      }).filter(Boolean)
      : nearbyExchanges(this.exchanges, this.activeId);
    const groups = members.map((member, index) => ({ key: member.id, members: [member], fraction: index / Math.max(1, members.length - 1) }));
    if (!groups.length && this.state !== State.SEARCH) {
      this.ui.closePreview();
      this.setState(State.IDLE);
      return;
    }
    this.ui.render(groups, this.activeId);
    if (this.state === State.JUMPING || this.state === State.SEARCH) return;
    if (this.state === State.PREVIEW) {
      // An open preview is explicit navigation intent. Host scroll anchoring or
      // lazy-history hydration must not dismiss it underneath the user's pointer.
      return;
    }
    if (this.readingCurrent) this.setState(State.READING_CURRENT);
    else if (fromScroll || (this.lastScrollAt && performance.now() - this.lastScrollAt < 1500)) {
      this.setState(State.NAVIGATING);
      this.armIdle();
    }
  }

  setState(state) {
    this.state = state;
    this.ui.setVisible([State.NAVIGATING, State.PREVIEW, State.JUMPING, State.SEARCH].includes(state), state);
  }

  armIdle() {
    clearTimeout(this.idleTimer);
    if ([State.PREVIEW, State.JUMPING, State.SEARCH].includes(this.state)) return;
    this.idleTimer = setTimeout(() => {
      // Keep keyboard focus visible until it leaves the navigation controls.
      if (this.ui.shadow.activeElement) { this.armIdle(); return; }
      this.setState(this.readingCurrent ? State.READING_CURRENT : State.NAVIGATING);
    }, 1500);
  }

  preview(members, fraction, keyboard = false, selectedId = members[0]?.id) {
    this.closeSearch();
    clearTimeout(this.idleTimer);
    this.cancelJump();
    this.setState(State.PREVIEW);
    this.ui.showPreview(members, fraction, keyboard, selectedId);
    this.ui.render(this.ui.groups, this.activeId);
  }

  closePreview(restoreFocus = false) {
    this.ui.closePreview(restoreFocus);
    this.setState(this.readingCurrent ? State.READING_CURRENT : State.NAVIGATING);
    this.armIdle();
  }

  syncSearch() {
    const sources = [];
    const add = (element, role, index, exchange) => {
      const text = role === 'prompt' ? exchange.inputText : this.adapter.text(element);
      if (role === 'answer' && this.adapter.contains(element,'[data-dil-render-failed]')) return;
      if (text) sources.push({ id: `${exchange.id}:${role}:${index}`, exchangeId: exchange.id,
        archiveId: `${role === 'prompt' ? exchange.id : this.adapter.getId(element)}:${role}:0`,
        inputText: exchange.inputText, context: exchange.context ?? exchange.inputText,
        role, text, sourceText: text, element,position:this.adapter.position(element,role),positionFrame:this.adapter.positionFrame(element),
        blockRanges:role==='answer'?this.adapter.blockRanges(element,text):undefined });
    };
    const addOutput = (element, index, exchange) => {
      add(element,'answer',index,exchange);
    };
    // Virtualized chats can begin with an answer whose prompt is no longer in
    // the DOM. Search that loaded answer without inventing a rail exchange.
    const unpaired = this.adapter.unpairedOutputs(this.root,this.exchanges);
    this.unpairedOutputCount = unpaired.length;
    for (const element of unpaired) {
      addOutput(element,0,{id:`unpaired:${this.adapter.getId(element)}`,inputText:'Earlier answer',context:''});
    }
    for (const exchange of this.exchanges) {
      add(exchange.inputElement,'prompt',0,exchange);
      exchange.outputs.forEach((element,index) => addOutput(element,index,exchange));
    }
    this.liveSearchSources=sources;
    this.searchSources=this.threadHistory.observe(sources,{prepend:this.scroller?.scrollTop<=2});
    this.searchIndex.sync(this.searchSources);
  }

  async restoreThreadCache(){
    if(!globalThis.chrome?.runtime?.id)return;
    const history=this.threadHistory;
    try{
      const cached=await chrome.runtime.sendMessage({type:'threadrail:library-thread'});
      if(this.destroyed||history!==this.threadHistory||cached?.error)return;
      this.threadHistory.restore((cached.chat?.messages??[]).map(m=>({...m,capturedAt:m.capturedAt??cached.chat.updatedAt})));
      this.syncSearch();this.searchIndex.restoreVectors(cached.vectors??[]);
      this.renderSearch();this.ensureSearchIndex();
    }catch{} // In-memory history and word search still work without storage.
  }

  async saveThreadVectors(batch){
    if(!globalThis.chrome?.runtime?.id)return;
    const url=chatURL(location.href);if(!url||this.archive.suppressedURL===url)return;
    const documents=batch.filter(d=>d.chatURL===url).map(d=>({id:d.id,embeddingText:d.embeddingText,
      embeddingVersion:d.embeddingVersion,vector:this.searchIndex.vectorCache.get(d.embeddingText),savedAt:d.savedAt}));
    if(documents.length)await chrome.runtime.sendMessage({type:'threadrail:library-thread-vectors',documents}).catch(()=>{});
  }

  openSearch(query = '') {
    this.archive.cancel();
    this.cancelJump();
    clearTimeout(this.idleTimer);
    this.setState(State.SEARCH);
    this.ui.openSearch(query);
    this.syncSearch();
    this.querySearch(query);
    this.ensureSearchIndex();
    this.measure();
  }

  closeSearch(restoreFocus = false) {
    if (this.ui.searchPanel.hidden) return;
    this.searchToken++;
    clearTimeout(this.searchDebounce);
    this.ui.closeSearch(restoreFocus);
    if (this.state === State.SEARCH) {
      this.setState(this.readingCurrent ? State.READING_CURRENT : State.NAVIGATING);
      this.armIdle();
    }
  }

  async openLibrary() {
    if (this.libraryOpening) return;
    this.libraryOpening = true;
    this.ui.libraryButton.disabled = true;
    this.ui.setLibraryError('');
    try {
      // Finish the current snapshot before the library reads its initial index.
      // A failed capture must not prevent opening the rest of the saved library.
      await this.archive.capture(true).catch(()=>{});
      const response = await chrome.runtime.sendMessage({type:'threadrail:library-show',query:this.ui.searchInput.value});
      if (!response?.ok) throw new Error(response?.error || 'Refresh this page, then try All chats again.');
    } catch (error) {
      // Extension reload invalidates existing content scripts. sendMessage can
      // throw synchronously, so attaching .catch() to its return value misses it.
      const text = /context invalidated|receiving end|establish connection|message port.*closed/i.test(error.message)
        ? 'Refresh this page, then try All chats again.' : error.message || 'Could not open All chats. Try again.';
      this.ui.setLibraryError(text);
      this.ui.announce(text);
    } finally {
      this.libraryOpening = false;
      this.ui.libraryButton.disabled = false;
    }
  }

  async ensureSearchIndex() {
    if (this.indexing || this.destroyed) return;
    const index = this.searchIndex;
    this.indexing = true;
    this.searchError = false;
    try {
      for (let batch; !this.destroyed && index === this.searchIndex && (batch = index.pending(8,{windowsOnly:true})).length;) {
        const vectors = await this.embeddingClient.embed(batch.map(document => document.embeddingText));
        if (this.destroyed || index !== this.searchIndex) return;
        index.accept(batch, vectors);
        await this.saveThreadVectors(batch);
        this.renderSearch();
      }
    } catch {
      if (index === this.searchIndex) this.searchError = true;
    } finally {
      this.indexing = false;
      if (!this.destroyed) {
        this.renderSearch();
        if (index !== this.searchIndex) this.ensureSearchIndex();
      }
    }
  }

  querySearch(query) {
    clearTimeout(this.searchDebounce);
    this.searchQuery = query.trim();
    this.searchToken++;
    this.renderSearch();
    if (!this.searchQuery) return;
    const token = this.searchToken;
    const index = this.searchIndex;
    const text = this.searchQuery;
    this.searchDebounce = setTimeout(async () => {
      try {
        if (!this.queryVectors.has(text)) {
          const [vector] = await this.embeddingClient.embed([retrievalQuery(semanticQuery(text))],{priority:true});
          if (this.destroyed || index !== this.searchIndex) return;
          if (this.queryVectors.size > 16) this.queryVectors.clear();
          this.queryVectors.set(text,vector);
        }
        if (token === this.searchToken && this.state === State.SEARCH) this.renderSearch();
      } catch { if (token === this.searchToken) { this.searchError = true; this.renderSearch(); } }
    }, 180);
  }

  renderSearch() {
    if (this.state !== State.SEARCH) return;
    const windows=this.searchIndex.documents.filter(d=>!d.isFine);
    const indexed = windows.filter(document => document.vector).length;
    const total = windows.length;
    const vector = this.queryVectors.get(this.searchQuery);
    const ranked = this.searchQuery ? this.rankedSearch.get(this.searchQuery,vector) : null;
    // A pending reranker has no final rows yet. Keep the already usable dense /
    // word candidates on screen instead of replacing them with an empty array.
    const results = ranked&&!ranked.pending ? ranked.results.slice(0,6) : this.searchIndex.search(this.searchQuery ?? '', vector);
    const keywordGroups = this.searchIndex.keywordGroups(this.searchQuery ?? '');
    const phase = this.searchError ? 'fallback' : indexed<total||Boolean(this.searchQuery&&!vector) ? 'indexing' : ranked?.pending ? 'ranking' : 'ready';
    const status = !this.searchQuery ? '' : this.searchError ? 'Smart search unavailable. Reopen to retry.'
      : indexed<total ? `Preparing search… ${indexed}/${total}` : this.searchQuery&&!vector ? 'Searching…'
      : ranked?.pending ? 'Ranking matches…' : ranked?.error ? 'Smart ranking unavailable'
      : '';
    this.ui.showSearch(results, { status, phase, keywordGroups, query: this.searchQuery,
      historyAvailable: this.adapter.hasEarlierHistory(this.root,this.scroller,this.threadHistory.messages),
      coverage: `${this.searchIndex.messageCount} ${this.searchIndex.messageCount===1?'message':'messages'} · History may be incomplete` });
  }

  async jumpSearch(result) {
    result=passageTarget(result);
    if(result.messageKey){
      const current=this.searchSources.find(s=>s.messageKey===result.messageKey);
      if(current&&current.sourceText!==result.sourceText){
        this.syncSearch();this.querySearch(this.ui.searchInput.value);
        this.ui.announce('This message changed. Search results have been refreshed.');return;
      }
      result={...result,element:current?.element??null};
    }
    if(!result.element?.isConnected && result.messageKey){
      this.closeSearch();
      this.setState(State.JUMPING);
      try{return await this.archive.jump({chatURL:chatURL(location.href),role:result.role,nativeId:result.nativeId,
        messageKey:result.messageKey,sourceText:result.sourceText,matchText:result.matchText??result.text,matchOffset:result.matchOffset??result.offset});}
      catch(error){this.ui.announce(`Unable to locate saved passage: ${error.message}`);}
      finally{if(this.state===State.JUMPING&&!this.jumpFrame){this.setState(State.NAVIGATING);this.armIdle();}}
      return;
    }
    if (!result.element?.isConnected || this.adapter.text(result.element) !== result.sourceText) {
      this.syncSearch(); this.querySearch(this.ui.searchInput.value);
      this.ui.announce('This message changed. Search results have been refreshed.'); return;
    }
    this.closeSearch();
    const token = this.searchToken, adapter = this.adapter, route = this.routeKey();
    const revealed = await adapter.revealSearchTarget(result.element);
    if (this.destroyed || this.adapter !== adapter || this.routeKey() !== route || token !== this.searchToken) return;
    if (!revealed?.isConnected || adapter.text(revealed) !== result.sourceText) {
      this.ui.announce('Expand the matching message, then search again.'); return;
    }
    result = {...result,element:revealed};
    const exchange = this.exchanges.find(item => item.id === (result.liveExchangeId??result.exchangeId));
    if (!this.scroller) return;
    // First reveal the turn, which materializes content-visibility on ChatGPT.
    const jumpId = exchange?.id ?? null;
    this.startJump(jumpId, () => exchange ? this.destination(exchange)
      : result.element.getBoundingClientRect().top - this.adapter.viewport(this.scroller).top + this.scroller.scrollTop - this.inset, () => {
      const range = passageRange(result.element,result.matchText ?? result.text,result.matchOffset ?? result.offset);
      if (!range) { this.ui.highlightElement(result.element); this.ui.announce('Jumped to the matching message'); return; }
      this.startJump(jumpId, () => {
        const rect = range.getBoundingClientRect();
        return rect.top - this.adapter.viewport(this.scroller).top + this.scroller.scrollTop - this.inset;
      }, () => {this.ui.highlightElement(range);this.ui.announce('Jumped to the matching passage');});
    });
  }

  loadSearchHistory() {
    if(!this.adapter.hasEarlierHistory(this.root,this.scroller,this.threadHistory.messages)){this.renderSearch();return;}
    const query = this.ui.searchInput.value;
    const anchor = this.exchanges.find(exchange => exchange.id === this.activeId);
    const offset = anchor?.startElement.getBoundingClientRect().top;
    this.closeSearch();
    this.jumpTop(() => {
      this.refresh();
      if (anchor?.startElement.isConnected) {
        const top = anchor.startElement.getBoundingClientRect().top + this.scroller.scrollTop - offset;
        this.scroller.scrollTo({top,behavior:'instant'});
      }
      this.openSearch(query);
    });
  }

  jump(id, keyboard = false) {
    this.archive.cancel();
    const exchange = this.exchanges.find(item => item.id === id);
    if (!exchange || !this.scroller) return;
    this.startJump(id, () => this.destination(exchange), () => {
      const current = this.exchanges.find(item => item.id === id);
      if (!current?.inputElement.isConnected) return;
      this.ui.highlightElement(current.inputElement);
      this.ui.announce(`Jumped to: ${current.inputText.slice(0, 90)}`);
      if (keyboard) {
        const element = current.inputElement;
        const oldTabIndex = element.getAttribute('tabindex');
        element.setAttribute('tabindex', '-1');
        element.focus({ preventScroll: true });
        // Restore the exact original attribute without leaving a lasting DOM change.
        if (oldTabIndex === null) element.removeAttribute('tabindex');
        else element.setAttribute('tabindex', oldTabIndex);
      }
    });
  }

  destination(exchange) {
    const current = this.exchanges.find(item => item.id === exchange.id) ?? exchange;
    const viewport = this.adapter.viewport(this.scroller);
    return current.startElement.getBoundingClientRect().top - viewport.top + this.scroller.scrollTop - this.inset;
  }

  jumpTop(arrived) {
    this.archive.cancel();
    this.closeSearch();
    if (!this.scroller) return;
    this.cancelJump();
    clearTimeout(this.idleTimer);
    this.ui.closePreview();
    this.setState(State.JUMPING);
    this.ui.setTopLoading(true);
    const scroller = this.scroller;
    const began = performance.now();
    let changedAt = began;
    let previousSignature = '';
    let activatedControl=null,activatedSignature='';
    // Instant positioning is deliberate: a smooth animation through a very long
    // transcript can be interrupted by the host's own scroll anchoring.
    const monitor = () => {
      this.topTimer = null;
      const now = performance.now();
      const signature = `${this.exchanges.length}:${this.exchanges[0]?.id}`;
      const loading = this.adapter.historyLoading(this.root, scroller);
      if (signature !== previousSignature || loading || scroller.scrollTop > 2) changedAt = now;
      previousSignature = signature;
      scroller.scrollTo({ top: 0, behavior: 'instant' });
      const control=this.adapter.olderHistoryControl(this.root);
      if(control&&!control.disabled&&!loading&&(control!==activatedControl||signature!==activatedSignature)){
        activatedControl=control;activatedSignature=signature;control.click();changedAt=now;
      }
      if (now - changedAt >= 2500 || now - began >= 45000) {
        this.ui.setTopLoading(false);
        this.setState(State.NAVIGATING);
        this.measure();
        this.ui.announce(now - changedAt >= 2500 ? 'Reached the top of the conversation' : 'Earlier history is still loading. Press Top to continue.');
        this.armIdle();
        arrived?.();
        return;
      }
      this.topTimer = setTimeout(monitor, 200);
    };
    monitor();
  }

  jumpBottom() {
    this.archive.cancel();
    if (!this.scroller) return;
    this.startJump(null, () => this.scroller.scrollHeight - this.scroller.clientHeight,
      () => this.ui.announce('Jumped to the latest message'));
  }

  startJump(id, target, arrived) {
    this.closeSearch();
    this.cancelJump();
    clearTimeout(this.idleTimer);
    this.ui.closePreview();
    this.setState(State.JUMPING);
    this.jumpId = id;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const max = () => Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    let top = clamp(target(), 0, max());
    const scroller = this.scroller;
    scroller.scrollTo({ top, behavior: reduced ? 'instant' : 'smooth' });
    const began = performance.now();
    let stableFrames = 0;
    let previous = scroller.scrollTop;
    let corrections = 0;
    const monitor = () => {
      const elapsed = performance.now() - began;
      stableFrames = Math.abs(previous - scroller.scrollTop) < .5 ? stableFrames + 1 : 0;
      previous = scroller.scrollTop;
      const destination = clamp(target(), 0, max());
      const reached = Math.abs(scroller.scrollTop - destination) < 3;
      if (!reached && Math.abs(top - destination) > 3 && stableFrames > 2 && corrections < 3 && elapsed < 2200) {
        top = destination;
        corrections++;
        stableFrames = 0;
        scroller.scrollTo({ top, behavior: reduced ? 'instant' : 'smooth' });
      }
      if ((reached && stableFrames > 2) || (elapsed > 350 && stableFrames > 8) || elapsed > 2400) {
        this.jumpFrame = null;
        this.jumpId = null;
        this.setState(State.NAVIGATING);
        this.measure();
        arrived();
        this.armIdle();
      } else this.jumpFrame = requestAnimationFrame(monitor);
    };
    this.jumpFrame = requestAnimationFrame(monitor);
  }

  cancelJump() {
    clearTimeout(this.topTimer);
    this.topTimer = null;
    this.ui.setTopLoading(false);
    if (this.jumpFrame) {
      cancelAnimationFrame(this.jumpFrame);
      this.scroller?.scrollTo({ top: this.scroller.scrollTop, behavior: 'instant' });
      this.jumpFrame = null;
    }
    this.jumpId = null;
  }

  keydown(event) {
    if (event.key === 'Escape') this.archive.cancel();
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyF') {
      event.preventDefault(); this.openSearch(); return;
    }
    if (event.key === 'Escape' && this.state === State.SEARCH) {
      event.preventDefault(); this.closeSearch(true); return;
    }
    if (event.key === 'Escape' && this.state === State.JUMPING) {
      event.preventDefault();
      this.cancelJump();
      this.setState(State.NAVIGATING);
      this.armIdle();
      return;
    }
    if (event.key === 'Escape' && this.state === State.PREVIEW) {
      event.preventDefault();
      this.closePreview(true);
      return;
    }
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      const completed = this.exchanges.filter(exchange => exchange.completed);
      if (!completed.length || this.exchanges.length < 2) return;
      event.preventDefault();
      const active = this.exchanges.find(exchange => exchange.id === this.activeId);
      const target = event.key === 'ArrowUp'
        ? completed.filter(exchange => exchange.top < (active?.top ?? Infinity) - 1).at(-1) ?? completed[0]
        : completed.find(exchange => exchange.top > (active?.top ?? -1) + 1) ?? completed.at(-1);
      this.jump(target.id, true);
    }
  }

  destroy() {
    this.destroyed = true;
    this.archive.destroy();
    this.searchToken++;
    clearTimeout(this.searchDebounce);
    clearTimeout(this.warmTimer);
    this.embeddingClient.destroy();
    this.cancelJump();
    this.abort.abort();
    this.scrollAbort?.abort();
    this.mutations.disconnect();
    this.resizeObserver.disconnect();
    clearInterval(this.routeTimer);
    clearTimeout(this.refreshTimer);
    clearTimeout(this.idleTimer);
    cancelAnimationFrame(this.measureFrame);
    this.ui.destroy();
  }
}

// The guard also makes repeated activation from the extension popup safe.
if (!globalThis.__threadrail) {
  const instance = { controller: null };
  globalThis.__threadrail = instance;
  const boot = async () => {
    const storage = globalThis.chrome?.storage?.local;
    const { sites = {} } = storage ? await storage.get('sites') : {};
    instance.controller?.destroy();
    instance.controller = null;
    // The Local viewer already runs its own page-level rail. An opted-in
    // extension copy must not replace it from a separate isolated world.
    if (globalThis.chrome?.runtime?.id && document.querySelector('meta[name="threadrail-local"]')) return;
    document.querySelector('threadrail-navigation')?.remove();
    const profile = profileFor(location.hostname, sites[location.origin]);
    if (profile) instance.controller = new ThreadRail(profile);
  };
  globalThis.chrome?.runtime?.onMessage?.addListener((message, _sender, respond) => {
    if(message.type==='threadrail:archive-verify'){
      if(_sender.id!==chrome.runtime.id||typeof message.expectedPassage!=='string'||message.expectedPassage.length>1200){respond({error:'Invalid passage verification'});return;}
      const controller=instance.controller;
      if(!controller){respond({error:'ThreadRail is not active on this page.'});return;}
      controller.archive.verify(message.target,message.expectedPassage).then(respond).catch(error=>respond({error:error.message}));return true;
    }
    if (message.type === 'threadrail:reload') {
      boot().then(() => respond({ ok: true })).catch(error => respond({ error: error.message }));
      return true;
    }
    if (message.type === 'threadrail:archive-cancel') {instance.controller?.archive.cancel();respond({ok:true});return;}
    if(message.type==='threadrail:archive-reset'){
      const controller=instance.controller,url=chatURL(location.href);
      if(controller&&(!message.url||message.url===url)){
        controller.archive.cancel();controller.archive.suppressedURL=url;
        controller.threadHistory=new ThreadHistory(url??controller.routeKey());
        controller.searchIndex=new SearchIndex(SEARCH_MODEL);
        controller.rankedSearch=controller.createRankedSearch();
        controller.syncSearch();
        if(controller.state===State.SEARCH)controller.querySearch(controller.ui.searchInput.value);
        controller.ensureSearchIndex();controller.renderSearch();
      }
      respond({ok:true});return;
    }
    if (message.type === 'threadrail:archive-discover' || message.type === 'threadrail:archive-scan' || message.type === 'threadrail:archive-jump') {
      const controller = instance.controller;
      if (!controller) { respond({error:'ThreadRail is not active on this page.'}); return; }
      const task = message.type === 'threadrail:archive-discover' ? controller.archive.discover()
        : message.type === 'threadrail:archive-scan' ? controller.archive.scan() : controller.archive.jump(message.target);
      task.then(result => {
        // DOM elements used for a passage jump never cross extension messaging.
        respond(result?.matched ? {ok:true} : result);
      }).catch(error => {
        if(message.type==='threadrail:archive-jump')controller.ui.announce(`Unable to locate saved passage: ${error.message}`);
        console.warn('[ThreadRail] Saved-chat action failed.',error);
        respond({error:error.message});
      });
      return true;
    }
    if (message.type === 'threadrail:status') {
      const controller = instance.controller;
      respond({ provider: controller?.profile.name, state: controller?.state,
        exchanges: controller?.exchanges.length ?? 0,
        completed: controller?.exchanges.filter(exchange => exchange.completed).length ?? 0,
        enabled: !!controller, version: globalThis.chrome.runtime.getManifest().version });
    }
  });
  boot().catch(error => console.warn('[ThreadRail] Unable to initialize.', error));
}
