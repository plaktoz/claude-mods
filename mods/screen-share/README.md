# screen-share

This mod masks names, emails, phone numbers and money amounts on screen. Claude still reads the real data.

The mod masks what the transcript draws. It does not change the stored conversation.

The mod is not a privacy guarantee. Real text still reaches Claude. The name search also sends text to Haiku.

## 1. Purpose

Use this mod when you share or record your screen during a Claude Code session.

While the mode is on, the mod draws shaded bars over:

- Emails, phone numbers and money amounts, found by pattern.
- Names, learned from the conversation by a small model.

The mod also adds a band above the prompt. The band says the mode is on. It has a **Turn off** button.

Claude receives the real text. Only the drawing changes.

## 2. Where to find the code

| Item | File | Line |
|------|------|------|
| Mode flag (session state) | `hooks/register.tsx` | 9 |
| Learned names list (session state) | `hooks/register.tsx` | 11-13 |
| Stored key for the mode flag | `hooks/register.tsx` | 15, 181, 220 |
| Bar helper | `hooks/register.tsx` | 23-24 |
| Email pattern | `hooks/register.tsx` | 26 |
| Money patterns | `hooks/register.tsx` | 28-31 |
| Phone pattern | `hooks/register.tsx` | 32 |
| Phone check, `isPhone` | `hooks/register.tsx` | 35-41 |
| Name pattern | `hooks/register.tsx` | 49-59 |
| Masking, `mask` | `hooks/register.tsx` | 61-71 |
| Masking inside tool data, `deepMask` | `hooks/register.tsx` | 74-85 |
| Helpers for groups and dialogs: `isRecord`, `masks`, `maskExcept`, `maskAsk` | `hooks/register.tsx` | 87-113 |
| Name list entries, `expand` | `hooks/register.tsx` | 116-128 |
| Add names to the list, `addNames` | `hooks/register.tsx` | 130-134 |
| Model prompt and reply parser | `hooks/register.tsx` | 136-151 |
| Model call for names, `learnNames` | `hooks/register.tsx` | 154-165 |
| History scan, `learnHistory` | `hooks/register.tsx` | 168-177 |
| Mode change, `setMode` | `hooks/register.tsx` | 179-183 |
| Mode prompt text, `MODE_PROMPT` | `hooks/register.tsx` | 189-191 |
| Session start: command, tools, restore | `hooks/register.tsx` | 194-223 |
| Slash command, `/screen-share` | `hooks/register.tsx` | 225-231 |
| Tool hook, `set_mode` | `hooks/register.tsx` | 233-238 |
| Tool hook, `hide_names` | `hooks/register.tsx` | 240-246 |
| Learn from tool calls | `hooks/register.tsx` | 249-256 |
| Hook, `prompt.submit` | `hooks/register.tsx` | 258-262 |
| Hook, `turn.complete` | `hooks/register.tsx` | 264-268 |
| Hook, `prompt.compose` | `hooks/register.tsx` | 270-275 |
| Drawing hooks for `UserMessage`, `AssistantMessage` and `CommandOutput` | `hooks/register.tsx` | 278-297 |
| Drawing hooks for `ToolUse` and `ToolResult` | `hooks/register.tsx` | 299-315 |
| Drawing hook for `ToolGroup` | `hooks/register.tsx` | 317-325 |
| Drawing hook for `AskUserQuestion` | `hooks/register.tsx` | 327-333 |
| Drawing hook for `InfoNotice` | `hooks/register.tsx` | 335-340 |
| Band above the prompt | `hooks/register.tsx` | 342-368 |
| Turn off button and its failure toast | `hooks/register.tsx` | 356-364 |
| Hooks module list | `hooks/hooks.json` | 1 |
| Plugin name and version | `.claude-plugin/plugin.json` | 2-3 |
| State types | `types/index.d.ts` | 2, 5-9 |
| Tests | `hooks/register.test.tsx` | 66, 92, 108, 134, 165, 183, 221, 239 |
| Test stand-in engine | `hooks/register.test.tsx` | 27-64 |

