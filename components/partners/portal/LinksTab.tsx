"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { ExternalLink, Link2, Plus } from "@/components/icons";
import {
  Busy,
  CopyButton,
  DASH,
  Drawer,
  EmptyState,
  LoadingBlock,
  Modal,
  Pill,
  StatusBadge,
  btnLink,
  btnPrimary,
  btnSecondary,
  cardCls,
  errorMessage,
  fmtDate,
  fmtDateTime,
  formatNumber,
  inputCls,
  labelCls,
  selectCls,
  tdCls,
  thCls,
  type PortalContext,
} from "./shared";

type LinkView = {
  id: Id<"partnerReferralLinks">;
  public_code: string;
  url: string;
  campaign_name: string | null;
  service_scope: string;
  default_care_mode: string;
  status: string;
  environment: "sandbox" | "live";
  expires_at: string | null;
  stats: { clicks: number; leads: number; signups: number; bookings: number; payments: number };
  created_at: string | null;
  conversionRate: number;
};

export function LinksTab({ ctx }: { ctx: PortalContext }) {
  const links = useQuery(api.partnerLinks.listReferralLinks, { partnerCode: ctx.partnerCode, environment: ctx.environment }) as
    | LinkView[]
    | undefined;
  const setStatus = useMutation(api.partnerLinks.updateLinkStatus);
  const [createOpen, setCreateOpen] = useState(false);
  const [leadsFor, setLeadsFor] = useState<LinkView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = async (link: LinkView) => {
    setBusyId(link.id);
    try {
      await setStatus({ partnerCode: ctx.partnerCode, linkId: link.id, status: link.status === "active" ? "inactive" : "active" });
      toast.success(link.status === "active" ? "Link deactivated" : "Link reactivated");
    } catch (err) {
      toast.error(errorMessage(err, "Could not update the link"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-5 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{ctx.isDoctor ? "Your referral link" : "No-code referral links"}</h3>
          <p className="text-xs text-[#52706e] leading-relaxed max-w-2xl">
            {ctx.isDoctor ? (
              <>
                Give patients your link on WhatsApp, by SMS or as a QR code in your consulting room. They land on a page with your name, agree to be
                contacted and ask for care. Anyone who signs up or books within 30 days of opening it is linked to you, so you earn on their care.
              </>
            ) : (
              <>
                Share a link by email, SMS, WhatsApp or QR code. Patients land on a co-branded page, give consent and request care. Anyone who signs up or
                books on physioaroundme.com within 30 days of opening your link is attributed to you (first partner wins).
                {ctx.environment === "sandbox" && " Sandbox links create test referrals only and never attribute real patients."}
              </>
            )}
          </p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => setCreateOpen(true)} disabled={!ctx.envWritable} title={!ctx.envWritable ? "Requires production access" : undefined}>
          <Plus className="w-3.5 h-3.5" />
          Create link
        </button>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        {links === undefined ? (
          <LoadingBlock />
        ) : links.length === 0 ? (
          <EmptyState
            icon={<Link2 className="w-8 h-8" />}
            title={ctx.isDoctor ? "No referral link yet" : `No ${ctx.environment} links yet`}
            body={ctx.isDoctor ? "Create your link, then share it with patients you want to send to Rehabify." : "Create your first link to start receiving referrals without any integration work."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[#52706e] bg-[#FAF6E7]/60">
                <tr>
                  <th className={thCls}>{ctx.isDoctor ? "Name" : "Campaign"}</th>
                  <th className={thCls}>Link</th>
                  <th className={thCls}>Status</th>
                  <th className={`${thCls} text-right`}>Clicks</th>
                  <th className={`${thCls} text-right`}>Leads</th>
                  <th className={`${thCls} text-right`}>Sign-ups</th>
                  <th className={`${thCls} text-right`}>Bookings</th>
                  <th className={`${thCls} text-right`}>Paid</th>
                  <th className={thCls}>Expires</th>
                  <th className={thCls} />
                </tr>
              </thead>
              <tbody className="divide-y divide-rh-ink/5">
                {links.map((link) => (
                  <tr key={link.id}>
                    <td className={tdCls}>
                      <div className="font-medium">{link.campaign_name || (ctx.isDoctor ? "Referral link" : "Untitled campaign")}</div>
                      <div className="text-[#52706e]">Created {fmtDate(link.created_at)}</div>
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1 max-w-[260px]">
                        <span className="font-mono truncate">{link.url}</span>
                        <CopyButton text={link.url} label="Link" />
                        <a href={link.url} target="_blank" rel="noreferrer" className="p-1.5 text-[#52706e] hover:text-rh-ink" aria-label="Open link">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                    <td className={tdCls}>
                      {link.status === "active" ? <Pill tone="green">Active</Pill> : link.status === "expired" ? <Pill tone="gray">Expired</Pill> : <Pill tone="amber">Inactive</Pill>}
                    </td>
                    <td className={`${tdCls} text-right`}>{formatNumber(link.stats.clicks)}</td>
                    <td className={`${tdCls} text-right`}>
                      {formatNumber(link.stats.leads)}
                      <div className="text-[10px] text-[#52706e]">{link.conversionRate}%</div>
                    </td>
                    <td className={`${tdCls} text-right`}>{formatNumber(link.stats.signups)}</td>
                    <td className={`${tdCls} text-right`}>{formatNumber(link.stats.bookings)}</td>
                    <td className={`${tdCls} text-right`}>{formatNumber(link.stats.payments)}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{link.expires_at ? fmtDate(link.expires_at) : "Never"}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      <div className="flex items-center gap-3">
                        <button type="button" className={btnLink} onClick={() => setLeadsFor(link)}>
                          Leads
                        </button>
                        {link.status !== "expired" && (
                          <button type="button" className={btnLink} onClick={() => toggle(link)} disabled={busyId === link.id || (link.status !== "active" && !ctx.envWritable)}>
                            {link.status === "active" ? "Deactivate" : "Reactivate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-5 py-3 text-[11px] text-[#52706e] border-t border-rh-ink/10">
          Clicks are unique visitors (once per visitor per 30 minutes; bots and link previews excluded). Bookings and payments count attributed patients.
        </p>
      </div>

      <CreateLinkModal ctx={ctx} open={createOpen} onClose={() => setCreateOpen(false)} />
      <LinkLeadsDrawer ctx={ctx} link={leadsFor} onClose={() => setLeadsFor(null)} />
    </div>
  );
}

function CreateLinkModal({ ctx, open, onClose }: { ctx: PortalContext; open: boolean; onClose: () => void }) {
  const create = useMutation(api.partnerLinks.createReferralLink);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<LinkView | null>(null);
  const [form, setForm] = useState({ campaignName: "", serviceScope: "all_rehabilitation", defaultCareMode: "patient_choice", expiresInDays: "" });

  const close = () => {
    setCreated(null);
    setForm({ campaignName: "", serviceScope: "all_rehabilitation", defaultCareMode: "patient_choice", expiresInDays: "" });
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const days = Number(form.expiresInDays);
      const link = (await create({
        partnerCode: ctx.partnerCode,
        environment: ctx.environment,
        campaignName: form.campaignName.trim() || undefined,
        serviceScope: form.serviceScope,
        defaultCareMode: form.defaultCareMode,
        expiresAt: days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : undefined,
      })) as LinkView;
      setCreated(link);
      toast.success("Referral link created");
    } catch (err) {
      toast.error(errorMessage(err, "Could not create the link"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={created ? "Your referral link" : ctx.isDoctor ? "Create your referral link" : `Create a ${ctx.environment} referral link`}
      footer={
        created ? (
          <button type="button" className={btnPrimary} onClick={close}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className={btnSecondary} onClick={close}>
              Cancel
            </button>
            <button type="submit" form="create-link" className={btnPrimary} disabled={busy}>
              <Busy busy={busy} label="Create link" busyLabel="Creating…" />
            </button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FAF6E7] border border-rh-ink/10">
            <span className="font-mono text-xs truncate flex-1">{created.url}</span>
            <CopyButton text={created.url} label="Link" />
          </div>
          <p className="text-xs text-[#52706e]">Share this link with patients or members. Its stats update in real time on the Referral links tab.</p>
        </div>
      ) : (
        <form id="create-link" onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelCls}>{ctx.isDoctor ? "Name (optional, e.g. clinic or hospital)" : "Campaign name"}</label>
            <input value={form.campaignName} onChange={(e) => setForm((f) => ({ ...f, campaignName: e.target.value }))} placeholder={ctx.isDoctor ? "e.g. LUTH orthopaedic clinic" : "e.g. Staff wellness Q4"} className={inputCls} maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Default care mode</label>
              <select value={form.defaultCareMode} onChange={(e) => setForm((f) => ({ ...f, defaultCareMode: e.target.value }))} className={`${selectCls} w-full`}>
                <option value="patient_choice">Patient&apos;s choice</option>
                <option value="remote">Remote (tele-rehab)</option>
                <option value="in_person">In person</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Expires after (days)</label>
              <input type="number" min={1} max={3650} value={form.expiresInDays} onChange={(e) => setForm((f) => ({ ...f, expiresInDays: e.target.value }))} placeholder="Never" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Service scope</label>
            <input value={form.serviceScope} onChange={(e) => setForm((f) => ({ ...f, serviceScope: e.target.value }))} className={inputCls} maxLength={80} />
          </div>
        </form>
      )}
    </Modal>
  );
}

function LinkLeadsDrawer({ ctx, link, onClose }: { ctx: PortalContext; link: LinkView | null; onClose: () => void }) {
  const leads = useQuery(api.partnerLinks.listLinkLeads, link ? { partnerCode: ctx.partnerCode, linkId: link.id } : "skip") as
    | Array<{ referralId: string; trackingCode: string; patientName: string; status: string; createdAt: number }>
    | undefined;
  return (
    <Drawer open={link !== null} onClose={onClose} title={link?.campaign_name || "Link leads"} subtitle={link ? <span className="font-mono">{link.url}</span> : undefined}>
      {leads === undefined ? (
        <LoadingBlock />
      ) : leads.length === 0 ? (
        <EmptyState title="No leads from this link yet" />
      ) : (
        <ul className="divide-y divide-rh-ink/5">
          {leads.map((lead) => (
            <li key={lead.referralId} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{lead.patientName || DASH}</div>
                <div className="font-mono text-[#52706e]">{lead.trackingCode || DASH}</div>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <StatusBadge status={lead.status} />
                <div className="text-[#52706e]">{fmtDateTime(lead.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
