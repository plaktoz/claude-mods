# Task list: merge the Windows player into `theme-cli`, 2026-10-25

Status: T1, T1a, T2, T3, T4 done. T5 is the user's step and is open.

Goal: theme-cli plays its sounds on Windows. The engine's `$.audio.play` has no Windows player and resolves as if the clip played. The fix from `scratch/win-audio/` goes into `mods/theme-cli/` as a second module. It answers `audio.play` calls for WAV clips on Windows with PowerShell's `System.Media.SoundPlayer`. Everything else goes on to the engine.

Source: `scratch/win-audio/` (hooks `register.ts`, `wav.ts`, `register.test.ts`) and `scratch/win-audio-upstream-report.md`.

State key: `[ ]` open, `[x]` done, `[-]` not done (reason given).

## Decisions (confirmed by the user, 2026-10-25)

1. **Location (option A).** The Windows player lives in `mods/theme-cli/`, not in a separate mod.
2. **Commits.** None. The user has not asked for commits on this work. Ask before committing.
3. **Push.** None.

## Defaults picked by the agent (change on request)

- The new module is `hooks/winaudio.ts` (renamed from `register.ts`). Its helpers are in `hooks/wav.ts`. Its tests are in `hooks/winaudio.test.tsx`, to match `theme.test.tsx` and `register.test.tsx`.
- The command is `/theme-sound-test`, renamed from `/win-audio-test`. It is registered on every platform and says "Not Windows" elsewhere.
- The guard comment says to delete the module once the engine ships a Windows player.
- The README gives the new module its own sections. Section 3.10 says what plays on Windows. Section 7 says what is still unverified.

## Open risk: the working loop may not stop at turn end

The engine's type for `$.audio.play` says "the signal does not cross". The hook's event `e` carries `clip`, `shouldLoop` and `gain`, but no signal. theme-cli stops its loop with `stop.signal`, which the hook never sees. The port stops the PowerShell child with `next.signal`, which aborts when the dispatch is abandoned (user interrupt, budget). It may not abort when theme-cli calls `stop.abort()` at turn end. If so, the working loop keeps playing after the turn.

- T1 checks this in the test harness. The result is recorded in the task below.
- Only a Windows run can settle it for real. That is part of T5.

## Tasks

### T1. Port the player into theme-cli `[x]`

Work:
- Copy `wav.ts` into `mods/theme-cli/hooks/wav.ts`, as is.
- Copy `register.ts` into `mods/theme-cli/hooks/winaudio.ts`. Rename the command to `theme-sound-test`. Add the guard comment.
- Port the 5 tests from `register.test.ts` into `mods/theme-cli/hooks/winaudio.test.tsx`. Use the theme-cli test imports.
- Add `./winaudio.ts` to `modules` in `mods/theme-cli/hooks/hooks.json`.
- Add a test that aborts the caller's signal and checks whether the Windows loop stops. Record the result below.

Acceptance:
- `claude plugin test mods/theme-cli` passes: 31 old tests and the 5 new ones (plus any added in this task).
- `claude plugin validate mods/theme-cli` passes with no new errors.
- The abort result is written here: stops, or does not stop in the harness.

Result: `[x]` done, except the abort check, which failed (see T1a).
- `claude plugin test mods/theme-cli`: 39 pass, 0 fail (31 old, 8 new). The count was corrected from 38 (7 new) at T4; the later loop-stop test is included.
- `claude plugin validate mods/theme-cli`: 0 errors. It flags that `hooks.json` names a code module, which the directory review applies its own rules to.
- Abort check: a test that aborts the caller's `AbortController` while a looped clip plays. The loop kept running (`still playing`). The test was removed so the suite could pass. It is recorded in T1a.
- Design change made during T1: `winaudio.ts` exports `winAudio(on)`, called from `register()`. A second hooks module is refused by the validator ("a second entry is refused"), so the port is one module.
- Bug fixed during T1: reading `OS` per clip added an engine call before each cue. The tests then failed for theme-cli's success and error cues. `OS` is now read once at `session.start` (`readPlatform`).

### T1a. Working loop does not stop on Windows `[x]`

Finding: with `winAudio` in place, the `working` loop keeps playing after theme-cli aborts it. The engine does not pass the hook a signal (`audio.play` hook type: "the signal does not cross"). theme-cli stops its loop with its own `stop.abort()`, which never reaches the hook. The PowerShell child then runs until it is killed by something else.

Options (user to choose):
- A. Coupling: `winaudio.ts` tracks its looping child. `stopLoop()` in `register.tsx` calls an exported `stopWindowsLoop()`, which kills the child. Keeps the loop indefinite. Adds one call from theme-cli into the Windows module.
- B. Bounded loop: the child plays the clip for a set time, then stops. No stop call needed. The loop cannot run forever, so long turns go silent after the limit.
- C. Ship as is and say so in README section 7 until the fix lands.

Decision (user, 2026-10-25): option A.