## 3. How it works

### 3.1 Modes

The mode has two states: on and off. The mode starts off.

Three actions turn the mode on or off:

- The command `/screen-share on`, `/screen-share off`, or `/screen-share` alone. Without an argument, the command toggles the mode.
- The tool `set_mode`. Claude calls it when the person asks.
- The **Turn off** button in the band.

Turning off stops the masking. Turning off does not clear the names list.

If the store refuses the write after **Turn off**, the mode is still off for this session. The mod shows a toast. The stored flag keeps its old value.

### 3.2 Learning names

The mod learns names in five places. Four of them run only when the mode is on. The `hide_names` tool adds names without a model call.

- `prompt.submit`: the mod reads the prompt text. Slash command prompts are skipped.
- `turn.complete`: the mod reads the finished reply.
- `tool.call`: the mod reads the tool input and output. Calls to the mod's own tools are skipped.
- `/screen-share on` and `set_mode` with `on`: the mod reads the recent history with `learnHistory`.
- `hide_names`: the mod adds the names that Claude gives. It makes no model call.

`learnNames` reads the last 20,000 characters of its text. It skips the text when the text has no capital letter followed by a lower-case letter. Otherwise it asks Haiku for the names. `Aa pair` means a capital letter followed by a lower-case letter.

Figure 1 shows the paths.

```mermaid
flowchart LR
  T1["prompt.submit<br/>not a command"] --> L["learnNames<br/>skip if no Aa pair"]
  T2["turn.complete"] --> L
  T3["tool.call<br/>not a mod tool"] --> L
  T4["on: command or set_mode"] --> H["learnHistory<br/>last 60,000 characters"]
  H --> L
  L --> K["Haiku call<br/>8 second timeout"]
  T5["hide_names tool"] --> N["addNames<br/>names list"]
  K --> N
  classDef hot stroke-width:3px
  class L,K,N hot
  linkStyle 0,5,7 stroke-width:3px
```

**Figure 1.** How the mod learns names. Each trigger reaches `learnNames` or `addNames`. The highlighted path runs from a prompt to the names list through the Haiku call.

### 3.3 Masking one row

`mask` runs four pattern steps and then the names step. Each step replaces matches with bars. The stored text does not change.

Figure 2 shows the order.

```mermaid
flowchart TD
  A["Text of one row, as stored"] --> B["EMAIL pattern: each match becomes bars"]
  B --> C["MONEY_BEFORE: a symbol or code, then a number"]
  C --> D["MONEY_AFTER: a number, then a code or currency word"]
  D --> E["PHONE pattern: a match becomes bars only if isPhone is true"]
  E --> F["Learned names: each name becomes bars, case-sensitive"]
  F --> G["Text drawn with bars"]
```

**Figure 2.** The masking steps for one row. The steps run in this order. The names step runs last.

The mod draws one bar for each non-space character. Spaces stay as they are.

### 3.4 What each hook does

| Hook | Condition | Action |
|------|-----------|--------|
| `session.start` | Always | Registers the command, the `set_mode` tool and the `hide_names` tool. Sets the mode on when the stored value is `true` (line 220). |
| `command.run` for `screen-share` | Always | Sets the mode from the argument, or toggles it. Returns the on or off text. |
| `tool.call` for `set_mode` | Always | Sets the mode from the `on` input. Returns the on or off text. If the call fails, the hook denies it. |
| `tool.call` for `hide_names` | Always | Adds the names from the input. Makes no model call. If the call fails, the hook denies it. |
| `tool.call`, any other tool | Mode on, not a mod tool | Calls `learnNames` on the input and the result. If the call fails, the hook passes the call on. |
| `prompt.submit` | Mode on, not a command | Calls `learnNames` on the prompt text. If the call fails, the hook passes the prompt on. |
| `turn.complete` | Mode on | Calls `learnNames` on the reply. The hook has no fallback. |
| `prompt.compose` | Mode on | Adds the mode prompt text to the session prompt. |
| `ui.render` for `UserMessage`, `AssistantMessage`, `CommandOutput` and `InfoNotice` | Mode on | Draws masked text. |
| `ui.render` for `ToolUse` and `ToolResult` | Mode on | Draws masked input and output. The `hide_names` input is always bars. |
| `ui.render` for `ToolGroup` | Mode on | Unfolds the group when the input or output of any call has a match. The unfolded rows then draw through `ToolUse`. |
| `ui.render` for `AskUserQuestion` | Mode on | Draws the header, the option descriptions and the previews masked. Keeps the question text and the option labels. |
| `ui.render` for `AbovePrompt` | Mode on, no survey open | Adds the band below any other band. If **Turn off** cannot save the change, the press shows a toast and does not fail. |

