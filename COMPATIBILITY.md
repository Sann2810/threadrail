# Compatibility evidence — 2026-10-16

Current build: ThreadRail 1.6.10. The initial live results below were recorded with 1.1.1; subsequent sections record later builds and their verification. The user installed the unpacked extension in Chrome. Initial live tests used existing signed-in conversations without sending, editing, or regenerating messages. The Claude Code web and ChatGPT Work checks use new text-only test chats explicitly requested by the user. Private chat excerpts are kept outside this source report.

## 1.6.10 conditional history action — 2026-10-23

The thread search's Load earlier action was always rendered. It now starts hidden and appears only when public message ordinals, an enabled older-message control outside transcript text, or a live history loader indicate earlier uncaptured history. Retained searchable text counts toward coverage: returning to a later virtualized window does not reintroduce the action after the beginning was captured. Unknown availability stays hidden. This is independent of smart-search completion and result paging.

The existing Top/history traversal also activates exposed older-message controls once per control/window signature, preserving its loading wait, cancellation and reading-position restoration. Changes to native disabled states and public ordinals update the search UI. No private history endpoints or account-completeness assumptions are added.

Validation passes **53 unit tests and 42 affected browser tests**. Coverage includes complete/unknown histories, a cropped numbered window, retained early messages after unmount, transcript-quoted controls, disabled/enabled native controls, actual prepend/capture and restored position, delayed Top batches, Top timeouts/cancellation, and real-model search/jumps on all three provider fixtures. These checks use isolated synthetic pages; no new signed-in live verification is claimed.

### 1.6.10 signed-in live verification after reload

Read-only checks were repeated in the user's actual ChatGPT, Claude and Gemini chats. Search finished with no progress status and Load earlier hidden in all three. The beginning was reached through Top; returning to the latest response did not reintroduce Load earlier. ChatGPT retained 36 captured messages while older sources unmounted. Claude's public history pager exposed all 108 message positions, with 103 indexed source records; older target articles were absent again at the latest window. Gemini retained all 16 rendered input/output messages and did not unload them during this sample.

Smart and literal selections reached their original source passages on all three sites. Saved ChatGPT input and Claude answer selections restored sources absent from the DOM, including an early Claude answer and a later answer deep in the conversation. Gemini's semantic continuity passage and literal generation-tool heading were visibly reached. All three composers remained empty and no messages were sent. Private screenshots and audit data are kept outside the repository.

A separate live defect was found: cached keyword results are not consistently chronological on ChatGPT and Claude despite the Oldest first label. Their selected passage destinations are correct. This ordering defect remains unresolved by 1.6.10; the live verification did not change runtime code.

## 1.6.9 expandable word rows — 2026-10-23

Word matches now lists every distinct query word vertically, with its matching-message count beside it. Function words such as “how” and “to” are included in word lookup; smart retrieval keeps its existing stop-word filtering. Each word starts collapsed and expands its first two messages directly beneath its row. Multiple rows can stay open, with the existing Show more paging and chronological order.

The word index now groups conservative regular English plural and “-ing” forms: “sing” finds “singing” and “sings.” It does not perform arbitrary substring matching, so “single,” “string,” “using” and “Singapore” do not match “sing.” The index stores the actual earliest matching token and its source offset per whole message, preserving highlights, precise jumps and deduplication across word variants. This is a rule-based family index rather than a complete English lemmatizer. Smart ranking and model assets are unchanged.

Installed-extension regression fixtures on ChatGPT, Claude and Gemini reproduce “how to sing,” verify the three vertically aligned rows and correct counts, keyboard collapse/expansion, independent word expansion, and the exact deep-answer destination. These checks use isolated synthetic transcripts, not the user's signed-in singing chat. Validation passes **53 unit and 96 browser checks (149 total)**, including all 546 long-chat literal jumps, retained-history restart checks, and cross-chat reopening.

## 1.6.8 compact search UI — 2026-10-23

Thread search and All chats now use adjacent Smart matches and Word matches columns, including at narrow widths. Each starts with at most two result cards. Selecting a word tag shows that group's chronological inputs and answers; Show more exposes all remaining word matches in batches of up to 20. Expansion is retained while switching tags and while smart ranking finishes. A new chat or query resets disclosure. Ranking scores, source identities, and passage offsets are unchanged.

A copy subagent reviewed both surfaces. Repeated picker instructions, the thread privacy note, duplicated prompt labels and the library introduction were removed. Ready search has no progress message. Coverage retains an accurate canonical-message count and a concise partial-history notice. The ash rose, ivory gold and off-white palette is retained.

Validation passes **52 unit and 93 distinct browser checks (145 total)** across the full 91-case browser run and the final 39 affected checks, including two additional lifecycle/focus regressions. Layout tests cover 1280, 390 and 320 px; library tests also verify adjacent columns at 390 px. The three 200-exchange suites still expose every chronological word match and pass all **546 exact-result jumps**. Retained-history, browser-restart and saved-result reopening checks pass. All evidence for this UI revision uses isolated synthetic provider pages and the installed packaged extension where applicable. The user's signed-in extension library remains outside browser automation's allowed URL protocols; no new live-account library verification is claimed.

