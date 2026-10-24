# switchboard

A Claude Code mod. It gives you one panel for every plugin and mod you have installed, with an on/off switch for each.

## Install

Add the marketplace once, then install the mod. Run the second command in the project's folder to install it for that project:

```bash
claude plugin marketplace add plaktoz/claude-mods
claude plugin install switchboard@claude-mods --scope project
```

Use `--scope user` (the default) to install it for every project, or `--scope local` for this project and only you. In a session, type `/plugin install switchboard@claude-mods`.

To try it for one session without installing it, run `claude --plugin-dir /path/to/claude-mods/mods/switchboard`.

## Use

- Type `/mods`. A pane opens with one row per installed plugin: `[x]` is on, `[ ]` is off.
- Press a row to switch it. The mod runs `claude plugin enable` or `claude plugin disable` for that row's scope, then `/reload-plugins`, so the change applies to the running session.
- Install a new mod and it appears in the list within a few seconds. You do nothing.

## What it lists

Plugins at the user scope, and project or local plugins that belong to the folder you are in. It reads them with `claude plugin list --json`.

## Limits

- A mod that is only loaded from a `--plugin-dir` or a session mods folder is not installed, so it is not listed.
- If `/reload-plugins` cannot run from the mod, the row says so; run it yourself.
- Switching off the mod that you are using to switch (this one, when installed) closes the panel. Run `/mods` after you enable it again.
- The list is found by polling two files every 3 seconds; there is no event for an install.

## Files

- `hooks/register.tsx`: the hooks module. All logic is here.
- `hooks/register.test.tsx`: tests, run with `claude plugin test mods/switchboard`.
- `types/index.d.ts`: the state contract.
