import { PROFILES } from './profiles.js';

export function visible(element) {
  return element.getClientRects().length > 0 && !element.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(element).display !== 'none';
}

export function cleanText(element) {
  const copy = element.cloneNode(true);
  copy.querySelectorAll('button, nav, script, style, [role="toolbar"], [aria-hidden="true"], .sr-only, .cdk-visually-hidden, .visually-hidden, .screen-reader-only, [data-markdown-copy="exclude"]').forEach(node => node.remove());
  return copy.textContent.replace(/\s+/g, ' ').trim();
}

export class ConversationAdapter {
  constructor(profile = PROFILES.chatgpt) {
    this.profile = profile;
    this.ids = new WeakMap();
    this.textCache = new WeakMap();
    this.blockCache = new WeakMap();
    this.nextId = 0;
  }

  getRoot() {
    if (this.profile.id === 'claude') {
      const transcript = document.querySelector('[data-testid="transcript-list"]');
      if (transcript) return transcript;
    }
    const roots = [...document.querySelectorAll(this.profile.root)];
    const messages = `${this.profile.user}, ${this.profile.assistant}`;
    // The cloud shell can leave empty or hidden main regions before the live
    // transcript. Select a region containing a rendered message, including when
    // an SPA replaces the initial composer with a conversation.
    return roots.find(root => [...root.querySelectorAll(messages)].some(visible)) ?? roots[0] ?? null;
  }

  getId(element) {
    const turn = element.closest('[data-turn-key], [data-testid^="conversation-turn-"], .conversation-container, [data-testid="transcript-row"]');
    const id = element.dataset.messageId || element.dataset.chatgptSearchMessageIds ||
      turn?.dataset.turnKey || turn?.dataset.turnId || (turn?.dataset.testid?.startsWith('conversation-turn-') ? turn.dataset.testid : null) || turn?.id || element.id;
    if (id) return `${this.profile.id}:${id}`;
    if (!this.ids.has(element)) this.ids.set(element, `${this.profile.id}:exchange-${++this.nextId}`);
    return this.ids.get(element);
  }

  scope(element) { return this.profile.turn ? element.closest(this.profile.turn) ?? element : element; }
  contains(element, selector) { return !!selector && (element.matches(selector) || !!element.querySelector(selector)); }

  anchor(element) {
    // Off-screen content-visibility children can report zero geometry. Their turn
    // wrapper retains its layout box, including its intrinsic placeholder height.
    if (this.profile.id === 'chatgpt') {
      const turn = element.closest('[data-turn-key]');
      if (turn) return turn;
    }
    return this.scope(element);
  }

  text(element) {
    const raw = element.textContent;
    const cached = this.textCache.get(element);
    if (cached?.raw === raw) return cached.text;
    const text = cleanText(element);
    this.textCache.set(element, { raw, text });
    return text;
  }

  blockRanges(element,text=this.text(element)) {
    const cached=this.blockCache.get(element);
    if(cached?.text===text)return cached.ranges;
    const ranges=[];
    if(text.split(/\s+/).length>140){
      const selector='p, pre, li, blockquote, h1, h2, h3, h4';let cursor=0;
      for(const block of element.querySelectorAll(selector)){
        if(block.querySelector(selector))continue;
        const value=this.text(block);if(!value)continue;
        // Search forward only: rewinding would map a repeated paragraph to its
        // earlier copy and shift every later block with it.
        const start=text.indexOf(value,cursor);
        if(start>=0){ranges.push([start,start+value.length]);cursor=start+value.length;}
      }
    }
    this.blockCache.set(element,{text,ranges});return ranges;
  }

  position(element,role) {
    const article=element.closest('[role="article"][aria-label], [aria-posinset]');
    const ordinal=article?.getAttribute('aria-posinset')??article?.getAttribute('aria-label')?.match(/^Message (\d+) of \d+$/)?.[1];
    if(ordinal)return Number(ordinal);
    const turn=element.closest('[data-testid^="conversation-turn-"]')?.dataset.testid?.match(/^conversation-turn-(\d+)$/)?.[1];
    return turn===undefined?undefined:Number(turn)*2+(role==='answer'?1:0);
  }

  positionFrame(element) {
    const article=element.closest('[role="article"][aria-label], [aria-posinset]');
    const total=article?.getAttribute('aria-label')?.match(/^Message \d+ of (\d+)$/)?.[1]??article?.getAttribute('aria-setsize');
    if(total)return `messages:${total}`;
    if(article?.hasAttribute('aria-posinset'))return 'aria-position';
    return element.closest('[data-testid^="conversation-turn-"]')?'conversation-turn':undefined;
  }

