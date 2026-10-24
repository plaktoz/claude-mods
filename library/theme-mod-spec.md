Brain-dump spec for `theme`, a claude-mods mod that turns Claude Code's activity into a themed sprite animation with music, in a strip under the prompt. Mario is the first theme and Zelda the second.

# Theme mod: spec (brain dump)

- **Status:** the desktop build is parked as `mods/theme-desk` (KIV, never seen drawing). The terminal build is next, as `theme-cli`; see `library/theme-cli-handoff.md`.
- **Date:** 2026-10-24
- **API basis:** the plugin-authoring reference and `types/claude-code.d.ts` bundled with Claude Code 2.1.310, plus facts confirmed in the previous session. The reference says the API "is early access and moves between releases". When this spec and the declaration file disagree, the declaration file wins.

Confidence labels used below:

- **Confirmed:** established in a previous session.
- **Declared:** appears in the 2.1.310 type declarations or reference, but hasn't been tried in a live session.
- **Open:** unknown. Must be researched before building. See §8.

---

## 1. Purpose

- Show what Claude is doing at a glance as a small animated scene, with sound, instead of only the spinner text.
- Keep the theme layer swappable. The mod has two parts:
  - a fixed **engine** that turns Claude events into a few abstract *beats*;
  - **themes** that are data only (a manifest plus assets) and say how each beat looks and sounds.
- Switching themes is a config change. Writing a theme means writing one manifest and dropping in assets. It never means writing code.
- Personal use. The real Nintendo sprites and music are used locally and never redistributed (§7).

- **Primary view (added after the reference screenshots):** a **Helper Desk pane** with a stat row and one card per subagent, Running and Finished groups, and a themed sprite on each card (§6.5). The under-prompt strip (§6.4) becomes the compact view for when the pane is closed or the surface can't dock it.

Non-goals for v1:

- rewriting transcript rows (whether `ui.render` can do that is unknown, and it isn't needed);
- per-agent cost visuals (there is no per-agent cost field);
- anything on mobile or remote surfaces.

---

## 2. Concepts

| Term | Meaning |
|------|---------|
| **Beat** | An abstract moment the engine detects: `working`, `agentJoin`, `agentLeave`, `complete`. Optional: `idle`, `aborted`, `error`. Themes only ever see beats, never raw Claude events. |
| **Lead** | The theme's main actor or actors. They are on screen while the main loop works. Mario's lead is the Mario Bros. |
| **Companion** | An actor tied to exactly one running subagent, keyed by `agentId`. Mario's companion is Yoshi. |
| **Finale** | The scene and sound played once on `complete`. Mario's finale is the flagpole grab plus the stage-clear jingle. |
| **Strip** | The fixed-height cell region under the prompt where everything is drawn. |
| **Theme pack** | A folder: `theme.json` plus `sprites/` plus `sounds/`. |

---

## 3. Event → beat mapping (engine side, theme-independent)

| Beat | Primary signal (to verify) | Backup / reconcile | Notes |
|------|----------------------------|--------------------|-------|
| `working` start | `turn.start` with no `agentId`, which means the main loop (Declared) | `isWorking` prop on the `PromptHint` / `AbovePrompt` render sites (Declared) | Start the lead animation and the looping theme song. |
| `working` sub-state (optional) | `Spinner` render props `mode`: `thinking`, `requesting`, `tool-use`, `responding` (Declared) | none | Lets a theme vary its pose, e.g. idle while thinking, run while using tools. Nice-to-have only. |
| `agentJoin` | `classic.SubagentStart` → `agent_id` (Declared) | `turn.start` carrying `agentId` (Declared); `$.agent.list()` polling (Confirmed exists) | The engine adds a companion keyed by `agentId` **only if none exists**, so each agent gets exactly one. |
| Agent activity (optional) | `turn.step` carries `agentId` (Confirmed) | none | Could bob or animate that agent's Yoshi while it streams. Optional. |
| `agentLeave` | `classic.SubagentStop` → `agent_id` (Declared) | `turn.complete` with `agentId` (Declared); `$.agent.list()` status reaching `completed`, `failed` or `killed` (Declared) | The engine removes exactly that agent's companion. |
| `complete` | `turn.complete` with no `agentId` and `reason: 'answer'` (Declared) | `classic.Stop`; `classic.TaskCompleted` exists in the types but may only mean task-list items (Open) | Stop the loop and play the finale once. |
| `aborted` | `turn.complete` main loop, `isAborted` / `reason: 'aborted'` | none | Default: stop the music and clear the strip quietly. A theme may supply a clip. |
| `error` | `turn.complete` main loop, `reason: 'error'` or `'refusal'` | none | Same default as `aborted`. |
| `idle` | after the finale ends, or on `session.start` | none | The strip is empty or shows a static idle frame. The theme decides. |

### Companion lifecycle: exactly one per agent

The engine keeps a single map, `agentId → companion`, held in `$.state` rather than a module variable so it survives a hot reload.

1. **Join.** On any join signal for an `agentId` that isn't in the map, add one companion. Duplicate signals for the same id are no-ops. This covers SubagentStart and turn.start both firing, and teammates whose loops run many turns.
2. **Leave.** On any leave signal, remove that id. If the id isn't in the map, do nothing.
3. **Reconcile.** On a slow tick (about 2 s) and on `session.start`, compare the map with `$.agent.list()`:
   - add running agents that are missing;
   - drop agents whose status is `completed`, `failed` or `killed`.

   This is the safety net for missed events and reloads.
4. **Idle teammates.** A teammate with status `idle` or `waiting` keeps its companion, drawn standing still rather than running. This is open to change (§8, Q9).
5. **Overflow.** Companion slots are capped by the strip's width. Agents past the cap are shown as a `×N` counter glyph, not dropped from the map.
6. **Completion with agents still running.** `complete` plays the finale for the lead. Companions of still-running background agents stay on the strip.

---

## 4. Mario theme (first example)

| Beat | Visual | Sound |
|------|--------|-------|
| `working` | Mario and Luigi run left to right across the strip, wrapping or looping, with a scrolling ground tile and occasional blocks or pipes as background. | The Super Mario Bros. overworld theme, looped. |
| `agentJoin` | One Yoshi enters from the left and runs behind the Bros. Each new agent adds one more Yoshi in the next slot. | Optional short clip, e.g. Yoshi's call or the 1-up sound. |
| `agentLeave` | That agent's Yoshi runs off or poofs, and the others close ranks. | Optional, e.g. a coin sound. |
| `complete` | The run stops. Mario jumps and grabs the flagpole, the flag slides down, and he walks toward the castle. | The music loop stops, then the stage-clear jingle plays once. |
| `aborted` / `error` | Strip clears. | None by default (the death jingle is an option). |
| `idle` | Empty, or Mario standing still. | None. |

Optional spinner words: "Running…", "Jumping…", "Stomping…". These could replace the `Spinner` `word` while the theme is active. Rewriting `word` is Declared.

---

## 5. Zelda theme (second example; this mapping is a proposal)

The user didn't specify a Zelda mapping. This is a starting point.

| Beat | Visual | Sound |
|------|--------|-------|
| `working` | Link walks or runs across a Hyrule field tile strip. | Overworld theme, looped. |
| `agentJoin` | One fairy (Navi-style) joins and orbits or trails Link, one fairy per agent. | Optional "Hey! Listen!" or a fairy chime. |
| `agentLeave` | That fairy flies off upward. | Optional sparkle. |
| `complete` | Link holds the item overhead (the item-get pose). | Loop stops, then the item-get fanfare (or the secret-found chime). |
| `aborted` / `error` | Strip clears. | Optional low-heart beep. |

Optional spinner words: "Exploring…", "Dungeoneering…".

The Zelda theme exercises exactly the same beats and fields as Mario. If it can't be expressed with the same manifest shape, the manifest shape is wrong.

---

## 6. Theme definition, config and switching

### 6.1 Selecting a theme (config)

Use the manifest's `userConfig`, which is Declared in the reference:

- `theme`: a `string` field with `options: ["mario", "zelda", "off"]` and default `"mario"`. A field that lists options shows up as a picker row in the config menu.
- `muted`: boolean, default `false`.
- `volume`: number from 0 to 4. This maps to the `gain` option of `$.audio.play`.
- `stripRows`: number, default 2 (see §6.4).

Where the values come from:

- For a dev or `--plugin-dir` load, values come from `pluginConfigs.<plugin>` in settings.
- For an installed plugin, the person sets them at install or in the config menu.
- Changing a value reloads the module with the new `options`, so a theme switch is just a reload. No restart is needed.

**Theme discovery:** the `options` list has to be fixed in `plugin.json`. Adding a theme therefore means two steps: drop the folder into `themes/`, then add its name to that list. Whether `options` can be built from the folder contents at load time is Open (§8, Q7).

**Turning the mod on and off:** use `claude plugin enable` / `claude plugin disable` on the CLI (Confirmed; no in-API toggle was found). `theme: "off"` is the in-session way to go quiet.

### 6.2 Theme pack layout

```
themes/
  mario/
    theme.json
    sprites/      # source PNG sheets + generated cell frames (see 7.2)
    sounds/       # theme.mp3, stage-clear.mp3, yoshi.wav, ...
  zelda/
    theme.json
    sprites/
    sounds/
```

Theme packs live **inside the plugin folder**. `$.audio.play({ asset })` only accepts paths relative to the plugin directory, with no `..` and no leading slash (Declared).

### 6.3 `theme.json` shape (illustrative data, not code)

```jsonc
{
  "name": "mario",
  "displayName": "Super Mario Bros.",
  "strip": { "rows": 2, "background": "ground-tile", "scroll": true },

  "actors": {
    "lead":      { "frames": ["mario-run-1", "mario-run-2", "mario-run-3"], "fps": 10, "followers": ["luigi"] },
    "luigi":     { "frames": ["luigi-run-1", "luigi-run-2", "luigi-run-3"], "fps": 10 },
    "companion": {
      "frames": ["yoshi-run-1", "yoshi-run-2"], "fps": 8, "idleFrame": "yoshi-stand", "maxSlots": 6,
      "doneFrame": "yoshi-sleep",
      // One entry per agent, in join order; the card border and bar take "color".
      "variants": [
        { "name": "green",  "color": "#2e9d4f" }, { "name": "red",  "color": "#d9402f" },
        { "name": "blue",   "color": "#2f6bd9" }, { "name": "yellow", "color": "#e0a800" },
        { "name": "pink",   "color": "#d93f8a" }, { "name": "orange", "color": "#e0701f" }
      ]
    }
  },

  "beats": {
    "working":    { "scene": "run",      "sound": { "asset": "sounds/overworld.mp3", "loop": true } },
    "agentJoin":  { "enter": "from-left", "sound": { "asset": "sounds/yoshi.wav" } },
    "agentLeave": { "exit":  "run-off" },
    "complete":   { "scene": "flagpole", "sound": { "asset": "sounds/stage-clear.mp3" } },
    "aborted":    { "scene": "clear" },
    "idle":       { "scene": "empty" }
  },

  "scenes": {
    "flagpole": { "frames": ["flag-1", "flag-2", "flag-3", "flag-4", "castle-walk-1"], "fps": 6, "once": true }
  },

  "spinnerWords": ["Running", "Jumping", "Stomping"]
}
```

Rules that keep the format light:

- A theme can only reference beats, actors, scenes, frames and sounds. No theme ever contains logic.
- Every beat except `working` and `complete` is optional. A missing beat falls back to a default: silent, with the generic enter and exit motion.
- The engine owns motion: positions, slots, scrolling, enter and exit. Themes only name a motion preset (`from-left`, `run-off`, `poof`).
- Minimum viable theme: one lead frame set, one working loop sound and one complete sound.

### 6.4 Strip placement and rendering (compact view)

The strip is the compact view: the requested placement is a status-line strip **under the prompt**, and it is where the lead (Mario Bros.) runs. The per-agent detail lives in the Helper Desk pane (§6.5). These are the candidate strip sites, in order of preference:

1. **`PromptHint` render site.** Declared as "the dim hint line under the prompt", and a hook can draw its own tree there. Unknowns on desktop: whether an `Svg` is allowed in that tree, and how tall it may be (§8, Q1, Q2a).
2. **`$.ui.status(text)`.** Declared as "this plugin's status line under the prompt". It is text only, so frames would be Unicode or emoji approximations rather than real sprites. Fallback if option 1 fails.
3. **`AbovePrompt` band.** Declared to take trees (an `Svg` on desktop), but it sits *above* the prompt. Use it only if the person accepts that placement.
4. **The settings `statusLine` command** (classic, outside the plugin). Probably not animatable at a useful frame rate. Last resort.

Rendering approach on **desktop** (Q2 answered: desktop):

- The desktop element table has `Svg`, `Box`, `Text`, `Button`, `Input`, `Select`, `Link`, `Code`, `Markdown` and `Client`. It has **no `Raster` and no `Image`**. Those were the terminal-only options, so they are out.
- The strip's sprite is an `Svg` of `<rect>` pixels, with `isInteractive: true` so SMIL animation runs (Q11). The frame is redrawn when the Svg changes, from a `$.state` value that a slow timer advances.
- Whether `PromptHint` accepts an `Svg` on desktop is **not yet verified**. The type notes say it is raised on desktop, but do not list its element table. If it doesn't, the fallback is `$.ui.status` (text only: a one-line Unicode frame such as `🍄 ▶ ▶ ▶`).
- Animation timers start from `session.start` and are cancelled at idle. A hot reload drops timers, so `register` re-arms them from `$.state`.
- The terminal options (`Raster` with half-blocks, or `Image` via kitty or iTerm2) are kept only as a note in case a terminal build is ever wanted. They are not part of v1.

### 6.5 Helper Desk pane (from the reference screenshots)

**What the screenshots show.** A pane titled "Helper Desk" (a tab beside "Mods" and "In this chat"), opening with `N subagents in this chat` and a `Hide` button. Under it:

- Three stat tiles: **Total chat cost**, **Subagent tokens**, **Time**.
- A green `Running · N` group header and an amber `Finished · N` group header, both collapsible.
- One card per agent, newest running agents first. A card has:
  - a pixel sprite, coloured per agent, on the left;
  - the name (the agent's task description);
  - a `type · model` line;
  - `tokens · elapsed` on the right, plus a green dot while running or a ✓ when finished;
  - a step line, `Step 4 · Writing script.md`, or `Done · 6 steps` when finished;
  - two activity lines, e.g. `Reading pre-outline.md`;
  - a progress bar in the agent's colour.
- A running card has a coloured border. A finished card has a grey one, and its sprite stays on the card.

**How a theme maps onto it.** The sprite on each card is the theme's **companion** (Mario: Yoshi), recoloured per agent from the theme's palette. Mario's natural palette is green, red, blue, yellow, pink and so on, which matches the screenshots' per-agent colours. The card's border and progress bar take the same colour. Theme-supplied card chrome is limited to the palette, the sprite and an optional spinner glyph.

**Card ↔ strip.** The pane and the strip show the same agent map (§3) in two ways:

- A running agent has a card in *Running*. Its Yoshi runs on the strip.
- When the agent stops, its card moves to *Finished* with a ✓, and **its Yoshi is removed from the strip**. That keeps the Mario rule: one Yoshi per live agent.
- The sprite on a finished card is static (standing or sleeping).

**Where each field comes from:**

| Card element | Source | Status |
|--------------|--------|--------|
| Name | `AgentInfo.description` from `$.agent.list()` | Declared |
| Type | `AgentInfo.type` | Declared |
| Model | `usage.model` on that agent's `turn.complete` | Declared; may be empty until the agent's first turn ends (Q12) |
| Running / finished, dot / ✓ | `AgentInfo.status` | Declared |
| Elapsed time | `$.clock.now()` minus the time the mod first saw the agent; frozen at stop | Declared |
| `Step N` | count of `turn.step` events carrying that `agentId` | Confirmed (`turn.step` carries `agentId`) |
| Step text and the two activity lines | the agent's latest `tool.call`s (`agentId` is on the call): tool name plus file path or target, mapped to a verb phrase (`Write` → "Writing x.md", `Read` → "Reading x"). Last call is the step text, last two are the lines | Declared |
| Tokens (finished) | sum of `turn.complete.usage` for that `agentId` | Declared |
| Tokens (live, as in the running cards) | `turn.step` stop chunk `usage`, summed per `agentId` at the end of each model request; flat during a request (Q12) | Declared |
| Progress bar | no total is known in advance, so an indeterminate bar while running and a full bar when done (Q13, answered) | Decided |
| Per-agent cost | **No such field** (Confirmed). Show tokens only; do not invent a dollar figure | n/a |
| Tile: Total chat cost | `$.session.usage()` / `session.measure` `cost.usd` (whole chat, main thread included, which matches the tile's wording) | Declared |
| Tile: Subagent tokens | sum of the per-agent tokens above | derived |
| Tile: Time | the current turn's elapsed time (Q14, answered) | Decided |

**How it is built:**

- Open with `$.ui.open({ id: 'helper-desk', title: 'Helper Desk' })` and draw it from a `ui.render` hook on `{ component: 'Pane' }` (Declared). A command (e.g. `/desk`) toggles it. `Hide` is a Button that calls `$.ui.close`.
- Desktop only for v1 (Q2). The sprite is an `Svg` of `<rect>` pixels with `isInteractive: true`, so SMIL animation runs in the sandboxed frame and a walk cycle needs no timer (Q11c).
- Cards are `Box`es with a coloured border. The sprite, text lines and bar sit inside. The progress bar can be a `Box` whose width is a fraction of the body, or a row of block glyphs.
- Group collapse state and the agent map live in `$.state` so a hot reload keeps them.
- Re-draw on change. Subscribing to `$.state` re-renders the pane, so no per-frame timer is needed for the cards. A slow tick (about 1 s) refreshes elapsed time.
- `e.props.bodyColumns` sizes the cards. Docked beside the transcript the pane is narrow (the screenshots are about 40 columns wide), so the card is a single column.

---

## 7. Assets (personal use)

### 7.1 Policy

- The real sprites and music are used **locally only**.
- `themes/*/sprites/*.png`, `themes/*/sprites/frames/` and `themes/*/sounds/` are git-ignored. The repo commits only `theme.json` manifests and a README listing which files each theme expects.
- If the mod is ever shared:
  - package it **without** the asset folders;
  - ship an original placeholder theme instead, for example generated chiptune and home-made sprites;
  - note that the packaging flow in the reference keeps "files the mod plays", so the asset folders have to be removed by hand first.
- The person supplies the asset files themselves. The mod doesn't fetch them from any site.

### 7.2 Pipeline (build later, not now)

1. Drop the PNG sprite sheets and audio files into the theme folder.
2. An offline conversion step (a future `scripts/` tool, not part of the runtime mod) slices each sheet into named frames. It then pre-renders each frame as an `Svg` of `<rect>` pixels (one rect per run of same-coloured pixels, to stay small), recoloured per companion variant.
3. The runtime reads the pre-rendered frames with `$.fs` (the mod has no Node and no DOM, so it can't decode images itself).
4. Audio is played with `$.audio.play({ asset })`, which uses `afplay` on macOS (Declared). The theme loop uses `shouldLoop: true` plus an AbortSignal. Clips aren't queued, so the finale needs the loop stopped first, or it will overlap.

Format notes:

- mp3 and wav are the safe bets for `afplay`.
- Keep the loops short. Base64 inlining is a fallback only.

---

## 8. Open questions (research before building)

| # | Question | Why it matters | How to settle |
|---|----------|----------------|---------------|
| Q1 | **Can the strip animate on desktop?** Moved to the `AbovePrompt` band (Q2a is no longer the placement). Does a sprite animate there, and does a redraw on a slow timer flicker? | This is the core placement requirement. | Spike the band on desktop once it exists. Fall back to `$.ui.status` text frames. |
| Q2 | **Surface: desktop.** Answered by the user. Consequences: `Svg` for every sprite; no `Raster` or `Image`. | Decides the rendering path (§6.4, §6.5). | Answered. |
| Q2a | Does `PromptHint` (the hint line under the prompt) accept an `Svg` on desktop? **Not settled.** The spike's `PromptHint` hook threw on a state write during drawing, then the mod stopped answering, so no result came back. | `PromptHint` is one text row, too short for the strip. Dropped as a placement. | KIV (keep in view). Not being tested now; the strip goes in `AbovePrompt` (Q15). |
| Q15 | Does an `AbovePrompt` band take an `Svg` strip on desktop, at the width and rows the strip needs? | Decides the strip's home (§6.4). | Spike it: one band with a 48 px `Svg` sprite, drawn with `maxRows` and `bodyColumns`. |
| Q3 | **Can audio play?** Spike result: a looped clip ran about 100 s and `$.audio.play` resolved 20 ms after the abort, so abort stops it cleanly. Not checked: whether it was audible, and whether `gain` changed the volume. | Music is half the feature. | Listen on desktop to confirm audibility and `gain`. |
| Q4 | Does a looping clip outlive a hot reload or `/clear` (orphaned `afplay`)? Does `session.end` get a chance to abort it? | Prevents music that won't stop. | Reload mid-loop and watch the process list. |
| Q5 | **Which events reliably mean "working" and "task completed"?** Spike result: main-loop `turn.start` and `turn.complete` (no `agentId`) bracket the turn. `turn.complete` also fires for a subagent (`agentId` set), so the flag must check for the main loop. The main turn can end while an agent is still running. `classic.TaskCompleted` is not yet checked. | Decides when the music starts and when the flag plays. | Partly settled. Rule: the complete beat fires on the main `turn.complete` once no agent is running; otherwise it waits for the last `SubagentStop`. |
| Q6 | Do `classic.SubagentStart`/`Stop` and `turn.start`/`complete` with `agentId` fire for every agent kind? **Partly settled.** The Explore subagent's start, steps, tool calls and stop all carried its `agentId`. Three `SubagentStop` lines had no matching start, so the engine must ignore ids it never saw start. Not yet checked: background, teammate and plugin-spawned agents. | The one-Yoshi-per-agent guarantee depends on this. | Reconcile against `$.agent.list()` (`/spike-agents`, not yet run). |
| Q7 | Can a `userConfig` `options` list be dynamic, i.e. built from the `themes/` folder? | Whether adding a theme needs a manifest edit. | Check the `userConfig` types; otherwise accept the manifest edit. |
| Q8 | What is the CPU and token cost of a 10 fps `clock.every` + `blit` loop? Does each period count against a budget? | It should be lightweight at run time too. | Measure during the Q1 prototype. |
| Q9 | Should idle or waiting teammates keep their companion? | Lifecycle semantics. | The user decides. Default: keep it, drawn standing still. |
| Q11 | **Pane and animation.** Answered on desktop: the `Svg` pane draws and animates (SMIL bounce and the frame redraw). Not separately checked: the tab beside "Mods" and "In this chat" (a), and an unasked open (b, the `/desk` command path is always placed). | The Helper Desk is the primary view. | Answered. |
| Q12 | **Live tokens and model while an agent runs.** Answered by the spike log: `turn.step` fires once per model request, and each stop chunk's usage is that request's whole context, not a delta. A card's tokens are the latest request's total, not a running sum. The spike's sum double-counted, so the card must not add them. | Sets how live the card's token figure can be. | Answered; see §8.1. |
| Q13 | **Progress bar.** Answered by the user: indeterminate while running, full when done. | None. | Answered. |
| Q14 | **Time tile.** Answered by the user: the current turn's elapsed time. | None. | Answered. |
| Q10 | Where does the mod's source live in this repo (`mods/theme/`? `hooks/`?) and how does it deploy into the dev-mods folder? | The repo layout is provisional (README). | Decide alongside the behavior-manifest question. |

### Constraints carried in from the previous session

- `$.agent.list()` exists: it is the reconcile source of truth.
- `turn.step` carries `agentId`: per-agent activity animation is possible.
- **No per-agent cost field**: no cost-driven visuals.
- `prompt_cache_warm` exists only on model-switch events: not used here.
- It is unknown whether `ui.render` can rewrite transcript rows: not used here.
- No plugin-toggle API was found, but `claude plugin enable` / `disable` exist on the CLI: §6.1.
- **The validator follows `$` only into top-level functions.** Every function that touches `$` must be a top-level function of the hooks module, so `claude plugin validate` sees what it calls. That rules out closures inside objects and class methods.
- **Gating hooks need `.catch`.** This mod's hooks are observers (`turn.*`, `classic.Subagent*`, `ui.render`). If `claude plugin validate` lists any of them under gating hooks, add a `.catch` that passes through with `next(e)`.

---

### 8.1 Notes on the answered questions

**Q11 — the pane and animation, in plain terms.**

- **(a) A tab beside "Mods" and "In this chat".** Each plugin pane is a tab in the pane strip. The type notes say the tab shows when more than one pane is open, labelled with the `title` the plugin gave. The pane is raised on every attached surface, which includes desktop. Expected: yes, the Helper Desk tab appears like the screenshot's tabs. Not verified on desktop.
- **(b) Opening without the person asking.** The type notes say a pane opened from a person's command, prompt or press is always placed. One opened with no person behind it is placed only when the surface has room for it. In the terminal that means 144 columns. Desktop's threshold is not stated. **Decision: open the Helper Desk from a `/desk` command**, so it is always placed. A pane that the mod opens on its own stays a fallback.
- **(c) SMIL in `Svg`.** An `Svg` with `isInteractive: true` runs in a script-less sandbox where SMIL animation works. That is a walk cycle with no timer: each sprite frame is a set of `<rect>` cells with `<animate>` steps. Frame-by-frame sprite animation may need a shorter timer to match the colours and sizes. Not verified on desktop.

**Q12 — live tokens and model.**

- `turn.step` fires once per model request, not once per streamed token. Its `stop` chunk carries `usage` (input, output and cache counts) and the `model`, so the figure updates **when each request ends**, not during it.
- Each request's `turn.step` carries the `agentId`, so the card can sum tokens per agent as the agent runs. Between requests the figure is flat. Within a request it holds still, even though the model is writing.
- A running agent with a long single request therefore shows no change for that request's duration. That is a real limit, not a bug.
- **Option, for a decision:** estimate in-flight tokens from the streamed text (about 4 characters per token), labelled `≈` on the card and replaced by the true figure at the end of the request. Default: show the stepped figure only, no estimate.

**Q13 and Q14** are answered as the user chose: an indeterminate bar while running and a full bar when done; the Time tile shows the current turn's elapsed time.

---

## 9. Build order (for a later session)

1. Spike, throwaway mod (`~/.claude/dev-mods/…/theme-spike/`). Done: the animated `Svg` pane (Q11), the looped clip and abort (Q3), and the event and per-request usage log (Q5, Q6, Q12). Not settled: the `PromptHint` `Svg` (Q2a), dropped. Still open: a band spike for the strip (Q15), and the audibility check (Q3).
2. Engine: beat detection, the agent map plus reconcile, per-agent stats (steps, activity lines, tokens, elapsed), the Helper Desk pane, then the strip in `AbovePrompt`, all with a placeholder coloured-block theme.
3. Mario pack: conversion of real assets, then `theme.json`.
4. Zelda pack: proves the swap works with a config change only.
5. Optional: spinner words, `Spinner.mode` poses, per-agent bobbing from `turn.step`.

---

## 10. Other Claude mod ideas

1. **Agent roster pane (unthemed).** The Helper Desk without the sprites and sound: a plain card list from `$.agent.list()`. The theme mod's pane builds on it, so build this first and theme it later. Pressing a card could open that agent's transcript with `$.ui.view({ agentId })`.
2. **Context and usage meter.** A sparkline `Svg` of the context window and session cost from `$.session.usage`. It covers the main thread only, since there is no per-agent cost.
3. **Cache-warmth light.** Read `usage.cache_read_input_tokens` from `turn.complete` rather than relying on `prompt_cache_warm`, which only appears on model switch.
4. **Long-turn notifier.** When the main loop's `turn.complete.durationMs` passes a threshold, call `$.ui.notify` or the user's Telegram `notify.sh` through `$.process.run`. This replaces the judgment-based rule in CLAUDE.md with a deterministic one.
5. **Narrator.** `$.audio.speak` reads a one-line summary of the finished turn, made with `$.model.complete`. Opt-in, and pairs with the theme mod.
6. **Mod switcher.** A `/mods` command and pane that wraps `claude plugin enable` / `disable` through `$.process.run`. This fills the missing in-API toggle.
7. **Library promoter.** On `session.end`, offer to turn the session's memory files or notes into a `library/` doc draft. This ties into the repo's "evolving context library" goal.
8. **Guard rails.** A gating `tool.call` hook (with `.catch`) that blocks destructive Bash outside the repo, or edits to protected paths.
9. **Redactor.** Rewrites `session.append` content to mask secrets before they're stored.
10. **Achievements / XP.** Counts finished turns, agents spawned and tests passed in `$.store`, and shows streaks. Could use the theme mod's sprites as badges.
11. **Ambient mode sound.** Different soft loops for `Spinner.mode` thinking versus tool-use. This is a sub-feature the theme engine could absorb.
12. **Test-result fanfare.** Watches `tool.call` results of test commands and plays a pass or fail clip from the active theme.
13. **Focus timer band.** A pomodoro in the `AbovePrompt` band that holds toasts during focus blocks.
14. **Selection quoter / explainer.** Quotes the mouse selection into the prompt (the reference has an example), or asks a `$.model.fork` question about it.
