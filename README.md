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

## Concepts

- **Part**: a single skill, agent, hook, or library doc.
- **Behavior**: a named bundle of parts, defined by a manifest in `behaviors/`.
- **Library**: the long-lived context that behaviors draw on and that grows with use.
- **Deploy**: put a behavior into a target (user-level `~/.claude/` or a project's `.claude/`). Mechanism not yet decided.

## Open questions

- Deploy target and mechanism (copy, symlink, or plugin/marketplace packaging)
- Manifest format for behaviors
- How library content gets promoted from usage (e.g. memory files) and reviewed
