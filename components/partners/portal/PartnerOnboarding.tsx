"use client";

/**
 * Partner Portal onboarding screens: sign-in gateway, multi-step application,
 * pending review and declined states. Extracted unchanged from the original portal page
 * (except: a failed logo upload no longer submits a temporary blob: URL).
 */
import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { useMutation } from "convex/react";
import { UserButton, useUser } from "@clerk/nextjs";
import { authRoutes } from "@/components/auth/authConfig";
import { BookDemoDialog } from "@/components/partners/BookDemoDialog";
import { DoctorPendingScreen, DoctorRejectedScreen } from "@/components/partners/doctor/DoctorStatusScreens";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Globe,
  Loader2,
  Lock,
  MapPin,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
  UploadCloud,
  Users,
  X,
} from "@/components/icons";

type PartnerSummaryLite = {
  name?: string;
  type?: string;
  code?: string;
  contactEmail?: string;
  logoUrl?: string | null;
} | null | undefined;

const noSubscribe = () => () => undefined;

/** Signed-out visitors. */
export function PartnerGateway() {
    // Partner sign-in/up pages return to /partners/portal. On partners.* they live at
    // /sign-in and /sign-up, since the middleware rewrites every other path to the portal.
    const partnersHost = useSyncExternalStore(
      noSubscribe,
      () => window.location.hostname.toLowerCase().startsWith("partners."),
      () => false,
    );
    const authLinks = authRoutes("partner", partnersHost);
    const [demoOpen, setDemoOpen] = useState(false);
    return (
      <div className="min-h-screen py-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto flex flex-col items-center justify-center font-sans antialiased">
        {/* Apple-style floating hero card */}
        <div className="w-full bg-white/85 backdrop-blur-xl rounded-[32px] border border-rh-ink/10 p-8 sm:p-12 shadow-sm text-center flex flex-col items-center space-y-6">
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

          <div className="space-y-3 max-w-2xl">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-rh-ink leading-tight">
              The Rehabilitation Operating System for Healthcare Leaders
            </h1>
            <p className="text-base text-rh-ink/70 leading-relaxed max-w-xl mx-auto">
              Connect your HMO, hospital, clinic, or corporate wellness plan. Dispatch verified MRTBN physiotherapists, track patient recovery milestones in real time, and automate commercial settlements.
            </p>
          </div>

          {/* Primary Authentication Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 w-full max-w-md pt-2">
            <Link
              href={authLinks.signIn}
              className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-rh-ink text-[#FAF6E7] font-semibold text-sm hover:bg-black active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4 text-rh-lime" />
              <span>Sign In to Portal</span>
            </Link>

            <Link
              href={authLinks.signUp}
              className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-[#FAF6E7]/80 hover:bg-[#FAF6E7] text-rh-ink border border-rh-ink/15 font-semibold text-sm active:scale-[0.98] transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Building2 className="w-4 h-4 text-rh-ink" />
              <span>Apply for Partner Access</span>
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setDemoOpen(true)}
            className="text-sm font-semibold text-rh-ink underline-offset-4 hover:underline"
          >
            Not ready yet? Book a demo
          </button>
        </div>
        <BookDemoDialog open={demoOpen} onOpenChange={setDemoOpen} />

        {/* Feature pillars: solid white cards and 15px ink text so they read as well on desktop as on phones */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-8">
          {[
            {
              icon: Users,
              title: "Direct Clinical Referrals",
              body: "Seamlessly triage members to MRTBN-verified physiotherapists for in-home visits or virtual rehabilitation.",
            },
            {
              icon: Terminal,
              title: "REST API & Webhooks",
              body: "Real-time programmatic updates when patients attend sessions, complete assessments, or get discharged.",
            },
            {
              icon: CreditCard,
              title: "Automated Settlements",
              body: "Transparent commission ledgers and revenue sharing statements with downloadable CSV accounting exports.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="p-6 sm:p-7 rounded-2xl bg-white border border-rh-ink/10 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rh-canvas flex items-center justify-center text-rh-ink">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold leading-snug text-rh-ink">{title}</h3>
              <p className="text-[15px] font-medium leading-relaxed text-rh-ink/75">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center text-xs text-rh-ink/70">
          MRTBN-licensed physiotherapists · <Link href="/privacy-policy" className="font-semibold text-rh-ink underline-offset-4 hover:underline">How we protect patient data</Link>
        </div>
      </div>
    );
}

/** Signed in, no organisation yet: the multi-step partner application. */
export function PartnerApplicationForm() {
  const { user } = useUser();
  const applyForPartnerMutation = useMutation(api.partners.applyForPartner);
  const generateUploadUrlMutation = useMutation(api.files.generateUploadUrl);

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

  // Mapbox Operating States Search
  const [stateSearchQuery, setStateSearchQuery] = useState("");
  const [stateSearchResults, setStateSearchResults] = useState<Array<{ id: string; place_name: string; text: string }>>([]); 
  const [isSearchingStates, setIsSearchingStates] = useState(false);
  const [showStateResults, setShowStateResults] = useState(false);
  const stateSearchTimeout = useRef<NodeJS.Timeout | null>(null);
  const stateSearchControllerRef = useRef<AbortController | null>(null);
  const stateSearchContainerRef = useRef<HTMLDivElement>(null);
  const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

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
      setLogoFile(null);
      setLogoPreviewUrl(null);
      setLogoStorageId(null);
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

  // Mapbox-powered state search (must be declared before any conditional returns per Rules of Hooks)
  const searchStates = useCallback(async (q: string) => {
    if (q.length < 2 || !MAPBOX_TOKEN) {
      setStateSearchResults([]);
      return;
    }
    if (stateSearchControllerRef.current) {
      stateSearchControllerRef.current.abort();
    }
    stateSearchControllerRef.current = new AbortController();
    setIsSearchingStates(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&country=NG&limit=6&types=region,place`,
        { signal: stateSearchControllerRef.current.signal }
      );
      if (!res.ok) throw new Error(`Mapbox error: ${res.status}`);
      const data = await res.json();
      if (data.features) {
        // Filter out already-selected states
        const filtered = data.features.filter(
          (f: any) => !onboardingForm.coverageStates.includes(f.text)
        );
        setStateSearchResults(filtered);
        setShowStateResults(true);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") console.error("State search failed:", err);
    } finally {
      setIsSearchingStates(false);
    }
  }, [MAPBOX_TOKEN, onboardingForm.coverageStates]);

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

    const availableCareModes = [
      { id: "face_to_face", label: "In-Clinic Care", desc: "Patient visits vetted physical therapy clinic" },
      { id: "home_visit", label: "Home Visit Physio", desc: "Physiotherapist dispatches to patient residence" },
      { id: "remote", label: "Tele-Rehabilitation", desc: "Remote video consultations and exercise monitoring" },
    ];

    // searchStates useCallback is declared at the top level of the component (before conditional returns)

    const handleStateSearchChange = (val: string) => {
      setStateSearchQuery(val);
      if (stateSearchTimeout.current) clearTimeout(stateSearchTimeout.current);
      stateSearchTimeout.current = setTimeout(() => searchStates(val), 350);
    };

    const addStateFromSearch = (stateName: string) => {
      if (!onboardingForm.coverageStates.includes(stateName)) {
        setOnboardingForm((prev) => ({
          ...prev,
          coverageStates: [...prev.coverageStates, stateName],
        }));
      }
      setStateSearchQuery("");
      setStateSearchResults([]);
      setShowStateResults(false);
    };

    const removeState = (stateName: string) => {
      setOnboardingForm((prev) => ({
        ...prev,
        coverageStates: prev.coverageStates.filter((s) => s !== stateName),
      }));
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
      <div className="min-h-screen bg-rh-canvas py-8 sm:py-12 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header Bar */}
          <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-rh-ink/10 p-4 sm:p-5 flex items-center justify-between shadow-xs">
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
              <div className="h-5 w-px bg-rh-ink/15" />
              <h1 className="text-sm sm:text-base font-semibold text-rh-ink leading-tight">
                Partner Organization Onboarding
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-rh-ink/70 hidden sm:inline">
                {user?.primaryEmailAddress?.emailAddress}
              </span>
              <UserButton afterSignOutUrl="/partners/portal" />
            </div>
          </div>

          {/* Stepper Card */}
          <div className="bg-white rounded-3xl border border-rh-ink/10 p-6 sm:p-8 shadow-sm space-y-8">
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
                          ? "bg-[#0b1312]/5 border border-[#0b1312]/15"
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
                              ? "bg-[#0b1312] text-[#FAF6E7]"
                              : "bg-[#0b1312]/10 text-rh-ink/70"
                          }`}
                        >
                          {isDone ? <Check className="w-3 h-3" /> : s.step}
                        </span>
                        <span className="font-semibold text-[11px] sm:text-xs text-rh-ink truncate">
                          {s.title}
                        </span>
                      </div>
                      <p className="text-[10px] text-rh-ink/70 truncate pl-7 hidden sm:block">
                        {s.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Progress Line */}
              <div className="w-full bg-rh-ink/10 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-rh-ink h-full transition-all duration-300 rounded-full"
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
                <div className="border-b border-rh-ink/10 pb-4">
                  <h2 className="text-lg font-bold text-rh-ink">Organization Profile</h2>
                  <p className="text-xs text-rh-ink/70 mt-1">
                    Provide your company's registered name and operational category.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-rh-ink/70 mb-2">
                      Legal Organization Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Reliance HMO, Lagoon Hospitals, Leadway Health"
                      value={onboardingForm.name}
                      onChange={(e) => setOnboardingForm({ ...onboardingForm, name: e.target.value })}
                      className="w-full px-4 py-3.5 rounded-xl bg-[#FAF6E7]/40 border border-rh-ink/15 text-rh-ink text-sm focus:outline-none focus:ring-2 focus:ring-rh-ink/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-rh-ink/70 mb-2">
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
                                ? "border-[#0b1312] bg-rh-ink/5 shadow-xs"
                                : "border-[#0b1312]/15 bg-white hover:border-rh-ink/30 hover:bg-[#FAF6E7]/20"
                            }`}
                          >
                            <div>
                              <div className="text-xs font-semibold text-rh-ink">{item.label}</div>
                              <div className="text-[11px] text-rh-ink/70 mt-0.5">{item.desc}</div>
                            </div>
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                isSelected
                                  ? "border-[#0b1312] bg-rh-ink text-white"
                                  : "border-[#0b1312]/30"
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
                    <label className="block text-xs font-semibold uppercase tracking-wider text-rh-ink/70 mb-2">
                      Official Website (Optional)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-rh-ink/70">
                        <Globe className="w-4 h-4" />
                      </div>
                      <input
                        type="url"
                        placeholder="https://yourcompany.com"
                        value={onboardingForm.website}
                        onChange={(e) => setOnboardingForm({ ...onboardingForm, website: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FAF6E7]/40 border border-rh-ink/15 text-rh-ink text-sm focus:outline-none focus:ring-2 focus:ring-rh-ink/20"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-rh-ink/10 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (!onboardingForm.name.trim()) {
                        toast.error("Please provide your organization name");
                        return;
                      }
                      setOnboardingStep(2);
                    }}
                    className="px-6 py-3 rounded-xl bg-rh-ink text-[#FAF6E7] font-semibold text-sm hover:bg-black transition-all flex items-center gap-2 shadow-xs"
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
                <div className="border-b border-rh-ink/10 pb-4">
                  <h2 className="text-lg font-bold text-rh-ink">Brand Identity & Logo Upload</h2>
                  <p className="text-xs text-rh-ink/70 mt-1">
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
                  <label className="block text-xs font-semibold uppercase tracking-wider text-rh-ink/70">
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
                          ? "border-[#0b1312] bg-rh-ink/5 scale-[1.01]"
                          : "border-[#0b1312]/25 bg-[#FAF6E7]/30 hover:border-rh-ink/50 hover:bg-[#FAF6E7]/60"
                      }`}
                    >
                      <div className="w-14 h-14 rounded-2xl bg-white border border-rh-ink/10 text-rh-ink flex items-center justify-center mx-auto mb-3 shadow-xs">
                        {isUploadingLogo ? (
                          <div className="w-6 h-6 rounded-full border-2 border-rh-ink border-t-transparent animate-spin" />
                        ) : (
                          <UploadCloud className="w-7 h-7 text-rh-ink" />
                        )}
                      </div>
                      <p className="text-sm font-semibold text-rh-ink">
                        {isUploadingLogo ? "Uploading to Secure Storage..." : "Click to upload logo or drag and drop"}
                      </p>
                      <p className="text-xs text-rh-ink/70 mt-1">
                        High-resolution PNG, JPG, SVG, or WebP (max 5MB)
                      </p>
                      <p className="text-[11px] text-rh-ink/55 mt-2">
                        Transparent backgrounds look best on light co-branded pages
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-white border border-rh-ink/10 shadow-xs overflow-hidden">
                      {/* Centered logo display */}
                      <div className="p-6 flex flex-col items-center text-center">
                        <div className="w-28 h-28 rounded-2xl bg-[#FAF6E7]/60 border border-rh-ink/10 p-3 flex items-center justify-center shadow-xs">
                          <img
                            src={logoPreviewUrl}
                            alt="Uploaded Logo"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            {logoStorageId ? "Vault Encrypted" : "Uploaded"}
                          </span>
                        </div>
                        <p className="text-xs text-rh-ink/70 mt-1.5">
                          {logoFile?.name || "company_logo.png"}
                          {logoFile && ` · ${(logoFile.size / 1024).toFixed(1)} KB`}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="border-t border-rh-ink/8 px-6 py-3 flex items-center justify-center gap-3 bg-[#FAF6E7]/30">
                        <button
                          type="button"
                          onClick={() => logoFileInputRef.current?.click()}
                          className="px-4 py-2 rounded-xl border border-rh-ink/20 bg-white text-xs font-semibold text-rh-ink hover:bg-[#FAF6E7] transition-all"
                        >
                          Change Logo
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-all flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Co-Branding Preview — Clean, logo-focused */}
                <div className="rounded-2xl border border-rh-ink/10 bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-rh-ink/8 bg-[#FAF6E7]/40">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rh-ink/70">
                      Co-Branded Referral Preview
                    </span>
                  </div>

                  <div className="p-6 flex flex-col items-center text-center space-y-4">
                    {/* Two logos side by side — the hero of this section */}
                    <div className="flex items-center justify-center gap-4 sm:gap-6 w-full">
                      {/* Partner logo */}
                      <div className="flex-1 max-w-[140px] h-16 sm:h-20 rounded-xl bg-[#FAF6E7]/60 border border-rh-ink/8 p-3 flex items-center justify-center">
                        {logoPreviewUrl ? (
                          <img
                            src={logoPreviewUrl}
                            alt="Partner Logo"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-[11px] font-bold text-rh-ink/40 uppercase">
                            {onboardingForm.name || "Your Logo"}
                          </span>
                        )}
                      </div>

                      {/* Divider */}
                      <span className="text-lg font-light text-rh-ink/25">×</span>

                      {/* Rehabify logo */}
                      <div className="flex-1 max-w-[140px] h-16 sm:h-20 rounded-xl bg-[#FAF6E7]/60 border border-rh-ink/8 p-3 flex items-center justify-center">
                        <NextImage
                          src="/logos/MainRehabify.svg"
                          alt="Rehabify"
                          width={110}
                          height={28}
                          className="max-h-full w-auto object-contain"
                        />
                      </div>
                    </div>

                    {/* Verified badge */}
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rh-ink bg-rh-lime/8 px-3 py-1 rounded-full">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Verified Partner
                    </span>

                    <p className="text-xs text-rh-ink/70 max-w-xs">
                      This is how your brand will appear alongside Rehabify on patient referral pages.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-rh-ink/10 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(1)}
                    className="px-5 py-2.5 rounded-xl border border-rh-ink/20 text-xs font-semibold text-rh-ink hover:bg-[#FAF6E7] transition-all flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(3)}
                    className="px-6 py-3 rounded-xl bg-rh-ink text-[#FAF6E7] font-semibold text-sm hover:bg-black transition-all flex items-center gap-2 shadow-xs"
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
                <div className="border-b border-rh-ink/10 pb-4">
                  <h2 className="text-lg font-bold text-rh-ink">Liaison & Operational Coverage</h2>
                  <p className="text-xs text-rh-ink/70 mt-1">
                    Specify your partnership representative and geographic operating areas for physical therapy dispatch.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-rh-ink/70 mb-2">
                        Partnership Liaison Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Dr. Kemi Balogun / Tunde Adeleke"
                        value={onboardingForm.contactName}
                        onChange={(e) => setOnboardingForm({ ...onboardingForm, contactName: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7]/40 border border-rh-ink/15 text-rh-ink text-sm focus:outline-none focus:ring-2 focus:ring-rh-ink/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-rh-ink/70 mb-2">
                        Official Contact Phone
                      </label>
                      <input
                        type="tel"
                        placeholder="+234 800 000 0000"
                        value={onboardingForm.contactPhone}
                        onChange={(e) => setOnboardingForm({ ...onboardingForm, contactPhone: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7]/40 border border-rh-ink/15 text-rh-ink text-sm focus:outline-none focus:ring-2 focus:ring-rh-ink/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-rh-ink/70 mb-2">
                      Official Contact Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="partnerships@yourorganization.com"
                      value={onboardingForm.contactEmail}
                      onChange={(e) => setOnboardingForm({ ...onboardingForm, contactEmail: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7]/40 border border-rh-ink/15 text-rh-ink text-sm focus:outline-none focus:ring-2 focus:ring-rh-ink/20"
                    />
                    <p className="text-[11px] text-rh-ink/70 mt-1">
                      Administrative notifications, API credentials, and commission reports will be dispatched to this email.
                    </p>
                  </div>

                  {/* Operating States — Mapbox Search */}
                  <div ref={stateSearchContainerRef}>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-rh-ink/70 mb-2">
                      Operating States
                    </label>

                    {/* Selected states as removable chips */}
                    {onboardingForm.coverageStates.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {onboardingForm.coverageStates.map((st) => (
                          <span
                            key={st}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rh-ink text-[#FAF6E7] text-xs font-medium shadow-xs"
                          >
                            <MapPin className="w-3 h-3 text-rh-lime" />
                            <span>{st}</span>
                            <button
                              type="button"
                              onClick={() => removeState(st)}
                              className="ml-0.5 hover:text-rose-300 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Search input */}
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        {isSearchingStates ? (
                          <Loader2 className="w-4 h-4 text-rh-ink animate-spin" />
                        ) : (
                          <Search className="w-4 h-4 text-rh-ink/70" />
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Search Nigerian states or cities..."
                        value={stateSearchQuery}
                        onChange={(e) => handleStateSearchChange(e.target.value)}
                        onFocus={() => stateSearchResults.length > 0 && setShowStateResults(true)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FAF6E7]/40 border border-rh-ink/15 text-rh-ink text-sm focus:outline-none focus:ring-2 focus:ring-rh-ink/20"
                      />

                      {/* Dropdown results */}
                      {showStateResults && stateSearchResults.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-rh-ink/15 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                          {stateSearchResults.map((result) => (
                            <button
                              key={result.id}
                              type="button"
                              onClick={() => addStateFromSearch(result.text)}
                              className="w-full text-left px-4 py-3 hover:bg-[#FAF6E7]/60 flex items-start gap-3 transition-colors border-b border-rh-ink/5 last:border-0"
                            >
                              <MapPin className="h-4 w-4 text-rh-ink mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="text-sm font-medium text-rh-ink">{result.text}</span>
                                <span className="block text-[11px] text-rh-ink/70 mt-0.5">{result.place_name}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] text-rh-ink/70 mt-1.5">
                      Type to search and select your operating states across Nigeria.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-rh-ink/70 mb-2">
                      Operating Cities / Districts
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ikeja, Lekki, Victoria Island, Maitama, Wuse II"
                      value={onboardingForm.coverageCities}
                      onChange={(e) => setOnboardingForm({ ...onboardingForm, coverageCities: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#FAF6E7]/40 border border-rh-ink/15 text-rh-ink text-sm focus:outline-none focus:ring-2 focus:ring-rh-ink/20"
                    />
                  </div>

                  {/* Care Modes */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-rh-ink/70 mb-2">
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
                                ? "border-[#0b1312] bg-rh-ink/5 shadow-xs"
                                : "border-[#0b1312]/15 bg-white hover:border-[#0b1312]/30"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-rh-ink">{cm.label}</span>
                              <div
                                className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                                  isSelected
                                    ? "bg-[#0b1312] border-rh-ink text-white"
                                    : "border-[#0b1312]/30"
                                }`}
                              >
                                {isSelected && <Check className="w-2.5 h-2.5" />}
                              </div>
                            </div>
                            <span className="text-[10px] text-rh-ink/70 leading-snug">{cm.desc}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-rh-ink/10 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(2)}
                    className="px-5 py-2.5 rounded-xl border border-rh-ink/20 text-xs font-semibold text-rh-ink hover:bg-[#FAF6E7] transition-all flex items-center gap-1.5"
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
                    className="px-6 py-3 rounded-xl bg-rh-ink text-[#FAF6E7] font-semibold text-sm hover:bg-black transition-all flex items-center gap-2 shadow-xs"
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
                <div className="border-b border-rh-ink/10 pb-4">
                  <h2 className="text-lg font-bold text-rh-ink">Review Application Dossier</h2>
                  <p className="text-xs text-rh-ink/70 mt-1">
                    Confirm your organization profile before submitting for Rehabify administrative verification.
                  </p>
                </div>

                {/* Dossier Card */}
                <div className="rounded-2xl border border-rh-ink/15 bg-[#FAF6E7]/50 p-5 space-y-4">
                  <div className="flex items-start justify-between pb-4 border-b border-rh-ink/10">
                    <div className="flex items-center gap-3">
                      {logoPreviewUrl ? (
                        <div className="w-14 h-14 rounded-xl bg-white border border-rh-ink/15 p-1.5 flex items-center justify-center shrink-0 shadow-xs">
                          <img
                            src={logoPreviewUrl}
                            alt="Logo"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-rh-ink/10 flex items-center justify-center text-rh-ink font-bold text-base shrink-0">
                          {onboardingForm.name ? onboardingForm.name.slice(0, 2).toUpperCase() : "PT"}
                        </div>
                      )}
                      <div>
                        <h3 className="text-base font-bold text-rh-ink">
                          {onboardingForm.name || "Untitled Organization"}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rh-ink text-[#FAF6E7]">
                            {partnerTypeLabels[onboardingForm.type]?.label || onboardingForm.type}
                          </span>
                          {onboardingForm.website && (
                            <span className="text-xs text-rh-ink/70 flex items-center gap-1">
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
                      className="text-xs text-rh-ink font-semibold hover:underline"
                    >
                      Edit
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rh-ink/70 block mb-1">
                        Liaison & Contact
                      </span>
                      <p className="font-semibold text-rh-ink">
                        {onboardingForm.contactName || "Official Representative"}
                      </p>
                      <p className="text-rh-ink/70">{onboardingForm.contactEmail}</p>
                      {onboardingForm.contactPhone && (
                        <p className="text-rh-ink/70">{onboardingForm.contactPhone}</p>
                      )}
                    </div>

                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rh-ink/70 block mb-1">
                        Coverage & Care Modes
                      </span>
                      <p className="font-semibold text-rh-ink">
                        {onboardingForm.coverageStates.length > 0 ? onboardingForm.coverageStates.join(", ") : "Nationwide"}
                      </p>
                      <p className="text-rh-ink/70 text-[11px]">
                        Cities: {onboardingForm.coverageCities || "All metro centers"}
                      </p>
                      <p className="text-rh-ink/70 text-[11px] mt-0.5">
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
                      className="mt-0.5 rounded text-rh-ink focus:ring-rh-ink"
                    />
                    <span className="text-xs text-emerald-950 leading-relaxed">
                      I confirm that I am authorized to register this organization and agree to Rehabify's Healthcare Partnership Terms and NDPR Patient Data Privacy Standards.
                    </span>
                  </label>
                </div>

                <div className="pt-4 border-t border-rh-ink/10 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(3)}
                    className="px-5 py-2.5 rounded-xl border border-rh-ink/20 text-xs font-semibold text-rh-ink hover:bg-[#FAF6E7] transition-all flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingApplication || !termsAgreed}
                    onClick={() => handleApplyForPartner()}
                    className="px-7 py-3.5 rounded-xl bg-rh-ink text-[#FAF6E7] font-semibold text-sm hover:bg-black transition-all flex items-center gap-2 shadow-md disabled:opacity-50"
                  >
                    {isSubmittingApplication ? (
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-rh-lime" />
                    )}
                    <span>Submit Application for Admin Review</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="text-center text-xs text-rh-ink/70">
            MRTBN-licensed physiotherapists · <Link href="/privacy-policy" className="font-semibold text-rh-ink underline-offset-4 hover:underline">How we protect patient data</Link>
          </div>
        </div>
      </div>
    );
}

/** Application submitted, awaiting Rehabify review. */
export function PartnerPendingScreen({ partner }: { partner: PartnerSummaryLite }) {
  const pendingPartner = partner;
  if (pendingPartner?.type === "doctor") return <DoctorPendingScreen name={pendingPartner.name} email={pendingPartner.contactEmail} />;
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 sm:px-6">
        <div className="bg-white rounded-3xl border border-rh-ink/10 p-8 sm:p-10 shadow-sm text-center space-y-6">
          <div className="flex items-center justify-between border-b border-rh-ink/10 pb-4">
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
            <h1 className="text-2xl font-bold text-rh-ink tracking-tight">
              {pendingPartner?.name || "Your Organization"}
            </h1>
            <p className="text-sm text-rh-ink/70 max-w-md mx-auto leading-relaxed">
              Your partner registration is being reviewed by the Rehabify Health Clinical and Compliance team. Once approved you get sandbox access straight away — test API keys, webhooks and referral links — and can request production (live) access when your integration is ready.
            </p>
          </div>

          {/* Company branding summary */}
          <div className="p-4 rounded-2xl bg-[#FAF6E7]/80 border border-rh-ink/10 text-left space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-rh-ink/70 font-medium">Organization Type</span>
              <span className="font-semibold text-rh-ink uppercase">{pendingPartner?.type}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-rh-ink/70 font-medium">Contact Email</span>
              <span className="font-semibold text-rh-ink">{pendingPartner?.contactEmail}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-rh-ink/70 font-medium">Assigned Partner Code</span>
              <span className="font-mono font-semibold text-rh-ink">{pendingPartner?.code}</span>
            </div>
            {pendingPartner?.logoUrl && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-rh-ink/70 font-medium">Uploaded Logo</span>
                <img
                  src={pendingPartner.logoUrl}
                  alt={pendingPartner.name}
                  className="h-6 max-w-[120px] object-contain"
                />
              </div>
            )}
          </div>

          <div className="text-xs text-rh-ink/70 pt-2">
            Questions regarding your review status? Contact our clinical team at{" "}
            <a href="mailto:partners@physioaroundme.com" className="text-rh-ink font-semibold underline">
              partners@physioaroundme.com
            </a>
          </div>
        </div>
      </div>
    );
}

/** Application declined. */
export function PartnerRejectedScreen({ rejectionReason, partnerType }: { rejectionReason?: string | null; partnerType?: string | null }) {
  if (partnerType === "doctor") return <DoctorRejectedScreen reason={rejectionReason} />;
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-red-200 p-8 text-center space-y-5 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-rh-ink">Application Not Approved</h2>
          <p className="text-sm text-rh-ink/70">
            {rejectionReason || "Your partner registration could not be verified according to our clinical onboarding guidelines."}
          </p>
          <div className="pt-2">
            <UserButton afterSignOutUrl="/partners/portal" />
          </div>
        </div>
      </div>
    );
}
