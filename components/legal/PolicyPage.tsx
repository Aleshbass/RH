import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LegalBlock, LegalDocument } from '@/lib/legal/types';
import { POLICIES, type PolicyId } from '@/lib/policies';

/** ⟦…⟧ marks a detail filled in by the signer (lib/agreements.ts), highlighted in previews. */
function Marked({ text }: { text: string }) {
  const parts = text.split(/(⟦[^⟧]*⟧)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('⟦') && part.endsWith('⟧') ? (
          <mark key={i} className="rounded bg-rh-lime/25 px-1 text-rh-ink">
            {part.slice(1, -1)}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

/** `**bold**` inside approved wording. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className="font-semibold text-rh-ink">
            <Marked text={part.slice(2, -2)} />
          </strong>
        ) : (
          <Marked key={i} text={part} />
        )
      )}
    </>
  );
}

export function Block({ block }: { block: LegalBlock }) {
  if (block.type === 'p') {
    return (
      <p className="text-[15px] leading-7 text-rh-ink/75 sm:text-base">
        <Rich text={block.text} />
      </p>
    );
  }
  if (block.type === 'ul' || block.type === 'ol') {
    const List = block.type === 'ul' ? 'ul' : 'ol';
    return (
      <List className={`space-y-2 pl-6 text-[15px] leading-7 text-rh-ink/75 sm:text-base ${block.type === 'ul' ? 'list-disc' : 'list-decimal'}`}>
        {block.items.map((item) => (
          <li key={item} className="pl-1">
            <Rich text={item} />
          </li>
        ))}
      </List>
    );
  }
  return (
    <div className="-mx-1 overflow-x-auto rounded-2xl ring-1 ring-inset ring-rh-ink/10">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-rh-canvas">
            {block.head.map((cell) => (
              <th key={cell} scope="col" className="px-4 py-3 font-semibold text-rh-ink">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className="border-t border-rh-ink/10 align-top">
              {row.map((cell, j) => (
                <td key={j} className={j === 0 ? 'px-4 py-3 font-medium text-rh-ink' : 'px-4 py-3 text-rh-ink/75'}>
                  <Rich text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const anchor = (title: string) =>
  title
    .toLowerCase()
    .replace(/^[\d.]+\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A policy page in the site's design: contents on the side, readable text, tables that scroll on phones. */
export function PolicyPage({
  doc,
  related = [],
  children,
}: {
  doc: LegalDocument;
  /** Other policies to link at the end */
  related?: PolicyId[];
  children?: ReactNode;
}) {
  return (
    <div className="bg-rh-canvas px-4 pb-24 pt-[132px] text-rh-ink sm:px-6 sm:pt-40 lg:pt-44">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <h1 className="text-[38px] font-bold leading-[1.05] tracking-tight sm:text-6xl">{doc.title}</h1>
          <p className="mt-3 text-sm text-rh-ink/55">
            Effective {doc.effectiveDate} · Version {doc.version}
          </p>
          <div className="mt-6 space-y-4">
            {doc.intro.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        </header>

        <div className="mt-12 grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
          <nav aria-label="Contents" className="hidden lg:block">
            <div className="sticky top-28 rounded-2xl bg-white p-4">
              <p className="px-2 pb-2 text-sm font-semibold">Contents</p>
              <ol className="space-y-0.5 text-sm">
                {doc.sections.map((section) => (
                  <li key={section.title}>
                    <a
                      href={`#${anchor(section.title)}`}
                      className="block rounded-lg px-2 py-1.5 text-rh-ink/65 transition-colors hover:bg-rh-canvas hover:text-rh-ink"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <article className="min-w-0 rounded-[2rem] bg-white p-6 sm:p-10">
            <div className="space-y-12">
              {doc.sections.map((section) => (
                <section key={section.title} id={anchor(section.title)} className="scroll-mt-28">
                  <h2 className="text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">{section.title}</h2>
                  <div className="mt-4 space-y-4">
                    {section.blocks.map((block, i) => (
                      <Block key={i} block={block} />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {doc.outro && (
              <div className="mt-12 space-y-3 border-t border-rh-ink/10 pt-8">
                {doc.outro.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </div>
            )}

            {children}

            {related.length > 0 && (
              <p className="mt-10 border-t border-rh-ink/10 pt-6 text-sm text-rh-ink/65">
                See also{' '}
                {related.map((id, i) => (
                  <span key={id}>
                    {i > 0 && (i === related.length - 1 ? ' and ' : ', ')}
                    <Link href={POLICIES[id].href} className="font-semibold text-rh-ink underline underline-offset-4 hover:no-underline">
                      {POLICIES[id].title}
                    </Link>
                  </span>
                ))}
                .
              </p>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
