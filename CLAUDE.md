# CLAUDE.md

This repo is a framework for defining and deploying Claude behaviors and evolving context libraries. See `README.md` for the layout and concepts.

## Conventions

- Keep each part (skill, agent, hook, library doc) self-contained and single-purpose.
- Behaviors reference parts by path; they don't copy them.
- Library docs are plain markdown, one topic per file, with a short description at the top.
- The structure is provisional. Prefer small changes and update `README.md` when the layout changes.
- Don't commit unless the user has asked for commits on this work. Once asked, commit after each task, as "Task management" says.
- Do not read into agent-ignore folder

## Task management

How a piece of work goes from request to done. Follow the steps in order.

### 1. Agree the requirements

- Clarify the requirements first, and wait for the user's go-ahead before you start implementing. A request to plan, review or answer a question is not a go-ahead to change files.
- State the requirements concisely and in plain words: no filler, no padding, no restating the request.
- Give enough detail that the user can see what they are deciding on: the options, what each one changes, and your recommendation.
- Ask only about what the user must decide. Pick the obvious default for the rest, and say which default you picked.

### 2. Write the task list

- Give each task its acceptance criteria: the observable result that means the task is done.
- Keep the task list in a file in the repo (for example in `docs/`), not only in the conversation.

### 3. Do the work

- If a task or subtask is independent, send it to a subagent to complete the work. Give each independent task or subtask its own subagent, and start them in one message so they run in parallel.
- Do not send a task or subtask to a subagent when it is small or when it depends on another task's output.
- The agent doing a task tests and verifies it against its acceptance criteria.
- Hand verification to the user only when the agent cannot do it, such as a Windows-only check on a macOS machine. Say why in the task list.

### 4. Keep the task state

The session can stop at any time: tokens run out, or an endpoint fails. Another person or computer must be able to continue from the repo alone.

- Record each task's state next to the task: `[ ]` open, `[x]` done, `[-]` not done, with the reason. Add the result and how it was verified.
- Once the user has asked for commits, commit after each task, or each group of tasks that belong together. Use several small commits, not one at the end.
- Push when the user has approved pushing for this work, so the state is on the remote too.
- Before a long or risky step, write what comes next in the task list, so a retry can start there.

### 5. Use the current decisions

- Decisions change during a session. Act on the latest decision, not on the state when the session started.
- Before you act on a stored fact (a PR state, a branch, a decision in a file), check it again. For example, check that a PR is still open before you push to it.
- Record a decision where the work it governs lives. For example, a decision about a mod goes in that mod's README, so a later review sees it.

## Documentation

How documents are written, and how they are kept true to the code.

### Write

- Use the `ste-docs` skill with its technical profile to write or rewrite any module README (`README.md` and `README.html`), and any other technical document about a mod, skill, agent or hook.
- Use `mods/cache-warm/README.md` and `mods/handoff/README.md` as the structure reference, as the skill says.

### Keep in sync

- After every change, check the README of the module you changed, then each README above it up to the root `README.md`, and confirm they still match the code.
- Look for stale claims: commands, install steps, file paths, line numbers, test counts, feature lists, platform support, and marketplace status.
- Fix any README that is out of sync in the same change. If you cannot fix it, say which one and why.

## Cross-platform

- Review all generated code for whether it runs on both Windows and Linux (macOS too, where the repo supports it) before calling it done.
- Check for hardcoded `/` path joins, `HOME` without a `USERPROFILE` fallback, POSIX-only shell commands, `python3`-only interpreter calls, missing `encoding="utf-8"`, and CRLF handling.
- If you cannot run it on an OS, say so and mark that part "verified by reading", not "verified".
