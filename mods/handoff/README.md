# handoff

A Claude Code mod. It packs a session into a prompt for a fresh chat.

An HTML version of this document is in `README.html`. It has the same content and the same diagrams.

To install the mod, go to section 5. To test that the mod works, go to section 6.

## 1. Purpose

A long session has two problems:

1. The conversation becomes large.
2. The prompt cache can expire. When the cache expires, the next reply costs full price.

A fresh chat solves both problems. A fresh chat does not know your work. This mod gives the fresh chat the information it needs. The mod does the following:

1. It records the work of the session. The record contains the first request, the files, the skills, the links and the tools.
2. It asks whether you want to start a fresh chat. It asks when the session passes 250k tokens, or when the cache has likely expired.
3. If you agree, it asks the model for a summary. This summary is the handoff. The mod copies the handoff to the clipboard.
4. You start a fresh chat and paste the handoff.

You can also run the command `/handover` at any time. The mod name is `handoff`. The command name is `handover`.

The question has this text, for an idle time of 7 minutes:

```text
Handoff
This session was idle 7 minutes, so its cache has likely gone cold. Move to a fresh chat with a handoff?
[Make a handoff]  [Continue here]
```

The question has the header `Handoff`. It has two options: `Make a handoff` and `Continue here`.

## 2. Where to find the code

All logic is in one file: `hooks/register.ts`. The line numbers match the file as it was when this document was written. If a line number is different, search for the function name.

| Item | File | Line |
|------|------|------|
| Constants (token limit, cache time, list limit) | `hooks/register.ts` | 6–10 |
| `EMPTY`: the inventory at the start | `hooks/register.ts` | 12 |
| Stored values `inventory`, `pending`, `lastTurnEnd`, `hasOfferedTokens` | `hooks/register.ts` | 14–20 |
| `HANDOFF_PROMPT`: the request to the model | `hooks/register.ts` | 22–31 |
| `addUnique()`: adds an item to a list and keeps the last 50 | `hooks/register.ts` | 33–34 |
| `sameFile()`: compares two paths for the file lists | `hooks/register.ts` | 36–42 |
| `describe()`: turns the inventory into text | `hooks/register.ts` | 44–59 |
| `buildHandoff()`: asks the model and builds the handoff text | `hooks/register.ts` | 63–76 |
| `deliver()`: copies the text and clears `pending` | `hooks/register.ts` | 78–85 |
| `register()`: adds the hooks | `hooks/register.ts` | 87 |
| Hook `session.start`: adds the command | `hooks/register.ts` | 88–95 |
| Hook `command.run`: the `/handover` command | `hooks/register.ts` | 97–101 |
| Hook `tool.call`: records the inventory | `hooks/register.ts` | 103–117 |
| Hook `session.measure`: the 250k token offer | `hooks/register.ts` | 119–128 |
| Hook `turn.complete`: stores the end time | `hooks/register.ts` | 130–137 |
| Hook `prompt.submit`: the decision | `hooks/register.ts` | 139–176 |
| The question to you: `$.ui.ask` | `hooks/register.ts` | 159–165 |
| Type of the stored values | `types/index.d.ts` | all |
| Tests | `hooks/register.test.ts` | 63–190 |

Other files: `hooks/hooks.json` names the module. `tsconfig.json` is for the type check. `.claude-plugin/plugin.json` has the name and the version. The mod has no settings.

## 3. How it works

### 3.1 Three ways to start a handoff

| Way | When it starts | What you see |
|-----|----------------|--------------|
| Command `/handover` | You run the command. | The handoff is copied at once. |
| Token offer | The context passes 250k tokens. | A toast shows at once. The question shows at your next prompt. |
| Cold-cache offer | You send a prompt more than 5 minutes after the last main reply ended. | The question shows before the prompt is sent. |

All three ways use the same two functions. `buildHandoff()` makes the text. `deliver()` copies the text.

```mermaid
flowchart LR
    C["/handover command"] --> B["buildHandoff()"]
    T["Token offer<br/>250k tokens"] --> B
    K["Cold-cache offer<br/>idle over 5 min"] --> B
    B -->|"facts + prompt"| F["$.model.fork"]
    F -->|"summary, or no reply"| B
    B -->|"handoff text"| D["deliver()"]
    D -->|"copy"| CB[("Clipboard")]
    D -.->|"if copy fails"| X["Text in chat"]
```

