# Mod review: 2026-10-24

Two-axis review of the seven mods in `mods/`, run as read-only subagents against the working tree on `plaktoz/feat-review`. Standards covers repo conventions, cross-platform correctness (Linux and Windows first), correctness, and Fowler smells. Spec covers each mod's README (and `library/theme-mod-spec.md` where it applies).

Line references come from the review agents. They were not re-checked against source when this report was written. Verify each one before editing.

## Verdicts

| Mod | Linux | Windows | Main issue |
|---|---|---|---|
| brain-dump | likely | likely | Code is OS-neutral. Install docs are macOS-only. README says the mod is not in a marketplace, but `marketplace.json` lists it. |
| cache-warm | likely | likely | A ping can leave `isPinging` stuck true. Glyphs may render wrong on legacy Windows consoles. |
| handoff | likely | likely | `/handover` has no error handling. Path comparison is not separator- or case-normalized. Stale README marketplace claim. |
| screen-share | likely | likely | Tool input in `ToolGroup` stays unmasked during a share. Up to 8 s added latency per prompt, tool result and turn. |
| switchboard | likely | **no** | Reads only `HOME`, which native Windows does not set, so the pane always shows "No mods installed." Path check uses `/`. |
| theme-cli | likely | **no** | Theme library reads only `HOME` and spawns `python3`, so Windows falls back to placeholders. README says "The mod makes no sound", which contradicts the code. |
| theme-desk | likely | likely | Fails typecheck (`noUncheckedIndexedAccess`). Desktop surface has never been seen drawing. |

Windows verdicts come from reading the code. Tests ran on darwin only.

## Cross-cutting issues

1. **`HOME`-only lookups break Windows.** switchboard and theme-cli. Both need a `USERPROFILE` fallback.
2. **Stale marketplace claims.** handoff, cache-warm and brain-dump READMEs say the mod is not in a marketplace. `.claude-plugin/marketplace.json` lists all three.
3. **macOS-only install docs.** Most mod READMEs use `~/Developer`, `/Users/your-name/...` and "open the app named Terminal". Only the root README mentions the Windows installer.
4. **Unguarded fire-and-forget async.** handoff (`/handover`), cache-warm (`void tick`, `void ping`), switchboard (`void refresh`), screen-share (button `onPress`). Failures become unhandled rejections.
5. **Test runners disagree.** theme-cli passes 27 tests under `claude plugin test` but `bun test` reports `Cannot find module 'claude-code/testing'`.

## Findings by mod

### brain-dump

**Standards**
- Hard: README.md:253-260 and 217 say the repo lacks `marketplace.json` and Method C is "Not available yet". `.claude-plugin/marketplace.json:13-14` lists `brain-dump`.
- Hard: README.md:58 gives tests as lines 12–134. The file runs to 138.
- Windows: README.md:240-251 (Method B) defers the `CLAUDE_CODE_PLUGIN_DIRS` separator to the Claude Code docs. The only example is `/Users/your-name/...`. Windows needs `;`.
- Windows: README.md:203-209 is macOS-only (Terminal app, `~/Developer`, `pwd`) and does not mention `scripts/install-mods.ps1`.
- `tsconfig.json:1` extends the git-ignored `.claude-plugin/types/tsconfig.json`. Documented at README.md:396.
- Possible: `isQuestion` (`hooks/register.ts:32-48`) does not check 2–4 string options. Bad options reach `$.ui.ask` (line 81).
- Possible: `draftFrom` (`register.ts:77, 93-97, 117-121`) treats cancel as "send original".
- Possible Duplicated Code: `Submission` (`register.ts:29`) re-declares `PromptSubmitInput`.

**Spec**
- Partial: README.md:133 "2 to 4 options" is not enforced.
- Contradiction: README.md:170 "times out" vs README.md:132 "none set". `register.ts:66` sets no `timeoutMs`.
- Wrong: README.md:160 says the draft is shown. `register.ts:102` logs the full draft, but the terminal draws only the first 2000 characters.
- Coverage gap: no test for classify throwing, invalid options, or cancel.