## 1.6.7 reader-experience corrections — 2026-10-23

The live reader walkthrough found a relevant saved Claude result that could not be reopened before the scan deadline. The collector walked a fraction of a viewport per step; a sequence of long answers exhausted that budget before reaching later message windows. Traversal now follows public message boundaries, distinguishes the contiguous window from a pinned latest reply, and uses the site's public Load later messages control when exposed. It still checks original message identity and source text before a passage jump, without private endpoints. Progress stays visible with Cancel. Unavailable targets offer Retry and restore the previous reading position; manual navigation cancels the scan without pulling the user back.

The new paged-history regression uses 128 messages, 14,000 px answers, a remote saved target and a pinned latest window. It must reach the original target through nine page loads and land below the header. This also exposed an independent word-jump issue: the display excerpt can span a tall preceding paragraph. Navigation now targets the actual highlighted word and source offset, including cross-chat library jumps, rather than the excerpt's first line.

The ash-rose/ivory-gold palette, light search surface and unnumbered picker remain. Search has a persistent icon; history navigation stays available while the reader pauses. Short or repeated prompts keep their original text and gain answer context. Auxiliary word groups are folded, retain all chronological results, and remain directly visible for single-word queries. Indexing, query understanding and final ranking have separate labels, and pending ranking preserves usable preliminary results. Small labels and footers have larger, darker text.

Validation: **52 unit and 87 browser checks pass (139 distinct checks)**. The final rebuilt 1.6.7 package also passed all 17 affected library, saved-navigation and reader-flow checks after the last shared-library refinements.

After the user reloaded 1.6.7, the actual reader walkthrough was repeated. The unchanged Claude query from the failed review selected the same saved result first, with completed ranking and no fallback. The target was absent from the initial tail window. Public history traversal restored its original Message 94 of 108, and the remembered sentence was readable below the fixed header. The earlier timeout is therefore resolved in this sampled live case. Gemini's unchanged character-continuity query also selected and reached its original answer. Search was opened through the persistent icon at the latest answer on both sites; history navigation stayed visible during a reading pause. Short picker prompts retained their original text with answer context. Expanded auxiliary groups retained their counts, and a single-word query exposed the same count directly. Labels measured 12 px and excerpts 13 px in the live UI.

The existing two-exchange ChatGPT compatibility chat now rendered both answers. The literal radiator group contained its input and answer, in that order; clicking the answer reached the actual line at 113 px. Its unchanged vague heating query selected the original input first and reached it at 77 px. This is a small real-site sample, not a new live ChatGPT long-history test. All three composers stayed empty and no messages were sent. Duplicate-identical short-prompt disambiguation, cancellation/retry, all chronological tag rows, 200-exchange retention, and cross-chat library reopening retain their automated scopes above. Private live audit metadata and screenshots are saved outside the repository.

The separate native Claude Code mod is version **1.7.0**, installed and enabled at user scope. Seven official engine UI tests and six recording-host callback tests pass; the complete root unit suite passes 37 tests. After the Mac was unlocked, native accessibility controls confirmed the real desktop composer button, Plugin pane, all 38 saved messages and correct vague-query retrieval in the existing film session. **Original-transcript jumps are blocked by the real desktop host**, which returns `transcript not scrollable here`; the offline kit separately lacks its scroll implementation. Screenshot capture returned an older image, so it is not used as visual proof. Native Codex original-transcript rail/search is not implemented. See [desktop/README.md](desktop/README.md) for precise scope and remaining host requirements.

## 1.6.6 indexing and retained history — 2026-10-17

Current-thread search retains captured inputs and answers when the host unmounts their DOM windows, and restores saved text and compatible vectors after a browser restart. Canonical text, paragraph offsets and stable identities are separate from temporary element bindings. Loaded edits replace the stored text; cached result rows do not retain detached transcript subtrees. An offscreen result reloads the original through the existing bounded public scroll scan and verifies identity and text before an exact passage jump. Remove/Clear invalidate retained histories in open tabs; paused/private/temporary chats do not gain persistent caches.

Window indexing warms in the background. Batches group similar lengths, identical text reuses inference work, and query/ranking requests have priority. Large cold histories first index overlapping windows, rank a twelve-window shortlist, and embed fine passages only inside selected windows; small or nearly complete indexes finish directly. The existing BGE threshold, verbatim offsets, entity checks and final passage ranker remain. Word groups are exhaustive over captured messages and independent of this semantic candidate selection.

Controlled isolated-browser replay on this Mac: the same 31,736-character, eight-exchange Gemini text and original handoff query took **227.6 s** on 1.6.5, **50.8 s** with the new pipeline, and **2.9 s** after reload with its cache. Both first results identified the relevant original handoff. This is one-machine replay evidence, not a live timing or universal latency guarantee; unseen history still needs initial indexing.

