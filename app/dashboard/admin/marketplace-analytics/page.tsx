"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  CalendarCheck,
  ChevronRight,
  Info,
  Package,
  Star,
  Stethoscope,
  TrendingUp,
  Users,
} from "@/components/icons";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClinicTheme } from "@/components/clinic/ClinicTheme";
import { PatientRef } from "@/components/admin/finance/PatientRef";
import { cn } from "@/lib/utils";
import {
  AdminPage,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  Stagger,
  StaggerItem,
  formatNaira,
  listRowClass,
  softButtonClass,
  tableWrapClass,
  tabsListClass,
} from "@/components/admin/ui";

// ─── Types (the generated api type can degrade to `any`, so results are cast) ──

type Timeframe = "all_time" | "this_year" | "this_month" | "last_month";

type PlatformAnalytics = {
  revenue: { total: number; platformFees: number; paystackFees: number; physiotherapistEarnings: number; rehabify?: number };
  revenueByMonth?: { month: string; revenue: number; rehabify: number; bookings: number }[];
  bookings: { total: number; completed: number; pending: number; failed: number };
  packages?: {
    totalPackageBookings: number;
    totalSingleBookings: number;
    packageRevenue: number;
    singleRevenue: number;
    avgPackageSize: number;
    recentPackageBookings: {
      bookingId: string;
      patientId: string;
      patientNumber: string | null;
      isGuest: boolean;
      physioName: string;
      packageSessions: number;
      sessionsRemaining: number;
      conditionLabel: string;
      totalAmount: number;
      paidAt?: number;
    }[];
  };
  physiotherapists: { total: number; available: number };
  patients: { total: number };
  reviews: { total: number; averageRating: number };
  capped?: boolean;
};

type EarningsRow = {
  physiotherapistId: Id<"users">;
  name: string;
  email?: string;
  imageUrl?: string;
  isAvailable: boolean;
  totalEarnings: number;
  totalRevenue: number;
  totalBookings: number;
  completedBookings: number;
  totalPatients: number;
  averageRating: number;
  reviewCount: number;
  activeRelationships: number;
};

type EarningsResult = {
  physiotherapists: EarningsRow[];
  total: number;
  hasMore: boolean;
  capped?: boolean;
};

type EarningsDetail = {
  physiotherapist: { id: Id<"users">; name: string; email?: string; imageUrl?: string; location: string; isAvailable: boolean; averageRating: number };
  summary: {
    totalBookings: number;
    completedBookings: number;
    pendingBookings: number;
    totalEarnings: number;
    totalRevenue: number;
    platformFees: number;
    patientCount: number;
  };
  recentBookings: {
    id: string;
    createdAt: number;
    sessionType: string;
    bookingStatus: string;
    paymentStatus: string;
    totalAmount: number;
    physiotherapistEarnings: number;
    patientId: string;
    patientNumber: string | null;
    isGuest: boolean;
  }[];
  patients: { id: string; patientNumber: string | null; isGuest: boolean; totalBookings: number; totalSpent: number; lastBookingDate: number }[];
  earningsByMonth: Record<string, number>;
  bookingsByMonth: Record<string, number>;
  capped: boolean;
};

type Report = {
  _id: string;
  physiotherapist?: { name?: string };
  reporter?: { name?: string; role?: string };
  reason: string;
  severity: string;
  status: string;
  createdAt: number;
};

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: "all_time", label: "All time" },
  { value: "this_year", label: "This year" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
];

const EARNINGS_PAGE = 20;

// ─── Chart helpers ────────────────────────────────────────────────────────────

/** Chart ink per theme: one brand hue for data, quiet neutrals for everything else. */
const CHART = {
  light: { data: "#00cd0f", grid: "#ebe8df", axis: "#737373", surface: "#ffffff", border: "#e5e5e5", text: "#0b1312" },
  dark: { data: "#00cd0f", grid: "#24302f", axis: "#a3a3a3", surface: "#1b2827", border: "#2c3a39", text: "#fafafa" },
};

