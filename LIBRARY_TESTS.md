# Cross-chat library verification — ThreadRail 1.5.0

The library is tested with the installed MV3 extension and real bundled MiniLM embeddings in isolated Chromium profiles. Website URLs are intercepted with provider-shaped synthetic pages. These are extension integration tests, not a claim that the new library has been live-tested in the user's signed-in accounts.

## 1.6.9 word rows

The shared search UI now lists all query words as vertical count rows. Clicking expands results directly below that word; a second click collapses it. The installed library checks explicitly expand the query word before exposing all 24 source-ordered results across six captured chats. Common regular plural and “-ing” forms share a word-family posting while retaining the original token offsets. Smart retrieval weights, library source identities and reopening payloads are unchanged. The full 1.6.9 run passes 53 unit and 96 browser checks.

## 1.6.8 parallel results

Smart matches and Word matches each start with two cards, in adjacent columns. Installed-extension tests verify the desktop layout and 390 px viewport, progressive access to all 24 exact input/output results across six chats, unchanged ordering, and real-model retrieval/reopening across ChatGPT, Claude and Gemini fixtures. The final affected search/library/reader run passes 39 checks. Source message identities and navigation payloads are unchanged. These checks do not establish live compatibility with the user's protected extension library page.

## Cross-chat retrieval and reopening

- Three chats on ChatGPT, Claude and Gemini are captured automatically, with 48 total input/output messages.
- “zen was being dumb where was this” ranks the kitchen mistake chat above a Claude chat whose short prompt mentions Zen and focus. Clicking reopens the kitchen chat and reaches its answer passage.
- “broken heating appliance” finds the Gemini radiator passage without shared content words, then reopens and locates it.
- A Claude answer is reopened and positioned below its fixed header.
- A full browser restart preserves the local snapshots and vector caches. Opening a new library page retrieves the original source.
- Search inference makes no external model or search requests. Navigating results uses ordinary website page loads.

## Bulk discovery and exact word coverage

- Open sidebar lists on all three providers expose three previously unvisited saved chats.
- Index saved chats discovers six conversation URLs in total, visits them in temporary background tabs and captures 24 messages.
- Existing composer drafts remain unchanged in all original tabs.
- One word present in every message produces 24 exact results. Pagination exposes all results, grouped in chat order, with prompts and answers in source order.
- Cancelling another indexing run closes its temporary tab and preserves every original tab.

## Loading an older passage

A saved ChatGPT result refers to a turn absent when the conversation first opens. The content script loads that older turn, locates text after 35 filler paragraphs and positions the exact paragraph in view. The original user tab retains its original loaded window.

## Local deletion

Clear and pause removes local snapshots and vectors. Timestamp guards in the IndexedDB transaction prevent an old snapshot or delayed embedding write from restoring text after Clear or per-chat Remove. The integration test verifies that stale writes leave both stores empty while a fresh later capture remains possible.

Verification totals: **17 unit checks and 55 browser checks passed (72 total)**. The full browser suite passed, followed by focused library and route checks after cancellation refinements. A regression also verifies that a fallback prompt captured before its answer does not become a duplicate input when that answer arrives.

## Regression coverage and limits

The suite also retains existing in-thread search, navigation, provider, 200-exchange, 546 exact-result-click and nine semantic long-chat cases. Live 1.4.2 navigation/search evidence is recorded separately in LONG_CHAT_TESTS.md.

Coverage remains partial. Bulk discovery follows links exposed by open site sidebars; collapsed folders, inaccessible chats and unexposed history can be missed. Each conversation scan is bounded to 60 seconds. Snapshots may retain historical edits or messages removed from the website. Fallback text identities cannot provide a complete account audit. Native desktop and terminal histories are outside this browser extension.

## Actual-chat query pass and correction — 1.5.1

Six vague descriptions were tested directly on signed-in ChatGPT, Claude and Gemini pages, with reference passages chosen before searching. Five selected the intended excerpt first and navigated to its visible text. One Gemini continuity query selected a relevant answer but the wrong paragraph. ChatGPT's site displayed render-failure placeholders instead of its assistant answers, so those two live cases verified user inputs only.

Version 1.5.1 makes current-thread ranking use the library's meaning-first weights and query-coverage adjustment, normalizes common English spelling variants only for semantic query encoding, and excludes host render-failure sources. A private local replay of the same readable page text ranks the intended excerpt first for all six unchanged queries. The query corpus and source excerpts stay in private verification artifacts, outside this source repository.

Validation for this correction: 20 unit checks passed; all 23 affected search/library/long-semantic browser cases passed across the main run and the corrected focused passage regression. The remaining baseline navigation and exact-word tests were not repeated because their behavior is unchanged.

