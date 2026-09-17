"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

export default function AdminPartnershipsPage() {
  const [activeTab, setActiveTab] = useState<"applications" | "inquiries">("applications");

  // Inquiries data & mutations
  const inquiries = useQuery(api.adminPartnerships.getPartnershipInquiries);
  const updateStatus = useMutation(api.adminPartnerships.updatePartnershipInquiryStatus);

  // Partner portal applications data & mutations
  const partnerApplications = useQuery(api.adminPartnerships.getPartnerApplications, {});
  const reviewApplication = useMutation(api.adminPartnerships.reviewPartnerApplication);

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
  const pendingCount = (partnerApplications || []).filter((p) => p.approvalStatus === "pending").length;

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

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Partner Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review partner portal registrations, grant API access, and manage partnership inquiries.
          </p>
        </div>

        {/* Search & Filter */}
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
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-4">
          <button
            onClick={() => {
              setActiveTab("applications");
              setStatusFilter("all");
            }}
            className={`py-3 px-3 border-b-2 font-medium text-sm transition flex items-center gap-2 ${
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
            className={`py-3 px-3 border-b-2 font-medium text-sm transition flex items-center gap-2 ${
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
            filteredApplications.map((partner) => (
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
            filteredInquiries.map((inquiry) => (
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
    </div>
  );
}
