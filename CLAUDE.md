# CLAUDE.md

This repo is a framework for defining and deploying Claude behaviors and evolving context libraries. See `README.md` for the layout and concepts.

## Conventions

- Keep each part (skill, agent, hook, library doc) self-contained and single-purpose.
- Behaviors reference parts by path; they don't copy them.
- Library docs are plain markdown, one topic per file, with a short description at the top.
- The structure is provisional. Prefer small changes and update `README.md` when the layout changes.
- Don't commit unless asked.
- Do not read into agent-ignore folder