### 3.5 Mode prompt and tools

The mode prompt tells Claude three things:

- The mod masks names, emails, phone numbers and money amounts on screen.
- Claude still reads the real data. Claude does not reword the text.
- Claude calls `hide_names` before it writes a new name.

The two tools are `set_mode` and `hide_names`. Both use the mod's tool prefix, `mcp__screen-share__`.

`hide_names` shows its own input as bars in the transcript. The names in that input are not yet in the list.

### 3.6 Stored values

| Value | Where | Kept across sessions |
|-------|-------|----------------------|
| Mode flag, `isOn` | `$.store` under the key `isOn` (line 15) | Yes. Session start reads it (line 220). |
| Mode flag, live copy | Session atom `isOn` (line 9) | No. Set by `setMode`, and by session start when the stored value is `true` (line 220). |
| Names list | Session atom `names`, shape tag `names-1` (lines 11-13) | Not checked. |

The shape tag `names-1` marks the list format. Change the tag when the meaning of the list changes.

## 4. Settings

This mod has no settings in `/config`. The manifest has no `userConfig` block.

The values below are fixed in the code. To change a value, edit `hooks/register.tsx`.

| Name | Line | Value | Effect |
|------|------|-------|--------|
| `MAX_NAMES` | 18 | 500 | The list keeps the last 500 names. |
| `SCAN_CHARS` | 20 | 20,000 characters | Text read by one model call. |
| `HISTORY_CHUNKS` | 21 | 3 | Number of chunks read by `learnHistory`. Total: 60,000 characters. |
| `model` | 158 | `haiku` | Model for name finding. |
| `maxTokens` | 161 | 600 | Reply size limit for name finding. |
| `timeoutMs` | 162 | 8000 | A name finding call stops after 8 seconds. |
| `BAR` | 23 | `░` | Character for each masked character. |
| `TOOL_PREFIX` | 16 | `mcp__screen-share__` | Prefix for the mod's tools. |

Name entries keep only text from 2 to 60 characters (line 120). Name parts keep only text of 2 characters or more that starts with a capital letter (line 123). The text `Claude` is never added (line 127).

## 5. Install

You install this mod in one of three ways. Method A and method B load the mod from a folder on your computer. Method C installs it through the repository's marketplace.

### 5.1 Before you start

You need:

- Claude Code. The version used to write and test this mod is 2.1.310. To see your version, run `claude --version`.
- A copy of this repository on your computer.
- A terminal. A terminal is a window where you type commands.

In this document, the **repository root** is the top folder of the repository. The folder is named `claude-mods`. All commands in this document start from this folder.

This review did not run any Windows or Linux step. There is no OS-specific code in this mod.

### 5.2 Choose a method

| Method | Use it when | Duration |
|--------|-------------|----------|
| A. Flag `--plugin-dir` | You want to try the mod. | One session |
| B. Setting `CLAUDE_CODE_PLUGIN_DIRS` | You want the mod in every session, from your clone. | Until you remove the setting |
| C. Marketplace | You want a standard install. | Until you uninstall the mod |

### 5.3 Method A: try the mod for one session

1. Open a terminal. Go to the repository root.
2. Start Claude Code with this flag: `claude --plugin-dir mods/screen-share`.
3. Do the check in 5.6.

This review did not start a session with this flag.

### 5.4 Method B: load the mod in every session

