"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { format } from "date-fns";
import { Building2, Mail, Phone, ExternalLink, Activity, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

export default function AdminPartnershipsPage() {
  const inquiries = useQuery(api.adminPartnerships.getPartnershipInquiries);
  const updateStatus = useMutation(api.adminPartnerships.updatePartnershipInquiryStatus);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  if (inquiries === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent"></div>
      </div>
    );
  }

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

  const filteredInquiries = inquiries.filter((inquiry: any) => {
    const matchesSearch =
      inquiry.organizationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inquiry.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inquiry.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || inquiry.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Partnership Inquiries</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage and respond to institutions interested in joining RehabifyHealth.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search inquiries..."
              className="pl-9 w-full sm:w-[250px]"
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
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6">
        {filteredInquiries.length === 0 ? (
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
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col md:flex-row"
            >
              <div className="p-6 flex-1 border-b md:border-b-0 md:border-r border-gray-200">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">{inquiry.organizationName}</h3>
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                        {inquiry.organizationType}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Submitted on {format(inquiry._creationTime, "MMM d, yyyy 'at' h:mm a")}
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
                      <p className="text-sm text-gray-900 font-medium">{inquiry.contactName}</p>
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
                      <p className="text-xs font-medium text-gray-500">Phone & Size</p>
                      <a
                        href={`tel:${inquiry.phone}`}
                        className="text-sm text-teal-600 hover:text-teal-700 hover:underline flex items-center gap-1 font-medium"
                      >
                        {inquiry.phone} <ExternalLink className="h-3 w-3" />
                      </a>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {inquiry.employeeCount} expected patients/staff
                      </p>
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
    </div>
  );
}
