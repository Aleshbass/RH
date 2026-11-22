"use client";

/**
 * Admin › Employer outreach: one company in a drawer (convex/employerOutreach.ts adminCompany).
 * The deal (stage, follow-up, owner, staff and monthly value), the company's details, its people
 * (found by "Find people", by "Find contacts" through Hunter, Apollo and Prospeo, added by hand or
 * from a pilot request), with each email's check and Call / WhatsApp / LinkedIn buttons, emails
 * and replies, and a timeline of notes and changes.
 */

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import {
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserSearch,
} from "@/components/icons";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatusBadge,
  cardClass,
  checkboxClass,
  fieldClass,
  formatNaira,
  primaryButtonClass,
  softButtonClass,
  textareaFieldClass,
} from "@/components/admin/ui";
import {
  EMPLOYER_SECTORS,
  EMPLOYER_STAGES,
  ROLE_GROUPS,
  ROLE_GROUP_LABEL,
  SECTOR_LABEL,
  STAGE_LABEL,
  VERIFY_LABEL,
  type EmployerStage,
  type RoleGroup,
  type VerifyStatus,
} from "@/lib/employerOutreach";
import { cn } from "@/lib/utils";
import { STAGE_TONE, employerApi, errorText, fromLagosDay, lagosDay, type CompanyDetail, type PersonRow } from "./employerApi";
import { LinkedInButton, PhoneActions } from "./ContactLinks";

const linkClass = "inline-flex items-center gap-1 text-neutral-600 hover:underline dark:text-neutral-300";
const sectionTitle = "text-[13px] font-semibold text-rh-ink dark:text-white";
const href = (url: string) => (/^https?:/i.test(url) ? url : `https://${url}`);
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "").slice(0, 40);

const EMAIL_FROM: Record<NonNullable<PersonRow["emailStatus"]>, string> = {
  published: "on a public page",
  admin: "added by the team",
  pilot_form: "from their pilot request",
  hunter: "from Hunter",
  apollo: "from Apollo",
  prospeo: "from Prospeo",
  pattern: "the company's pattern, checked",
};
/** Who found the person (badge on each person) */
const SOURCE_LABEL: Record<PersonRow["source"], string> = {
  web_search: "AI search",
  website: "Website",
  admin: "Team",
  pilot_form: "Pilot request",
  hunter: "Hunter",
  apollo: "Apollo",
  prospeo: "Prospeo",
};
const VERIFY_TONE: Record<VerifyStatus, "green" | "amber" | "red"> = {
  valid: "green",
  accept_all: "amber",
  unknown: "amber",
  webmail: "amber",
  disposable: "red",
  invalid: "red",
};
const VERIFY_HINT: Record<VerifyStatus, string> = {
  valid: "The mailbox exists.",
  accept_all: "The company's server accepts every address, so this one can't be confirmed.",
  unknown: "The check couldn't reach a clear answer.",
  webmail: "A personal address (Gmail, Yahoo…), not a work one.",
  disposable: "A throwaway address.",
  invalid: "This address would bounce.",
};
const PROVIDER_NAME = { hunter: "Hunter", apollo: "Apollo", prospeo: "Prospeo" } as const;
const ENROLL_LABEL: Record<CompanyDetail["enrollments"][number]["status"], string> = {
  active: "In sequence",
  finished: "All sent, no reply",
  replied: "Replied",
  bounced: "Bounced",
  unsubscribed: "Asked to stop",
  stopped: "Removed",
};

type PersonForm = {
  contactId?: string;
  name: string;
  role: string;
  roleGroup: RoleGroup | "";
  email: string;
  phone: string;
  linkedinUrl: string;
  notes: string;
};
const emptyPerson: PersonForm = { name: "", role: "", roleGroup: "", email: "", phone: "", linkedinUrl: "", notes: "" };