Final live confirmation of 1.5.1 requires an extension reload; refreshing a chat page alone still loaded the old content script in this Chrome session. Chrome's browser-control policy blocks observation/control of extension-protocol pages, so cross-chat library ranking and opening require a user-operated check. Current-thread live checks are distinct from cross-chat verification and are not reported as proof of cross-chat success.

### Reloaded 1.5.1 live follow-up and 1.5.2 correction

After the user confirmed Reload, all six unchanged queries were rerun on the actual HTTPS chats. The Gemini character-continuity miss was corrected: its intended passage ranked first, and clicking reached the correct one of two repeated input excerpts. Both Claude passages and the Gemini handoff passage ranked first and landed on their exact text. ChatGPT's answers now loaded; the cricket query found the relevant answer first. A second ChatGPT query found the correct exchange but selected a generic answer transition instead of the remembered input. This is recorded as an intended-passage failure, not a pass.

All six returned excerpts remained visible during delayed checks 14–36 seconds after the click. Claude's fixed header did not cover the target, and the earlier suspected scroll snap did not reproduce. These checks cover readable messages in the loaded windows, not complete provider account histories.

Version 1.5.2 softly reduces semantic scores of underspecified short answer fragments. The same private readable-text replay now ranks the intended source excerpt first for all six queries, including the restored ChatGPT answers. A real-model browser regression verifies the confused-input case and its exact destination; a unit regression also retains a strong short answer. Live 1.5.2 confirmation and user-operated cross-chat library checks remain pending.

Validation of 1.5.2: **21 unit tests and all 24 affected browser tests passed** in one run. These include the new regression, all three 200-exchange semantic suites, cross-provider library retrieval/reopening, bulk discovery and complete word-result pagination. Unchanged navigation-only suites were not repeated.

### Final 1.5.2 live confirmation

After the user reloaded 1.5.2, all six unchanged vague queries ranked the intended passage first in the actual ChatGPT, Claude and Gemini chats. Clicking each result reached its exact source text. The confused ChatGPT input now wins over its answer's generic transition. Gemini continuity reaches the correctly labeled one of two identical input excerpts. Claude targets sit below its fixed header. Delayed checks confirmed the destinations stayed visible; all tested composers remained empty.

This supersedes the pending 1.5.2 reload notes above. It verifies search within readable chat windows, not global conversation selection across the saved library. Live All chats ranking/reopening still needs a user-operated check because extension-protocol pages are blocked by browser automation policy.

### All chats launch recovery — 1.5.3

The user reported that All chats did nothing on ChatGPT. Clicking the actual source-page button reproduced a synchronous `Extension context invalidated` error in its content script. The old `.catch()` handled only promise rejection, so this error produced no visible feedback. Refreshing the draft-free ChatGPT page restored its extension connection. A subsequent click opened a new tab titled `ThreadRail · All chats`, confirmed through browser tab metadata without accessing the restricted extension page. This verifies launching the library, not searching or opening a result from it.

The launch now catches synchronous errors, asynchronous rejection and background error responses; shows a persistent recovery instruction; and permits retry. It finishes a best-effort current snapshot before opening the library, so the initial library read includes the current chat. It never reloads a page or discards a draft automatically.

Six new browser regressions pass: installed-extension button launches on all three providers preserve the query and draft and expose the current four-message snapshot, while three error cases verify visible feedback and retry. These use isolated profiles and synthetic content.


### Cached word order across providers — 1.6.11, 2026-10-24

Added an installed-extension All chats regression using one isolated persistent Chrome profile and three synthetic provider conversations. Real content scripts capture 20 exchanges per provider (120 inputs/answers total). The test rotates each stored message array while retaining the chronology evidence, closes the browser, then reopens the library twice. Expanding all word rows asserts every original input/answer in saved-chat order and conversation order, with no omissions or duplicates.

Six clicks (the earliest and latest matching answer for each provider) reopen the original saved chat URL. Early answers are absent from each initial three-exchange DOM window; the jump restores them through normal host history loading and aligns their exact paragraph below the fixed header. Later answers also land in view. Every fixture composer remains empty. This test and all three legacy-cache chronology regressions pass together (4 browser tests).

The actual signed-in ChatGPT source-page All chats button opened `ThreadRail · All chats` with `sing` preserved in its query hash, confirmed through browser tab metadata. Reading or clicking inside the signed-in extension page remains blocked by browser security. A user selection was requested to verify the actual opened destination. This does **not** establish live signed-in library ordering or cross-chat jumps; those checks remain pending. No protected page was copied, mirrored, accessed through native controls or inspected through its private storage.


User-assisted signed-in check: the user selected the opening singing result from All chats. The actual ChatGPT destination displayed the original “Listen to this rendition…” input below the header and announced “Jumped to the matching passage”; its composer remained empty. The library selection itself was performed by the user. Claude and Gemini selections and direct signed-in library-order inspection remain pending; automated 120-message order assertions are not substituted for those live checks.


