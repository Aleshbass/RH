"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Check, Copy, Printer, WhatsApp } from "@/components/icons";
import { LoadingBlocks, Panel, PhysioDrawer, secondaryButtonClass } from "@/components/physio/ui";
import { cn } from "@/lib/utils";
import { doctorRefs } from "./refs";
import { errorText } from "./ui";
import { QrCode, qrSvgMarkup } from "@/components/shared/QrCode";

function shareMessage(name: string, url: string) {
  return `Hello, this is ${name}. I'd like you to see a physiotherapist through Rehabify. Use this link to get started: ${url}`;
}

/** A poster for the consulting room: the QR code, the doctor's name and one line of instructions. */
function printPoster(name: string, url: string) {
  const win = window.open("", "_blank", "width=720,height=900");
  if (!win) {
    toast.error("Allow pop-ups to print the poster.");
    return;
  }
  const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Referral QR code</title>
<style>
  *{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16181c;background:#fff}
  .page{max-width:560px;margin:48px auto;padding:40px;border:1px solid #e6e3dd;border-radius:28px;text-align:center}
  h1{font-size:30px;line-height:1.15;margin:0 0 8px}p{font-size:16px;color:#5f636b;margin:0}
  .qr{width:320px;height:320px;margin:28px auto;display:block}.qr svg{width:100%;height:100%}
  .who{font-weight:600;color:#16181c;font-size:18px;margin-top:4px}.url{font-size:13px;color:#8e9199;margin-top:18px;word-break:break-all}
  @media print{.page{border:0;margin:0 auto}}
</style></head><body><div class="page">
  <h1>Scan to start physiotherapy</h1>
  <p>Referred by</p><p class="who">${escape(name)}</p>
  <div class="qr" role="img" aria-label="QR code">${qrSvgMarkup(url, 640)}</div>
  <p>Open your phone camera, scan the code and ask for care. Rehabify will contact you on WhatsApp.</p>
  <p class="url">${escape(url)}</p>
</div><script>setTimeout(function(){window.print()},150)</script></body></html>`);
  win.document.close();
}

/**
 * The doctor's personal referral link (made the first time they open the portal): copy it, send it
 * on WhatsApp, or show the QR code to a patient in the room or print it.
 */
export function ShareCard({ partnerCode, canCreate, className }: { partnerCode: string; canCreate: boolean; className?: string }) {
  const data = useQuery(doctorRefs.shareLink, { partnerCode });
  const ensure = useMutation(doctorRefs.ensureShareLink);
  const asked = useRef(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (!canCreate || !data || data.link || asked.current) return;
    asked.current = true;
    ensure({ partnerCode }).catch((err) => setFailed(errorText(err, "We couldn't make your link. Refresh to try again.")));
  }, [canCreate, data, ensure, partnerCode]);

  const link = data?.link ?? null;
  const name = data?.name ?? "your doctor";

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  };

  return (
    <Panel
      title="Your referral link"
      info="Patients who open it and ask for care are linked to you for 30 days. Their referral then shows here, like the ones you send."
      className={className}
      bodyClassName="px-5 pb-5 pt-3 sm:px-6"
    >
      {data === undefined || (data !== null && !link && !failed && canCreate) ? (
        <LoadingBlocks rows={2} />
      ) : !link ? (
        <p className="text-sm text-pt-muted">{failed ?? "Your link appears here once your account is approved."}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl bg-pt-sunken py-1.5 pl-3.5 pr-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-pt-ink">{link.url.replace(/^https?:\/\//, "")}</span>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy your referral link"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-pt-surface px-2.5 text-xs font-semibold text-pt-ink shadow-pt transition hover:bg-pt-hover dark:shadow-none"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowQr(true)}
              className="group relative shrink-0 rounded-2xl border border-pt-line bg-white p-1.5 transition hover:shadow-pt-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50"
              aria-label="Show the QR code bigger"
            >
              <QrCode value={link.url} size={96} margin={2} label="QR code for your referral link" className="h-24 w-24" />
            </button>
            <div className="min-w-0 space-y-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareMessage(name, link.url))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-pt-accent px-4 text-sm font-semibold text-[#06210a] transition hover:bg-[#00b80e] active:scale-[0.98]"
              >
                <WhatsApp className="h-4 w-4" />
                Share on WhatsApp
              </a>
              <Button type="button" variant="outline" onClick={() => printPoster(name, link.url)} className={cn(secondaryButtonClass, "h-10 w-full")}>
                <Printer className="h-4 w-4" />
                Print QR poster
              </Button>
            </div>
          </div>

          <p className="text-xs text-pt-muted">
            {link.clicks === 0 ? "No one has opened it yet." : `Opened ${link.clicks.toLocaleString("en-NG")} ${link.clicks === 1 ? "time" : "times"}`}
            {link.leads > 0 ? ` · ${link.leads} asked for care` : ""}
          </p>
        </div>
      )}

      {link && (
        <PhysioDrawer open={showQr} onOpenChange={setShowQr} title="Scan to start" description="Let your patient scan this with their phone camera.">
          <div className="flex flex-col items-center gap-5 py-2">
            <div className="rounded-3xl border border-pt-line bg-white p-3">
              <QrCode value={link.url} size={288} label="QR code for your referral link" className="h-72 w-72" />
            </div>
            <p className="max-w-xs text-center text-sm text-pt-muted">
              They land on a page with your name, agree to be contacted and ask for care. We take it from there.
            </p>
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={copy} className={cn(secondaryButtonClass, "h-10 flex-1")}>
                <Copy className="h-4 w-4" />
                Copy link
              </Button>
              <Button type="button" variant="outline" onClick={() => printPoster(name, link.url)} className={cn(secondaryButtonClass, "h-10 flex-1")}>
                <Printer className="h-4 w-4" />
                Print poster
              </Button>
            </div>
          </div>
        </PhysioDrawer>
      )}
    </Panel>
  );
}
