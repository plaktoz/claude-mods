# claude-mods

A centralized framework for customizing, structuring, and deploying tailored behaviors and evolving context libraries for Anthropic's Claude.

> Status: early scaffold. Structure is expected to change as we learn what works.

## Layout

| Path | Purpose |
|------|---------|
| `behaviors/` | Named, composable bundles that combine parts below into one deployable unit |
| `library/` | Context documents, snippets, and reference material that evolve over time |
| `skills/` | Reusable skills (`<name>/SKILL.md`) |
| `agents/` | Subagent definitions |
| `hooks/` | Hook scripts and settings fragments |
| `mods/` | Claude Code plugins of function hooks (`<mod>/.claude-plugin/plugin.json` + `hooks/register.ts`); test with `claude plugin test mods/<mod>` |
| `scripts/` | Install, sync, and validate tooling |
| `scratch/` | Git-ignored. Source images and audio you supply yourself, never committed |

### theme-cli themes

`mods/theme-cli` draws a pixel-art strip above the prompt. It ships no art. Themes live in your own `~/.claude/theme-cli/`, outside every project, so one library serves all of them:

```
~/.claude/theme-cli/
  config.json                         {"theme": "<name>"}: the theme on show
  themes/<name>/theme.json            what the theme draws, and where its images are
  themes/<name>/<your images>         or point `sheets` at images anywhere (absolute or ~/ paths)
  themes/<name>/.cache/frames.json    scaled sprites, built for you
```

`theme.json` names `sheets` (image files, or folders of images), `frames` (a `box` of `[x, y, w, h]` on a sheet, or a `file` in a folder sheet, with an optional `key` colour to make clear), and a `cast` that gives frames their parts: `lead` run and jump, an optional `partner`, the `companion` (one per subagent, recoloured per slot with `recolor`, or listed as `frames`) and the `goal`. `height` sets sprite height in pixels; the strip is `(height + 2) / 2` terminal rows. Anything left out draws as a placeholder.

Scaling happens once. When the session starts, the mod stamps `theme.json`, its images and the height, and compares that with the stamp in `.cache/frames.json`. If they match it reads the cache; if not it runs `mods/theme-cli/scripts/build-theme.py` (Python 3 standard library, no Pillow for 8-bit PNGs) and caches the result. Drawing never scales anything.

| Command | Effect |
|---------|--------|
| `/theme-list` | List the themes; the one on show has `*` |
| `/theme-use <name>` | Switch now and keep it for later sessions (`default` is the built-in placeholders) |
| `/theme-new <name>` | Write a `theme.json` template to fill in |
| `/theme-build` | Rebuild the cache even if nothing changed |
| `/theme-hide`, `/theme-show` | Turn the strip off and on |
| `/theme-dump` | Write `theme-cli-log.txt` in the working directory, for debugging |

Images you use may be copyrighted. Keep them in your own folder, never in this repository.

## Install skills

The script `scripts/install-skills.sh` links each skill in `skills/` into `~/.claude/skills/`. A link means that a change in this repository shows in Claude Code at once. The script does not copy files.

From the repository root, run:

```bash
bash scripts/install-skills.sh
```

Then start a new Claude Code session. Type `/` and check that the skill name (for example `ste-docs`) is in the list.

| Command | Effect |
|---------|--------|
| `bash scripts/install-skills.sh` | Install every skill. |
| `bash scripts/install-skills.sh ste-docs` | Install only the skills that you name. |
| `bash scripts/install-skills.sh --list` | Show which skills are installed. Change nothing. |
| `bash scripts/install-skills.sh --force` | Replace an existing skill that has the same name. |
| `bash scripts/install-skills.sh --uninstall` | Remove the links that this script made. |

The script never replaces a skill that you did not install from this repository, unless you use `--force`. It never removes such a skill. To install into a different folder, set `CLAUDE_SKILLS_DIR`:

```bash
CLAUDE_SKILLS_DIR=/path/to/skills bash scripts/install-skills.sh
```

A skill is a folder in `skills/` that has a `SKILL.md` file.

## Concepts

- **Part**: a single skill, agent, hook, or library doc.
- **Behavior**: a named bundle of parts, defined by a manifest in `behaviors/`.
- **Library**: the long-lived context that behaviors draw on and that grows with use.
- **Deploy**: put a behavior into a target (user-level `~/.claude/` or a project's `.claude/`). Mechanism not yet decided.

## Open questions

- Deploy target and mechanism (copy, symlink, or plugin/marketplace packaging)
- Manifest format for behaviors
- How library content gets promoted from usage (e.g. memory files) and reviewed
