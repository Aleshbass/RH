/**
 * Convex functions the referring doctor's portal calls, by name, with their types written out:
 * the generated `api` object sits at TypeScript's depth limit (TS2589), so new screens use
 * makeFunctionReference instead.
 */
import { makeFunctionReference } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import type { DoctorCareSetting, DoctorStage, DoctorStep, DoctorUrgency } from "@/convex/helpers/doctorStages";

export type CareTeam = { physio: string | null; clinic: string | null };

export type DoctorReferralRow = {
  referralId: Id<"inboundReferrals">;
  trackingCode: string;
  patientName: string;
  condition: string | null;
  urgency: DoctorUrgency;
  careSetting: DoctorCareSetting | null;
  city: string | null;
  stage: DoctorStage;
  stepIndex: number;
  open: boolean;
  viaLink: boolean;
  careTeam: CareTeam;
  reportCount: number;
  createdAt: number;
  updatedAt: number;
};

export type DoctorReport = {
  id: Id<"progressReports">;
  kind: "progress" | "discharge";
  sentAt: number;
  physioName: string;
  state: "open" | "expired" | "withdrawn";
  url: string | null;
  expiresAt: number;
};

export type DoctorReferralDetail = DoctorReferralRow & {
  patient: { firstName: string; lastName: string | null; phone: string | null; email: string | null };
  notes: string | null;
  letter: { name: string; url: string | null } | null;
  timeline: Array<{ key: DoctorStep; label: string; state: "done" | "current" | "upcoming"; at: number | null }>;
  outcome: { key: DoctorStage; label: string; detail: string; at: number } | null;
  sessions: { completed: number; upcoming: number; planned: number | null; nextAt: string | null; lastAt: string | null };
  reports: DoctorReport[];
  earnedKobo: number;
  awaitingApprovalKobo: number;
  trackingUrl: string | null;
};

export type DoctorHomeData = {
  name: string;
  counts: { total: number; waiting: number; inCare: number; discharged: number; ended: number };
  countIsCapped: boolean;
  recent: DoctorReferralRow[];
};

export type ShareLink = { url: string; publicCode: string; clicks: number; leads: number; bookings: number };

export type CreatedReferral = {
  id: string;
  tracking_code: string;
  links?: { tracking_url?: string; whatsapp_intake_url?: string };
};

export type CommercialSummary = {
  totalEarnedKobo: number;
  availablePayoutKobo: number;
  inPayoutKobo: number;
  paidOutKobo: number;
  reversedKobo: number;
  pendingApprovalKobo?: number;
  performance: { liveReferrals: number; paidPatients: number };
};

export type Contract = {
  isDefault: boolean;
  contractNumber: string | null;
  revenueSharePercent: number | null;
  baseFeePerBooking?: number | null;
  activationBonusPerPatient?: number | null;
  withholdingTaxPercent?: number | null;
  paymentTermsDays?: number | null;
};

export type CommissionRow = {
  _id: string;
  trackingCode: string | null;
  patientName: string | null;
  eventType: string;
  grossTransactionAmount: number;
  commissionAmount: number;
  netPayable: number;
  source: string | null;
  billingPeriod: string | null;
  status: "pending" | "approved" | "paid" | "reversed" | "cancelled";
  payoutStatus: string;
  earnedAt: number;
  paidAt: number | null;
};

export type BankAccount = {
  _id: Id<"partnerBankAccounts">;
  bankName: string;
  accountNumberMasked: string;
  accountName: string;
  isVerified: boolean;
  isDefault: boolean;
};

type ByPartner = { partnerCode: string };
type ByPartnerId = { partnerId: string };