Figure 1. Three starts lead to one path. The model summary returns to `buildHandoff()`. `deliver()` copies the text. If the copy fails, the text shows in the chat.

### 3.2 What happens at each prompt

The hook `prompt.submit` runs each time you send a prompt. It makes these decisions in order.

```mermaid
flowchart TD
    Q1{"Your own typed prompt?"} -->|yes| Q2
    Q1 -->|no| S["Send the prompt as typed"]
    Q2{"First prompt?"} -->|"yes: save as goal"| S
    Q2 -->|no| Q3
    Q3{"Offer due?"} -->|no| S
    Q3 -->|yes| Q4
    Q4{"Choose Make a handoff?"} -->|"no or dismissed"| S
    Q4 -->|yes| E["Copy the handoff.<br/>Do not send the prompt."]
```

Figure 2. The four decisions of `prompt.submit`. Most paths send the prompt as typed. Only the path to `Copy the handoff` stops the prompt.

These are the rules for each decision:

- **Your own prompt.** The prompt comes from the composer. It is not a slash command. It is not a hidden (meta) prompt. The mod sends peer prompts, commands and hidden prompts unchanged.
- **First prompt.** The mod saves the first 2000 characters as the goal. It sends the prompt unchanged. It does not ask a question at the first prompt.
- **Offer due.** One reason must be true. Either the token offer is waiting, or the idle time is more than 5 minutes. The token reason has priority.
- **Idle time.** Idle time is the current time minus the time the last main reply ended. A subagent reply does not count. If no main reply has ended, the idle time is 0.
- **Your choice.** If you close the question without an answer, the mod uses `Continue here`.
- **After the question.** The mod clears `pending` for every answer. This includes a dismissed question.
- **Choice `Make a handoff`.** The mod adds your prompt to the handoff as the next request. The mod does not send your prompt to the model.
- **Build fails.** The mod shows the toast `Handoff failed; your prompt was sent here instead.` It sends your prompt in this session. The `try` block covers `buildHandoff()` and `deliver()`, so either call that throws leads here.

### 3.3 The token offer

The token offer has three states. The mod shows the toast one time only.

```mermaid
stateDiagram-v2
    state "Not offered" as NotOffered
    [*] --> NotOffered
    NotOffered --> Waiting: context reaches 250k, toast shows
    Waiting --> Done: your next prompt, question shows
    Waiting --> Done: /handover
    Done --> [*]
```

Figure 3. The token offer. The toast shows one time. Both ways out of Waiting lead to Done.

| State | Meaning | `hasOfferedTokens` | `pending` |
|-------|---------|--------------------|-----------|
| Not offered | The context is below 250k tokens. | false | none |
| Waiting | The toast was shown. The question waits for your next prompt. | true | `tokens` |
| Done | The question was answered, or you ran `/handover`. | true | none |

The toast text is: `Context passed 260k tokens. Run /handover, or you'll be asked at your next prompt.` The number is the token count in thousands, rounded.

### 3.4 What each hook does

| Event | Condition | Action |
|-------|-----------|--------|
| `session.start` | Always | Add the command `/handover`. |
| `command.run` | The command is `handover` | Build the handoff. Copy it. Show the result as the reply. |
| `tool.call` | Always | Count the tool. Record the file, link or skill. Pass the call on. |
| `session.measure` | Tokens are 250k or more, and no offer was made | Set `hasOfferedTokens`. Set `pending` to `tokens`. Show the toast. |
| `turn.complete` | No `agentId`, so the main loop only | Store the current time in `lastTurnEnd`. |
| `prompt.submit` | Any prompt | Pass prompts that are not your own on. Make the decisions in 3.2 for your own prompts. |

Subagent turns do not change `lastTurnEnd`. The hook checks `e.agentId`.

The hooks `tool.call` and `prompt.submit` have a `.catch` handler. The handler calls `next(e)`. The event goes on to the next hook. The other hooks have no `.catch` handler.

### 3.5 What the mod records

The hook `tool.call` runs for each tool call. It records these facts.

