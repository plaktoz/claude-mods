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
| `.claude-plugin/` | `marketplace.json`: lists the mods so `claude plugin install` can find them |
| `scripts/` | Install, sync, and validate tooling |
| `docs/` | Review reports and task lists for the repo |

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
| `/theme-mute`, `/theme-unmute` | Silence the theme sounds, and play them again |
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

### Install skills into one project

By default the script installs for you, into `~/.claude/skills/`. To install into one project instead, point `CLAUDE_SKILLS_DIR` at that project's `.claude/skills` folder. Use the full path to the script and to the project:

```bash
CLAUDE_SKILLS_DIR=/path/to/your-project/.claude/skills bash /path/to/claude-mods/scripts/install-skills.sh ste-docs
```

For example, to install `ste-docs` into a project at `~/Developer/my-app`:

```bash
CLAUDE_SKILLS_DIR=~/Developer/my-app/.claude/skills bash ~/Developer/claude-mods/scripts/install-skills.sh ste-docs
```

Add `--list` to the same command to check, or `--uninstall` to remove. Start a new Claude Code session in the project to see the skill.

The links point to your copy of this repository, so they work on your machine only. Do not commit them to the project. If the project is shared, add `.claude/skills/` to its `.gitignore`.

## Install mods

A mod is a Claude Code plugin in `mods/<name>/`. `.claude-plugin/marketplace.json` lists them, so you install a mod from this repository as from a marketplace. Add the marketplace once, with the URL of the repository:

```bash
claude plugin marketplace add https://github.com/plaktoz/claude-mods
```

Do not use the GitHub link to `.claude-plugin/marketplace.json`. The command treats a link as a git repository and fails with `repository ... not found`.

Then install a mod. The `--scope` option sets where it applies:

| Scope | Where the mod runs |
|-------|--------------------|
| `user` (default) | Every project, for you. |
| `project` | The current project, for everyone who opens it. Saved in `.claude/settings.json`. |
| `local` | The current project, for you only. Not shared. |

To install `switchboard` into a project, run this in the project's folder:

```bash
cd /path/to/your-project
claude plugin install switchboard@claude-mods --scope project
```

Inside a Claude Code session, the same steps are `/plugin marketplace add https://github.com/plaktoz/claude-mods` and `/plugin install switchboard@claude-mods`. Then run `/reload-plugins`, or start a new session.

To use your local copy (a branch that is not merged yet), add the marketplace from its path:

```bash
claude plugin marketplace add /path/to/claude-mods
```

### Install every mod with a script

The scripts `scripts/install-mods.sh` and `scripts/install-mods.ps1` do the marketplace steps for you. They point the `claude-mods` marketplace at your clone, then install every mod that `.claude-plugin/marketplace.json` lists. They make no symlinks, so they work on Windows without admin rights or Developer Mode. They need the `claude` command on your `PATH`.

Linux, macOS, or Git Bash on Windows:

```bash
bash scripts/install-mods.sh
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-mods.ps1
```

Then restart Claude Code.

| Bash | PowerShell | Effect |
|------|------------|--------|
| `install-mods.sh` | `install-mods.ps1` | Install every mod. A mod that is already installed is updated. |
| `install-mods.sh screen-share` | `install-mods.ps1 screen-share` | Install only the mods that you name. |
| `--scope project` | `-Scope project` | Set the scope (`user` is the default). Run it from the project's folder. |
| `--list` | `-List` | Show which mods are installed. Change nothing. |
| `--uninstall` | `-Uninstall` | Remove the mods. |

The installed mods load from your clone, so `git pull` brings in changes. Restart Claude Code to load them. If you added `claude-mods` from `plaktoz/claude-mods` before, the script points it at your clone. The script keeps the mods that you installed. To add a mod, put it in `mods/` and add it to `.claude-plugin/marketplace.json`.

To try one mod for one session without installing it:

```bash
claude --plugin-dir /path/to/claude-mods/mods/switchboard
```

| Mod | What it does |
|-----|--------------|
| `switchboard` | `/mods` opens a panel of every installed mod, with an on/off switch for each. See `mods/switchboard/README.md`. |
| `brain-dump` | Turns long, messy prompts into a structured task after a few clarifying questions. See `mods/brain-dump/README.md`. |
| `cache-warm` | Keeps the prompt cache warm with a countdown band and small pings before it lapses. See `mods/cache-warm/README.md`. |
| `handoff` | Packages the session into a prompt for a fresh chat. It offers this at 250,000 tokens, or when the cache has likely gone cold. See `mods/handoff/README.md`. |
| `screen-share` | Draws names, emails, phone numbers and amounts as shaded bars during a screen share. See `mods/screen-share/README.md`. |
| `theme-cli` | Pixel-art characters run along a strip above the prompt while Claude works. Terminal only. See `mods/theme-cli/README.md`. |

`mods/theme-desk` is KIV (keep in view). It is not in the marketplace, and work on it is stopped. See `mods/theme-desk/README.md`.

## Concepts

- **Part**: a single skill, agent, hook, or library doc.
- **Behavior**: a named bundle of parts, defined by a manifest in `behaviors/`.
- **Library**: the long-lived context that behaviors draw on and that grows with use.
- **Deploy**: put a behavior into a target (user-level `~/.claude/` or a project's `.claude/`). Mechanism not yet decided.

## Open questions

- Deploy target and mechanism (copy, symlink, or plugin/marketplace packaging)
- Manifest format for behaviors
- How library content gets promoted from usage (e.g. memory files) and reviewed