  olderHistoryControl(root) {
    if (!root) return null;
    const messages=`${this.profile.user}, ${this.profile.assistant}`;
    return [...root.querySelectorAll('button, [role="button"]')].find(button=>
      visible(button)&&!button.disabled&&button.getAttribute('aria-disabled')!=='true'&&!button.closest(messages)&&
      /^(?:load|show) (?:older|earlier|previous)(?: messages)?$/i.test((button.getAttribute('aria-label')||button.textContent).trim()))??null;
  }

  hasEarlierHistory(root,scroller,captured=[]) {
    if (!root || !scroller) return false;
    // Search already includes retained text. A virtualized tail is not evidence
    // of missing earlier search coverage when the beginning was captured before.
    const messages=[...root.querySelectorAll(`${this.profile.user}, ${this.profile.assistant}`)]
      .filter(node=>visible(node)&&!node.parentElement?.closest(`${this.profile.user}, ${this.profile.assistant}`));
    const first=messages[0];
    const ordinal=first?.closest('[aria-posinset], [role="article"][aria-label]');
    const numbered=ordinal&&(ordinal.hasAttribute('aria-posinset')||/^Message \d+ of \d+$/.test(ordinal.getAttribute('aria-label')??''));
    const zeroBased=/^conversation-turn-\d+$/.test(first?.closest('[data-testid^="conversation-turn-"]')?.dataset.testid??'');
    const origin=numbered?1:zeroBased?0:null;
    const earliest=captured.reduce((start,message)=>Number.isFinite(message.position)?Math.min(start,message.position):start,Infinity);
    if(origin!==null&&Number.isFinite(earliest)&&earliest<=origin)return false;
    if(this.olderHistoryControl(root)||this.historyLoading(root,scroller))return true;
    return origin!==null&&Number.isFinite(earliest)&&earliest>origin;
  }

  historyFrontier(root,scroller) {
    // Virtualized feeds keep the newest reply pinned after an unloaded gap.
    // Follow the contiguous window before that gap, rather than jumping to the
    // pinned tail or spending hundreds of viewport steps inside one answer.
    const rows=[...root.querySelectorAll('[role="article"][aria-label], [aria-posinset]')]
      .filter(visible).map(element=>({element,position:Number(element.getAttribute('aria-posinset')??element.getAttribute('aria-label')?.match(/^Message (\d+) of \d+$/)?.[1]??NaN)}))
      .filter(row=>Number.isFinite(row.position));
    let frontier=rows[0];
    for(const row of rows.slice(1)){
      if(row.position>frontier.position+1)break;
      frontier=row;
    }
    if(frontier)return frontier.element;
    const messages=[...root.querySelectorAll(`${this.profile.user}, ${this.profile.assistant}`)]
      .filter(node=>visible(node)&&!node.parentElement?.closest(`${this.profile.user}, ${this.profile.assistant}`));
    const viewport=this.viewport(scroller);
    // On feeds without public ordinals, advance past the message at the reading
    // edge. Do not skip every currently rendered message in a single jump.
    return messages.find(node=>this.anchor(node).getBoundingClientRect().bottom>viewport.top+32)??messages.at(-1);
  }

  advanceHistory(root,scroller) {
    const messages=`${this.profile.user}, ${this.profile.assistant}`;
    const control=[...root.querySelectorAll('button')].find(button=>
      !button.disabled&&visible(button)&&!button.closest(messages)&&
      /^load (later|more|next) messages$/i.test((button.getAttribute('aria-label')||button.textContent).trim()));
    if(control){control.scrollIntoView({block:'center',behavior:'instant'});control.click();return;}
    const frontier=this.historyFrontier(root,scroller);
    const viewport=this.viewport(scroller),before=scroller.scrollTop;
    const end=frontier?this.anchor(frontier).getBoundingClientRect().bottom-viewport.top+before:before;
    scroller.scrollTo({top:Math.max(before+Math.max(160,viewport.height*.72),end-viewport.height*.3),behavior:'instant'});
  }

  async revealSearchTarget(element) {
    // Gemini keeps the full prompt in the DOM while clipping its bubble. A text
    // range can therefore have plausible geometry even though it is not visible.
    const prompt = element.closest('user-query');
    const text = prompt?.querySelector('.query-text.collapsed');
    const toggle = prompt?.querySelector('button[data-test-id="luminous-expand-button"]');
    if (!text || !toggle || !visible(toggle)) return element;
    toggle.click();
    const began = performance.now();
    let previous = -1, stable = 0;
    return new Promise(resolve => {
      const settled = () => {
        if (!prompt.isConnected) { resolve(null); return; }
        // The host may replace the text node when expanding the bubble.
        const current = prompt.querySelector('.query-text');
        if (!current) { resolve(null); return; }
        const height = current.getBoundingClientRect().height;
        stable = Math.abs(height - previous) < .5 ? stable + 1 : 0;
        previous = height;
        const expanded = !current.classList.contains('collapsed');
        if (expanded && stable >= 3 && performance.now() - began >= 150) resolve(current);
        else if (performance.now() - began > 1500) resolve(null);
        else requestAnimationFrame(settled);
      };
      requestAnimationFrame(settled);
    });
  }