| Tool | List | What it holds |
|------|------|---------------|
| `Read` | `read` | The file path. |
| `Edit` or `Write` | `edited` | The file path. |
| `WebFetch` | `urls` | The link. |
| `Skill` | `skills` | The skill name. |
| Any tool | `tools` | The number of calls for each tool name. |

Each list holds the last 50 items. An item that is already in a list is not added again.

**Counted calls.** The hook does not check `agentId`. A subagent tool call adds to the lists and the counts. In the test harness, the mod's own question is a tool call named `AskUserQuestion`, and it is counted in `tools`. This review did not check whether the live engine sends the question through `tool.call`.

The goal is a field of `inventory`. The mod sets it one time, at the first own prompt.

When the mod writes the handoff, it does not list an edited file as read. An edited file is shown one time, as edited.

**Path comparison.** The mod uses `sameFile()` only for the check above. A path is a Windows path when it starts with a drive letter, such as `C:\` or `c:/`. A path is also a Windows path when it starts with two backslashes. For a Windows path, `sameFile()` treats either slash as the same and ignores letter case. Other paths compare exactly. The hook code reads no platform value. So the mod decides by the shape of each path. `addUnique()` does not use `sameFile()`.

### 3.6 The handoff text

`buildHandoff()` sends the facts and `HANDOFF_PROMPT` to the model with `$.model.fork`. The prompt asks for a summary of under 400 words. The code does not check the length. The summary has five labels: Goal, Progress, Current state, Next steps and Context.

```mermaid
flowchart LR
    I["Facts from the inventory<br/>first request, files edited, files read,<br/>skills, links, tools"] -->|"+ prompt"| F["$.model.fork<br/>under 400 words"]
    F -->|"summary"| B["Body"]
    I -.->|"if no reply: the goal and the facts"| B
    B -->|"body"| H["Handoff text"]
    L1["Line 1: fixed sentence"] --> H
    N["Next request: your prompt<br/>offers only"] -.-> H
```

Figure 4. How the handoff text is built. The model summary becomes the body. If there is no reply, the body is the goal and the facts. An offer adds your prompt as the next request.

Line 1 is always: `Continue the work described in this handoff from a previous session.`

| Result | Action |
|--------|--------|
| The model answers (`isAnswered` is true) | The body is the reply text. |
| The model does not answer (`isAnswered` is false) | The body is the goal and the facts. The body has no summary. |
| The model request throws an error | `/handover` fails, and no copy is made. In the test harness the call raised a `HooksError`. The live engine was not checked. An offer shows the toast in 3.2 and sends your prompt. |
| The copy works | The message is `Handoff copied to the clipboard. Start a fresh chat (/clear or a new session) and paste it.` |
| The copy fails | The message is `Could not copy the handoff.` The full text follows. Copy the text by hand. |

For an offer, this message replaces your prompt. For `/handover`, this message is the reply to the command.

### 3.7 Stored values

| Name | Type | Meaning | Set by | Cleared by |
|------|------|---------|--------|------------|
| `inventory` | object | The goal, the lists and the tool counts. | `tool.call`, `prompt.submit` | Nothing in this mod |
| `pending` | `tokens` or none | The token question is waiting. | `session.measure` | `prompt.submit` (when a question was due), `deliver()` |
| `lastTurnEnd` | number or none | The time the last main reply ended, in milliseconds. | `turn.complete` | Nothing |
| `hasOfferedTokens` | boolean | The token offer was made. | `session.measure` | Nothing |

The engine stores these values for the session. The code gives `inventory` the shape tag `inventory-1`. The code comment says that a changed tag makes the engine decline older values. This review did not check how the values survive a reload.

## 4. Settings

This mod has no settings. The values below are fixed in the code. To change a value, edit `hooks/register.ts`.

| Constant | Value | Effect | Line |
|----------|-------|--------|------|
| `TOKEN_THRESHOLD` | 250,000 tokens | The context size that starts the token offer. | 6 |
| `CACHE_TTL_MS` | 5 minutes | The idle time after which the cache is treated as cold. | 9 |
| `LIST_LIMIT` | 50 | The maximum number of items in each list. | 10 |

The engine does not report if the cache is warm. The mod uses idle time instead. If your real cache time is not 5 minutes, the question appears too early or too late.

## 5. Install

You install this mod in one of three ways. Method A and method B load the mod from a folder on your computer. Method C installs it through the repository's marketplace.

### 5.1 Before you start

You need:

- Claude Code. The version used to write and test this mod is 2.1.310. To see your version, run `claude --version`.
- A copy of this repository on your computer.
- A terminal. A terminal is a window where you type commands. On macOS, open the app named Terminal. On Windows, open PowerShell or Windows Terminal.

In this document, the **repository root** is the top folder of the repository. The folder is named `claude-mods`. All commands in this document start from this folder. To go to this folder, type `cd` and the path. Example:

```bash
cd ~/Developer/claude-mods
```

On Windows PowerShell, the same step is:

```powershell
cd $HOME\Developer\claude-mods
```

On Windows, `scripts\install-mods.ps1` installs the mods through the marketplace. It needs none of the steps in 5.3 or 5.4. See the root `README.md`. This review did not run any Windows step in this document.

### 5.2 Choose a method

| Method | Use it when | Duration |
|--------|-------------|----------|
| A. Flag `--plugin-dir` | You want to try the mod. | One session |
| B. Setting `CLAUDE_CODE_PLUGIN_DIRS` | You want the mod in every session, from your clone. | Until you remove the setting |
| C. Marketplace | You want a standard install, from GitHub or from your clone. | Until you uninstall the mod |

### 5.3 Method A: try the mod for one session

1. Open a terminal. Go to the repository root (see 5.1).
2. Start Claude Code with this flag:

   ```bash
   claude --plugin-dir mods/handoff
   ```

3. Do the check in 5.6.

This review did not check whether a change to a file of the mod reloads the mod in an open session. Start a new session after a change.

### 5.4 Method B: load the mod in every session

1. Open the file `~/.claude/settings.json` in a text editor.
2. Add the full path of the mod folder to an `env` block. If the file has an `env` block, add only the line inside it. Use this shape:

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "/Users/your-name/Developer/claude-mods/mods/handoff"
     }
   }
   ```

