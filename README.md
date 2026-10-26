# ThreadRail 1.6.14

Find your place, faster. Private conversation navigation for ChatGPT, Claude, Gemini, and other chat websites you enable.

## Install in Chrome or Edge

1. Unzip `release/threadrail-1.6.14.zip`, or use this project's `dist/` folder.
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Refresh your open ChatGPT, Claude, and Gemini tabs.

After reloading the extension, refresh existing chat tabs too. Chrome disconnects their old content scripts; otherwise All chats can stop opening. Version 1.5.3 shows a persistent refresh instruction when that happens and reports launch errors instead of failing silently.

The rail starts hidden. Open a conversation with at least two questions and scroll into an earlier exchange. Pin ThreadRail in your browser toolbar to see its detection status and website settings. Chrome on mobile does not load desktop extensions; touch controls work in browsers that support extensions.

## Supported interfaces

| Interface | Status |
| --- | --- |
| ChatGPT web | Installed and live-tested: previews, positional jumps, Top/Bottom, idle hiding, and scrolling within a long latest answer. Legacy and current layouts covered by automated tests. |
| Claude web | Installed and live-tested: exact-question previews, jumps, Top/Bottom, idle hiding, and keyboard navigation. |
| Gemini web | Installed and live-tested: previews, jumps, Top/Bottom, idle hiding, and long-press navigation. |
| Claude Code on the web | Live four-exchange session verified: rail, original prompts, Top/Bottom, three vague searches and all six sampled word-tag jumps. Installed-extension fixtures also cover capture and streaming. |
| Codex on the web | Shared ChatGPT transcript adapter for current chat routes and saved legacy `chatgpt.com/codex/tasks/<id>` URLs. Installed-extension fixture tests pass. Live session creation requires a cloud environment; this account has no available repository/environment. |
| Other chat websites, including self-hosted interfaces | Opt in per site using the toolbar popup. Semantic message attributes work automatically; custom CSS selectors handle other layouts. Compatibility depends on the site's rendered DOM. |
| Codex desktop/CLI and Claude Code desktop/terminal/IDE saved sessions | **ThreadRail Local companion available.** Reads local histories and provides the rail/search in its own viewer. Exact jumps occur in the viewer; stock app/terminal scrollbars are not controlled. |
| Claude Code native desktop/terminal mod | **1.7.0 installed and enabled.** The actual desktop pane and vague-query retrieval are verified through native controls. Original-message jumps are blocked by the host's `transcript not scrollable here` refusal. See [desktop/README.md](desktop/README.md). |
| Codex native transcript rail | Unimplemented: no supported original-transcript navigation hook found. A panel or companion is not equivalent. |
| Claude desktop chat and arbitrary native app/IDE windows | No injected native rail. The extension operates on web pages; the Local companion reads the supported session stores only. |

See `COMPATIBILITY.md` for verification evidence and limits. The user loaded the extension into their Chrome profile, after which live interaction tests were completed on ChatGPT, Claude, and Gemini without submitting, editing, or regenerating any messages. Streaming and touch behavior are covered by automated fixtures rather than live generation or a physical touch device.

## Codex and Claude Code desktop sessions

For the requested controls **inside Claude Code**, see [the native mod](desktop/README.md). It is separate from the viewer below. On this computer it is installed at user scope; an open Code session needs `/reload-plugins`, then `/threadrail`. Native Codex transcript controls remain unresolved.

Run `npm run native` after installing dependencies and building. Open **http://127.0.0.1:4187**, connect a source, and choose a saved session. The companion has the same rail and thread picker, smart search across indexed sessions, exhaustive word groups and exact passage jumps. **Copy resume command** provides the original session's CLI command without running it. For another project, run `npm run native -- --project /absolute/project/path`, or select All projects in the interface.

This is a separate read-only viewer; it does not add controls inside the stock Codex app or terminal. Native history remains in this page's memory, and no AI turn is sent. See [NATIVE.md](NATIVE.md) for startup, coverage, privacy and host limitations. A standalone package is built with `npm run package:native`.

