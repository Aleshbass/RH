"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import NextImage from "next/image";
import { useUser, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Cpu,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Globe,
  HeartPulse,
  Image as ImageIcon,
  Key,
  Layers,
  Link2,
  Lock,
  MessageSquare,
  MousePointerClick,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Server,
  Share2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  Upload,
  UploadCloud,
  UserCheck,
  Users,
  Wallet,
  Webhook,
  X,
  Zap,
} from "lucide-react";

export default function PartnerPortalDashboard() {
  const { isSignedIn, user, isLoaded: isUserLoaded } = useUser();

  // Current authenticated user's partner resolution
  const userPartnerData = useQuery(api.partners.getCurrentUserPartner);
  const applyForPartnerMutation = useMutation(api.partners.applyForPartner);
  const updateBrandingMutation = useMutation(api.partners.updatePartnerBranding);
  const generateUploadUrlMutation = useMutation(api.files.generateUploadUrl);

  // Active partner code for data queries
  const [partnerCode, setPartnerCode] = useState<string>("sandbox_partner");

  // Sync partnerCode with resolved partner
  useEffect(() => {
    if (userPartnerData?.partner?.code) {
      setPartnerCode(userPartnerData.partner.code);
    } else if (userPartnerData?.isAdmin) {
      // If admin and hasn't selected another partner, default to sandbox or first in list
      setPartnerCode((prev) => prev || "sandbox_partner");
    }
  }, [userPartnerData?.partner?.code, userPartnerData?.isAdmin]);

  const [activeTab, setActiveTab] = useState<
    | "overview"
    | "links"
    | "referrals"
    | "commissions"
    | "developers"
    | "branding"
  >("overview");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [commissionStatusFilter, setCommissionStatusFilter] = useState<string>("all");
  const [environment, setEnvironment] = useState<"sandbox" | "live">("sandbox");
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Developer Platform & Activity Logs state
  const [activeDevSection, setActiveDevSection] = useState<
    "overview" | "keys" | "logs" | "health" | "webhooks" | "snippets"
  >("overview");
  const [analyticsRange, setAnalyticsRange] = useState<"7d" | "30d" | "90d">("7d");
  const [logEventTypeFilter, setLogEventTypeFilter] = useState<string>("all");
  const [logStatusFilter, setLogStatusFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
  const [isNewKeyModalOpen, setIsNewKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [freshlyGeneratedKey, setFreshlyGeneratedKey] = useState<any | null>(null);
  const [isRevokingKey, setIsRevokingKey] = useState<string | null>(null);

  // Referral Links state & modals
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linkFormData, setLinkFormData] = useState({
    campaignName: "",
    serviceScope: "all_rehabilitation",
    defaultCareMode: "patient_choice",
    expiresInDays: "30",
  });
  const [createdLinkResult, setCreatedLinkResult] = useState<{
    publicCode: string;
    url: string;
  } | null>(null);

  // New referral modal & form state
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false);
  const [isSubmittingReferral, setIsSubmittingReferral] = useState(false);
  const [referralSuccessData, setReferralSuccessData] = useState<{
    trackingCode: string;
    referralId: string;
    patientName: string;
  } | null>(null);

  const [referralFormData, setReferralFormData] = useState({
    patientFirstName: "",
    patientLastName: "",
    patientPhone: "",
    patientEmail: "",
    city: "Lagos",
    area: "Ikeja",
    hospitalClinic: "",
    condition: "Post-Op Knee Rehabilitation",
    clinicalNotes: "",
    priority: "standard",
    recommendedSessions: 6,
    billingMode: "hmo_direct_billing",
    partnerExternalId: "",
  });

  // Multi-step Onboarding State
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3 | 4>(1);
  const [onboardingForm, setOnboardingForm] = useState({
    name: "",
    type: "hmo" as "hmo" | "hospital" | "corporate" | "gym" | "telemedicine" | "pharmacy" | "employer" | "digital_health",
    website: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    coverageStates: ["Lagos", "Abuja FCT"],
    coverageCities: "Ikeja, Victoria Island, Lekki",
    supportedCareModes: ["remote", "face_to_face"],
  });

  // Direct Logo File Upload State
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoStorageId, setLogoStorageId] = useState<Id<"_storage"> | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(true);
  const [isSubmittingApplication, setIsSubmittingApplication] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // Auto-fill onboarding email once user is loaded
  useEffect(() => {
    if (user?.primaryEmailAddress?.emailAddress && !onboardingForm.contactEmail) {
      setOnboardingForm((prev) => ({
        ...prev,
        contactEmail: user.primaryEmailAddress?.emailAddress || "",
        contactName: prev.contactName || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      }));
    }
  }, [user?.primaryEmailAddress?.emailAddress, user?.firstName, user?.lastName]);

  const handleLogoFileSelect = async (file: File) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo file size must be less than 5MB");
      return;
    }

    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a PNG, JPG, SVG, or WebP image");
      return;
    }

    setLogoFile(file);
    const localUrl = URL.createObjectURL(file);
    setLogoPreviewUrl(localUrl);

    setIsUploadingLogo(true);
    try {
      const uploadUrl = await generateUploadUrlMutation({
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
      });

      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!res.ok) throw new Error("Failed to upload image to storage");

      const { storageId } = await res.json();
      setLogoStorageId(storageId as Id<"_storage">);
      toast.success("Logo uploaded to Rehabify secure vault");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload logo file");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreviewUrl(null);
    setLogoStorageId(null);
    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = "";
    }
  };

  const handleApplyForPartner = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!onboardingForm.name.trim()) {
      toast.error("Please provide your organization name");
      setOnboardingStep(1);
      return;
    }
    if (!onboardingForm.contactEmail.trim()) {
      toast.error("Please provide an official contact email");
      setOnboardingStep(3);
      return;
    }
    if (!termsAgreed) {
      toast.error("Please accept the partner clinical and data terms");
      return;
    }

    setIsSubmittingApplication(true);
    try {
      const citiesArray = onboardingForm.coverageCities
        ? onboardingForm.coverageCities.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;

      await applyForPartnerMutation({
        name: onboardingForm.name.trim(),
        type: onboardingForm.type,
        website: onboardingForm.website.trim() || undefined,
        contactName: onboardingForm.contactName.trim() || undefined,
        contactPhone: onboardingForm.contactPhone.trim() || undefined,
        contactEmail: onboardingForm.contactEmail.trim().toLowerCase(),
        logoStorageId: logoStorageId || undefined,
        logoUrl: logoPreviewUrl && !logoStorageId ? logoPreviewUrl : undefined,
        coverageStates: onboardingForm.coverageStates.length > 0 ? onboardingForm.coverageStates : undefined,
        coverageCities: citiesArray,
        supportedCareModes: onboardingForm.supportedCareModes,
      });

      toast.success("Application submitted! Rehabify administrators will verify your organization.");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit partner application");
    } finally {
      setIsSubmittingApplication(false);
    }
  };


  // Company Branding & Settings state
  const [brandingForm, setBrandingForm] = useState({
    name: "",
    logoUrl: "",
    contactEmail: "",
    contactPhone: "",
    coverageStates: "Lagos, Abuja",
    coverageCities: "Ikeja, Victoria Island, Lekki",
  });
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  // Webhooks state
  const [webhookUrlInput, setWebhookUrlInput] = useState("");
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [isTriggeringWebhook, setIsTriggeringWebhook] = useState(false);
  const [testWebhookResult, setTestWebhookResult] = useState<any>(null);

  // Code snippet playground state
  const [codeLang, setCodeLang] = useState<"curl" | "javascript" | "python">("curl");
  const [codeEndpoint, setCodeEndpoint] = useState<
    "referrals" | "track" | "eligibility"
  >("referrals");

  // Fetch live overview from Convex (environment aware)
  const overview = useQuery(api.partners.getPartnerDashboardOverview, {
    partnerCode,
    environment,
  });

  // Fetch partner referral links from Convex
  const referralLinks = useQuery(api.partnerLinks.listReferralLinks, {
    partnerId: partnerCode,
  });

  // Fetch partners list (for admin switching)
  const partnersList = useQuery(api.partners.listPartners, {});

  // Fetch commercial terms & commissions from Convex
  const commercialContract = useQuery(api.commercialTerms.getActivePartnerContract, {
    partnerId: partnerCode,
  });
  const commercialSummary = useQuery(api.commercialTerms.getPartnerCommercialSummary, {
    partnerId: partnerCode,
  });
  const commissionsLedger = useQuery(api.commercialTerms.listPartnerCommissions, {
    partnerId: partnerCode,
    status: commissionStatusFilter === "all" ? undefined : commissionStatusFilter,
  });

  // Developer Platform Real-Time Queries
  const activityLogs = useQuery(api.partners.listPartnerActivityLogs, {
    partnerCode,
    environment,
    eventType: logEventTypeFilter === "all" ? undefined : logEventTypeFilter,
    status: logStatusFilter === "all" ? undefined : logStatusFilter,
  });

  const apiKeys = useQuery(api.partners.listPartnerApiKeys, {
    partnerCode,
    environment,
  });

  const integrationHealth = useQuery(api.partners.getIntegrationHealth, {
    partnerCode,
    environment,
  });

  const analyticsTimeseries = useQuery(api.partners.getPartnerAnalyticsTimeseries, {
    partnerCode,
    environment,
    range: analyticsRange,
  });

  // Convex mutations & actions
  const createReferralMutation = useMutation(api.partners.createPartnerReferral);
  const updateWebhookMutation = useMutation(api.partners.updatePartnerWebhookSettings);
  const rotateApiKeyMutation = useMutation(api.partners.rotatePartnerApiKey);
  const generateApiKeyMutation = useMutation(api.partners.generatePartnerApiKey);
  const revokeApiKeyMutation = useMutation(api.partners.revokePartnerApiKey);
  const triggerRealWebhookAction = useAction(api.partners.triggerRealTestWebhook);
  const triggerTestWebhookMutation = useMutation(api.partners.triggerTestWebhook);
  const createLinkMutation = useMutation(api.partnerLinks.createReferralLink);
  const updateLinkStatusMutation = useMutation(api.partnerLinks.updateLinkStatus);

  // Populate inputs when overview loads
  const hasInitializedEnv = useRef(false);
  useEffect(() => {
    if (overview?.partnerInfo?.webhookUrl && !webhookUrlInput) {
      setWebhookUrlInput(overview.partnerInfo.webhookUrl);
    }
    if (overview?.partnerInfo) {
      setBrandingForm((prev) => ({
        name: prev.name || overview.partnerInfo.name || "",
        logoUrl: prev.logoUrl || overview.partnerInfo.logoUrl || "",
        contactEmail: prev.contactEmail || overview.partnerInfo.contactEmail || "",
        contactPhone: prev.contactPhone || overview.partnerInfo.contactPhone || "",
        coverageStates: prev.coverageStates || (overview.partnerInfo.coverageStates || ["Lagos", "Abuja"]).join(", "),
        coverageCities: prev.coverageCities || (overview.partnerInfo.coverageCities || ["Ikeja", "Victoria Island"]).join(", "),
      }));
      if (!hasInitializedEnv.current) {
        setEnvironment(overview.partnerInfo.isSandbox ? "sandbox" : "live");
        hasInitializedEnv.current = true;
      }
    }
  }, [overview?.partnerInfo]);

  const copyToClipboard = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(label);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  // Filtered referrals
  const filteredReferrals = useMemo(() => {
    if (!overview?.recentReferrals) return [];
    let list = overview.recentReferrals;

    if (statusFilter !== "all") {
      list = list.filter((r: any) => r.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r: any) =>
          r.patientName.toLowerCase().includes(q) ||
          r.trackingCode.toLowerCase().includes(q) ||
          r.condition.toLowerCase().includes(q) ||
          (r.partnerExternalId && r.partnerExternalId.toLowerCase().includes(q))
      );
    }

    return list;
  }, [overview?.recentReferrals, statusFilter, searchQuery]);

  // Aggregate link stats
  const linkStats = useMemo(() => {
    if (!referralLinks || referralLinks.length === 0) {
      return { totalClicks: 0, totalLeads: 0, totalBookings: 0 };
    }
    return (referralLinks as any[]).reduce(
      (acc: any, l: any) => ({
        totalClicks: acc.totalClicks + (l.clicks || 0),
        totalLeads: acc.totalLeads + (l.leads || 0),
        totalBookings: acc.totalBookings + (l.bookings || 0),
      }),
      { totalClicks: 0, totalLeads: 0, totalBookings: 0 }
    );
  }, [referralLinks]);

  // Filtered referral links
  const filteredLinks = useMemo(() => {
    if (!referralLinks) return [];
    if (!linkSearchQuery.trim()) return referralLinks;
    const q = linkSearchQuery.toLowerCase();
    return (referralLinks as any[]).filter(
      (l: any) =>
        l.publicCode.toLowerCase().includes(q) ||
        (l.campaignName && l.campaignName.toLowerCase().includes(q)) ||
        (l.serviceScope && l.serviceScope.toLowerCase().includes(q))
    );
  }, [referralLinks, linkSearchQuery]);

  // Handle create referral link
  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingLink(true);
    try {
      const days = parseInt(linkFormData.expiresInDays) || 0;
      const expiresAt = days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : undefined;
      const res = await createLinkMutation({
        partnerId: partnerCode,
        campaignName: linkFormData.campaignName.trim() || undefined,
        serviceScope: linkFormData.serviceScope,
        defaultCareMode: linkFormData.defaultCareMode,
        expiresAt,
      });

      const host = typeof window !== "undefined" ? window.location.host : "physioaroundme.com";
      const protocol = typeof window !== "undefined" && window.location.protocol ? window.location.protocol : "https:";
      const linkUrl = `${protocol}//${host}/r/${res.publicCode}`;

      setCreatedLinkResult({
        publicCode: res.publicCode,
        url: linkUrl,
      });
      toast.success("Referral link generated successfully!");
      setLinkFormData({
        campaignName: "",
        serviceScope: "all_rehabilitation",
        defaultCareMode: "patient_choice",
        expiresInDays: "30",
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to create referral link");
    } finally {
      setIsCreatingLink(false);
    }
  };

  // Handle new referral form submit
  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referralFormData.patientFirstName || !referralFormData.patientLastName || !referralFormData.patientPhone) {
      toast.error("Please provide patient first name, last name, and phone number.");
      return;
    }

    setIsSubmittingReferral(true);
    try {
      const res = await createReferralMutation({
        partnerCode,
        environment,
        partnerExternalId: referralFormData.partnerExternalId.trim() || undefined,
        patientFirstName: referralFormData.patientFirstName.trim(),
        patientLastName: referralFormData.patientLastName.trim(),
        patientPhone: referralFormData.patientPhone.trim(),
        patientEmail: referralFormData.patientEmail.trim() || undefined,
        city: referralFormData.city,
        area: referralFormData.area,
        hospitalClinic: referralFormData.hospitalClinic.trim() || overview?.partnerInfo?.name,
        condition: referralFormData.condition,
        clinicalNotes: referralFormData.clinicalNotes.trim() || undefined,
        priority: referralFormData.priority,
        recommendedSessions: Number(referralFormData.recommendedSessions) || 6,
        billingMode: referralFormData.billingMode,
      });

      setReferralSuccessData({
        trackingCode: res.trackingCode,
        referralId: res.referralId,
        patientName: `${referralFormData.patientFirstName} ${referralFormData.patientLastName}`,
      });

      toast.success(`Referral created: ${res.trackingCode}`);
      setReferralFormData({
        patientFirstName: "",
        patientLastName: "",
        patientPhone: "",
        patientEmail: "",
        city: "Lagos",
        area: "Ikeja",
        hospitalClinic: "",
        condition: "Post-Op Knee Rehabilitation",
        clinicalNotes: "",
        priority: "standard",
        recommendedSessions: 6,
        billingMode: "hmo_direct_billing",
        partnerExternalId: "",
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit referral");
    } finally {
      setIsSubmittingReferral(false);
    }
  };

  // Handle updating company branding
  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBranding(true);
    try {
      const states = brandingForm.coverageStates.split(",").map((s) => s.trim()).filter(Boolean);
      const cities = brandingForm.coverageCities.split(",").map((c) => c.trim()).filter(Boolean);

      await updateBrandingMutation({
        partnerCode,
        name: brandingForm.name.trim() || undefined,
        logoUrl: brandingForm.logoUrl.trim() || undefined,
        contactEmail: brandingForm.contactEmail.trim() || undefined,
        contactPhone: brandingForm.contactPhone.trim() || undefined,
        coverageStates: states,
        coverageCities: cities,
      });

      toast.success("Company branding updated successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to update branding");
    } finally {
      setIsSavingBranding(false);
    }
  };

  // Handle Webhook URL save
  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingWebhook(true);
    try {
      await updateWebhookMutation({
        partnerCode,
        webhookUrl: webhookUrlInput.trim(),
      });
      toast.success("Webhook endpoint updated successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to update webhook URL");
    } finally {
      setIsSavingWebhook(false);
    }
  };

  // Handle API key rotation
  const handleRotateKey = async () => {
    if (
      !confirm(
        `Are you sure you want to rotate your ${environment.toUpperCase()} partner API key? Existing integrations using the old key will be revoked.`
      )
    ) {
      return;
    }
    try {
      const res = await rotateApiKeyMutation({ partnerCode, environment });
      toast.success(`${environment.toUpperCase()} API key rotated. Please store your new key securely.`);
      copyToClipboard(res.apiKey, "New API Key");
    } catch (err: any) {
      toast.error(err.message || "Failed to rotate API key");
    }
  };

  // Handle generating a new named API key
  const handleCreateNewKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) {
      toast.error("Please enter a label for your new key");
      return;
    }
    setIsGeneratingKey(true);
    try {
      const res = await generateApiKeyMutation({
        partnerCode,
        name: newKeyName.trim(),
        environment,
      });
      setFreshlyGeneratedKey(res);
      toast.success("New API key generated successfully!");
      setNewKeyName("");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate API key");
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // Handle revoking an API key
  const handleRevokeKey = async (keyId: Id<"partnerApiKeys">) => {
    if (
      !confirm(
        "Are you sure you want to revoke this API key? This action is immediate and cannot be undone."
      )
    ) {
      return;
    }
    setIsRevokingKey(keyId);
    try {
      await revokeApiKeyMutation({ keyId, partnerCode });
      toast.success("API key revoked");
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke key");
    } finally {
      setIsRevokingKey(null);
    }
  };

  // Handle triggering real test webhook (cryptographically signed HTTP POST)
  const handleTriggerTestWebhook = async () => {
    setIsTriggeringWebhook(true);
    setTestWebhookResult(null);
    try {
      const res = await triggerRealWebhookAction({
        partnerCode,
        environment,
        eventType: "referral.status_updated",
        customUrl: webhookUrlInput.trim() || undefined,
      });
      setTestWebhookResult(res);
      if (res.success) {
        toast.success(`Webhook delivered in ${res.latencyMs}ms (HTTP ${res.statusCode})`);
      } else {
        toast.warning(res.errorMessage || `Webhook delivery returned HTTP ${res.statusCode}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger test webhook");
      setTestWebhookResult({
        success: false,
        error: err.message,
        statusCode: 500,
      });
    } finally {
      setIsTriggeringWebhook(false);
    }
  };

  // Handle resending a logged webhook delivery
  const handleResendWebhook = async (log: any) => {
    try {
      toast.info(`Retrying webhook to ${log.url}...`);
      const res = await triggerRealWebhookAction({
        partnerCode,
        environment,
        eventType: log.eventType,
        customUrl: log.url,
      });
      if (res.success) {
        toast.success(`Webhook resent in ${res.latencyMs}ms (HTTP ${res.statusCode})`);
      } else {
        toast.warning(res.errorMessage || `Resend returned HTTP ${res.statusCode}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to resend webhook");
    }
  };

  // Export commission CSV
  const handleExportCommissionsCSV = () => {
    if (!commissionsLedger || commissionsLedger.length === 0) {
      toast.info("No commission entries to export");
      return;
    }
    const headers = [
      "Date",
      "Tracking Code",
      "Patient Name",
      "Event Type",
      "Gross Amount (NGN)",
      "Commission Rate",
      "Net Payable (NGN)",
      "Status",
      "Settlement ID",
    ];
    const rows = (commissionsLedger as any[]).map((c: any) => [
      c.earnedAtIso,
      c.trackingCode,
      `"${c.patientName}"`,
      c.eventType,
      (c.grossTransactionAmount / 100).toFixed(2),
      c.commissionRate,
      (c.netPayable / 100).toFixed(2),
      c.status,
      c.settlementId || "",
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Rehabify_Commissions_${partnerCode}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Commission statement downloaded");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "received":
      case "pending":
        return {
          label: "Received",
          color: "bg-sky-50 text-sky-700 border-sky-200",
          dot: "bg-sky-500",
        };
      case "contact_pending":
      case "consent_pending":
        return {
          label: "Care Outreach Queued",
          color: "bg-amber-50 text-amber-700 border-amber-200",
          dot: "bg-amber-500",
        };
      case "booked":
        return {
          label: "Consultation Booked",
          color: "bg-teal-50 text-teal-700 border-teal-200",
          dot: "bg-teal-600",
        };
      case "in_treatment":
      case "treatment_active":
      case "attended":
        return {
          label: "In Active Therapy",
          color: "bg-emerald-50 text-emerald-800 border-emerald-200",
          dot: "bg-emerald-600",
        };
      case "completed":
      case "paid_out":
        return {
          label: "Completed & Discharged",
          color: "bg-green-50 text-green-800 border-green-200",
          dot: "bg-green-600",
        };
      default:
        return {
          label: status.replace(/_/g, " "),
          color: "bg-stone-100 text-stone-700 border-stone-200",
          dot: "bg-stone-400",
        };
    }
  };

  const formatKobo = (kobo: number, currency: string = "NGN") => {
    const symbol = currency === "NGN" ? "₦" : currency === "USD" ? "$" : `${currency} `;
    return `${symbol}${((kobo || 0) / 100).toLocaleString("en-NG", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  };

  // Code snippets generator
  const getCodeSnippet = () => {
    const activeApiKey = overview?.partnerInfo?.apiKey || "sk_test_rehabify_sandbox";
    const baseUrl =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://api.physioaroundme.com";

    if (codeEndpoint === "referrals") {
      if (codeLang === "curl") {
        return `curl -X POST ${baseUrl}/api/v1/partners/referrals \\
  -H "Authorization: Bearer ${activeApiKey}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: ${Date.now()}" \\
  -d '{
    "external_ref": "WELLS-10482",
    "patient": {
      "first_name": "Tolu",
      "last_name": "Adeyemi",
      "phone": "+2348012345678",
      "city": "Lagos"
    },
    "reason": "Post-op ACL reconstruction rehabilitation",
    "care_mode": "patient_choice",
    "preferred_contact": "whatsapp"
  }'`;
      }
      if (codeLang === "javascript") {
        return `import axios from 'axios';

const response = await axios.post('${baseUrl}/api/v1/partners/referrals', {
  external_ref: 'WELLS-10482',
  patient: {
    first_name: 'Tolu',
    last_name: 'Adeyemi',
    phone: '+2348012345678',
    city: 'Lagos'
  },
  reason: 'Post-op ACL reconstruction rehabilitation',
  care_mode: 'patient_choice',
  preferred_contact: 'whatsapp'
}, {
  headers: {
    'Authorization': 'Bearer ${activeApiKey}',
    'Content-Type': 'application/json'
  }
});

console.log('Referral Tracking Code:', response.data.tracking_code);`;
      }
      return `import requests

res = requests.post(
    "${baseUrl}/api/v1/partners/referrals",
    json={
        "external_ref": "WELLS-10482",
        "patient": {"first_name": "Tolu", "last_name": "Adeyemi", "phone": "+2348012345678", "city": "Lagos"},
        "reason": "Post-op ACL reconstruction",
        "care_mode": "patient_choice",
        "preferred_contact": "whatsapp"
    },
    headers={
        "Authorization": "Bearer ${activeApiKey}",
        "Content-Type": "application/json"
    }
)
print(res.json())`;
    }

    if (codeEndpoint === "track") {
      if (codeLang === "curl") {
        return `curl -X GET "${baseUrl}/api/v1/partners/referrals/RHB-72941" \\
  -H "Authorization: Bearer ${activeApiKey}"`;
      }
      if (codeLang === "javascript") {
        return `const res = await fetch('${baseUrl}/api/v1/partners/referrals/RHB-72941', {
  headers: { 'Authorization': 'Bearer ${activeApiKey}' }
});
const tracking = await res.json();
console.log('Live Care Status:', tracking.status);`;
      }
      return `import requests

res = requests.get(
    "${baseUrl}/api/v1/partners/referrals/RHB-72941",
    headers={"Authorization": "Bearer ${activeApiKey}"}
)
print(res.json())`;
    }

    return `curl -X POST ${baseUrl}/api/v1/partners/eligibility \\
  -H "Authorization: Bearer ${activeApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "member_policy_number": "POL-99201-AXA",
    "service_code": "physiotherapy_in_home",
    "requested_sessions": 6
  }'`;
  };

  // --------------------------------------------------------------------------
  // STATE 0: Authentication Loading State
  // --------------------------------------------------------------------------
  if (!isUserLoaded || userPartnerData === undefined) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 rounded-full border-3 border-[#002e2c]/20 border-t-[#002e2c] animate-spin" />
        <p className="text-xs font-semibold uppercase tracking-wider text-[#52706e]">
          Authenticating Partner Portal...
        </p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STATE 1: Unauthenticated -> Apple-Inspired Cream Gateway
  // --------------------------------------------------------------------------
  if (!isSignedIn || userPartnerData?.status === "unauthenticated") {
    return (
      <div className="min-h-screen py-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto flex flex-col items-center justify-center font-sans antialiased">
        {/* Apple-style floating hero card */}
        <div className="w-full bg-white/85 backdrop-blur-xl rounded-[32px] border border-[#002e2c]/10 p-8 sm:p-12 shadow-[0_20px_60px_rgba(0,46,44,0.05)] text-center flex flex-col items-center space-y-6">
          {/* Official Rehabify Logo */}
          <Link href="/" className="transition-transform hover:scale-105 active:scale-95 duration-200">
            <NextImage
              src="/logos/MainRehabify.svg"
              alt="Rehabify Health"
              width={160}
              height={44}
              priority
              className="h-10 w-auto object-contain"
            />
          </Link>

          {/* Apple-style pill badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FAF6E7] border border-[#002e2c]/12 text-xs font-medium text-[#002e2c] shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            <span>Enterprise Partner Network</span>
          </div>

          <div className="space-y-3 max-w-2xl">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#002e2c] leading-tight">
              The Rehabilitation Operating System for Healthcare Leaders
            </h1>
            <p className="text-base text-[#52706e] leading-relaxed max-w-xl mx-auto">
              Connect your HMO, hospital, clinic, or corporate wellness plan. Dispatch verified MRTBN physiotherapists, track patient recovery milestones in real time, and automate commercial settlements.
            </p>
          </div>

          {/* Primary Authentication Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 w-full max-w-md pt-2">
            <SignInButton
              mode="modal"
              fallbackRedirectUrl="/partners/portal"
              forceRedirectUrl="/partners/portal"
            >
              <button className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-[#002e2c] text-[#FAF6E7] font-semibold text-sm hover:bg-[#004744] active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer">
                <Lock className="w-4 h-4 text-emerald-400" />
                <span>Sign In to Portal</span>
              </button>
            </SignInButton>

            <SignUpButton
              mode="modal"
              fallbackRedirectUrl="/partners/portal"
              forceRedirectUrl="/partners/portal"
              signInFallbackRedirectUrl="/partners/portal"
              signInForceRedirectUrl="/partners/portal"
            >
              <button className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-[#FAF6E7]/80 hover:bg-[#FAF6E7] text-[#002e2c] border border-[#002e2c]/15 font-semibold text-sm active:scale-[0.98] transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer">
                <Building2 className="w-4 h-4 text-[#005b57]" />
                <span>Apply for Partner Access</span>
              </button>
            </SignUpButton>
          </div>

          <div className="pt-2 text-xs text-[#52706e] flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Enterprise OAuth & Single Sign-On Supported</span>
          </div>
        </div>

        {/* Feature pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-8">
          <div className="p-6 rounded-2xl bg-white/70 backdrop-blur-md border border-[#002e2c]/10 shadow-xs space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#FAF6E7] border border-[#002e2c]/10 flex items-center justify-center text-[#005b57]">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-[#002e2c] text-sm">Direct Clinical Referrals</h3>
            <p className="text-xs text-[#52706e] leading-relaxed">
              Seamlessly triage members to MRTBN-verified physiotherapists for in-home visits or virtual rehabilitation.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/70 backdrop-blur-md border border-[#002e2c]/10 shadow-xs space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#FAF6E7] border border-[#002e2c]/10 flex items-center justify-center text-[#005b57]">
              <Terminal className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-[#002e2c] text-sm">FHIR & Webhook APIs</h3>
            <p className="text-xs text-[#52706e] leading-relaxed">
              Real-time programmatic updates when patients attend sessions, complete assessments, or get discharged.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/70 backdrop-blur-md border border-[#002e2c]/10 shadow-xs space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#FAF6E7] border border-[#002e2c]/10 flex items-center justify-center text-[#005b57]">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-[#002e2c] text-sm">Automated Settlements</h3>
            <p className="text-xs text-[#52706e] leading-relaxed">
              Transparent commission ledgers and revenue sharing statements with downloadable CSV accounting exports.
            </p>
          </div>
        </div>

        <div className="mt-10 text-center text-xs text-[#52706e]">
          Protected by Rehabify Health Clinical Governance · MRTBN Licensed Practitioners · HIPAA & NDPR Aligned
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STATE 2: Authenticated, No Partner Organization Found -> Multi-Step Onboarding
  // --------------------------------------------------------------------------
  if (userPartnerData?.status === "no_partner" && !userPartnerData?.isAdmin) {
    const partnerTypeLabels: Record<string, { label: string; desc: string }> = {
      hmo: { label: "HMO / Insurer", desc: "Direct claims & policy billing" },
      hospital: { label: "Hospital / Clinic", desc: "Inpatient discharge & referral" },
      corporate: { label: "Corporate Employer", desc: "Staff ergonomics & wellness" },
      telemedicine: { label: "Telemedicine", desc: "Digital triage & remote physio" },
      gym: { label: "Gym / Sports Facility", desc: "Injury recovery & athletic rehab" },
      pharmacy: { label: "Pharmacy Network", desc: "Patient referral & pain care" },
      digital_health: { label: "Digital Health App", desc: "API integration & care coordination" },
      employer: { label: "Enterprise Group", desc: "Executive wellness programmes" },
    };

    const availableStates = [
      "Lagos",
      "Abuja FCT",
      "Rivers (Port Harcourt)",
      "Oyo (Ibadan)",
      "Kano",
      "Delta",
      "Edo",
      "Enugu",
      "Ogun",
      "Kaduna",
    ];

    const availableCareModes = [
      { id: "face_to_face", label: "In-Clinic Care", desc: "Patient visits vetted physical therapy clinic" },
      { id: "home_visit", label: "Home Visit Physio", desc: "Physiotherapist dispatches to patient residence" },
      { id: "remote", label: "Tele-Rehabilitation", desc: "Remote video consultations and exercise monitoring" },
    ];

    const toggleStateSelection = (stateName: string) => {
      setOnboardingForm((prev) => {
        const exists = prev.coverageStates.includes(stateName);
        return {
          ...prev,
          coverageStates: exists
            ? prev.coverageStates.filter((s) => s !== stateName)
            : [...prev.coverageStates, stateName],
        };
      });
    };

    const toggleCareModeSelection = (modeId: string) => {
      setOnboardingForm((prev) => {
        const exists = prev.supportedCareModes.includes(modeId);
        return {
          ...prev,
          supportedCareModes: exists
            ? prev.supportedCareModes.filter((m) => m !== modeId)
            : [...prev.supportedCareModes, modeId],
        };
      });
    };

    return (
      <div className="min-h-screen bg-[#FAF6E7] py-8 sm:py-12 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header Bar */}
          <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-[#002e2c]/10 p-4 sm:p-5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <Link href="/" className="shrink-0">
                <NextImage
                  src="/logos/MainRehabify.svg"
                  alt="Rehabify Health"
                  width={116}
                  height={30}
                  className="h-7 w-auto object-contain"
                />
              </Link>
              <div className="h-5 w-px bg-[#002e2c]/15" />
              <div>
                <h1 className="text-sm sm:text-base font-semibold text-[#002e2c] leading-tight">
                  Partner Organization Onboarding
                </h1>
                <p className="text-[11px] text-[#52706e] hidden sm:block">
                  Rehabify Clinical Network & Enterprise Integration
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#52706e] hidden sm:inline">
                {user?.primaryEmailAddress?.emailAddress}
              </span>
              <UserButton afterSignOutUrl="/partners/portal" />
            </div>
          </div>

          {/* Stepper Card */}
          <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-[0_12px_40px_rgba(0,46,44,0.05)] space-y-8">
            {/* Progress Nav */}
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                {[
                  { step: 1, title: "Organization", subtitle: "Legal details" },
                  { step: 2, title: "Brand Identity", subtitle: "Logo upload" },
                  { step: 3, title: "Coverage", subtitle: "Liaison & states" },
                  { step: 4, title: "Review", subtitle: "Verification" },
                ].map((s) => {
                  const isActive = onboardingStep === s.step;
                  const isDone = onboardingStep > s.step;
                  return (
                    <button
                      key={s.step}
                      type="button"
                      onClick={() => {
                        if (isDone) setOnboardingStep(s.step as any);
                      }}
                      className={`text-left p-2 rounded-xl transition-all ${
                        isActive
                          ? "bg-[#002e2c]/5 border border-[#002e2c]/15"
                          : isDone
                          ? "cursor-pointer hover:bg-[#FAF6E7]/50"
                          : "opacity-50 cursor-default"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isDone
                              ? "bg-emerald-600 text-white"
                              : isActive
                              ? "bg-[#002e2c] text-[#FAF6E7]"
                              : "bg-[#002e2c]/10 text-[#52706e]"
                          }`}
                        >
                          {isDone ? <Check className="w-3 h-3" /> : s.step}
                        </span>
                        <span className="font-semibold text-[11px] sm:text-xs text-[#002e2c] truncate">
                          {s.title}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#52706e] truncate pl-7 hidden sm:block">
                        {s.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Progress Line */}
              <div className="w-full bg-[#002e2c]/10 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#002e2c] h-full transition-all duration-300 rounded-full"
                  style={{
                    width:
                      onboardingStep === 1
                        ? "25%"
                        : onboardingStep === 2
                        ? "50%"
                        : onboardingStep === 3
                        ? "75%"
                        : "100%",
                  }}
                />
              </div>
            </div>

            {/* STEP 1: Organization Profile */}
            {onboardingStep === 1 && (
              <div className="space-y-6 animate-in fade-in-50 duration-200">
                <div className="border-b border-[#002e2c]/10 pb-4">
                  <h2 className="text-lg font-bold text-[#002e2c]">Organization Profile</h2>
                  <p className="text-xs text-[#52706e] mt-1">
                    Provide your company's registered name and operational category.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                      Legal Organization Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Reliance HMO, Lagoon Hospitals, Leadway Health"
                      value={onboardingForm.name}
                      onChange={(e) => setOnboardingForm({ ...onboardingForm, name: e.target.value })}
                      className="w-full px-4 py-3.5 rounded-xl bg-[#FAF6E7]/40 border border-[#002e2c]/15 text-[#002e2c] text-sm focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                      Organization Classification *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {Object.entries(partnerTypeLabels).map(([key, item]) => {
                        const isSelected = onboardingForm.type === key;
                        return (
                          <div
                            key={key}
                            onClick={() => setOnboardingForm({ ...onboardingForm, type: key as any })}
                            className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start justify-between ${
                              isSelected
                                ? "border-[#002e2c] bg-[#002e2c]/5 shadow-xs"
                                : "border-[#002e2c]/15 bg-white hover:border-[#002e2c]/30 hover:bg-[#FAF6E7]/20"
                            }`}
                          >
                            <div>
                              <div className="text-xs font-semibold text-[#002e2c]">{item.label}</div>
                              <div className="text-[11px] text-[#52706e] mt-0.5">{item.desc}</div>
                            </div>
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                isSelected
                                  ? "border-[#002e2c] bg-[#002e2c] text-white"
                                  : "border-[#002e2c]/30"
                              }`}
                            >
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                      Official Website (Optional)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#52706e]">
                        <Globe className="w-4 h-4" />
                      </div>
                      <input
                        type="url"
                        placeholder="https://yourcompany.com"
                        value={onboardingForm.website}
                        onChange={(e) => setOnboardingForm({ ...onboardingForm, website: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FAF6E7]/40 border border-[#002e2c]/15 text-[#002e2c] text-sm focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#002e2c]/10 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (!onboardingForm.name.trim()) {
                        toast.error("Please provide your organization name");
                        return;
                      }
                      setOnboardingStep(2);
                    }}
                    className="px-6 py-3 rounded-xl bg-[#002e2c] text-[#FAF6E7] font-semibold text-sm hover:bg-[#004744] transition-all flex items-center gap-2 shadow-xs"
                  >
                    <span>Continue to Brand Identity</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Brand Identity & Direct Logo Upload */}
            {onboardingStep === 2 && (
              <div className="space-y-6 animate-in fade-in-50 duration-200">
                <div className="border-b border-[#002e2c]/10 pb-4">
                  <h2 className="text-lg font-bold text-[#002e2c]">Brand Identity & Logo Upload</h2>
                  <p className="text-xs text-[#52706e] mt-1">
                    Upload your official company logo file. It will be stored in Rehabify's secure vault and displayed dynamically across co-branded patient portals.
                  </p>
                </div>

                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={logoFileInputRef}
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoFileSelect(file);
                  }}
                  className="hidden"
                />

                {/* Logo Upload Box */}
                <div className="space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e]">
                    Official Company Logo *
                  </label>

                  {!logoPreviewUrl ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingLogo(true);
                      }}
                      onDragLeave={() => setIsDraggingLogo(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingLogo(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleLogoFileSelect(file);
                      }}
                      onClick={() => logoFileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                        isDraggingLogo
                          ? "border-[#002e2c] bg-[#002e2c]/5 scale-[1.01]"
                          : "border-[#002e2c]/25 bg-[#FAF6E7]/30 hover:border-[#002e2c]/50 hover:bg-[#FAF6E7]/60"
                      }`}
                    >
                      <div className="w-14 h-14 rounded-2xl bg-white border border-[#002e2c]/10 text-[#002e2c] flex items-center justify-center mx-auto mb-3 shadow-xs">
                        {isUploadingLogo ? (
                          <div className="w-6 h-6 rounded-full border-2 border-[#002e2c] border-t-transparent animate-spin" />
                        ) : (
                          <UploadCloud className="w-7 h-7 text-[#005b57]" />
                        )}
                      </div>
                      <p className="text-sm font-semibold text-[#002e2c]">
                        {isUploadingLogo ? "Uploading to Secure Storage..." : "Click to upload logo or drag and drop"}
                      </p>
                      <p className="text-xs text-[#52706e] mt-1">
                        High-resolution PNG, JPG, SVG, or WebP (max 5MB)
                      </p>
                      <p className="text-[11px] text-[#52706e]/80 mt-2">
                        Transparent backgrounds look best on light co-branded pages
                      </p>
                    </div>
                  ) : (
                    <div className="p-5 rounded-2xl bg-[#FAF6E7]/50 border border-[#002e2c]/15 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-xl bg-white border border-[#002e2c]/15 p-2 flex items-center justify-center shrink-0 shadow-xs">
                          <img
                            src={logoPreviewUrl}
                            alt="Uploaded Logo"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#002e2c]">
                              {logoFile?.name || "company_logo.png"}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              {logoStorageId ? "Vault Encrypted" : "Uploaded"}
                            </span>
                          </div>
                          <p className="text-xs text-[#52706e] mt-0.5">
                            {logoFile ? `${(logoFile.size / 1024).toFixed(1)} KB` : "Image File"} · Ready for Co-Branded Pages
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => logoFileInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg border border-[#002e2c]/20 bg-white text-xs font-semibold text-[#002e2c] hover:bg-[#FAF6E7] transition-all"
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-all flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Co-Branding Real-Time Preview */}
                <div className="rounded-2xl border border-[#002e2c]/15 bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#52706e]">
                      Live Co-Branded Referral Preview
                    </span>
                    <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 font-medium">
                      What referred patients will see
                    </span>
                  </div>

                  <div className="rounded-xl border border-[#002e2c]/10 bg-[#FAF6E7]/80 p-4">
                    <div className="flex items-center justify-between border-b border-[#002e2c]/10 pb-3">
                      <div className="flex items-center gap-3">
                        {logoPreviewUrl ? (
                          <div className="h-8 max-w-[120px] flex items-center">
                            <img
                              src={logoPreviewUrl}
                              alt="Partner Logo"
                              className="max-h-7 max-w-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="h-7 px-2.5 rounded-md bg-[#002e2c]/10 flex items-center text-[11px] font-bold text-[#002e2c]">
                            {onboardingForm.name || "YOUR LOGO"}
                          </div>
                        )}
                        <span className="text-xs font-medium text-[#52706e]">×</span>
                        <NextImage
                          src="/logos/MainRehabify.svg"
                          alt="Rehabify"
                          width={95}
                          height={24}
                          className="h-6 w-auto object-contain"
                        />
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#005b57] bg-[#005b57]/10 px-2 py-0.5 rounded">
                        Verified Partner
                      </span>
                    </div>

                    <div className="pt-3">
                      <h4 className="text-xs font-semibold text-[#002e2c]">
                        {onboardingForm.name || "Partner Organization"} Specialized Rehabilitation Access
                      </h4>
                      <p className="text-[11px] text-[#52706e] mt-0.5">
                        Licensed physical therapy, post-op orthopedic recovery, and stroke rehab dispatched with direct HMO billing.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#002e2c]/10 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(1)}
                    className="px-5 py-2.5 rounded-xl border border-[#002e2c]/20 text-xs font-semibold text-[#002e2c] hover:bg-[#FAF6E7] transition-all flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(3)}
                    className="px-6 py-3 rounded-xl bg-[#002e2c] text-[#FAF6E7] font-semibold text-sm hover:bg-[#004744] transition-all flex items-center gap-2 shadow-xs"
                  >
                    <span>Continue to Contact & Coverage</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Contacts & Operational Coverage */}
            {onboardingStep === 3 && (
              <div className="space-y-6 animate-in fade-in-50 duration-200">
                <div className="border-b border-[#002e2c]/10 pb-4">
                  <h2 className="text-lg font-bold text-[#002e2c]">Liaison & Operational Coverage</h2>
                  <p className="text-xs text-[#52706e] mt-1">
                    Specify your partnership representative and geographic operating areas for physical therapy dispatch.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                        Partnership Liaison Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Dr. Kemi Balogun / Tunde Adeleke"
                        value={onboardingForm.contactName}
                        onChange={(e) => setOnboardingForm({ ...onboardingForm, contactName: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7]/40 border border-[#002e2c]/15 text-[#002e2c] text-sm focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                        Official Contact Phone
                      </label>
                      <input
                        type="tel"
                        placeholder="+234 800 000 0000"
                        value={onboardingForm.contactPhone}
                        onChange={(e) => setOnboardingForm({ ...onboardingForm, contactPhone: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7]/40 border border-[#002e2c]/15 text-[#002e2c] text-sm focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                      Official Contact Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="partnerships@yourorganization.com"
                      value={onboardingForm.contactEmail}
                      onChange={(e) => setOnboardingForm({ ...onboardingForm, contactEmail: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7]/40 border border-[#002e2c]/15 text-[#002e2c] text-sm focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                    <p className="text-[11px] text-[#52706e] mt-1">
                      Administrative notifications, API credentials, and commission reports will be dispatched to this email.
                    </p>
                  </div>

                  {/* Operating States Chip Selector */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                      Operating States (Select all that apply)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableStates.map((st) => {
                        const isSelected = onboardingForm.coverageStates.includes(st);
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => toggleStateSelection(st)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                              isSelected
                                ? "bg-[#002e2c] text-[#FAF6E7] shadow-xs"
                                : "bg-[#FAF6E7]/60 text-[#52706e] border border-[#002e2c]/15 hover:border-[#002e2c]/30"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                            <span>{st}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                      Operating Cities / Districts
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ikeja, Lekki, Victoria Island, Maitama, Wuse II"
                      value={onboardingForm.coverageCities}
                      onChange={(e) => setOnboardingForm({ ...onboardingForm, coverageCities: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7]/40 border border-[#002e2c]/15 text-[#002e2c] text-sm focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                  </div>

                  {/* Care Modes */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                      Supported Care Modes
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {availableCareModes.map((cm) => {
                        const isSelected = onboardingForm.supportedCareModes.includes(cm.id);
                        return (
                          <div
                            key={cm.id}
                            onClick={() => toggleCareModeSelection(cm.id)}
                            className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                              isSelected
                                ? "border-[#002e2c] bg-[#002e2c]/5 shadow-xs"
                                : "border-[#002e2c]/15 bg-white hover:border-[#002e2c]/30"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-[#002e2c]">{cm.label}</span>
                              <div
                                className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                                  isSelected
                                    ? "bg-[#002e2c] border-[#002e2c] text-white"
                                    : "border-[#002e2c]/30"
                                }`}
                              >
                                {isSelected && <Check className="w-2.5 h-2.5" />}
                              </div>
                            </div>
                            <span className="text-[10px] text-[#52706e] leading-snug">{cm.desc}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#002e2c]/10 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(2)}
                    className="px-5 py-2.5 rounded-xl border border-[#002e2c]/20 text-xs font-semibold text-[#002e2c] hover:bg-[#FAF6E7] transition-all flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!onboardingForm.contactEmail.trim()) {
                        toast.error("Please provide an official contact email");
                        return;
                      }
                      setOnboardingStep(4);
                    }}
                    className="px-6 py-3 rounded-xl bg-[#002e2c] text-[#FAF6E7] font-semibold text-sm hover:bg-[#004744] transition-all flex items-center gap-2 shadow-xs"
                  >
                    <span>Continue to Review & Submit</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Review & Application Submission */}
            {onboardingStep === 4 && (
              <div className="space-y-6 animate-in fade-in-50 duration-200">
                <div className="border-b border-[#002e2c]/10 pb-4">
                  <h2 className="text-lg font-bold text-[#002e2c]">Review Application Dossier</h2>
                  <p className="text-xs text-[#52706e] mt-1">
                    Confirm your organization profile before submitting for Rehabify administrative verification.
                  </p>
                </div>

                {/* Dossier Card */}
                <div className="rounded-2xl border border-[#002e2c]/15 bg-[#FAF6E7]/50 p-5 space-y-4">
                  <div className="flex items-start justify-between pb-4 border-b border-[#002e2c]/10">
                    <div className="flex items-center gap-3">
                      {logoPreviewUrl ? (
                        <div className="w-14 h-14 rounded-xl bg-white border border-[#002e2c]/15 p-1.5 flex items-center justify-center shrink-0 shadow-xs">
                          <img
                            src={logoPreviewUrl}
                            alt="Logo"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-[#002e2c]/10 flex items-center justify-center text-[#002e2c] font-bold text-base shrink-0">
                          {onboardingForm.name ? onboardingForm.name.slice(0, 2).toUpperCase() : "PT"}
                        </div>
                      )}
                      <div>
                        <h3 className="text-base font-bold text-[#002e2c]">
                          {onboardingForm.name || "Untitled Organization"}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#002e2c] text-[#FAF6E7]">
                            {partnerTypeLabels[onboardingForm.type]?.label || onboardingForm.type}
                          </span>
                          {onboardingForm.website && (
                            <span className="text-xs text-[#52706e] flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {onboardingForm.website.replace(/^https?:\/\//, "")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOnboardingStep(1)}
                      className="text-xs text-[#005b57] font-semibold hover:underline"
                    >
                      Edit
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#52706e] block mb-1">
                        Liaison & Contact
                      </span>
                      <p className="font-semibold text-[#002e2c]">
                        {onboardingForm.contactName || "Official Representative"}
                      </p>
                      <p className="text-[#52706e]">{onboardingForm.contactEmail}</p>
                      {onboardingForm.contactPhone && (
                        <p className="text-[#52706e]">{onboardingForm.contactPhone}</p>
                      )}
                    </div>

                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#52706e] block mb-1">
                        Coverage & Care Modes
                      </span>
                      <p className="font-semibold text-[#002e2c]">
                        {onboardingForm.coverageStates.length > 0 ? onboardingForm.coverageStates.join(", ") : "Nationwide"}
                      </p>
                      <p className="text-[#52706e] text-[11px]">
                        Cities: {onboardingForm.coverageCities || "All metro centers"}
                      </p>
                      <p className="text-[#52706e] text-[11px] mt-0.5">
                        Modes: {onboardingForm.supportedCareModes.map((m) => m === "face_to_face" ? "In-Clinic" : m === "home_visit" ? "Home Visit" : "Tele-Rehab").join(", ")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Governance and Terms Agreement */}
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-950">
                        Rehabify Clinical Governance Verification
                      </h4>
                      <p className="text-[11px] text-emerald-800 leading-relaxed mt-0.5">
                        Every partner application is vetted by Rehabify Operations. Upon approval, your partner portal unlocks full API keys, custom tracking links (/r/[code]), and automated monthly commission statements.
                      </p>
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 pt-2 border-t border-emerald-200/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={termsAgreed}
                      onChange={(e) => setTermsAgreed(e.target.checked)}
                      className="mt-0.5 rounded text-[#002e2c] focus:ring-[#002e2c]"
                    />
                    <span className="text-xs text-emerald-950 leading-relaxed">
                      I confirm that I am authorized to register this organization and agree to Rehabify's Healthcare Partnership Terms and NDPR Patient Data Privacy Standards.
                    </span>
                  </label>
                </div>

                <div className="pt-4 border-t border-[#002e2c]/10 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(3)}
                    className="px-5 py-2.5 rounded-xl border border-[#002e2c]/20 text-xs font-semibold text-[#002e2c] hover:bg-[#FAF6E7] transition-all flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingApplication || !termsAgreed}
                    onClick={() => handleApplyForPartner()}
                    className="px-7 py-3.5 rounded-xl bg-[#002e2c] text-[#FAF6E7] font-semibold text-sm hover:bg-[#004744] transition-all flex items-center gap-2 shadow-md disabled:opacity-50"
                  >
                    {isSubmittingApplication ? (
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    )}
                    <span>Submit Application for Admin Review</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="text-center text-xs text-[#52706e]">
            Protected by Rehabify Health Clinical Governance · MRTBN Licensed Practitioners · HIPAA & NDPR Aligned
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STATE 3: Authenticated, Application Pending Review
  // --------------------------------------------------------------------------
  if (userPartnerData?.status === "pending" && !userPartnerData?.isAdmin) {
    const pendingPartner = userPartnerData.partner;
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 sm:px-6">
        <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-8 sm:p-10 shadow-[0_8px_30px_rgba(0,46,44,0.04)] text-center space-y-6">
          <div className="flex items-center justify-between border-b border-[#002e2c]/10 pb-4">
            <Link href="/" className="shrink-0">
              <NextImage
                src="/logos/MainRehabify.svg"
                alt="Rehabify Health"
                width={120}
                height={32}
                className="h-7 w-auto object-contain"
              />
            </Link>
            <UserButton afterSignOutUrl="/partners/portal" />
          </div>

          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
            <Clock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100/80 text-amber-800 text-xs font-semibold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Application Under Review
            </div>
            <h1 className="text-2xl font-bold text-[#002e2c] tracking-tight">
              {pendingPartner?.name || "Your Organization"}
            </h1>
            <p className="text-sm text-[#52706e] max-w-md mx-auto leading-relaxed">
              Your partner registration is being reviewed by the Rehabify Health Clinical and Compliance team. Once approved, your live API keys and referral links will be unlocked.
            </p>
          </div>

          {/* Company branding summary */}
          <div className="p-4 rounded-2xl bg-[#FAF6E7]/80 border border-[#002e2c]/10 text-left space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#52706e] font-medium">Organization Type</span>
              <span className="font-semibold text-[#002e2c] uppercase">{pendingPartner?.type}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#52706e] font-medium">Contact Email</span>
              <span className="font-semibold text-[#002e2c]">{pendingPartner?.contactEmail}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#52706e] font-medium">Assigned Partner Code</span>
              <span className="font-mono font-semibold text-[#002e2c]">{pendingPartner?.code}</span>
            </div>
            {pendingPartner?.logoUrl && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[#52706e] font-medium">Uploaded Logo</span>
                <img
                  src={pendingPartner.logoUrl}
                  alt={pendingPartner.name}
                  className="h-6 max-w-[120px] object-contain"
                />
              </div>
            )}
          </div>

          <div className="text-xs text-[#52706e] pt-2">
            Questions regarding your review status? Contact our clinical team at{" "}
            <a href="mailto:partners@physioaroundme.com" className="text-[#005b57] font-semibold underline">
              partners@physioaroundme.com
            </a>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STATE 4: Authenticated, Application Rejected
  // --------------------------------------------------------------------------
  if (userPartnerData?.status === "rejected" && !userPartnerData?.isAdmin) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-red-200 p-8 text-center space-y-5 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-[#002e2c]">Application Not Approved</h2>
          <p className="text-sm text-[#52706e]">
            {userPartnerData.partner?.rejectionReason ||
              "Your partner registration could not be verified according to our clinical onboarding guidelines."}
          </p>
          <div className="pt-2">
            <UserButton afterSignOutUrl="/partners/portal" />
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STATE 5: Approved Partner (Or Rehabify Admin) -> Full Dynamic Portal
  // --------------------------------------------------------------------------
  const currentPartnerInfo = overview?.partnerInfo;

  return (
    <div className="min-h-screen bg-[#FAF6E7] text-[#002e2c] font-sans pb-28 antialiased selection:bg-[#005b57] selection:text-white">
      {/* Apple-style Translucent Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-[#002e2c]/10 bg-[#FAF6E7]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Dynamic Brand & Company Identity */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-3">
              <Link href="/" className="shrink-0 transition-opacity hover:opacity-85">
                <NextImage
                  src="/logos/MainRehabify.svg"
                  alt="Rehabify Health"
                  width={110}
                  height={30}
                  className="h-7 w-auto object-contain"
                />
              </Link>
              <div className="h-6 w-px bg-[#002e2c]/15" />
              <div className="flex items-center gap-2.5">
                {currentPartnerInfo?.logoUrl ? (
                  <div className="h-7 max-w-[120px] flex items-center">
                    <img
                      src={currentPartnerInfo.logoUrl}
                      alt={currentPartnerInfo.name}
                      className="max-h-7 max-w-[120px] object-contain rounded-md"
                    />
                  </div>
                ) : null}
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tracking-tight text-[#002e2c] text-sm">
                      {currentPartnerInfo?.name || "Partner Portal"}
                    </span>
                    <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full bg-[#002e2c]/5 text-[#005b57] border border-[#002e2c]/10">
                      Partner Portal
                    </span>
                  </div>
                  <span className="text-[11px] text-[#52706e]">Rehabify Care & API Infrastructure</span>
                </div>
              </div>
            </div>

            {/* Host badge */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-[#002e2c]/10 text-[11px] text-[#52706e] shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="font-mono text-[#002e2c]">partners.physioaroundme.com</span>
            </div>
          </div>

          {/* Controls: Admin Partner Selector, Environment, Clerk Auth & Actions */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Admin Partner Switcher Dropdown (Only visible to Rehabify Admins) */}
            {userPartnerData?.isAdmin && (
              <div className="relative">
                <select
                  value={partnerCode}
                  onChange={(e) => setPartnerCode(e.target.value)}
                  className="appearance-none bg-white text-xs font-semibold text-[#002e2c] pl-3 pr-8 py-1.5 rounded-xl border border-[#002e2c]/15 hover:border-[#002e2c]/30 focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20 cursor-pointer shadow-xs"
                >
                  <option value="sandbox_partner">Sandbox Partner (Test)</option>
                  {(partnersList as any[])
                    ?.filter((p: any) => p.code !== "sandbox_partner")
                    .map((p: any) => (
                      <option key={p.code} value={p.code}>
                        {p.name} ({p.type?.toUpperCase()})
                      </option>
                    ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#52706e] absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            )}

            {/* Apple-style Segmented Environment Toggle */}
            <div className="hidden sm:inline-flex p-0.5 bg-[#002e2c]/5 border border-[#002e2c]/10 rounded-xl">
              <button
                onClick={() => setEnvironment("sandbox")}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  environment === "sandbox"
                    ? "bg-white text-[#002e2c] shadow-xs font-semibold"
                    : "text-[#52706e] hover:text-[#002e2c]"
                }`}
              >
                Sandbox
              </button>
              <button
                onClick={() => setEnvironment("live")}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  environment === "live"
                    ? "bg-white text-[#002e2c] shadow-xs font-semibold"
                    : "text-[#52706e] hover:text-[#002e2c]"
                }`}
              >
                Live
              </button>
            </div>

            {/* Documentation Link */}
            <Link
              href="/docs"
              className="hidden md:flex items-center gap-1.5 text-xs font-medium text-[#52706e] hover:text-[#002e2c] px-3 py-1.5 rounded-xl hover:bg-white border border-transparent hover:border-[#002e2c]/10 transition shadow-xs"
            >
              <FileText className="w-3.5 h-3.5 text-[#005b57]" />
              <span>Docs</span>
            </Link>

            {/* Clerk User Button */}
            <div className="flex items-center gap-2 pl-2 border-l border-[#002e2c]/10">
              <UserButton afterSignOutUrl="/partners/portal" />
            </div>

            {/* Primary Action Button: New Referral */}
            <button
              onClick={() => {
                setReferralSuccessData(null);
                setIsReferralModalOpen(true);
              }}
              className="flex items-center gap-1.5 bg-[#002e2c] hover:bg-[#004744] text-[#FAF6E7] font-semibold text-xs px-3.5 sm:px-4 py-1.5 rounded-xl transition shadow-xs active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 text-[#FAF6E7]" />
              <span>New Referral</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* Sandbox vs Live Notice Banner */}
        {environment === "sandbox" && (
          <div className="rounded-2xl border border-amber-300/80 bg-amber-50/90 p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-950">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-200/70 text-amber-900 rounded-xl shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs uppercase tracking-wider text-amber-950">
                    ⚡ SANDBOX MODE ACTIVE
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900">
                    Isolated Test Environment
                  </span>
                </div>
                <p className="text-xs text-amber-900/80 mt-0.5 leading-relaxed">
                  Inbound referrals are stamped as sandbox tests. Webhooks are dispatched with test signatures. Real patients and WhatsApp bots will not be dispatched.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setEnvironment("live")}
                className="px-3.5 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold transition shadow-xs"
              >
                Switch to Production
              </button>
            </div>
          </div>
        )}

        {/* Apple-style Partner Overview Hero Card */}
        <div className="relative rounded-3xl border border-[#002e2c]/10 bg-white p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,46,44,0.03)]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              {currentPartnerInfo?.logoUrl ? (
                <div className="w-16 h-16 rounded-2xl border border-[#002e2c]/10 bg-white p-2 flex items-center justify-center shrink-0 shadow-xs">
                  <img
                    src={currentPartnerInfo.logoUrl}
                    alt={currentPartnerInfo.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl border border-[#002e2c]/10 bg-[#FAF6E7] flex items-center justify-center text-[#002e2c] shrink-0 shadow-xs">
                  <Building2 className="w-8 h-8 text-[#005b57]" />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#002e2c]">
                    {currentPartnerInfo?.name || "Partner Organization"}
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#005b57]/10 text-[#005b57] border border-[#005b57]/20 uppercase tracking-wider">
                    {currentPartnerInfo?.tier || "Enterprise"} Tier
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">
                    Verified Healthcare Partner
                  </span>
                </div>
                <p className="text-[#52706e] text-sm max-w-2xl leading-relaxed">
                  Direct patient referrals, licensed MRTBN specialist matching, care tracking, automated commercial commissions, and real-time FHIR webhooks.
                </p>
              </div>
            </div>

            {/* Quick Badges */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="bg-[#FAF6E7]/80 border border-[#002e2c]/10 rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-xs">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-[#52706e] font-semibold">Partner ID</span>
                  <span className="font-mono text-xs font-bold text-[#002e2c]">{partnerCode}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(partnerCode, "Partner Code")}
                  className="text-[#52706e] hover:text-[#002e2c] p-1 hover:bg-white rounded-lg transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={() => setActiveTab("branding")}
                className="px-4 py-2.5 rounded-2xl bg-white border border-[#002e2c]/15 text-xs font-semibold text-[#002e2c] hover:bg-[#FAF6E7] transition shadow-xs flex items-center gap-2"
              >
                <Sliders className="w-3.5 h-3.5 text-[#005b57]" />
                <span>Company Branding</span>
              </button>
            </div>
          </div>
        </div>

        {/* Apple-style Segmented Navigation Control */}
        <div className="border-b border-[#002e2c]/10 pb-px">
          <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar p-1 bg-[#002e2c]/5 rounded-2xl max-w-fit">
            {[
              { id: "overview", label: "Overview", icon: Activity },
              { id: "links", label: "Referral Links", icon: Link2, badge: referralLinks?.length || 0 },
              { id: "referrals", label: "Referrals", icon: Users, badge: overview?.metrics?.totalReferrals || 0 },
              { id: "commissions", label: "Commissions", icon: Wallet },
              { id: "developers", label: "Developer & APIs", icon: Terminal },
              { id: "branding", label: "Branding & Settings", icon: Building2 },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                    isActive
                      ? "bg-white text-[#002e2c] shadow-xs"
                      : "text-[#52706e] hover:text-[#002e2c] hover:bg-white/50"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#005b57]" : "text-[#52706e]"}`} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isActive ? "bg-[#002e2c] text-[#FAF6E7]" : "bg-[#002e2c]/10 text-[#002e2c]"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 1: OVERVIEW */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Metric KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-6 rounded-2xl bg-white border border-[#002e2c]/10 shadow-[0_4px_20px_rgba(0,46,44,0.03)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#52706e]">Total Inbound Referrals</span>
                  <div className="p-2 rounded-xl bg-[#FAF6E7] text-[#005b57]">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl font-bold tracking-tight text-[#002e2c]">
                  {overview?.metrics?.totalReferrals || 0}
                </div>
                <div className="text-xs text-[#52706e] flex items-center gap-1.5">
                  <span className="text-emerald-700 font-semibold">100% active</span>
                  <span>clinical triage pipeline</span>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-[#002e2c]/10 shadow-[0_4px_20px_rgba(0,46,44,0.03)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#52706e]">In Active Treatment</span>
                  <div className="p-2 rounded-xl bg-[#FAF6E7] text-[#005b57]">
                    <Activity className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl font-bold tracking-tight text-[#002e2c]">
                  {overview?.metrics?.activeInTreatment || 0}
                </div>
                <div className="text-xs text-[#52706e]">Under verified MRTBN physical therapists</div>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-[#002e2c]/10 shadow-[0_4px_20px_rgba(0,46,44,0.03)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#52706e]">Prescribed Rehab Sessions</span>
                  <div className="p-2 rounded-xl bg-[#FAF6E7] text-[#005b57]">
                    <CalendarClock className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl font-bold tracking-tight text-[#002e2c]">
                  {overview?.metrics?.totalSessionsPrescribed || 0}
                </div>
                <div className="text-xs text-[#52706e]">Home visits & tele-rehab sessions</div>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-[#002e2c]/10 shadow-[0_4px_20px_rgba(0,46,44,0.03)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#52706e]">Commercial Commission</span>
                  <div className="p-2 rounded-xl bg-[#FAF6E7] text-[#005b57]">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl font-bold tracking-tight text-[#002e2c]">
                  {formatKobo(commercialSummary?.availablePayoutKobo || 0)}
                </div>
                <div className="text-xs text-[#52706e] flex items-center justify-between">
                  <span>Available for settlement</span>
                  <button onClick={() => setActiveTab("commissions")} className="text-[#005b57] font-semibold hover:underline">
                    View Ledger →
                  </button>
                </div>
              </div>
            </div>

            {/* Visual Analytics Engine (Recharts with Brand Colors) */}
            <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#002e2c]/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-[#005b57]/10 text-[#005b57]">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-[#002e2c] flex items-center gap-2">
                      <span>Clinical Care & Referral Volume Analytics</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          environment === "live"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {environment}
                      </span>
                    </h2>
                    <p className="text-xs text-[#52706e]">
                      Live admissions, care completion rates, and modality breakdown
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-xl bg-[#002e2c]/5 border border-[#002e2c]/10 flex gap-1">
                    {(["7d", "30d", "90d"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setAnalyticsRange(r)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase transition ${
                          analyticsRange === r
                            ? "bg-white text-[#002e2c] shadow-xs"
                            : "text-[#52706e] hover:text-[#002e2c]"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Referral Volume Over Time (Area Chart) */}
                <div className="lg:col-span-2 rounded-2xl bg-[#FAF6E7]/40 border border-[#002e2c]/10 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#002e2c]">
                        Daily Patient Volume Trends
                      </h3>
                      <p className="text-[11px] text-[#52706e]">
                        New referrals vs booked physiotherapy appointments
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] font-semibold">
                      <span className="flex items-center gap-1.5 text-[#005b57]">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#005b57]" />
                        Total Referrals
                      </span>
                      <span className="flex items-center gap-1.5 text-[#F59E0B]">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                        Care Booked
                      </span>
                    </div>
                  </div>

                  <div className="h-64 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={analyticsTimeseries?.volumeData || []}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="brandEmeraldGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#005b57" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#005b57" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="brandYellowGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#002e2c" strokeOpacity={0.06} />
                        <XAxis
                          dataKey="date"
                          stroke="#52706e"
                          fontSize={11}
                          tickLine={false}
                          axisLine={{ stroke: "#002e2c", strokeOpacity: 0.1 }}
                        />
                        <YAxis
                          stroke="#52706e"
                          fontSize={11}
                          tickLine={false}
                          axisLine={{ stroke: "#002e2c", strokeOpacity: 0.1 }}
                          allowDecimals={false}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "#002e2c",
                            borderRadius: "14px",
                            border: "1px solid rgba(250, 246, 231, 0.1)",
                            color: "#FAF6E7",
                            fontSize: "12px",
                            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
                          }}
                          itemStyle={{ color: "#FAF6E7" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="referrals"
                          name="Inbound Referrals"
                          stroke="#005b57"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#brandEmeraldGrad)"
                        />
                        <Area
                          type="monotone"
                          dataKey="booked"
                          name="Care Booked"
                          stroke="#F59E0B"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#brandYellowGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 2. Modality Split (Donut Chart) */}
                <div className="rounded-2xl bg-[#FAF6E7]/40 border border-[#002e2c]/10 p-5 space-y-3 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#002e2c]">
                      Care Modality Split
                    </h3>
                    <p className="text-[11px] text-[#52706e]">
                      Clinic sessions vs home visits & tele-rehab
                    </p>
                  </div>

                  <div className="h-44 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={analyticsTimeseries?.careModeData || []}
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {(analyticsTimeseries?.careModeData || []).map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} stroke="#FAF6E7" strokeWidth={2} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "#002e2c",
                            borderRadius: "12px",
                            color: "#FAF6E7",
                            fontSize: "11px",
                            border: "none",
                          }}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-[#002e2c]/10 text-xs">
                    {(analyticsTimeseries?.careModeData || []).map((entry: any) => (
                      <div key={entry.name} className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[#52706e]">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.fill }} />
                          {entry.name}
                        </span>
                        <span className="font-semibold text-[#002e2c]">{entry.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. Clinical Funnel Progression (Bar Chart) */}
              <div className="rounded-2xl bg-[#FAF6E7]/40 border border-[#002e2c]/10 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#002e2c]">
                      Patient Clinical Progression Funnel
                    </h3>
                    <p className="text-[11px] text-[#52706e]">
                      Conversion from referral ingestion to completed recovery
                    </p>
                  </div>
                </div>

                <div className="h-44 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analyticsTimeseries?.funnelData || []}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#002e2c" strokeOpacity={0.06} />
                      <XAxis type="number" stroke="#52706e" fontSize={11} tickLine={false} />
                      <YAxis
                        dataKey="stage"
                        type="category"
                        stroke="#52706e"
                        fontSize={11}
                        tickLine={false}
                        width={130}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "#002e2c",
                          borderRadius: "12px",
                          color: "#FAF6E7",
                          fontSize: "12px",
                          border: "none",
                        }}
                      />
                      <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                        {(analyticsTimeseries?.funnelData || []).map((entry: any, index: number) => (
                          <Cell key={`funnel-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Quick Actions & Recent Referrals */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent Referrals List */}
              <div className="lg:col-span-2 bg-white rounded-3xl border border-[#002e2c]/10 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-[#002e2c]">Recent Referrals</h2>
                    <p className="text-xs text-[#52706e]">Latest patient admissions and therapy milestones</p>
                  </div>
                  <button
                    onClick={() => setActiveTab("referrals")}
                    className="text-xs font-semibold text-[#005b57] hover:underline"
                  >
                    View All Referrals →
                  </button>
                </div>

                {filteredReferrals.length === 0 ? (
                  <div className="p-12 text-center rounded-2xl bg-[#FAF6E7]/50 border border-dashed border-[#002e2c]/15 space-y-3">
                    <Users className="w-8 h-8 text-[#52706e] mx-auto opacity-50" />
                    <p className="text-sm font-medium text-[#002e2c]">No referrals submitted yet</p>
                    <p className="text-xs text-[#52706e] max-w-sm mx-auto">
                      Send your first patient referral or generate a branded referral link for your members.
                    </p>
                    <button
                      onClick={() => setIsReferralModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-[#002e2c] text-[#FAF6E7] text-xs font-semibold hover:bg-[#004744] transition"
                    >
                      Create Referral Now
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#002e2c]/10 text-[#52706e]">
                          <th className="pb-3 font-semibold">Patient</th>
                          <th className="pb-3 font-semibold">Tracking Code</th>
                          <th className="pb-3 font-semibold">Condition</th>
                          <th className="pb-3 font-semibold">Status</th>
                          <th className="pb-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#002e2c]/5">
                        {filteredReferrals.slice(0, 6).map((ref: any) => {
                          const badge = getStatusBadge(ref.status);
                          return (
                            <tr key={ref.referralId} className="hover:bg-[#FAF6E7]/40 transition">
                              <td className="py-3 font-medium text-[#002e2c]">{ref.patientName}</td>
                              <td className="py-3 font-mono text-[#52706e]">{ref.trackingCode}</td>
                              <td className="py-3 text-[#52706e]">{ref.condition || "General Physio"}</td>
                              <td className="py-3">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${badge.color}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                                  {badge.label}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <Link
                                  href={`/track/${ref.trackingCode}`}
                                  target="_blank"
                                  className="text-[#005b57] font-semibold hover:underline inline-flex items-center gap-1"
                                >
                                  <span>Track</span>
                                  <ExternalLink className="w-3 h-3" />
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Quick Launch & Referral Links summary */}
              <div className="space-y-6">
                <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 shadow-xs space-y-4">
                  <h3 className="text-sm font-semibold text-[#002e2c]">Referral Links Summary</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/10">
                      <span className="text-xs text-[#52706e]">Total Link Clicks</span>
                      <span className="font-bold text-sm text-[#002e2c]">{linkStats.totalClicks}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/10">
                      <span className="text-xs text-[#52706e]">Patient Leads Captured</span>
                      <span className="font-bold text-sm text-[#002e2c]">{linkStats.totalLeads}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/10">
                      <span className="text-xs text-[#52706e]">Consultations Booked</span>
                      <span className="font-bold text-sm text-emerald-800">{linkStats.totalBookings}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setCreatedLinkResult(null);
                      setIsLinkModalOpen(true);
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#002e2c] text-[#FAF6E7] text-xs font-semibold hover:bg-[#004744] transition flex items-center justify-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Generate New Referral Link</span>
                  </button>
                </div>

                {/* Developer API Quick Access */}
                <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#52706e]">Secret API Key</span>
                    <span className="text-[10px] font-mono text-[#005b57]">REST / Webhook</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#FAF6E7] border border-[#002e2c]/10 flex items-center justify-between">
                    <span className="font-mono text-xs text-[#002e2c]">
                      {showApiKey
                        ? currentPartnerInfo?.apiKey || "sk_test_rehabify_sandbox"
                        : "sk_••••••••••••••••••••••••"}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="p-1 text-[#52706e] hover:text-[#002e2c] rounded transition"
                      >
                        {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            currentPartnerInfo?.apiKey || "sk_test_rehabify_sandbox",
                            "API Key"
                          )
                        }
                        className="p-1 text-[#52706e] hover:text-[#002e2c] rounded transition"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab("developers")}
                    className="text-xs font-semibold text-[#005b57] hover:underline"
                  >
                    Open Developer Console & Webhooks →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 2: REFERRAL LINKS */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === "links" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-[#002e2c]">Hosted Referral Links</h2>
                <p className="text-xs text-[#52706e]">
                  Share unique links with your members or patients. Direct attribution and automated tracking.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search links or campaigns..."
                  value={linkSearchQuery}
                  onChange={(e) => setLinkSearchQuery(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-white border border-[#002e2c]/15 text-xs text-[#002e2c] focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20 w-64"
                />
                <button
                  onClick={() => {
                    setCreatedLinkResult(null);
                    setIsLinkModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#002e2c] text-[#FAF6E7] text-xs font-semibold hover:bg-[#004744] transition flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Link</span>
                </button>
              </div>
            </div>

            {/* Links table */}
            <div className="bg-white rounded-3xl border border-[#002e2c]/10 overflow-hidden shadow-xs">
              {filteredLinks.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <Link2 className="w-8 h-8 text-[#52706e] mx-auto opacity-50" />
                  <p className="text-sm font-semibold text-[#002e2c]">No referral links found</p>
                  <p className="text-xs text-[#52706e]">Generate your first referral link to begin onboarding members.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#FAF6E7]/60 border-b border-[#002e2c]/10 text-[#52706e]">
                        <th className="py-3 px-4 font-semibold">Public Link</th>
                        <th className="py-3 px-4 font-semibold">Campaign</th>
                        <th className="py-3 px-4 font-semibold">Service Scope</th>
                        <th className="py-3 px-4 font-semibold">Clicks</th>
                        <th className="py-3 px-4 font-semibold">Leads</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#002e2c]/5">
                      {filteredLinks.map((l: any) => {
                        const host = typeof window !== "undefined" ? window.location.host : "physioaroundme.com";
                        const protocol =
                          typeof window !== "undefined" && window.location.protocol
                            ? window.location.protocol
                            : "https:";
                        const fullUrl = `${protocol}//${host}/r/${l.publicCode}`;

                        return (
                          <tr key={l._id} className="hover:bg-[#FAF6E7]/30 transition">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-[#002e2c]">/r/{l.publicCode}</span>
                                <button
                                  onClick={() => copyToClipboard(fullUrl, "Referral Link")}
                                  className="text-[#52706e] hover:text-[#002e2c] p-1 rounded"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-medium text-[#002e2c]">
                              {l.campaignName || "General Referral"}
                            </td>
                            <td className="py-3 px-4 text-[#52706e] capitalize">
                              {(l.serviceScope || "all_rehabilitation").replace(/_/g, " ")}
                            </td>
                            <td className="py-3 px-4 font-semibold text-[#002e2c]">{l.clicks || 0}</td>
                            <td className="py-3 px-4 font-semibold text-emerald-800">{l.leads || 0}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  l.status === "active"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-stone-100 text-stone-600 border-stone-200"
                                }`}
                              >
                                {l.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Link
                                href={`/r/${l.publicCode}`}
                                target="_blank"
                                className="text-[#005b57] font-semibold hover:underline inline-flex items-center gap-1"
                              >
                                <span>Preview</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 3: REFERRALS */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === "referrals" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-[#002e2c]">Patient Referrals Ledger</h2>
                <p className="text-xs text-[#52706e]">
                  Track the care progression of referred patients with MRTBN licensed physical therapists.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search patient, tracking code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-white border border-[#002e2c]/15 text-xs text-[#002e2c] focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20 w-64"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-white border border-[#002e2c]/15 text-xs text-[#002e2c] focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                >
                  <option value="all">All Statuses</option>
                  <option value="received">Received</option>
                  <option value="contact_pending">Care Outreach Queued</option>
                  <option value="booked">Booked</option>
                  <option value="in_treatment">In Treatment</option>
                  <option value="completed">Completed</option>
                </select>
                <button
                  onClick={() => setIsReferralModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-[#002e2c] text-[#FAF6E7] text-xs font-semibold hover:bg-[#004744] transition flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Referral</span>
                </button>
              </div>
            </div>

            {/* Referrals table */}
            <div className="bg-white rounded-3xl border border-[#002e2c]/10 overflow-hidden shadow-xs">
              {filteredReferrals.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <Users className="w-8 h-8 text-[#52706e] mx-auto opacity-50" />
                  <p className="text-sm font-semibold text-[#002e2c]">No referrals match your criteria</p>
                  <p className="text-xs text-[#52706e]">Try clearing the search or status filter.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#FAF6E7]/60 border-b border-[#002e2c]/10 text-[#52706e]">
                        <th className="py-3 px-4 font-semibold">Patient Name</th>
                        <th className="py-3 px-4 font-semibold">Tracking Code</th>
                        <th className="py-3 px-4 font-semibold">Phone</th>
                        <th className="py-3 px-4 font-semibold">Condition</th>
                        <th className="py-3 px-4 font-semibold">City</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#002e2c]/5">
                      {filteredReferrals.map((r: any) => {
                        const badge = getStatusBadge(r.status);
                        return (
                          <tr key={r.referralId} className="hover:bg-[#FAF6E7]/30 transition">
                            <td className="py-3 px-4 font-semibold text-[#002e2c]">{r.patientName}</td>
                            <td className="py-3 px-4 font-mono text-[#52706e]">{r.trackingCode}</td>
                            <td className="py-3 px-4 text-[#52706e]">{r.phone || "—"}</td>
                            <td className="py-3 px-4 text-[#52706e]">{r.condition || "General Physio"}</td>
                            <td className="py-3 px-4 text-[#52706e]">{r.city || "Lagos"}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${badge.color}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Link
                                href={`/track/${r.trackingCode}`}
                                target="_blank"
                                className="text-[#005b57] font-semibold hover:underline inline-flex items-center gap-1"
                              >
                                <span>Track Journey</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 4: COMMISSIONS */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === "commissions" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-[#002e2c]">Commercial Commissions & Revenue Sharing</h2>
                <p className="text-xs text-[#52706e]">
                  Reconciliation ledger for patient treatments and partner commission earnings.
                </p>
              </div>

              <button
                onClick={handleExportCommissionsCSV}
                className="px-4 py-2 rounded-xl bg-white border border-[#002e2c]/15 text-[#002e2c] text-xs font-semibold hover:bg-[#FAF6E7] transition flex items-center gap-1.5 shadow-xs"
              >
                <Download className="w-3.5 h-3.5 text-[#005b57]" />
                <span>Export CSV</span>
              </button>
            </div>

            {/* Financial KPI stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-6 rounded-2xl bg-white border border-[#002e2c]/10 shadow-xs space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#52706e]">Total Lifetime Earned</span>
                <div className="text-2xl font-bold text-[#002e2c]">
                  {formatKobo(commercialSummary?.totalEarnedKobo || 0)}
                </div>
                <div className="text-xs text-[#52706e]">All settled and pending commissions</div>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-[#002e2c]/10 shadow-xs space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#52706e]">Pending Settlement</span>
                <div className="text-2xl font-bold text-amber-600">
                  {formatKobo(commercialSummary?.pendingReviewKobo || 0)}
                </div>
                <div className="text-xs text-[#52706e]">Under end-of-month clinical review</div>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-[#002e2c]/10 shadow-xs space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#52706e]">Available for Payout</span>
                <div className="text-2xl font-bold text-emerald-800">
                  {formatKobo(commercialSummary?.availablePayoutKobo || 0)}
                </div>
                <div className="text-xs text-[#52706e]">Approved for wire transfer disbursement</div>
              </div>
            </div>

            {/* Commissions ledger table */}
            <div className="bg-white rounded-3xl border border-[#002e2c]/10 overflow-hidden shadow-xs">
              {!commissionsLedger || commissionsLedger.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <CreditCard className="w-8 h-8 text-[#52706e] mx-auto opacity-50" />
                  <p className="text-sm font-semibold text-[#002e2c]">No commission records yet</p>
                  <p className="text-xs text-[#52706e]">Commissions accrue automatically as referred patients complete sessions.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#FAF6E7]/60 border-b border-[#002e2c]/10 text-[#52706e]">
                        <th className="py-3 px-4 font-semibold">Date</th>
                        <th className="py-3 px-4 font-semibold">Tracking Code</th>
                        <th className="py-3 px-4 font-semibold">Patient</th>
                        <th className="py-3 px-4 font-semibold">Gross Treatment</th>
                        <th className="py-3 px-4 font-semibold">Commission Rate</th>
                        <th className="py-3 px-4 font-semibold">Net Payout</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#002e2c]/5">
                      {commissionsLedger.map((c: any) => (
                        <tr key={c._id} className="hover:bg-[#FAF6E7]/30 transition">
                          <td className="py-3 px-4 text-[#52706e]">{c.earnedAtIso?.slice(0, 10)}</td>
                          <td className="py-3 px-4 font-mono font-semibold text-[#002e2c]">{c.trackingCode}</td>
                          <td className="py-3 px-4 text-[#002e2c]">{c.patientName}</td>
                          <td className="py-3 px-4 text-[#52706e]">{formatKobo(c.grossTransactionAmount)}</td>
                          <td className="py-3 px-4 font-semibold text-[#005b57]">{c.commissionRate}</td>
                          <td className="py-3 px-4 font-bold text-emerald-800">{formatKobo(c.netPayable)}</td>
                          <td className="py-3 px-4 capitalize">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {c.status}
                            </span>
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

        {/* ------------------------------------------------------------------ */}
        {/* TAB 5: DEVELOPERS & APIS */}
        {/* ------------------------------------------------------------------ */}
        {/* ------------------------------------------------------------------ */}
        {/* TAB 5: DEVELOPER & APIS (Enterprise Suite) */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === "developers" && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-[#002e2c]">
                    Enterprise Developer Platform & Webhooks
                  </h2>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      environment === "live"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {environment} mode
                  </span>
                </div>
                <p className="text-xs text-[#52706e] mt-0.5">
                  Server-to-server credentials, real-time activity logs, latency inspection, endpoint health, and FHIR-compliant webhook dispatching.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setFreshlyGeneratedKey(null);
                    setIsNewKeyModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#002e2c] hover:bg-[#004744] text-[#FAF6E7] text-xs font-semibold transition shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Generate New Key</span>
                </button>
              </div>
            </div>

            {/* Segmented Sub-Navigation for Developers */}
            <div className="border-b border-[#002e2c]/10 pb-px">
              <div className="flex space-x-1 overflow-x-auto no-scrollbar p-1 bg-[#002e2c]/5 rounded-2xl max-w-fit">
                {[
                  { id: "overview", label: "Overview & Credentials", icon: Key },
                  { id: "keys", label: "API Key Management", icon: ShieldCheck, badge: apiKeys?.length || 0 },
                  { id: "logs", label: "Activity & Webhook Logs", icon: Activity, badge: activityLogs?.length || 0 },
                  { id: "health", label: "Integration Health", icon: HeartPulse },
                  { id: "webhooks", label: "Webhook Config", icon: Webhook },
                  { id: "snippets", label: "Code Playground", icon: Code2 },
                ].map((sec) => {
                  const Icon = sec.icon;
                  const isActive = activeDevSection === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => setActiveDevSection(sec.id as any)}
                      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                        isActive
                          ? "bg-white text-[#002e2c] shadow-xs"
                          : "text-[#52706e] hover:text-[#002e2c]"
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#005b57]" : "text-[#52706e]"}`} />
                      <span>{sec.label}</span>
                      {sec.badge !== undefined && sec.badge > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? "bg-[#002e2c] text-[#FAF6E7]" : "bg-[#002e2c]/10 text-[#002e2c]"}`}>
                          {sec.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sub-Section 1: OVERVIEW & CREDENTIALS */}
            {(activeDevSection === "overview" || activeDevSection === "keys") && (
              <div className="space-y-6">
                {/* Primary Key Display */}
                <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-xs space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#002e2c]/10 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[#002e2c]">Primary Secret API Key</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${environment === "live" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                          {environment}
                        </span>
                      </div>
                      <p className="text-xs text-[#52706e]">
                        Authenticate API calls using standard Bearer authorization.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRotateKey}
                        className="px-3.5 py-1.5 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Rotate Primary Key</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type={showApiKey ? "text" : "password"}
                      readOnly
                      value={currentPartnerInfo?.apiKey || "sk_test_rehabify_sandbox"}
                      className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7] border border-[#002e2c]/15 text-[#002e2c] font-mono text-xs focus:outline-none select-all"
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="p-3 rounded-xl border border-[#002e2c]/15 bg-white text-[#52706e] hover:text-[#002e2c] transition shadow-xs"
                      title={showApiKey ? "Hide Key" : "Show Key"}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() =>
                        copyToClipboard(currentPartnerInfo?.apiKey || "sk_test_rehabify_sandbox", "API Key")
                      }
                      className="p-3 rounded-xl bg-[#002e2c] text-[#FAF6E7] hover:bg-[#004744] transition shadow-xs"
                      title="Copy API Key"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 text-xs border-t border-[#002e2c]/5">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#52706e] tracking-wider block">Key Prefix</span>
                      <span className="font-mono font-semibold text-[#002e2c]">{currentPartnerInfo?.keyPrefix || "sk_test_..."}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#52706e] tracking-wider block">Environment</span>
                      <span className="font-semibold capitalize text-[#005b57]">{environment}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#52706e] tracking-wider block">Key Status</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#52706e] tracking-wider block">Last Used</span>
                      <span className="text-[#52706e]">Recorded automatically</span>
                    </div>
                  </div>
                </div>

                {/* Multi-Key Table */}
                <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-[#002e2c]">Provisioned API Keys</h3>
                      <p className="text-xs text-[#52706e]">All active and revoked keys configured for {partnerCode} in {environment} mode.</p>
                    </div>
                    <button
                      onClick={() => {
                        setFreshlyGeneratedKey(null);
                        setIsNewKeyModalOpen(true);
                      }}
                      className="text-xs font-semibold text-[#005b57] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create New Key</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#002e2c]/10 text-[#52706e]">
                          <th className="pb-3 font-semibold">Key Name</th>
                          <th className="pb-3 font-semibold">Prefix</th>
                          <th className="pb-3 font-semibold">Env</th>
                          <th className="pb-3 font-semibold">Status</th>
                          <th className="pb-3 font-semibold">Created</th>
                          <th className="pb-3 font-semibold">Last Used</th>
                          <th className="pb-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#002e2c]/5">
                        {(!apiKeys || apiKeys.length === 0) ? (
                          <tr>
                            <td colSpan={7} className="py-6 text-center text-[#52706e]">
                              No provisioned keys found for this environment.
                            </td>
                          </tr>
                        ) : (
                          apiKeys.map((k: any) => (
                            <tr key={k._id} className="hover:bg-[#FAF6E7]/30 transition">
                              <td className="py-3 font-semibold text-[#002e2c]">{k.name}</td>
                              <td className="py-3 font-mono text-[#52706e]">{k.keyPrefix}</td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${k.environment === "live" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                                  {k.environment}
                                </span>
                              </td>
                              <td className="py-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${k.status === "active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-zinc-100 text-zinc-600"}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${k.status === "active" ? "bg-emerald-500" : "bg-zinc-400"}`} />
                                  {k.status?.toUpperCase()}
                                </span>
                              </td>
                              <td className="py-3 text-[#52706e]">
                                {new Date(k.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </td>
                              <td className="py-3 text-[#52706e]">
                                {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Never"}
                              </td>
                              <td className="py-3 text-right">
                                {k.status === "active" && k._id !== "sandbox_default_key" && k._id !== "initial_partner_key" && (
                                  <button
                                    onClick={() => handleRevokeKey(k._id)}
                                    disabled={isRevokingKey === k._id}
                                    className="text-xs text-red-600 hover:text-red-800 font-semibold disabled:opacity-50"
                                  >
                                    {isRevokingKey === k._id ? "Revoking..." : "Revoke"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-Section 2: ACTIVITY LOGS & AUDIT TRAIL */}
            {(activeDevSection === "overview" || activeDevSection === "logs") && (
              <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-xs space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#002e2c]/10 pb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#002e2c] flex items-center gap-2">
                      <Activity className="w-4 h-4 text-[#005b57]" />
                      <span>Activity & Callback Audit Stream</span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#002e2c]/5 text-[#005b57]">
                        {activityLogs?.length || 0} events
                      </span>
                    </h3>
                    <p className="text-xs text-[#52706e]">
                      Every inbound referral API call and outbound webhook delivery is recorded with millisecond latency, HTTP status, and sanitized payloads.
                    </p>
                  </div>

                  {/* Filter controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={logEventTypeFilter}
                      onChange={(e) => setLogEventTypeFilter(e.target.value)}
                      className="bg-[#FAF6E7]/80 border border-[#002e2c]/15 text-xs text-[#002e2c] font-semibold px-3 py-1.5 rounded-xl focus:outline-none"
                    >
                      <option value="all">All Events</option>
                      <option value="referral.created">referral.created</option>
                      <option value="referral.status_updated">referral.status_updated</option>
                      <option value="webhook.delivery">webhook.delivery</option>
                      <option value="test.ping">test.ping</option>
                    </select>

                    <select
                      value={logStatusFilter}
                      onChange={(e) => setLogStatusFilter(e.target.value)}
                      className="bg-[#FAF6E7]/80 border border-[#002e2c]/15 text-xs text-[#002e2c] font-semibold px-3 py-1.5 rounded-xl focus:outline-none"
                    >
                      <option value="all">All Statuses</option>
                      <option value="success">Success (2xx)</option>
                      <option value="error">Error (4xx/5xx)</option>
                    </select>
                  </div>
                </div>

                {/* Activity Logs Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#002e2c]/10 text-[#52706e]">
                        <th className="pb-3 font-semibold">Timestamp</th>
                        <th className="pb-3 font-semibold">Event ID</th>
                        <th className="pb-3 font-semibold">Type</th>
                        <th className="pb-3 font-semibold">Direction</th>
                        <th className="pb-3 font-semibold">Status</th>
                        <th className="pb-3 font-semibold">Duration</th>
                        <th className="pb-3 font-semibold">Tracking Code</th>
                        <th className="pb-3 font-semibold text-right">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#002e2c]/5">
                      {(!activityLogs || activityLogs.length === 0) ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-[#52706e]">
                            <Activity className="w-8 h-8 text-[#52706e] mx-auto opacity-40 mb-2" />
                            <p className="font-semibold text-[#002e2c]">No activity logged yet</p>
                            <p className="text-[11px] max-w-sm mx-auto mt-1">
                              Send a test webhook below or make an API request with your key to stream real-time events.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        activityLogs.map((log: any) => (
                          <tr
                            key={log._id}
                            onClick={() => {
                              setSelectedLog(log);
                              setIsLogDrawerOpen(true);
                            }}
                            className="hover:bg-[#FAF6E7]/40 cursor-pointer transition"
                          >
                            <td className="py-3 font-mono text-[#52706e]">
                              {new Date(log.occurredAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </td>
                            <td className="py-3 font-mono font-semibold text-[#002e2c]">
                              {log.eventId?.slice(0, 14)}...
                            </td>
                            <td className="py-3">
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono bg-[#002e2c]/5 text-[#005b57] border border-[#002e2c]/10">
                                {log.eventType}
                              </span>
                            </td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${log.direction === "inbound" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-purple-50 text-purple-700 border border-purple-200"}`}>
                                {log.direction === "inbound" ? "Inbound API" : "Outbound Callback"}
                              </span>
                            </td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.status === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                                {log.statusCode} {log.status?.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3 font-mono text-[#002e2c]">
                              {log.latencyMs}ms
                            </td>
                            <td className="py-3 font-mono text-[#52706e]">
                              {log.trackingCode || "—"}
                            </td>
                            <td className="py-3 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLog(log);
                                  setIsLogDrawerOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-[#FAF6E7] hover:bg-[#002e2c] hover:text-[#FAF6E7] text-[#002e2c] font-semibold text-[11px] transition shadow-xs"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-Section 3: INTEGRATION HEALTH & ACTIVE ENDPOINTS */}
            {(activeDevSection === "overview" || activeDevSection === "health") && (
              <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-xs space-y-6">
                <div className="border-b border-[#002e2c]/10 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#002e2c] flex items-center gap-2">
                      <HeartPulse className="w-4 h-4 text-[#005b57]" />
                      <span>Live Integration Health & Active Endpoints</span>
                    </h3>
                    <p className="text-xs text-[#52706e]">
                      Continuous telemetry monitoring latency and operational status across all Rehabify developer APIs.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-emerald-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      24h Success Rate: {integrationHealth?.successRate || 99.8}%
                    </span>
                    <span className="text-[#52706e]">
                      Avg Latency: <strong className="text-[#002e2c]">{integrationHealth?.avgLatencyMs || 84}ms</strong>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(integrationHealth?.endpoints || []).map((ep: any) => (
                    <div
                      key={ep.name}
                      className="p-4 rounded-2xl bg-[#FAF6E7]/40 border border-[#002e2c]/10 flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-[#002e2c]">{ep.name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ep.status === "operational" ? "bg-emerald-100 text-emerald-800" : ep.status === "degraded" ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-600"}`}>
                            {ep.status?.toUpperCase()}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-[#52706e] break-all">
                          <strong className="text-[#005b57] font-semibold">{ep.method}</strong> {ep.path}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono text-xs font-bold text-[#002e2c] block">{ep.latencyMs}ms</span>
                        <span className="text-[10px] text-[#52706e]">{ep.uptime} uptime</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-Section 4: WEBHOOK CONFIGURATION & REAL DELIVERY */}
            {(activeDevSection === "overview" || activeDevSection === "webhooks") && (
              <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-xs space-y-6">
                <div className="border-b border-[#002e2c]/10 pb-4">
                  <h3 className="text-sm font-semibold text-[#002e2c] flex items-center gap-2">
                    <Webhook className="w-4 h-4 text-[#005b57]" />
                    <span>Real-Time Webhook Listener & Signature Dispatcher</span>
                  </h3>
                  <p className="text-xs text-[#52706e]">
                    Rehabify delivers JSON webhook events with an HMAC-SHA256 signature in the <code className="font-mono font-semibold">X-Rehabify-Signature</code> header.
                  </p>
                </div>

                <form onSubmit={handleSaveWebhook} className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <input
                      type="url"
                      required
                      placeholder="https://api.yourhmo.com/rehabify-webhooks"
                      value={webhookUrlInput}
                      onChange={(e) => setWebhookUrlInput(e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl bg-[#FAF6E7] border border-[#002e2c]/15 text-[#002e2c] font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                    <button
                      type="submit"
                      disabled={isSavingWebhook}
                      className="px-5 py-3 rounded-xl bg-[#002e2c] text-[#FAF6E7] text-xs font-semibold hover:bg-[#004744] transition shadow-xs disabled:opacity-50"
                    >
                      {isSavingWebhook ? "Saving..." : "Save Endpoint"}
                    </button>
                  </div>
                </form>

                <div className="pt-4 border-t border-[#002e2c]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold text-[#002e2c]">Webhook Signing Secret</span>
                    <span className="block font-mono text-xs text-[#52706e]">{currentPartnerInfo?.webhookSecret || "whsec_..."}</span>
                  </div>
                  <button
                    onClick={handleTriggerTestWebhook}
                    disabled={isTriggeringWebhook}
                    className="px-4 py-2.5 rounded-xl bg-[#FAF6E7] border border-[#002e2c]/15 text-[#002e2c] text-xs font-semibold hover:bg-[#002e2c] hover:text-[#FAF6E7] transition flex items-center gap-2 shadow-xs disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5 text-[#005b57]" />
                    <span>{isTriggeringWebhook ? "Dispatching HTTP POST..." : "Send Test Webhook Now"}</span>
                  </button>
                </div>

                {testWebhookResult && (
                  <div className="p-5 rounded-2xl bg-[#002e2c] text-[#FAF6E7] font-mono text-xs overflow-x-auto shadow-inner space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <span className="font-semibold text-emerald-400">
                        Delivery Result: HTTP {testWebhookResult.statusCode} ({testWebhookResult.latencyMs}ms)
                      </span>
                      <span className="text-[10px] text-zinc-400">Event ID: {testWebhookResult.eventId}</span>
                    </div>
                    <pre className="text-[11px] text-emerald-100/90 leading-relaxed">
                      {JSON.stringify(testWebhookResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Sub-Section 5: CODE PLAYGROUND */}
            {(activeDevSection === "overview" || activeDevSection === "snippets") && (
              <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#002e2c]">Integration Code Playground</h3>
                    <p className="text-xs text-[#52706e]">Production-ready code snippets with your real API credentials.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-xl bg-[#002e2c]/5 border border-[#002e2c]/10 flex gap-1">
                      {(["curl", "javascript", "python"] as const).map((lang) => (
                        <button
                          key={lang}
                          onClick={() => setCodeLang(lang)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                            codeLang === lang
                              ? "bg-white text-[#002e2c] shadow-xs"
                              : "text-[#52706e] hover:text-[#002e2c]"
                          }`}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>

                    <div className="p-1 rounded-xl bg-[#002e2c]/5 border border-[#002e2c]/10 flex gap-1">
                      {(["referrals", "track", "eligibility"] as const).map((ep) => (
                        <button
                          key={ep}
                          onClick={() => setCodeEndpoint(ep)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                            codeEndpoint === ep
                              ? "bg-white text-[#002e2c] shadow-xs"
                              : "text-[#52706e] hover:text-[#002e2c]"
                          }`}
                        >
                          {ep}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="relative rounded-2xl bg-[#002e2c] text-[#FAF6E7] p-5 font-mono text-xs overflow-x-auto shadow-inner">
                  <button
                    onClick={() => copyToClipboard(getCodeSnippet(), "Code snippet")}
                    className="absolute top-4 right-4 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-sans font-medium flex items-center gap-1.5 transition"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                  <pre>{getCodeSnippet()}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 6: BRANDING & SETTINGS */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === "branding" && (
          <div className="max-w-3xl space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-[#002e2c]">Company Branding & Profile</h2>
              <p className="text-xs text-[#52706e]">
                Customize your company name, logo, and contact coordinates. These details appear on all co-branded referral links and care reports.
              </p>
            </div>

            <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-xs space-y-6">
              <form onSubmit={handleSaveBranding} className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                    Company / Organization Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={brandingForm.name}
                    onChange={(e) => setBrandingForm({ ...brandingForm, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-sm focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                  />
                </div>

                {/* Company Logo Upload & Live Preview */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                    Company Logo
                  </label>
                  {brandingForm.logoUrl ? (
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl border border-[#002e2c]/15 bg-white p-2.5 flex items-center justify-center shrink-0 shadow-xs">
                        <img
                          src={brandingForm.logoUrl}
                          alt="Company Logo Preview"
                          className="max-h-full max-w-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-xs text-[#002e2c] font-medium">Logo uploaded</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setBrandingForm({ ...brandingForm, logoUrl: "" });
                            }}
                            className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => logoFileInputRef.current?.click()}
                            className="text-xs text-[#005b57] hover:text-[#002e2c] font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <Upload className="w-3 h-3" />
                            Replace
                          </button>
                        </div>
                      </div>
                      <input
                        ref={logoFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              toast.error("Logo file size must be less than 5MB");
                              return;
                            }
                            try {
                              const uploadUrl = await generateUploadUrlMutation({
                                fileName: file.name,
                                fileType: file.type || "application/octet-stream",
                              });
                              const res = await fetch(uploadUrl, {
                                method: "POST",
                                headers: { "Content-Type": file.type || "application/octet-stream" },
                                body: file,
                              });
                              if (!res.ok) throw new Error("Upload failed");
                              const { storageId } = await res.json();
                              await updateBrandingMutation({
                                partnerCode,
                                logoStorageId: storageId,
                              });
                              toast.success("Logo updated successfully");
                            } catch (err: any) {
                              toast.error(err.message || "Failed to upload logo");
                            }
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-colors cursor-pointer ${
                        isDraggingLogo
                          ? "border-[#005b57] bg-[#005b57]/5"
                          : "border-[#002e2c]/15 hover:border-[#002e2c]/30 bg-[#FAF6E7]/40"
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingLogo(true);
                      }}
                      onDragLeave={() => setIsDraggingLogo(false)}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setIsDraggingLogo(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) {
                          await handleLogoFileSelect(file);
                          if (logoStorageId) {
                            await updateBrandingMutation({
                              partnerCode,
                              logoStorageId,
                            });
                          }
                        }
                      }}
                      onClick={() => logoFileInputRef.current?.click()}
                    >
                      <input
                        ref={logoFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              toast.error("Logo file size must be less than 5MB");
                              return;
                            }
                            try {
                              const uploadUrl = await generateUploadUrlMutation({
                                fileName: file.name,
                                fileType: file.type || "application/octet-stream",
                              });
                              const res = await fetch(uploadUrl, {
                                method: "POST",
                                headers: { "Content-Type": file.type || "application/octet-stream" },
                                body: file,
                              });
                              if (!res.ok) throw new Error("Upload failed");
                              const { storageId } = await res.json();
                              await updateBrandingMutation({
                                partnerCode,
                                logoStorageId: storageId,
                              });
                              toast.success("Logo updated successfully");
                            } catch (err: any) {
                              toast.error(err.message || "Failed to upload logo");
                            }
                          }
                        }}
                      />
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-2xl bg-[#FAF6E7] border border-[#002e2c]/10 flex items-center justify-center">
                          <UploadCloud className="w-6 h-6 text-[#52706e]" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#002e2c]">
                            Drop your logo here, or <span className="text-[#005b57] underline">browse</span>
                          </p>
                          <p className="text-[11px] text-[#52706e] mt-1">
                            PNG, JPG, SVG or WebP · Max 5MB · Transparent background recommended
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                      Primary Contact Email
                    </label>
                    <input
                      type="email"
                      value={brandingForm.contactEmail}
                      onChange={(e) => setBrandingForm({ ...brandingForm, contactEmail: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-sm focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                      Primary Contact Phone
                    </label>
                    <input
                      type="tel"
                      value={brandingForm.contactPhone}
                      onChange={(e) => setBrandingForm({ ...brandingForm, contactPhone: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-sm focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-2">
                    Operating States (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={brandingForm.coverageStates}
                    onChange={(e) => setBrandingForm({ ...brandingForm, coverageStates: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-sm focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                  />
                </div>

                <div className="pt-4 border-t border-[#002e2c]/10 flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={isSavingBranding}
                    className="px-6 py-3 rounded-xl bg-[#002e2c] text-[#FAF6E7] font-semibold text-xs hover:bg-[#004744] transition shadow-xs disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSavingBranding ? "Saving Updates..." : "Save Branding Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* MODAL: CREATE REFERRAL LINK */}
      {/* ------------------------------------------------------------------ */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#002e2c]/15 max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#002e2c]/10 pb-4">
              <div>
                <h3 className="text-base font-semibold text-[#002e2c]">Create Branded Referral Link</h3>
                <p className="text-xs text-[#52706e]">Issue a fast URL for patient campaigns.</p>
              </div>
              <button
                onClick={() => setIsLinkModalOpen(false)}
                className="text-[#52706e] hover:text-[#002e2c] text-xs font-semibold"
              >
                ✕
              </button>
            </div>

            {createdLinkResult ? (
              <div className="space-y-5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-[#002e2c]">Referral Link Ready!</h4>
                <div className="p-3.5 rounded-xl bg-[#FAF6E7] border border-[#002e2c]/15 font-mono text-xs text-[#002e2c] break-all flex items-center justify-between gap-2">
                  <span>{createdLinkResult.url}</span>
                  <button
                    onClick={() => copyToClipboard(createdLinkResult.url, "Referral Link")}
                    className="p-1 text-[#005b57] hover:text-[#002e2c] shrink-0"
                    title="Copy Link"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-center pt-1">
                  <a
                    href={createdLinkResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#005b57] font-semibold hover:underline inline-flex items-center gap-1.5 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Preview Co-Branded Landing Page</span>
                  </a>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCreatedLinkResult(null)}
                    className="flex-1 py-2.5 rounded-xl border border-[#002e2c]/15 text-xs font-semibold text-[#002e2c] hover:bg-[#FAF6E7]"
                  >
                    Create Another
                  </button>
                  <button
                    onClick={() => setIsLinkModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-[#002e2c] text-[#FAF6E7] text-xs font-semibold hover:bg-[#004744]"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateLink} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                    Campaign / Department Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Q4 Post-Op Rehab, HMO Care Outreach"
                    value={linkFormData.campaignName}
                    onChange={(e) => setLinkFormData({ ...linkFormData, campaignName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                    Service Scope
                  </label>
                  <select
                    value={linkFormData.serviceScope}
                    onChange={(e) => setLinkFormData({ ...linkFormData, serviceScope: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                  >
                    <option value="all_rehabilitation">All Rehabilitation Services</option>
                    <option value="post_op_orthopedic">Post-Operative Orthopedic Rehab</option>
                    <option value="stroke_neuro_rehab">Stroke & Neurological Recovery</option>
                    <option value="sports_injury">Sports Injury & Return to Sport</option>
                    <option value="geriatric_mobility">Geriatric Mobility & Fall Prevention</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                    Care Mode Preference
                  </label>
                  <select
                    value={linkFormData.defaultCareMode}
                    onChange={(e) => setLinkFormData({ ...linkFormData, defaultCareMode: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                  >
                    <option value="patient_choice">Patient Choice (In-Home or Virtual)</option>
                    <option value="face_to_face">Face-to-Face Home Visit Required</option>
                    <option value="remote">Remote / Online Tele-Rehab</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                    Link Expiry (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="30 (0 for no expiry)"
                    value={linkFormData.expiresInDays}
                    onChange={(e) => setLinkFormData({ ...linkFormData, expiresInDays: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                  />
                </div>

                <div className="pt-3 border-t border-[#002e2c]/10 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsLinkModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-[#002e2c]/15 text-xs font-semibold text-[#002e2c] hover:bg-[#FAF6E7]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingLink}
                    className="flex-1 py-2.5 rounded-xl bg-[#002e2c] text-[#FAF6E7] text-xs font-semibold hover:bg-[#004744] disabled:opacity-50"
                  >
                    {isCreatingLink ? "Creating..." : "Generate Link"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL: DIRECT REFERRAL SUBMISSION */}
      {/* ------------------------------------------------------------------ */}
      {isReferralModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#002e2c]/15 max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#002e2c]/10 pb-4">
              <div>
                <h3 className="text-base font-semibold text-[#002e2c]">Submit Patient Referral</h3>
                <p className="text-xs text-[#52706e]">Direct clinical intake for verified physical rehabilitation.</p>
              </div>
              <button
                onClick={() => setIsReferralModalOpen(false)}
                className="text-[#52706e] hover:text-[#002e2c] text-xs font-semibold"
              >
                ✕
              </button>
            </div>

            {referralSuccessData ? (
              <div className="space-y-5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-[#002e2c]">Referral Received</h4>
                <div className="p-4 rounded-xl bg-[#FAF6E7] border border-[#002e2c]/15 text-xs text-[#002e2c] space-y-1">
                  <div className="text-[#52706e] font-semibold">Patient: {referralSuccessData.patientName}</div>
                  <div className="font-mono text-sm font-bold text-[#005b57]">
                    {referralSuccessData.trackingCode}
                  </div>
                </div>
                <p className="text-xs text-[#52706e]">
                  Our clinical care team will contact the patient to confirm their licensed physiotherapist match within 2 hours.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setReferralSuccessData(null)}
                    className="flex-1 py-2.5 rounded-xl border border-[#002e2c]/15 text-xs font-semibold text-[#002e2c] hover:bg-[#FAF6E7]"
                  >
                    Submit Another
                  </button>
                  <button
                    onClick={() => setIsReferralModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-[#002e2c] text-[#FAF6E7] text-xs font-semibold hover:bg-[#004744]"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateReferral} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Babatunde"
                      value={referralFormData.patientFirstName}
                      onChange={(e) =>
                        setReferralFormData({ ...referralFormData, patientFirstName: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Adeleke"
                      value={referralFormData.patientLastName}
                      onChange={(e) =>
                        setReferralFormData({ ...referralFormData, patientLastName: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="+234 800 000 0000"
                      value={referralFormData.patientPhone}
                      onChange={(e) =>
                        setReferralFormData({ ...referralFormData, patientPhone: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="patient@example.com"
                      value={referralFormData.patientEmail}
                      onChange={(e) =>
                        setReferralFormData({ ...referralFormData, patientEmail: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                      City
                    </label>
                    <input
                      type="text"
                      value={referralFormData.city}
                      onChange={(e) => setReferralFormData({ ...referralFormData, city: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                      Area / Neighborhood
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ikeja GRA, Lekki Phase 1"
                      value={referralFormData.area}
                      onChange={(e) => setReferralFormData({ ...referralFormData, area: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                    Clinical Diagnosis / Condition
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Post-Op Total Knee Replacement, Lumbar Spondylosis"
                    value={referralFormData.condition}
                    onChange={(e) => setReferralFormData({ ...referralFormData, condition: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                      Priority Level
                    </label>
                    <select
                      value={referralFormData.priority}
                      onChange={(e) => setReferralFormData({ ...referralFormData, priority: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    >
                      <option value="standard">Standard (Within 24-48 hrs)</option>
                      <option value="urgent">Urgent / Post-Discharge (Within 12-24 hrs)</option>
                      <option value="low">Elective Maintenance</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                      Partner Member ID / Auth Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. HMO-AUTH-9921"
                      value={referralFormData.partnerExternalId}
                      onChange={(e) =>
                        setReferralFormData({ ...referralFormData, partnerExternalId: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6E7]/60 border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-[#002e2c]/10 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsReferralModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-[#002e2c]/15 text-xs font-semibold text-[#002e2c] hover:bg-[#FAF6E7]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReferral}
                    className="flex-1 py-2.5 rounded-xl bg-[#002e2c] text-[#FAF6E7] text-xs font-semibold hover:bg-[#004744] disabled:opacity-50"
                  >
                    {isSubmittingReferral ? "Submitting..." : "Submit Referral"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Slide-over Log Inspector Drawer */}
      {isLogDrawerOpen && selectedLog && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsLogDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 max-w-xl w-full bg-white shadow-2xl flex flex-col z-10 border-l border-[#002e2c]/15">
            {/* Drawer Header */}
            <div className="p-6 border-b border-[#002e2c]/10 flex items-center justify-between bg-[#FAF6E7]/50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedLog.status === "success" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                    HTTP {selectedLog.statusCode}
                  </span>
                  <span className="font-mono text-xs text-[#002e2c] font-bold">{selectedLog.eventId}</span>
                </div>
                <p className="text-xs text-[#52706e] font-mono">{selectedLog.method} {selectedLog.url}</p>
              </div>
              <button
                onClick={() => setIsLogDrawerOpen(false)}
                className="p-2 rounded-xl text-[#52706e] hover:text-[#002e2c] hover:bg-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {/* Telemetry Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-[#FAF6E7]/60 border border-[#002e2c]/10">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#52706e] block">Latency</span>
                  <span className="font-mono font-bold text-[#002e2c]">{selectedLog.latencyMs}ms</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#52706e] block">Direction</span>
                  <span className="font-semibold text-[#005b57] capitalize">{selectedLog.direction}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#52706e] block">Trace ID</span>
                  <span className="font-mono text-[10px] text-[#52706e] truncate block">{selectedLog.traceId || "—"}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#52706e] block">Request ID</span>
                  <span className="font-mono text-[10px] text-[#52706e] truncate block">{selectedLog.requestId || "—"}</span>
                </div>
              </div>

              {/* Request Payload */}
              <div className="space-y-2">
                <div className="flex items-center justify-between font-semibold text-[#002e2c]">
                  <span>Request Payload (JSON)</span>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(selectedLog.requestPayload, null, 2), "Request payload")}
                    className="text-[11px] text-[#005b57] hover:underline flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                </div>
                <div className="p-4 rounded-2xl bg-[#002e2c] text-[#FAF6E7] font-mono text-[11px] overflow-x-auto max-h-60 shadow-inner">
                  <pre>{JSON.stringify(selectedLog.requestPayload || {}, null, 2)}</pre>
                </div>
              </div>

              {/* Response Payload */}
              <div className="space-y-2">
                <div className="flex items-center justify-between font-semibold text-[#002e2c]">
                  <span>Response Payload (JSON)</span>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(selectedLog.responsePayload, null, 2), "Response payload")}
                    className="text-[11px] text-[#005b57] hover:underline flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                </div>
                <div className="p-4 rounded-2xl bg-[#002e2c] text-[#FAF6E7] font-mono text-[11px] overflow-x-auto max-h-60 shadow-inner">
                  <pre>{JSON.stringify(selectedLog.responsePayload || {}, null, 2)}</pre>
                </div>
              </div>

              {/* Error Details if any */}
              {selectedLog.errorMessage && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 space-y-1">
                  <span className="font-bold text-[11px] uppercase tracking-wider block">Error Message</span>
                  <p className="font-mono text-xs">{selectedLog.errorMessage}</p>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-[#002e2c]/10 bg-[#FAF6E7]/30 flex items-center justify-between gap-3">
              <span className="text-[11px] text-[#52706e] font-mono">
                {new Date(selectedLog.occurredAt).toLocaleString()}
              </span>
              {selectedLog.direction === "outbound" && (
                <button
                  onClick={() => handleResendWebhook(selectedLog)}
                  className="px-4 py-2 rounded-xl bg-[#002e2c] hover:bg-[#004744] text-[#FAF6E7] text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Resend Webhook</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generate New API Key Modal */}
      {isNewKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#002e2c]/15 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#002e2c]">Generate New API Key</h3>
                <p className="text-xs text-[#52706e]">Provision a dedicated secret key for your backend systems.</p>
              </div>
              <button
                onClick={() => setIsNewKeyModalOpen(false)}
                className="p-2 text-[#52706e] hover:text-[#002e2c] rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {freshlyGeneratedKey ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                    <CheckCircle className="w-4 h-4" />
                    <span>API Key Generated Successfully!</span>
                  </div>
                  <p className="text-xs text-emerald-900/90 leading-relaxed">
                    Please copy this secret key now. For your security, you will not be able to view the full key again.
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="text"
                      readOnly
                      value={freshlyGeneratedKey.key}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-emerald-300 font-mono text-xs text-[#002e2c] select-all"
                    />
                    <button
                      onClick={() => copyToClipboard(freshlyGeneratedKey.key, "New API Key")}
                      className="p-2.5 rounded-xl bg-[#002e2c] text-[#FAF6E7] hover:bg-[#004744] transition shrink-0 shadow-xs"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setFreshlyGeneratedKey(null);
                    setIsNewKeyModalOpen(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#002e2c] text-[#FAF6E7] font-semibold text-xs hover:bg-[#004744] transition shadow-xs"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateNewKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                    Key Name / Description
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Staging Server, EMR Webhook Worker"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7] border border-[#002e2c]/15 text-[#002e2c] text-xs focus:outline-none focus:ring-2 focus:ring-[#002e2c]/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#52706e] mb-1.5">
                    Target Environment
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setEnvironment("sandbox")}
                      className={`p-3 rounded-xl border text-xs font-semibold text-left transition ${
                        environment === "sandbox"
                          ? "border-amber-500 bg-amber-50 text-amber-900"
                          : "border-[#002e2c]/10 hover:border-[#002e2c]/20"
                      }`}
                    >
                      <span className="block font-bold">Sandbox</span>
                      <span className="text-[11px] text-[#52706e]">Test credentials (sk_test_...)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnvironment("live")}
                      className={`p-3 rounded-xl border text-xs font-semibold text-left transition ${
                        environment === "live"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                          : "border-[#002e2c]/10 hover:border-[#002e2c]/20"
                      }`}
                    >
                      <span className="block font-bold">Production</span>
                      <span className="text-[11px] text-[#52706e]">Live credentials (sk_live_...)</span>
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#002e2c]/10 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsNewKeyModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-[#002e2c]/15 text-xs font-semibold text-[#002e2c] hover:bg-[#FAF6E7]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isGeneratingKey}
                    className="flex-1 py-2.5 rounded-xl bg-[#002e2c] text-[#FAF6E7] text-xs font-semibold hover:bg-[#004744] disabled:opacity-50 transition shadow-xs"
                  >
                    {isGeneratingKey ? "Generating..." : "Generate Key"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
