/**
 * The blog's SEO checklist. The editor shows every check as the writer types; Convex runs the
 * same function before a post is submitted or published and refuses when any "error" is left.
 * Only imports ./content, so it bundles into Convex too.
 */
import {
  bodyImages,
  bodyLinks,
  countWords,
  firstParagraph,
  nodeText,
  plainText,
  walk,
  SLUG_PATTERN,
  type BlogNode,
} from './content'

export const SEO_LIMITS = {
  metaTitleMin: 30,
  metaTitleMax: 60,
  metaDescriptionMin: 120,
  metaDescriptionMax: 160,
  excerptMin: 50,
  excerptMax: 300,
  titleMax: 110,
  minWordsToPublish: 150,
  goodWords: 600,
  altMin: 5,
  altMax: 140,
}

export type SeoInput = {
  title: string
  slug: string
  excerpt: string
  metaTitle?: string
  metaDescription?: string
  focusKeyword?: string
  cover?: { url: string; alt: string } | null
  doc: BlogNode
  /** Another post already uses this title (checked on the server) */
  duplicateTitle?: boolean
}

export type SeoLevel = 'error' | 'warning' | 'good'
export type SeoGroup = 'basics' | 'keyword' | 'content' | 'links' | 'readability'
export type SeoCheck = { id: string; group: SeoGroup; level: SeoLevel; label: string; detail?: string }

export type SeoReport = {
  checks: SeoCheck[]
  errors: SeoCheck[]
  warnings: SeoCheck[]
  /** 0 to 100 */
  score: number
  stats: {
    words: number
    sentences: number
    avgSentenceWords: number
    readingEase: number
    internalLinks: number
    externalLinks: number
    images: number
    keywordCount: number
    keywordDensity: number
  }
  /** What Google and link previews will show */
  effective: { metaTitle: string; metaDescription: string }
}

/** The title search engines see: the SEO title, or the post title when none is set. */
export function effectiveMetaTitle(input: { title: string; metaTitle?: string }) {
  return (input.metaTitle ?? '').trim() || input.title.trim()
}

/** The search snippet: the meta description, or the excerpt when none is set. */
export function effectiveMetaDescription(input: { excerpt: string; metaDescription?: string }) {
  return (input.metaDescription ?? '').trim() || input.excerpt.trim()
}

const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function containsPhrase(text: string, phrase: string) {
  const p = normalise(phrase)
  return p.length > 0 && ` ${normalise(text)} `.includes(` ${p} `)
}

function countPhrase(text: string, phrase: string) {
  const p = normalise(phrase)
  if (!p) return 0
  const hay = ` ${normalise(text)} `
  let count = 0
  let from = 0
  for (;;) {
    const at = hay.indexOf(` ${p} `, from)
    if (at === -1) break
    count += 1
    from = at + p.length + 1
  }
  return count
}

function syllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

function sentencesOf(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => countWords(s) > 0)
}

