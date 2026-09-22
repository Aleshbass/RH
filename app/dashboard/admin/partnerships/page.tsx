"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import Link from "next/link";
import {
  Building2,
  Mail,
  Phone,
  ExternalLink,
  Activity,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  FileText,
  Image as ImageIcon,
  Link2,
  Copy,
  Check,
  Percent,
  Wallet,
  Landmark,
  CreditCard,
  Users,
  Eye,
  Sparkles,
  AlertCircle,
  Save,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Printer,
  Download,
  Receipt,
  RefreshCw,
  Send,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

export default function AdminPartnershipsPage() {
  const [activeTab, setActiveTab] = useState<"revenue" | "bulk_payouts" | "applications" | "inquiries">("bulk_payouts");

  // Inquiries data & mutations
  const inquiries = useQuery(api.adminPartnerships.getPartnershipInquiries);
  const updateStatus = useMutation(api.adminPartnerships.updatePartnershipInquiryStatus);

  // Partner portal applications data & mutations
  const partnerApplications = useQuery(api.adminPartnerships.getPartnerApplications, {});
  const reviewApplication = useMutation(api.adminPartnerships.reviewPartnerApplication);

  // Platform Revenue Settings
  const revenueSettings = useQuery(api.platformSettings.getPlatformRevenueSettings);
  const updateRevenueSettings = useMutation(api.platformSettings.updatePlatformRevenueSettings);

  // Revenue Settings Form State
  const [physioPercent, setPhysioPercent] = useState<number>(80);
  const [rehabifyPercent, setRehabifyPercent] = useState<number>(10);
  const [partnerPercent, setPartnerPercent] = useState<number>(10);
  const [virtualRateNaira, setVirtualRateNaira] = useState<number>(6000);
  const [inPersonRateNaira, setInPersonRateNaira] = useState<number>(10000);
  const [feeBearerInbound, setFeeBearerInbound] = useState<"physiotherapist" | "patient" | "rehabify" | "split_proportional">("physiotherapist");
  const [feeBearerOutbound, setFeeBearerOutbound] = useState<"physiotherapist" | "partner" | "rehabify" | "split_proportional">("physiotherapist");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Sync loaded platform revenue settings
  useEffect(() => {
    if (revenueSettings) {
      setPhysioPercent(revenueSettings.physiotherapistPercent);
      setRehabifyPercent(revenueSettings.rehabifyPercent);
      setPartnerPercent(revenueSettings.partnerPercent);
      setVirtualRateNaira(Math.round(revenueSettings.defaultVirtualRateKobo / 100));
      setInPersonRateNaira(Math.round(revenueSettings.defaultInPersonRateKobo / 100));
      if (revenueSettings.paystackFeeBearerInbound) {
        setFeeBearerInbound(revenueSettings.paystackFeeBearerInbound as any);
      }
      if (revenueSettings.paystackFeeBearerOutbound) {
        setFeeBearerOutbound(revenueSettings.paystackFeeBearerOutbound as any);
      }
    }
  }, [revenueSettings]);

  // Monthly Bulk Payouts State
  const currentMonthStr = format(new Date(), "yyyy-MM");
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState<string>(currentMonthStr);
  const monthlySummary = useQuery(api.monthlySettlements.getMonthlyBulkPayoutSummary, {
    billingPeriod: selectedBillingPeriod,
  });
  const processBulkPayoutMutation = useMutation(api.monthlySettlements.processMonthlyBulkPayout);
  const getPaystackBalanceAction = useAction((api as any).monthlySettlements.getPaystackBalance);
  const executePartnerPayoutAction = useAction((api as any).monthlySettlements.executePartnerPayoutTransfer);
  const finalizePartnerPayoutAction = useAction((api as any).monthlySettlements.finalizePartnerPayoutTransfer);
  const executeBulkPayoutAction = useAction((api as any).monthlySettlements.executePaystackBulkMonthlyPayout);

  // Paystack Live Balance & Disbursement State
  const [paystackBalance, setPaystackBalance] = useState<{ balanceNaira: number; balanceKobo: number } | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [payoutMode, setPayoutMode] = useState<"paystack" | "manual">("paystack");
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [pendingTransferData, setPendingTransferData] = useState<{ transferCode: string; transferReference: string } | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  // Payout modal state
  const [selectedPartnerForPayout, setSelectedPartnerForPayout] = useState<any>(null);
  const [payoutNote, setPayoutNote] = useState("");
  const [isProcessingPayout, setIsProcessingPayout] = useState(false);

  // Ledger drill-down modal state
  const [selectedPartnerForLedger, setSelectedPartnerForLedger] = useState<any>(null);

  // Invoice modal state
  const [selectedPartnerForInvoice, setSelectedPartnerForInvoice] = useState<string | null>(null);
  const invoiceData = useQuery(
    api.monthlySettlements.generatePartnerInvoice,
    selectedPartnerForInvoice
      ? {
          partnerCode: selectedPartnerForInvoice,
          billingPeriod: selectedBillingPeriod,
        }
      : "skip"
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  // Referral link generation state for admin
  const [selectedPartnerForLink, setSelectedPartnerForLink] = useState<any>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [careMode, setCareMode] = useState("patient_choice");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [generatedLinkResult, setGeneratedLinkResult] = useState<{ publicCode: string; url: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const createLinkMutation = useMutation(api.partnerLinks.createReferralLink);

  const openLinkModal = (partner: any) => {
    setSelectedPartnerForLink(partner);
    setCampaignName(`${partner.name} Referral Campaign`);
    setCareMode("patient_choice");
    setExpiresInDays("30");
    setGeneratedLinkResult(null);
    setCopiedLink(false);
    setIsLinkModalOpen(true);
  };

  const handleGenerateLink = async () => {
    if (!selectedPartnerForLink) return;
    setIsGeneratingLink(true);
    try {
      const days = parseInt(expiresInDays) || 0;
      const expiresAt = days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : undefined;
      const res = await createLinkMutation({
        partnerId: selectedPartnerForLink.code,
        campaignName: campaignName.trim() || undefined,
        defaultCareMode: careMode,
        expiresAt,
      });
      const host = typeof window !== "undefined" ? window.location.host : "physioaroundme.com";
      const protocol = typeof window !== "undefined" && window.location.protocol ? window.location.protocol : "https:";
      const linkUrl = `${protocol}//${host}/r/${res.publicCode}`;

      setGeneratedLinkResult({
        publicCode: res.publicCode,
        url: linkUrl,
      });
      toast.success("Referral link generated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate referral link");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleCopyLink = (url: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      toast.success("Referral link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Count pending applications
  const pendingCount = (partnerApplications || []).filter((p: any) => p.approvalStatus === "pending").length;

  const handleStatusChange = async (id: string, newStatus: "new" | "contacted" | "closed") => {
    setIsUpdating(id);
    try {
      await updateStatus({
        id: id as Id<"partnershipInquiries">,
        status: newStatus,
      });
      toast.success("Inquiry status updated");
    } catch (error) {
      toast.error("Failed to update status");
    } finally {
      setIsUpdating(null);
    }
  };

  const handleReviewPartner = async (partnerId: string, action: "approve" | "reject") => {
    setIsUpdating(partnerId);
    try {
      const res = await reviewApplication({
        partnerId: partnerId as Id<"partners">,
        action,
      });
      if (action === "approve") {
        toast.success("Partner application approved! Portal access and API keys activated.");
      } else {
        toast.info("Partner application declined.");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to update partner application");
    } finally {
      setIsUpdating(null);
    }
  };

  // Filter inquiries with resilient property fallbacks
  const filteredInquiries = (inquiries || []).filter((inquiry: any) => {
    const org = (inquiry.organization || inquiry.organizationName || "").toLowerCase();
    const contact = (inquiry.name || inquiry.contactName || "").toLowerCase();
    const mail = (inquiry.email || "").toLowerCase();
    const q = searchTerm.toLowerCase();

    const matchesSearch = org.includes(q) || contact.includes(q) || mail.includes(q);
    const matchesStatus = statusFilter === "all" || inquiry.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filter partner applications with resilient property fallbacks
  const filteredApplications = (partnerApplications || []).filter((partner: any) => {
    const name = (partner.name || "").toLowerCase();
    const code = (partner.code || "").toLowerCase();
    const email = (partner.contactEmail || partner.ownerEmail || "").toLowerCase();
    const q = searchTerm.toLowerCase();

    const matchesSearch = name.includes(q) || code.includes(q) || email.includes(q);
    const matchesStatus = statusFilter === "all" || partner.approvalStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Save platform revenue settings
  const handleSaveRevenueSettings = async () => {
    const total = Number(physioPercent) + Number(rehabifyPercent) + Number(partnerPercent);
    if (total !== 100) {
      toast.error(`Total percentage must equal 100%. Current sum: ${total}%`);
      return;
    }
    if (virtualRateNaira <= 0 || inPersonRateNaira <= 0) {
      toast.error("Rates must be greater than zero");
      return;
    }

    setIsSavingSettings(true);
    try {
      await updateRevenueSettings({
        physiotherapistPercent: Number(physioPercent),
        rehabifyPercent: Number(rehabifyPercent),
        partnerPercent: Number(partnerPercent),
        defaultVirtualRateKobo: Math.round(virtualRateNaira * 100),
        defaultInPersonRateKobo: Math.round(inPersonRateNaira * 100),
        payoutSchedule: "end_of_month",
        paystackFeeBearerInbound: feeBearerInbound,
        paystackFeeBearerOutbound: feeBearerOutbound,
      });
      toast.success("Platform revenue split & pricing settings updated successfully! Changes are active platform-wide.");
    } catch (err: any) {
      toast.error(err.message || "Failed to update revenue settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Fetch Paystack treasury balance
  const fetchPaystackBalance = async () => {
    setIsLoadingBalance(true);
    try {
      const res = await getPaystackBalanceAction({});
      if (res.success) {
        setPaystackBalance({ balanceNaira: res.balanceNaira, balanceKobo: res.balanceKobo });
      }
    } catch (err) {
      console.warn("Could not fetch Paystack balance:", err);
    } finally {
      setIsLoadingBalance(false);
    }
  };

  useEffect(() => {
    if (activeTab === "bulk_payouts") {
      fetchPaystackBalance();
    }
  }, [activeTab]);

  // Process partner payout (Paystack automated or manual wire reference)
  const handleConfirmPayout = async () => {
    if (!selectedPartnerForPayout) return;
    setIsProcessingPayout(true);
    try {
      if (payoutMode === "paystack") {
        const res = await executePartnerPayoutAction({
          partnerCode: selectedPartnerForPayout.partnerId,
          billingPeriod: selectedBillingPeriod,
          note: payoutNote.trim() || undefined,
        });

        if (res.requiresOtp) {
          setRequiresOtp(true);
          setPendingTransferData({
            transferCode: res.transferCode,
            transferReference: res.transferReference,
          });
          toast.info("Paystack requires OTP authorization to complete this transfer. Enter the OTP code below.");
          return;
        }

        toast.success(res.message || "Payout transfer initiated successfully!");
        setSelectedPartnerForPayout(null);
        setPayoutNote("");
        setRequiresOtp(false);
        setOtpCode("");
        fetchPaystackBalance();
      } else {
        // Manual bank wire reference
        const res = await processBulkPayoutMutation({
          partnerId: selectedPartnerForPayout.partnerId,
          billingPeriod: selectedBillingPeriod,
          note: payoutNote.trim() || undefined,
        });
        toast.success(res.message || "Manual payout marked as settled!");
        setSelectedPartnerForPayout(null);
        setPayoutNote("");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process payout");
    } finally {
      setIsProcessingPayout(false);
    }
  };

  // Finalize Paystack transfer with OTP
  const handleFinalizeOtp = async () => {
    if (!pendingTransferData || !otpCode.trim() || !selectedPartnerForPayout) return;
    setIsProcessingPayout(true);
    try {
      const res = await finalizePartnerPayoutAction({
        transferCode: pendingTransferData.transferCode,
        otp: otpCode.trim(),
        partnerCode: selectedPartnerForPayout.partnerId,
        billingPeriod: selectedBillingPeriod,
        transferReference: pendingTransferData.transferReference,
      });
      toast.success(res.message || "Transfer finalized successfully!");
      setSelectedPartnerForPayout(null);
      setRequiresOtp(false);
      setOtpCode("");
      setPendingTransferData(null);
      fetchPaystackBalance();
    } catch (err: any) {
      toast.error(err.message || "Failed to finalize OTP transfer");
    } finally {
      setIsProcessingPayout(false);
    }
  };

  // Execute bulk payout via Paystack Transfer API
  const handleConfirmBulkDisburse = async () => {
    setIsProcessingBulk(true);
    try {
      const res = await executeBulkPayoutAction({
        billingPeriod: selectedBillingPeriod,
      });
      toast.success(res.message || "Bulk payout executed successfully!");
      setIsBulkModalOpen(false);
      fetchPaystackBalance();
    } catch (err: any) {
      toast.error(err.message || "Failed to execute bulk payout");
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const formatNaira = (kobo: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(Math.round(kobo / 100));
  };

  const handleExportInvoiceCSV = (invoice: any) => {
    if (!invoice || !invoice.lineItems) return;
    const headers = [
      "S/N",
      "Date",
      "Tracking Code",
      "Patient",
      "Physiotherapist",
      "Care Mode",
      "Gross Amount (NGN)",
      "Physio Share (NGN)",
      "Rehabify Share (NGN)",
      "Partner Share (NGN)",
      "Paystack Outbound Fee (NGN)",
      "Stamp Duty (NGN)",
      "Net Partner Payable (NGN)",
      "Payment Channel",
      "Reference",
    ];
    const rows = invoice.lineItems.map((l: any) => [
      l.sn,
      l.date,
      l.trackingCode,
      `"${l.patientName}"`,
      `"${l.physiotherapistName}"`,
      l.careMode,
      (l.grossAmountKobo / 100).toFixed(2),
      (l.physioShareKobo / 100).toFixed(2),
      (l.rehabifyShareKobo / 100).toFixed(2),
      (l.partnerShareKobo / 100).toFixed(2),
      (l.paystackOutboundFeeKobo / 100).toFixed(2),
      (l.stampDutyKobo / 100).toFixed(2),
      (l.netPartnerAmountKobo / 100).toFixed(2),
      l.paymentMethod,
      l.paymentReference,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e: any) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${invoice.invoiceNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Invoice data exported to CSV");
  };

  // Generate 6 months billing period options
  const billingPeriodOptions = [
    { value: currentMonthStr, label: `${format(new Date(), "MMMM yyyy")} (Current Month)` },
    ...[1, 2, 3, 4, 5].map((offset) => {
      const d = new Date();
      d.setMonth(d.getMonth() - offset);
      return {
        value: format(d, "yyyy-MM"),
        label: format(d, "MMMM yyyy"),
      };
    }),
  ];

  const totalPercentSum = Number(physioPercent) + Number(rehabifyPercent) + Number(partnerPercent);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Partner & Revenue Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Centrally manage platform revenue split (80/10/10), monthly bulk payouts, B2B partner applications, and website inquiries.
          </p>
        </div>

        {/* Dynamic Controls based on Active Tab */}
        {activeTab === "bulk_payouts" && (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Billing Cycle:</span>
            <Select value={selectedBillingPeriod} onValueChange={setSelectedBillingPeriod}>
              <SelectTrigger className="w-full sm:w-[220px] bg-white border-teal-200 text-xs font-medium">
                <SelectValue placeholder="Select billing cycle" />
              </SelectTrigger>
              <SelectContent>
                {billingPeriodOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {(activeTab === "applications" || activeTab === "inquiries") && (
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search by name, code or email..."
                className="pl-9 w-full sm:w-[260px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <SelectValue placeholder="Filter Status" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {activeTab === "applications" ? (
                  <>
                    <SelectItem value="pending">Pending Review</SelectItem>
                    <SelectItem value="approved">Approved & Active</SelectItem>
                    <SelectItem value="rejected">Declined</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {activeTab === "revenue" && (
          <div className="flex items-center gap-2 text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Platform-wide live commercial engine</span>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-2 sm:space-x-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab("bulk_payouts")}
            className={`py-3 px-3 border-b-2 font-medium text-sm transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === "bulk_payouts"
                ? "border-[#005b57] text-[#005b57]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>Monthly Bulk Payouts & Referrals</span>
            {monthlySummary && monthlySummary.totals.totalReferredPatients > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold">
                {monthlySummary.totals.totalReferredPatients} referred
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("revenue")}
            className={`py-3 px-3 border-b-2 font-medium text-sm transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === "revenue"
                ? "border-[#005b57] text-[#005b57]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Percent className="w-4 h-4" />
            <span>Platform Revenue Split (80/10/10)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("applications");
              setStatusFilter("all");
            }}
            className={`py-3 px-3 border-b-2 font-medium text-sm transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === "applications"
                ? "border-[#005b57] text-[#005b57]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Partner Portal Applications</span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                {pendingCount} pending
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab("inquiries");
              setStatusFilter("all");
            }}
            className={`py-3 px-3 border-b-2 font-medium text-sm transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === "inquiries"
                ? "border-[#005b57] text-[#005b57]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>Website Inquiries</span>
            {inquiries && inquiries.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                {inquiries.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* ================================================================== */}
      {/* VIEW: MONTHLY BULK PAYOUTS & REFERRALS AGGREGATOR */}
      {/* ================================================================== */}
      {activeTab === "bulk_payouts" && (
        <div className="space-y-6">
          {/* Header Notice Banner */}
          <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-teal-900">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-teal-100 rounded-lg text-teal-800 shrink-0">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm text-teal-950">End-of-Month Consolidated Bulk Settlement Engine</p>
                <p className="text-teal-700 mt-0.5">
                  Patient sessions referred by partner clinics, hospitals, and doctors are aggregated in monthly billing cycles.
                  Commissions are settled in bulk at month-end to their verified bank accounts.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-teal-200/80 text-teal-900 font-mono font-semibold whitespace-nowrap">
              Cycle: {selectedBillingPeriod}
            </span>
          </div>

          {/* Metric KPI Cards */}
          {monthlySummary === undefined ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#005b57] border-t-transparent"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Referred Patients</span>
                  <Users className="w-4 h-4 text-teal-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {monthlySummary.totals.totalReferredPatients}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Across {monthlySummary.totals.totalPartners} partner institutions
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Gross Care Value</span>
                  <Landmark className="w-4 h-4 text-gray-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {formatNaira(monthlySummary.totals.totalGrossCharged)}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">Total booking billings</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-700">Physiotherapists (80%)</span>
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-emerald-700 mt-2">
                  {formatNaira(monthlySummary.totals.totalPhysiotherapistShare)}
                </p>
                <p className="text-[11px] text-emerald-600 mt-1">Direct clinician earnings</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-700">Rehabify (10%)</span>
                  <Percent className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-2xl font-bold text-blue-700 mt-2">
                  {formatNaira(monthlySummary.totals.totalRehabifyShare)}
                </p>
                <p className="text-[11px] text-blue-600 mt-1">Platform operations revenue</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-teal-200 bg-teal-50/30 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-teal-800">Partner Pool (10%)</span>
                  <Wallet className="w-4 h-4 text-teal-700" />
                </div>
                <p className="text-2xl font-bold text-teal-900 mt-2">
                  {formatNaira(monthlySummary.totals.totalPartnerCommission)}
                </p>
                <p className="text-[11px] text-teal-700 mt-1">Month-end bulk payouts</p>
              </div>
            </div>
          )}

          {/* Paystack Automated Payout Treasury & Balance Bar */}
          <div className="bg-gradient-to-r from-teal-900 to-[#005b57] p-4 rounded-xl text-white shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-teal-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">Paystack Disbursement Balance</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 font-mono text-[10px] font-semibold border border-emerald-400/30">
                    Live NGN
                  </span>
                </div>
                <p className="text-teal-100 text-[11px] mt-0.5">
                  Available funds in Paystack treasury for direct automated partner commission payouts.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <div className="text-right">
                <span className="text-[10px] text-teal-200 uppercase tracking-wider block">Available Balance</span>
                <span className="text-lg font-bold text-white">
                  {isLoadingBalance
                    ? "Checking..."
                    : paystackBalance
                    ? formatNaira(paystackBalance.balanceKobo)
                    : "₦0"}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchPaystackBalance}
                disabled={isLoadingBalance}
                className="h-8 px-2.5 bg-white/10 hover:bg-white/20 border-white/20 text-white text-xs"
                title="Refresh Paystack Balance"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBalance ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* Payment Channels Transparency Bar */}
          {monthlySummary && (
            <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-gray-500" />
                <span className="font-semibold text-gray-700">Multi-Channel Payment Recording:</span>
                <span className="text-gray-500">
                  Online (Paystack) and Direct Bank Transfer payments are recorded and split identically so no transaction is lost.
                </span>
              </div>
              <div className="flex items-center gap-4 shrink-0 font-medium">
                <span className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
                  Paystack: <strong>{formatNaira(monthlySummary.totals.paystackTotal)}</strong>
                </span>
                <span className="flex items-center gap-1.5 text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-100">
                  Bank Transfer: <strong>{formatNaira(monthlySummary.totals.bankTransferTotal)}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Aggregated Partner Settlement Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Referring Clinics, Firms & Doctors Summary</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Monthly aggregated patient volumes, transparent fee splits, and bulk payout disbursement status.
                </p>
              </div>
              <div className="flex items-center gap-2.5 self-end sm:self-auto">
                <span className="text-xs text-gray-500 mr-1">
                  {monthlySummary?.partners.length || 0} referring institutions
                </span>
                {monthlySummary && monthlySummary.partners.some((p: any) => p.bulkPayoutStatus !== "paid" && p.totalPartnerCommission > 0) && (
                  <Button
                    size="sm"
                    onClick={() => setIsBulkModalOpen(true)}
                    className="h-8 px-3 bg-[#005b57] hover:bg-[#004744] text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Disburse All via Bulk Transfer</span>
                  </Button>
                )}
              </div>
            </div>

            {monthlySummary === undefined ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#005b57] border-t-transparent"></div>
              </div>
            ) : monthlySummary.partners.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="mx-auto h-10 w-10 text-gray-300" />
                <h4 className="mt-3 text-sm font-semibold text-gray-900">No partner referrals in this cycle</h4>
                <p className="mt-1 text-xs text-gray-500">
                  When partner institutions refer patients who complete bookings, aggregated settlements will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">Referring Entity</th>
                      <th className="py-3 px-2 text-center">Patients</th>
                      <th className="py-3 px-3 text-right">Total Charged</th>
                      <th className="py-3 px-3 text-right text-emerald-800">Physio (80%)</th>
                      <th className="py-3 px-3 text-right text-blue-800">Rehabify (10%)</th>
                      <th className="py-3 px-3 text-right text-teal-800">Partner Gross (10%)</th>
                      <th className="py-3 px-3 text-left">Bank Account</th>
                      <th className="py-3 px-3 text-right">Fees & Duty</th>
                      <th className="py-3 px-3 text-right text-teal-900">Net Payout</th>
                      <th className="py-3 px-2 text-center">Channels</th>
                      <th className="py-3 px-2 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {monthlySummary.partners.map((p: any) => (
                      <tr key={p.partnerId} className="hover:bg-gray-50/70 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-gray-900">{p.partnerName}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="inline-flex items-center rounded-full bg-teal-50 px-1.5 py-0.2 text-[10px] font-medium text-teal-700 uppercase border border-teal-100">
                              {p.partnerType}
                            </span>
                            <span className="font-mono text-[10px] text-gray-400">[{p.partnerId}]</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-2 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 font-bold text-xs">
                            {p.totalReferredPatients}
                          </span>
                        </td>

                        <td className="py-3.5 px-3 text-right font-medium text-gray-900">
                          {formatNaira(p.totalGrossCharged)}
                        </td>

                        <td className="py-3.5 px-3 text-right text-emerald-700 font-medium">
                          {formatNaira(p.totalPhysiotherapistShare)}
                        </td>

                        <td className="py-3.5 px-3 text-right text-blue-700 font-medium">
                          {formatNaira(p.totalRehabifyShare)}
                        </td>

                        <td className="py-3.5 px-3 text-right text-teal-900 font-bold">
                          {formatNaira(p.totalPartnerCommission)}
                        </td>

                        <td className="py-3.5 px-3 text-left">
                          {p.hasBankAccount ? (
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <div className="leading-tight">
                                <span className="font-medium text-gray-900 text-[11px] block">{p.bankName}</span>
                                <span className="font-mono text-gray-500 text-[10px]">{p.maskedAccountNumber}</span>
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                              <AlertCircle className="w-3 h-3 text-amber-500" />
                              No Bank Details
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-3 text-right">
                          <div className="text-[11px] font-medium text-gray-700">
                            -₦{Math.round(((p.estimatedOutboundFeeKobo || 0) + (p.estimatedStampDutyKobo || 0)) / 100).toLocaleString()}
                          </div>
                          <div className="text-[9px] text-gray-500">
                            (₦{Math.round((p.estimatedOutboundFeeKobo || 0) / 100)} fee + ₦{Math.round((p.estimatedStampDutyKobo || 0) / 100)} duty)
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-right font-bold text-teal-900">
                          {formatNaira(p.estimatedNetPayoutKobo || p.totalPartnerCommission)}
                        </td>

                        <td className="py-3.5 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {p.paystackCount > 0 && (
                              <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100" title="Paystack Bookings">
                                {p.paystackCount} PS
                              </span>
                            )}
                            {p.bankTransferCount > 0 && (
                              <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-100" title="Bank Transfer Bookings">
                                {p.bankTransferCount} BT
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-2 text-center">
                          {p.bulkPayoutStatus === "paid" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Settled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" /> Pending
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedPartnerForInvoice(p.partnerId)}
                              className="text-xs h-7 px-2 border-teal-200 text-teal-800 hover:bg-teal-50"
                              title="Generate and download partner invoice"
                            >
                              <Receipt className="w-3.5 h-3.5 mr-1 text-teal-700" />
                              Invoice
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedPartnerForLedger(p)}
                              className="text-xs h-7 px-2 border-gray-200 text-gray-700 hover:bg-gray-100"
                              title="View itemized consultation records"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1 text-teal-600" />
                              Ledger
                            </Button>

                            {p.bulkPayoutStatus === "pending" && p.totalPartnerCommission > 0 ? (
                              <Button
                                size="sm"
                                onClick={() => setSelectedPartnerForPayout(p)}
                                className="text-xs h-7 px-2.5 bg-[#005b57] hover:bg-[#004744] text-white font-semibold"
                              >
                                Settle
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled
                                className="text-xs h-7 px-2 text-emerald-700 font-medium"
                              >
                                <Check className="w-3.5 h-3.5 mr-1" /> Paid
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* VIEW: PLATFORM REVENUE SPLIT & DYNAMIC PRICING ENGINE */}
      {/* ================================================================== */}
      {activeTab === "revenue" && (
        <div className="space-y-6">
          {/* Header Description */}
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-2xs space-y-2">
            <div className="flex items-center gap-2">
              <Percent className="w-5 h-5 text-[#005b57]" />
              <h2 className="text-base font-bold text-gray-900">Platform Revenue Split & Dynamic Pricing Engine</h2>
            </div>
            <p className="text-xs text-gray-600 max-w-3xl leading-relaxed">
              Define the platform-wide revenue distribution between <strong>Physiotherapists (80%)</strong>, <strong>Rehabify Platform (10%)</strong>, and <strong>Referring Partners (10%)</strong>.
              Establish baseline consultation prices for virtual visits (₦6,000) and in-person sessions (₦10,000 baseline).
              Physiotherapists can set their own custom in-person rates on their dashboard. Updating settings here immediately propagates to booking checkout, payment reconciliation, and the partner transparency portal.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form Column */}
            <div className="lg:col-span-7 space-y-6">
              {/* Revenue Split Card */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="text-sm font-bold text-gray-900">Platform Revenue Split Percentages</h3>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      totalPercentSum === 100
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-red-50 text-red-800 border border-red-200"
                    }`}
                  >
                    {totalPercentSum === 100 ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Total: 100% (Valid)
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                        Total: {totalPercentSum}% (Must equal 100%)
                      </>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Physio Percent */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-emerald-50/50 border border-emerald-100">
                    <label className="text-xs font-bold text-emerald-950">Physiotherapist Share (%)</label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={physioPercent}
                        onChange={(e) => setPhysioPercent(Number(e.target.value))}
                        className="text-sm font-bold text-emerald-900 bg-white border-emerald-200 pr-7"
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs font-bold text-emerald-700">%</span>
                    </div>
                    <p className="text-[10px] text-emerald-700">Standard: 80% to practitioner</p>
                  </div>

                  {/* Rehabify Percent */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-blue-50/50 border border-blue-100">
                    <label className="text-xs font-bold text-blue-950">Rehabify Platform (%)</label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={rehabifyPercent}
                        onChange={(e) => setRehabifyPercent(Number(e.target.value))}
                        className="text-sm font-bold text-blue-900 bg-white border-blue-200 pr-7"
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs font-bold text-blue-700">%</span>
                    </div>
                    <p className="text-[10px] text-blue-700">Standard: 10% platform fee</p>
                  </div>

                  {/* Partner Percent */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-teal-50/50 border border-teal-100">
                    <label className="text-xs font-bold text-teal-950">Referring Partner (%)</label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={partnerPercent}
                        onChange={(e) => setPartnerPercent(Number(e.target.value))}
                        className="text-sm font-bold text-teal-900 bg-white border-teal-200 pr-7"
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs font-bold text-teal-700">%</span>
                    </div>
                    <p className="text-[10px] text-teal-700">Standard: 10% referral commission</p>
                  </div>
                </div>

                {/* Split Visual Progress Bar */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>Revenue Distribution Breakdown:</span>
                    <span>{physioPercent}% Physio / {rehabifyPercent}% Rehabify / {partnerPercent}% Partner</span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden flex">
                    <div
                      style={{ width: `${Math.min(100, Math.max(0, physioPercent))}%` }}
                      className="bg-emerald-600 transition-all"
                      title={`Physiotherapist: ${physioPercent}%`}
                    />
                    <div
                      style={{ width: `${Math.min(100, Math.max(0, rehabifyPercent))}%` }}
                      className="bg-blue-600 transition-all"
                      title={`Rehabify: ${rehabifyPercent}%`}
                    />
                    <div
                      style={{ width: `${Math.min(100, Math.max(0, partnerPercent))}%` }}
                      className="bg-teal-700 transition-all"
                      title={`Referring Partner: ${partnerPercent}%`}
                    />
                  </div>
                </div>
              </div>

              {/* Pricing Baseline Card */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-4">
                <div className="border-b border-gray-100 pb-3">
                  <h3 className="text-sm font-bold text-gray-900">Baseline Consultation Pricing (Naira)</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Default rates used when patients book virtual or in-person care.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">Virtual Consultation Default (₦)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-gray-500">₦</span>
                      <Input
                        type="number"
                        min="1000"
                        step="500"
                        value={virtualRateNaira}
                        onChange={(e) => setVirtualRateNaira(Number(e.target.value))}
                        className="pl-7 text-sm font-medium"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500">Standard tele-physio consultation (Default: ₦6,000)</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">Face-to-Face / In-Person Baseline (₦)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-gray-500">₦</span>
                      <Input
                        type="number"
                        min="5000"
                        step="500"
                        value={inPersonRateNaira}
                        onChange={(e) => setInPersonRateNaira(Number(e.target.value))}
                        className="pl-7 text-sm font-medium"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500">Minimum baseline (Physios can customize higher on dashboard)</p>
                  </div>
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Physiotherapist Dashboard Customization:</strong> Each physiotherapist can customize their own in-person rate directly on their settings dashboard. Bookings made with custom rates will automatically calculate the 80/10/10 split in real-time.
                  </span>
                </div>
              </div>

              {/* Settlement Schedule Card */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-3">
                <h3 className="text-sm font-bold text-gray-900">Settlement Schedule</h3>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-teal-700" />
                    <span className="font-semibold text-gray-800">Payout Frequency:</span>
                    <span className="text-gray-600">End-of-Month Consolidated Bulk Payouts</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-[11px] font-bold">
                    Active Schedule
                  </span>
                </div>
              </div>

              {/* Paystack Fee Bearer & Statutory Stamp Duty Configuration Card */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-4">
                <div className="border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-teal-700" />
                    <h3 className="text-sm font-bold text-gray-900">Transaction Fee & Statutory Stamp Duty Policy</h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Configure who absorbs payment gateway collection charges and outbound wire transfer levies across the ecosystem.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Inbound Fee Bearer */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">
                      Inbound Paystack Fee (1.5% capped ₦2k)
                    </label>
                    <Select
                      value={feeBearerInbound}
                      onValueChange={(val: any) => setFeeBearerInbound(val)}
                    >
                      <SelectTrigger className="w-full text-xs font-medium bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="physiotherapist">Physiotherapist Absorbs (Standard)</SelectItem>
                        <SelectItem value="patient">Patient Pays at Checkout</SelectItem>
                        <SelectItem value="rehabify">Rehabify Platform Absorbs</SelectItem>
                        <SelectItem value="split_proportional">Split Proportionally (80/10/10)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-gray-500">
                      Standard collection fee on patient card/online checkouts.
                    </p>
                  </div>

                  {/* Outbound Transfer & Stamp Duty Bearer */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">
                      Outbound Transfer & Stamp Duty Bearer
                    </label>
                    <Select
                      value={feeBearerOutbound}
                      onValueChange={(val: any) => setFeeBearerOutbound(val)}
                    >
                      <SelectTrigger className="w-full text-xs font-medium bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="partner">Partner Commission (Standard)</SelectItem>
                        <SelectItem value="physiotherapist">Physiotherapist Payout</SelectItem>
                        <SelectItem value="rehabify">Rehabify Platform Absorbs</SelectItem>
                        <SelectItem value="split_proportional">Split Proportionally</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-gray-500">
                      ₦10/₦50 Paystack wire fee + statutory ₦50 stamp duty.
                    </p>
                  </div>
                </div>

                {/* Accounting Compliance Note on Statutory Stamp Duty */}
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
                    <span>Statutory Stamp Duty (EMTL) Compliance</span>
                  </div>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Per the <strong>Nigerian Finance Act and Electronic Money Transfer Levy (EMTL)</strong>, electronic bank transfers of <strong>₦10,000 and above</strong> attract a mandatory <strong>₦50 statutory stamp duty</strong>. This is accounted for as a distinct deduction line item on all partner invoices.
                  </p>
                </div>
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSaveRevenueSettings}
                disabled={isSavingSettings || totalPercentSum !== 100}
                className="w-full bg-[#005b57] hover:bg-[#004744] text-white text-xs font-bold py-3 h-auto shadow-sm"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSavingSettings ? "Saving Settings..." : "Save & Propagate Platform Settings"}
              </Button>
            </div>

            {/* Live Split Simulator & Transparency Card */}
            <div className="lg:col-span-5 space-y-6">
              {/* Simulator */}
              <div className="bg-[#FAF6E7]/50 border border-amber-200/80 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#005b57]" />
                    <h3 className="text-sm font-bold text-gray-900">Live Split & Fee Simulation</h3>
                  </div>
                  <span className="text-[11px] text-gray-500 font-mono">Real-time Preview</span>
                </div>

                {/* Example 1: Virtual Booking */}
                <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900">Virtual Consultation Session</span>
                    <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                      ₦{virtualRateNaira.toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-emerald-800 font-medium">
                      <span>Physiotherapist ({physioPercent}%):</span>
                      <span>₦{Math.round((virtualRateNaira * physioPercent) / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-blue-800 font-medium">
                      <span>Rehabify Platform ({rehabifyPercent}%):</span>
                      <span>₦{Math.round((virtualRateNaira * rehabifyPercent) / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-teal-800 font-bold border-t border-gray-100 pt-1">
                      <span>Referring Partner Gross ({partnerPercent}%):</span>
                      <span>₦{Math.round((virtualRateNaira * partnerPercent) / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-gray-500 text-[11px] pt-0.5">
                      <span>Paystack Inbound (1.5%):</span>
                      <span>₦{Math.min(2000, Math.round(virtualRateNaira * 0.015)).toLocaleString()} ({feeBearerInbound})</span>
                    </div>
                    <div className="flex justify-between text-teal-900 font-bold text-xs bg-teal-50/60 p-2 rounded">
                      <span>Est. Net Partner Payout:</span>
                      <span>
                        ₦{Math.max(
                          0,
                          Math.round((virtualRateNaira * partnerPercent) / 100) -
                            (feeBearerOutbound === "partner" ? 10 : 0)
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Example 2: In-Person Standard Baseline */}
                <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900">Face-to-Face / In-Person Baseline</span>
                    <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                      ₦{inPersonRateNaira.toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-emerald-800 font-medium">
                      <span>Physiotherapist ({physioPercent}%):</span>
                      <span>₦{Math.round((inPersonRateNaira * physioPercent) / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-blue-800 font-medium">
                      <span>Rehabify Platform ({rehabifyPercent}%):</span>
                      <span>₦{Math.round((inPersonRateNaira * rehabifyPercent) / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-teal-800 font-bold border-t border-gray-100 pt-1">
                      <span>Referring Partner Gross ({partnerPercent}%):</span>
                      <span>₦{Math.round((inPersonRateNaira * partnerPercent) / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-gray-500 text-[11px] pt-0.5">
                      <span>Paystack Inbound (1.5%):</span>
                      <span>₦{Math.min(2000, Math.round(inPersonRateNaira * 0.015)).toLocaleString()} ({feeBearerInbound})</span>
                    </div>
                    <div className="flex justify-between text-teal-900 font-bold text-xs bg-teal-50/60 p-2 rounded">
                      <span>Est. Net Partner Payout:</span>
                      <span>
                        ₦{Math.max(
                          0,
                          Math.round((inPersonRateNaira * partnerPercent) / 100) -
                            (feeBearerOutbound === "partner" ? 10 : 0)
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Example 3: Custom Physio Rate */}
                <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900">High Volume Partner Batch (e.g. ₦100,000)</span>
                    <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                      ₦100,000
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-emerald-800 font-medium">
                      <span>Physiotherapists ({physioPercent}%):</span>
                      <span>₦{Math.round((100000 * physioPercent) / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-blue-800 font-medium">
                      <span>Rehabify Platform ({rehabifyPercent}%):</span>
                      <span>₦{Math.round((100000 * rehabifyPercent) / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-teal-800 font-bold border-t border-gray-100 pt-1">
                      <span>Partner Gross ({partnerPercent}%):</span>
                      <span>₦{Math.round((100000 * partnerPercent) / 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-red-600 text-[11px]">
                      <span>Paystack Outbound Wire:</span>
                      <span>-₦50</span>
                    </div>
                    <div className="flex justify-between text-purple-700 text-[11px]">
                      <span>Statutory Stamp Duty (EMTL ≥₦10k):</span>
                      <span>-₦50</span>
                    </div>
                    <div className="flex justify-between text-teal-900 font-bold text-xs bg-teal-50/60 p-2 rounded">
                      <span>Net Bank Wire to Partner:</span>
                      <span>₦{Math.round(((100000 * partnerPercent) / 100) - 100).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transparency Commitment Card */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-teal-700" />
                  <h3 className="text-sm font-bold text-gray-900">Full Partner Transparency</h3>
                </div>
                <ul className="text-xs text-gray-600 space-y-2 list-disc list-inside leading-relaxed">
                  <li>
                    <strong>Partner Portal View:</strong> Partners see an itemized breakdown showing what the physiotherapist charged, the 80% clinician share, 10% platform share, and their 10% commission.
                  </li>
                  <li>
                    <strong>Paystack & Bank Transfer Parity:</strong> Whether the patient pays online via Paystack or direct transfer to Joy, the identical 80/10/10 figures are recorded in the ledger so nothing is lost.
                  </li>
                  <li>
                    <strong>End-of-Month Audit:</strong> All figures reconcile directly with monthly bulk payout summaries.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* VIEW 1: PARTNER PORTAL APPLICATIONS */}
      {/* ================================================================== */}
      {activeTab === "applications" && (
        <div className="space-y-4">
          {partnerApplications === undefined ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#005b57] border-t-transparent"></div>
            </div>
          ) : filteredApplications.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Building2 className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-sm font-semibold text-gray-900">No partner applications found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || statusFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "When healthcare institutions register on the partner portal, their applications will appear here."}
              </p>
            </div>
          ) : (
            filteredApplications.map((partner: any) => (
              <div
                key={partner._id}
                className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden flex flex-col md:flex-row transition hover:border-gray-300"
              >
                <div className="p-6 flex-1 border-b md:border-b-0 md:border-r border-gray-200 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      {partner.logoUrl ? (
                        <div className="w-12 h-12 rounded-xl border border-gray-200 bg-white p-1.5 flex items-center justify-center shrink-0">
                          <img
                            src={partner.logoUrl}
                            alt={partner.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-xl border border-gray-100 bg-[#FAF6E7] flex items-center justify-center text-[#005b57] shrink-0 font-bold text-lg">
                          {partner.name.charAt(0)}
                        </div>
                      )}

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-bold text-gray-900">{partner.name}</h3>
                          <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-700/10 uppercase">
                            {partner.type}
                          </span>
                          <span className="font-mono text-xs text-gray-500">
                            [{partner.code}]
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Applied {format(partner.createdAt, "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div>
                      {partner.approvalStatus === "approved" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Approved & Active
                        </span>
                      ) : partner.approvalStatus === "rejected" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-800 border border-red-200">
                          <XCircle className="w-3.5 h-3.5 text-red-600" />
                          Declined
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Pending Review
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Contact details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <a href={`mailto:${partner.contactEmail}`} className="text-teal-700 hover:underline">
                        {partner.contactEmail}
                      </a>
                    </div>
                    {partner.contactPhone && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <a href={`tel:${partner.contactPhone}`} className="text-teal-700 hover:underline">
                          {partner.contactPhone}
                        </a>
                      </div>
                    )}
                  </div>

                  {partner.approvedAt && (
                    <div className="text-[11px] text-gray-500 pt-1">
                      Approved on {format(partner.approvedAt, "MMM d, yyyy")} by {partner.approvedBy || "Admin"}
                    </div>
                  )}

                  {partner.rejectionReason && (
                    <div className="text-xs text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">
                      Decline Reason: {partner.rejectionReason}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="p-6 w-full md:w-64 bg-gray-50 flex flex-col justify-center space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Admin Approval
                  </h4>

                  {partner.approvalStatus === "pending" ? (
                    <>
                      <Button
                        disabled={isUpdating === partner._id}
                        onClick={() => handleReviewPartner(partner._id, "approve")}
                        className="w-full bg-[#005b57] hover:bg-[#004744] text-white text-xs font-semibold"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        Approve Partner
                      </Button>
                      <Button
                        variant="outline"
                        disabled={isUpdating === partner._id}
                        onClick={() => handleReviewPartner(partner._id, "reject")}
                        className="w-full border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold"
                      >
                        <XCircle className="w-4 h-4 mr-1.5" />
                        Decline
                      </Button>
                    </>
                  ) : partner.approvalStatus === "rejected" ? (
                    <Button
                      variant="outline"
                      disabled={isUpdating === partner._id}
                      onClick={() => handleReviewPartner(partner._id, "approve")}
                      className="w-full text-xs font-semibold"
                    >
                      Re-Approve Access
                    </Button>
                  ) : (
                    <div className="text-xs text-gray-500 space-y-2">
                      <p className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Live Portal Active
                      </p>

                      <div className="pt-1 space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openLinkModal(partner)}
                          className="w-full py-2 px-3 bg-white hover:bg-teal-50 border border-teal-200 rounded-lg text-xs font-semibold text-teal-800 flex items-center justify-center gap-1.5 shadow-2xs transition"
                        >
                          <Link2 className="w-3.5 h-3.5 text-teal-700" />
                          <span>Generate Referral Link</span>
                        </Button>

                        <Link
                          href={`/dashboard/admin/referrals?partner=${encodeURIComponent(partner.code)}`}
                          className="w-full py-2 px-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 flex items-center justify-center gap-1.5 shadow-2xs transition"
                        >
                          <FileText className="w-3.5 h-3.5 text-teal-600" />
                          <span>View Referrals</span>
                        </Link>

                        <a
                          href="/partners/portal"
                          target="_blank"
                          rel="noreferrer"
                          className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg text-xs font-semibold text-teal-800 flex items-center justify-center gap-1.5 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-teal-700" />
                          <span>Open Partner Portal</span>
                        </a>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isUpdating === partner._id}
                        onClick={() => handleReviewPartner(partner._id, "reject")}
                        className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 w-full h-8 mt-1"
                      >
                        Suspend Access
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* VIEW 2: PARTNERSHIP INQUIRIES */}
      {/* ================================================================== */}
      {activeTab === "inquiries" && (
        <div className="grid gap-6">
          {inquiries === undefined ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#005b57] border-t-transparent"></div>
            </div>
          ) : filteredInquiries.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Building2 className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-sm font-semibold text-gray-900">No inquiries found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || statusFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "New partnership inquiries will appear here."}
              </p>
            </div>
          ) : (
            filteredInquiries.map((inquiry: any) => (
              <div
                key={inquiry._id}
                className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden flex flex-col md:flex-row"
              >
                <div className="p-6 flex-1 border-b md:border-b-0 md:border-r border-gray-200">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {inquiry.organization || (inquiry as any).organizationName || "Partner Organization"}
                        </h3>
                        <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-700/10">
                          {(inquiry as any).organizationType || "Enterprise Partner"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Submitted on{" "}
                        {inquiry.createdAt
                          ? format(inquiry.createdAt, "MMM d, yyyy 'at' h:mm a")
                          : format(inquiry._creationTime, "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    <Select
                      value={inquiry.status}
                      onValueChange={(val: any) => handleStatusChange(inquiry._id, val)}
                      disabled={isUpdating === inquiry._id}
                    >
                      <SelectTrigger
                        className={`w-[130px] h-8 text-xs font-semibold border-0 ${
                          inquiry.status === "new"
                            ? "bg-amber-100 text-amber-800 focus:ring-amber-500"
                            : inquiry.status === "contacted"
                            ? "bg-blue-100 text-blue-800 focus:ring-blue-500"
                            : "bg-gray-100 text-gray-800 focus:ring-gray-500"
                        }`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-start gap-3">
                      <div className="bg-gray-50 p-2 rounded-lg">
                        <Mail className="h-4 w-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500">Contact Person</p>
                        <p className="text-sm text-gray-900 font-medium">
                          {inquiry.name || (inquiry as any).contactName || "Contact"}
                        </p>
                        <a
                          href={`mailto:${inquiry.email}`}
                          className="text-sm text-teal-600 hover:text-teal-700 hover:underline flex items-center gap-1 mt-0.5"
                        >
                          {inquiry.email} <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="bg-gray-50 p-2 rounded-lg">
                        <Phone className="h-4 w-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500">Phone & Details</p>
                        {(inquiry as any).phone ? (
                          <a
                            href={`tel:${(inquiry as any).phone}`}
                            className="text-sm text-teal-600 hover:text-teal-700 hover:underline flex items-center gap-1 font-medium"
                          >
                            {(inquiry as any).phone} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <p className="text-sm text-gray-500">Not specified</p>
                        )}
                        {(inquiry as any).employeeCount && (
                          <p className="text-sm text-gray-600 mt-0.5">
                            {(inquiry as any).employeeCount} expected patients/staff
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap border border-gray-100">
                    {inquiry.message}
                  </div>
                </div>

                <div className="p-6 w-full md:w-64 bg-gray-50 flex flex-col justify-center">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                    Quick Actions
                  </h4>
                  <div className="space-y-3">
                    <Button className="w-full justify-start bg-[#005b57] hover:bg-[#00443e] text-white" asChild>
                      <a href={`mailto:${inquiry.email}?subject=Partnership with RehabifyHealth`}>
                        <Mail className="mr-2 h-4 w-4" />
                        Email Contact
                      </a>
                    </Button>
                    <Button variant="outline" className="w-full justify-start border-gray-300" asChild>
                      <a href={`tel:${inquiry.phone}`}>
                        <Phone className="mr-2 h-4 w-4" />
                        Call Number
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Admin Dialog to Generate Partner Referral Link */}
      <Dialog open={isLinkModalOpen} onOpenChange={setIsLinkModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-teal-700" />
              <span>Generate Partner Referral Link</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Create a trackable referral URL for <strong>{selectedPartnerForLink?.name}</strong>. Leads submitted via this link will be automatically attributed to this partner.
            </DialogDescription>
          </DialogHeader>

          {generatedLinkResult ? (
            <div className="py-4 space-y-4">
              <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-teal-900">Your Generated Trackable Link</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-teal-100 text-teal-800">
                    {generatedLinkResult.publicCode}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    readOnly
                    value={generatedLinkResult.url}
                    className="font-mono text-xs bg-white border-teal-200 text-teal-950"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleCopyLink(generatedLinkResult.url)}
                    className="bg-[#005b57] hover:bg-[#004744] text-white shrink-0"
                  >
                    {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <a
                  href={generatedLinkResult.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-teal-700 hover:underline flex items-center gap-1 font-medium mr-auto"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Preview Landing Page</span>
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setGeneratedLinkResult(null);
                    setCampaignName("");
                  }}
                  className="text-xs"
                >
                  Generate Another
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsLinkModalOpen(false)}
                  className="bg-[#005b57] hover:bg-[#004744] text-white text-xs font-semibold"
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Campaign / Purpose Name</label>
                <Input
                  placeholder="e.g. Q4 Corporate Wellness Drive"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Default Care Delivery Mode</label>
                <Select value={careMode} onValueChange={setCareMode}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="patient_choice">Patient Choice (In-Person or Virtual)</SelectItem>
                    <SelectItem value="remote">Virtual Rehabilitation (Tele-physio)</SelectItem>
                    <SelectItem value="face_to_face">In-Person Clinic & Home Visits</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Link Validity Period</label>
                <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 Days</SelectItem>
                    <SelectItem value="30">30 Days (Recommended)</SelectItem>
                    <SelectItem value="90">90 Days</SelectItem>
                    <SelectItem value="0">Never Expires</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="pt-3">
                <Button variant="outline" size="sm" onClick={() => setIsLinkModalOpen(false)} className="text-xs">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleGenerateLink}
                  disabled={isGeneratingLink}
                  className="bg-[#005b57] hover:bg-[#004744] text-white text-xs font-semibold"
                >
                  {isGeneratingLink ? "Generating..." : "Generate Referral Link"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Admin Dialog to Process Month-End Bulk Payout */}
      {/* Admin Dialog to Process Month-End Payout (Paystack Transfer or Manual Wire) */}
      <Dialog open={!!selectedPartnerForPayout} onOpenChange={(open) => {
        if (!open) {
          setSelectedPartnerForPayout(null);
          setRequiresOtp(false);
          setOtpCode("");
          setPendingTransferData(null);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#005b57]" />
              <span>Commission Payout Disbursement</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Disburse consolidated referral commission for <strong>{selectedPartnerForPayout?.partnerName}</strong> for billing cycle <strong>{selectedBillingPeriod}</strong>.
            </DialogDescription>
          </DialogHeader>

          {selectedPartnerForPayout && (
            <div className="py-2 space-y-4 text-xs">
              {/* Payout Mode Selector */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPayoutMode("paystack")}
                  className={`py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    payoutMode === "paystack"
                      ? "bg-white text-teal-900 shadow-2xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <Send className="w-3.5 h-3.5 text-teal-700" />
                  <span>Paystack Automated</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutMode("manual")}
                  className={`py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    payoutMode === "manual"
                      ? "bg-white text-teal-900 shadow-2xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <Landmark className="w-3.5 h-3.5 text-gray-600" />
                  <span>Manual Wire Reference</span>
                </button>
              </div>

              {/* Commission Summary */}
              <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between items-center text-teal-950">
                  <span className="font-semibold">Gross Commission (10%):</span>
                  <span className="font-bold text-teal-900">
                    {formatNaira(selectedPartnerForPayout.totalPartnerCommission)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600 pt-1 border-t border-teal-200/60">
                  <span>Outbound Fee + EMTL Duty:</span>
                  <span className="font-medium text-red-700">
                    -₦{Math.round(((selectedPartnerForPayout.estimatedOutboundFeeKobo || 0) + (selectedPartnerForPayout.estimatedStampDutyKobo || 0)) / 100).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-teal-950 pt-1 border-t border-teal-200/60 font-bold">
                  <span className="text-xs">Net Disbursement Amount:</span>
                  <span className="text-base text-[#005b57]">
                    {formatNaira(selectedPartnerForPayout.estimatedNetPayoutKobo || selectedPartnerForPayout.totalPartnerCommission)}
                  </span>
                </div>
              </div>

              {payoutMode === "paystack" ? (
                <div className="space-y-3">
                  {selectedPartnerForPayout.hasBankAccount ? (
                    <div className="p-3 bg-emerald-50/30 border border-emerald-200 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Verified Disbursement Bank Account
                        </span>
                        <span className="font-mono text-[10px] text-gray-500">{selectedPartnerForPayout.bankName}</span>
                      </div>
                      <div className="font-semibold text-gray-900 text-xs">{selectedPartnerForPayout.bankAccountName}</div>
                      <div className="font-mono text-gray-600 text-xs">{selectedPartnerForPayout.maskedAccountNumber}</div>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 flex items-start gap-2 text-xs">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">No Verified Bank Account on File</p>
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          Partner must link their verified NUBAN bank account on the Partner Portal before automated transfers can be executed. You may switch to Manual Wire Reference to record an offline payment.
                        </p>
                      </div>
                    </div>
                  )}

                  {requiresOtp ? (
                    <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-purple-900 text-xs">
                        <ShieldCheck className="w-4 h-4 text-purple-700" />
                        <span>Paystack Transfer OTP Verification</span>
                      </div>
                      <p className="text-[11px] text-purple-700">
                        Paystack sent a one-time passcode to your authorized phone/email. Enter it below to authorize this transfer.
                      </p>
                      <Input
                        placeholder="Enter 6-digit OTP"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        className="text-center font-mono tracking-widest text-sm bg-white"
                        maxLength={8}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="font-semibold text-gray-700">Transfer Memo / Note (Optional)</label>
                      <Input
                        placeholder="e.g. September commission settlement"
                        value={payoutNote}
                        onChange={(e) => setPayoutNote(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="font-semibold text-gray-700">Bank Disbursement Reference / Note</label>
                  <Input
                    placeholder="e.g. Zenith Bank Wire Ref #PAY-2026-09"
                    value={payoutNote}
                    onChange={(e) => setPayoutNote(e.target.value)}
                    className="text-xs"
                  />
                  <p className="text-[10px] text-gray-500">
                    This reference will be recorded in the ledger and displayed on the partner portal.
                  </p>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedPartnerForPayout(null);
                    setRequiresOtp(false);
                    setOtpCode("");
                    setPendingTransferData(null);
                  }}
                  disabled={isProcessingPayout}
                  className="text-xs"
                >
                  Cancel
                </Button>

                {requiresOtp ? (
                  <Button
                    size="sm"
                    onClick={handleFinalizeOtp}
                    disabled={isProcessingPayout || !otpCode.trim()}
                    className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold"
                  >
                    {isProcessingPayout ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Authorizing...</> : "Authorize & Complete Transfer"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleConfirmPayout}
                    disabled={isProcessingPayout || (payoutMode === "paystack" && !selectedPartnerForPayout.hasBankAccount)}
                    className="bg-[#005b57] hover:bg-[#004744] text-white text-xs font-semibold"
                  >
                    {isProcessingPayout ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Processing...</>
                    ) : payoutMode === "paystack" ? (
                      <>
                        <Send className="w-3.5 h-3.5 mr-1.5" />
                        Disburse {formatNaira(selectedPartnerForPayout.estimatedNetPayoutKobo || selectedPartnerForPayout.totalPartnerCommission)}
                      </>
                    ) : (
                      "Confirm Manual Wire Settled"
                    )}
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Admin Dialog for Bulk Monthly Payout via Paystack */}
      <Dialog open={isBulkModalOpen} onOpenChange={(open) => !open && setIsBulkModalOpen(false)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Send className="w-5 h-5 text-[#005b57]" />
              <span>Bulk Paystack Disbursement</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Trigger automated bulk bank transfers via Paystack Transfer API for cycle <strong>{selectedBillingPeriod}</strong>.
            </DialogDescription>
          </DialogHeader>

          {monthlySummary && (
            <div className="py-2 space-y-4 text-xs">
              {(() => {
                const eligible = monthlySummary.partners.filter(
                  (p: any) => p.bulkPayoutStatus !== "paid" && p.totalPartnerCommission > 0 && p.hasBankAccount
                );
                const totalKobo = eligible.reduce(
                  (sum: number, p: any) => sum + (p.estimatedNetPayoutKobo || p.totalPartnerCommission),
                  0
                );
                const withoutBank = monthlySummary.partners.filter(
                  (p: any) => p.bulkPayoutStatus !== "paid" && p.totalPartnerCommission > 0 && !p.hasBankAccount
                );

                return (
                  <>
                    <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 font-medium">Eligible Partner Institutions:</span>
                        <span className="font-bold text-gray-900 text-sm">{eligible.length} partners</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 font-medium">Total Net Disbursement:</span>
                        <span className="font-bold text-teal-900 text-base">{formatNaira(totalKobo)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-teal-200/60">
                        <span className="text-gray-500">Paystack Available Balance:</span>
                        <span className="font-semibold text-gray-800">
                          {paystackBalance ? formatNaira(paystackBalance.balanceKobo) : "Checking..."}
                        </span>
                      </div>
                    </div>

                    {withoutBank.length > 0 && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">{withoutBank.length} partner(s) excluded (No bank details)</p>
                          <p className="text-[11px] text-amber-700 mt-0.5">
                            {withoutBank.map((p: any) => p.partnerName).join(", ")} will not be included until they provide verified bank accounts.
                          </p>
                        </div>
                      </div>
                    )}

                    {paystackBalance && paystackBalance.balanceKobo < totalKobo && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">Insufficient Paystack Balance</p>
                          <p className="text-[11px] text-red-700 mt-0.5">
                            Available: {formatNaira(paystackBalance.balanceKobo)}, Required: {formatNaira(totalKobo)}. Please top up your Paystack balance from the Paystack Dashboard.
                          </p>
                        </div>
                      </div>
                    )}

                    <DialogFooter className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsBulkModalOpen(false)}
                        disabled={isProcessingBulk}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleConfirmBulkDisburse}
                        disabled={isProcessingBulk || eligible.length === 0}
                        className="bg-[#005b57] hover:bg-[#004744] text-white text-xs font-semibold"
                      >
                        {isProcessingBulk ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Processing Bulk...</>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5 mr-1.5" />
                            Disburse {formatNaira(totalKobo)} to {eligible.length} Partners
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Admin Dialog to View Itemized Referred Patients Ledger */}
      <Dialog open={!!selectedPartnerForLedger} onOpenChange={(open) => !open && setSelectedPartnerForLedger(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Eye className="w-5 h-5 text-teal-700" />
              <span>Itemized Referral Ledger: {selectedPartnerForLedger?.partnerName}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Transparent 80/10/10 revenue breakdown for all patient bookings referred in <strong>{selectedBillingPeriod}</strong>.
            </DialogDescription>
          </DialogHeader>

          {selectedPartnerForLedger && (
            <div className="py-2 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs">
                <div>
                  <span className="text-gray-500">Referred Patients:</span>
                  <p className="text-sm font-bold text-gray-900">{selectedPartnerForLedger.totalReferredPatients}</p>
                </div>
                <div>
                  <span className="text-gray-500">Total Charged:</span>
                  <p className="text-sm font-bold text-gray-900">{formatNaira(selectedPartnerForLedger.totalGrossCharged)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Physio Share (80%):</span>
                  <p className="text-sm font-bold text-emerald-700">{formatNaira(selectedPartnerForLedger.totalPhysiotherapistShare)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Partner Commission (10%):</span>
                  <p className="text-sm font-bold text-teal-900">{formatNaira(selectedPartnerForLedger.totalPartnerCommission)}</p>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Patient</th>
                      <th className="py-2.5 px-3">Care Mode</th>
                      <th className="py-2.5 px-3 text-right">Physio Charged</th>
                      <th className="py-2.5 px-3 text-right text-emerald-800">Physio (80%)</th>
                      <th className="py-2.5 px-3 text-right text-blue-800">Rehabify (10%)</th>
                      <th className="py-2.5 px-3 text-right text-teal-800">Partner (10%)</th>
                      <th className="py-2.5 px-3 text-center">Channel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedPartnerForLedger.commissions && selectedPartnerForLedger.commissions.length > 0 ? (
                      selectedPartnerForLedger.commissions.map((c: any) => (
                        <tr key={c._id} className="hover:bg-gray-50/60 transition">
                          <td className="py-2.5 px-3 whitespace-nowrap text-gray-500">
                            {format(c.createdAt, "MMM d, yyyy")}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-gray-900">
                            {c.referredPatientName || "Referred Patient"}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              c.careMode === "face_to_face"
                                ? "bg-purple-50 text-purple-700 border border-purple-100"
                                : "bg-blue-50 text-blue-700 border border-blue-100"
                            }`}>
                              {c.careMode === "face_to_face" ? "In-Person" : "Virtual (6k)"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-gray-900">
                            {formatNaira(c.bookingAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-700 font-medium">
                            {formatNaira(c.physiotherapistAmount || Math.round(c.bookingAmount * 0.8))}
                          </td>
                          <td className="py-2.5 px-3 text-right text-blue-700 font-medium">
                            {formatNaira(c.rehabifyAmount || Math.round(c.bookingAmount * 0.1))}
                          </td>
                          <td className="py-2.5 px-3 text-right text-teal-900 font-bold">
                            {formatNaira(c.partnerAmount || c.commissionAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${
                              c.paymentMethod === "bank_transfer"
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}>
                              {c.paymentMethod === "bank_transfer" ? "Bank Transfer" : "Paystack"}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="text-center py-6 text-gray-400">
                          No itemized sessions found for this partner in this cycle.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <DialogFooter className="pt-2">
                <Button size="sm" onClick={() => setSelectedPartnerForLedger(null)} className="text-xs">
                  Close Ledger
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Admin Dialog to Generate and Download Comprehensive Partner Invoice */}
      <Dialog open={!!selectedPartnerForInvoice} onOpenChange={(open) => !open && setSelectedPartnerForInvoice(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#005b57]" />
                <span>Partner Commission Settlement Invoice</span>
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => invoiceData && handleExportInvoiceCSV(invoiceData)}
                  disabled={!invoiceData}
                  className="text-xs h-8 px-2.5 text-gray-700 border-gray-300"
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  CSV
                </Button>
                <Button
                  size="sm"
                  onClick={() => window.print()}
                  disabled={!invoiceData}
                  className="bg-[#005b57] hover:bg-[#004744] text-white text-xs h-8 px-3 font-semibold"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Print / Save PDF
                </Button>
              </div>
            </div>
            <DialogDescription className="text-xs text-gray-500">
              Official commercial settlement invoice with transparent 80/10/10 reconciliation and statutory stamp duty line item.
            </DialogDescription>
          </DialogHeader>

          {!invoiceData ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#005b57] border-t-transparent"></div>
            </div>
          ) : (
            <div id="printable-partner-invoice" className="space-y-6 py-2 bg-white text-gray-900">
              {/* Invoice Header Block */}
              <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200 flex flex-col md:flex-row justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#005b57] text-white flex items-center justify-center font-bold text-sm">
                      RH
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-gray-900 leading-tight">
                        {invoiceData.issuer.name}
                      </h2>
                      <p className="text-xs text-gray-500">{invoiceData.issuer.address}</p>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-gray-600 space-y-0.5">
                    <p>Email: <span className="font-medium text-gray-900">{invoiceData.issuer.email}</span></p>
                    <p>Web: <span className="font-medium text-gray-900">{invoiceData.issuer.website}</span></p>
                  </div>
                </div>

                <div className="md:text-right space-y-1 text-xs">
                  <span className="inline-block px-2.5 py-1 rounded bg-teal-100 text-teal-900 font-bold text-[11px] uppercase tracking-wider">
                    Settlement Invoice
                  </span>
                  <p className="text-sm font-bold font-mono text-gray-900 pt-1">
                    {invoiceData.invoiceNumber}
                  </p>
                  <p className="text-gray-600">
                    Issue Date: <strong>{invoiceData.invoiceDate}</strong>
                  </p>
                  <p className="text-gray-600">
                    Cycle: <strong>{invoiceData.billingPeriodLabel}</strong>
                  </p>
                  <div>
                    {invoiceData.payoutStatus === "paid" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Settled / Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                        <Clock className="w-3.5 h-3.5 text-amber-600" /> Pending Month-End Payout
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Billed To & Remittance Bank Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Billed To (Partner Institution)</span>
                  <h3 className="text-sm font-bold text-gray-900">{invoiceData.recipient.name}</h3>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p>Partner Code: <span className="font-mono font-semibold text-teal-800">{invoiceData.recipient.code}</span></p>
                    <p>Institution Type: <span className="capitalize">{invoiceData.recipient.type}</span></p>
                    {invoiceData.recipient.contactEmail && <p>Email: {invoiceData.recipient.contactEmail}</p>}
                    {invoiceData.recipient.contactPhone && <p>Phone: {invoiceData.recipient.contactPhone}</p>}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Remittance Bank Account Details</span>
                  {invoiceData.bankDetails ? (
                    <div className="text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                        <CheckCircle className="w-4 h-4" />
                        <span>Verified Paystack NUBAN Recipient</span>
                      </div>
                      <p className="text-gray-700">Bank: <strong className="text-gray-900">{invoiceData.bankDetails.bankName}</strong></p>
                      <p className="text-gray-700">Account Number: <strong className="font-mono text-gray-900">{invoiceData.bankDetails.accountNumber}</strong></p>
                      <p className="text-gray-700">Account Name: <strong className="text-gray-900">{invoiceData.bankDetails.accountName}</strong></p>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        No verified bank account on file. Partner must provide bank details on the Partner Portal before month-end wire transfer.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Revenue Policy & Governance Summary */}
              <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-200 text-xs text-teal-950 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <span className="font-bold">Contract Terms:</span> 80% Clinician · 10% Platform · 10% Referring Partner
                </div>
                <div className="text-teal-800 font-medium">
                  Disbursement Schedule: End-of-Month Consolidated Bulk Transfer
                </div>
              </div>

              {/* Itemized Line Items Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="p-3 bg-gray-50 border-b border-gray-200 font-bold text-xs text-gray-800">
                  Itemized Consultation Sessions ({invoiceData.lineItems.length} Sessions)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Patient</th>
                        <th className="py-2.5 px-3">Physiotherapist</th>
                        <th className="py-2.5 px-3">Care Mode</th>
                        <th className="py-2.5 px-3 text-right">Gross Charged</th>
                        <th className="py-2.5 px-3 text-right text-emerald-700">Physio (80%)</th>
                        <th className="py-2.5 px-3 text-right text-blue-700">Rehabify (10%)</th>
                        <th className="py-2.5 px-3 text-right text-teal-900 font-bold">Partner (10%)</th>
                        <th className="py-2.5 px-3 text-center">Channel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {invoiceData.lineItems.map((item: any) => (
                        <tr key={item.sn} className="hover:bg-gray-50/50">
                          <td className="py-2 px-3 text-gray-400 font-mono text-[11px]">{item.sn}</td>
                          <td className="py-2 px-3 text-gray-600 whitespace-nowrap text-[11px]">{item.date}</td>
                          <td className="py-2 px-3 font-medium text-gray-900">{item.patientName}</td>
                          <td className="py-2 px-3 text-gray-600">{item.physiotherapistName}</td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              item.careMode === "Virtual"
                                ? "bg-teal-50 text-teal-800 border border-teal-100"
                                : "bg-purple-50 text-purple-800 border border-purple-100"
                            }`}>
                              {item.careMode}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-gray-900">
                            {formatNaira(item.grossAmountKobo)}
                          </td>
                          <td className="py-2 px-3 text-right text-emerald-700 font-medium">
                            {formatNaira(item.physioShareKobo)}
                          </td>
                          <td className="py-2 px-3 text-right text-blue-700 font-medium">
                            {formatNaira(item.rehabifyShareKobo)}
                          </td>
                          <td className="py-2 px-3 text-right text-teal-900 font-bold">
                            {formatNaira(item.partnerShareKobo)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="text-[10px] text-gray-500 font-medium">
                              {item.paymentMethod}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Accounting Summary & Statutory Stamp Duty Line Item */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-2">
                <div className="w-full sm:max-w-md space-y-3">
                  <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200 text-xs space-y-1.5">
                    <span className="font-bold text-amber-950 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-700" />
                      Statutory Stamp Duty Regulatory Note
                    </span>
                    <p className="text-amber-900 text-[11px] leading-relaxed">
                      In accordance with the <strong>Nigerian Finance Act and Electronic Money Transfer Levy (EMTL)</strong> Regulations, electronic bank disbursements of <strong>₦10,000 and above</strong> attract a mandatory <strong>₦50 statutory stamp duty</strong>. This is accounted for as a separate withholding line item below.
                    </p>
                  </div>

                  <div className="text-[11px] text-gray-500 space-y-1">
                    <p>Questions regarding this invoice: <a href="mailto:finance@physioaroundme.com" className="text-teal-700 font-medium">finance@physioaroundme.com</a></p>
                    <p>Rehabify Health Technologies Ltd · Certified Reconciliation Ledger</p>
                  </div>
                </div>

                <div className="w-full sm:w-80 bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2.5 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Total Consultations:</span>
                    <span className="font-semibold text-gray-900">{invoiceData.summary.totalSessions} sessions</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Gross Care Value:</span>
                    <span className="font-semibold text-gray-900">{formatNaira(invoiceData.summary.totalGrossKobo)}</span>
                  </div>
                  <div className="flex justify-between text-teal-900 font-bold border-t border-gray-200 pt-2 text-sm">
                    <span>Gross Partner Commission (10%):</span>
                    <span>{formatNaira(invoiceData.summary.totalPartnerShareKobo)}</span>
                  </div>

                  <div className="border-t border-gray-200 pt-2 space-y-1.5 text-gray-600">
                    <div className="flex justify-between text-red-700 text-[11px]">
                      <span>Less: Bank Wire Transfer Fee:</span>
                      <span>- {formatNaira(invoiceData.summary.totalPaystackTransferFeesKobo)}</span>
                    </div>
                    <div className="flex justify-between text-purple-800 font-semibold text-[11px] bg-purple-50 px-2 py-1 rounded border border-purple-100">
                      <span>Less: Statutory Stamp Duty (EMTL):</span>
                      <span>- {formatNaira(invoiceData.summary.totalStampDutyKobo)}</span>
                    </div>
                  </div>

                  <div className="border-t-2 border-[#005b57] pt-2 flex justify-between items-center text-sm font-bold text-[#005b57]">
                    <span>Net Amount Payable:</span>
                    <span className="text-base">{formatNaira(invoiceData.summary.totalNetPayableKobo)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-gray-100 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedPartnerForInvoice(null)}
              className="text-xs"
            >
              Close Invoice
            </Button>
            {invoiceData && (
              <Button
                size="sm"
                onClick={() => window.print()}
                className="bg-[#005b57] hover:bg-[#004744] text-white text-xs font-semibold"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Print / Download PDF
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