3. Replace `/Users/your-name/Developer/claude-mods` with the real path to your repository. To print the path, run `pwd` in the repository root.
4. Save the file. Start a new Claude Code session.
5. Do the check in 5.6.

To remove the mod, delete the line. Start a new session.

On Windows, the settings file is `%USERPROFILE%\.claude\settings.json`. Write the path with forward slashes, for example `C:/Users/your-name/Developer/claude-mods/mods/handoff`. Or double each backslash in the JSON. In PowerShell, `(Get-Location).Path` prints the current folder. Run it in the repository root. This review did not test these Windows values.

### 5.5 Method C: marketplace

The repository has a marketplace file, `.claude-plugin/marketplace.json`. The file lists `handoff`. The `main` branch on GitHub has this file.

1. Add the marketplace once. Run this command:

   ```bash
   claude plugin marketplace add plaktoz/claude-mods
   ```

2. Install the mod. Run this command:

   ```bash
   claude plugin install handoff@claude-mods
   ```

3. Restart Claude Code to load the mod.

Add `--scope project` or `--scope local` to the install command to change where the mod applies. The default is `user`, which applies the mod to every project for you. `project` saves the setting in `.claude/settings.json` for everyone who opens the project. Run the command in the project folder.

To use your clone, add the marketplace from its path. Use this when your branch is not merged yet:

```bash
claude plugin marketplace add /path/to/claude-mods
```

The scripts in `scripts/` run these steps for you. Run `scripts/install-mods.sh handoff` on Linux, macOS or Git Bash. Run `powershell -ExecutionPolicy Bypass -File scripts\install-mods.ps1 handoff` in PowerShell. See the root `README.md`.

This review did not run method C. It needs network access to GitHub and it changes your Claude Code setup.

### 5.6 Check that the install worked

1. Start a session with method A, B or C.
2. Send a prompt, for example `hello`. Wait for the full answer.
3. Type `/handover`. Press Enter.
4. **Expected:** the reply starts with `Handoff copied to the clipboard.`

If the command does not exist, see the table in 6.5.