export const doctorRefs = {
  home: makeFunctionReference<"query", ByPartner, DoctorHomeData | null>("doctorPortal:getDoctorHome"),
  list: makeFunctionReference<"query", ByPartner, { rows: DoctorReferralRow[]; capped: boolean } | null>("doctorPortal:listDoctorReferrals"),
  detail: makeFunctionReference<"query", ByPartner & { referralId: string }, DoctorReferralDetail | null>("doctorPortal:getDoctorReferral"),
  shareLink: makeFunctionReference<"query", ByPartner, { name: string; link: ShareLink | null } | null>("doctorPortal:getDoctorShareLink"),
  ensureShareLink: makeFunctionReference<"mutation", ByPartner, ShareLink>("doctorPortal:ensureDoctorShareLink"),
  createReferral: makeFunctionReference<
    "mutation",
    {
      partnerCode: string;
      firstName: string;
      lastName?: string;
      phone: string;
      email?: string;
      city?: string;
      condition?: string;
      notes?: string;
      consentGranted: boolean;
      urgency?: DoctorUrgency;
      careSetting?: DoctorCareSetting;
      letterStorageId?: Id<"_storage">;
      letterName?: string;
    },
    CreatedReferral
  >("partners:createPortalReferral"),
  uploadUrl: makeFunctionReference<"mutation", { fileType: string; fileName: string }, string>("files:generateUploadUrl"),
  // Earnings (shared with every partner type)
  summary: makeFunctionReference<"query", ByPartnerId, CommercialSummary>("commercialTerms:getPartnerCommercialSummary"),
  contract: makeFunctionReference<"query", ByPartnerId, Contract>("commercialTerms:getActivePartnerContract"),
  commissions: makeFunctionReference<
    "query",
    ByPartnerId & { status?: string; billingPeriod?: string; limit?: number },
    CommissionRow[]
  >("commercialTerms:listPartnerCommissions"),
  bankAccounts: makeFunctionReference<"query", ByPartner, BankAccount[]>("partnerBankAccounts:getPartnerBankAccounts"),
  bankList: makeFunctionReference<"action", Record<string, never>, Array<{ name: string; code: string }>>("partnerBankAccounts:getPartnerBankList"),
  verifyBank: makeFunctionReference<
    "action",
    ByPartner & { bankCode: string; accountNumber: string },
    { success: boolean; accountName?: string; message: string }
  >("partnerBankAccounts:verifyPartnerBankAccount"),
  saveBank: makeFunctionReference<"action", ByPartner & { bankCode: string; bankName: string; accountNumber: string }, { accountName: string }>(
    "partnerBankAccounts:savePartnerBankAccount"
  ),
  removeBank: makeFunctionReference<"mutation", ByPartner & { accountId: Id<"partnerBankAccounts"> }, unknown>(
    "partnerBankAccounts:deletePartnerBankAccount"
  ),
  // Profile
  updateProfile: makeFunctionReference<
    "mutation",
    ByPartner & { name?: string; contactName?: string; contactEmail?: string; contactPhone?: string },
    unknown
  >("partners:updatePartnerBranding"),
  doctorProfile: makeFunctionReference<
    "query",
    Record<string, never>,
    { profile: { title?: string; specialty?: string; medicalLicenseNumber?: string; hospitalAffiliation?: string } | null } | null
  >("doctors:getMyDoctorProfile"),
  // Notifications (the bell)
  notifications: makeFunctionReference<"query", { limit?: number; includeRead?: boolean }, DoctorNotification[]>(
    "notifications:getMyNotifications"
  ),
  unreadCount: makeFunctionReference<"query", Record<string, never>, number>("notifications:getMyUnreadCount"),
  markRead: makeFunctionReference<"mutation", { notificationId: Id<"notifications"> }, unknown>("notifications:markAsRead"),
  markAllRead: makeFunctionReference<"mutation", Record<string, never>, unknown>("notifications:markAllMyAsRead"),
};

export type DoctorNotification = {
  _id: Id<"notifications">;
  type?: string;
  createdAt: number;
  readAt?: number;
  status?: string;
  payload?: {
    title?: string;
    body?: string;
    link?: string;
    data?: { actionUrl?: string; referralId?: string };
  };
};