All three new 200-exchange retention tests preserve all 400 captured messages through an unload and browser restart. The unchanged vague kitchen query selects its source first, loads the missing window, and reaches the original paragraph (76–80 px below the fixtures' headers). After the small/warm-index refinement, recorded restart-to-ready times were 0.9–1.9 s in the parallel suite (9.5–11.1 s cold). Validation passes **52 unit and 82 browser tests (134 distinct checks)**. The full initial run covered 51 unit/81 browser cases; the legacy-Claude migration adds one passing unit case; final focused reruns passed the changed library/reopening, 200-exchange restart, and 24 strict passage checks, and the new live-tab cache-erasure case. Small/warm indexes skip redundant window ranking. The final Clear test also verifies active queries restart after their old index is invalidated, so they cannot remain permanently indexing.

### Installed-profile 1.6.6 confirmation

After the user reloaded the extension, computer-use checks on the actual signed-in sites confirmed:

- Claude's Top loaded the beginning of a 108-message chat (the initial tail reported only 32). An independently read early rental-billing passage disappeared when returning to Bottom. Its word result remained searchable and restored the real Message 4 of 108, with the matched line at 166 px. After a page reload showing only the latest window, the same saved word result and original-message jump passed again. The original cupboard/calculation paraphrase also selected its intended answer first and landed at 62 px, below the 48 px header. No fallback status was present.
- Both unchanged Gemini paraphrases selected their intended input/answer first with completed passage ranking. The handoff input automatically expanded; its remembered clause was readable in the viewport. The character-continuity paragraph began at 19 px. Reloading the page retained the handoff ranking and its expansion/jump. All 16 Gemini messages remained mounted, so this was a cache/retrieval/jump check, not a live Gemini-unload test.
- A new vague query on the actual long ChatGPT story selected its independently observed intended input first and clicked to it at 427 px, constrained by the conversation's bottom. That page exposed only five current inputs and blank answer bodies; this does not establish current live long-answer retention on ChatGPT.

One additional held-out Claude paraphrase about paying for idle rented hardware missed its intended billing example. A private isolated replay with exhaustive fine-passage indexing also missed it; the selective optimization did not introduce that miss in the comparison. Smart search remains approximate. Word lookup found the source, and its saved-message jumps passed. No provider message was sent and all three composers stayed empty. Private source excerpts, ranking audits and screenshots remain outside the repository. No new installed-profile latency benchmark was taken; the replay timings above retain their narrower scope.

## Live interaction results

| Check | ChatGPT web | Claude web | Gemini web |
| --- | --- | --- | --- |
| Installed content script and exchange detection | Passed; loaded-history count changes as older turns hydrate | Passed; 2 completed exchanges | Passed; 8 completed exchanges |
| Scrolling into history reveals the rail | Passed | Passed | Passed |
| Marker opens an original-question preview | Passed | Passed | Passed |
| Preview selection closes it and reaches the corresponding input | Passed; destination input at 68 px | Passed; destination input at approximately 56 px | Passed; destination input at 116 px, below the host header |
| Top reaches the first rendered exchange | Passed | Passed | Passed |
| Bottom returns to the latest message and hides the rail | Passed | Passed | Passed |
| Idle dismissal | Passed | Passed | Passed |
| Scrolling within the latest answer keeps the rail hidden | Passed; checked one viewport above the bottom of a long answer | Passed; checked above the absolute bottom | Passed; checked above the absolute bottom |
| Direct long-press jump without a preview | Shared gesture tested automatically | Shared gesture tested automatically | Passed live |
| Alt + Shift + Up keyboard navigation | Shared shortcut tested automatically | Passed live | Shared shortcut tested automatically |

Screenshots of the live previews are saved outside the source repository as private local artifacts.

## Fixes discovered during live testing

1. **ChatGPT history hydration:** offscreen, skipped content can provide misleading child geometry while older history loads. Anchoring to the outer turn's layout box avoids treating an earlier answer as the current answer. An open preview now stays open through host scroll anchoring and history layout changes. Navigation also corrects its destination when loading changes message positions.
2. **Gemini screen-reader labels:** previews exclude hidden accessibility labels such as “You said,” preserving the actual prompt text.

These cases are covered by synthetic regression fixtures. The complete automated run contains 10 model/retrieval tests and 37 Chromium browser tests, including actual MV3 extension loading in isolated profiles.

## 1.2 navigation corrections

- Replaced global coordinate picking and grouped markers with at most ten visible numbered buttons around the reading position. Every picker row corresponds to one of those buttons. Blank gaps pass pointer input through to the host page. The window remains fixed while the picker or a drag gesture is active.
- Top now targets the actual scroll boundary and repeats after prepended history moves the viewport. A loading label remains visible during the operation; Escape, scrolling, outside clicks, Bottom, and route changes cancel it.
- Regression fixtures exercise a 200-exchange transcript, window centering and edge clamping, invisible-gap rejection, stable picker contents, delayed history prepends (including a 3.2-second batch with a plain-text loading label), and cancellation.
- Provider fixtures for current ChatGPT, Claude chat, Claude Code web, and Gemini run with the actual installed MV3 package in isolated Chromium profiles.
- Chrome’s extension manager confirmed the installed build reloaded as 1.2.0. In the real long ChatGPT conversation, numbered markers and previous-exchange keyboard navigation were observed. Full Top-to-oldest verification could not be completed: the page initially rendered blank after refresh, and Chrome’s active window changed repeatedly during subsequent native automation. The delayed-history Top result above is automated fixture evidence, not a completed live Top test.

## 1.3 thread search

The magnifying glass beside Top opens a search panel; Alt+Shift+F works while the rail is hidden. The index covers user and assistant text throughout the current loaded DOM, with overlapping chunks and paragraph-level candidates for long outputs. BM25-style word matching is combined with a packaged MiniLM sentence encoder. No remote inference or runtime model download is used.

The actual model passed synthetic paraphrase retrieval, named-character ranking, passage-specific jumps in long answers, and installed-MV3 local inference tests. Additional checks cover route resets, edits, model failure fallback, keyboard dismissal, narrow viewport hit areas, and loading earlier history while preserving the reading position. See `SEARCH.md` for full evidence and limitations. Signed-in ChatGPT verification subsequently confirmed the installed 1.3.1 build, unnumbered ticks, visible search-icon activation, completed local semantic indexing, and returned results. Search-result navigation remains fixture-tested. Signed-in Claude and Gemini search remain unverified.

## 1.3.1 picker appearance

Restored the original unnumbered tick markers, thin rail spine, muted color, and wider active tick. The ten-exchange window, original glass preview styling, Top/Bottom behavior, and search remain. Interactive marker bounds now match the visible ticks, so restoring the appearance does not restore blank-track picking or invisible rectangular targets. Exchange ordinals remain available in accessible labels. Chrome was confirmed running 1.3.1 after reloading the installed extension and refreshing the existing ChatGPT tab; the site had previously retained 1.3.0.

## Other interfaces and limits

| Interface | Evidence and remaining scope |
| --- | --- |
| Claude Code web | Live four-exchange test session created and inspected; rail detection, original prompts, vague retrieval and exact passage jumps verified. See the 1.6.1 section. |
| Codex web | Shared ChatGPT adapter and task-route fixtures pass. Live cloud session creation is blocked by the account having no published environment or accessible repository; transcript compatibility remains unverified. |
| Other websites | Per-site activation, custom CSS selectors, reload persistence, pause, validation, and local preference storage passed in an isolated test package using a synthetic origin. Each real site needs semantic message attributes or a matching selector configuration. |
| Streaming, regeneration, edits, 200-exchange nearby windows, narrow touch viewports, reduced motion | Automated fixture coverage. No new live AI responses or physical touch-device test were used in this session. |
| Native Codex / Claude desktop, terminal sessions, IDE panels | Saved local sessions are supported through the separate ThreadRail Local viewer. No rail is injected into the stock app, terminal, or IDE panel. |

Only rendered turns can be indexed. In 1.2, Top holds scroll position zero while the host loads earlier messages, waiting for recognized loading controls and 2.5 seconds without history changes. The operation stops after 45 seconds with a continuation message if loading has not settled. The extension does not fetch unloaded history. Without a host loading signal, history delayed beyond the quiet interval may require another press of Top. A future site rollout may require adapter updates. Firefox is unverified.

### Codex web live retry — 2026-10-16

Opened Codex cloud through the real signed-in Chrome UI. The current workspace showed “No chats,” no selectable environment, and a disabled Send button. “Create environment” opened a dialog stating “No repositories are available to this connection,” with Get started disabled. No GitHub access was expanded and no cloud task was submitted. A screenshot of this prerequisite failure is saved outside the repository. Rail, search and passage jumps therefore remain unverified on a real Codex web transcript; this retry does not change the adapter-fixture evidence above.

### 1.6.3 cloud-shell detection — 2026-10-17

At the user's request, attempted a text-only test in Codex cloud; Send remained disabled without an environment. The page subsequently switched to ChatGPT Work, where a single text-only test exchange was successfully submitted and completed. This is ChatGPT Work evidence, not a Codex-mode transcript verification.

The live Work page exposed three main regions: the first two contained no messages, and the last held the completed exchange. The installed extension reported zero exchanges because it selected the first main region. Version 1.6.3 selects a configured region containing rendered message elements, skipping empty and hidden stale regions. All **37 unit tests and 10 provider browser tests pass**, including the new multi-main regression with prompt previews, all eight chronological literal results and a destination geometry check. Live verification after reloading follows below.

After the user reloaded, refreshed the real Work chat and confirmed exchange detection. Added a second authorized text-only reply with 40 numbered lines to create a scrollable transcript. Both completed exchanges produced original unnumbered picker entries; selecting the second reached its input at 116 px. Top reached scroll position 0; Bottom reached the actual maximum, 1101 px, and hid the rail. The composer remained empty after all search checks.

An independent DOM audit found three Zen messages, three San messages and two Rey messages. All eight word-result rows matched those sources in chronological input/answer order. Clicked every row: all eight reached the correct visible source passage, with the extension's passage highlight below the fixed header. The final Rey answer result reached the relevant line inside the 40-line output, rather than merely the start of that answer.

Smart retrieval had mixed results: “Zen made a foolish mistake” and “fixing the heating before bad winter weather” found the intended input passages and jumped successfully from the bottom of the transcript. “someone made a foolish kitchen mistake” and “packing luggage for a boat journey” returned no result. These misses remain open retrieval limitations; neither general vague-query accuracy nor Codex-mode compatibility is established by this two-exchange Work test. No All chats test was performed in this follow-up. Screenshots and detailed source/landing evidence are saved outside the repository.

## 1.6.4 root retrieval correction — 2026-10-17

The 1.6.3 misses above are superseded by this correction. Whole-message embeddings mixed independent events and inherited prompt instructions. The browser pipeline now indexes verbatim sentences and clauses alongside its whole-message windows, embeds answer text independently, and uses a pinned BGE retrieval encoder followed by local query/passage cross-encoder ranking. Message-level frequency statistics and likely entity/identifier anchors replace candidate-count rarity and arbitrary rare-word constraints. An incidental lexical overlap cannot bypass the semantic floor unless it covers at least half the meaningful query terms. Short-answer word-count penalties are removed; contextual excerpts and precise navigation offsets are separate. Saved vector caches require the current model/pooling/query-format version and rebuild locally when incompatible. No query-specific event aliases were added.

Final validation: **43 unit tests and all 77 browser tests pass**. Coverage includes the previous confused-input and character-continuity regressions, saved-chat cross-provider retrieval/reopening, 200-exchange histories, all ordered word results, and native companion history retrieval. The new fixed eight-query benchmark ranks the intended passage first on all three provider fixtures and verifies all **24 original DOM-range destinations**. Three unrelated queries per provider return no smart matches. The final stricter rank-one CPU and three-provider checks also pass. These are synthetic compatibility/regression checks, not live Claude/Gemini verification of 1.6.4 or a general accuracy benchmark.

After the user reloaded, refreshed the actual saved ChatGPT Work chat and searched these unchanged queries from the transcript bottom:

| Query | First result's original source clause | Live result |
| --- | --- | --- |
| someone made a foolish kitchen mistake | Zen accidentally poured juice into the kettle | Rank 1; correct input offset 56, passage visible below the header |
| packing luggage for a boat journey | San packed a blue suitcase for the ferry. | Rank 1; correct input offset 108, passage visible below the header |
| Zen made a foolish mistake | Zen accidentally poured juice into the kettle | Rank 1; correct input offset 56, passage visible below the header |
| fixing the heating before bad winter weather | Rey repaired the broken radiator before the snowstorm. | Rank 1; correct second-input offset 107, passage visible below the header |

Each selected DOM result identifies the original passage offset and length; an independent source-text slice matched its intended clause. Every jump's visible highlight began at 111 px, with no fallback status. Repeated the independent three/three/two Zen/San/Rey word audit and all eight literal-result clicks: counts, order, roles and visible source destinations remained correct, including the radiator line inside the 40-line output. Three unrelated live queries produced zero smart matches; exact word tags may still expose incidental literal matches as designed. The composer stayed empty and no new messages were sent during this final pass. Private screenshots and detailed JSON evidence are saved outside the repository. This live check concerns ChatGPT Work; Codex cloud mode still lacks a usable environment.

## 1.6.5 long-chat navigation correction — 2026-10-17

Live 1.6.4 verification on the user's actual long Claude and Gemini conversations completed all four original vague-query rankings: each first result described the intended fact, sometimes in its original input rather than the corresponding answer. Both Claude jumps and Gemini's continuity answer reached readable source passages. Gemini's handoff request exposed a failed jump into text clipped by its collapsed prompt bubble; expanding it also replaced the text element and made cached navigation handles stale. This supersedes any assumption that a valid text-range rectangle alone establishes visible passage navigation.

Version 1.6.5 uses the host's prompt expansion control before alignment, waits for expansion layout, follows replacement text elements, and rebinds cached rankings to current source documents. The same path handles smart and literal results. A new installed-MV3 regression verifies delayed expansion, source replacement, repeated semantic selection and literal selection while unrelated bubbles stay collapsed. A unit regression verifies rebinding without reranking. Full validation passes: **44 unit tests and 78 browser tests (122 total)**, including all three 200-exchange suites and 24 strict rank-one passage jumps. After the user reloaded 1.6.5, all four original vague queries passed live again on the same actual long chats: relevant first result, readable original passage and stable delayed position. Gemini’s collapsed handoff prompt now expands automatically, and a cached repeat click works after the host replaces its text element. Both composers stayed empty. These checks cover the loaded Claude window and all sixteen rendered Gemini messages; no complete-account recall is claimed. See LONG_CHAT_TESTS.md for actual loaded scope and the remaining cold-indexing delay.

## References

- [Chrome content scripts and isolated worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Claude Code on the web](https://support.claude.com/en/articles/12618689-claude-code-on-the-web)


## 1.4 search refinement

Search uses an off-white panel and shorter labels. Best matches remain first; By word follows with chronological, exhaustive exact-word groups across loaded inputs and answers. Groups paginate in batches of 20 without a total-result cap. All 12 unit checks and 40 Chromium browser checks passed, including real local-model inference inside installed ChatGPT, Claude, and Gemini fixtures. New checks cover word boundaries, Unicode normalization, long lists, deduplication, and exact passage navigation late inside a long answer.

Live ChatGPT 1.4 verification confirmed the off-white panel, composer-safe search shortcut, and exact Zen/San/Rey/trip groups with loaded-message counts. Search was also exercised while ChatGPT had no completed answers: it now remains active independently of rail-marker availability. Full meaning-model indexing of the loaded long answers runs incrementally; missing history remains explicitly outside coverage.


## 1.4.1 long-chat verification and corrections

See [LONG_CHAT_TESTS.md](LONG_CHAT_TESTS.md) for the exact provider matrix and evidence. Installed-extension fixtures use 200 exchanges per provider and compare all 182 word-group rows, then click every result: 546 passage jumps overall. Additional checks cover virtualized windows containing answers without prompts, including an answer-only window.

Live ChatGPT and Gemini loaded-message counts, chronological ordering, and sampled exact passage jumps were verified against an independent DOM-text audit. Live Claude revealed editor focus redirection and an omitted leading answer whose prompt was outside the rendered window. Version 1.4.1 isolates extension interactions from host keyboard handlers and indexes/navigates unpaired loaded answers. Automated coverage is recorded in the long-chat report; live verification of the new build is pending a manual extension reload because native Chrome window control became unavailable. No messages were submitted; unsent test text was removed.

Final automated 1.4.1 run passed all 12 unit tests and 47 Chromium browser tests, including the 546 paired-message result clicks, 31 ordered unpaired Zen answers per provider, and dedicated answer-only nested-scroll regressions. Live reload status remains pending as described above.

Three additional 200-exchange installed-extension semantic tests passed on ChatGPT, Claude and Gemini. Across nine query/provider cases, the intended prompt or answer ranked first, including two paraphrases with no shared content words, and passage navigation succeeded. The tests use real bundled inference and check that no external requests occur.

## 1.4.2 follow-up after the user reloaded

Live Claude 1.4.1 verified ordinary search typing without changing the draft. An independent DOM audit matched all loaded `small` results (three outputs, including an unpaired earlier answer) and `architecture` results (one input and one output), in order. Meaning search for “distributing the workload equally” retrieved a work-rebalancing passage without any of those query words in its excerpt; clicking reached the relevant passage, with the word at approximately 109 px. Claude remounted the source while scrolling, so the post-jump audit reidentified the source by its original excerpt rather than a changing full-message fingerprint.

Further live checks isolated the remaining focus issue to pasting, and found a jump target partially obscured by Claude's fixed `data-testid="chat-header"` banner. Version 1.4.2 prevents host document paste capture for the search input while preserving native paste, and includes that banner in the jump inset. An automated paste regression asserts that the host composer remains unchanged and the native paste default is not canceled. Claude fixtures now include the real fixed-header structure and its natural content inset. Live confirmation of these two final fixes requires reloading the new build; native Chrome window control still reports no available windows. All unsent test text was cleared.

Final 1.4.2 live verification completed after the user reloaded the extension: Claude paste remained in search with an empty composer, the complete loaded word groups included the unpaired answer and both roles, and word/passage jumps were below its fixed banner. Its live semantic paraphrase retrieved the workload-rebalancing passage and jumped correctly. Refreshed ChatGPT and Gemini also passed loaded-message completeness, ordering, paste and exact-word destination checks. The earlier pending-reload notes are superseded by these results. See LONG_CHAT_TESTS.md for scope, measured destinations and final evidence.


## Cross-chat library — 1.5.0

The local library captures readable messages on supported chat websites, including configured custom sites. Bulk discovery scans the exposed sidebar links of open ChatGPT, Claude and Gemini tabs. It does not enumerate a complete account through a private API, index native desktop/CLI history, or promise access to unexposed older messages. Existing live 1.4.x evidence above concerns navigation and in-thread search; the new library requires a 1.5.0 extension reload. See README.md and SEARCH.md for persistence and coverage.

The actual-chat vague-query pass found five correct intended excerpts out of six on 1.5.0, plus one wrong-paragraph Gemini result. See LIBRARY_TESTS.md for the 1.5.1 correction and pending reload/live-library limitations. This evidence does not establish general retrieval accuracy or complete account coverage.

The reloaded 1.5.1 live pass confirmed the Gemini correction and stable exact-range destinations on all three sites. With ChatGPT answers restored, a different query selected a generic sentence in the correct exchange; 1.5.2 corrects its passage ranking. See LIBRARY_TESTS.md for the measured scope and pending final reload. Cross-chat library verification in the signed-in profile remains user-operated because browser automation blocks extension-protocol pages.

Final 1.5.2 reload confirmation is complete: six unchanged vague queries on actual ChatGPT, Claude and Gemini chats all selected the intended passage first and reached its exact source text. Delayed checks retained the destinations. Earlier pending-reload notes are historical. Live cross-chat library selection/reopening remains unverified; see LIBRARY_TESTS.md.

## 1.6.0 Codex and Claude Code

The browser extension accepts saved Codex legacy task URLs as well as current ChatGPT chat routes, and retains the Claude Code web session adapter. Installed-extension fixtures verify detection, original-question previews, exact-question jumps, streaming exclusion and All chats query/snapshot transfer for both coding interfaces. Initially both coding accounts had no saved browser sessions; the 1.6.1 follow-up below supersedes the pending Claude Code check.

ThreadRail Local is a separate loopback companion for saved native sessions. It uses read-only Codex app-server history methods and the official Claude Code SDK's local session reads. It provides the rail, thread picker, cross-session semantic search and all ordered word matches in its own viewer. It does not inject into stock desktop/terminal/IDE UI, and exact jumps are not claimed inside those hosts. Copy resume command is an explicit user action; no resume or generation runs automatically.

Actual installed-source verification: Codex 0.162.0-alpha.17.2 listed this project's saved session and hydrated 165 messages at the first reader check. The live viewer later displayed 168 saved messages and 32 input entries as the session grew. An independently located answer containing a remembered extension error was retrieved and its DOM text range landed at 182 px, below the viewer header at 162 px. Claude Code 2.1.300's interactive history list exposed 50 local sessions with pagination; the selected saved session had four visible text messages. An independent DOM audit found two messages matching a sampled word; the word group also showed two, and clicking its row reached the exact source text in view. These are sampled source/landing checks, not a native semantic-accuracy benchmark.

Validation: **29 unit tests and 14 targeted browser tests pass**. Four native browser tests use synthetic Codex/Claude Code sessions: real offline inference retrieves the intended sessions for two vague cross-provider queries and lands on exact paragraphs after 25 filler paragraphs; all 54 exact word rows remain ordered and clickable; a pending read cannot restore old scope content; and an opted-in Chrome extension cannot replace the companion's own rail. Ten installed-extension cases cover the browser providers and All chats launch paths. Unit coverage also verifies that native desktop envelopes become original typed prompts rather than metadata-heavy picker titles. The native integration initially exposed a context-dilution retrieval miss, now covered by its real-model paragraph regression. Browser history and native histories are separate libraries; no Chrome archive or blocked extension page was accessed by the companion.

## 1.6.1 live Claude Code web session

At the user's explicit request, created a four-exchange text-only Claude Code cloud test session in the existing Default environment. No repository was attached and no tools or file operations were requested. The last answer contains 40 numbered lines to provide real scrolling distance. After the user reloaded the extension, the live page detected all four completed exchanges and the picker displayed the four original prompts without numbering.

| Vague query | First result | Exact landing |
| --- | --- | --- |
| Zen made a foolish mistake | Answer describing juice poured into a kettle | 61 px, below the 41 px header |
| broken heating appliance | Input describing the broken radiator | 61 px, below the header |
| their journey by boat with luggage | Input describing a ferry and suitcase | 61 px, below the header |

Independent message inspection found two matching messages each for Zen, San and Rey, ordered input then answer. All six word-result clicks reached the correct message text after navigation completed. Top reached scroll position 0; Bottom reached the maximum 1269 px. The source composer remained empty. This is a small live compatibility sample, not a long-session retrieval benchmark or cross-chat-library test.

The live test exposed action timestamps inside Claude's answer wrapper. Version 1.6.1 excludes message toolbars from indexed text and passage-offset calculations. After reload, the two matching messages remained in each name group, excerpts had no timestamps, and `minute` had zero matches. All **29 unit tests and 11 affected installed-extension browser tests** pass, including the new timestamp/offset regression. Earlier native browser checks remain as recorded above.

Codex cloud creation could not proceed: its environment picker reported “No published environments,” Send remained disabled, and the creation dialog reported no repositories available to the existing GitHub connection. No GitHub access was granted or expanded. Live Codex web transcript testing remains pending an environment; the native Codex reader and browser fixtures are separate verified evidence.

## 1.6.2 saved desktop-app sessions

Confirmed that the Claude Code SDK lists the same local session titles visible in the Claude desktop Code tab, including DS animated advertisement film, Sira product brief additions and Twitter presence growth strategy. Opened the first session's 38 text messages in ThreadRail Local. Codex's Note editing workflow session supplied a separate 10-message desktop-history sample. The final cross-session check loaded those two sessions only; the current ThreadRail build conversation was excluded because its discussion repeats the test query and would contaminate retrieval evidence.

| Query | First session / source | Exact landing |
| --- | --- | --- |
| needed a JavaScript runtime before rendering animation | Claude Code desktop history / Node-installation answer | 182 px, below the 162 px viewer header |
| moving footage off a plugged-in phone onto the computer | Codex desktop history / copying the video to the Mac answer | 182 px, below the viewer header |

The original runtime query selected a paragraph from the film brief. The native correction encodes answers without the opening brief, adds narrow technical-equivalence hints to meaning vectors, and gives a substantive event more weight than its temporal background clause. The same unchanged query then found the intended answer. Original text and literal word groups are untouched. Five iPhone matches (one input and four answers) exactly matched an independent audit of the Codex transcript; both checksum answers matched the Claude SDK audit. All seven word rows were in source order and landed on their exact text. This is a small live compatibility sample, not a general accuracy claim or verification inside the stock desktop chat viewport.

Validation: **31 unit tests and all 5 native browser tests pass**, including the new real-model short-answer/long-brief regression and a check that meaning hints cannot create literal word matches. Native histories remain read-only. These desktop source and navigation checks run in the companion; direct Codex app computer control was unavailable by policy, and Claude's native click control reported no available window. No native app UI was modified and no in-app rail is claimed. Version 1.6.2's changes affect the companion; existing website content-script behavior is unchanged.


## 1.6.11 cached message chronology

The cache previously inserted incoming older messages at the first shared anchor, even when that anchor was a pinned latest reply. Already cached messages never moved when a later host window exposed their actual order. This could reverse literal word results while their individual jump targets remained correct.

The shared history merger now reconciles observed precedence between stable message keys. Fresh host order takes priority over stale constraints; public numeric positions are compared only within the same numbering frame, because Claude rebases its message numbers as older history loads. Restored snapshots are not mistaken for fresh host observations. Message IDs, original text, passage offsets and vector identities are preserved. Legacy unnumbered records need their host windows observed again to establish missing chronology; the cache is not cleared or guessed from capture timestamps.

New installed-extension regressions cover all three providers: repair a deliberately rotated legacy cache from host windows, assert all 40 message rows in order with the same identities, persist and reopen, check both thread and library word order, unload older messages, then jump to the saved answer's exact paragraph. Validation: all **58 unit and 103 browser checks pass** (161 total), including 200-exchange exhaustive word results, semantic passage retrieval and saved-message restoration on all three provider fixtures. Live verification of this new build is pending extension reload.


### 1.6.11 actual-chat reload verification — 2026-10-24

After the user reloaded the extension, tested the existing signed-in singing chat on ChatGPT, the long GPU-efficiency chat on Claude, and the multi-agent video-production brief on Gemini. No prompts were submitted or edited. The pre-existing misordered cache was retained throughout.

- **ChatGPT:** revisiting the host windows repaired all 11 `sing` rows: the opening rendition input comes first; the late pitch-matching and final humming answers come last. All 11 rows stayed identical after older DOM messages unloaded and after reloading the page. Coverage remained 36 saved messages. The absent teacher request was restored by a word result and by a smart result, landing at 102.5 px. The final humming-answer word result also reached its original paragraph in view.
- **Claude:** traversed all 108 exposed public message positions. The cache contains 103 searchable records; this does not establish that all 108 slots contain separately indexed readable text. The two `rent` rows now show the GPU-by-the-hour explanation before the later busy-hour explanation, including immediately after reopening from a tail window. Both word jumps restored their original source text below the header (62.1 and 59.3 px). The vague headroom query restored the intended “almost nothing left to improve on speed” passage. Public ordinal labels can change as windows hydrate; verification used the actual source text rather than treating ordinal labels as durable identity.
- **Gemini:** independently found eight `Higgsfield` messages among the 16 rendered inputs/answers. Every word-result identity matched that source order exactly, and the same eight rows persisted after reopening. The heading jump reached 19 px; the selected long input expanded before its jump and reached 19 px. The vague character-continuity query retrieved and reached the original recurring-character passage. All 16 messages remained mounted, so live unmount behavior is not claimed for this sample.

All nine sampled word/smart jumps reached their intended original source text. Load earlier stayed hidden in the three checked captured histories. All three composers remained empty. The 161 automated checks recorded above are separate fixture evidence, including persistence, unloaded-source restoration and 200-exchange stress tests. Signed-in cross-chat-library pages remain protected from automation; the shared library order is covered by the installed-extension regressions.


## 1.6.12 user-started search diagnostics

The extension now includes Test search, a local runner for expected-chat and expected-passage checks. It shares All chats query encoding, ranker, chat deduplication and canonical jump targets. Each round reloads the saved index and vectors. It does not claim that the library DOM itself was reopened or that Chrome was restarted; those UI and persistence paths remain covered by the separate installed-extension regressions.

Only the diagnostics extension page can begin a run or request its temporary navigation tabs. There is no external messaging declaration, content-page control API, server, private Chrome-storage reader or automatic invocation on page load. The person starts a run inside the extension and chooses whether to export a report. Content-side verification checks the original source identity and real text ranges rather than trusting the success toast. A second measurement detects a displaced landing. Existing chat tabs and drafts are not used for diagnostic navigation.

The workspace-specific live test plan is not included in the extension or ZIP. It contains the three already-discussed ChatGPT, Claude and Gemini cases, with expected snippets fixed before the run. The new build needs an extension reload and a user-started live run. No actual-library diagnostic pass is claimed until its report exists.


Validation: **64 unit and 111 browser checks pass**, combining the full regression run with the final affected-runner checks after the last UI/verification updates. The six runner browser cases cover: one user run with all three providers and six successful rank/jump checks; wrong-first-chat failure without silently selecting a lower result; closing the runner and closing only its owned tabs; rejecting an offscreen quote despite a successful toast; clearing the library during a run without resurrecting tests/reports; and rejecting a changed original source. Exports omit queries and excerpts by default. Existing drafts remain unchanged. Website senders are rejected before any diagnostic tab opens.