### 5.7 Change the fixed values

This mod has no settings in `/config`. To change a value, see section 4.

## 6. Validate

To validate means to prove that the mod works as this document says. There are three levels. Do levels 1 and 2 each time you change the code. Do level 3 one time after you install.

| Level | What it proves | Time | Needs an API request |
|-------|----------------|------|----------------------|
| 1. Validate | The files are correct. The engine can read the mod. | Under 1 second | No |
| 2. Test | The logic is correct (goal, offers, handoff, copy). | Under 1 second | No |
| 3. Live check | The mod works in a real session. | 15 minutes or more | Yes (small ones) |

### 6.1 Level 1: validate the files

1. Go to the repository root (see 5.1).
2. Run:

   ```bash
   claude plugin validate mods/handoff
   ```

3. Read the last line of the output.

| Last line | Meaning | Action |
|-----------|---------|--------|
| `✔ Validation passed with warnings` | The mod is correct. | None. This is the expected result. |
| `✔ Validation passed` | The mod is correct. | None. |
| `✘ Validation failed` | The engine refuses the mod. | Read the lines that start with `✘` above the last line. Fix the file that each line names. Run the command again. |

The output can show a `✘` line and still pass. The plugin directory section can report a problem with `✘`. Only the last line gives the verdict.

The expected output contains messages that look like problems. These messages do not block the mod:

| Message | Why you can ignore it |
|---------|----------------------|
| `author: No author information provided` | This message is a note. The mod works without an author. |
| `LICENSE: License missing (LICENSE_MISSING)` | This check applies to the plugin directory. It does not change the verdict. |
| `icon: No icon (ICON_MISSING)` | Same reason. |
| `types ./types/index.d.ts declares on $: nothing (no EngineInterface member)` | This result is correct. The mod adds nothing to `$`. |

The output also lists what the mod uses. Compare the output with this list:

- Hooks: `session.start`, `command.run{command=handover}`, `tool.call`, `session.measure`, `turn.complete`, `prompt.submit`
- Stored values: `handoff.hasOfferedTokens`, `handoff.inventory`, `handoff.lastTurnEnd`, `handoff.pending`
- Engine calls: `$.clock.now`, `$.command.register`, `$.model.fork`, `$.state.get`, `$.state.set`, `$.ui.ask`, `$.ui.copy`, `$.ui.toast`

If the output lists a hook or a call that is not in this list, the code and this document are different. Tell the owner of the mod.

### 6.2 Level 2: run the tests

1. Go to the repository root.
2. Run:

   ```bash
   claude plugin test mods/handoff
   ```

3. **Expected result:** the last lines are `9 pass` and `0 fail`. The time in brackets varies.

   ```text
    9 pass
    0 fail
   Ran 9 tests across 1 file. [0.53s]
   ```

The tests use a fake clock, a fake clipboard and a fake model request. They do not call the API. They do not cost money. Section 6.4 describes each test.

If a test fails, the output shows the test name and the reason. Find the test name in the table in 6.4. The table shows which rule is broken.

### 6.3 Level 3: live check in a session

Do this check one time after you install. It uses the fixed 5-minute cache time. Step 8 is optional. It needs a long session.

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Send a first prompt. Wait for the full answer. | No question appears. |
| 2 | Run `/handover`. | The reply starts with `Handoff copied to the clipboard.` |
| 3 | Paste the clipboard into a text editor. | The text starts with `Continue the work described in this handoff from a previous session.` It has the labels Goal, Progress, Current state, Next steps and Context. |
| 4 | Wait 6 minutes. Send a second prompt. | The question shows: `This session was idle 6 minutes, so its cache has likely gone cold.` |
| 5 | Choose `Continue here`. | Your second prompt is sent in this session. |
| 6 | Wait for the full answer to the second prompt. Wait 6 minutes. Send a third prompt. Choose `Make a handoff`. | Your third prompt is not sent. The reply starts with `Handoff copied to the clipboard.` |
| 7 | Paste the clipboard into a text editor. | The text ends with `Next request:` and your third prompt. |
| 8 | (Optional) Use one session until the context passes 250k tokens. | One toast shows: `Context passed …k tokens. Run /handover, or you'll be asked at your next prompt.` |

