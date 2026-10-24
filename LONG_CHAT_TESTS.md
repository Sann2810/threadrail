# Long-chat search verification — 2026-10-16

## 1.6.7 saved-jump and reader regressions — 2026-10-23

The new installed-extension paged-feed test recreates the failure missed by the earlier immediate-window restoration fixture: 128 messages, very tall answers, a pinned newest reply and a saved target nine Load later pages away. It verifies real source remount, exact word landing, and visible cancellation. Additional reader tests hold the final ranker pending to verify useful results remain visible with an honest ranking label; distinguish two identical short prompts with their original answer context; preserve all folded auxiliary-word matches in order; and verify deadline failure restores position with Retry and Cancel.

Final 1.6.7 validation passes 52 unit and 87 browser checks. After the user reloaded, the exact formerly failing Claude saved result was absent from the tail DOM, restored through public history traversal, and reached in the original Message 94 of 108. Its remembered sentence was visible below the header. The same Gemini reader query/jump also passed. A two-exchange ChatGPT compatibility sample passed both a literal output jump and a vague input jump, at 113 px and 77 px respectively. Persistent search, paused-history navigation, short-prompt context, auxiliary-group expansion and direct single-word lookup were checked live. No messages were submitted; detailed private evidence remains outside the repository. See COMPATIBILITY.md for coverage limits.

ThreadRail **1.4.2** passed 12 unit checks and 51 Chromium browser checks. Final live checks passed on signed-in ChatGPT, Claude and Gemini for the currently rendered messages. Claude's user-selected conversation was used after the final extension reload.

## 1.6.6 retained-history and speed checks — 2026-10-17

Installed MV3 tests load 200 exchanges on each provider, finish the real-model search, unmount 195 exchanges, and verify retained exact-word matches. All 400 canonical messages are saved. After shutting down and restarting the browser profile with only the last five exchanges rendered, the same vague query still ranks the intended source first. Selecting it drives the host's scroll loader to recreate the missing window, then lands on the original deep-answer paragraph. This tests original transcript navigation, not a separate viewer or an archived-text substitute.

| Provider | Cold fixture ready | Ready after browser restart | Original passage top |
| --- | --- | --- | --- |
| ChatGPT | 10.0 s | 0.9 s | 80 px |
| Claude | 9.5 s | 1.4 s | 76 px |
| Gemini | 11.1 s | 1.9 s | 80 px |

These are synthetic 400-message measurements in the parallel suite. A separate controlled replay of 31,736 characters of captured Gemini text measured 227.6 s for 1.6.5 versus 50.8 s cold and 2.9 s after reload with the new pipeline. Private text and detailed timing records stay outside this repository. No claim of instant first-time indexing or complete unseen-history coverage is made.

The existing exact-word stress tests now additionally require unloaded prompts to remain among all chronological matches when only answers are rendered. Pure tests cover retained chronology, live edits, duplicate fallback answers, versioned vector reuse and histories larger than the reuse cache. A final open-tab Remove/Clear check verifies offscreen text cannot return from delayed cache work.

Final installed-profile 1.6.6 checks passed Claude's real unload → saved word search → original Message 4 of 108 jump, then the same flow after a page reload. The landing line stayed at 166 px. The established Claude memory paraphrase and both Gemini paraphrases retained their intended first results and real passage jumps; Gemini's collapsed input expanded and its result survived reload. All Gemini sources stayed mounted, so Gemini unload retention remains fixture evidence. A sampled ChatGPT input paraphrase/jump passed, but current answer bodies were blank. An extra held-out Claude billing paraphrase missed under both selective and exhaustive replay search; it is recorded as an approximate-retrieval limitation, not a passing case. See COMPATIBILITY.md for scope. No messages were submitted.

## Installed-extension stress test

`npx playwright test tests/long-search.spec.js` loads the actual unpacked MV3 extension in isolated Chromium profiles on provider-specific fixture routes. These are synthetic conversations, not the user's signed-in accounts.

Each provider has 200 exchanges (400 messages), with matches in both inputs and outputs, repeated occurrences, inline formatting, paginated groups, and long answers whose matching paragraph follows 35 paragraphs of filler. Those long answers occur at exchanges 1, 98 and 200.

| Word | Inputs | Outputs | Total per provider |
| --- | ---: | ---: | ---: |
| Zen | 21 | 31 | 52 |
| San | 25 | 18 | 43 |
| Rey | 18 | 42 | 60 |
| trip | 14 | 13 | 27 |
| Total group rows | 78 | 104 | 182 |

Every group row is compared against its expected source, with chronological order and no duplicates. Every pagination page is expanded and every result is clicked: **182 clicks per provider, 546 overall**. Targets land below the fixture header, inside the matching paragraph. An additional stage removes all prompts, verifies 31 ordered unpaired Zen answers per provider, and jumps inside an unpaired long answer. Separate short regressions verify answer-only nested scroll containers on each provider.

Claude fixtures reproduce its fixed `chat-header` banner and natural content inset. A first-row fixture positioning failure was corrected by giving the fixture its required header padding; the final Claude stress and semantic checks passed.

## Meaning-based search

`npx playwright test tests/semantic-long.spec.js` uses the actual bundled MiniLM model, without stubbed vectors, on 200-exchange ChatGPT, Claude and Gemini fixtures. The corpus includes unrelated background material, a similar scene about the wrong character, and a Zen meditation distractor.

All nine query/provider cases ranked the intended source first and jumped to the matching passage:

