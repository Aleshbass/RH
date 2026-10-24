"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { useQuery } from "convex/react";
import { UserButton } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import {
  Activity,
  AlertTriangle,
  Building2,
  ChevronDown,
  FileText,
  Link2,
  Rocket,
  Stethoscope,
  Terminal,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  Zap,
} from "@/components/icons";
import { ReferPatientModal, ReferPatientPanel } from "./ReferPatientForm";
import { DoctorOverview } from "./DoctorOverview";
import { CopyButton, EnvBadge, LoadingBlock, Pill, type Env, type PartnerInfo } from "./shared";
import { OverviewTab } from "./OverviewTab";
import { ReferralsTab } from "./ReferralsTab";
import { LinksTab } from "./LinksTab";
import { DevelopersTab } from "./DevelopersTab";
import { CommercialTab } from "./CommercialTab";
import { SettingsTab } from "./SettingsTab";
import { GoLivePanel } from "./GoLivePanel";

export type TabId = "overview" | "refer" | "referrals" | "links" | "developers" | "golive" | "commercial" | "settings";

const TABS: Array<{ id: TabId; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "referrals", label: "Referrals", icon: Users },
  { id: "links", label: "Referral links", icon: Link2 },
  { id: "developers", label: "Developers", icon: Terminal },
  { id: "golive", label: "Go live", icon: Rocket },
  { id: "commercial", label: "Commissions & payouts", icon: Wallet },
  { id: "settings", label: "Organisation", icon: Building2 },
];

/** A referring doctor's portal: no API, webhooks, sandbox or go-live. */
const DOCTOR_TABS: Array<{ id: TabId; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "refer", label: "Refer a patient", icon: UserPlus },
  { id: "referrals", label: "My referrals", icon: Users },
  { id: "links", label: "Referral link", icon: Link2 },
  { id: "commercial", label: "Earnings & payouts", icon: Wallet },
  { id: "settings", label: "Profile", icon: UserRound },
];

