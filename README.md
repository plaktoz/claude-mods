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

A mod is a Claude Code plugin in `mods/<name>/`. `.claude-plugin/marketplace.json` lists them, so you install a mod from this repository as from a marketplace. Add the marketplace once:

```bash
claude plugin marketplace add plaktoz/claude-mods
```

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

Inside a Claude Code session, the same steps are `/plugin marketplace add plaktoz/claude-mods` and `/plugin install switchboard@claude-mods`.

To use your local copy of this repository (a branch that is not merged yet), add the marketplace from its path:

```bash
claude plugin marketplace add /path/to/claude-mods
```

To try one mod for one session without installing it:

```bash
claude --plugin-dir /path/to/claude-mods/mods/switchboard
```

| Mod | What it does |
|-----|--------------|
| `switchboard` | `/mods` opens a panel of every installed mod, with an on/off switch for each. See `mods/switchboard/README.md`. |

## Concepts

- **Part**: a single skill, agent, hook, or library doc.
- **Behavior**: a named bundle of parts, defined by a manifest in `behaviors/`.
- **Library**: the long-lived context that behaviors draw on and that grows with use.
- **Deploy**: put a behavior into a target (user-level `~/.claude/` or a project's `.claude/`). Mechanism not yet decided.

## Open questions

- Deploy target and mechanism (copy, symlink, or plugin/marketplace packaging)
- Manifest format for behaviors
- How library content gets promoted from usage (e.g. memory files) and reviewed