In step 4, the idle time counts from the end of the last main reply. This review did not check whether a `/handover` run ends a main reply.

No person has done this check yet.

### 6.4 What each test proves

| Test (in `hooks/register.test.ts`) | Line | Rule it proves |
|-------------------------------------|------|----------------|
| the first prompt is recorded as the goal and sent untouched | 63 | The first prompt is sent unchanged. The request to the model contains `First request: fix the login flow`. |
| /handover copies a handoff built from the session, tools included | 73 | One copy is made. The copy has the summary and no `Next request`. An edited file is shown one time, as edited. The reply says `copied to the clipboard`. |
| /handover falls back to the facts when the fork fails, and prints the text if the copy fails | 90 | With no model answer, the text has the `Goal:` line. With a failed copy, the reply says `Could not copy` and shows the full text. |
| crossing 250k tokens toasts once and asks at the next prompt | 101 | No toast at 100k. One toast at 260k. No second toast at 270k. One question at the next prompt. No second question after you decline. |
| accepting the offer copies a handoff that carries the prompt, and drops it here | 123 | Your prompt is not sent. The copy has the summary and `Next request:` with your prompt. |
| a dismissed question sends the prompt on as typed | 136 | A dismissed question makes no copy. Your prompt is sent unchanged. |
| a prompt after a cold cache is asked about; a warm one is not | 147 | No question after 4 minutes. One question after 7 minutes, with the text `idle 7 minutes`. |
| a subagent finishing does not reset the idle clock | 164 | A subagent reply after 7 minutes does not stop the question. |
| prompts that are not the person's own are never asked about | 176 | A peer prompt, a hidden prompt and `/compact` get no question. All three are sent unchanged. |

The tests do not cover these cases:

- The model request throws an error. The test at line 90 covers a model request that gives no answer.
- An offer when the model request fails.
- The Windows path comparison in `sameFile()`.
- A second prompt after a handoff is made. Section 7 describes this case.

### 6.5 Problems and solutions

| Problem | Cause | Solution |
|---------|-------|----------|
| `claude: command not found` | Claude Code is not installed. Or the terminal cannot find it. | Install Claude Code. Open a new terminal. |
| `claude plugin validate` prints `File not found` | The path is wrong. You are not in the repository root. | Run `pwd`. Go to the repository root with `cd`. Run the command again. |
| `claude plugin validate` ends with `✘ Validation failed` | A file of the mod has an error. | Read the lines that start with `✘` above the last line. Fix the file that each line names. |
| `/handover` does not exist | The mod did not load. The command is added at session start. | Check that the path in the flag or setting is correct. Start a new session. |
| No question at a prompt you expect | The prompt is your first prompt, a slash command, or a prompt that is not typed by you. Or you did not wait for the full answer first. Or the idle time is 5 minutes or less. | Send a normal typed prompt. Wait for the full answer. Wait more than 5 minutes. Send another prompt. |
| No question after the toast | The question shows at your next typed prompt that is not the first. Or the question was already answered. | Send a normal typed prompt. Or run `/handover`. |
| The reply says `Could not copy the handoff.` | The clipboard is not available. | Select the text in the reply. Copy it by hand. |
| The toast says `Handoff failed; your prompt was sent here instead.` | The model request or the copy step threw an error. | Your prompt was sent in this session. Run `/handover` to try again. |
| `/handover` fails with an error and no copy is made | The model request threw an error. The mod has no fallback on this path. | Run `/handover` again. Tell the owner of the mod if it fails again. |

### 6.6 Type check (optional)

A type check finds mistakes in the code types. It needs `tsc`, the TypeScript program. This check was **not run** when this document was written. The review machine has no `tsc` on its path.

`tsconfig.json` extends `./.claude-plugin/types/tsconfig.json`. That folder does not exist in this clone. The commands `claude plugin validate` and `claude plugin test` did not create it during this review.

To run the check, install TypeScript. Load the mod in a session one time. The engine should write the folder `.claude-plugin/types/`. Run `tsc -p mods/handoff`.

**Expected result:** no output and no errors. This result is not verified.

## 7. Known limits