export function analyzeSeo(input: SeoInput): SeoReport {
  const L = SEO_LIMITS
  const checks: SeoCheck[] = []
  const add = (id: string, group: SeoGroup, level: SeoLevel, label: string, detail?: string) =>
    checks.push({ id, group, level, label, detail })

  const title = input.title.trim()
  const slug = input.slug.trim()
  const excerpt = input.excerpt.trim()
  const metaTitle = effectiveMetaTitle(input)
  const metaDescription = effectiveMetaDescription(input)
  const keyword = (input.focusKeyword ?? '').trim()
  const text = plainText(input.doc)
  const words = countWords(text)
  const sentences = sentencesOf(text)
  const images = bodyImages(input.doc)
  const links = bodyLinks(input.doc)
  const internalLinks = links.filter((l) => l.internal).length
  const externalLinks = links.length - internalLinks

  // ── Basics ────────────────────────────────────────────────────────────────
  if (title.length < 10) add('title', 'basics', 'error', 'Add a title', 'At least 10 characters.')
  else if (title.length > L.titleMax) add('title', 'basics', 'error', 'Shorten the title', `${title.length} characters; keep it under ${L.titleMax}.`)
  else add('title', 'basics', 'good', 'Title is set')

  if (!slug) add('slug', 'basics', 'error', 'Add a web address (slug)')
  else if (!SLUG_PATTERN.test(slug) || slug.length < 3 || slug.length > 80)
    add('slug', 'basics', 'error', 'Fix the web address', 'Lowercase letters, numbers and hyphens only, 3 to 80 characters.')
  else if (slug.split('-').length > 8) add('slug', 'basics', 'warning', 'Web address is long', 'Short addresses (3 to 6 words) read better in search results.')
  else add('slug', 'basics', 'good', 'Web address is clean')

  if (metaTitle.length < L.metaTitleMin)
    add('metaTitle', 'basics', 'error', 'SEO title is too short', `${metaTitle.length} characters; aim for ${L.metaTitleMin} to ${L.metaTitleMax}.`)
  else if (metaTitle.length > L.metaTitleMax)
    add('metaTitle', 'basics', 'error', 'SEO title is too long', `${metaTitle.length} characters; Google cuts it off after about ${L.metaTitleMax}.`)
  else add('metaTitle', 'basics', 'good', `SEO title is ${metaTitle.length} characters`)

  if (metaDescription.length < L.metaDescriptionMin)
    add('metaDescription', 'basics', 'error', 'Meta description is too short', `${metaDescription.length} characters; aim for ${L.metaDescriptionMin} to ${L.metaDescriptionMax}.`)
  else if (metaDescription.length > L.metaDescriptionMax)
    add('metaDescription', 'basics', 'error', 'Meta description is too long', `${metaDescription.length} characters; Google cuts it off after about ${L.metaDescriptionMax}.`)
  else add('metaDescription', 'basics', 'good', `Meta description is ${metaDescription.length} characters`)

  if (excerpt.length < L.excerptMin) add('excerpt', 'basics', 'error', 'Add a summary', `The summary shows on blog cards; at least ${L.excerptMin} characters.`)
  else if (excerpt.length > L.excerptMax) add('excerpt', 'basics', 'error', 'Shorten the summary', `Keep it under ${L.excerptMax} characters.`)
  else add('excerpt', 'basics', 'good', 'Summary is set')

  if (!input.cover?.url) add('cover', 'basics', 'error', 'Add a cover image')
  else if (input.cover.alt.trim().length < L.altMin) add('cover', 'basics', 'error', 'Describe the cover image', 'Add alt text saying what the picture shows.')
  else add('cover', 'basics', 'good', 'Cover image has alt text')

  if (input.duplicateTitle) add('duplicate', 'basics', 'warning', 'Another post has this title', 'Two posts with one title compete with each other in search.')

  // ── Content ───────────────────────────────────────────────────────────────
  if (words < L.minWordsToPublish)
    add('length', 'content', 'error', 'The post is too short', `${words} words; write at least ${L.minWordsToPublish}.`)
  else if (words < L.goodWords)
    add('length', 'content', 'warning', 'The post is short', `${words} words; posts over ${L.goodWords} tend to rank better.`)
  else add('length', 'content', 'good', `${words.toLocaleString('en-NG')} words`)

  const missingAlt = images.filter((img) => img.alt.length < L.altMin).length
  if (missingAlt > 0)
    add('imageAlt', 'content', 'error', `${missingAlt} image${missingAlt === 1 ? '' : 's'} without alt text`, 'Click each image and describe what it shows.')
  else if (images.length > 0) add('imageAlt', 'content', 'good', 'Every image has alt text')
  else add('imageAlt', 'content', 'warning', 'No images in the post', 'A picture or two keeps people reading.')

  const headings: { level: number; text: string }[] = []
  walk(input.doc, (node) => {
    if (node.type === 'heading') headings.push({ level: Number(node.attrs?.level) || 2, text: nodeText(node).trim() })
  })
  const filled = headings.filter((h) => h.text)
  let skipped: string | null = null
  let previous = 1
  for (const h of filled) {
    if (h.level === 1) skipped = 'The page title is the only H1; use Heading 2 for sections.'
    else if (h.level > previous + 1) skipped = `"${h.text.slice(0, 40)}" jumps to Heading ${h.level}; use Heading ${previous + 1} first.`
    if (skipped) break
    previous = h.level
  }
  if (skipped) add('headings', 'content', 'error', 'Fix the heading order', skipped)
  else if (filled.length === 0 && words >= 300) add('headings', 'content', 'warning', 'Add section headings', 'Break the post up with Heading 2s so people (and Google) can scan it.')
  else if (filled.length > 0) add('headings', 'content', 'good', 'Headings are in order')

  // ── Focus keyword ─────────────────────────────────────────────────────────
  const keywordCount = keyword ? countPhrase(text, keyword) : 0
  const keywordWords = keyword ? countWords(keyword) : 0
  const keywordDensity = words > 0 && keyword ? (keywordCount * keywordWords * 100) / words : 0
  if (!keyword) {
    add('keyword', 'keyword', 'warning', 'Choose a focus keyword', 'The phrase people would type into Google to find this post.')
  } else {
    const inTitle = containsPhrase(metaTitle, keyword) || containsPhrase(title, keyword)
    add('kwTitle', 'keyword', inTitle ? 'good' : 'warning', inTitle ? 'Keyword is in the title' : 'Put the keyword in the title')
    const slugWords = new Set(slug.split('-'))
    const inSlug = normalise(keyword)
      .split(' ')
      .filter((w) => w.length > 2)
      .every((w) => slugWords.has(w))
    add('kwSlug', 'keyword', inSlug ? 'good' : 'warning', inSlug ? 'Keyword is in the web address' : 'Put the keyword in the web address')
    const inMeta = containsPhrase(metaDescription, keyword)
    add('kwMeta', 'keyword', inMeta ? 'good' : 'warning', inMeta ? 'Keyword is in the meta description' : 'Put the keyword in the meta description')
    const inIntro = containsPhrase(firstParagraph(input.doc), keyword)
    add('kwIntro', 'keyword', inIntro ? 'good' : 'warning', inIntro ? 'Keyword is in the first paragraph' : 'Use the keyword in the first paragraph')
    const inHeading = filled.some((h) => containsPhrase(h.text, keyword))
    add('kwHeading', 'keyword', inHeading ? 'good' : 'warning', inHeading ? 'Keyword is in a heading' : 'Use the keyword in at least one heading')
    if (keywordCount === 0) add('kwBody', 'keyword', 'warning', 'The keyword never appears in the text')
    else if (keywordDensity > 2.5)
      add('kwBody', 'keyword', 'warning', 'The keyword is used too often', `${keywordCount} times (${keywordDensity.toFixed(1)}%); it reads as stuffing above 2.5%.`)
    else add('kwBody', 'keyword', 'good', `Keyword used ${keywordCount} time${keywordCount === 1 ? '' : 's'}`)
  }

  // ── Links ─────────────────────────────────────────────────────────────────
  if (internalLinks < 2)
    add('internal', 'links', 'warning', internalLinks === 0 ? 'No links to our own pages' : 'Only one link to our own pages', 'Link to at least two other pages or posts on the site.')
  else add('internal', 'links', 'good', `${internalLinks} links to our own pages`)
  if (externalLinks < 1) add('external', 'links', 'warning', 'No source links', 'Health claims rank better (and are safer) with a link to a trusted source.')
  else add('external', 'links', 'good', `${externalLinks} source link${externalLinks === 1 ? '' : 's'}`)

  // ── Readability ───────────────────────────────────────────────────────────
  const avgSentenceWords = sentences.length ? words / sentences.length : 0
  const syllableCount = (text.match(/[A-Za-z]+/g) ?? []).reduce((sum, w) => sum + syllables(w), 0)
  const readingEase =
    words > 0 && sentences.length > 0 ? Math.max(0, Math.min(100, 206.835 - 1.015 * avgSentenceWords - 84.6 * (syllableCount / words))) : 0
  if (words >= 100) {
    if (avgSentenceWords > 22) add('sentences', 'readability', 'warning', 'Sentences are long', `${avgSentenceWords.toFixed(0)} words on average; aim for under 20.`)
    else add('sentences', 'readability', 'good', 'Sentences are a good length')
    if (readingEase < 50) add('ease', 'readability', 'warning', 'Hard to read', 'Use shorter words and sentences; write the way you would explain it to a patient.')
    else add('ease', 'readability', 'good', 'Easy to read')
    let longParagraphs = 0
    walk(input.doc, (node) => {
      if (node.type === 'paragraph' && countWords(nodeText(node)) > 150) longParagraphs += 1
    })
    if (longParagraphs > 0)
      add('paragraphs', 'readability', 'warning', `${longParagraphs} very long paragraph${longParagraphs === 1 ? '' : 's'}`, 'Split paragraphs over 150 words.')
    else add('paragraphs', 'readability', 'good', 'Paragraphs are short')
  }

  const errors = checks.filter((c) => c.level === 'error')
  const warnings = checks.filter((c) => c.level === 'warning')
  const good = checks.length - errors.length - warnings.length
  // Errors count double: a post with one blocker never looks nearly done
  const score = checks.length ? Math.round((good * 100) / (good + warnings.length + errors.length * 2)) : 0

  return {
    checks,
    errors,
    warnings,
    score,
    stats: {
      words,
      sentences: sentences.length,
      avgSentenceWords,
      readingEase,
      internalLinks,
      externalLinks,
      images: images.length,
      keywordCount,
      keywordDensity,
    },
    effective: { metaTitle, metaDescription },
  }
}

/** The <title> of a post: the SEO title, with the brand added when there is room for it. */
export function documentTitle(metaTitle: string, brand = 'Physio Around Me') {
  const withBrand = `${metaTitle} | ${brand}`
  return withBrand.length <= 65 ? withBrand : metaTitle
}