| Query | Intended source | Role | Shared meaningful words required? |
| --- | --- | --- | --- |
| zen was being dumb where was this | Zen foolishly pours orange juice into a kettle | Answer, 35 paragraphs into a long output | Name anchor only |
| broken heating appliance | A radiator stops working on a cold night | Answer, 35 paragraphs into a long output | None; asserted in the test |
| money back after a faulty purchase | Asking a shop to reimburse a damaged camera | User input | None; asserted in the test |

Each test waits for the complete local meaning index, verifies the top result and role, clicks it, and checks passage geometry, external requests and page errors. No external requests occurred. These deterministic examples are not a general accuracy benchmark.

## Final signed-in site checks

Independent DOM-text audits compare every word-group row with loaded source messages in order, including each source role.

| Site | Loaded scope | Verified word groups | Final passage checks |
| --- | --- | --- | --- |
| ChatGPT | 5 exchanges / 10 messages after refresh; an earlier test also loaded 8 exchanges | Zen: 4 inputs + 5 outputs; San: 5 inputs + 5 outputs | Matching San in an answer at 102 px, contained by the highlight; earlier prompt and deep-output checks also passed |
| Claude | Virtualized user-selected long chat; initially 2 prompts and 3 answers, including an answer whose prompt was absent | small: all 3 outputs; architecture: 1 input + 1 output | Unpaired answer at 86 px, prompt at 64 px, paired answer at 108 px; all below the 48 px banner |
| Gemini | 8 exchanges / 16 messages, approximately 31,700 clean text characters | video: 4 inputs + 7 outputs; agents: 4 inputs + 8 outputs; brief: 4 inputs + 4 outputs | Matching word in an answer at 56 px, contained by the highlight; additional prompt and answer checks passed |

Claude's live smart query, “distributing the workload equally,” returned a work-rebalancing passage with none of those query words in its excerpt. Clicking reached the relevant passage; “rebalances” was at 152 px on the final build. The post-jump audit reidentified the source by excerpt when Claude remounted it and changed surrounding accessibility text.

Final pasted queries stayed inside the extension on all three sites and all composers remained empty. No test messages were sent.

## Corrections found live

- Loaded leading assistant answers whose prompts are outside a virtualized window were omitted. They are now indexed without inventing rail exchanges, reported in coverage, and navigable directly.
- Answer-only windows on ChatGPT and Gemini could select the document instead of the nested transcript scroller. Scroller discovery now starts at an available answer when no prompt exists.
- Claude redirected pasted shadow-input text into its composer. Search paste is now isolated before host document capture while preserving native paste; normal typing remains supported. An automated regression verifies that the host cannot change an existing draft or cancel the search input's native paste.
- Claude's fixed conversation banner could obscure the first line of a result. It is now included in jump positioning, verified live after the 1.4.2 reload.

## Scope

“All matches” means all matching messages currently rendered by the host. The extension does not fetch private APIs or search history that the site has not loaded. Starting with 1.6.6 it retains previously captured messages when virtualized hosts unload them; the earlier rendered-window-only checks above describe their historical builds. Exact-word groups are independent of semantic ranking thresholds. Each message appears once per word group even if the word repeats; the jump targets its first occurrence. A message can appear under multiple words. Pagination has no total-result cap.

Synthetic reports, live audit metadata and screenshots are saved as private local artifacts outside the repository. No private conversation text or URLs are included here.

## 1.6.4 actual long-chat smart-search retest — 2026-10-17

Reused four unchanged vague descriptions from the earlier live evaluation, with the completed BGE and cross-encoder pipeline (ready phase, empty fallback status). No messages were submitted; both composers remained empty.

| Site / description | First result | Actual jump |
| --- | --- | --- |
| Claude / hardware waiting on the cupboard rather than calculating | Memory bottleneck, message 32 of 32 | Exact sentence visible at 62 px, below the 48 px header |
| Claude / tidying the kitchen will not give a big speed boost | Kitchen analogy, message 30 of 32 | Intended paragraph at 106 px; unchanged in a delayed check |
| Gemini / workers packing memories and starting over | Original thread-handoff request; matching answer second | Failed: the host clipped the matching text inside a collapsed prompt |
| Gemini / same person recognisable while locations change | Character continuity answer | Relevant continuity text visible near the top; unchanged in a delayed check |

Claude virtualizes its 32-message conversation: the initial window exposed nine message articles, later five, rather than the full history. Gemini exposed all eight exchanges / sixteen messages. These are selected-passage compatibility checks, not complete-history recall measurements. The first local indexing pass was noticeably slow (hundreds of passage vectors); partial results were not counted as final rankings.

The Gemini failure also exposed a stale navigation binding: expansion replaces the prompt text element, while cached rankings retained its old DOM handle. Repeated clicks then reported that the message changed. Version 1.6.5 expands the selected prompt through the host's own control, waits for layout to settle, rebinds the destination after replacement, and resolves cached rankings against current index documents without recomputing unchanged rankings. Its installed-extension regression covers delayed expansion, replaced text nodes, repeated semantic clicks and literal-result clicks. A unit regression checks cached destination rebinding without reranking. After the user reloaded 1.6.5, the same four vague queries again ranked the intended fact first with no fallback status. Both Claude destinations were readable (memory sentence at 88 px; kitchen paragraph at 107 px) and unchanged in delayed checks. Gemini’s previously failing handoff click automatically expanded the collapsed prompt and exposed the original handoff text; a second click using the cached ranking also succeeded without a stale-message warning. The continuity query selected the relevant answer and reached its visible continuity sentence. Final checks confirm the tested destinations remain visible and composers remain empty. Full validation: 44 unit and 78 browser checks, 122 total.
