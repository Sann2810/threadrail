# ThreadRail inside desktop apps

The browser extension and ThreadRail Local viewer do not insert UI into native apps. This directory contains the separate, native Claude Code mod. Native Codex transcript control is still unimplemented.

## Claude Code native mod — 1.7.0

The mod uses Claude Code's official Mods API. It draws a host-native pane and a small **⌕ ThreadRail** button above the original composer. `/threadrail` opens the same pane. It supplies Top, search, Bottom, ten unnumbered nearby exchange markers, a prompt picker, local meaning results and chronological word groups across inputs and outputs. Search covers the current session. Results call the host's `$.ui.scroll` with the saved original message UUID. No companion browser page is opened.

Ash rose, faint ivory and gold accents use the host's native typography. Clicking a marker opens the picker; selecting a preview requests a jump. Only the visible controls handle input. Word groups have bounded pages of 20 matches and six words per page, with no total-result cap. This keeps long chats below the native rendering limit. Changing a query or session invalidates old meaning results. Appended messages update the index; an interrupted turn does not become a completed exchange.

Meaning search uses the bundled local MiniLM model and the shared retrieval code. Word matches remain available if meaning inference fails. Only visible text from the current session is read through the official saved-session SDK and live append/render events. Tool contents and hidden reasoning are excluded. Search runs in a local Node subprocess, with no prompt submission, API key, remote inference or model download. Its disk cache contains hashed text fingerprints and vectors, not raw conversation text. No hooks change prompts, tools, permission decisions or original transcript drawings.

### Install or rebuild on this computer

Requires an installed Node.js 22+, project dependencies, the model assets from `npm run build`, Claude Code CLI 2.1.287+ and a compatible desktop Code tab. The official docs list desktop support from 2.1.286; availability still depends on the host permitting mods.

```sh
npm run build:claude-code
npm run test:claude-code
npm run install:claude-code
```

The installer uses the official `claude plugin install` command at user scope. The local marketplace is `threadrail-local`, plugin `threadrail`. This scope is shared by local terminal, desktop Code and VS Code sessions on this machine. An open session needs `/reload-plugins`; then run `/threadrail` or click its composer button. A host policy or trust refusal must be resolved through the host; do not disable protections to force the mod to load. `claude plugin disable threadrail@threadrail-local` turns it off; `claude plugin uninstall threadrail@threadrail-local` removes it.

This is a development install from this checkout. The build pins this computer's Node executable and installed SDK/Transformers library locations, and copies the offline model. Keep this checkout and its dependencies in place. Rebuild/reinstall after moving them or changing the Node runtime. The generated helper is not a portable release archive.

### Verified and remaining work — 2026-10-16

- Official manifest and hook validation passes.
- Seven official mod-engine tests pass for desktop/terminal element validity, ten-item previews, word pagination, separate meaning results, model-error fallback, preservation of existing composer-band content, session reset and visible scroll failure handling.
- Six recording-host callback tests pass, including all 401 literal results in a 201-exchange fixture, exact original UUID requests, ambiguous repeated text, stale search invalidation and live appended messages. These verify requests, not real app scrolling.
- The real packaged model finds the saved Node-installation answer from a vague JavaScript-runtime query in an actual 38-message Claude desktop session. The installed cache copy also returns the intended source for the synthetic query “Zen was being dumb”.
- `claude plugin list --json` confirms `threadrail@threadrail-local` 1.7.0 is installed and enabled at user scope.
- **Actual desktop activation and search are now verified through native accessibility controls.** After unlocking the Mac, the existing film session loaded the composer button and a native Plugin pane with Top, search, Bottom, its original-prompt picker and all 38 saved messages. The vague query “setting up the JavaScript runtime before creating the video” returned the intended original Node-installation answer. The original composer remained empty; no AI turn was sent.
- **Native transcript navigation is blocked by the desktop host.** Activating the search result produced `Could not jump: transcript not scrollable here`. This is a real desktop refusal, distinct from the offline test kit's `no implementation for ui.scroll`. No successful native jump is claimed. Some native controls also returned stale-element/no-frame errors. Screenshot capture continued returning an older New session image despite the updated accessibility tree, so that stale image is not presented as proof of the pane. The captured native accessibility state and derived checks are saved outside the repository in the task's `threadrail-native-1.7.0` evidence folder.

The native scroll API targets original messages/render instances. It does not document arbitrary character-offset navigation inside one long message. The helper returns passage excerpts and offsets, but the mod currently requests the containing original message, not a guaranteed exact paragraph. Its Bottom request targets the final message with `block: end`; no successful real desktop navigation is established. All-chats search and cross-session native passage navigation are not implemented by this mod. The existing Local viewer remains a separate optional tool.

## Codex native app

The documented extension system can display sidebar apps, conversation panels and file viewers, and a documented deep link opens a chat. No supported original-transcript scroll/anchor hook was found. Computer use explicitly refuses control of the Codex app. A conversation panel showing copied messages would not satisfy the requested original-transcript rail. No app binary, signature, security setting or private Electron runtime has been modified.

Codex's requested native rail/search with original-passage jumps remains blocked on a supported host integration API. The existing Codex saved-history reader and companion viewer are not evidence of this feature working inside Codex.

Official references: [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview), [Mods interface and scrolling](https://code.claude.com/docs/en/plugins/mods/interface), [Mod test kit](https://code.claude.com/docs/en/plugins/mods/test), [Plugin installation and shared scopes](https://code.claude.com/docs/en/plugins/install), [Codex extensions](https://developers.openai.com/plugins/build/extensions), [Codex deep links](https://learn.chatgpt.com/docs/reference/commands).
