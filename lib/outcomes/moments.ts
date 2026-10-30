/**
 * The moments Rehabify asks a patient how they are (convex/outcomes.ts), and the wording each one
 * uses. Plain TypeScript: shared by Convex, the /o/<token> page and the dashboards.
 */

export type OutcomeMoment = 'intake' | 'pre_session' | 'post_session' | 'check_in' | 'discharge'

export const MOMENT_LABEL: Record<OutcomeMoment, string> = {
  intake: 'Starting point',
  pre_session: 'Before a session',
  post_session: 'After a session',
  check_in: 'Check-in',
  discharge: 'Final scores',
}

/** What the patient is asked, in order. Pain is always first and always required. */
export type OutcomeQuestion = 'pain' | 'function' | 'goal' | 'global' | 'rating' | 'feedback'

export const MOMENT_QUESTIONS: Record<OutcomeMoment, OutcomeQuestion[]> = {
  intake: ['pain', 'function', 'goal'],
  pre_session: ['pain'],
  post_session: ['pain'],
  check_in: ['pain', 'function'],
  discharge: ['pain', 'function', 'goal', 'global', 'rating', 'feedback'],
}

/** "Compared with when you started": a 7-point global rating of change, stored -3..3. */
export const GLOBAL_CHANGE: { value: number; label: string }[] = [
  { value: 3, label: 'Very much better' },
  { value: 2, label: 'Much better' },
  { value: 1, label: 'A little better' },
  { value: 0, label: 'About the same' },
  { value: -1, label: 'A little worse' },
  { value: -2, label: 'Much worse' },
  { value: -3, label: 'Very much worse' },
]

export function globalChangeLabel(value: number | null | undefined) {
  return GLOBAL_CHANGE.find((g) => g.value === value)?.label ?? null
}

/**
 * The words the patient agrees to when they let their feedback be shared. Stored with the answer
 * by version, so a later change of wording never stretches an older consent.
 */
export const SHARE_CONSENT_VERSION = '2026-10-29'
export const SHARE_CONSENT_TEXT =
  'Rehabify and my physiotherapist may share my words, with my first name and area only, to show others what physiotherapy can do. I can take this back at any time.'

/** How long a link stays open. */
export const CHECK_LINK_DAYS: Record<OutcomeMoment, number> = {
  intake: 7,
  pre_session: 1,
  post_session: 2,
  check_in: 4,
  discharge: 21,
}

/** Email and phone-notification wording for each automatic ask. */
export function momentMessage(moment: OutcomeMoment, physioName: string) {
  switch (moment) {
    case 'intake':
      return {
        subject: `Before you start with ${physioName}: 1 minute`,
        heading: 'Where are you starting from?',
        paragraphs: [
          `${physioName} would like to know how you are before treatment starts, so you can both see your progress week by week.`,
          'Three quick questions. It takes under a minute and you don’t need to sign in.',
        ],
        button: 'Answer 3 quick questions',
        push: { title: 'Where are you starting from?', body: `3 quick questions for ${physioName}. Under a minute.` },
      }
    case 'pre_session':
      return {
        subject: 'Your session is soon. How is the pain right now?',
        heading: 'Quick check before your session',
        paragraphs: ['One tap: how is your pain right now? Your physio will see it before you start.'],
        button: 'Rate my pain',
        push: { title: 'How is the pain right now?', body: 'One tap before your session.' },
      }
    case 'post_session':
      return {
        subject: 'How is the pain after your session?',
        heading: 'How are you after today’s session?',
        paragraphs: [`One tap: how is your pain now? ${physioName} uses it to see what’s working.`],
        button: 'Rate my pain',
        push: { title: 'How is the pain now?', body: 'One tap after today’s session.' },
      }
    case 'check_in':
      return {
        subject: 'How has your week been?',
        heading: 'How are you getting on?',
        paragraphs: [`Two quick questions so ${physioName} can see how you’re doing between sessions.`],
        button: 'Answer 2 quick questions',
        push: { title: 'How has your week been?', body: `Two quick questions for ${physioName}.` },
      }
    case 'discharge':
      return {
        subject: `Your final scores for ${physioName}`,
        heading: 'How are you now?',
        paragraphs: [
          'A few questions to see how far you’ve come since you started, and to tell us how your care was.',
        ],
        button: 'Share how I’m doing',
        push: { title: 'How are you now?', body: 'Your final scores, and how your care was. 2 minutes.' },
      }
  }
}

/**
 * The patient's own words, offered as quotes for a feedback card: the whole text when it's short
 * enough, and each sentence on its own. Never reworded, only chosen.
 */
export function quoteOptions(text: string, max = 200) {
  const whole = text.trim().replace(/\s+/g, ' ')
  const sentences = whole.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 12 && s.length <= max)
  const options = whole.length <= max ? [whole, ...sentences.filter((s) => s !== whole)] : sentences
  return [...new Set(options)].slice(0, 4)
}
