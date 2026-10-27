import Link from "next/link";
import { ArrowRight } from "@/components/icons";

// Placeholder until the first articles are published (the layout keeps it out of search results)
export default function BlogPage() {
  return (
    <div className="bg-rh-canvas px-4 pb-24 pt-[132px] text-rh-ink sm:px-6 sm:pt-40 lg:pt-48">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[40px] font-bold leading-[1.05] tracking-tight sm:text-6xl">Blog</h1>
        <p className="mt-5 max-w-xl text-lg font-medium leading-relaxed text-rh-ink/70">
          Recovery guides, exercise tips and news from the Rehabify team. Our first articles are on the way.
        </p>
        <div className="mt-10 rounded-[2rem] bg-white p-7 sm:p-10">
          <h2 className="text-2xl font-bold tracking-tight">Have a question in the meantime?</h2>
          <p className="mt-2 max-w-lg text-rh-ink/70">The answers to what people ask us most are in our FAQs.</p>
          <Link
            href="/#faqs"
            className="group mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep"
          >
            Read the FAQs
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}