export function PartnerDashboard({ ownCode, ownType, isAdmin }: { ownCode: string | null; ownType?: string | null; isAdmin: boolean }) {
  const adminPartners = useQuery(api.partners.adminListPartners, isAdmin ? {} : "skip") as
    | Array<{ code: string; name: string; type: string; approvalStatus: string; productionStatus: string; isActive: boolean }>
    | undefined;
  const [selectedCode, setSelectedCode] = useState<string | null>(ownCode);
  const [environment, setEnvironment] = useState<Env>("sandbox");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [referOpen, setReferOpen] = useState(false);

  // Admins without their own organisation start on the first partner in the list.
  useEffect(() => {
    if (!selectedCode && adminPartners && adminPartners.length > 0) setSelectedCode(adminPartners[0].code);
  }, [adminPartners, selectedCode]);

  const partnerCode = selectedCode;
  const selectedType =
    partnerCode && partnerCode === ownCode && ownType ? ownType : adminPartners?.find((p) => p.code === partnerCode)?.type ?? ownType ?? null;
  // Doctors only ever work with real patients
  const isDoctor = selectedType === "doctor";
  const env: Env = isDoctor ? "live" : environment;
  const overview = useQuery(api.partners.getPartnerDashboardOverview, partnerCode ? { partnerCode, environment: env } : "skip") as
    | { metrics: any; partnerInfo: PartnerInfo; recentReferrals: any[] }
    | undefined;
  const info = overview?.partnerInfo;
  const productionApproved = info?.productionStatus === "approved";
  const envWritable = env === "sandbox" || productionApproved;
  const tabs = isDoctor ? DOCTOR_TABS : TABS;

  // Switching (as an admin) to a partner without the open tab
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTab)) setActiveTab("overview");
  }, [tabs, activeTab]);

  if (!partnerCode) {
    return (
      <div className="min-h-screen bg-[#FAF6E7] flex items-center justify-center p-6">
        {isAdmin && adminPartners !== undefined && adminPartners.length === 0 ? (
          <p className="text-sm text-[#52706e]">No partner organisations yet. Create one from the admin Partnerships page.</p>
        ) : (
          <LoadingBlock label="Loading partner organisation…" />
        )}
      </div>
    );
  }

  const ctx = info ? { partnerCode, environment: env, info, isAdmin, envWritable, isDoctor } : null;

  return (
    <div className="min-h-screen bg-[#FAF6E7] text-rh-ink font-sans pb-28 antialiased selection:bg-rh-lime selection:text-rh-ink overflow-x-clip w-full max-w-full">
      <header className="sticky top-0 z-40 border-b border-rh-ink/10 bg-[#FAF6E7]/80 backdrop-blur-xl w-full">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4 min-w-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 sm:flex-initial">
            <Link href="/" className="shrink-0 transition-opacity hover:opacity-85">
              <NextImage src="/logos/MainRehabify.svg" alt="Rehabify Health" width={100} height={26} className="h-6 sm:h-7 w-auto object-contain" />
            </Link>
            <div className="h-5 sm:h-6 w-px bg-rh-ink/15 shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              {info?.logoUrl ? (
                <img src={info.logoUrl} alt={info.name} className="max-h-6 sm:max-h-7 max-w-[70px] sm:max-w-[120px] object-contain rounded-md shrink-0" />
              ) : null}
              <span className="font-semibold tracking-tight text-rh-ink text-xs sm:text-sm truncate max-w-[110px] sm:max-w-[220px]">
                {info?.name ?? "Partner Portal"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {isAdmin && adminPartners && adminPartners.length > 0 && (
              <div className="relative max-w-[110px] sm:max-w-[200px]">
                <select
                  value={partnerCode}
                  onChange={(e) => setSelectedCode(e.target.value)}
                  aria-label="View partner organisation"
                  className="w-full appearance-none bg-white text-[11px] sm:text-xs font-semibold text-rh-ink pl-2.5 pr-6 py-1.5 rounded-xl border border-rh-ink/15 focus:outline-none focus:ring-2 focus:ring-rh-ink/20 cursor-pointer shadow-xs truncate"
                >
                  {adminPartners.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name} · {p.approvalStatus}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-[#52706e] absolute right-2 top-2.5 pointer-events-none" />
              </div>
            )}

            {!isDoctor && (
              <div className="inline-flex p-0.5 bg-rh-ink/5 border border-rh-ink/10 rounded-xl shrink-0" role="tablist" aria-label="Environment">
                {(["sandbox", "live"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={environment === option}
                    onClick={() => setEnvironment(option)}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all ${
                      environment === option ? "bg-white text-rh-ink shadow-xs font-semibold" : "text-[#52706e] hover:text-[#0b1312]"
                    }`}
                  >
                    {option === "sandbox" ? "Sandbox" : "Live"}
                  </button>
                ))}
              </div>
            )}

            {isDoctor && ctx && (
              <button type="button" onClick={() => setReferOpen(true)} className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rh-ink text-[#FAF6E7] text-xs font-semibold hover:bg-[#004744] transition">
                <UserPlus className="w-3.5 h-3.5" />
                Refer a patient
              </button>
            )}

            {!isDoctor && (
              <a
                href="https://docs.physioaroundme.com"
                target="_blank"
                rel="noreferrer"
                className="hidden md:flex items-center gap-1.5 text-xs font-medium text-[#52706e] hover:text-rh-ink px-3 py-1.5 rounded-xl hover:bg-white border border-transparent hover:border-rh-ink/10 transition"
              >
                <FileText className="w-3.5 h-3.5 text-rh-ink" />
                <span>Docs</span>
              </a>
            )}
            <div className="flex items-center pl-1 sm:pl-2 border-l border-rh-ink/10 shrink-0">
              <UserButton afterSignOutUrl="/partners/portal" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-6 min-w-0 w-full overflow-x-clip">
        {isDoctor ? null : environment === "sandbox" ? (
          <div className="rounded-2xl border border-amber-300/80 bg-amber-50/90 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-950">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-200/70 text-amber-900 rounded-xl shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-xs uppercase tracking-wider">Sandbox — test data</p>
                <p className="text-xs text-amber-900/80 mt-0.5 leading-relaxed">
                  Sandbox referrals never contact real patients, never send WhatsApp or email, never earn commissions, and use a simulated physiotherapist.
                  Use <code className="font-mono">sk_test_</code> keys and your sandbox webhook endpoint.
                </p>
              </div>
            </div>
          </div>
        ) : !productionApproved && info ? (
          <div className="rounded-2xl border border-rh-ink/15 bg-white p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-[#52706e] leading-relaxed">
                <strong className="text-rh-ink">Production access is not approved yet.</strong> You can view the live environment, but live keys,
                webhooks and links are created after Rehabify approves your go-live request.
              </p>
            </div>
            <button type="button" onClick={() => setActiveTab("golive")} className="px-3.5 py-1.5 rounded-xl bg-rh-ink text-[#FAF6E7] text-xs font-semibold shrink-0">
              Go-live checklist
            </button>
          </div>
        ) : null}

        {!isDoctor && info?.credentialsRotatedAt && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-900 leading-relaxed">
            <strong>Security update:</strong> API keys and webhook signing secrets issued before {new Date(info.credentialsRotatedAt).toLocaleDateString()} were revoked.
            Create new keys in Developers → API keys and copy your new signing secret from Developers → Webhooks.
          </div>
        )}

        <div className="rounded-3xl border border-rh-ink/10 bg-white p-5 sm:p-7 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            {info?.logoUrl ? (
              <div className="w-14 h-14 rounded-2xl border border-rh-ink/10 bg-white p-2 flex items-center justify-center shrink-0">
                <img src={info.logoUrl} alt={info.name} className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-2xl border border-rh-ink/10 bg-[#FAF6E7] flex items-center justify-center shrink-0">
                {isDoctor ? <Stethoscope className="w-7 h-7 text-rh-ink" /> : <Building2 className="w-7 h-7 text-rh-ink" />}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-rh-ink truncate">
                  {info?.name ?? (isDoctor ? "Your referral portal" : "Partner organisation")}
                </h1>
                {isDoctor ? (
                  <Pill tone="green">Verified referring doctor</Pill>
                ) : (
                  <EnvBadge env={environment} />
                )}
                {isDoctor ? null : info?.productionStatus === "approved" ? (
                  <Pill tone="green">Production approved</Pill>
                ) : info?.productionStatus === "requested" ? (
                  <Pill tone="amber">Go-live under review</Pill>
                ) : info?.productionStatus === "suspended" ? (
                  <Pill tone="red">Production suspended</Pill>
                ) : (
                  <Pill tone="gray">Sandbox only</Pill>
                )}
              </div>
              <p className="text-[#52706e] text-xs sm:text-sm leading-relaxed">
                {isDoctor
                  ? "Refer patients, follow their care and track the commission you earn."
                  : "Referrals, referral links, webhooks, API keys and commissions for your organisation."}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 self-start md:self-auto">
            {isDoctor && ctx && (
              <button type="button" onClick={() => setReferOpen(true)} className="sm:hidden inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-rh-ink text-[#FAF6E7] text-xs font-semibold">
                <UserPlus className="w-3.5 h-3.5" />
                Refer a patient
              </button>
            )}
            <div className="bg-[#FAF6E7]/80 border border-rh-ink/10 rounded-2xl px-4 py-2.5 flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-[#52706e] font-semibold">{isDoctor ? "Your referral code" : "Partner code"}</span>
                <span className="font-mono text-xs font-bold text-rh-ink">{partnerCode}</span>
              </div>
              <CopyButton text={partnerCode} label={isDoctor ? "Referral code" : "Partner code"} />
            </div>
          </div>
        </div>

        <div className="border-b border-rh-ink/10 pb-px">
          <nav className="flex gap-1 sm:gap-2 overflow-x-auto no-scrollbar p-1 bg-rh-ink/5 rounded-2xl max-w-full" aria-label="Portal sections">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                    active ? "bg-white text-rh-ink shadow-xs" : "text-[#52706e] hover:text-rh-ink hover:bg-white/50"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${active ? "text-[#00cd0f]" : "text-[#52706e]"}`} />
                  <span>{tab.label}</span>
                  {tab.id === "golive" && info?.productionStatus === "requested" && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                </button>
              );
            })}
          </nav>
        </div>

        {!ctx ? (
          <LoadingBlock label="Loading your organisation…" />
        ) : (
          <>
            {activeTab === "overview" &&
              (ctx.isDoctor ? (
                <DoctorOverview ctx={ctx} overview={overview} onNavigate={setActiveTab} />
              ) : (
                <OverviewTab ctx={ctx} overview={overview} onNavigate={setActiveTab} />
              ))}
            {activeTab === "refer" && <ReferPatientPanel ctx={ctx} />}
            {activeTab === "referrals" && <ReferralsTab ctx={ctx} />}
            {activeTab === "links" && <LinksTab ctx={ctx} />}
            {activeTab === "developers" && <DevelopersTab ctx={ctx} onNavigate={setActiveTab} />}
            {activeTab === "golive" && <GoLivePanel ctx={ctx} />}
            {activeTab === "commercial" && <CommercialTab ctx={ctx} />}
            {activeTab === "settings" && <SettingsTab ctx={ctx} />}
            <ReferPatientModal ctx={ctx} open={referOpen} onClose={() => setReferOpen(false)} />
          </>
        )}
      </main>
    </div>
  );
}