- **Fixed values.** The token limit and the cache time are in the code. They are not settings.
- **Cache time is an estimate.** The mod uses 5 minutes of idle time as the sign of a cold cache. For a 1-hour cache, the question appears too early.
- **One token offer.** `hasOfferedTokens` is never cleared. After you answer the token question, only `/handover` and the cold-cache question remain.
- **A dropped handoff does not reset the idle clock.** After `Make a handoff`, no turn runs, so `lastTurnEnd` keeps its old value. If the next typed prompt also comes more than 5 minutes after that value, the question appears again. A probe in a copy of the mod showed the second question. The repository tests do not cover it.
- **No clean-up.** The mod has no `session.end` hook. The mod does not clear its stored values. This review did not test whether `/clear` or a new session clears them. If they remain, the mod keeps the old goal and the old lists. It saves a goal only when the goal is empty.
- **Persistence is not checked.** This review did not run a live session. It did not check how the stored values survive a reload.
- **Five tools have their own lists.** The mod records `Read`, `Edit`, `Write`, `WebFetch` and `Skill`. Other tools only add to the count. A file that changes through `Bash` is not listed.
- **Tool counts include every call the hook gets.** The `tool.call` hook does not check `agentId`. A subagent tool call is counted if the engine sends it to the hook. The test harness models the question as an `AskUserQuestion` call, so the mod's own question is counted there. A live session did not confirm either case.
- **Windows paths.** The hook runtime has no platform flag, so `sameFile()` keys on path shape. `sameFile()` is used only to remove edited files from `Files read`. `addUnique()` does not fold paths. So one Windows file written in two spellings appears twice in `Files read`. POSIX paths compare exactly, so `/Repo/x.ts` and `/repo/x.ts` are two entries. A probe in a `/tmp` copy of the mod confirmed both results. No repository test covers the Windows case. This review did not run on Windows.
- **Model request errors.** `buildHandoff()` has no `catch`. If `$.model.fork` throws, `/handover` fails and no copy is made. In a probe with a fake error, the test harness raised a `HooksError`. The live engine was not checked. The repository tests do not cover this path.
- **Summary length.** The prompt asks for under 400 words. The code does not check the length.
- **List size.** Each list holds the last 50 items. Older items are removed. The tool counts have no limit.
- **Cost of the summary.** The model request uses the conversation as the main thread last sent it. If the cache is cold, this request costs full price one time.
- **Summary quality.** The model writes the summary from the conversation and the facts. The summary can miss a detail. Read the handoff before you use it.
- **Dismiss counts as a choice.** If you close the question without an answer, the mod uses `Continue here`. The token offer does not ask again. A sent prompt starts a turn, and that turn sets `lastTurnEnd` again. So a dismissed cold-cache question does not repeat in normal use.
- **Plugin directory.** The plugin directory refuses a submission because the mod has no LICENSE file and no `license` field. `claude plugin validate` lists this under a separate `✘` heading, and the verdict still reads `passed with warnings`. The validator also warns that the mod has no icon. The repository's own validation does not change this.

## 8. Glossary

| Term | Meaning |
|------|---------|
| Handoff | A text that tells a fresh chat what the session did and what to do next. |
| Fresh chat | A new session that has no conversation. Start one with `/clear` or a new session. |
| Cache | The stored copy of the conversation. The API reads the copy at a lower price. |
| TTL | Time to live. The time the API keeps the cache after a request. |
| Cold cache | A cache that has expired. The next reply costs full price. |
| Offer | The question "Move to a fresh chat with a handoff?". |
| Inventory | The goal, the lists of files, links and skills, and the tool counts that the mod records. |
| Goal | The first own prompt, saved as the first 2000 characters. |
| Pending | The stored value that says a token question waits for your next prompt. |
| Composer | The text box where you type a prompt. |
| Peer prompt | A prompt from another source, not typed by you in the composer. |
| Hidden prompt | A prompt the system marks as meta. It does not come from your typing. |
| Subagent | A helper run by the model. Its turns carry an `agentId`. |
| Toast | A short message that shows on the screen and then goes away. |
| Turn | One model run, from your prompt to the final answer. |
| Fork | A request that uses the conversation as the main thread last sent it. |
| Drop | Do not send your prompt to the model. The mod shows a message instead. |