## Navigation

- **Ten nearby exchanges:** the rail shows up to ten unnumbered ticks around your reading position, with the original thin spine and wider active tick. Only the visible ticks open a picker; blank gaps do not. The window stays fixed while you use an open picker.
- **Tap/click a marker** to open the nearby question list, with that marker’s original question selected, without scrolling the conversation.
- **Select the preview** to jump to its user message and answer.
- **Hold for 450 ms** to jump directly. Moving more than 8 px cancels the hold and starts scrubbing.
- **Drag between visible buttons** to select their previews. Moving through blank gaps selects nothing.
- **Top** moves to scroll position zero and keeps it there as the host loads earlier history. Its label shows Loading until history settles. After 45 seconds it stops and reports if loading is still in progress; press Top again to continue. Escape, scrolling, or clicking outside cancels it.
- **Bottom** returns to the latest message, including an answer still streaming.
- **Keyboard:** Tab to visible controls, Enter/Space to open, Up/Down/Home/End to move, Escape to dismiss. **Alt + Shift + Up/Down** jumps to the previous/next completed exchange even while the rail is hidden.

The rail remains hidden while reading the latest answer, even when that answer is very long or has finished generating. The search icon stays accessible, and the rail stays visible while you pause in older history. Short or repeated picker prompts retain their original text with a brief answer excerpt for context. Destination highlighting and screen-reader announcements identify a jump. Reduced-motion settings disable smooth scrolling and animations.

## Search this thread

Click the magnifying glass beside **Top**, or press **Alt + Shift + F** from anywhere in the conversation. Describe what you remember: “zen was being dumb where was this” is a supported test example. Search ranks original passages from both your messages and assistant answers using local meaning embeddings plus exact-word matching. Click a result to jump to that passage.

The off-white search panel shows **Smart matches** and **Word matches** side by side. Smart matches starts with two cards. Word matches lists every distinct query word vertically, with its matching-message count. Click a word to expand its first two captured inputs or answers underneath; click again to collapse. Multiple words can stay open. **Show more** adds up to 20 matches without a total word-result cap. Results follow conversation order, with one row per message. Observed message windows retain ordering evidence between stable message identities, including across unloaded gaps and pinned latest replies. Revisiting an older window repairs legacy cached ordering; that repaired order persists across reloads and is shared with All chats. Common English plural and “-ing” forms are grouped (for example, sing/sings/singing); this uses whole-word families, not substring matching. Actual source words are highlighted and used for precise jumps. Word matches work even if the local meaning model fails.

The search covers loaded and previously captured messages, independently of the rail's ten nearby buttons. Older captured text remains searchable after the host unloads it, including after a browser restart when local saving is enabled. The panel displays coverage. **Load earlier** appears only when public message numbering, a history loader, or an enabled older-message control indicates earlier uncaptured history. It loads through the host, restores your prior reading position when possible, and reruns the query. It stays hidden when the beginning is already captured or availability is unknown. Results are possible matches, not guaranteed answers. The first search needs time to load the packaged model and build an index; word matches appear immediately. The initial semantic model works best in English. It does not reliably reason through every ambiguous name, negation, or pronoun reference.

The model runs on this device, with no API key or external inference call. All model/runtime assets are included, making this package larger than the navigation-only version. The current thread and All chats share compatible captured text and vector caches in extension-owned IndexedDB. Window indexing warms in the background; fine passage vectors are computed only where a query needs them and reused on later searches. Selecting a saved offscreen result reloads its original message before jumping. Library Remove, Clear and pause control this saved history. See `SEARCH.md` for the algorithm, evaluation, and limits.

## Test search

Open **Test search** from All chats or the toolbar popup. Add a vague query, choose the expected saved chat, and paste a short, unique quote from the expected passage. You can also import a JSON test plan. Press **Run tests** once.

