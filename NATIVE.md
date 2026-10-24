# ThreadRail Local

For the new **in-app Claude Code mod**, see [desktop/README.md](desktop/README.md). This document describes only the older companion viewer; its verification does not establish native app scrolling.

A local companion for saved Codex desktop/CLI and Claude Code desktop/terminal/IDE sessions. It provides the same navigation rail and thread picker, semantic search across loaded sessions, complete chronological word groups and exact passage jumps in its own transcript viewer.

It does not insert a rail into the stock desktop app, terminal emulator or IDE. It does not control their internal scrollbars. **Copy resume command** offers the original session's CLI resume command; you choose when to run it. Opening/resuming a host session is separate from positioning a passage in this viewer.

## Run

From the source checkout:

```sh
npm install
npm run build
npm run native
```

Open **http://127.0.0.1:4187**. The project scope is the directory from which the server was started. Use `npm run native -- --project /absolute/project/path` to choose another one, or check **All projects** in the interface. `--port 4188` changes the port.

From the standalone `threadrail-local-1.6.2.zip` package, unzip it, run `npm install`, then `npm start`. It includes the offline search assets and needs no browser extension. Node.js 20 or newer, the Codex executable for Codex history, and locally saved Claude Code sessions are required. If Codex is not on PATH, set `THREADRAIL_CODEX_BIN` to its absolute executable path before starting.

1. Click **Connect Codex** or **Connect Claude Code**. Only session metadata is listed at first, 50 entries per page. **More sessions** reads another page.
2. Open a session to get the rail and thread search. **Refresh** reads its latest saved messages.
3. Click **Index listed sessions** to read their saved input/output text, then describe what you remember in the top search box. **Best matches** shows one passage per session. **By word** retains every matching input/output in session and message order, in pages of 20.
4. Click a result to open its session in the viewer and position its exact text. **Copy resume command** provides a shell-quoted command for the original CLI session.

Reading and indexing are manual. Stop indexing cancels the queue after its current read; switching project scope discards pending old-scope results. Metadata, text and vectors remain in this page's memory and are discarded when it closes. Reconnect and index again after reopening. No hooks, autostart services, settings changes or AI prompts are installed or sent. Stop the server with Ctrl+C in its terminal.

## Sources and coverage

Codex uses the installed `codex app-server` over local stdio. Its method allowlist includes initialization and stored-history list/read/pagination only. It cannot start/resume turns, run commands, approve tools or mutate sessions. Main local CLI, IDE, app-server and exec sessions are listed; archived and cloud-only sessions are not included. Up to 5,000 turns are read per session; a longer history is labeled partial. Older versions with no turn pagination use their full-history read method. Known desktop attachment, annotation, appshot and question-reply envelopes are projected to their actual typed requests/answers, so picker titles do not show transport metadata. Pure environment/page metadata is omitted.

Claude Code uses the pinned official Agent SDK's `listSessions` and `getSessionMessages` read functions. It follows the SDK's active parent-message chain and reads local interactive sessions, including the Code tab's locally saved desktop sessions. Use **All projects** to list desktop sessions outside this project's folder. Programmatic/background sessions are excluded from the list. System, tool and hidden reasoning blocks are not indexed; only visible user/assistant text is shown. Bodies are displayed as plain text, including their Markdown syntax; original rich cards and images are not reproduced. Save timing and host storage determine which recent output is available.

Native answer vectors encode their own text rather than borrowing the opening brief's subject. A small technical-equivalence layer recognizes JavaScript runtimes (such as a Node toolchain) for meaning search. When a query describes a substantive event before a temporal background clause, meaning search combines the complete description with a stronger vector for that event. Questions about temporal order retain the whole query. Original text, displayed excerpts and exact-word groups are unchanged by these meaning-only hints.

The server binds to loopback only. The API requires its local session cookie and custom same-origin header; cross-origin requests and arbitrary file paths are refused. Text is rendered literally, never as executable HTML. The packaged English MiniLM model runs locally. The companion has no remote inference route, analytics or transcript-upload endpoint. The Codex executable itself may perform its normal startup activity; ThreadRail sends no generation request.

Official references: [Codex App Server](https://developers.openai.com/codex/app-server), [Claude Code saved session APIs](https://code.claude.com/docs/en/agent-sdk/sessions).

## Verification

Native source parsing, read-only RPC methods, pagination, project scope and local API isolation have unit coverage. Browser integration tests use synthetic saved sessions with the real offline model and verify cross-provider meaning search, exact text deep in long answers, all 54 ordered exact-word results and cancellation during a scope change.

The actual installed Codex 0.162.0-alpha.17.2 reader listed this project's session and read 165 saved input/output messages without resuming or generating a turn. Claude Code 2.1.300's saved sessions were also listed and read using the SDK. UI live checks and final totals are recorded in COMPATIBILITY.md. Browser-host Codex and Claude Code adapters are distinct from this companion; empty live web session lists do not prove transcript compatibility.
