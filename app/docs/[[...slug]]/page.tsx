import { source } from "@/lib/source";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ALL_DOCS_FLAT } from "@/components/docs/DocsNav";
import defaultMdxComponents from "fumadocs-ui/mdx";
import {
  Card,
  Cards,
  Callout,
  Step,
  Steps,
  Tab,
  Tabs,
  PreCode,
  TableWrapper,
  Accordion,
  Accordions,
  TypeTable,
  CodeBlock,
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
  Pre,
} from "@/components/docs/DocsMdxComponents";

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const page = source.getPage(params.slug);

  if (!page) {
    notFound();
  }

  const MDX = page.data.body;

  // Compute current path and previous/next page navigation
  const currentPath = `/docs${
    params.slug && params.slug.length > 0 ? `/${params.slug.join("/")}` : ""
  }`;
  const currentIndex = ALL_DOCS_FLAT.findIndex((item) => item.href === currentPath);
  const prevPage = currentIndex > 0 ? ALL_DOCS_FLAT[currentIndex - 1] : null;
  const nextPage =
    currentIndex >= 0 && currentIndex < ALL_DOCS_FLAT.length - 1
      ? ALL_DOCS_FLAT[currentIndex + 1]
      : null;

  const customComponents = {
    ...defaultMdxComponents,
    CodeBlock,
    CodeBlockTab,
    CodeBlockTabs,
    CodeBlockTabsList,
    CodeBlockTabsTrigger,
    Pre,
    h1: (p: any) => (
      <h1
        className="text-3xl font-cal font-bold text-[#002e2c] tracking-tight mt-6 mb-3 scroll-mt-20"
        {...p}
      />
    ),
    h2: (p: any) => (
      <h2
        className="text-xl font-cal font-bold text-[#002e2c] tracking-tight mt-8 mb-3 scroll-mt-20 border-b border-[#002e2c]/10 pb-2"
        {...p}
      />
    ),
    h3: (p: any) => (
      <h3
        className="text-base font-semibold text-[#002e2c] mt-6 mb-2 scroll-mt-20"
        {...p}
      />
    ),
    h4: (p: any) => (
      <h4
        className="text-sm font-semibold text-[#002e2c] mt-4 mb-2 scroll-mt-20"
        {...p}
      />
    ),
    p: (p: any) => (
      <p className="text-sm text-[#1b3a38] leading-relaxed mb-4 font-normal" {...p} />
    ),
    ul: (p: any) => (
      <ul className="list-disc list-inside space-y-1.5 text-sm text-[#1b3a38] mb-4 pl-2" {...p} />
    ),
    ol: (p: any) => (
      <ol className="list-decimal list-inside space-y-1.5 text-sm text-[#1b3a38] mb-4 pl-2" {...p} />
    ),
    li: (p: any) => <li className="leading-relaxed" {...p} />,
    a: (p: any) => (
      <a
        className="text-[#005b57] font-semibold underline underline-offset-4 hover:text-[#00443e] transition"
        {...p}
      />
    ),
    hr: (p: any) => <hr className="border-t border-[#002e2c]/10 my-8" {...p} />,
    code: (p: any) => {
      // Only style inline code spans, never code blocks or tokens
      if (!p.className && !p["data-language"] && !p["data-line"] && !p.style) {
        return (
          <code
            className="font-mono text-[0.82em] bg-[#FAF6E7]/80 border border-[#002e2c]/15 text-[#005b57] px-1.5 py-0.5 rounded-md font-semibold"
            {...p}
          />
        );
      }
      return <code {...p} />;
    },
    pre: PreCode,
    table: TableWrapper,
    th: (p: any) => (
      <th
        className="py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-[#002e2c] bg-[#FAF6E7]/80 border-b border-[#002e2c]/15 text-left"
        {...p}
      />
    ),
    td: (p: any) => (
      <td className="py-3 px-4 border-b border-[#002e2c]/10 text-xs text-[#1b3a38]" {...p} />
    ),
    blockquote: (p: any) => (
      <blockquote
        className="border-l-4 border-[#005b57] pl-4 italic text-[#4a6866] my-4 bg-white/40 py-2 rounded-r-xl"
        {...p}
      />
    ),
    Card,
    Cards,
    Callout,
    Step,
    Steps,
    Tab,
    Tabs,
    Accordion,
    Accordions,
    TypeTable,
  };

  return (
    <div className="flex gap-10 items-start">
      {/* Center Article Content */}
      <article className="flex-1 min-w-0 max-w-3xl">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1.5 text-xs text-[#52706e] mb-4 font-mono">
          <Link href="/docs" className="hover:text-[#002e2c] transition">
            Docs
          </Link>
          {params.slug && params.slug.length > 0 && (
            <>
              <span>/</span>
              <span className="capitalize">{params.slug[0].replace(/-/g, " ")}</span>
            </>
          )}
        </div>

        {/* Page Title & Description */}
        <h1 className="text-3xl sm:text-4xl font-cal font-bold tracking-tight text-[#002e2c] mb-2">
          {page.data.title}
        </h1>
        {page.data.description && (
          <p className="text-sm sm:text-base text-[#4a6866] leading-relaxed mb-6 pb-6 border-b border-[#002e2c]/10">
            {page.data.description}
          </p>
        )}

        {/* MDX Body */}
        <div className="docs-content text-[#1b3a38]">
          <MDX components={customComponents} />
        </div>

        {/* Article Bottom Navigation (Prev / Next) */}
        <div className="mt-12 pt-8 border-t border-[#002e2c]/10 flex items-center justify-between gap-4">
          {prevPage ? (
            <Link href={prevPage.href} className="flex flex-col text-left group">
              <span className="text-[11px] text-[#52706e] font-mono">← Previous</span>
              <span className="text-sm font-semibold text-[#002e2c] group-hover:text-[#005b57] transition">
                {prevPage.title}
              </span>
            </Link>
          ) : (
            <div />
          )}

          {nextPage && (
            <Link href={nextPage.href} className="flex flex-col text-right group">
              <span className="text-[11px] text-[#52706e] font-mono">Next →</span>
              <span className="text-sm font-semibold text-[#002e2c] group-hover:text-[#005b57] transition">
                {nextPage.title}
              </span>
            </Link>
          )}
        </div>
      </article>

      {/* Right Table of Contents */}
      {page.data.toc && page.data.toc.length > 0 && (
        <aside className="hidden xl:block w-56 flex-shrink-0 pl-6 py-2 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto border-l border-[#002e2c]/10">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#52706e] mb-3 font-sans">
            On this page
          </div>
          <ul className="space-y-2 text-xs">
            {page.data.toc.map((heading: any) => (
              <li
                key={heading.url}
                style={{ paddingLeft: `${Math.max(0, (heading.depth - 2) * 10)}px` }}
              >
                <a
                  href={heading.url}
                  className="text-[#4a6866] hover:text-[#005b57] transition block truncate leading-snug"
                >
                  {heading.title}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps) {
  const params = await props.params;
  const page = source.getPage(params.slug);

  if (!page) {
    return {
      title: "Documentation | Rehabify Health",
    };
  }

  return {
    title: `${page.data.title} | Rehabify Docs`,
    description: page.data.description,
  };
}
