Handoff prompt for starting `theme-cli`, the terminal build of the theme mod. Paste the "Prompt" section into a fresh chat run in the terminal CLI.

# theme-cli handoff

## State

- The theme idea is specced in `library/theme-mod-spec.md` (Mario first, Zelda second, themes as data, music, a Helper Desk view).
- The desktop build is parked as **`mods/theme-desk`** (KIV). It validates but has never been seen drawing. Its only run was in the terminal, where `Svg` doesn't exist, so the strip and pane stayed empty.
- `theme-cli` does not exist yet. It is a new mod for the terminal surface: `mods/theme-cli/`.

## What carries over from theme-desk (read `mods/theme-desk/hooks/register.tsx`)

- Agent tracking from `classic.SubagentStart` / `classic.SubagentStop`. Unknown stop ids are ignored.
- Per-agent `tool.call` activity (last two tools).
- Per-request tokens from the `turn.step` stop chunk. The usage is the whole context, not a delta, so show the latest value.
- The main-turn rule: a subagent's `turn.complete` carries `agentId`, so only count `!e.agentId`. The "complete" beat waits for the last `SubagentStop`.
- `session.measure` for cost (`cost.usd`). Never confirmed to fire.
- Always use `await $.clock.now()` and never `Date.now()`. Module variables are lost on hot reload, so keep state in atoms.
- A `ui.render` hook must be pure: no `update` while drawing.

## What changes for the terminal

- The terminal element table has **no `Svg`**. It has `Box`, `Text`, `Button`, `Input`, `Select`, `Link`, `Code`, `Markdown`, `Client`, **`Raster`** and **`Image`**.
- `Raster` is a fixed box of cells (`key`, `columns` 1–512, rows 1–256, packed `cells`), repainted in place with `$.ui.blit`. Its palette paints 1024 colour pairs at once. This is the best fit for pixel sprites: half-block glyphs give two pixels per cell.
- `Image` needs a terminal that supports kitty or iTerm2 graphics (kitty, Ghostty, iTerm2, WezTerm, foot; tmux passes none through). Treat it as optional.
- Safe fallback for any terminal: plain `Text`/`Box` with coloured block characters, or just text.
- Read the types before building: grep `RasterProps`, `RasterBlitArgs` and `Image` in the bundled `claude-code.d.ts` (the plugin-authoring skill writes it when it loads).
- A pane opened from a command is always placed. One opened with no person behind it is placed only from 144 columns, so open the desk from a command (`/desk`).

## Open for theme-cli

1. Where to draw the sprite strip: `AbovePrompt` band (decided for desktop) or the `PromptHint` line. `PromptHint` only takes a string tail in the terminal.
2. Does `Raster` animate smoothly with `$.ui.blit` on a `$.clock.every` timer, and what is the cost per frame?
3. Audio: `$.audio.play({ asset }, { shouldLoop, gain, signal })`. Aborting the loop works. Whether it is audible, and whether `gain` does anything, is unconfirmed.
4. Theme packs and config (`userConfig`): the manifest schema is unverified. Spec Q7.
5. Assets: real Nintendo sprites and music are for personal use only, git-ignored and never redistributed. Start with tiny original placeholder sprites.

## Prompt

> Start `theme-cli`: a Claude Code mod for the terminal surface, in `mods/theme-cli/` of `/Users/tianhonglee/Developer/claude-mods`.
>
> Read first: `library/theme-cli-handoff.md`, `library/theme-mod-spec.md`, and `mods/theme-desk/hooks/register.tsx` (the engine to reuse).
>
> Goal: Mario Bros. sprites run across a strip above the prompt while Claude works. One extra sprite per running subagent (a Yoshi), removed when that agent stops. When the task completes, the end-stage beat plays. Use `Raster` instead of `Svg`.
>
> Steps:
> 1. Load the plugin-authoring skill. Scaffold `mods/theme-cli/` with `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `types/index.d.ts`, `tsconfig.json`.
> 2. Copy the agent and turn tracking from theme-desk. Drop its `Svg` code.
> 3. Draw a placeholder 2-frame sprite with `Raster` in the `AbovePrompt` band. Animate it with `$.clock.every` and `$.ui.blit`. Check it by writing the draw result to a log file, since I can't always see command output.
> 4. Add a `/theme-dump` command that writes a log, as theme-desk's `/desk-dump` does.
> 5. Run `claude plugin validate mods/theme-cli` and add a `register.test.tsx`.
>
> Rules: don't commit unless I ask. Update `README.md` if the layout changes. Keep real Nintendo assets out of git.
