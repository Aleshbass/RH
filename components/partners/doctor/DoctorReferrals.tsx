"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { Search, SearchX, UserPlus, Users } from "@/components/icons";
import { EmptyState, LoadingBlocks, PageHeader, Panel, primaryButtonClass } from "@/components/physio/ui";
import { cn } from "@/lib/utils";
import { isDoctorOutcome } from "@/convex/helpers/doctorStages";
import { doctorRefs, type DoctorReferralRow } from "./refs";
import { ReferralListRow, inputClass } from "./ui";

type Filter = "all" | "open" | "discharged" | "ended";

const FILTERS: Array<{ value: Filter; label: string; match: (row: DoctorReferralRow) => boolean }> = [
  { value: "all", label: "All", match: () => true },
  { value: "open", label: "In progress", match: (row) => row.open },
  { value: "discharged", label: "Discharged", match: (row) => row.stage === "discharged" },
  { value: "ended", label: "Ended early", match: (row) => isDoctorOutcome(row.stage) },
];

/** Every referral with where it is now; tap one for its timeline, care team and reports. */
export function DoctorReferrals({
  partnerCode,
  onRefer,
  onOpenReferral,
}: {
  partnerCode: string;
  onRefer: () => void;
  onOpenReferral: (id: string) => void;
}) {
  const data = useQuery(doctorRefs.list, { partnerCode });
  const [filter, setFilter] = useState<Filter>("all");
  const [term, setTerm] = useState("");

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.value, rows.filter(f.match).length])) as Record<Filter, number>, [rows]);
  const shown = useMemo(() => {
    const match = FILTERS.find((f) => f.value === filter)!.match;
    const needle = term.trim().toLowerCase();
    return rows.filter(
      (row) =>
        match(row) &&
        (!needle ||
          row.patientName.toLowerCase().includes(needle) ||
          (row.condition ?? "").toLowerCase().includes(needle) ||
          row.trackingCode.toLowerCase().includes(needle))
    );
  }, [rows, filter, term]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My referrals"
        description="Where each patient is, who is treating them and the reports shared with you."
        info="Each referral moves through Received, Contacted, Booked, Seen, In treatment and Discharged. You get an update here and by email at each step."
        actions={
          <Button type="button" onClick={onRefer} className={primaryButtonClass}>
            <UserPlus className="h-4 w-4" />
            Refer a patient
          </Button>
        }
      />

      <Panel>
        <div className="flex flex-col gap-3 border-b border-pt-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex gap-1 overflow-x-auto rounded-2xl bg-pt-sunken p-1" role="tablist" aria-label="Filter referrals">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-medium transition",
                  filter === f.value ? "bg-pt-surface text-pt-ink shadow-pt dark:shadow-none" : "text-pt-muted hover:text-pt-ink"
                )}
              >
                {f.label}
                {data && <span className="text-xs tabular-nums text-pt-faint">{counts[f.value]}</span>}
              </button>
            ))}
          </div>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" />
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Name, condition or code"
              aria-label="Search referrals"
              className={cn(inputClass, "h-10 pl-9 text-sm")}
            />
          </div>
        </div>

        {data === undefined ? (
          <div className="p-5 sm:p-6">
            <LoadingBlocks rows={4} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No referrals yet"
            description="Refer a patient and follow them here from first contact to discharge."
            action={
              <Button type="button" onClick={onRefer} className={primaryButtonClass}>
                <UserPlus className="h-4 w-4" />
                Refer a patient
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState icon={<SearchX />} title="Nothing matches" description="Try another name, or a different filter." />
        ) : (
          <div className="divide-y divide-pt-line">
            {shown.map((row) => (
              <ReferralListRow key={row.referralId} row={row} onOpen={onOpenReferral} />
            ))}
          </div>
        )}
        {data?.capped && <p className="border-t border-pt-line px-5 py-3 text-xs text-pt-muted sm:px-6">Showing your latest 200 referrals.</p>}
      </Panel>
    </div>
  );
}
