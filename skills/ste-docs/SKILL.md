---
name: ste-docs
description: Write a technical document about any subject in controlled plain English (ASD-STE100 style) with diagrams, as a README.md and a matching README.html. Use when asked to document a mod, skill, agent, hook, library doc or other subject in this style.
---

# ste-docs

Writes one document about one subject. The output is two files in the subject's folder: `README.md` and `README.html`. The two files have the same content, the same headings and the same diagrams.

The subject decides the content. The layout, the writing rules and the checks stay the same for every subject.

Worked examples in this repo: `mods/cache-warm/README.md` and `mods/handoff/README.md`. Read them before the first use. Copy their structure. Do not copy their facts.

## 1. Inputs

- The subject folder, or the file that the user names. Ask only if the subject cannot be found.
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

## 3. Writing rules (controlled English)

1. One instruction or fact per sentence.
2. Keep each sentence to 20 words or fewer.
3. Use the active voice. Write subject, verb, object.
4. Write steps in the imperative: "Run the command." Do not write "You should run the command."
5. Use the present tense.
6. Use one word for one meaning. Use the same term everywhere. Do not use a synonym for a term already defined.
7. Use `must` for a requirement. Use `can` for an ability. Use `do not` for a prohibition.
8. Do not use idioms, contractions, or "etc.".
9. Write numbers with digits and a unit. Example: `5 minutes`, `250,000 tokens`.
10. Write each list item in the same grammatical form.
11. Check every word against `banned-words.md` in this folder. Replace each hit with the word in its right-hand column. Then reread the sentence.

Use the glossary for every domain term. Define each term once.

## 4. Diagrams

- Draw a diagram only when a mechanism is hard to follow in text. Good cases: a flow with branches, a set of states, and a sequence of calls between parts. Do not add decoration.
- Choose the diagram type from the content:
  - Flowchart for decisions and flows.
  - State diagram for states and transitions.
  - Sequence diagram for calls between parts.
- Each diagram appears in both files, with the same nodes and labels.
  - `README.md`: a Mermaid code fence.
  - `README.html`: an inline SVG, hand-drawn to match the Mermaid.
- Put each diagram under the section it explains. Number the figures in order: `Figure 1.`, `Figure 2.` and so on.
- Highlight at most one path per diagram with the `-hot` classes. The highlighted path is the one the reader must notice.
- Each SVG needs:
  - `role="img"`.
  - An `aria-label` that describes the flow in full sentences.
  - A `<figcaption>` under the figure.
  - The CSS classes from the worked example: `node`, `node-hot`, `edge`, `edge-hot`, `edge-dash`, `lbl`, `lbl-b`, `lbl-m`, `lbl-hot`, and the arrow marker classes.
  - No hard-coded colors. The theme must control all colors.

## 5. The HTML file

- Always write `README.html`.
- Copy the `<head>` and the `<style>` block from `mods/cache-warm/README.html`. Do not change the theme tokens. They support light and dark themes.
- Give every heading an `id`. Link the table of contents to those ids.
- Use the same heading text, the same tables and the same order as `README.md`.

## 6. Facts and line numbers

- Check every file path, function name and line number against the source. Use `grep -n` to find each name.
- Give a file and line for each item in section 2.
- Do not state a behavior that the code does not show.
- Copy test names, test counts and command output exactly from the real run.

## 7. Honesty

- Say what was not run. If a check was not run, write that in the document.
- For a step that only a person can do, write: "No person has done this check yet."
- Write "passed" only when a command printed it.
- List every limit that the code shows, including the cases the code does not handle.

## 8. Verification (required before the report)

Run each check. Report the real output.

1. Parse each `<svg>` block with `python3 -I` and `xml.dom.minidom`. Check that the HTML tags are balanced with `html.parser`.
2. For each `href="#name"` in the HTML, check that an `id="name"` exists.
3. Count the `^## ` and `^### ` headings in `README.md`. Compare the counts with `<h2` and `<h3` in `README.html`. Compare the heading text too.
4. Run the subject's validate command and test command, if it has them. Quote the last lines.
5. Search both files for each banned word, as a whole word, case-insensitive. Expect zero hits.
6. Check each cited line number. Confirm that the name appears on that line.
7. Render the page with headless Chrome:

   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
     --screenshot=/tmp/<name>-readme.png --window-size=1000,<height> "file://<absolute path>/README.html"
   ```

   Use a window height that covers the full page. Crop the image with `sips -c <height> <width> --cropOffset <top> 0` and view each part. Check that no label overflows its box and that every figure is complete.

## 9. Report

Report these items:

- The paths of the two files.
- The real output of each check in section 8.
- Each check that was not run, and why.
- Open questions for the user.

Do not commit unless the user asks.
