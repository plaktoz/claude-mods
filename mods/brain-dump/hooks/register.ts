import type { EngineInterfaceBuilt, Register } from 'claude-code'

// Prompts shorter than this are sent as typed.
const MIN_CHARS = 400
const MAX_QUESTIONS = 3

const QUESTIONS_SYSTEM = `You help turn a rough prompt into a clear one.
Ask up to ${MAX_QUESTIONS} clarifying questions, only where the answer would change the result.
For each question give 2 to 4 short options the person is likely to pick.
Reply with a JSON array of {"question": string, "options": string[]} and nothing else.
Reply [] when the prompt is already clear.`

const REFORMULATE_SYSTEM = `You rewrite a rough prompt as a clear, structured prompt for Claude.
Use these four sections, in this order, each with its label:

Task: what to do, in one or two sentences.
Why: the goal or context behind it.
Guardrails: constraints, things to avoid, and assumptions made.
Definition of done: how to tell the work is complete.

Use only facts from the prompt and the answers given. Write "Unspecified" where something is missing.
Reply with the rewritten prompt only.`

export const SEND_IT = 'Send it'
export const SEND_ORIGINAL = 'Send my original'

type Question = { question: string; options: string[] }
type Answer = { question: string; answer: string }
type Submission = { text: string; origin?: { kind: string }; command?: unknown; isMeta?: boolean }
type Engine = EngineInterfaceBuilt

const isQuestion = (value: unknown): value is Question =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Question).question === 'string' &&
  Array.isArray((value as Question).options)

export const parseQuestions = (reply: string): Question[] => {
  const match = reply.match(/\[[\s\S]*\]/)
  if (!match) return []

  try {
    const parsed: unknown = JSON.parse(match[0])
    return Array.isArray(parsed) ? parsed.filter(isQuestion).slice(0, MAX_QUESTIONS) : []
  } catch {
    return []
  }
}

const draftInput = (text: string, answers: Answer[]) =>
  [
    `Rough prompt:\n${text}`,
    answers.length
      ? `Answers:\n${answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n')}`
      : 'Answers: none',
  ].join('\n\n')

// Only the person's own typed prompts are refined: not commands, not
// engine-made messages, not notifications or peers, and not short prompts.
export const isRefinable = (e: Submission) =>
  e.origin?.kind === 'composer' && !e.command && !e.isMeta && e.text.length >= MIN_CHARS

// Returns a structured draft of the prompt, or undefined to send it as typed.
const draftFrom = async ($: Engine, text: string): Promise<string | undefined> => {
  try {
    const verdict = await $.model.classify(text, ['clear', 'messy'], { model: 'haiku' })
    if (verdict !== 'messy') return undefined

    const questionReply = await $.model.complete({
      model: 'haiku',
      system: QUESTIONS_SYSTEM,
      prompt: text,
      maxTokens: 800,
      effort: 'low',
      timeoutMs: 20000,
    })
    const questions = questionReply.isAnswered ? parseQuestions(questionReply.text) : []

    const answers: Answer[] = []
    for (const { question, options } of questions) {
      const answer = await $.ui.ask(question, { options, header: 'Clarify' })
      answers.push({ question, answer })
    }

    const rewrite = await $.model.complete({
      model: 'sonnet',
      system: REFORMULATE_SYSTEM,
      prompt: draftInput(text, answers),
      maxTokens: 1500,
      timeoutMs: 60000,
    })

    return rewrite.isAnswered ? rewrite.text.trim() : undefined
  } catch {
    // A dismissed question or a failed request leaves the prompt as typed.
    return undefined
  }
}

// True when the person chose the draft. A dismissed dialog keeps the original.
const confirmDraft = async ($: Engine, draft: string): Promise<boolean> => {
  $.ui.log(draft)

  try {
    const choice = await $.ui.ask('Send the structured prompt?', {
      options: [SEND_IT, SEND_ORIGINAL],
      header: 'Brain Dump',
    })

    return choice === SEND_IT
  } catch {
    return false
  }
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (!isRefinable(e)) return next(e)

    const draft = await draftFrom($, e.text)
    if (draft === undefined) return next(e)

    return next((await confirmDraft($, draft)) ? { ...e, text: draft } : e)
  })
}