**Windows fixes in scope:** README install docs (Method B separator, Windows path forms, PowerShell installer pointer).

### cache-warm

**Standards**
- Windows: glyphs `◔ █ ░` (`hooks/register.tsx:165,170`) and `…` (`:156`) may render as mojibake on legacy consoles with a non-UTF-8 code page. Windows Terminal is fine.
- Windows: README.md:172-212 install is macOS/Unix only (`~/Developer`, `/Users/your-name/...`, `~/.claude/settings.json`, "On macOS, open the app named Terminal").
- Bug: `register.tsx:56` sets `isPinging: true`. The early return at `:65` does not clear it. `:136` clears it only when `e.usage` is present. A turn interrupted without usage leaves "Pinging…" showing, and `tick` (`:46`) does not clear it until the next `turn.complete`.
- Bug: a ping whose fork outlives the turn overwrites the newer turn's expiry and tokens (`:81`). `pings` is incremented on a count reset to 0.
- Silent errors: `:142` `.catch(($, e, next) => next(e))` logs nothing. `void tick($)` and `void ping($)` (`:95`, `:97`).
- Possible: no timeout on `$.model.fork` (`:60`).
- Possible: `maxPings` from `Number(...)` (`:103`) can be NaN.
- Possible smells: local `isPinging` (`:153`) means "scheduled" while `c.isPinging` means "in flight". Repeated token sum (`:75`, `:133`), cache-write literal (`:81`, `:136`), `ttl === '1h'` (`:102`, `:104`). `ui.render` handler (`:144-189`) mixes concerns.

**Spec**
- Stale: README.md:162 "not in a marketplace yet" and README.md:220-223 say there is no marketplace file. `.claude-plugin/marketplace.json:18-19` lists `cache-warm`.
- Drift: README §3.5 says `now` is reset only by `tick()`. It is also set in `ping()` (`:80`) and `arm()` (`:94`). `cache.isPinging` is reset in `turn.complete` (`:136`).

**Windows fixes in scope:** README install docs. Glyph fallback is a design decision, see the task list.

### handoff

**Standards**
- Windows: `hooks/register.ts:46` compares paths as raw strings (`inv.edited.includes(file)`). `C:\a` and `c:/a` count as different files, so a file can appear as both read and edited.
- `/handover` has no error handling (`register.ts:89-93`). The offer path does (`:161-167`).
- A dropped handoff does not reset `lastTurnEnd` (`register.ts:163`), so the cold-cache question can repeat.
- `session.measure` read-then-update (`register.ts:113-115`) is not atomic.
- `WebFetch` URLs go into clipboard text unfiltered (`register.ts:102`). Tokens in query strings leak.
- After `/clear`, goal, lists and flags persist. README admits this.
- Possible smells: token-threshold message repeats `TOKEN_THRESHOLD` (`:143`). `pending` plus `hasOfferedTokens` encodes a three-state machine. Bare-string choice labels (`:159`). `describe` (`:36`) shadows the test global. `Engine` (`:53`) is a pure alias.
- Docs: README.md hardcodes line numbers in sections 2, 4 and 6.4. `tsconfig.json` extends an ungenerated types folder (README 6.6).

**Spec**
- Stale: README 5.2 and 5.5 say the marketplace method is "Not available yet". `.claude-plugin/marketplace.json:23` lists `handoff`.
- Partial: README 3.6 promises a fallback "if the request fails". Only the offer path handles it.
- Undocumented: "Tools used" counts the mod's own `AskUserQuestion` and subagent calls.
- Windows/platform: 5.1 "On macOS, open the app named Terminal". 5.4 uses `/Users/your-name/...`. Examples use `~`, `pwd`, `bash`. No Windows path form, no PowerShell variant.

**Windows fixes in scope:** `register.ts:46` path normalization (separators and case on win32), README Windows path forms and PowerShell variant.

### screen-share

