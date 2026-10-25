# theme-desk

**Status: KIV (keep in view).** The user parked this mod on 2026-10-25. Do not fix, document or review it further unless the user asks.

## Decision

| Item | Value |
|------|-------|
| Status | KIV. Work is stopped. |
| Decided by | The user, on 2026-10-25. |
| Marketplace | Not listed in `.claude-plugin/marketplace.json`. Do not add it. |
| Surface | Desktop only. The pane and the strip use `Svg`. |
| Spec | `library/theme-mod-spec.md`, sections 6.4 and 6.5. |
| Full review | Removed from the working tree. In git at `ac06a9b`: `docs/mod-review-2026-10-24.md`, section "theme-desk". |

## Rules for reviews and agents

- A code review must read this file first. Report the known issues below as "KIV, known". Do not report them as new findings.
- Do not start a fix or a docs pass for this mod without the user's go-ahead.
- Do not write `README.html` or a full `ste-docs` README for this mod while it is KIV.
- If the user lifts KIV, change the status line above, and the matching row in the root `README.md`.

## Known issues

These issues are known and not fixed. Line numbers are for `hooks/register.tsx` on 2026-10-25.

- Typecheck: `COLOURS[i % COLOURS.length]` is `string | undefined` under `noUncheckedIndexedAccess`. `tsc` reports TS2345 at lines 247, 299 and 313.
- `reconcile` runs only on `session.end` (line 218). A missed `SubagentStop` leaves an agent shown as running.
- The `frame` atom (line 19) is never written. The sprite never changes pose.
- The `beat` atom (line 14) is written, but never read.
- Finished agents never leave the strip.
- The mod has no tests.
- `claude plugin validate` reports `LICENSE_MISSING` and a missing `author`.
- The spec items not built: elapsed-time timer, walk cycle, finale, audio, progress bar, `×N` counter, and `/desk` as a toggle.

## Commands

| Command | Effect |
|---------|--------|
| `/desk` | Open the Helper Desk pane. |
| `/desk-hide` | Hide the strip above the prompt. |
| `/desk-dump` | Write `theme-desk-log.txt` in the working directory. |
