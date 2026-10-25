---
name: ste-docs
description: Write a document about one subject in controlled plain English (ASD-STE100 style) with diagrams, as a Markdown file and a matching HTML file. Has a technical profile (fixed 8-section layout) for a mod, skill, agent, hook or other code. Use when asked to document a subject in this style.
---

# ste-docs

Writes one document about one subject. The output is two files in the subject's folder: a `.md` file and a matching `.html` file. The two files have the same content, the same headings and the same diagrams.

The subject decides the content. The writing rules, the diagram rules and the checks stay the same for every subject. A profile adds a layout and extra checks for one kind of subject.

## 1. Profiles

Choose the profile from the subject:

| Profile | Use for | File |
|---------|---------|------|
| Technical | A mod, skill, agent, hook, script or library. Any subject that is code or a tool. | `technical.md` in this folder |
| General | Any other subject. For example a guide, a policy or a proposal. | None. Use this file only. |

- For the technical profile, read `technical.md` before you write. It sets the fixed layout, the file names (`README.md` and `README.html`) and the code checks.
- For the general profile, agree the outline with the user before you write. Name the files after the document, in the folder the user names. Use `README.md` and `README.html` only if the document is the README of a folder.
- If the profile is not clear, ask the user. Do not guess.

## 2. Inputs

- The subject folder, or the file that the user names. Ask only if the subject cannot be found.
- Read every source that defines the content. Do not write from memory.

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

Use a glossary for every domain term. Define each term once.

## 4. Diagrams

- Draw a diagram only when a mechanism is hard to follow in text. Good cases: a flow with branches, a set of states, and a sequence of calls between parts. Do not add decoration.
- Choose the diagram type from the content:
  - Flowchart for decisions and flows.
  - State diagram for states and transitions.
  - Sequence diagram for calls between parts.
- Each diagram appears in both files, with the same nodes and labels.
  - The `.md` file: a Mermaid code fence.
  - The `.html` file: an inline SVG, hand-drawn to match the Mermaid.
- A picture that has no Mermaid form must be redrawn as Mermaid, or left out of both files. Do not put it in one file only.
- Put each diagram under the section it explains. Number the figures in order: `Figure 1.`, `Figure 2.` and so on.
- Highlight at most one path per diagram with the `-hot` classes. The highlighted path is the one the reader must notice.
- Each SVG needs:
  - `role="img"`.
  - An `aria-label` that describes the flow in full sentences.
  - A `<figcaption>` under the figure.
  - The CSS classes from the worked example: `node`, `node-hot`, `edge`, `edge-hot`, `edge-dash`, `lbl`, `lbl-b`, `lbl-m`, `lbl-hot`, and the arrow marker classes.
  - No hard-coded colors. The theme must control all colors.

## 5. The HTML file

- Always write the `.html` file.
- Copy the `<head>` and the `<style>` block from `mods/cache-warm/README.html`. Do not change the theme tokens. They support light and dark themes. Change only the `<title>`.
- Give every heading an `id`. Link the table of contents to those ids.
- Use the same heading text, the same tables and the same order as the `.md` file.

## 6. Honesty

- Say what was not run. If a check was not run, write that in the document.
- For a step that only a person can do, write: "No person has done this check yet."
- Write "passed" only when a command printed it.
- Do not state a fact that the sources do not show.

## 7. Verification (required before the report)

Run each check. Report the real output. For the technical profile, also run the checks in `technical.md`.

1. Parse each `<svg>` block with `python3 -I` and `xml.dom.minidom`. Check that the HTML tags are balanced with `html.parser`.
2. For each `href="#name"` in the HTML, check that an `id="name"` exists.
3. Count the `^## ` and `^### ` headings in the `.md` file. Compare the counts with `<h2` and `<h3` in the `.html` file. Compare the heading text too.
4. Search both files for each banned word, as a whole word, case-insensitive. Expect zero hits.
5. Count the Mermaid blocks in the `.md` file and the `<svg>` blocks in the `.html` file. The counts must match.
6. Render the page with headless Chrome:

   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
     --screenshot=/tmp/<name>-readme.png --window-size=1000,<height> "file://<absolute path>/<file>.html"
   ```

   Use a window height that covers the full page. Crop the image with `sips -c <height> <width> --cropOffset <top> 0` and view each part. Check that no label overflows its box and that every figure is complete.

## 8. Report

Report these items:

- The paths of the two files.
- The real output of each check in section 7.
- Each check that was not run, and why.
- Open questions for the user.

Do not commit unless the user asks.
