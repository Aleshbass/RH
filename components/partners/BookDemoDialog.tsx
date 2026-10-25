"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "framer-motion";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Loader2, X } from "@/components/icons";

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

const EMPTY = { name: "", email: "", phone: "", organization: "", message: "" };

const field =
  "mt-1.5 h-12 w-full rounded-xl bg-rh-canvas px-4 text-[15px] text-rh-ink ring-1 ring-inset ring-rh-ink/10 placeholder:text-rh-ink/40 focus:outline-none focus:ring-2 focus:ring-rh-ink";
const label = "block text-sm font-semibold text-rh-ink";

/**
 * "Book a demo" for partner organisations. A bottom drawer on phones (swipe down to close) and a
 * small centred modal on desktop. Requests go to /api/book-demo, which saves them for the admin
 * Partnerships › Inquiries tab and emails the team and the requester.
 */
export function BookDemoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const isDesktop = useIsDesktop();
  const reduce = useReducedMotion();
  const dragControls = useDragControls();
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const set = (key: keyof typeof EMPTY) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const close = (next: boolean) => {
    onOpenChange(next);
    // Start fresh next time, once the closing animation is done
    if (!next && state === "sent") window.setTimeout(() => {
      setForm(EMPTY);
      setState("idle");
    }, 300);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setState("sending");
    try {
      const res = await fetch("/api/book-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "We couldn't send your request.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't send your request.");
      setState("idle");
    }
  };

  // Phones: drag the handle down past ~120px to dismiss (only the handle, so the form still scrolls)
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
                className="fixed inset-x-0 bottom-0 z-[95] max-h-[92dvh] overflow-y-auto rounded-t-[1.75rem] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 text-rh-ink focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem] sm:p-8"
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
                  <Dialog.Title className="text-2xl font-bold leading-tight tracking-tight text-rh-ink">
                    {state === "sent" ? "Request sent" : "Book a demo"}
                  </Dialog.Title>
                  <Dialog.Close
                    className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-rh-ink/60 transition-colors hover:bg-rh-canvas hover:text-rh-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>

                {state === "sent" ? (
                  <div className="pb-2 pt-5" role="status">
                    <CheckCircle2 className="h-10 w-10 text-rh-ink" />
                    <p className="mt-4 text-[15px] font-medium leading-relaxed text-rh-ink/75">
                      Thanks, {form.name.split(" ")[0] || "we've got it"}. We&apos;ll contact you within 24 hours to pick a time,
                      and a confirmation is on its way to {form.email}.
                    </p>
                    <Dialog.Close className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-rh-ink text-[15px] font-semibold text-white transition-colors hover:bg-black">
                      Done
                    </Dialog.Close>
                  </div>
                ) : (
                  <form onSubmit={submit} className="mt-5 space-y-4">
                    <div>
                      <label htmlFor="demo-name" className={label}>Full name</label>
                      <input id="demo-name" required autoComplete="name" value={form.name} onChange={(e) => set("name")(e.target.value)} className={field} />
                    </div>
                    <div>
                      <label htmlFor="demo-email" className={label}>Work email</label>
                      <input id="demo-email" type="email" required autoComplete="email" value={form.email} onChange={(e) => set("email")(e.target.value)} className={field} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="demo-org" className={label}>Organisation</label>
                        <input id="demo-org" required autoComplete="organization" value={form.organization} onChange={(e) => set("organization")(e.target.value)} className={field} />
                      </div>
                      <div>
                        <label htmlFor="demo-phone" className={label}>
                          Phone <span className="font-normal text-rh-ink/50">(optional)</span>
                        </label>
                        <input id="demo-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone")(e.target.value)} className={field} />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="demo-message" className={label}>
                        What would you like to see? <span className="font-normal text-rh-ink/50">(optional)</span>
                      </label>
                      <textarea
                        id="demo-message"
                        rows={3}
                        value={form.message}
                        onChange={(e) => set("message")(e.target.value)}
                        className={`${field} h-auto resize-none py-3`}
                      />
                    </div>

                    {error && (
                      <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={state === "sending"}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-lime text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
                    >
                      {state === "sending" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                        </>
                      ) : (
                        <>
                          Book my demo <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                    <p className="text-center text-xs text-rh-ink/55">A 30-minute walkthrough. We reply within 24 hours.</p>
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
