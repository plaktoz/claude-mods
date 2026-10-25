# CLAUDE.md

This repo is a framework for defining and deploying Claude behaviors and evolving context libraries. See `README.md` for the layout and concepts.

## Conventions

- Keep each part (skill, agent, hook, library doc) self-contained and single-purpose.
- Behaviors reference parts by path; they don't copy them.
- Library docs are plain markdown, one topic per file, with a short description at the top.
- The structure is provisional. Prefer small changes and update `README.md` when the layout changes.
- Don't commit unless asked.
- Do not read into agent-ignore folder

## Requirements

- Always clarify the requirements first, and wait for the user's go-ahead before you start implementing. A request to plan, review or answer a question is not a go-ahead to change files.
- State the requirements concisely and in plain words: no filler, no padding, no restating the request.
- Give enough detail that the user can see what they are deciding on: the options, what each one changes, and your recommendation.
- Ask only about what the user must decide. Pick the obvious default for the rest, and say which default you picked.

## Documentation

- Use the `ste-docs` skill with its technical profile to write or rewrite any module README (`README.md` and `README.html`), and any other technical document about a mod, skill, agent or hook.
- Use `mods/cache-warm/README.md` and `mods/handoff/README.md` as the structure reference, as the skill says.

## Documentation sync

- After every change, check the README of the module you changed, then each README above it up to the root `README.md`, and confirm they still match the code.
- Look for stale claims: commands, install steps, file paths, line numbers, test counts, feature lists, platform support, and marketplace status.
- Fix any README that is out of sync in the same change. If you cannot fix it, say which one and why.

## Cross-platform

- Review all generated code for whether it runs on both Windows and Linux (macOS too, where the repo supports it) before calling it done.
- Check for hardcoded `/` path joins, `HOME` without a `USERPROFILE` fallback, POSIX-only shell commands, `python3`-only interpreter calls, missing `encoding="utf-8"`, and CRLF handling.
- If you cannot run it on an OS, say so and mark that part "verified by reading", not "verified".

## Task lists

- Every task list must give each task its acceptance criteria: the observable result that means the task is done.
- The agent doing a task is responsible for testing and verifying it against those criteria, and for recording the result next to the task.
- Hand verification to the user only when it is not possible for the agent, such as a Windows-only check on a macOS machine. Say why in the task list.

## Subagents

- If a task or subtask is independent, send it to a subagent to complete the work. Give each independent task or subtask its own subagent, and start them in one message so they run in parallel.
- Do not send a task or subtask to a subagent when it is small or when it depends on another task's output.
