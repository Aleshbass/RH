/**
 * Legal documents (Terms, Privacy, Payment, Booking) as data, so one page component renders
 * them all and the published wording stays exactly as approved. Inline `**bold**` is supported.
 * When the wording changes, publish a new version and effective date (see lib/policies.ts).
 */

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] };

export type LegalSection = { title: string; blocks: LegalBlock[] };

export type LegalDocument = {
  title: string;
  effectiveDate: string;
  version: string;
  intro: LegalBlock[];
  sections: LegalSection[];
  /** Closing lines after the last section (contact, "see also") */
  outro?: LegalBlock[];
};

export const p = (text: string): LegalBlock => ({ type: 'p', text });
export const ul = (...items: string[]): LegalBlock => ({ type: 'ul', items });
export const ol = (...items: string[]): LegalBlock => ({ type: 'ol', items });
export const table = (head: string[], rows: string[][]): LegalBlock => ({ type: 'table', head, rows });

/** Plain text of a document, for hashing the exact wording someone accepted. */
export function legalPlainText(doc: Pick<LegalDocument, 'intro' | 'sections'>): string {
  const blockText = (block: LegalBlock) =>
    block.type === 'p'
      ? block.text
      : block.type === 'table'
        ? [block.head.join(' | '), ...block.rows.map((row) => row.join(' | '))].join('\n')
        : block.items.join('\n');
  return [
    ...doc.intro.map(blockText),
    ...doc.sections.map((section) => [section.title, ...section.blocks.map(blockText)].join('\n')),
  ].join('\n\n');
}
