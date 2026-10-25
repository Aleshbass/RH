"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "@/components/icons";
import { ApplyForm } from "@/components/careers/ApplyForm";
import { careersApi, jobMeta } from "@/lib/careers";

const EASE = [0.22, 1, 0.36, 1] as const;

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold leading-tight text-rh-ink sm:text-2xl">{title}</h2>
      <ul className="mt-4">
        {items.map((item) => (
          <li key={item} className="flex gap-3 border-t border-rh-ink/10 py-3.5 text-[15px] font-medium leading-relaxed text-rh-ink/80 sm:text-base">
            <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rh-lime" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CareerRolePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const job = useQuery(careersApi.getJobBySlug, slug ? { slug } : "skip");
  const reduce = useReducedMotion();
  const formRef = useRef<HTMLDivElement>(null);
  const [formInView, setFormInView] = useState(false);

  // Phones: hide the sticky "Apply" bar once the form itself is on screen
  useEffect(() => {
    const node = formRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setFormInView(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [job]);

  if (job === undefined) {
    return (
      <div className="min-h-screen bg-rh-canvas px-4 pb-24 pt-32 sm:px-6 sm:pt-40">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="h-5 w-24 animate-pulse rounded-full bg-rh-ink/[0.07]" />
          <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-rh-ink/[0.07]" />
          <div className="h-40 animate-pulse rounded-[2rem] bg-rh-ink/[0.05]" />
        </div>
      </div>
    );
  }

  if (job === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rh-canvas px-4 pt-24">
        <div className="max-w-md text-center">
          <h1 className="text-[32px] font-bold leading-tight text-rh-ink">We couldn&apos;t find that role</h1>
          <p className="mt-3 text-[15px] font-medium text-rh-ink/70">It may have been filled or the link may be wrong.</p>
          <Link href="/careers#roles" className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink hover:bg-rh-lime-deep">
            See open roles <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const paragraphs = job.description.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="min-h-screen bg-rh-canvas px-4 pb-32 pt-28 text-rh-ink sm:px-6 sm:pt-36 lg:pb-24">
      <div className="mx-auto max-w-6xl">
        <Link href="/careers#roles" className="inline-flex items-center gap-2 text-sm font-semibold text-rh-ink/70 hover:text-rh-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> All roles
        </Link>

        <motion.header
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mt-6 max-w-3xl"
        >
          <h1 className="text-[36px] font-bold leading-[1.05] tracking-tight sm:text-[52px]">{job.title}</h1>
          <ul className="mt-5 flex flex-wrap gap-2">
            {jobMeta(job).map((part) => (
              <li key={part} className="rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-rh-ink/75 ring-1 ring-inset ring-rh-ink/10">
                {part}
              </li>
            ))}
            {job.salary && <li className="rounded-full bg-rh-lime px-3.5 py-1.5 text-sm font-semibold text-rh-ink">{job.salary}</li>}
          </ul>
          <p className="mt-6 text-lg font-medium leading-relaxed text-rh-ink/75">{job.summary}</p>
        </motion.header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_400px] lg:gap-14">
          <article>
            {paragraphs.length > 0 && (
              <section>
                <h2 className="text-xl font-bold leading-tight sm:text-2xl">About the role</h2>
                <div className="mt-4 space-y-4">
                  {paragraphs.map((p) => (
                    <p key={p.slice(0, 40)} className="whitespace-pre-line text-[15px] font-medium leading-relaxed text-rh-ink/80 sm:text-base">
                      {p}
                    </p>
                  ))}
                </div>
              </section>
            )}
            <List title="What you'll do" items={job.responsibilities} />
            <List title="What you'll bring" items={job.requirements} />
            <List title="Nice to have" items={job.niceToHave} />
          </article>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div ref={formRef} id="apply" className="scroll-mt-28 rounded-[2rem] bg-white p-6 sm:p-8">
              {job.isOpen ? (
                <>
                  <h2 className="text-2xl font-bold leading-tight">Apply for this role</h2>
                  <p className="mb-6 mt-1 text-sm text-rh-ink/60">It takes about five minutes. Have your CV ready as a PDF.</p>
                  <ApplyForm jobId={job._id} jobTitle={job.title} />
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold leading-tight">This role is closed</h2>
                  <p className="mt-2 text-[15px] font-medium text-rh-ink/70">We&apos;re no longer taking applications for it.</p>
                  <Link href="/careers#roles" className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink hover:bg-rh-lime-deep">
                    See open roles <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Phones: a sticky way to reach the form from anywhere in a long description */}
      {job.isOpen && !formInView && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rh-ink/10 bg-rh-canvas/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
          <a
            href="#apply"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-lime text-[15px] font-semibold text-rh-ink hover:bg-rh-lime-deep"
          >
            Apply for this role <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      )}
    </div>
  );
}
