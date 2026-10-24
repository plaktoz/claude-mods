# screen-share

A Claude Code mod. It hides names, emails, phone numbers and money amounts on screen while you share or record your session. Claude still reads the real data.

## Use

- `/screen-share on`, `/screen-share off`, or `/screen-share` to toggle.
- Or ask Claude to switch the mode, for example "I'm about to demo this on a call".

While it is on, a band sits above the prompt: **Screen-share mode: emails, phones, amounts and names hidden on screen**, with a **Turn off** button.

## What it hides

- Emails, phone numbers and money amounts, found by pattern.
- Names, learned from the conversation by a short Haiku call when the mode turns on and after each new prompt, tool result and reply. Each full name and each of its parts is hidden.

Hidden text draws as `░` bars, one per character. Only the drawing changes; the stored conversation is untouched.

## Limits

- A name Claude writes before the mod has learned it can show briefly while the reply streams.
- Bare numbers with no currency symbol or code (a column of plain figures) are not hidden.
- The prompt box you are typing in, the status line and other mods' panes are not masked.
- The mode stays on across sessions until turned off.
- Each name scan is a short Haiku call billed to the session.

## Files

- `hooks/register.tsx`: the hooks module. All logic is here.
- `hooks/register.test.tsx`: tests, run with `claude plugin test mods/screen-share`.
- `types/index.d.ts`: the state contract.
