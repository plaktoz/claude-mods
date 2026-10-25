# Technical profile

Used by `ste-docs` (see `SKILL.md`, section 1). Use this profile when the subject is code or a tool: a mod, skill, agent, hook, script or library. The rules in `SKILL.md` also apply. This file adds the fixed layout, the code checks and the report items.

Worked examples in this repo: `mods/cache-warm/README.md` and `mods/handoff/README.md`. Read them before the first use. Copy their structure. Do not copy their facts.

## 1. Inputs

- Read every source file that defines behavior: code, tests, manifests, type files and config. Do not write from memory.
- If the subject has a validate or test command, run it. Quote its real output. Copy test names and counts exactly.

## 2. Fixed layout

Use eight sections, in this order, with these numbers:

| No. | Section | Content |
|-----|---------|---------|
| 1 | Purpose | What the subject does, and the problem it solves. |
| 2 | Where to find the code | A table of items, the file for each item, and the line number. |
| 3 | How it works | Flows, states, decisions and stored values. Subsections are named by topic. |
| 4 | Settings | Each setting or fixed constant, with its value and effect. |
| 5 | Install | Before you start, the install methods, the install check, and changing settings. |
| 6 | Validate | The validation levels, the expected results, what each test proves, and problems and solutions. |
| 7 | Known limits | Real limits found in the code. |
| 8 | Glossary | Each term that the document uses, with one meaning. |

Keep a section that does not apply. Write one sentence that says why, for example "This subject has no settings." Do not delete the section.

Sections 5 and 6 follow the pattern in the worked examples. Adapt the names to the subject. Keep the order.

## 3. Facts and line numbers

- Check every file path, function name and line number against the source. Use `grep -n` to find each name.
- Give a file and line for each item in section 2.
- Do not state a behavior that the code does not show.
- Copy test names, test counts and command output exactly from the real run.
- List every limit that the code shows, including the cases the code does not handle.

## 4. Extra checks

Run these checks too. They extend the checks in `SKILL.md`, section 7. Report the real output.

1. Run the subject's validate command and test command, if it has them. Quote the last lines.
2. Check each cited line number. Confirm that the name appears on that line.

## 5. Extra report items

- The real output of the validate and test commands.
- Each cited line number that you could not check, and why.