The runner tests each query twice, reloading saved chats and compatible vectors between rounds. It uses the same query encoding, ranking and per-chat selection as All chats. The first result must identify the expected chat and original message. It opens a fresh temporary chat tab, restores the saved message through normal host history loading, and checks the expected words in the original DOM. Both immediate and delayed measurements must place the full quote below the header and inside the reading viewport. A wrong first match, changed message, missing quote, ambiguous quote, model failure or failed landing is reported as a failure. It never substitutes a lower-ranked result to make a test pass.

Temporary test tabs close after each check; existing tabs and drafts are untouched. **Stop** cancels the run. Closing the runner also closes its test tabs. Reopening shows the last report without starting another run. Removing a saved chat or clearing the library also clears saved test plans and reports.

**Export report** saves a JSON file locally. Reports include chat titles, links, ranking and passage measurements. Queries and excerpts are omitted unless **Include queries and excerpts** is checked. Nothing is sent to an external service. This is a user-started test interface inside ThreadRail, with no external control bridge, HTTP endpoint or broader Chrome permissions.

A test-plan file has the form `{"cases":[{"query":"what you remember","expectedChatURL":"https://chatgpt.com/c/your-chat-id","expectedPassage":"a unique quote from the original message"}]}`. Up to 12 cases are supported. The workspace-specific plan in `diagnostics/live-smart-search.json` is kept outside the distributable extension and ZIP.

## Other chat websites

Open the chat website, click ThreadRail's toolbar icon, and choose **Enable on this site**. Chrome asks for access to that specific origin. This does not grant access to every website.

If no exchanges are detected, choose **Set up another chat interface**. Expand the advanced settings and specify CSS selectors for the conversation area, user messages, and assistant messages. Optional fields identify the prompt's text, outer turn, streaming state, completion indicator, and stop control. Selectors contain no executable code. If there is no reliable completion indicator, the latest response stays unmarked until another user message confirms the previous exchange has ended.

**Pause on this site** removes the rail and stops its observers. Settings and custom selectors persist locally across browser restarts. To revoke site access entirely, use Chrome's extension settings.

## Privacy and access

Navigation previews stay in memory. Cross-chat search saves readable conversation snapshots and their vectors in local IndexedDB; preferences use `chrome.storage.local`. Search inference runs locally without a search server, private chat APIs, prompt submission, or branch changes. Add chats opens normal website pages in temporary background tabs, so those sites make their ordinary authenticated page requests. No chat contents are uploaded to a search service. The library offers per-chat removal, pausing automatic saving, and Clear and pause. Private-browsing chats and unsaved temporary-chat routes are excluded.

Static content scripts run on `chatgpt.com`, `chat.openai.com`, `claude.ai`, and `gemini.google.com`. Other HTTP/HTTPS origins are **optional**, requested one site at a time. The background worker registers enabled custom sites, saves captured messages to the local library, and performs bundled-model inference. Cross-chat search runs in an extension page, so another chat website cannot read the combined library through its page DOM. `activeTab` and `scripting` allow the toolbar to activate a user-selected site without forcing a reload. Previews use plain text inside a Shadow DOM.

## Develop and test

Requires Node.js 22+.

```sh
npm ci --ignore-scripts
npm run prepare:model
npm run build
npx playwright install chromium
npm test
npm run demo
```

Open `http://127.0.0.1:4173` for the local interactive demo. It is a synthetic conversation and loads the same compiled content script as the extension. The scenario selector covers long answers, streaming, 200 exchanges, and a single exchange. The demo composer adds local sample exchanges.

`npm run package` builds `dist/` and creates `release/threadrail-1.6.6.zip`. Only bundled runtime assets are shipped. `npm run package:native` creates the separate Local companion package.

## Architecture and limitations