export function EmployerCompanyDrawer({
  leadId,
  owners,
  onClose,
}: {
  leadId: string | null;
  owners: { _id: string; name: string }[];
  onClose: () => void;
}) {
  const data = useQuery(employerApi.company, leadId ? { leadId } : "skip");
  const update = useMutation(employerApi.update);
  const addNote = useMutation(employerApi.addNote);
  const findPeople = useMutation(employerApi.findPeople);
  const saveContact = useMutation(employerApi.saveContact);
  const deleteContact = useMutation(employerApi.deleteContact);
  const stopEnrollment = useMutation(employerApi.stopEnrollment);
  const recrawl = useMutation(employerApi.recrawl);
  const findContacts = useMutation(employerApi.findContacts);
  const verifyEmail = useAction(employerApi.verifyEmail);
  const setSendAnyway = useMutation(employerApi.setSendAnyway);
  const check = (contactId: string, suggestion: boolean) =>
    run(`check-${contactId}`, async () => {
      const res = await verifyEmail({ contactId, suggestion });
      if (res.status === null) toast.message("Hunter is still checking. Try again in a minute.");
      else if (res.status === "claimed") toast.message("This person asked Hunter not to share their email: marked do not contact.");
      else toast.success(`Checked: ${VERIFY_LABEL[res.status].toLowerCase()}`);
    });

  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, task: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await task();
      if (done) toast.success(done);
      return true;
    } catch (err) {
      toast.error(errorText(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  // The deal form, refilled whenever another company opens
  const [deal, setDeal] = useState({ followUp: "", ownerId: "", staff: "", value: "" });
  const [details, setDetails] = useState<null | {
    name: string;
    city: string;
    sector: string;
    staffSize: string;
    email: string;
    phone: string;
    website: string;
    linkedinUrl: string;
  }>(null);
  const [person, setPerson] = useState<PersonForm | null>(null);
  const [note, setNote] = useState("");
  const loadedId = data?._id;
  useEffect(() => {
    if (!data) return;
    setDeal({
      followUp: data.nextFollowUpAt ? lagosDay(data.nextFollowUpAt) : "",
      ownerId: data.ownerId ?? "",
      staff: data.dealStaffCount ? String(data.dealStaffCount) : "",
      value: data.dealValueNaira ? String(data.dealValueNaira) : "",
    });
    setDetails(null);
    setPerson(null);
    setNote("");
    // Only when a different company opens: live updates mustn't wipe what the admin is typing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);

  const open = leadId !== null;
  const numberOrNull = (text: string) => {
    const n = Number(text.replace(/[^\d.]/g, ""));
    return text.trim() && Number.isFinite(n) ? n : null;
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-black/[0.06] bg-rh-canvas p-0 dark:border-white/[0.08] dark:bg-rh-ink sm:max-w-xl"
      >
        {!data ? (
          <div className="space-y-3 p-5">
            <SheetHeader className="sr-only">
              <SheetTitle>Company</SheetTitle>
              <SheetDescription>Loading</SheetDescription>
            </SheetHeader>
            {data === null ? (
              <p className="text-sm text-neutral-500">That company isn&apos;t on the list any more.</p>
            ) : (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
            )}
          </div>
        ) : (
          <div className="flex min-h-full flex-col">
            <SheetHeader className="space-y-2 border-b border-black/[0.05] bg-white px-5 py-4 text-left dark:border-white/[0.06] dark:bg-rh-ink-2">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <StatusBadge tone={STAGE_TONE[data.stage]}>{STAGE_LABEL[data.stage]}</StatusBadge>
                {data.fromPilotRequest && <StatusBadge tone="green">Pilot request</StatusBadge>}
                {data.stageChangedAt && (
                  <span className="text-xs text-neutral-500">since {formatDistanceToNowStrict(data.stageChangedAt, { addSuffix: true })}</span>
                )}
              </div>
              <SheetTitle className="text-lg text-rh-ink dark:text-white">{data.name}</SheetTitle>
              <SheetDescription className="text-xs">
                {[data.sector ? SECTOR_LABEL[data.sector] ?? data.sector : null, data.city || "City not given", data.staffSize ? `${data.staffSize} staff` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 p-5">
              {/* The deal */}
              <section className={cn(cardClass, "space-y-3 p-4")}>
                <p className={sectionTitle}>Deal</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-neutral-500">
                    Stage
                    <select
                      value={data.stage}
                      disabled={busy !== null}
                      onChange={(e) => run("stage", () => update({ leadId: data._id, stage: e.target.value as EmployerStage }), "Stage saved")}
                      className={fieldClass}
                    >
                      {EMPLOYER_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-neutral-500">
                    Owner
                    <select value={deal.ownerId} onChange={(e) => setDeal({ ...deal, ownerId: e.target.value })} className={fieldClass}>
                      <option value="">No owner</option>
                      {owners.map((o) => (
                        <option key={o._id} value={o._id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-neutral-500">
                    Next follow-up
                    <input type="date" value={deal.followUp} onChange={(e) => setDeal({ ...deal, followUp: e.target.value })} className={fieldClass} />
                  </label>
                  <label className="space-y-1 text-xs text-neutral-500">
                    Staff in the deal
                    <input
                      inputMode="numeric"
                      value={deal.staff}
                      onChange={(e) => setDeal({ ...deal, staff: e.target.value })}
                      placeholder="e.g. 250"
                      className={fieldClass}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-neutral-500 sm:col-span-2">
                    Deal value a month (₦)
                    <input
                      inputMode="numeric"
                      value={deal.value}
                      onChange={(e) => setDeal({ ...deal, value: e.target.value })}
                      placeholder="e.g. 500000"
                      className={fieldClass}
                    />
                  </label>
                </div>
                {data.stage === "do_not_contact" && (
                  <p className="text-xs text-rose-600">No emails go to this company. Its addresses and people are marked do not contact.</p>
                )}
                <button
                  type="button"
                  className={cn(primaryButtonClass, "h-9 px-4 text-sm")}
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      "deal",
                      () =>
                        update({
                          leadId: data._id,
                          nextFollowUpAt: deal.followUp ? fromLagosDay(deal.followUp) : null,
                          ownerId: deal.ownerId || null,
                          dealStaffCount: numberOrNull(deal.staff),
                          dealValueNaira: numberOrNull(deal.value),
                        }),
                      "Saved"
                    )
                  }
                >
                  {busy === "deal" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save deal
                </button>
                {data.dealValueNaira ? (
                  <p className="text-xs text-neutral-500">
                    {formatNaira(data.dealValueNaira)} a month{data.dealStaffCount ? ` for ${data.dealStaffCount.toLocaleString("en-NG")} staff` : ""}
                  </p>
                ) : null}
              </section>

              {/* The company */}
              <section className={cn(cardClass, "space-y-3 p-4")}>
                <div className="flex items-center justify-between gap-2">
                  <p className={sectionTitle}>Company</p>
                  {!details && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:underline"
                      onClick={() =>
                        setDetails({
                          name: data.name,
                          city: data.city,
                          sector: data.sector ?? "",
                          staffSize: data.staffSize ?? "",
                          email: data.email ?? "",
                          phone: data.phone ?? "",
                          website: data.website ?? "",
                          linkedinUrl: data.linkedinUrl ?? "",
                        })
                      }
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  )}
                </div>
                {details ? (
                  <form
                    className="grid gap-2 sm:grid-cols-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await run("details", () => update({ leadId: data._id, ...details }), "Saved")) setDetails(null);
                    }}
                  >
                    {(
                      [
                        ["name", "Name"],
                        ["city", "City"],
                        ["staffSize", "Staff size"],
                        ["email", "Company email"],
                        ["phone", "Phone"],
                        ["website", "Website"],
                        ["linkedinUrl", "LinkedIn page"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="space-y-1 text-xs text-neutral-500">
                        {label}
                        <input value={details[key]} onChange={(e) => setDetails({ ...details, [key]: e.target.value })} className={fieldClass} />
                      </label>
                    ))}
                    <label className="space-y-1 text-xs text-neutral-500">
                      Sector
                      <select value={details.sector} onChange={(e) => setDetails({ ...details, sector: e.target.value })} className={fieldClass}>
                        <option value="">Not set</option>
                        {EMPLOYER_SECTORS.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-2 sm:col-span-2">
                      <button type="submit" className={cn(primaryButtonClass, "h-9 px-4 text-sm")} disabled={busy !== null}>
                        {busy === "details" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
                      </button>
                      <button type="button" className={cn(softButtonClass, "h-9 px-4 text-sm")} onClick={() => setDetails(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-1.5 text-sm text-rh-ink dark:text-white">
                    {data.email ? (
                      <p className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-neutral-400" />
                        <a href={`mailto:${data.email}`} className="hover:underline">
                          {data.email}
                        </a>
                        {data.status === "do_not_contact" && <StatusBadge tone="red">Do not contact</StatusBadge>}
                        {data.status === "bounced" && <StatusBadge tone="amber">Bounced</StatusBadge>}
                      </p>
                    ) : (
                      <p className="text-neutral-500">
                        {data.crawlStatus === "pending" ? "Reading the website for an email…" : "No company email yet"}
                      </p>
                    )}
                    {data.otherEmails.length > 0 && <p className="text-xs text-neutral-500">Also on the site: {data.otherEmails.slice(0, 5).join(", ")}</p>}
                    {[data.phone, ...data.otherPhones].filter(Boolean).length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <Phone className="h-3.5 w-3.5 text-neutral-400" />
                        {[data.phone, ...data.otherPhones].filter((p): p is string => Boolean(p)).map((p) => (
                          <PhoneActions key={p} phone={p} />
                        ))}
                      </div>
                    )}
                    {data.linkedinUrl && <LinkedInButton url={data.linkedinUrl} label="LinkedIn page" />}
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {data.website && (
                        <a href={href(data.website)} target="_blank" rel="noreferrer" className={linkClass}>
                          <Globe className="h-3.5 w-3.5" /> {shortUrl(data.website)}
                        </a>
                      )}
                      {data.mapsUrl && (
                        <a href={data.mapsUrl} target="_blank" rel="noreferrer" className={linkClass}>
                          <MapPin className="h-3.5 w-3.5" /> {data.address ? data.address.slice(0, 50) : "Map"}
                        </a>
                      )}
                      {data.sourceUrl && (
                        <a href={data.sourceUrl} target="_blank" rel="noreferrer" className={linkClass}>
                          <ExternalLink className="h-3.5 w-3.5" /> Where it was found
                        </a>
                      )}
                    </p>
                    {data.crawlStatus === "failed" && <p className="text-xs text-amber-700 dark:text-amber-300">Website: {data.crawlError}</p>}
                    {data.website && data.crawlStatus !== "pending" && (
                      <button
                        type="button"
                        className="text-xs text-neutral-500 hover:underline"
                        disabled={busy !== null}
                        onClick={() => run("crawl", () => recrawl({ leadId: data._id }), "Reading the website again")}
                      >
                        Read website again
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* People */}
              <section className={cn(cardClass, "space-y-3 p-4")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={sectionTitle}>People ({data.people.length})</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={cn(softButtonClass, "h-8 px-3 text-xs")}
                      disabled={busy !== null || data.peopleRunning || data.stage === "do_not_contact"}
                      onClick={() =>
                        run("people", async () => {
                          const recent = data.peopleSearchedAt && Date.now() - data.peopleSearchedAt < 7 * 86_400_000;
                          const res = await findPeople({ leadIds: [data._id], force: Boolean(recent) });
                          toast.success(res.queued ? "Looking for people. This takes a minute or two." : "Nothing to search.");
                        })
                      }
                    >
                      {data.peopleRunning || busy === "people" ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserSearch className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {data.peopleRunning ? "Looking…" : data.peopleSearchedAt ? "Search again" : "Find people"}
                    </button>
                    <button
                      type="button"
                      className={cn(softButtonClass, "h-8 px-3 text-xs")}
                      disabled={busy !== null || data.contactsRunning || data.stage === "do_not_contact" || !data.website}
                      title={data.website ? undefined : "Add the company's website first"}
                      onClick={() =>
                        run("contacts", async () => {
                          const recent = data.contactsEnrichedAt && Date.now() - data.contactsEnrichedAt < 30 * 86_400_000;
                          const res = await findContacts({ leadIds: [data._id], force: Boolean(recent) });
                          toast.success(
                            res.queued
                              ? "Asking Hunter, Apollo and Prospeo. This takes a minute."
                              : res.noWebsite
                                ? "Add the company's website first."
                                : "Nothing to look up."
                          );
                        })
                      }
                    >
                      {data.contactsRunning || busy === "contacts" ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Search className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {data.contactsRunning ? "Looking…" : data.contactsEnrichedAt ? "Find contacts again" : "Find contacts"}
                    </button>
                    {!person && (
                      <button type="button" className={cn(softButtonClass, "h-8 px-3 text-xs")} onClick={() => setPerson({ ...emptyPerson })}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add person
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-neutral-500">
                  {data.peopleSearchedAt
                    ? `Searched ${formatDistanceToNowStrict(data.peopleSearchedAt, { addSuffix: true })}. `
                    : "Find people searches the web for HR, operations and health & safety leads. "}
                  Emails are only kept when a public page shows them.
                  {data.peopleSearchError && <span className="text-rose-600"> Last search: {data.peopleSearchError}</span>}
                </p>
                <div className="space-y-1 text-xs text-neutral-500">
                  <p>
                    {data.contactsEnrichedAt
                      ? `Find contacts ran ${formatDistanceToNowStrict(data.contactsEnrichedAt, { addSuffix: true })}. `
                      : "Find contacts asks Hunter, then Apollo and Prospeo, for named people and their work emails. "}
                    New emails are checked before anyone can email them.
                    {data.emailPattern && (
                      <>
                        {" "}
                        Email pattern: <code>{data.emailPattern}</code>
                      </>
                    )}
                    {data.contactsEnrichError && <span className="text-rose-600"> Last run: {data.contactsEnrichError}</span>}
                  </p>
                  {data.enrichResults.length > 0 && (
                    <ul className="space-y-0.5">
                      {data.enrichResults.map((r, i) => (
                        <li key={i}>
                          <span className="font-medium text-rh-ink dark:text-neutral-200">
                            {PROVIDER_NAME[r.provider]} · {r.step.toLowerCase()}:
                          </span>{" "}
                          <span className={cn(r.outcome === "refused" || r.outcome === "error" ? "text-rose-600" : r.outcome === "used_up" ? "text-amber-700 dark:text-amber-300" : "")}>
                            {r.message ?? r.outcome}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {person && (
                  <form
                    className="grid gap-2 rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.08] sm:grid-cols-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const ok = await run(
                        "person",
                        () =>
                          saveContact({
                            leadId: data._id,
                            ...(person.contactId ? { contactId: person.contactId } : {}),
                            name: person.name,
                            role: person.role,
                            ...(person.roleGroup ? { roleGroup: person.roleGroup } : {}),
                            email: person.email,
                            phone: person.phone,
                            linkedinUrl: person.linkedinUrl,
                            notes: person.notes,
                          }),
                        person.contactId ? "Saved" : "Person added"
                      );
                      if (ok) setPerson(null);
                    }}
                  >
                    {(
                      [
                        ["name", "Name"],
                        ["role", "Role, as written"],
                        ["email", "Work email"],
                        ["phone", "Phone"],
                        ["linkedinUrl", "LinkedIn profile"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="space-y-1 text-xs text-neutral-500">
                        {label}
                        <input value={person[key]} onChange={(e) => setPerson({ ...person, [key]: e.target.value })} className={fieldClass} />
                      </label>
                    ))}
                    <label className="space-y-1 text-xs text-neutral-500">
                      Group
                      <select
                        value={person.roleGroup}
                        onChange={(e) => setPerson({ ...person, roleGroup: e.target.value as RoleGroup | "" })}
                        className={fieldClass}
                      >
                        <option value="">From the role</option>
                        {ROLE_GROUPS.map((g) => (
                          <option key={g} value={g}>
                            {ROLE_GROUP_LABEL[g]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs text-neutral-500 sm:col-span-2">
                      Notes
                      <textarea rows={2} value={person.notes} onChange={(e) => setPerson({ ...person, notes: e.target.value })} className={textareaFieldClass} />
                    </label>
                    <div className="flex gap-2 sm:col-span-2">
                      <button type="submit" className={cn(primaryButtonClass, "h-9 px-4 text-sm")} disabled={busy !== null}>
                        {busy === "person" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
                      </button>
                      <button type="button" className={cn(softButtonClass, "h-9 px-4 text-sm")} onClick={() => setPerson(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {data.people.length === 0 ? (
                  !person && <p className="text-sm text-neutral-500">No people yet.</p>
                ) : (
                  <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                    {data.people.map((p) => (
                      <li key={p._id} className="space-y-1 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-rh-ink dark:text-white">
                            {p.name}
                            {p.nameIncomplete && <span className="ml-1 text-xs font-normal text-neutral-500">(Apollo hides the rest of the surname)</span>}
                          </p>
                          <StatusBadge tone="teal">{ROLE_GROUP_LABEL[p.roleGroup]}</StatusBadge>
                          <StatusBadge tone="neutral">{SOURCE_LABEL[p.source]}</StatusBadge>
                          {p.doNotContact && <StatusBadge tone="red">Do not contact</StatusBadge>}
                          {p.bounced && <StatusBadge tone="amber">Email bounced</StatusBadge>}
                          <span className="ml-auto flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Edit ${p.name}`}
                              className="text-neutral-400 hover:text-rh-ink dark:hover:text-white"
                              onClick={() =>
                                setPerson({
                                  contactId: p._id,
                                  name: p.name,
                                  role: p.role ?? "",
                                  roleGroup: p.roleGroup,
                                  email: p.email ?? "",
                                  phone: p.phone ?? "",
                                  linkedinUrl: p.linkedinUrl ?? "",
                                  notes: p.notes ?? "",
                                })
                              }
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {!p.doNotContact && (
                              <button
                                type="button"
                                aria-label={`Remove ${p.name}`}
                                className="text-neutral-400 hover:text-rose-600"
                                disabled={busy !== null}
                                onClick={() => run(`del-${p._id}`, () => deleteContact({ contactId: p._id }), "Removed")}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </span>
                        </div>
                        {p.role && <p className="text-xs text-neutral-500">{p.role}</p>}
                        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {p.email && (
                            <span className="inline-flex items-center gap-1 text-rh-ink dark:text-white">
                              <Mail className="h-3 w-3 text-neutral-400" />
                              <a href={`mailto:${p.email}`} className="hover:underline">
                                {p.email}
                              </a>
                              {p.emailStatus && <span className="text-neutral-500">({EMAIL_FROM[p.emailStatus]})</span>}
                            </span>
                          )}
                          {p.sourceUrl && p.sourceUrl !== p.linkedinUrl && (
                            <a href={p.sourceUrl} target="_blank" rel="noreferrer" className={linkClass}>
                              <ExternalLink className="h-3 w-3" /> Source
                            </a>
                          )}
                        </p>
                        {p.email && !p.doNotContact && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {p.verifyStatus ? (
                              <StatusBadge tone={VERIFY_TONE[p.verifyStatus]} className="gap-1">
                                <ShieldCheck className="h-3 w-3" /> {VERIFY_LABEL[p.verifyStatus]}
                              </StatusBadge>
                            ) : (
                              <StatusBadge tone="neutral">Not checked</StatusBadge>
                            )}
                            <span className="text-neutral-500">
                              {p.verifyStatus
                                ? `${VERIFY_HINT[p.verifyStatus]}${p.verifiedBy ? ` Checked by ${PROVIDER_NAME[p.verifiedBy]}` : ""}${p.verifiedAt ? ` ${formatDistanceToNowStrict(p.verifiedAt, { addSuffix: true })}.` : p.verifiedBy ? "." : ""}`
                                : p.sendable
                                  ? "Can be emailed (typed by the team or shown on a public page)."
                                  : "Check it before it can be emailed."}
                              {p.confidence !== null && ` Hunter's confidence: ${p.confidence}%.`}
                            </span>
                            {(!p.verifyStatus || p.verifyStatus === "unknown") && (
                              <button
                                type="button"
                                className={cn(softButtonClass, "h-7 px-2 text-xs")}
                                disabled={busy !== null}
                                onClick={() => check(p._id, false)}
                              >
                                {busy === `check-${p._id}` && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Check
                              </button>
                            )}
                            {(p.verifyStatus === "accept_all" || p.verifyStatus === "unknown" || p.verifyStatus === "webmail") && (
                              <label className="flex items-center gap-1.5 text-rh-ink dark:text-white">
                                <input
                                  type="checkbox"
                                  className={checkboxClass}
                                  checked={p.sendAnyway}
                                  disabled={busy !== null}
                                  onChange={(e) =>
                                    run(
                                      `anyway-${p._id}`,
                                      () => setSendAnyway({ contactId: p._id, sendAnyway: e.target.checked }),
                                      e.target.checked ? "This email can now be added to a sequence" : "Saved"
                                    )
                                  }
                                />
                                Send anyway
                              </label>
                            )}
                          </div>
                        )}
                        {!p.email && p.suggestedEmail && !p.doNotContact && (
                          <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                            Probably <span className="text-rh-ink dark:text-white">{p.suggestedEmail}</span> (from the company&apos;s pattern, not
                            checked)
                            <button
                              type="button"
                              className={cn(softButtonClass, "h-7 px-2 text-xs")}
                              disabled={busy !== null}
                              onClick={() => check(p._id, true)}
                            >
                              {busy === `check-${p._id}` && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Check it
                            </button>
                          </p>
                        )}
                        {(p.phone || p.linkedinUrl) && (
                          <div className="flex flex-wrap items-center gap-2">
                            {p.phone && <PhoneActions phone={p.phone} />}
                            {p.linkedinUrl && <LinkedInButton url={p.linkedinUrl} />}
                          </div>
                        )}
                        {p.notes && <p className="text-xs text-neutral-500">{p.notes}</p>}
                        <label className="flex items-center gap-2 text-xs text-neutral-500">
                          <input
                            type="checkbox"
                            className={checkboxClass}
                            checked={p.doNotContact}
                            disabled={busy !== null}
                            onChange={(e) =>
                              run(
                                `dnc-${p._id}`,
                                () =>
                                  saveContact({
                                    leadId: data._id,
                                    contactId: p._id,
                                    name: p.name,
                                    role: p.role ?? undefined,
                                    roleGroup: p.roleGroup,
                                    email: p.email ?? undefined,
                                    phone: p.phone ?? undefined,
                                    linkedinUrl: p.linkedinUrl ?? undefined,
                                    notes: p.notes ?? undefined,
                                    doNotContact: e.target.checked,
                                  }),
                                e.target.checked ? "Marked do not contact" : "Saved"
                              )
                            }
                          />
                          Do not contact
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Emails */}
              <section className={cn(cardClass, "space-y-3 p-4")}>
                <p className={sectionTitle}>Emails</p>
                {data.enrollments.length === 0 ? (
                  <p className="text-sm text-neutral-500">Not in a sequence. Tick the company on the list and press Add to sequence.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.enrollments.map((e) => (
                      <li key={e._id} className="flex flex-wrap items-center gap-2 text-xs">
                        <StatusBadge tone={e.status === "replied" ? "green" : e.status === "active" ? "teal" : e.status === "bounced" ? "amber" : "neutral"}>
                          {ENROLL_LABEL[e.status]}
                        </StatusBadge>
                        <span className="text-rh-ink dark:text-white">{e.personName ? `${e.personName} · ${e.email}` : e.email}</span>
                        <span className="text-neutral-500">
                          {e.sequenceName} · {e.sentSteps} sent
                          {e.status === "active" && e.nextSendAt
                            ? ` · next ${e.nextSendAt <= Date.now() ? "in the next sending window" : format(e.nextSendAt, "EEE d MMM")}`
                            : ""}
                          {e.stoppedReason && e.status !== "active" ? ` · ${e.stoppedReason}` : ""}
                        </span>
                        {e.status === "active" && (
                          <button
                            type="button"
                            className="ml-auto text-neutral-500 hover:text-rose-600 hover:underline"
                            disabled={busy !== null}
                            onClick={() => run(`stop-${e._id}`, () => stopEnrollment({ enrollmentId: e._id }), "Removed from the sequence")}
                          >
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {data.inbox.length > 0 && (
                  <ul className="space-y-2 border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
                    {data.inbox.map((m) => (
                      <li key={m._id} className="space-y-0.5 text-xs">
                        <p className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={m.kind === "bounce" ? "amber" : m.intent === "stop" ? "red" : m.kind === "auto_reply" ? "neutral" : "green"}>
                            {m.kind === "bounce"
                              ? "Bounced"
                              : m.kind === "auto_reply"
                                ? "Automatic reply"
                                : m.intent === "stop"
                                  ? "Asked to stop"
                                  : m.intent === "not_interested"
                                    ? "Not interested"
                                    : "Replied"}
                          </StatusBadge>
                          <span className="text-neutral-500">
                            {m.fromEmail} · {formatDistanceToNowStrict(m.receivedAt, { addSuffix: true })}
                          </span>
                        </p>
                        {m.snippet && <p className="text-sm text-neutral-700 dark:text-neutral-300">{m.snippet}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Notes and the timeline */}
              <section className={cn(cardClass, "space-y-3 p-4")}>
                <p className={sectionTitle}>Notes and activity</p>
                <form
                  className="space-y-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await run("note", () => addNote({ leadId: data._id, text: note }), "Note added")) setNote("");
                  }}
                >
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What happened? e.g. Called HR, they want a proposal for 150 riders"
                    aria-label="Note"
                    className={textareaFieldClass}
                  />
                  <button type="submit" className={cn(softButtonClass, "h-8 px-3 text-xs")} disabled={busy !== null || !note.trim()}>
                    {busy === "note" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Add note
                  </button>
                </form>
                {data.activities.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nothing yet.</p>
                ) : (
                  <ol className="space-y-2.5 border-l border-black/[0.08] pl-4 dark:border-white/[0.1]">
                    {data.activities.map((a) => (
                      <li key={a._id} className="relative text-sm">
                        <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-rh-lime" aria-hidden />
                        <p className="text-rh-ink dark:text-white">{a.text}</p>
                        <p className="text-xs text-neutral-500">
                          {format(a.at, "d MMM yyyy, HH:mm")}
                          {a.by ? ` · ${a.by}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
