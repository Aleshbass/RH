"use client";

/**
 * Clinic outreach: find physiotherapy clinics city by city (Google Places and an AI web search),
 * read a contact email from each website and work through the list (convex/outreach.ts), then email
 * them from the team's own inbox with follow-ups (Send emails tab, convex/outreachSend.ts).
 */

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import {
  Download,
  Globe,
  Loader2,
  MapPin,
  Phone,
  Search,
} from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OutreachSender } from "@/components/admin/outreach/OutreachSender";
import {
  AdminPage,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  downloadCsv,
  inputClass,
  primaryButtonClass,
  softButtonClass,
  tabsListClass,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";

type Status =
  | "new"
  | "ready"
  | "no_email"
  | "exported"
  | "contacted"
  | "replied"
  | "not_interested"
  | "do_not_contact"
  | "on_rehabify"
  | "bounced";
type Source = "google_places" | "web_search";
type Lead = {
  _id: string;
  name: string;
  city: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  otherEmails: string[];
  website: string | null;
  mapsUrl: string | null;
  rating: number | null;
  reviews: number | null;
  source: Source | "admin";
  sourceUrl: string | null;
  status: Status;
  crawlStatus: "pending" | "done" | "failed" | null;
  note: string | null;
  exportedAt: number | null;
  createdAt: number;
};
type Data = {
  leads: Lead[];
  total: number;
  counts: Partial<Record<Status, number>>;
  cities: { name: string; count: number }[];
  finders: { googlePlaces: boolean; aiSearch: boolean };
  searches: {
    city: string;
    source: string;
    found: number;
    added: number;
    error: string | null;
    at: number;
  }[];
  crawling: number;
};

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const leadsRef = makeFunctionReference<
  "query",
  { status?: Status; city?: string },
  Data
>("outreach:adminLeads");
const findRef = makeFunctionReference<
  "action",
  { city: string; country?: string; sources: Source[] },
  { found: number; added: number; updated: number; errors: string[] }
>("outreach:adminFindClinics");
const updateRef = makeFunctionReference<
  "mutation",
  { leadId: string; email?: string; status?: Status; note?: string },
  null
>("outreach:adminUpdateLead");
const recrawlRef = makeFunctionReference<
  "mutation",
  { leadId: string; website?: string },
  null
>("outreach:adminRecrawl");
const exportRef = makeFunctionReference<
  "mutation",
  { city?: string; includeExported?: boolean },
  { rows: Record<string, string>[] }
>("outreach:adminExportLeads");

const STATUS: Record<
  Status,
  { label: string; tone: "green" | "teal" | "amber" | "red" | "neutral" }
> = {
  new: { label: "Looking for email", tone: "neutral" },
  ready: { label: "Ready", tone: "green" },
  no_email: { label: "No email found", tone: "amber" },
  exported: { label: "Exported", tone: "teal" },
  contacted: { label: "Contacted", tone: "teal" },
  replied: { label: "Replied", tone: "green" },
  not_interested: { label: "Not interested", tone: "neutral" },
  do_not_contact: { label: "Do not contact", tone: "red" },
  on_rehabify: { label: "On Rehabify", tone: "green" },
  bounced: { label: "Email bounced", tone: "amber" },
};
const SOURCE_LABEL: Record<Lead["source"], string> = {
  google_places: "Google",
  web_search: "AI search",
  admin: "Added",
};
const FILTERS: (Status | "all")[] = [
  "all",
  "ready",
  "new",
  "no_email",
  "exported",
  "contacted",
  "replied",
  "not_interested",
  "bounced",
  "do_not_contact",
  "on_rehabify",
];

const errorText = (
  err: unknown,
  fallback = "Something went wrong. Please try again.",
) =>
  err instanceof ConvexError && typeof err.data === "string"
    ? err.data
    : err instanceof Error
      ? err.message.replace(/^.*ConvexError: /, "").split("\n")[0]
      : fallback;

export default function ClinicOutreachPage() {
  const [tab, setTab] = useState<"find" | "send">("find");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [city, setCity] = useState("");
  const data = useQuery(leadsRef, {
    ...(filter !== "all" ? { status: filter } : {}),
    ...(city ? { city } : {}),
  });
  const find = useAction(findRef);
  const update = useMutation(updateRef);
  const recrawl = useMutation(recrawlRef);
  const exportLeads = useMutation(exportRef);

  const [searchCity, setSearchCity] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [useGoogle, setUseGoogle] = useState(true);
  const [useAi, setUseAi] = useState(true);
  const [finding, setFinding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; email: string } | null>(
    null,
  );

  const sources = useMemo(() => {
    const out: Source[] = [];
    if (useGoogle && data?.finders.googlePlaces) out.push("google_places");
    if (useAi && data?.finders.aiSearch) out.push("web_search");
    return out;
  }, [useGoogle, useAi, data?.finders]);

  const run = async (
    key: string,
    task: () => Promise<unknown>,
    done?: string,
  ) => {
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

  const findClinics = async () => {
    if (!searchCity.trim()) return toast.error("Type a city first.");
    setFinding(true);
    try {
      const res = await find({
        city: searchCity.trim(),
        country: country.trim() || undefined,
        sources,
      });
      if (res.errors.length) res.errors.forEach((e) => toast.error(e));
      toast.success(
        `Found ${res.found} clinic${res.found === 1 ? "" : "s"}: ${res.added} new${res.updated ? `, ${res.updated} updated` : ""}. Reading their websites for emails now.`,
      );
      setCity(searchCity.trim());
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setFinding(false);
    }
  };

  const exportCsv = () =>
    run("export", async () => {
      const { rows } = await exportLeads(city ? { city } : {});
      if (rows.length === 0) {
        toast.message(
          "No clinics are ready to export. Clinics need an email, and exported ones are left out.",
        );
        return;
      }
      downloadCsv(
        `clinic-outreach${city ? `-${city.toLowerCase().replace(/\s+/g, "-")}` : ""}-${new Date().toISOString().slice(0, 10)}`,
        rows,
      );
      toast.success(
        `Exported ${rows.length} clinic${rows.length === 1 ? "" : "s"}. They're now marked "Exported".`,
      );
    });

  const counts = data?.counts ?? {};

  return (
    <AdminPage>
      <PageHeader
        title="Clinic outreach"
        description="Find physiotherapy clinics city by city, collect the email on their website, then email them from the team's own inbox with follow-ups."
        actions={
          tab === "find" && (
            <button
              type="button"
              onClick={exportCsv}
              disabled={busy !== null || !data}
              className={softButtonClass}
            >
              {busy === "export" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              Export ready{city ? ` in ${city}` : ""} (CSV)
            </button>
          )
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "find" | "send")}
      >
        <TabsList className={tabsListClass}>
          <TabsTrigger value="find">Find clinics</TabsTrigger>
          <TabsTrigger value="send">Send emails</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "send" ? (
        <OutreachSender />
      ) : (
        <>
          <Panel
            title="Find clinics"
            description="Searches a city, adds clinics you don't have yet, and reads each website for a contact email."
          >
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
                <input
                  value={searchCity}
                  onChange={(e) => setSearchCity(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    !finding &&
                    sources.length > 0 &&
                    findClinics()
                  }
                  placeholder="City, e.g. Ibadan"
                  aria-label="City"
                  className={inputClass}
                />
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country"
                  aria-label="Country"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={findClinics}
                  disabled={finding || sources.length === 0}
                  className={primaryButtonClass}
                >
                  {finding ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-1.5 h-4 w-4" />
                  )}
                  {finding ? "Searching…" : "Find clinics"}
                </button>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-rh-ink dark:text-white">
                <label
                  className={cn(
                    "flex items-center gap-2",
                    !data?.finders.googlePlaces && "opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={useGoogle && Boolean(data?.finders.googlePlaces)}
                    disabled={!data?.finders.googlePlaces}
                    onChange={(e) => setUseGoogle(e.target.checked)}
                  />
                  Google Maps listings
                  {data && !data.finders.googlePlaces && (
                    <span className="text-xs text-neutral-500">
                      (add GOOGLE_PLACES_API_KEY on Convex)
                    </span>
                  )}
                </label>
                <label
                  className={cn(
                    "flex items-center gap-2",
                    !data?.finders.aiSearch && "opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={useAi && Boolean(data?.finders.aiSearch)}
                    disabled={!data?.finders.aiSearch}
                    onChange={(e) => setUseAi(e.target.checked)}
                  />
                  AI web search (websites, directories, social pages)
                </label>
              </div>
              {finding && (
                <p className="text-xs text-neutral-500">
                  This can take up to a minute: each finder searches several
                  pages.
                </p>
              )}
              {data && data.crawling > 0 && (
                <p className="flex items-center gap-2 text-xs text-neutral-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading{" "}
                  {data.crawling} website{data.crawling === 1 ? "" : "s"} for
                  emails…
                </p>
              )}
              {data && data.searches.length > 0 && (
                <ul className="space-y-1 text-xs text-neutral-500">
                  {data.searches.slice(0, 4).map((s, i) => (
                    <li key={i}>
                      {s.city} · {SOURCE_LABEL[s.source as Source] ?? s.source}:{" "}
                      {s.error ? (
                        <span className="text-rose-600">{s.error}</span>
                      ) : (
                        `${s.found} found, ${s.added} new`
                      )}{" "}
                      · {formatDistanceToNowStrict(s.at, { addSuffix: true })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Clinics found" value={data?.total ?? "—"} />
            <StatTile label="Ready to email" value={counts.ready ?? 0} />
            <StatTile
              label="Exported or contacted"
              value={(counts.exported ?? 0) + (counts.contacted ?? 0)}
            />
            <StatTile label="Replied" value={counts.replied ?? 0} />
          </div>

          <Panel
            title="Clinics"
            actions={
              data && data.cities.length > 1 ? (
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  aria-label="City"
                  className={cn(inputClass, "h-9 w-auto py-1")}
                >
                  <option value="">All cities</option>
                  {data.cities.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.count})
                    </option>
                  ))}
                </select>
              ) : undefined
            }
          >
            <div className="border-b border-black/[0.05] px-5 py-3 dark:border-white/[0.06]">
              <FilterChips
                value={filter}
                onChange={setFilter}
                options={FILTERS.map((f) => ({
                  value: f,
                  label: f === "all" ? "All" : STATUS[f].label,
                  count: f === "all" ? data?.total : (counts[f] ?? 0),
                }))}
              />
            </div>
            {data === undefined ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : data.leads.length === 0 ? (
              <EmptyState
                title={data.total === 0 ? "No clinics yet" : "Nothing here"}
                description={
                  data.total === 0
                    ? "Type a city above and press Find clinics."
                    : "Try another filter or city."
                }
              />
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {data.leads.map((lead) => (
                  <li
                    key={lead._id}
                    className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-rh-ink dark:text-white">
                          {lead.name}
                        </p>
                        <StatusBadge tone={STATUS[lead.status].tone}>
                          {STATUS[lead.status].label}
                        </StatusBadge>
                        <span className="text-xs text-neutral-500">
                          {SOURCE_LABEL[lead.source]}
                        </span>
                        {lead.rating !== null && (
                          <span className="text-xs text-neutral-500">
                            ★ {lead.rating.toFixed(1)}
                            {lead.reviews ? ` (${lead.reviews})` : ""}
                          </span>
                        )}
                      </div>
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {lead.mapsUrl ? (
                            <a
                              href={lead.mapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline"
                            >
                              {lead.address ?? lead.city}
                            </a>
                          ) : (
                            (lead.address ?? lead.city)
                          )}
                        </span>
                        {lead.phone && (
                          <a
                            href={`tel:${lead.phone.replace(/\s+/g, "")}`}
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {lead.phone}
                          </a>
                        )}
                        {lead.website && (
                          <a
                            href={
                              /^https?:/i.test(lead.website)
                                ? lead.website
                                : `https://${lead.website}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            <Globe className="h-3.5 w-3.5" />
                            {lead.website
                              .replace(/^https?:\/\/(www\.)?/i, "")
                              .replace(/\/$/, "")
                              .slice(0, 40)}
                          </a>
                        )}
                        {lead.sourceUrl && !lead.website && (
                          <a
                            href={lead.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            Where it was found
                          </a>
                        )}
                      </p>
                      {editing?.id === lead._id ? (
                        <form
                          className="flex flex-wrap items-center gap-2 pt-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            run(
                              `email-${lead._id}`,
                              async () => {
                                await update({
                                  leadId: lead._id,
                                  email: editing.email,
                                });
                                setEditing(null);
                              },
                              "Email saved",
                            );
                          }}
                        >
                          <input
                            autoFocus
                            type="email"
                            value={editing.email}
                            onChange={(e) =>
                              setEditing({
                                id: lead._id,
                                email: e.target.value,
                              })
                            }
                            placeholder="name@clinic.com"
                            className={cn(inputClass, "h-8 w-64 py-1 text-sm")}
                          />
                          <button
                            type="submit"
                            className={cn(
                              primaryButtonClass,
                              "h-8 px-3 text-xs",
                            )}
                            disabled={busy !== null}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="text-xs text-neutral-500 hover:underline"
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <p className="text-sm">
                          {lead.email ? (
                            <span className="font-medium text-rh-ink dark:text-white">
                              {lead.email}
                            </span>
                          ) : lead.crawlStatus === "pending" ? (
                            <span className="text-neutral-500">
                              Reading the website…
                            </span>
                          ) : (
                            <span className="text-neutral-500">
                              No email yet
                            </span>
                          )}
                          <button
                            type="button"
                            className="ml-2 text-xs text-neutral-500 hover:underline"
                            onClick={() =>
                              setEditing({
                                id: lead._id,
                                email: lead.email ?? "",
                              })
                            }
                          >
                            {lead.email ? "Change" : "Add email"}
                          </button>
                          {lead.otherEmails.length > 0 && (
                            <span className="ml-2 text-xs text-neutral-500">
                              Also on the site:{" "}
                              {lead.otherEmails.slice(0, 3).join(", ")}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <select
                        value={lead.status}
                        aria-label={`Status of ${lead.name}`}
                        onChange={(e) =>
                          run(`status-${lead._id}`, () =>
                            update({
                              leadId: lead._id,
                              status: e.target.value as Status,
                            }),
                          )
                        }
                        className={cn(inputClass, "h-8 w-auto py-1 text-xs")}
                      >
                        {(Object.keys(STATUS) as Status[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS[s].label}
                          </option>
                        ))}
                      </select>
                      {lead.website &&
                        lead.crawlStatus !== "pending" &&
                        !lead.email && (
                          <button
                            type="button"
                            className="text-xs text-neutral-500 hover:underline"
                            onClick={() =>
                              run(
                                `crawl-${lead._id}`,
                                () => recrawl({ leadId: lead._id }),
                                "Reading the website again",
                              )
                            }
                          >
                            Read website again
                          </button>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <p className="text-xs text-neutral-500">
            Email these from the Send emails tab (the team&apos;s own hello@
            inbox), never from Rehabify&apos;s product email: it keeps receipts
            and reminders out of spam. Mark anyone who asks not to be contacted
            as &ldquo;Do not contact&rdquo;; that sticks to their email in later
            searches.
          </p>
        </>
      )}
    </AdminPage>
  );
}