1. Open the file `~/.claude/settings.json` in a text editor.
2. Add the full path of the mod folder to an `env` block. The line is `"CLAUDE_CODE_PLUGIN_DIRS": "/Users/your-name/Developer/claude-mods/mods/screen-share"`.
3. Replace `/Users/your-name/Developer/claude-mods` with the real path to your repository.
4. Save the file. Start a new Claude Code session.
5. Do the check in 5.6.

The file has this shape:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/Users/your-name/Developer/claude-mods/mods/screen-share"
  }
}
```

To remove the mod, delete the line. Start a new session.

This review did not test method B.

### 5.5 Method C: marketplace

The repository marketplace file, `.claude-plugin/marketplace.json`, lists `screen-share` at line 28.

1. Add the marketplace once. Run this command: `claude plugin marketplace add plaktoz/claude-mods`.
2. Install the mod. Run this command: `claude plugin install screen-share@claude-mods`.
3. Restart Claude Code to load the mod.

This review did not run method C. It needs network access to GitHub and it changes your Claude Code setup. The install command was not run.

### 5.6 Check that the install worked

1. Start a session with method A, B or C.
2. Run `/screen-share on`.
3. **Expected:** the reply starts with `Screen-share is on.` The band shows `Screen-share mode:` above the prompt.

No person has done this check yet.

### 5.7 Change the fixed values

This mod has no settings in `/config`. To change a value, see section 4.

## 6. Validate

### 6.1 Level 1: validate the files

Run this command from the repository root:

```bash
claude plugin validate mods/screen-share
```

The last lines of the real output in this review:

```text
✔ Validation passed with warnings
```

The command exited with code 0. The output has 1 warning: `author: No author information provided`.

The plugin directory checks add 1 problem and 1 warning. They do not change the result:

- `LICENSE_MISSING`: the plugin folder has no LICENSE file and `plugin.json` has no `license`.
- `ICON_MISSING`: the plugin has no icon.

The output also lists the hooks, calls and state keys that the module uses.

### 6.2 Level 2: run the tests

Run this command from the repository root:

```bash
claude plugin test mods/screen-share
```

The last lines of the real output in this review:

```text
 8 pass
 0 fail
