"use client";

/**
 * Employer outreach ("Rehabify for Work" sales): find companies by city and sector (Google Places
 * and an AI web search), find the people in HR, operations and health & safety, email them from
 * the team's own inbox with follow-ups (Sequences tab), and move each company through the
 * pipeline by hand (convex/employerOutreach.ts). Same look and engine as Clinic outreach.
 */

import { useMemo, useState } from "react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Download, Globe, Loader2, Search, Send, UserSearch } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmployerCompanyDrawer } from "@/components/admin/outreach/EmployerCompanyDrawer";
import { EmployerSequences } from "@/components/admin/outreach/EmployerSequences";
import { OutreachGuide } from "@/components/admin/outreach/OutreachHelp";
import { SentEmails } from "@/components/admin/outreach/SentEmails";
import { STAGE_TONE, employerApi, errorText, lagosDay, type CompanyRow, type Source } from "@/components/admin/outreach/employerApi";
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
  cardClass,
  checkboxClass,
  downloadCsv,
  fieldClass,
  formatNaira,
  primaryButtonClass,
  softButtonClass,
  tableWrapClass,
  tabsListClass,
} from "@/components/admin/ui";
import {
  EMPLOYER_SECTORS,
  EMPLOYER_STAGES,
  MAX_PEOPLE_RUN,
  MAX_SECTORS_PER_RUN,
  ROLE_GROUPS,
  ROLE_GROUP_LABEL,
  SECTOR_LABEL,
  STAGE_LABEL,
  type EmployerStage,
  type RoleGroup,
} from "@/lib/employerOutreach";
import { cn } from "@/lib/utils";

const PAGE = 100;
const SOURCE_LABEL: Record<string, string> = { google_places: "Google", web_search: "AI search" };
const GROUP_SHORT: Record<RoleGroup, string> = { hr: "HR", operations: "Ops", hse: "HSE", leadership: "Leaders", other: "Other" };

/** "2 people (HR, HSE) · hr@ · phone" */
function contactsSummary(c: CompanyRow) {
  const parts: string[] = [];
  if (c.people.count) {
    const groups = c.people.groups.filter((g) => g !== "other").map((g) => GROUP_SHORT[g]);
    parts.push(`${c.people.count} ${c.people.count === 1 ? "person" : "people"}${groups.length ? ` (${groups.join(", ")})` : ""}`);
  }
  if (c.email) parts.push(`${c.email.split("@")[0]}@`);
  const phones = (c.phone ? 1 : 0) + c.extraPhones;
  if (phones) parts.push(phones === 1 ? "phone" : `${phones} phones`);
  return parts.join(" · ");
}

