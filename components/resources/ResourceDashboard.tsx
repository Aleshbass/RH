"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Using simple HTML table structure
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  Calendar,
  MapPin,
  Users,
  Wrench,
  Car,
  Building,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { useResourceManagement, resourceUtils, type CreateResourceParams } from "@/hooks/useResourceManagement";
import { ResourceManagementModal } from "./ResourceManagementModal";
import { Id } from "@/convex/_generated/dataModel";

interface ResourceDashboardProps {
  clinicId: Id<"clinics">;
}

export function ResourceDashboard({ clinicId }: ResourceDashboardProps) {
  const { fetchResources, deleteResource } = useResourceManagement();
  
  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<Id<"resources"> | null>(null);
  const [deletingResourceId, setDeleteingResourceId] = useState<Id<"resources"> | null>(null);

  // Fetch resources
  type ResourceType = "equipment" | "room" | "staff" | "vehicle";
interface Resource extends Omit<CreateResourceParams, "clinicId"> {
  _id: Id<"resources">;
  isActive?: boolean;
}
const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  // Load resources
  React.useEffect(() => {
    const loadResources = async () => {
      try {
        setLoading(true);
        const data = await fetchResources({
          clinicId,
          type: typeFilter !== "all" ? (typeFilter as ResourceType) : undefined,
          isActive: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
        });
        setResources(data || []);
      } catch (error) {
        console.error("Failed to load resources:", error);
        setResources([]);
      } finally {
        setLoading(false);
      }
    };
    loadResources();
  }, [clinicId, typeFilter, statusFilter, fetchResources]);

  // Filter resources by search term
  const filteredResources = resources.filter((resource: Resource) =>
    resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    resource.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    resource.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    resource.location?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get resource type icon
  const getResourceIcon = (type: string) => {
    switch (type) {
      case "equipment":
        return <Stethoscope className="h-4 w-4" />;
      case "room":
        return <Building className="h-4 w-4" />;
      case "staff":
        return <Users className="h-4 w-4" />;
      case "vehicle":
        return <Car className="h-4 w-4" />;
      default:
        return <Building className="h-4 w-4" />;
    }
  };

  // Get status badge
  const getStatusBadge = (resource: Resource) => {
    const status = resourceUtils.getResourceStatus(resource);
    const colorMap: Record<string, string> = {
      green: "bg-green-100 text-green-800",
      yellow: "bg-yellow-100 text-yellow-800",
      red: "bg-red-100 text-red-800",
      gray: "bg-gray-100 text-gray-800",
    };

    return (
      <Badge className={colorMap[status.color] || colorMap.gray}>
        {status.status}
      </Badge>
    );
  };

  // Handle delete resource
  const handleDeleteResource = async (resourceId: Id<"resources">) => {
    try {
      await deleteResource(resourceId);
      toast.success("Resource deleted successfully!");
      setDeleteingResourceId(null);
      // Reload resources after deletion
      const data = await fetchResources({
        clinicId,
        type: typeFilter !== "all" ? (typeFilter as ResourceType) : undefined,
        isActive: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
      });
      setResources(data || []);
    } catch (error) {
      console.error("Failed to delete resource:", error);
      toast.error("Failed to delete resource. It may have active bookings.");
    }
  };

  // Resource type statistics
  const resourceStats = resources.reduce((acc: Record<string, number>, resource: Resource) => {
    acc[resource.type] = (acc[resource.type] || 0) + 1;
    acc.total = (acc.total || 0) + 1;
    if (resource.isActive) {
      acc.active = (acc.active || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Resource Management</h2>
          <p className="text-gray-600">
            Manage equipment, rooms, staff, and vehicles for your clinic
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Resource
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Resources</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resourceStats.total || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Equipment</CardTitle>
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resourceStats.equipment || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rooms</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resourceStats.room || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Staff</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resourceStats.staff || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <div className="h-2 w-2 bg-green-500 rounded-full" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resourceStats.active || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search resources..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="equipment">Equipment</SelectItem>
                <SelectItem value="room">Room</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="vehicle">Vehicle</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Resources Table */}
      <Card>
        <CardHeader>
          <CardTitle>Resources ({filteredResources.length})</CardTitle>
          <CardDescription>
            Manage your clinic&apos;s resources and their availability
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading resources...</span>
            </div>
          ) : filteredResources.length === 0 ? (
            <div className="text-center py-12">
              <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No resources found</h3>
              <p className="text-gray-500 mb-4">
                {searchTerm || typeFilter !== "all" || statusFilter !== "all"
                  ? "No resources match your current filters. Try adjusting your search criteria."
                  : "Resources help you manage clinic equipment, rooms, staff, and vehicles."}
              </p>
              {(!searchTerm && typeFilter === "all" && statusFilter === "all") && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left max-w-md mx-auto">
                    <h4 className="font-medium text-blue-900 mb-2">Getting Started with Resources</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Add equipment (therapy devices, medical tools)</li>
                      <li>• Create rooms (treatment rooms, consultation areas)</li>
                      <li>• Manage staff (support personnel, specialists)</li>
                      <li>• Track vehicles (mobile units, transport)</li>
                    </ul>
                  </div>
                  <Button onClick={() => setIsCreateModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Resource
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resource</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capacity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Maintenance</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredResources.map((resource: Resource) => (
                    <tr key={resource._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {getResourceIcon(resource.type)}
                          <div>
                            <div className="font-medium">{resource.name}</div>
                            {resource.description && (
                              <div className="text-sm text-gray-500 truncate max-w-xs">
                                {resource.description}
                              </div>
                            )}
                            {resource.category && (
                              <Badge variant="outline" className="text-xs mt-1">
                                {resource.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="secondary">
                          {resourceUtils.formatResourceType(resource.type)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {resource.location ? (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-gray-400" />
                            <span className="text-sm">{resource.location}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(resource)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {resource.capacity ? (
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-gray-400" />
                            <span className="text-sm">{resource.capacity}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {resource.maintenanceSchedule ? (
                          <div className="flex items-center gap-1">
                            <Wrench className="h-3 w-3 text-gray-400" />
                            <span className="text-sm">
                              {resourceUtils.formatMaintenanceSchedule(resource.maintenanceSchedule)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditingResourceId(resource._id)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Calendar className="h-4 w-4 mr-2" />
                              View Schedule
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteingResourceId(resource._id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Resource Modal */}
      <ResourceManagementModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        clinicId={clinicId}
        mode="create"
      />

      {/* Edit Resource Modal */}
      {editingResourceId && (
        <ResourceManagementModal
          isOpen={true}
          onClose={() => setEditingResourceId(null)}
          clinicId={clinicId}
          resourceId={editingResourceId}
          mode="edit"
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingResourceId} onOpenChange={() => setDeleteingResourceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resource</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this resource? This action cannot be undone.
              Resources with active bookings cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingResourceId && handleDeleteResource(deletingResourceId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