The user then selected the earlier `rent` result after reloading the library. A new actual Claude tab opened at the expected chat URL, focused public Message 4 of 108, showed the original “You rent a GPU by the hour” passage, and announced a successful matching-passage jump. Its composer remained empty. Although the user reported both provider results opened, no Gemini destination tab was exposed in the controlled Chrome session; that live destination has not been counted as verified.


The subsequent dedicated Higgsfield library selection opened the expected actual Gemini URL. Its original “3. AI Video Generation (Higgsfield)” heading was visible near the top of the viewport and the page announced “Jumped to the matching passage”; the composer was empty. All three sampled signed-in destinations are now verified following user-operated library selections. The earlier missing-Gemini note is superseded by this destination check. Direct independent inspection of the protected signed-in library's full word order remains unavailable; exhaustive order after browser restart and library reopening is verified in the isolated installed-extension test, not claimed as a direct signed-in UI audit.


### Vague smart search after reopening — 1.6.11, 2026-10-24

Added `tests/library-smart-reopen.spec.js`: the real bundled retrieval and ranking models search six saved synthetic chats containing 240 inputs/answers. The profile is closed and restarted, and the All chats page is closed/reopened between two rounds. Three target chats compete with three related-topic distractor chats. Each selected remembered message is absent from the initial reopened three-exchange window.

| Vague query | First-ranked chat / original source | Exact clause top, both rounds |
| --- | --- | --- |
| zen was being dumb where was this | ChatGPT / kitchen mistake answer | 80 px |
| broken heating appliance | Claude / failed radiator answer | 76 px |
| money back after a faulty purchase | Gemini / damaged-camera refund input | 80.4 px |

All six rank-one selections reopened the correct chat URL, restored the missing older message through host history loading, and reached the original exact clause below the header. All fixture composers stayed empty and no external model requests occurred. The first fixture attempt was invalid: its shortened tail had no overflow although history restoration depended exclusively on a scroll event. Giving its ordinary tail answers sufficient rendered height made that intended infinite-scroll fixture usable; no ThreadRail production code was changed.

Live scope: a fresh signed-in ChatGPT in-thread baseline for “I asked for a daily voice coach for about three months” ranked the original 100-day daily lesson answer first. All chats opened with that exact query preserved. Its protected extension page could not be inspected; no live library smart-ranking or smart-result-jump pass is claimed. After the user raised frustration with the repeated access blocks, no further manual selections were requested. The earlier three signed-in All chats word-result destination checks remain separate evidence.


### User-started diagnostics — 1.6.12

Test search now runs expected-chat and expected-quote cases from inside the extension. Its encoding, final ranker, result deduplication and jump-target fields are shared with All chats. Fresh saved indexes are loaded for two rounds; this is a functional saved-library check rather than a claim that the All chats DOM or Chrome itself restarted. Each successful query opens a new temporary host tab, restores the original message, verifies its identity and unchanged text, resolves the independently specified quote to DOM ranges, and checks that all quote lines are below the header and inside the viewport. A delayed second check requires the same landing to remain visible and stable.

The installed-extension runner test produces six passes across ChatGPT, Claude and Gemini fixtures, covering long answers and an original input absent from the reopened host window. Separate negative checks reject wrong chats, unavailable or ambiguous ground truth, changed sources, offscreen passages, stale success notifications and untrusted website callers. Closing the runner or clearing the library closes only diagnostic-owned tabs. Existing drafts stay unchanged. The final six runner browser checks and 64 unit checks pass; the other 105 browser regressions passed in the full run.

The live plan at `diagnostics/live-smart-search.json` uses the three already-discussed actual-chat cases. That file is outside the release ZIP. It must be imported and started by the person inside Test search; no tool invocation, web-page message, loopback endpoint or automatic startup can initiate a real-profile run. The report is stored locally and export requires an explicit action. Actual-library diagnostics remain pending until that user-started report exists.

### Restoration and landing lifecycle — 1.6.13

The user-supplied 1.6.12 report ranked the correct chat first in all six cases, but only one case passed the full jump verification. ChatGPT failed to settle/restore, Claude failed the combined source restoration/text check, and the first Gemini landing moved 51 px between measurements. These are failures, not successful live jumps.

Navigation now returns an awaited outcome after restoration, materialization and passage landing. Timer-based progress does not depend on animation frames in an occluded tab. Each sample resolves the same message again and builds a fresh DOM range; it follows replacement nodes, replacement scrollers and layout changes. A quiet interval, actual nonzero passage geometry, fonts and native history readiness are required before completion. Unreachable or missing destinations, exceptions, cancellation and timeouts return failures. Explicit native earlier-history controls participate in restoration.