Ran 8 tests across 1 file. [0.68s]
```

The command exited with code 0. The eight tests are:

- `a prompt row is drawn masked once the mode is on`
- `the mode leaves dates, versions and plain words alone`
- `the band shows while on and Turn off ends the mode`
- `a tool group with a name or an email unfolds, and its rows draw masked`
- `a tool group with no name or email stays folded`
- `an ask dialog masks its header, descriptions and previews, and keeps the question and labels`
- `an info notice draws its text masked`
- `a failed Turn off is caught: the press still resolves`

### 6.3 Level 3: live check in a session

Start a session with the mod. Then:

1. Run `/screen-share on`. Check the band.
2. Send a prompt with a name, an email and a phone number. Check that the row shows bars.
3. Run `/screen-share off`. Check that the band is gone and the text is normal.

No person has done this check yet.

### 6.4 What each test proves

| Test | What it proves | What it does not prove |
|------|----------------|------------------------|
| `a prompt row is drawn masked once the mode is on` | A `UserMessage` row with a name, an email, a phone number and an amount draws masked. It does this on two surfaces, `terminal` and `desktop`. | Learning from a real model. The stand-in returns `Jane Doe` for every call. |
| `the mode leaves dates, versions and plain words alone` | An `AssistantMessage` with `2.1.310`, `2026-10-24` and the word `Northvale` draws unchanged. | Masking of plain number lists. |
| `the band shows while on and Turn off ends the mode` | The band shows on two surfaces. `Turn off` sets the stored flag to `false` and removes the band. | Restore after a new session. |
| `a tool group with a name or an email unfolds, and its rows draw masked` | A `ToolGroup` with a name and an email in one call sets `isExpanded` to `true`, on two surfaces. The `ToolUse` row for that call then draws input and output masked. | That the engine draws the unfolded rows in a live session. |
| `a tool group with no name or email stays folded` | A `ToolGroup` with no name, email, phone or amount keeps `isExpanded` at `false` and keeps its calls unchanged. | Groups with several calls. |
| `an ask dialog masks its header, descriptions and previews, and keeps the question and labels` | On two surfaces, the header, the option descriptions and the previews draw masked. The question text and the option labels stay as they are. | The answer that the engine sends back to the model. |
| `an info notice draws its text masked` | An `InfoNotice` with a name and an email draws masked on the `terminal` surface. | Other surfaces. The engine draws this component on the terminal only. |
| `a failed Turn off is caught: the press still resolves` | When the store refuses the write, the press of **Turn off** still resolves. The band is gone. The stored flag keeps `true`. | The text of the toast. The test does not check the toast. |

The test stand-in is in `hooks/register.test.tsx` at lines 27-64. It provides a store that can refuse writes, a history with one row, and a model that returns `["Jane Doe"]`. It also draws the text it receives and records the props of each component.

The tests do not cover:

- `prompt.submit`, `turn.complete`, `tool.call` learning, `hide_names` and `prompt.compose`.
- The model reply parser, `parseNames`, with real model output.
- The `CommandOutput` and `ToolResult` rows. The tests draw `ToolUse` rows only.
- Each regex edge case in section 7.
- The 8-second timeout.
- A restore after a new session.
- A live session.

### 6.5 Problems and solutions

| Problem | Cause | Solution |
|---------|-------|----------|
| Validate shows `LICENSE_MISSING`. | The plugin folder has no LICENSE file, and `plugin.json` has no `license`. | Add a LICENSE file, or set `license` in `plugin.json`. |
| Validate shows `ICON_MISSING`. | The plugin has no icon. | Add a square PNG icon, or set `icon` in `plugin.json`. |
| `/screen-share` is not a command. | The mod is not loaded. | Check the install with 5.6. Start a new session after a change. |
| A name shows in a reply. | The mod learns names after the reply finishes. | Ask Claude to call `hide_names` first. Learning takes place after the reply. |

### 6.6 Type check (optional)

This review did not run a type check. The `tsc` command is not installed on this computer. `tsconfig.json` extends `./.claude-plugin/types/tsconfig.json`.

## 7. Known limits

Each limit below comes from the code or from a check in this review.

### 7.1 Rows that the mod draws in part

- The mod masks `ToolGroup`, `AskUserQuestion` and `InfoNotice`. The tests cover each one.
- A folded `ToolGroup` shows a count. The engine does not draw a rewrite of its `calls`. Only `isExpanded` changes the screen.
- So the mod sets `isExpanded` to `true` when a call has a match (line 324). The mod does this on every draw of that group.
- The unfolded rows draw through `ToolUse`. A group with no match stays as it is.
- An `AskUserQuestion` keeps its `question` text and its option `label` text unmasked (lines 108 and 111). The answer to the model is keyed on them.
- The engine draws `InfoNotice` on the terminal only.
- A live check was not run.

### 7.2 Text that the mod does not mask

- The mod does not scan slash command prompts (line 259).
- The mod does not mask the prompt box, the status line or the panes of other mods.
- The mod does not mask keys of objects in tool input or output (line 79). Only string values are masked.
- The `hide_names` input is always bars (line 304). The transcript shows bars for the names in that input.

### 7.3 Name matching

- Learned names are case-sensitive. The name `Jane Doe` does not mask `jane doe`.
- A common word learned as a name masks every capital use of that word. For example, the name `Mark` turns `Mark said mark` into `░ said mark`.
- A name next to a letter or number is not masked. For example, `田中太郎が` is not masked when the name is `田中太郎`.
- A name in a reply is learned when the reply finishes. A name in a streaming reply shows until then, unless `hide_names` ran first.
- A name is learned only when the model returns it. The mod does not check the model reply against the text.
- A name of one character is not learned (line 120).
- Lower-case name parts, such as `van`, are not learned alone (line 123).

### 7.4 Phone numbers

- A plain figure group is masked when it has 7 to 15 digits. The check is `isPhone` (lines 35-41).
- Plain numbers with spaces between them are masked. For example, `2024 2025 2026` becomes bars.
- These numbers are not masked: `4155550134` (no separator), `415,555,0134` (commas), and `415 555` followed by a line break and `0134`.
- Dates such as `2026-10-24` and addresses such as `192.168.1.10` are not masked.
- A number with a leading `+` is masked, for example `+4155550134`.

Checked in this review with the mod's patterns:

| Input | Result |
|-------|--------|
| `2024 2025 2026` | Masked: `░░░░ ░░░░ ░░░░` |
| `3 4 5 6 7 8 9` | Masked: `░ ░ ░ ░ ░ ░ ░` |
| `ref 1234-5678` | Masked: `ref ░░░░░░░░░` |
| `1.234.567 units` | Masked: `░░░░░░░░░ units` |
| `0412 345 678` | Masked: `░░░░ ░░░ ░░░` |
| `4155550134` | Not masked |
| `415,555,0134` | Not masked |
| `1,234,567 units` | Not masked |
| `2026-10-24`, `2.1.310` | Not masked |

### 7.5 Money amounts

- A symbol or code before a number is masked, for example `$`, `€`, `£`, `US$`, `S$`, `USD` or `EUR`. Checked: `$12,000`, `S$5` and `USD 5`.
- A currency code after a number is masked: `USD`, `EUR`, `GBP`, `SGD`, `AUD`, `CAD`, `JPY`, `INR` or `CHF`. Checked: `12 USD`. The words `dollars`, `euros` and `pounds` are masked too.
- These amounts are not masked: `5€`, `1.234,56 €`, `5 €`, `5 million dollars`, `5 dollar`, `1 euro`, `100 yen` and `₩5000`.
- `Rs 500` is not masked either.

### 7.6 Bars

- The bar helper has no `u` flag (line 24). One character outside the Basic Multilingual Plane, such as an emoji, draws as 2 bars.

### 7.7 Model calls

- Each name call sends its text to Haiku. The text can include prompts, tool inputs, tool outputs, replies and history.
- A call can take up to 8 seconds (line 162).
- `prompt.submit` and `tool.call` wait for the call before they continue. `turn.complete` waits too. `/screen-share on` and `set_mode` wait for up to three calls in parallel (line 176).
- The calls are billed to the session.
- The `turn.complete` hook has no fallback. The effect of a failed call on that hook was not checked.
- The model result varies. Names can be missed or added. The live model was not tested.

### 7.8 State

- The mode flag is saved with `$.store`. A new session reads it (line 220).
- The names list is session state. Session start does not scan the history again.
- Whether the names list survives a resume was not checked.
- The list keeps the last 500 names (line 133). Older names are dropped.
- `Turn off` does not clear the names list.
- `Turn off` sets the live mode before it saves the flag (lines 180-181). If the save fails, the live mode stays off and the stored flag keeps `true`. A new session can start with the mode on. The mod shows a toast (line 361).

## 8. Glossary

| Term | Meaning in this document |
|------|--------------------------|
| Band | The line above the prompt that shows the mode and the **Turn off** button. |
| Bar | The character `░`. The mod draws one bar for each masked character. |
| Drawn text | The text on screen. The stored conversation does not change. |
| Haiku | The small model that the mod calls to find names. |
| Hook | A function that the engine runs on an event, such as `prompt.submit`. |
| Learned name | A name in the names list. The mod masks it on screen. |
| Mode | Screen-share mode. The mode is on or off. |
| Mode flag | The stored value `isOn` that says whether the mode is on. |
| Names list | The session list of learned names. |
| Mask | To draw bars over text. |
| Rewrite | A change that a `ui.render` hook makes to the text it draws. |
| Session state | A value kept for the current session. It is not stored across sessions. |
| Store | The engine store that keeps a value across sessions. |
| Stand-in | The fake engine in the tests. |
| Tool group | A row that lists several tool calls. It shows a count while folded. |
