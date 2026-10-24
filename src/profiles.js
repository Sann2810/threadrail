const STREAMING = '[data-is-streaming="true"], [data-message-status="in_progress"], [data-perf-row-streaming="true"], [aria-busy="true"], .result-streaming';
const COMPLETE = '[data-message-status="complete"], [data-testid="copy-turn-action-button"], [data-testid="good-response-turn-action-button"], [data-testid="bad-response-turn-action-button"]';

export const PROFILES = {
  chatgpt: {
    id: 'chatgpt', name: 'ChatGPT / Codex web', root: 'main, [role="main"]',
    user: '[data-message-author-role="user"], [data-chatgpt-search-unit-key$=":user"]',
    assistant: '[data-message-author-role="assistant"], [data-chatgpt-search-unit-key$=":assistant"]',
    userText: '[data-message-content], .whitespace-pre-wrap, [data-user-message-bubble]',
    turn: 'article, [data-testid^="conversation-turn-"], [data-talvt-turn-state]',
    streaming: `${STREAMING}, [data-talvt-turn-state="streaming"], [data-talvt-turn-state="running"], [data-talvt-turn-state="in_progress"]`,
    complete: `${COMPLETE}, [data-talvt-turn-state="complete"]`,
    stop: '[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"], button[aria-label="Stop"]',
  },
  claude: {
    id: 'claude', name: 'Claude / Claude Code web', root: '[data-testid="transcript-list"], main, [role="main"]',
    user: '[data-testid="user-message"], [data-message-author-role="user"]',
    assistant: '[data-testid="assistant-message"], .font-claude-response, [data-message-author-role="assistant"]',
    userText: '[data-testid="user-message-text"]',
    turn: '[data-testid="transcript-row"], [data-perf-row], [data-test-render-count]',
    streaming: STREAMING,
    complete: `${COMPLETE}, [data-is-streaming="false"], [data-perf-row-streaming="false"], button[aria-label="Copy"], button[aria-label="Retry"]`,
    stop: 'button[aria-label="Stop response"], button[aria-label="Stop generating"], button[aria-label="Stop"], [data-testid="stop-response"], [data-testid="chat-input-stop"]',
  },
  gemini: {
    id: 'gemini', name: 'Gemini', root: 'main, [role="main"], chat-window',
    user: 'user-query', assistant: 'model-response', userText: '.query-text', turn: '.conversation-container',
    streaming: `${STREAMING}, [data-test-id="response-loader"]`,
    complete: `${COMPLETE}, button[aria-label="Copy"], button[aria-label="Good response"], [data-test-id="copy-button"]`,
    stop: 'button[aria-label="Stop response"], button[aria-label="Stop generating"], button[aria-label="Stop"], [data-test-id="stop-button"]',
  },
  generic: {
    id: 'generic', name: 'Semantic chat', root: 'main, [role="main"], body',
    user: '[data-message-author-role="user"], [data-role="user"], [data-author="user"], [data-testid="user-message"], user-query',
    assistant: '[data-message-author-role="assistant"], [data-role="assistant"], [data-author="assistant"], [data-testid="assistant-message"], model-response',
    userText: '[data-message-content], .whitespace-pre-wrap, .query-text',
    turn: 'article, [data-testid^="conversation-turn-"], [data-testid="transcript-row"], .conversation-container',
    streaming: STREAMING,
    complete: `${COMPLETE}, [data-is-streaming="false"], button[aria-label="Copy"], button[aria-label="Copy response"]`,
    stop: 'button[aria-label="Stop generating"], button[aria-label="Stop response"], [data-testid="stop-button"]',
  },
};

export function profileFor(hostname, custom) {
  if (custom?.enabled === false) return null;
  if (custom?.profile) return { ...PROFILES.generic, ...custom.profile, id: 'custom', name: 'Custom site' };
  if (['chatgpt.com', 'chat.openai.com'].includes(hostname)) return PROFILES.chatgpt;
  if (hostname === 'claude.ai') return PROFILES.claude;
  if (hostname === 'gemini.google.com') return PROFILES.gemini;
  return PROFILES.generic;
}

export const SELECTOR_FIELDS = ['root', 'user', 'assistant', 'userText', 'turn', 'streaming', 'complete', 'stop'];

export function validateProfile(profile, document) {
  for (const field of SELECTOR_FIELDS) {
    const selector = profile[field];
    if (['root', 'user', 'assistant'].includes(field) && !selector?.trim()) throw new Error(`${field} selector is required.`);
    if (typeof selector !== 'string' || selector.length > 2000) throw new Error(`${field} must be a CSS selector of at most 2000 characters.`);
    if (selector) {
      try { document.querySelector(selector); }
      catch { throw new Error(`Invalid ${field} CSS selector.`); }
    }
  }
  if (profile.user === profile.assistant) throw new Error('User and assistant selectors must be different.');
  return Object.fromEntries(SELECTOR_FIELDS.map(field => [field, profile[field].trim()]));
}