export default function EmployerOutreachPage() {
  const [tab, setTab] = useState<"companies" | "sequences" | "sent">("companies");
  const data = useQuery(employerApi.companies, {});
  const convex = useConvex();
  const find = useAction(employerApi.find);
  const update = useMutation(employerApi.update);
  const setStages = useMutation(employerApi.setStage);
  const findPeople = useMutation(employerApi.findPeople);
  const enroll = useMutation(employerApi.enroll);

  // Finding
  const [searchCity, setSearchCity] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [sectors, setSectors] = useState<string[]>([]);
  const [otherQuery, setOtherQuery] = useState("");
  const [useGoogle, setUseGoogle] = useState(true);
  const [useAi, setUseAi] = useState(true);
  const [finding, setFinding] = useState(false);

  // Filters
  const [stage, setStage] = useState<EmployerStage | "all">("all");
  const [city, setCity] = useState("");
  const [sector, setSector] = useState("");
  const [owner, setOwner] = useState("");
  const [namedOnly, setNamedOnly] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Bulk dialogs
  const [enrolOpen, setEnrolOpen] = useState(false);
  const [enrolSeq, setEnrolSeq] = useState("");
  const [enrolCompany, setEnrolCompany] = useState(true);
  const [enrolPeople, setEnrolPeople] = useState(true);
  const [enrolGroups, setEnrolGroups] = useState<RoleGroup[]>([]);
  const sequences = useQuery(employerApi.sequences, enrolOpen ? {} : "skip");
  const [stageOpen, setStageOpen] = useState(false);
  const [bulkStage, setBulkStage] = useState<EmployerStage>("contacted");

  const sources = useMemo(() => {
    const out: Source[] = [];
    if (useGoogle && data?.finders.googlePlaces) out.push("google_places");
    if (useAi && data?.finders.aiSearch) out.push("web_search");
    return out;
  }, [useGoogle, useAi, data?.finders]);

  const ownerName = useMemo(() => new Map((data?.owners ?? []).map((o) => [o._id, o.name])), [data?.owners]);
  const today = lagosDay(Date.now());
  const isDue = (c: CompanyRow) => c.nextFollowUpAt !== null && lagosDay(c.nextFollowUpAt) <= today;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.companies ?? []).filter(
      (c) =>
        (stage === "all" || c.stage === stage) &&
        (!city || c.city === city) &&
        (!sector || c.sector === sector) &&
        (!owner || (owner === "none" ? !c.ownerId : c.ownerId === owner)) &&
        (!namedOnly || c.people.count > 0) &&
        (!dueOnly || isDue(c)) &&
        (!q || c.name.toLowerCase().includes(q) || (c.website ?? "").toLowerCase().includes(q) || (c.email ?? "").includes(q))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.companies, stage, city, sector, owner, namedOnly, dueOnly, search, today]);
  const visible = filtered.slice(0, shown);
  const selectedIds = [...selected].filter((id) => data?.companies.some((c) => c._id === id));
  const dueCount = (data?.companies ?? []).filter(isDue).length;

  const run = async (key: string, task: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await task();
      if (done) toast.success(done);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const toggleSector = (key: string) =>
    setSectors((cur) => {
      if (cur.includes(key)) return cur.filter((k) => k !== key);
      if (cur.length >= MAX_SECTORS_PER_RUN) {
        toast.error(`Choose up to ${MAX_SECTORS_PER_RUN} sectors at a time.`);
        return cur;
      }
      return [...cur, key];
    });

  const findCompanies = async () => {
    if (!searchCity.trim()) return toast.error("Type a city first.");
    if (sectors.length === 0) return toast.error("Choose at least one sector.");
    setFinding(true);
    try {
      const res = await find({
        city: searchCity.trim(),
        country: country.trim() || undefined,
        sectors,
        ...(sectors.includes("other") ? { otherQuery } : {}),
        sources,
      });
      res.errors.forEach((e) => toast.error(e));
      toast.success(
        `Found ${res.found} compan${res.found === 1 ? "y" : "ies"}: ${res.added} new${res.updated ? `, ${res.updated} updated` : ""}. Reading their websites for emails and phones now.`
      );
      setCity(searchCity.trim());
      setStage("all");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setFinding(false);
    }
  };

  const exportCsv = (ids?: string[]) =>
    run("export", async () => {
      const { rows } = await convex.query(employerApi.exportRows, ids ? { leadIds: ids } : {});
      if (rows.length === 0) return toast.message("Nothing to export.");
      downloadCsv(`employer-outreach-${new Date().toISOString().slice(0, 10)}`, rows);
      toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}.`);
    });

  const bulkFindPeople = () => {
    if (selectedIds.length > MAX_PEOPLE_RUN) return toast.error(`Find people for up to ${MAX_PEOPLE_RUN} companies at a time.`);
    run("people", async () => {
      const res = await findPeople({ leadIds: selectedIds });
      toast.success(
        res.queued
          ? `Looking for people at ${res.queued} compan${res.queued === 1 ? "y" : "ies"}, one at a time.${res.skipped ? ` ${res.skipped} skipped (searched in the last 7 days, or do not contact).` : ""}`
          : "All of these were searched in the last 7 days. Open a company to search it again."
      );
    });
  };

  const counts = data?.counts ?? {};
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c._id));

  return (
    <AdminPage>
      <PageHeader
        title="Employer outreach"
        description="Rehabify for Work: find companies by city and sector, find their HR, operations and health & safety people, email them from the team's inbox and track each deal."
        actions={
          tab === "companies" && (
            <button
              type="button"
              onClick={() => exportCsv(filtered.length && filtered.length !== data?.total ? filtered.map((c) => c._id) : undefined)}
              disabled={busy !== null || !data || data.total === 0}
              className={softButtonClass}
            >
              {busy === "export" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
              Export {filtered.length !== data?.total ? `${filtered.length} shown` : "all"} (CSV)
            </button>
          )
        }
      />

      <OutreachGuide audience="employer" onShowSent={() => setTab("sent")} />

      <Tabs value={tab} onValueChange={(value) => setTab(value as "companies" | "sequences" | "sent")}>
        <TabsList className={tabsListClass}>
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
          <TabsTrigger value="sent">Sent emails</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "sent" ? (
        <SentEmails audience="employer" onOpenLead={setOpenId} />
      ) : tab === "sequences" ? (
        <EmployerSequences onOpenCompany={setOpenId} />
      ) : (
        <>
          <Panel title="Find companies" description="Searches a city by sector, adds companies you don't have yet, and reads each website for emails and phones.">
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
                <input
                  value={searchCity}
                  onChange={(e) => setSearchCity(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !finding && sources.length > 0 && findCompanies()}
                  placeholder="City, e.g. Lagos"
                  aria-label="City"
                  className={fieldClass}
                />
                <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" aria-label="Country" className={fieldClass} />
                <button
                  type="button"
                  onClick={findCompanies}
                  disabled={finding || sources.length === 0 || sectors.length === 0}
                  className={primaryButtonClass}
                >
                  {finding ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
                  {finding ? "Searching…" : "Find companies"}
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-neutral-500">Sectors (up to {MAX_SECTORS_PER_RUN} at a time)</p>
                <div className="flex flex-wrap gap-1.5">
                  {EMPLOYER_SECTORS.map((s) => {
                    const on = sectors.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleSector(s.key)}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime",
                          on
                            ? "bg-rh-lime text-rh-ink"
                            : "bg-white text-neutral-600 shadow-soft hover:text-rh-ink dark:bg-rh-ink-2 dark:text-neutral-300 dark:hover:text-white"
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                {sectors.includes("other") && (
                  <input
                    value={otherQuery}
                    onChange={(e) => setOtherQuery(e.target.value)}
                    placeholder="What to look for, e.g. cement company"
                    aria-label="Other: what to look for"
                    className={cn(fieldClass, "max-w-md")}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-rh-ink dark:text-white">
                <label className={cn("flex items-center gap-2", !data?.finders.googlePlaces && "opacity-60")}>
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={useGoogle && Boolean(data?.finders.googlePlaces)}
                    disabled={!data?.finders.googlePlaces}
                    onChange={(e) => setUseGoogle(e.target.checked)}
                  />
                  Google Maps listings
                  {data && !data.finders.googlePlaces && <span className="text-xs text-neutral-500">(add GOOGLE_PLACES_API_KEY on Convex)</span>}
                </label>
                <label className={cn("flex items-center gap-2", !data?.finders.aiSearch && "opacity-60")}>
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={useAi && Boolean(data?.finders.aiSearch)}
                    disabled={!data?.finders.aiSearch}
                    onChange={(e) => setUseAi(e.target.checked)}
                  />
                  AI web search (websites, directories, staff size)
                </label>
              </div>
              {finding && <p className="text-xs text-neutral-500">This can take a minute or two: each sector is searched separately.</p>}
              {data && data.crawling > 0 && (
                <p className="flex items-center gap-2 text-xs text-neutral-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading {data.crawling} website{data.crawling === 1 ? "" : "s"} for emails and phones…
                </p>
              )}
              {data && data.searches.length > 0 && (
                <ul className="space-y-1 text-xs text-neutral-500">
                  {data.searches.slice(0, 6).map((s, i) => (
                    <li key={i}>
                      {s.city} · {s.sector ? (SECTOR_LABEL[s.sector] ?? s.sector) : "Companies"} · {SOURCE_LABEL[s.source] ?? s.source}:{" "}
                      {s.error ? <span className="text-rose-600">{s.error}</span> : `${s.found} found, ${s.added} new`} ·{" "}
                      {formatDistanceToNowStrict(s.at, { addSuffix: true })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          {/* The pipeline: a count per stage (press to filter) and what's live */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {EMPLOYER_STAGES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={stage === s}
                onClick={() => {
                  setStage(stage === s ? "all" : s);
                  setShown(PAGE);
                }}
                className={cn(
                  cardClass,
                  "p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime",
                  stage === s ? "bg-rh-lime text-rh-ink dark:bg-rh-lime" : "hover:bg-rh-canvas dark:hover:bg-white/[0.03]"
                )}
              >
                <p className={cn("text-xs", stage === s ? "text-rh-ink" : "text-neutral-500 dark:text-neutral-400")}>{STAGE_LABEL[s]}</p>
                <p className={cn("text-xl font-semibold tabular-nums", stage === s ? "text-rh-ink" : "text-rh-ink dark:text-white")}>
                  {data ? (counts[s] ?? 0) : "—"}
                </p>
              </button>
            ))}
            <div className={cn(cardClass, "col-span-2 p-3")}>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Pilot live and paying</p>
              <p className="text-xl font-semibold tabular-nums text-rh-ink dark:text-white">
                {data ? `${formatNaira(data.pipelineValue)} a month` : "—"}
              </p>
            </div>
          </div>

          <Panel
            title={`Companies${data ? ` (${filtered.length}${filtered.length !== data.total ? ` of ${data.total}` : ""})` : ""}`}
            actions={
              stage !== "all" ? (
                <button type="button" className="text-xs text-neutral-500 hover:underline" onClick={() => setStage("all")}>
                  Show every stage
                </button>
              ) : undefined
            }
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.05] px-5 py-3 dark:border-white/[0.06]">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShown(PAGE);
                }}
                placeholder="Search name, website or email"
                aria-label="Search companies"
                className={cn(fieldClass, "h-9 w-full py-1 sm:w-56")}
              />
              <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City" className={cn(fieldClass, "h-9 w-auto py-1")}>
                <option value="">All cities</option>
                {(data?.cities ?? []).map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.count})
                  </option>
                ))}
              </select>
              <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector" className={cn(fieldClass, "h-9 w-auto py-1")}>
                <option value="">All sectors</option>
                {EMPLOYER_SECTORS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner" className={cn(fieldClass, "h-9 w-auto py-1")}>
                <option value="">Any owner</option>
                <option value="none">No owner</option>
                {(data?.owners ?? []).map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-rh-ink dark:text-white">
                <input type="checkbox" className={checkboxClass} checked={namedOnly} onChange={(e) => setNamedOnly(e.target.checked)} />
                Has a named person
              </label>
              <label className="flex items-center gap-2 text-xs text-rh-ink dark:text-white">
                <input type="checkbox" className={checkboxClass} checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
                Follow-up due{dueCount ? ` (${dueCount})` : ""}
              </label>
            </div>

            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.05] bg-rh-honeydew/60 px-5 py-2.5 text-sm dark:border-white/[0.06] dark:bg-white/[0.04]">
                <span className="font-medium text-rh-ink dark:text-white">{selectedIds.length} selected</span>
                <button type="button" className={cn(softButtonClass, "h-8 px-3 text-xs")} disabled={busy !== null} onClick={bulkFindPeople}>
                  {busy === "people" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserSearch className="mr-1.5 h-3.5 w-3.5" />}
                  Find people
                </button>
                <button type="button" className={cn(softButtonClass, "h-8 px-3 text-xs")} disabled={busy !== null} onClick={() => setEnrolOpen(true)}>
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Add to sequence
                </button>
                <button type="button" className={cn(softButtonClass, "h-8 px-3 text-xs")} disabled={busy !== null} onClick={() => setStageOpen(true)}>
                  Set stage
                </button>
                <button type="button" className={cn(softButtonClass, "h-8 px-3 text-xs")} disabled={busy !== null} onClick={() => exportCsv(selectedIds)}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
                </button>
                <button type="button" className="text-xs text-neutral-500 hover:underline" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </div>
            )}

            {data === undefined ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title={data.total === 0 ? "No companies yet" : "Nothing here"}
                description={data.total === 0 ? "Type a city, choose sectors above and press Find companies." : "Try another filter."}
              />
            ) : (
              <div className={tableWrapClass}>
                <table className="w-full min-w-[960px] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="w-10 px-5 py-2.5">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label="Select all shown"
                          checked={allVisibleSelected}
                          onChange={(e) =>
                            setSelected((cur) => {
                              const next = new Set(cur);
                              for (const c of visible) {
                                if (e.target.checked) next.add(c._id);
                                else next.delete(c._id);
                              }
                              return next;
                            })
                          }
                        />
                      </th>
                      <th className="px-2 py-2.5">Company</th>
                      <th className="px-2 py-2.5">Sector</th>
                      <th className="px-2 py-2.5">City</th>
                      <th className="px-2 py-2.5">Staff</th>
                      <th className="px-2 py-2.5">Contacts</th>
                      <th className="px-2 py-2.5">Stage</th>
                      <th className="px-2 py-2.5">Follow-up</th>
                      <th className="px-2 py-2.5 pr-5">Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((c) => {
                      const summary = contactsSummary(c);
                      return (
                        <tr key={c._id} className="border-b align-top">
                          <td className="px-5 py-3">
                            <input
                              type="checkbox"
                              className={checkboxClass}
                              aria-label={`Select ${c.name}`}
                              checked={selected.has(c._id)}
                              onChange={(e) =>
                                setSelected((cur) => {
                                  const next = new Set(cur);
                                  if (e.target.checked) next.add(c._id);
                                  else next.delete(c._id);
                                  return next;
                                })
                              }
                            />
                          </td>
                          <td className="max-w-[260px] px-2 py-3">
                            <button
                              type="button"
                              className="text-left font-medium text-rh-ink hover:underline dark:text-white"
                              onClick={() => setOpenId(c._id)}
                            >
                              {c.name}
                            </button>
                            {c.website && (
                              <p className="flex items-center gap-1 truncate text-xs text-neutral-500">
                                <Globe className="h-3 w-3 shrink-0" />
                                {c.website.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-3 text-xs text-neutral-600 dark:text-neutral-300">{c.sector ? (SECTOR_LABEL[c.sector] ?? c.sector) : "—"}</td>
                          <td className="px-2 py-3 text-xs text-neutral-600 dark:text-neutral-300">{c.city || "—"}</td>
                          <td className="px-2 py-3 text-xs text-neutral-600 dark:text-neutral-300">{c.staffSize ?? "—"}</td>
                          <td className="max-w-[220px] px-2 py-3 text-xs">
                            {c.peopleRunning ? (
                              <span className="inline-flex items-center gap-1 text-neutral-500">
                                <Loader2 className="h-3 w-3 animate-spin" /> Looking for people…
                              </span>
                            ) : summary ? (
                              <span className="text-rh-ink dark:text-white">{summary}</span>
                            ) : c.crawlStatus === "pending" ? (
                              <span className="text-neutral-500">Reading the website…</span>
                            ) : (
                              <span className="text-neutral-500">None yet</span>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            <select
                              value={c.stage}
                              aria-label={`Stage of ${c.name}`}
                              disabled={busy !== null}
                              onChange={(e) => run(`stage-${c._id}`, () => update({ leadId: c._id, stage: e.target.value as EmployerStage }))}
                              className={cn(fieldClass, "h-8 w-auto py-1 text-xs")}
                            >
                              {EMPLOYER_STAGES.map((s) => (
                                <option key={s} value={s}>
                                  {STAGE_LABEL[s]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-3 text-xs">
                            {c.nextFollowUpAt ? (
                              isDue(c) ? (
                                <StatusBadge tone="amber">{format(c.nextFollowUpAt, "EEE d MMM")}</StatusBadge>
                              ) : (
                                <span className="text-neutral-600 dark:text-neutral-300">{format(c.nextFollowUpAt, "EEE d MMM")}</span>
                              )
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="px-2 py-3 pr-5 text-xs text-neutral-600 dark:text-neutral-300">
                            {c.ownerId ? (ownerName.get(c.ownerId) ?? "Admin") : "—"}
                            {(c.stage === "pilot_live" || c.stage === "paying") && c.dealValueNaira ? (
                              <StatusBadge tone={STAGE_TONE[c.stage]} className="ml-1">
                                {formatNaira(c.dealValueNaira)}
                              </StatusBadge>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length > shown && (
                  <div className="px-5 py-3">
                    <button type="button" className={cn(softButtonClass, "h-9 px-4 text-sm")} onClick={() => setShown(shown + PAGE)}>
                      Show {Math.min(PAGE, filtered.length - shown)} more
                    </button>
                  </div>
                )}
              </div>
            )}
            {data?.capped && (
              <p className="border-t border-black/[0.05] px-5 py-3 text-xs text-amber-700 dark:border-white/[0.06] dark:text-amber-300">
                Showing the first {data.total} companies.
              </p>
            )}
          </Panel>

          <p className="text-xs text-neutral-500">
            Emails go from the team&apos;s own hello@ inbox, never from Rehabify&apos;s product email. People&apos;s emails are only kept when a
            public page shows them, and LinkedIn is never read directly. Anyone marked &ldquo;Do not contact&rdquo; stays that way in later
            searches, on both outreach lists.
          </p>
        </>
      )}

      <EmployerCompanyDrawer leadId={openId} owners={data?.owners ?? []} onClose={() => setOpenId(null)} />

      <ConfirmDialog
        open={enrolOpen}
        onOpenChange={setEnrolOpen}
        title={`Add ${selectedIds.length} compan${selectedIds.length === 1 ? "y" : "ies"} to a sequence`}
        description="Each address is only ever emailed once, and anyone marked do not contact is left out. Companies that replied are skipped."
        confirmLabel="Add"
        confirmDisabled={!enrolSeq || (!enrolCompany && !enrolPeople)}
        onConfirm={async () => {
          try {
            const res = await enroll({
              sequenceId: enrolSeq,
              leadIds: selectedIds,
              companyEmail: enrolCompany,
              people: enrolPeople,
              ...(enrolGroups.length ? { roleGroups: enrolGroups } : {}),
            });
            toast.success(
              `Added ${res.added} address${res.added === 1 ? "" : "es"} at ${res.companies} compan${res.companies === 1 ? "y" : "ies"}${
                res.skipped ? `. ${res.skipped} skipped: no usable email, already emailed, replied or do not contact` : ""
              }.`
            );
          } catch (err) {
            toast.error(errorText(err));
            throw err;
          }
        }}
      >
        <div className="space-y-3 text-sm text-rh-ink dark:text-white">
          {sequences === undefined ? (
            <Skeleton className="h-10 rounded-xl" />
          ) : sequences.sequences.length === 0 ? (
            <p className="text-neutral-500">Make a sequence on the Sequences tab first.</p>
          ) : (
            <select
              value={enrolSeq}
              onChange={(e) => setEnrolSeq(e.target.value)}
              aria-label="Sequence"
              className={fieldClass}
            >
              <option value="">Choose a sequence</option>
              {sequences.sequences.map((q) => (
                <option key={q._id} value={q._id}>
                  {q.name}
                  {q.status === "active" ? "" : q.status === "draft" ? " (draft: nothing sends until it's set to Sending)" : " (paused)"}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" className={checkboxClass} checked={enrolCompany} onChange={(e) => setEnrolCompany(e.target.checked)} />
            The company&apos;s own email
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className={checkboxClass} checked={enrolPeople} onChange={(e) => setEnrolPeople(e.target.checked)} />
            Named people with an email
          </label>
          {enrolPeople && (
            <div className="space-y-1.5">
              <p className="text-xs text-neutral-500">Only these groups (none ticked: everyone)</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {ROLE_GROUPS.map((g) => (
                  <label key={g} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={enrolGroups.includes(g)}
                      onChange={(e) => setEnrolGroups((cur) => (e.target.checked ? [...cur, g] : cur.filter((x) => x !== g)))}
                    />
                    {ROLE_GROUP_LABEL[g]}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={stageOpen}
        onOpenChange={setStageOpen}
        title={`Set the stage of ${selectedIds.length} compan${selectedIds.length === 1 ? "y" : "ies"}`}
        description={bulkStage === "do_not_contact" ? "Do not contact stops their emails and marks their addresses and people so." : undefined}
        confirmLabel="Set stage"
        destructive={bulkStage === "do_not_contact"}
        onConfirm={async () => {
          try {
            const res = await setStages({ leadIds: selectedIds, stage: bulkStage });
            toast.success(`${res.changed} compan${res.changed === 1 ? "y" : "ies"} moved to ${STAGE_LABEL[bulkStage]}.`);
          } catch (err) {
            toast.error(errorText(err));
            throw err;
          }
        }}
      >
        <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value as EmployerStage)} aria-label="Stage" className={fieldClass}>
          {EMPLOYER_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
      </ConfirmDialog>
    </AdminPage>
  );
}
