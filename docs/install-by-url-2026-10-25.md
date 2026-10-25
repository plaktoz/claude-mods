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

- `ste-docs` skill. It was not available in the session that made these edits (`Unknown skill`), so the edits follow the existing README style and were not checked with the skill. Update 2026-10-25: the skill is now installed in `~/.claude/skills/ste-docs`. The old link there was dangling (its target `orca/workspaces/claude-mods/feat-review` no longer exists), so `bash scripts/install-skills.sh --force ste-docs` replaced it. The link now points to `skills/ste-docs` in this repository. A session must start after the install to load the skill. The README edits were not re-checked with it.
- `scripts/install-skills.sh` and a dangling link. `install-skills.sh ste-docs` skipped the skill as "already exists", and `--list` printed `missing`. The script does not tell the user that the existing link is dangling. Not fixed here. Open for a later change.
- Install step (`claude plugin install`) for mods other than `brain-dump`. Not run; the docs say so where they already do.
- Rendering of HTML files in a browser. Not run.