- `src/profiles.js`: provider-specific selectors and custom-profile validation.
- `src/chatgpt-adapter.js`: shared DOM extraction, completion detection, text caching, scroll-container discovery, and header insets.
- `src/content.js`: navigation state machine, DOM/resize observers, animation-frame scroll measurements, route resets, and lifecycle cleanup.
- `src/rail-ui.js` / `src/rail.css`: isolated controls, the ten-exchange picker, touch gestures, focus, theme, and motion support.
- `src/search-index.js` / `src/search-ranker.js`: cached passage preparation, two-stage in-thread retrieval, lexical/semantic ranking, and incremental vector invalidation.
- `src/thread-history.js`: captured chronology and message identities, separate from temporary DOM bindings.
- `src/embedding-engine.js`: packaged local inference, shared by the extension background and demo worker.
- `src/search-range.js`: exact passage resolution without changing host messages.
- `src/background.js`: per-origin registration and local search inference messaging.
- `src/popup.*` / `src/options.*`: status, per-site pause/activation, and optional selector setup.

One user message starts an exchange; subsequent assistant/tool continuations belong to it until the next user message. Streaming indicators override completion controls. A quiet stream is never assumed finished. Missing completion signals leave the latest exchange unmarked. Unsupported layouts fail closed without affecting the chat.

Only rendered messages can be captured; captured messages remain searchable when the host unloads them. Top repeatedly positions the host at its scroll boundary so the host can load earlier turns; ThreadRail never fetches missing history itself. It waits for recognized history-loading controls and a quiet interval. If the host exposes no loading signal and delays history longer than that interval, press Top again after the next batch appears. Browser extensions cannot access native app UI, terminal scrollback, cross-origin frames without separate permission, closed shadow roots, or host-rendered content that exposes no usable DOM. New site rollouts may require selector updates. Firefox compatibility is unverified.

Long-chat verification and its live-site limits are recorded in [LONG_CHAT_TESTS.md](LONG_CHAT_TESTS.md). Version 1.4.2 also searches loaded answers whose prompts are outside a virtualized window and isolates search typing from host editor shortcuts.

Version 1.4.3 adds ash rose and faint ivory gold tints across the rail, picker, search, and extension settings, with consistent system typography. Navigation and search behavior are unchanged.

## Search across saved chats (1.5.0)

Choose **All chats** below the thread search, or **Search all chats** in the extension popup. Describe a scene; results show the source chat title, website, role and excerpt. Clicking opens that conversation and locates the source passage. Smart matches ranks meaning first and offers up to twelve distinct conversations. Smart matches starts with two cards. Word rows list every query word and its count; expanding one reveals two messages, with Show more for the rest. Word matches retain chat/message order without a total-result cap.

Chats opened after this update are collected automatically while messages are readable. **Add chats** reads the open ChatGPT, Claude and Gemini sidebar lists, scrolls exposed lists to discover more links, then visits each discovered conversation in a temporary background tab. It reads and scrolls those pages without submitting anything or modifying the original tabs or drafts. Stop cancels the queue. Open a site's older/collapsed chat lists and run again to discover more. Custom websites are collected when visited; automatic sidebar scanning is limited to the three built-in sites.

Coverage is deliberately partial: this is a library of captured text, not a complete account export. Each chat scan is bounded to 45 seconds; inaccessible, collapsed or unexposed history can remain missing. Snapshots retain captured messages through host virtualization and may retain old edits/deletions. Reopening a result checks the live text and tries to load the passage; changed or inaccessible text reports unavailable instead of inventing a match. No native desktop or terminal history is indexed.

Installed-extension library test evidence and limits are recorded in [LIBRARY_TESTS.md](LIBRARY_TESTS.md).

Versions 1.5.1–1.5.2 align in-thread ranking with the library’s meaning-first scoring, normalize common British/American spelling variants only for embedding queries, and exclude host render-failure placeholders from search and new captures. Short generic answer fragments receive less semantic weight so they do not hide the original input. Literal word groups keep the original spelling and complete ordering.