function useChartInk() {
  const { theme } = useClinicTheme();
  const ink = CHART[theme];
  return {
    ink,
    tooltipStyle: {
      background: ink.surface,
      border: `1px solid ${ink.border}`,
      borderRadius: 10,
      color: ink.text,
      fontSize: 12,
      boxShadow: "0 4px 12px rgb(0 0 0 / 0.08)",
    },
    axisTick: { fill: ink.axis, fontSize: 12 },
  };
}

/** ₦1.2m / ₦45k / ₦900 for axis ticks. */
function compactNaira(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `₦${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
  if (abs >= 1_000) return `₦${Math.round(value / 1_000)}k`;
  return `₦${Math.round(value)}`;
}

const monthLabel = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return format(new Date(year, (month || 1) - 1, 1), "MMM yy");
};

/** Single-series monthly bar chart with a hover tooltip and a screen-reader table. */
function MonthlyBars({
  data,
  valueLabel,
  countLabel,
  height = "h-64",
}: {
  data: { month: string; value: number; count?: number }[];
  valueLabel: string;
  countLabel?: string;
  height?: string;
}) {
  const { ink, tooltipStyle, axisTick } = useChartInk();
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month) }));
  return (
    <>
      <div className={cn(height, "px-2 pb-3 pt-2 sm:px-4")} role="img" aria-label={`${valueLabel} by month`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={ink.grid} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} dy={8} interval="preserveStartEnd" minTickGap={12} />
            <YAxis axisLine={false} tickLine={false} tick={axisTick} width={56} tickFormatter={compactNaira} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: ink.axis, marginBottom: 2 }}
              itemStyle={{ color: ink.text }}
              cursor={{ fill: ink.grid, opacity: 0.6 }}
              formatter={(value: number, _name, item) => {
                const count = (item?.payload as { count?: number } | undefined)?.count;
                return [count !== undefined && countLabel ? `${formatNaira(value)} · ${count} ${countLabel}` : formatNaira(value), valueLabel];
              }}
            />
            <Bar dataKey="value" fill={ink.data} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{valueLabel} by month</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <th scope="row">{r.label}</th>
              <td>{formatNaira(r.value)}</td>
              {r.count !== undefined && <td>{r.count}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function PhysioAvatar({ name, imageUrl, size = 36 }: { name: string; imageUrl?: string; size?: number }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-rh-honeydew text-xs font-semibold text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime"
      style={{ width: size, height: size }}
    >
      {imageUrl ? <Image src={imageUrl} alt="" fill sizes={`${size}px`} className="object-cover" unoptimized /> : initials || "?"}
    </span>
  );
}

function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm tabular-nums text-rh-ink dark:text-neutral-100">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      {value.toFixed(1)}
      {count !== undefined && <span className="text-xs text-neutral-500 dark:text-neutral-400">({count})</span>}
    </span>
  );
}

/** A labelled share of a total with a thin meter. */
function ShareRow({ label, value, total, hint }: { label: string; value: number; total: number; hint?: ReactNode }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{label}</p>
        <p className="text-sm font-semibold tabular-nums text-rh-ink dark:text-white">
          {formatNaira(value)} <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">{pct}%</span>
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
        <div className="h-full rounded-full bg-rh-lime dark:bg-rh-lime" style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{hint}</p>}
    </div>
  );
}

const severityTone = (s: string) => (s === "critical" || s === "high" ? "red" : s === "medium" ? "amber" : "neutral");
const reportTone = (s: string) => (s === "pending" ? "amber" : s === "resolved" ? "green" : s === "under_review" ? "teal" : "neutral");
const paymentTone = (s: string) => (s === "completed" ? "green" : s === "failed" ? "red" : s === "refunded" ? "neutral" : "amber");

// ─── Physio drill-down ────────────────────────────────────────────────────────

function PhysioEarningsSheet({
  physioId,
  open,
  timeframe,
  onClose,
}: {
  /** The last physio opened. Kept after closing so the sheet doesn't blank mid-animation. */
  physioId: Id<"users"> | null;
  open: boolean;
  timeframe: Timeframe;
  onClose: () => void;
}) {
  const detail = useQuery(
    api.admin.marketplaceEarnings.getPhysiotherapistEarningsDetail,
    physioId ? { physiotherapistId: physioId, timeframe } : "skip"
  ) as EarningsDetail | null | undefined;

  const months = detail
    ? Object.keys(detail.earningsByMonth)
        .sort()
        .slice(-12)
        .map((month) => ({ month, value: detail.earningsByMonth[month], count: detail.bookingsByMonth[month] }))
    : [];
  const timeframeLabel = TIMEFRAMES.find((t) => t.value === timeframe)?.label.toLowerCase();

  return (
    <Sheet open={open && physioId !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-black/[0.06] bg-rh-canvas p-0 dark:border-white/10 dark:bg-rh-ink sm:max-w-xl">
        {detail === undefined ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-12 w-2/3 rounded-xl dark:bg-white/[0.06]" />
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-2xl dark:bg-white/[0.06]" />
              ))}
            </div>
            <Skeleton className="h-56 rounded-2xl dark:bg-white/[0.06]" />
            <SheetHeader className="sr-only">
              <SheetTitle>Loading earnings</SheetTitle>
              <SheetDescription>Loading this physiotherapist&apos;s earnings.</SheetDescription>
            </SheetHeader>
          </div>
        ) : detail === null ? (
          <div className="p-6">
            <SheetHeader className="p-0">
              <SheetTitle className="dark:text-white">Not available</SheetTitle>
              <SheetDescription>This account is no longer a physiotherapist.</SheetDescription>
            </SheetHeader>
          </div>
        ) : (
          <div className="space-y-5 p-5 sm:p-6">
            <SheetHeader className="flex-row items-center gap-3 p-0 pr-8">
              <PhysioAvatar name={detail.physiotherapist.name} imageUrl={detail.physiotherapist.imageUrl} size={48} />
              <div className="min-w-0 text-left">
                <SheetTitle className="truncate text-lg text-rh-ink dark:text-white">{detail.physiotherapist.name}</SheetTitle>
                <SheetDescription className="truncate">
                  {[detail.physiotherapist.email, detail.physiotherapist.location].filter(Boolean).join(" · ")}
                </SheetDescription>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={detail.physiotherapist.isAvailable ? "green" : "neutral"}>
                    {detail.physiotherapist.isAvailable ? "On marketplace" : "Hidden from marketplace"}
                  </StatusBadge>
                  {detail.physiotherapist.averageRating > 0 && <Rating value={detail.physiotherapist.averageRating} />}
                </div>
              </div>
            </SheetHeader>

            {detail.capped && (
              <p className="flex items-start gap-2 rounded-xl bg-rh-peach px-3 py-2 text-xs text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Based on this physiotherapist&apos;s latest 1,000 bookings.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Earned" icon={Banknote} value={formatNaira(detail.summary.totalEarnings)} hint={timeframeLabel} />
              <StatTile label="Revenue" icon={TrendingUp} value={formatNaira(detail.summary.totalRevenue)} hint={`Fees ${formatNaira(detail.summary.platformFees)}`} />
              <StatTile
                label="Bookings"
                icon={CalendarCheck}
                tone="mint"
                value={detail.summary.totalBookings}
                hint={`${detail.summary.completedBookings} paid · ${detail.summary.pendingBookings} pending`}
              />
              <StatTile label="Patients" icon={Users} tone="peach" value={detail.summary.patientCount} />
            </div>

            <Panel title="Earnings by month" description="Physiotherapist share of paid bookings">
              {months.length === 0 ? (
                <EmptyState title="No paid bookings" description="Paid bookings in this period show up here by month." />
              ) : (
                <MonthlyBars data={months} valueLabel="Earned" countLabel="paid" height="h-52" />
              )}
            </Panel>

            <Panel title="Top patients" description="By amount paid">
              {detail.patients.length === 0 ? (
                <EmptyState title="No patients in this period" />
              ) : (
                <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {detail.patients.slice(0, 8).map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-rh-ink dark:text-white">
                          <PatientRef userId={p.id} patientNumber={p.patientNumber} isGuest={p.isGuest} />
                          {p.isGuest && <StatusBadge tone="amber">Guest</StatusBadge>}
                        </p>
                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {p.totalBookings} booking{p.totalBookings === 1 ? "" : "s"} · last {format(p.lastBookingDate, "d MMM yyyy")}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-rh-ink dark:text-white">{formatNaira(p.totalSpent)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Recent bookings">
              {detail.recentBookings.length === 0 ? (
                <EmptyState title="No bookings in this period" />
              ) : (
                <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {detail.recentBookings.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 px-5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          <PatientRef userId={b.patientId} patientNumber={b.patientNumber} isGuest={b.isGuest} />
                        </p>
                        <p className="truncate text-xs capitalize text-neutral-500 dark:text-neutral-400">
                          {format(b.createdAt, "d MMM yyyy")} · {b.sessionType?.replace(/_/g, " ")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-rh-ink dark:text-white">{formatNaira(b.totalAmount)}</p>
                        <StatusBadge tone={paymentTone(b.paymentStatus)} className="capitalize">
                          {b.paymentStatus}
                        </StatusBadge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <AdminPage>
      <Skeleton className="h-10 w-64 rounded-xl dark:bg-white/[0.06]" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl dark:bg-white/[0.06]" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-2xl dark:bg-white/[0.06]" />
    </AdminPage>
  );
}

export default function AdminMarketplaceAnalyticsPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>("all_time");
  const [limit, setLimit] = useState(EARNINGS_PAGE);
  const [selectedPhysio, setSelectedPhysio] = useState<Id<"users"> | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const openPhysio = (id: Id<"users">) => {
    setSelectedPhysio(id);
    setSheetOpen(true);
  };

  const analytics = useQuery(api.admin.marketplaceEarnings.getPlatformMarketplaceAnalytics) as PlatformAnalytics | undefined;
  const earnings = useQuery(api.admin.marketplaceEarnings.getAllPhysiotherapistEarnings, {
    timeframe,
    sortBy: "earnings_desc",
    limit,
  }) as EarningsResult | undefined;
  const reports = useQuery(api.marketplace.reports.getAllReports, { limit: 10 }) as { reports: Report[] } | undefined;

  if (analytics === undefined) return <LoadingState />;

  const pendingReports = reports?.reports.filter((r) => r.status === "pending").length ?? 0;
  const packages = analytics.packages;
  const revenueMonths = (analytics.revenueByMonth ?? []).map((m) => ({ month: m.month, value: m.revenue, count: m.bookings }));
  const hasMonthlyRevenue = revenueMonths.some((m) => m.value > 0);
  const rehabify = analytics.revenue.rehabify ?? analytics.revenue.platformFees;

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Finance"
        title="Marketplace revenue"
        description="Revenue, physiotherapist earnings, package uptake and patient reports."
        actions={
          <Button asChild className={softButtonClass}>
            <Link href="/dashboard/admin/marketplace-bookings">
              All bookings <ArrowUpRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        }
      />

      {analytics.capped && (
        <p className="flex items-start gap-2 rounded-2xl bg-rh-peach px-4 py-3 text-sm text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Totals use a capped window (latest 2,500 bookings, 1,000 physiotherapist profiles and 2,000 reviews), so all-time
          figures are partial.
        </p>
      )}

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StaggerItem>
          <StatTile label="Total revenue" icon={TrendingUp} value={formatNaira(analytics.revenue.total)} hint={`Platform fees ${formatNaira(analytics.revenue.platformFees)}`} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Rehabify share" icon={Banknote} tone="mint" value={formatNaira(rehabify)} hint="kept from paid bookings" />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Bookings"
            icon={CalendarCheck}
            value={analytics.bookings.total.toLocaleString()}
            hint={`${analytics.bookings.completed} paid · ${analytics.bookings.pending} pending · ${analytics.bookings.failed} failed`}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Physiotherapists"
            icon={Stethoscope}
            value={analytics.physiotherapists.total.toLocaleString()}
            hint={`${analytics.physiotherapists.available} on the marketplace · ${analytics.patients.total} patients`}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Average rating" icon={Star} tone="peach" value={analytics.reviews.averageRating.toFixed(1)} hint={`${analytics.reviews.total} reviews`} />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Package revenue"
            icon={Package}
            value={formatNaira(packages?.packageRevenue ?? 0)}
            hint={`${packages?.totalPackageBookings ?? 0} packages · avg ${packages?.avgPackageSize ?? 0} sessions`}
          />
        </StaggerItem>
      </Stagger>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Revenue by month" description="Paid bookings, last 12 months" className="lg:col-span-2">
          {hasMonthlyRevenue ? (
            <MonthlyBars data={revenueMonths} valueLabel="Revenue" countLabel="paid" />
          ) : (
            <EmptyState icon={<TrendingUp />} title="No paid bookings in the last year" />
          )}
        </Panel>
        <Panel title="Where the money went" description="Share of paid booking revenue" bodyClassName="space-y-4 px-5 pb-5 pt-3">
          <ShareRow label="Physiotherapists" value={analytics.revenue.physiotherapistEarnings} total={analytics.revenue.total} />
          <ShareRow label="Platform fees" value={analytics.revenue.platformFees} total={analytics.revenue.total} />
          <ShareRow label="Paystack fees" value={analytics.revenue.paystackFees} total={analytics.revenue.total} />
          <p className="border-t border-black/[0.05] pt-3 text-xs text-neutral-500 dark:border-white/[0.06] dark:text-neutral-400">
            Total {formatNaira(analytics.revenue.total)} from {analytics.bookings.completed} paid bookings.
          </p>
        </Panel>
      </div>

      <Tabs defaultValue="earnings" className="space-y-4">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="earnings">Physiotherapist earnings</TabsTrigger>
          <TabsTrigger value="packages">Package bookings</TabsTrigger>
          <TabsTrigger value="reports">
            Patient reports
            {pendingReports > 0 && (
              <span className="ml-1.5 rounded-full bg-rh-amber px-1.5 text-[11px] font-semibold tabular-nums text-rh-ink">{pendingReports}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Earnings */}
        <TabsContent value="earnings" className="mt-0">
          <Panel
            title="Top earning physiotherapists"
            description={earnings ? `${earnings.total} physiotherapists · tap a row for the breakdown` : "Loading…"}
            actions={
              <FilterChips
                value={timeframe}
                onChange={(t) => {
                  setTimeframe(t);
                  setLimit(EARNINGS_PAGE);
                }}
                options={TIMEFRAMES}
              />
            }
            bodyClassName="pt-3"
          >
            {earnings === undefined ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-xl dark:bg-white/[0.06]" />
                ))}
              </div>
            ) : earnings.physiotherapists.length === 0 ? (
              <EmptyState icon={<Stethoscope />} title="No physiotherapists yet" />
            ) : (
              <>
                {/* Mobile list */}
                <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06] md:hidden">
                  {earnings.physiotherapists.map((physio) => (
                    <li key={physio.physiotherapistId}>
                      <button type="button" onClick={() => openPhysio(physio.physiotherapistId)} className={cn(listRowClass, "w-full text-left")}>
                        <PhysioAvatar name={physio.name} imageUrl={physio.imageUrl} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{physio.name}</p>
                          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {physio.totalBookings} bookings · {physio.totalPatients} patients
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold tabular-nums text-rh-ink dark:text-white">{formatNaira(physio.totalEarnings)}</p>
                        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Desktop table */}
                <div className={cn(tableWrapClass, "hidden md:block")}>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">Physiotherapist</TableHead>
                        <TableHead>Patients</TableHead>
                        <TableHead>Bookings</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead className="text-right">Earnings</TableHead>
                        <TableHead className="w-10 pr-5" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {earnings.physiotherapists.map((physio) => (
                        <TableRow
                          key={physio.physiotherapistId}
                          tabIndex={0}
                          role="button"
                          aria-label={`Open earnings for ${physio.name}`}
                          onClick={() => openPhysio(physio.physiotherapistId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openPhysio(physio.physiotherapistId);
                            }
                          }}
                          className="cursor-pointer focus:outline-none focus-visible:bg-rh-honeydew dark:focus-visible:bg-white/[0.05]"
                        >
                          <TableCell className="pl-5">
                            <div className="flex items-center gap-3">
                              <PhysioAvatar name={physio.name} imageUrl={physio.imageUrl} />
                              <div className="min-w-0">
                                <p className="flex items-center gap-1.5 font-medium text-rh-ink dark:text-white">
                                  {physio.name}
                                  {!physio.isAvailable && <StatusBadge>Hidden</StatusBadge>}
                                </p>
                                <p className="max-w-[260px] truncate text-xs text-neutral-500 dark:text-neutral-400">{physio.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums dark:text-neutral-200">{physio.totalPatients}</TableCell>
                          <TableCell className="tabular-nums dark:text-neutral-200">
                            {physio.totalBookings}
                            <span className="ml-1 text-xs text-neutral-500 dark:text-neutral-400">({physio.completedBookings} paid)</span>
                          </TableCell>
                          <TableCell>
                            <Rating value={physio.averageRating} count={physio.reviewCount} />
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-rh-ink dark:text-white">{formatNaira(physio.totalEarnings)}</TableCell>
                          <TableCell className="pr-5">
                            <ChevronRight className="h-4 w-4 text-neutral-400" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-col items-center gap-1 border-t border-black/[0.05] px-5 py-3 dark:border-white/[0.06]">
                  {earnings.hasMore ? (
                    <Button onClick={() => setLimit((l) => l + EARNINGS_PAGE)} className={cn(softButtonClass, "h-8 text-xs")}>
                      Show more
                    </Button>
                  ) : (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Showing all {earnings.total}</p>
                  )}
                  {earnings.capped && (
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Figures use the latest 2,500 bookings in this period.</p>
                  )}
                </div>
              </>
            )}
          </Panel>
        </TabsContent>

        {/* Packages */}
        <TabsContent value="packages" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatTile label="Package revenue" icon={Package} value={formatNaira(packages?.packageRevenue ?? 0)} hint={`${packages?.totalPackageBookings ?? 0} package bookings`} />
            <StatTile label="Single-session revenue" icon={CalendarCheck} tone="neutral" value={formatNaira(packages?.singleRevenue ?? 0)} hint={`${packages?.totalSingleBookings ?? 0} single sessions`} />
            <StatTile label="Average package size" icon={TrendingUp} tone="peach" value={`${packages?.avgPackageSize ?? 0} sessions`} hint="per package booking" />
          </div>

          <Panel title="Recent package bookings" description="Latest 5 paid package purchases">
            {(packages?.recentPackageBookings ?? []).length === 0 ? (
              <EmptyState icon={<Package />} title="No package bookings yet" />
            ) : (
              <div className={tableWrapClass}>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Patient ID</TableHead>
                      <TableHead>Physiotherapist</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead className="pr-5 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(packages?.recentPackageBookings ?? []).map((pkg) => {
                      const done = pkg.packageSessions > 0 ? Math.round(((pkg.packageSessions - pkg.sessionsRemaining) / pkg.packageSessions) * 100) : 0;
                      return (
                        <TableRow key={pkg.bookingId}>
                          <TableCell className="pl-5">
                            <PatientRef userId={pkg.patientId} patientNumber={pkg.patientNumber} isGuest={pkg.isGuest} />
                          </TableCell>
                          <TableCell className="text-neutral-600 dark:text-neutral-300">{pkg.physioName}</TableCell>
                          <TableCell className="text-sm text-neutral-600 dark:text-neutral-300">{pkg.conditionLabel}</TableCell>
                          <TableCell>
                            <StatusBadge tone="teal">{pkg.packageSessions}-session</StatusBadge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                                <div className="h-full rounded-full bg-rh-lime dark:bg-rh-lime" style={{ width: `${done}%` }} />
                              </div>
                              <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">{pkg.sessionsRemaining} left</span>
                            </div>
                          </TableCell>
                          <TableCell className="pr-5 text-right font-semibold tabular-nums text-rh-ink dark:text-white">{formatNaira(pkg.totalAmount)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>

        {/* Reports */}
        <TabsContent value="reports" className="mt-0">
          <Panel
            title="Patient reports"
            description="Recent reports from patients about physiotherapists"
            actions={
              <Button asChild size="sm" className={cn(softButtonClass, "h-8 text-xs")}>
                <Link href="/dashboard/admin/marketplace-reports">
                  Review all <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            }
          >
            {reports === undefined ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-xl dark:bg-white/[0.06]" />
                ))}
              </div>
            ) : reports.reports.length === 0 ? (
              <EmptyState icon={<AlertTriangle />} title="No reports submitted" />
            ) : (
              <>
                <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06] md:hidden">
                  {reports.reports.map((report) => (
                    <li key={report._id} className="space-y-1 px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{report.physiotherapist?.name || "Unknown"}</p>
                        <StatusBadge tone={reportTone(report.status)} className="capitalize">
                          {report.status.replace(/_/g, " ")}
                        </StatusBadge>
                      </div>
                      <p className="text-xs capitalize text-neutral-500 dark:text-neutral-400">
                        {report.reason.replace(/_/g, " ")} · {report.severity} · {new Date(report.createdAt).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className={cn(tableWrapClass, "hidden md:block")}>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">Physiotherapist</TableHead>
                        <TableHead>Reporter</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="pr-5">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reports.reports.map((report) => (
                        <TableRow key={report._id}>
                          <TableCell className="pl-5 font-medium text-rh-ink dark:text-white">{report.physiotherapist?.name || "Unknown"}</TableCell>
                          <TableCell>
                            <p className="font-medium text-rh-ink dark:text-white">{report.reporter?.name || "Unknown"}</p>
                            <p className="text-xs capitalize text-neutral-500 dark:text-neutral-400">{report.reporter?.role}</p>
                          </TableCell>
                          <TableCell className="text-sm capitalize text-neutral-600 dark:text-neutral-300">{report.reason.replace(/_/g, " ")}</TableCell>
                          <TableCell>
                            <StatusBadge tone={severityTone(report.severity)} className="capitalize">
                              {report.severity}
                            </StatusBadge>
                          </TableCell>
                          <TableCell>
                            <StatusBadge tone={reportTone(report.status)} className="capitalize">
                              {report.status.replace(/_/g, " ")}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="pr-5 text-sm tabular-nums text-neutral-600 dark:text-neutral-300">
                            {new Date(report.createdAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <PhysioEarningsSheet physioId={selectedPhysio} open={sheetOpen} timeframe={timeframe} onClose={() => setSheetOpen(false)} />
    </AdminPage>
  );
}