  unpairedOutputs(root, exchanges) {
    if (!root) return [];
    const paired = new Set(exchanges.flatMap(exchange => exchange.outputs));
    const selector = `${this.profile.user}, ${this.profile.assistant}`;
    return [...root.querySelectorAll(this.profile.assistant)].filter(node =>
      visible(node) && !paired.has(node) && !node.parentElement?.closest(selector));
  }

  read() {
    const root = this.getRoot();
    if (!root) return { root: null, exchanges: [] };
    const { user, assistant, userText, streaming, complete, stop } = this.profile;
    const selector = `${user}, ${assistant}`;
    const nodes = [...root.querySelectorAll(selector)].filter(node => visible(node) && !node.parentElement?.closest(selector));
    const exchanges = [];
    for (const node of nodes) {
      if (node.matches(user)) {
        const content = (userText && node.querySelector(userText)) || node;
        exchanges.push({
          id: this.getId(node), inputText: this.text(content) || 'Message with an attachment',
          inputElement: content, startElement: this.anchor(node),
          outputs: [], completed: false, top: 0,
        });
      } else if (exchanges.length) exchanges.at(-1).outputs.push(node);
    }
    const busy = !!stop && [...document.querySelectorAll(stop)].some(visible);
    for (const [index, exchange] of exchanges.entries()) {
      const lastOutput = exchange.outputs.at(-1);
      if (!lastOutput) continue;
      exchange.outputElement = lastOutput;
      const turn = this.scope(lastOutput);
      const isStreaming = exchange.outputs.some(output => this.contains(this.scope(output), streaming)) ||
        (index === exchanges.length - 1 && busy);
      const hasContent = exchange.outputs.some(output => !!this.text(output) || !!output.querySelector('img, video, audio, canvas'));
      const explicit = this.contains(turn, complete);
      exchange.completed = hasContent && !isStreaming && (index < exchanges.length - 1 || explicit);
      const repeated=exchanges.filter(item=>item.inputText.toLocaleLowerCase()===exchange.inputText.toLocaleLowerCase()).length>1;
      if(repeated||exchange.inputText.trim().split(/\s+/).length<=3){
        exchange.previewContext=exchange.outputs.map(output=>this.text(output)).join(' ').slice(0,220);
      }
    }
    return { root, exchanges };
  }

  findScroller(root, firstMessage) {
    for (let node = firstMessage ?? root; node && node !== document.body; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(overflowY) && node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 1) return node;
    }
    return document.scrollingElement ?? document.documentElement;
  }

  viewport(scroller) {
    if (scroller === document.scrollingElement || scroller === document.documentElement) {
      return { top: 0, left: 0, right: innerWidth, bottom: innerHeight, height: innerHeight };
    }
    return scroller.getBoundingClientRect();
  }

  historyLoading(root, scroller) {
    if (!root) return false;
    // Inspect host controls before the first message. ChatGPT's loading label
    // need not have a status role, and message text must never count as a loader.
    const viewport = this.viewport(scroller);
    const messages = `${this.profile.user}, ${this.profile.assistant}`;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.matches(messages)) break;
      const ownText = [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join(' ');
      const loading = node.getAttribute('aria-busy') === 'true' || node.hasAttribute('data-history-loading') || /loading (older|previous|earlier) messages/i.test(ownText);
      if (!loading || !visible(node)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.height < 220 && rect.top < viewport.top + 220 && rect.bottom >= viewport.top) return true;
    }
    return false;
  }

  headerInset(root, viewport) {
    let inset = 20;
    for (const header of document.querySelectorAll('header, [data-testid="conversation-header"], [data-testid="chat-header"], [data-app-shell-main-titlebar]')) {
      const rect = header.getBoundingClientRect();
      if (visible(header) && rect.top <= viewport.top + 24 && rect.bottom > viewport.top && rect.height < 150 &&
          rect.right > viewport.left && rect.left < viewport.right) inset = Math.max(inset, rect.bottom - viewport.top + 16);
    }
    return inset;
  }
}

export class ChatGPTAdapter extends ConversationAdapter {}