**Standards**
- No repo convention breaches. `claude plugin validate` passes with `ICON_MISSING`.
- Cross-platform: nothing OS-specific found. No Windows fixes needed.
- Latency: `prompt.submit` (`register.tsx:231`), `turn.complete` (`:237`) and catch-all `tool.call` (`:221-225`) each await Haiku for up to 8 s while the mode is on.
- Resume: `session.start` (`:192`) restores `isOn` but not learned names.
- Over-masking: `PHONE` regex masks plain figures such as `2024 2025 2026`, `3 4 5 6 7 8 9`, `1.234.567 units`.
- CJK: `namePattern` boundary (`:55`) stops CJK names in unspaced text.
- Suffix currency (`5€`, `1.234,56 €`, `5 million dollars`) is missed.
- `bar` (`:24`) has no `u` flag, so astral characters count double.
- Button `onPress` (`:303`) has no `.catch`.
- `deepMask` (`:276`, `:286`) masks values, not keys.
- Test gaps: `set_mode`, `hide_names`, mode restore, phone and money edge cases.

**Spec**
- Partial: "mode stays on across sessions" holds for the flag, not the names.
- Wrong: "plain figures are not hidden" is contradicted by the over-masking.
- Undocumented: tool inputs and results and prompts go to Haiku. `ToolGroup`, `AskUserQuestion` and `InfoNotice` stay unmasked. Slash-command prompts are not scanned. `MODE_PROMPT` is added to the system prompt.

**Windows fixes in scope:** none. No Windows-specific issues found.

### switchboard

