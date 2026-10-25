# Task list: install mods from the GitHub URL, 2026-10-25

Goal: document the install with the marketplace URL `https://github.com/plaktoz/claude-mods` in the root README and in each mod's README, in Markdown and HTML.

Decisions (confirmed by the user, 2026-10-25):
- Remote install commands use the full URL. The `plaktoz/claude-mods` shorthand is replaced.
- The local-path variant (`/path/to/claude-mods`) stays.
- The blob URL (`.../blob/main/.claude-plugin/marketplace.json`) is named as a wrong form.
- `mods/theme-desk` is not changed (KIV).
- No commits, because the user has not asked for them.

State key: `[ ]` open, `[x]` done, `[-]` not done (reason given).

## Tasks

- [x] **T1. Root `README.md`, section "Install mods".**
  Acceptance: the remote `marketplace add` command is the URL form. The in-session line uses the URL form and mentions `/reload-plugins`. The blob URL is named as a wrong form. The local-path variant is unchanged.
  Verified by: `grep -n "plaktoz/claude-mods" README.md` shows no remote command in the shorthand form.

- [x] **T2. `mods/brain-dump/README.md` and `README.html`, section 5.5.**
  Acceptance: the terminal commands and the in-session commands use the URL form. The blob-URL note is present. Commands match the verified run: `marketplace add` then `install brain-dump@claude-mods`.
  Verified by: grep of both files, and the HTML matches the Markdown.

- [x] **T3. `cache-warm`, `handoff`, `screen-share`, `switchboard`, `theme-cli`: Markdown, section 5.5 or the equivalent install section.**
  Acceptance: every remote `marketplace add` uses the URL form, including the "run it now" line in switchboard 5.4. The "not run" verification notes are unchanged, because no install was run for these mods.
  Verified by: grep of each file for the shorthand.

- [x] **T4. The same five mods plus brain-dump, HTML copies (`README.html`).**
  Acceptance: the HTML commands match the Markdown commands.
  Verified by: grep of the HTML files for the shorthand, and a visual diff of the changed lines against the Markdown.

- [x] **T5. Final check.**
  Acceptance: `grep -rn "marketplace add plaktoz/claude-mods" README.md mods/*/README.md mods/*/README.html` returns no matches. Every changed file is listed in the summary. `git status` shows only the intended files.
  Verified by: the commands above, run after all edits.

## Results

- T1: root `README.md` has the URL command, the blob-URL warning and the `/reload-plugins` step. The line about `plaktoz/claude-mods` as a source name is kept, because it is not a command.
- T2 to T4: `brain-dump`, `cache-warm`, `handoff`, `screen-share`, `switchboard` and `theme-cli` have the URL command, the in-session steps with `/reload-plugins`, and the blob-URL warning, in `README.md` and `README.html`. The `switchboard` step "run it now" in 5.4 is changed too.
- T5: `grep "marketplace add plaktoz"` over the root README and all mod READMEs returns no match. Each `.md` and its `.html` hold the same number of URL commands. All six `README.html` files have balanced tags (checked with a parser). `.claude-plugin/marketplace.json` is not changed, so the cited line numbers still hold.
- Not changed: `mods/theme-desk` (KIV, not in the marketplace).

## Not done

- [x] `ste-docs` skill installed at user scope, 2026-10-25. `~/.claude/skills/ste-docs` is a symlink to `skills/ste-docs` in this repository, and it resolves. `scripts/install-skills.sh --list` reports `installed`. The earlier link was dangling and was replaced with `--force`. A session must start after the install to load the skill.
- [x] `ste-docs` re-check, done 2026-10-25. The skill was loaded in a sub-agent and checked the root `README.md` and the six mod READMEs (install sections, banned-word scan, `.md` and `.html` command parity). Four fixes: sentences over 20 words in `README.md` (lines 122, 154) and in `mods/handoff/README.md` and `.html` (the sentence about file changes reloading the mod). The Windows settings paragraph in `mods/theme-cli/README.html` moved into step 3, to match the `.md`. Not checked: line-number cites outside the install sections. The validator's `<owner>/<repo>` line in `mods/theme-cli/README.md` and `.html` (section 5.5) is now described, not repeated, and points to the URL form in 5.5.
- [x] `scripts/install-skills.sh` dangling link, done 2026-10-25 in the working tree, not committed. A dangling link now reports `broken` in the install path (with the `--force` hint) and in `--list`. Verified on macOS against a scratch dir, with the before and after output recorded in the session. Verified on Linux (Fedora CoreOS VM in Podman, aarch64) against a scratch dir: the old script reported `missing` and then `skipped`; the fixed script reports `broken` in both places, `--force` replaces the link, and a valid link reports `installed`. Windows (Git Bash): not run, verified by reading only.
- [x] Install step (`claude plugin install`) for the five mods other than `brain-dump`, done 2026-10-25 in the user's real setup, as the user chose. `cache-warm`, `handoff`, `screen-share`, `switchboard` and `theme-cli` are installed at user scope and enabled. `cache-warm` has its 2 `userConfig` options set to the defaults (`ttl` 5m, `maxPings` 6), saved with `claude plugin configure --values-stdin`, 2026-10-25. Verified by reading back the configure output. Restart Claude Code to apply.
- [x] Rendering of the HTML files in a browser, done 2026-10-25 in headless Google Chrome at 400px and 1280px. Five of six passed. `mods/switchboard/README.html` overflowed sideways at 400px (scroll width 447) because two inline `code` paths did not wrap. Fixed with `overflow-wrap: anywhere` on `code`. Re-rendered: page width 400, no overflow, no console errors. Not checked: a visual review of the PNGs.