Result: `stopLoop()` in `register.tsx` calls `stopWindowsLoops()` from `winaudio.ts`. `playWav` races the child against the stop, then asks the child to end with `return()`. The new test `theme-cli stopping its loop ends the Windows loop` runs `/theme-mute` while a looped clip plays. It passes with the fix and times out with `stopWindowsLoops` made a no-op (mutation check). Suite: 39 pass, 0 fail. `tsc` (5.6.3) exits 0.

Not verified here: that the real PowerShell child is killed by `return()` on Windows. The wait ends either way. T5 step 3 checks it by ear.

Note for tests: the hooks run in their own environment, so a test that imports a module-level function gets a different copy from the plugin's. Test through a command, as this test does.

Acceptance: the abort test (a looped clip stops when theme-cli stops it) passes in `winaudio.test.tsx`, and the T5 Windows check confirms the loop stops at turn end.

### T2. Rename check and cross-platform review `[x]`

Work:
- Confirm no `win-audio` name remains in `mods/theme-cli/`. Done: none remains (the `wav.ts` comment was renamed to `/theme-sound-test`).
- Review the new code against the cross-platform list in `CLAUDE.md`: path joins, `HOME` and `USERPROFILE`, POSIX-only commands, `python3`, UTF-8, CRLF.
- The PowerShell command is Windows-only by design, and it runs only after `OS === 'Windows_NT'`. Confirm this in the code.

Acceptance:
- The grep finds no `win-audio` name in `mods/theme-cli/`.
- The review notes each check as "verified by reading" or "verified".

Depends on: T1.

### T3. Type-check `[x]`

Work:
- `tsc` is not installed on this machine. Find a way to run the type-check without changing the repo (for example, `npx -y typescript@<pinned version>` into a temp folder, not into the repo). Pin a version at least two weeks old.
- Run it on `mods/theme-cli`.

Acceptance:
- Result: `npx -y -p typescript@5.6.3 tsc -p tsconfig.json --noEmit` in `mods/theme-cli` exits 0 with no output. Run outside the repo's tree (npx cache), nothing installed in the repo.

Depends on: T1.

### T4. Update the docs `[x]`

Result (2026-10-25):
- `mods/theme-cli/README.md`: rewritten by a subagent with the `ste-docs` skill. Sections 1, 2, 3.2, 3.8, 3.9, 3.10, 4.2, 5, 6.1 to 6.7, 7 and 8 changed. The "No Windows run" line now says the Windows sound is unverified. The stale sentence about the HTML is replaced with "It has the same content as this file."
- `mods/theme-cli/README.html`: regenerated from the Markdown by a subagent. Headings (8 `##`, 26 `###`) and code blocks (19) match the Markdown. The numbers, commands, `theme-sound-test`, and the file-path rows match. It also carries the same "same content" sentence.
- Root `README.md`: the theme-cli commands table gained `/theme-sound-test`. The entry at lines 21 to 45 and 170 has no Windows sound claim, so it is otherwise unchanged.
- Re-run by the docs subagent: `claude plugin test mods/theme-cli` gives 39 pass, 0 fail, across 3 files. `claude plugin validate mods/theme-cli` passes. `tsc` with typescript@5.6 exits 0. `bun test` fails with "Cannot find module 'claude-code/testing'"; the README says to use `claude plugin test` instead.
- Not verified: Windows playback, the `return()` kill on Windows, and the Linux path. The README says so.

Verification: the Markdown and HTML were compared by heading, code-block, and figure counts, and by the key numbers and paths. A Chrome render of the HTML showed the tables and figures complete.
Work:
- `mods/theme-cli/README.md`: section 1 (sound on Windows), section 2 (code table, with new rows and line numbers), section 3.2 (new `audio.play` row), section 3.8 (new command, count 9 to 10), section 3.10 (sound on Windows), section 6.2 and 6.5 (new test count and what each proves), section 6.7 (type-check result), section 6.6 (troubleshooting for "no sound on Windows"), section 7 (Windows sound: verified on one machine by the user, the loop-stop question open).
- `mods/theme-cli/README.html`: regenerate it so it matches the README.
- Root `README.md`: check the theme-cli entry for claims about Windows sound.
- Check each README above against the code, using the `ste-docs` skill per `CLAUDE.md`.

Acceptance:
- Every count, line number, command name and platform claim matches the code.
- The HTML and Markdown say the same thing.

Depends on: T1, T2, T3.

### T5. Verify on Windows `[ ]` (user)

Why the agent cannot do this: the sound is heard only on a Windows machine with speakers.

The user checks, on Windows 11 with the mod installed from this branch:
1. `/theme-sound-test` plays a tone.
2. The `mario` theme plays `start` at turn start, the `working` loop during the turn, and `success` or `error` at the end. Each cue is heard once.
3. The `working` loop stops at the end of the turn. This is the open risk above.
4. `/theme-dump` shows no `sound ...` error lines.

Acceptance: the user reports each step. Record the result here.

Depends on: T1 to T4.