**Standards**
- Windows, hard: `hooks/register.tsx:48,129` read `$.env.get('HOME')`. Native Windows sets `USERPROFILE`. `refresh` returns silently, the pane shows "No mods installed.", and the poll does nothing.
- Windows: `~/.claude` lookup ignores `CLAUDE_CONFIG_DIR`. This breaks on Linux too when set.
- Windows: `register.tsx:32` `cwd.startsWith(p.projectPath + '/')`. Windows paths use `\`, so project and local plugins in subfolders never match. Drive-letter case can differ.
- Windows: `register.tsx:37` builds `${home}/${file}` by hand.
- Windows: `register.tsx:54,95` spawns `['claude', ...]` with no shell. A `claude.cmd` npm shim may not spawn. The `.catch` hides the error. Agent marked this "likely", not verified.
- Windows: `register.tsx:99` `.split('\n')[0]` leaves a trailing `\r` on CRLF output.
- Correctness: `toggle` (`:88-118`) has no `try/finally`, so `isBusy` can stay set.
- `JSON.parse` output (`:59-66`) not checked to be an array. `void refresh($)` (`:126`, `:139`) has no `.catch`.
- `refresh` can run concurrently with no guard.
- Only `~/.claude/*` is watched (`:17`).
- Tests cover only empty and one-row renders.
- Smells: duplicated HOME and fingerprint (`:48-51`, `:129-131`), data clump `(home, file)`, names `print`, `seen`, `at`, `ran`, `scope: string`, `ListedPlugin` vs `SwitchboardRow`, module-level mutable `seen` and `isBusy`.

**Spec**
- Partial: "Install a new mod and it appears within a few seconds" works only for the two watched files. Never on Windows.
- Wrong on Windows: project and local plugin listing depends on the `'/'` prefix.
- Misleading empty state: "No mods installed." (`:153`) also shows when the lookup failed.
- Undocumented: presses ignored while busy, versions cut to 12 characters, sort order, poll runs when pane closed.
- Platform: needs `claude` on `PATH`, which only the root README says.

**Windows fixes in scope:** HOME/USERPROFILE, path separator handling, `\r\n` split, `claude` spawn error surfacing, path join.

### theme-cli

**Standards**
- Windows, hard: `hooks/library.ts:30,36` `rootOf` reads only `HOME`. Theme library, `/theme-list`, `/theme-new` and `readChoice` all fall back. `/theme-new` says "HOME is not set".
- Windows, hard: `hooks/library.ts:155` spawns `python3`. Windows often has only `py` or `python`. `library.ts:162` falls back to placeholders.
- Windows, hard: `hooks/theme.ts:186` `resolvePath` treats only a leading `/` as absolute. `C:\art\a.png` becomes `${dir}/C:\art\a.png`. The stamp at `library.ts:94` watches a nonexistent path, so edits never rebuild. Python's `is_absolute()` (`scripts/build-theme.py:33`) handles it.
- Windows: `scripts/build-theme.py:249,269` `read_text()` and `write_text()` have no `encoding="utf-8"`. cp1252 fails on non-ASCII.
- Windows: `scripts/build-theme.py:270` `os.replace` onto `frames.json` can raise `PermissionError`. Only the frame loop catches errors.
- Possible Windows: `hooks/draw.ts:129` half-blocks and truecolour on legacy conhost. Unverified.
- Bug: `hooks/register.tsx:39` `loop` in module variable. Hot reload drops the `AbortController`, so `afplay` can keep playing. Spec open question Q4.
- Tests: `claude plugin test` 27/27. `bun test` 0 pass, 2 module errors.
- Smells: `register.tsx` (487 lines) mixes audio, timer, crew, nine commands and rendering. `clamp` repeated (`register.tsx:44`, `draw.ts:20`, `theme.ts:77`). `$.audio.play` repeated (`:90-91`, `:103`). `library.ts:192` pass-through re-export.

**Spec**
- Contradiction: README.md:635 "The mod makes no sound" vs §3.10 and the code.
- Contradiction: README.md:305 says `/theme-mute` persists "in new sessions". `isMuted` is session state (`register.tsx:28`).
- Counts: §6.1 says 7 `command.run` hooks, code has 9 (`:226-329`). §6.2 says 21 tests, suite runs 27. §2 line numbers stale.
- Drift: `library/theme-mod-spec.md` omits `agentJoin`/`agentLeave` cues, global `muted` and `volume`, Helper Desk pane. Theme packs moved to `~/.claude/theme-cli`.
- Platform: §5.1 macOS-only. §6.3 uses `/tmp` paths. Sound uses `afplay` (macOS-only), which is documented.

**Windows fixes in scope:** HOME/USERPROFILE fallback (also passed to the build script), Python interpreter fallback, absolute-path detection for drive letters and UNC, UTF-8 encoding in build script, `os.replace` failure handling, README Windows install and `/tmp` example. Sound on Windows is a design gap, see the task list.

### theme-desk

**Standards**
- Hard, typecheck: `hooks/register.tsx:247` and `:295` `COLOURS[i % COLOURS.length]` is `string | undefined` under `noUncheckedIndexedAccess`. `tsc` reports TS2345 at `:247`, `:299`, `:313`.
- Hard: `register.tsx:218-219` runs `reconcile` only on `session.end`. A missed `SubagentStop` leaves agents running.
- Hard: `register.tsx:19` `frame` is read (`:236`, `:279`) but never written. The sprite never changes pose.
- Dead state: `register.tsx:14` `beat` is written, never read.
- Packaging: `claude plugin validate` refuses directory submission (`LICENSE_MISSING`) and warns on missing `author`.
- No tests, no README.
- Cross-platform: no path joins, shell, env or OS APIs. Only write is `$.fs.write('theme-desk-log.txt', …)` (`:91`), relative to cwd.
- Duplication: card markup `:293-305` and `:307-319`. `note`, `setAgent`, `reconcile` copied from theme-cli. `types/index.d.ts` repeats theme-cli types.
- Speculative: `isDonePending`, `now` unused. `'error'` in `Beat` never set.
- Divergent: `register.tsx` (324 lines) mixes state, tracking, art, pane, strip, commands.

**Spec** (`library/theme-mod-spec.md` §6.4–6.5)
- Missing: no timer for elapsed time. Walk cycle not implemented (`sprite()` has no `<animate>`). Finale and §7.2 audio absent.
- Wrong: cards show task description rather than step line. No progress bar or border states. Running cards are not newest-first.
- Wrong: finished agents never leave the strip (`:225-257`), breaking one-sprite-per-live-agent.
- Missing: `/desk` only opens, does not toggle. `reconcile` on start and 2 s tick absent. `×N` overflow counter absent.
- Undocumented: `/desk-hide` and `/desk-dump` (writes `theme-desk-log.txt`).

**Windows fixes in scope:** none. No Windows-specific code issues found.

## Task list

Status key: `[ ]` open, `[x]` done, `[-]` not applicable or deferred with reason.

Each task states its acceptance criteria (AC). "Verified by test" means an automated test or script run covers the AC. "Verified by reading" means the code was checked by reading only, because no Windows machine is available. Windows behaviour is never verified by test here.

### Windows fixes

- [x] **switchboard**
  - [x] `hooks/register.tsx`: read `USERPROFILE` as fallback for `HOME` (lines 48, 129). AC: with `HOME` unset and `USERPROFILE` set, the plugin list is read from `USERPROFILE`. Verified by reading.
  - [x] `hooks/register.tsx`: normalize separators and drive-letter case in the project-path prefix check (line 32). Applies only to drive-letter and UNC paths; POSIX paths compare exactly as before. AC: `C:\proj\sub` matches a project at `c:\proj`; a POSIX path matches exactly as before. Verified by reading.
  - [x] `hooks/register.tsx`: build paths without hardcoded `/` (line 37). The hook runtime has no `path` module, so the join uses the separator the home path already has. Verified by reading.
  - [x] `hooks/register.tsx`: surface the spawn error in `note` instead of swallowing it (lines 54, 95). `refresh` also notes a non-zero exit of `claude plugin list`. Verified by reading.
  - [x] `hooks/register.tsx`: split on `/\r?\n/` (line 99). Verified by reading.
  - [x] `README.md`: document Windows paths and `claude` on `PATH` on Windows. Verified by reading.
- [x] **theme-cli**
  - [x] `hooks/library.ts`: `rootOf` falls back to `USERPROFILE`; pass the same root to the build script (lines 30, 36). Verified by test (`with HOME unset, the library is found under USERPROFILE`).
  - [x] `hooks/library.ts`: Python interpreter fallback: `python3`, then `python`, then `py -3`, keeping `-I` (line 155). Each launcher is probed with `--version` first, so a build that times out is not run again under the next one. Verified by test (two new tests).
  - [x] `hooks/theme.ts`: absolute-path detection for drive letters and UNC paths (line 186), and accept `~\`. `build-theme.py` `resolve` accepts `~\` too, to match. Verified by test.
  - [x] `scripts/build-theme.py`: `encoding="utf-8"` on `read_text` and `write_text` (lines 249, 269). Verified by reading. macOS defaults to UTF-8, so a run there cannot show the Windows failure.
  - [x] `scripts/build-theme.py`: catch `OSError` on `os.replace` and keep the previous cache (line 270). AC: a failing `os.replace` leaves the previous cache and exits cleanly. Verified by running the script with a forced replace failure (macOS); the Windows lock case is verified by reading.
  - [x] `README.md`: Windows install path and a non-`/tmp` example (§5.1, §6.3). §5.4 also gets the Windows settings path. AC: a Windows reader can follow §5.1 without a macOS-only step. Verified by reading.
  - [-] Sound on Windows: deferred. `afplay` is macOS-only and the mod documents sound as macOS-only. Needs a design decision on a Windows player.
- [x] **cache-warm**
  - [x] `README.md`: Windows install path (lines 172-212). Verified by reading.
  - [-] Legacy-console glyphs (`hooks/register.tsx:156,165,170`): deferred. An ASCII fallback changes the look on macOS too. Needs a decision on the fallback glyph set.
- [x] **handoff**
  - [x] `hooks/register.ts`: normalize path separators and case on win32 before comparing (line 46). The hook runtime has no platform flag, so this keys on path shape: drive-letter and UNC paths fold slashes and case, POSIX paths compare as before. Verified by reading.
  - [x] `README.md`: Windows path forms and PowerShell variant (§5.1, §5.4). Verified by reading.
- [x] **brain-dump**
  - [x] `README.md`: Method B separator (`;` on Windows) and Windows path examples (lines 240-251). The separator was checked in the Claude Code binary, which splits `CLAUDE_CODE_PLUGIN_DIRS` on `path.delimiter`. Verified by reading.
  - [x] `README.md`: Windows install notes and pointer to `scripts/install-mods.ps1` (lines 203-209). Verified by reading.
- [-] **screen-share**: no Windows issues found.
- [-] **theme-desk**: no Windows issues found. The typecheck and state issues are non-Windows and are out of scope for this task.

### Verification

- [x] Run `claude plugin test mods/<mod>` and `claude plugin validate mods/<mod>` for each changed mod. Record the output.
  - switchboard: test 2/2 pass. Validate passed with warnings (`LICENSE_MISSING` for the directory profile, as before).
  - theme-cli: test 31/31 pass (27 before, plus 4 new). Validate passed.
  - handoff: test 9/9 pass. Validate passed with warnings (as before).
  - brain-dump: test 10/10 pass. Validate passed with warnings (as before).
  - cache-warm: test 5/5 pass. Validate passed with warnings (as before).
- [x] Run `python3 -I -m py_compile scripts/build-theme.py` after the script edits. Passed; the `__pycache__` it made was removed.
- [x] Confirm nothing outside the listed files changed (`git status`). Extra files, all deliberate: `mods/theme-cli/hooks/theme.test.tsx` (its fake `process.run` counted the new `--version` probe as a build), `mods/theme-cli/hooks/register.tsx` (the `HOME (or USERPROFILE)` message), and `README.md` (the `docs/` layout row). `CLAUDE.md` gained the cross-platform, task-list and subagent rules in this session, not in this task.
- [x] Windows behaviour is not verified on a Windows machine. Recorded in the final summary.

### Parked (KIV)

Parked by the user on 2026-10-25. Do not raise again unless the user asks. The decision is recorded in the mod's own folder, `mods/theme-desk/README.md`, so a review of that folder sees it.

- **theme-desk docs and fix pass.** Typecheck errors (TS2345), `reconcile` on session end only, `frame` never written, no README. The mod is not in the marketplace.

### Non-Windows fixes

Started 2026-10-25, one agent per mod, in parallel. Each agent first confirms its finding in the code. If the code does not show the finding, the agent marks the task `[-]` and says why. Each agent also checks the module README and `README.html` against its change, runs `claude plugin test` and `claude plugin validate`, and records the result next to each task. Nothing here has run on Windows or Linux.

- [x] **cache-warm** (`mods/cache-warm/hooks/`) — all subtasks below checked
  - [x] `isPinging` can stay true after a turn ends without usage. AC: a new test shows `isPinging` false after such a turn. The 5 existing tests still pass.
    - Result: the no-usage branch of `turn.complete` clears `isPinging` (`hooks/register.tsx` line 152). Test "a turn that starts during a ping and ends without usage clears isPinging" fails on the old code and passes now. `claude plugin test mods/cache-warm`: 7 pass, 0 fail (5 before), re-run by me.
  - [x] A rejected `void tick($)` or `void ping($)` is unhandled. AC: a new test with a rejecting ping raises no unhandled rejection and leaves `isPinging` false.
    - Result: `tick` and `ping` have `.catch` handlers (lines 108 and 110) that write to the debug log with `$.ui.log`. A failed ping clears `isPinging`, cancels the timers and clears the cache. Test "a ping that rejects clears isPinging, logs to the debug log and raises no rejection" passes. The test forces the rejection with a reply that has no `usage`. Validate passes with warnings.
  - [x] Restore the timeline diagram to the README. AC: `README.md` has it as Mermaid, `README.html` has the matching SVG, both as the same Figure number with the same labels. The SVG parses and renders in headless Chrome without overflow.
    - Result: Figure 2 is a Mermaid `gantt` in `README.md` and a hand-drawn SVG in `README.html`, with the same three intervals. The SVG shows the `0:00 to 4:15` text inside each bar, but the Mermaid gantt does not. The SVG parses and renders in headless Chrome with no overflow. `mmdc` is not installed, so the Mermaid syntax has not been rendered. The ping figure is now Figure 3 in both files. Verified by reading for Windows and Linux.
- [x] **handoff** (`mods/handoff/hooks/`) — all subtasks below checked
  - [x] `/handover` has no error handling when `$.model.fork` fails. AC: a new test where the fork throws still copies a fallback handoff and does not throw.
    - Result: `buildHandoff` in `hooks/register.ts` now wraps the fork in `try`/`catch` and falls back to the goal and the facts. This covers `/handover` and the offer path. New test "/handover still copies the goal and the facts when the fork throws". `claude plugin test mods/handoff`: 10 pass, 0 fail (9 before). Without the fix the new test fails (run in a temp copy by the agent). Validate passes with warnings. README pair updated (test count, line numbers, Figures 1 and 4, Known limits). The offer path has no test of its own. A real engine fork failure was not run, and Windows and Linux were not run: verified by reading.
- [x] **screen-share** (`mods/screen-share/hooks/`) — all subtasks below checked
  - [x] `ToolGroup` input, `AskUserQuestion` and `InfoNotice` text are not masked. AC: new tests show a known name and email replaced by bars in each. If the engine API does not allow it, the agent says why and leaves the task `[-]`.
    - Result: all three were unmasked before the change, and the new tests failed on the old code. `ToolGroup`: the engine ignores a rewrite of `calls`, so the mod sets `isExpanded: true` on a match, and the rows draw masked. `AskUserQuestion`: the header, option descriptions and previews are masked, but `question` and option `label` stay unmasked, since the answer is keyed on them. This is a new documented limit. `InfoNotice`: masked. README pair updated. `claude plugin test mods/screen-share`: 8 pass, 0 fail (3 before), re-run by me. Validate passes with warnings. The live engine path is not run. Verified by reading for Windows and Linux.
  - [x] The button `onPress` has no `.catch`. AC: a new test with a failing `setMode` raises no unhandled rejection.
    - Result: a `.catch` now shows a toast. The new test fails without the `.catch` (`screen-share: $.store.set: the store refused the write`) and passes with it.
- [x] **switchboard** (`mods/switchboard/hooks/`) — all subtasks below checked
  - [x] `isBusy` can stay true if `update` throws in `toggle`. AC: a new test shows the next press works after a failed one.
    - Result: `toggle()` resets `isBusy` in a `finally`. Test "the next press works after a switch failed" fails on the old code and passes now.
  - [x] A non-array result from `claude plugin list --json` is not checked. AC: a new test shows a note and no throw.
    - Result: `refresh()` checks `Array.isArray` and shows "Could not list mods: the output is not a list". Test "output that is not a list shows a note and does not throw" passes.
  - [x] A rejected `void refresh($)` is unhandled. AC: a new test with a rejecting `refresh` raises no unhandled rejection.
    - Result: `refreshOrNote()` catches it and shows the note. The poll interval still has no `catch`, and is recorded as a known limit. `claude plugin test mods/switchboard`: 5 pass, 0 fail (2 before), re-run by me. Validate passes with warnings. Live pane check: no person has done this check yet. Verified by reading for Windows and Linux.

Each agent must keep to the Cross-platform rules in `CLAUDE.md`.

### Needs a decision (not started)

- screen-share latency: scanning waits up to 8 seconds for Haiku in `prompt.submit`, `turn.complete` and `tool.call`.
- screen-share: restore learned names on resume.
- cache-warm: a timeout on the ping request.
- handoff: stop counting the mod's own tool calls.
- ~~brain-dump license (`LICENSE_MISSING`).~~ Done 2026-10-25: MIT, holder `plaktoz`, year 2026. `mods/brain-dump/LICENSE` added; `plugin.json` has `author` and `license`. `claude plugin validate` ends `✔ Validation passed`; the icon warning stays. `claude plugin test`: 10 pass.
- theme-cli: marketplace install line and long table cells.

### Not in this task (earlier, for reference)

- `bun test` module resolution in theme-cli (documented in its README).