Capture, exact DOM ranges and verification now share a content boundary that excludes recognized host status/action UI. Existing cached text is accepted only if it exactly equals either the current canonical message or the complete unchanged message with only currently recognized legacy host UI text. Duplicate status/live-region copies are optional; every conversation character remains mandatory. No arbitrary prefix stripping or quote-only source acceptance is used. An answer edit outside the expected quote still fails. Missing identity and changed text have separate report evidence, including text lengths and fingerprints without exporting message text.

The independently specified expected quote still must be unique in the original source and all of its lines must be inside the readable viewport. The two verification measurements still require less than 3 px movement. Neither queries, gold quotes, ranking weights nor these acceptance thresholds were weakened.

`tests/restoration-lifecycle.spec.js` repeats the same three user queries and expected quotes in provider-shaped synthetic long chats, after a profile restart, for two rounds. Older source messages start absent and need an explicit public earlier-history control. Each destination undergoes a source remount, a 51 px layout shift and an independent host status change. The diagnostics report and independent DOM checks must both pass. This is controlled regression evidence; an updated user-started report is still required to establish success in the actual saved library.

Final isolated validation: 68 unit checks and 16 distinct focused browser checks pass. The original three vague queries and expected quotes pass all six cases in the controlled reopening report, including the legacy Claude metadata case. A separate test disables animation-frame callbacks, changes the header through a stylesheet rule and requires the exact passage to land below the new header. The restoration proof retains the complete canonical answer, not just the gold quote, so a later real answer edit still fails.

The attempted full workspace run is not counted as a clean pass: another writer changed UI/word-filter source and tests and rebuilt `dist` while it ran. It ended with 109 passes and five UI/word-row failures against mixed builds. The final restoration checks therefore ran against a fixed source/build snapshot on a separate local test port. Concurrent UI/word-filter/native-server edits were preserved rather than reverted or adjusted to satisfy these tests. The updated actual-library run remains pending a user-started report.

After other edits were paused, the stable workspace rerun passed all 68 unit checks and 110 of 115 browser checks. All restoration, semantic retrieval, cached-order, retained-history, exact-range, changed-source and no-animation-frame checks passed. Four failures concern legacy word-row expectations: the separate word-filter change omits filler words, while those checks still require every query word. Those assertions and that feature were left unchanged. The remaining failure was a measurement race in the narrow-viewport test: Search is independently available before Top renders. The test now additionally requires Top to be visible before measuring it; no geometry bounds were relaxed. That stronger readiness check passed all three repetitions. An exported 1.6.13 actual-library report is still needed; the supplied Downloads report remains 1.6.12.

### Actual 1.6.13 report and startup readiness — 1.6.14, 2026-10-25

The supplied actual-library report ranked the correct chat first in all six cases, but passed only three complete jumps: ChatGPT 0/2, Claude 1/2, Gemini 2/2. Both Gemini cases and the successful Claude case preserved exactly the same quote position between immediate and delayed checks. The other three failed before passage verification with only `{ok:false}` from restoration; that report cannot establish whether history loading, identity or excerpt resolution was responsible.

A separate live HTTPS walkthrough restored and selected the remembered passages through the ordinary in-thread search UI in fresh ChatGPT and Claude tabs. This is narrower than All chats and does not supersede its failed report. Those public-page visits captured freshly rendered history using the normal existing collector; no protected extension page or private browser storage was accessed.

The collector previously treated the first readable rows as proof that the host was initialized. It now waits for the host's initial scroll position, virtual window, fonts and geometry to become stable before scrolling history. A timeout/cancellation fails explicitly. Installed-extension regressions start the saved jump while the fixture's initial scroll and row remount are still pending; neither provider may receive an early navigation scroll, and both must restore and verify the original quote. This fixes the missing readiness gate, while the exact cause of each prior actual-library failure still requires a new report.

Every compiled extension context now carries the same deterministic SHA-256 source/build identifier, also saved in `build-info.json`. Test search verifies that its page, background and newly opened content script agree. A mismatched build fails before navigation. Restoration reports record stage, termination condition, elapsed time, source/identity/excerpt observations, scroll geometry and visibility, with message text excluded. Existing source equality, unique-quote, viewport and less-than-3-pixel stability checks are unchanged.

Validation: 71 unit checks and 32 distinct focused browser checks passed, including the unchanged three-query/two-round controlled rerun, startup readiness on ChatGPT and Claude, saved history restoration, chronology, bulk discovery/indexing, build matching, cancellation, changed-source rejection and exact-range verification. The first startup-fixture attempt queried tabs by URL without a tabs/host grant, so no tab ID was returned. It now addresses its own active synthetic tab, as the other isolated tests do; no extension permissions or acceptance conditions were changed. The previously documented word-row expectation conflicts remain outside this restoration change. Actual 1.6.14 All chats validation is pending a user-started run.
