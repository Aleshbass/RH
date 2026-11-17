"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "framer-motion";
import { useState, useSyncExternalStore, type FormEvent, type InputHTMLAttributes } from "react";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck, X } from "@/components/icons";

const EASE = [0.22, 1, 0.36, 1] as const;
const DESKTOP = "(min-width: 640px)";

/** True from the `sm` breakpoint up; false on the server and on phones. */
function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DESKTOP);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

const EMPTY = { name: "", company: "", role: "", email: "", phone: "", workerCount: "", workType: "" };
type Field = keyof typeof EMPTY;

const field =
  "mt-1.5 h-12 w-full rounded-xl bg-rh-canvas px-4 text-[15px] text-rh-ink ring-1 ring-inset ring-rh-ink/10 placeholder:text-rh-ink/40 focus:outline-none focus:ring-2 focus:ring-rh-ink";
const label = "block text-sm font-semibold text-rh-ink";

/**
 * "Request a pilot" for employers (Rehabify for Work). A bottom drawer on phones (swipe the handle
 * down to close) and a centred modal on desktop, like the partners page's Book a demo. Requests go
 * to /api/employer-pilot, which saves them for Admin › Partnerships › Inquiries and emails the team
 * and the requester.
 */
export function PilotRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const isDesktop = useIsDesktop();
  const reduce = useReducedMotion();
  const dragControls = useDragControls();
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const set = (key: Field) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const close = (next: boolean) => {
    onOpenChange(next);
    // Start fresh next time, once the closing animation is done
    if (!next && state === "sent")
      window.setTimeout(() => {
        setForm(EMPTY);
        setState("idle");
      }, 300);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setState("sending");
    try {
      const res = await fetch("/api/employer-pilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, workerCount: Number(form.workerCount) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "We couldn't send your request.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't send your request.");
      setState("idle");
    }
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) close(false);
  };

  const panel = isDesktop
    ? {
        initial: reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 4 },
      }
    : {
        initial: reduce ? { opacity: 0 } : { y: "100%" },
        animate: { opacity: 1, y: 0 },
        exit: reduce ? { opacity: 0 } : { y: "100%" },
      };

  const input = (key: Field, text: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`pilot-${key}`} className={label}>
        {text}
      </label>
      <input id={`pilot-${key}`} required value={form[key]} onChange={(e) => set(key)(e.target.value)} className={field} {...props} />
    </div>
  );

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[90] bg-rh-ink/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                {...panel}
                transition={{ duration: isDesktop ? 0.25 : 0.4, ease: EASE }}
                drag={!isDesktop && !reduce ? "y" : false}
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={onDragEnd}
                className="fixed inset-x-0 bottom-0 z-[95] max-h-[92dvh] overflow-y-auto rounded-t-[1.75rem] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 text-rh-ink focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem] sm:p-8"
              >
                {/* Grab handle, phones only: a tall touch strip around the visible bar */}
                <div
                  aria-hidden
                  onPointerDown={(e) => dragControls.start(e)}
                  className="-mx-5 -mt-3 mb-2 flex h-8 cursor-grab touch-none items-center justify-center sm:hidden"
                >
                  <span className="h-1.5 w-10 rounded-full bg-rh-ink/15" />
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Dialog.Title className="text-2xl font-bold leading-tight tracking-tight text-rh-ink">
                      {state === "sent" ? "Request sent" : "Request a pilot"}
                    </Dialog.Title>
                    {state !== "sent" && (
                      <p className="mt-1 text-[15px] leading-relaxed text-rh-ink/65">Tell us about your team and we&apos;ll plan it with you.</p>
                    )}
                  </div>
                  <Dialog.Close
                    className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-rh-ink/60 transition-colors hover:bg-rh-canvas hover:text-rh-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>

                {state === "sent" ? (
                  <motion.div
                    className="pb-2 pt-5"
                    role="status"
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: EASE }}
                  >
                    <motion.span
                      className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rh-lime"
                      initial={reduce ? false : { scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.1 }}
                    >
                      <CheckCircle2 className="h-6 w-6 text-rh-ink" />
                    </motion.span>
                    <p className="mt-4 text-[15px] font-medium leading-relaxed text-rh-ink/75">
                      Thanks, {form.name.trim().split(" ")[0] || "we've got it"}. We&apos;ll be in touch to plan your pilot, and a confirmation is
                      on its way to {form.email}.
                    </p>
                    <Dialog.Close className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-rh-ink text-[15px] font-semibold text-white transition-colors hover:bg-black">
                      Done
                    </Dialog.Close>
                  </motion.div>
                ) : (
                  <form onSubmit={submit} className="mt-5 space-y-4">
                    {input("name", "Full name", { autoComplete: "name" })}
                    <div className="grid gap-4 sm:grid-cols-2">
                      {input("company", "Company", { autoComplete: "organization" })}
                      {input("role", "Your role", { autoComplete: "organization-title", placeholder: "e.g. HR manager" })}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {input("email", "Work email", { type: "email", autoComplete: "email" })}
                      {input("phone", "Phone number", { type: "tel", autoComplete: "tel" })}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {input("workerCount", "Number of workers", { type: "number", inputMode: "numeric", min: 1, step: 1, placeholder: "e.g. 120" })}
                      {input("workType", "Type of work they do", { placeholder: "e.g. delivery riders" })}
                    </div>

                    {error && (
                      <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={state === "sending"}
                      className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-lime text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
                    >
                      {state === "sending" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                        </>
                      ) : (
                        <>
                          Request a pilot <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                        </>
                      )}
                    </button>
                    <p className="flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-rh-ink/55">
                      <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                      Workers&apos; health information stays private, in line with the Nigeria Data Protection Act.
                    </p>
                  </form>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
