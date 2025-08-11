"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";
import { useResourceManagement, CreateResourceParams, UpdateResourceParams } from "@/hooks/useResourceManagement";
import { Id } from "@/convex/_generated/dataModel";

interface ResourceManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicId: Id<"clinics">;
  resourceId?: Id<"resources">;
  mode: "create" | "edit";
}

export function ResourceManagementModal({
  isOpen,
  onClose,
  clinicId,
  resourceId,
  mode,
}: ResourceManagementModalProps) {
  const { createResource, updateResource, fetchResourceById } = useResourceManagement();
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    type: "" as "equipment" | "room" | "staff" | "vehicle" | "",
    description: "",
    category: "",
    location: "",
    capacity: "",
    specifications: {
      brand: "",
      model: "",
      serialNumber: "",
      purchaseDate: "",
      warrantyExpiry: "",
    },
    operatingHours: {
      monday: { start: "", end: "" },
      tuesday: { start: "", end: "" },
      wednesday: { start: "", end: "" },
      thursday: { start: "", end: "" },
      friday: { start: "", end: "" },
      saturday: { start: "", end: "" },
      sunday: { start: "", end: "" },
    },
    maintenanceSchedule: {
      frequency: "" as "daily" | "weekly" | "monthly" | "quarterly" | "annually" | "",
      lastMaintenance: "",
      nextMaintenance: "",
    },
    tags: [] as string[],
  });

  const [newTag, setNewTag] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load existing resource data for edit mode
  useEffect(() => {
    if (mode === "edit" && resourceId) {
      const loadResource = async () => {
        try {
          const existingResource = await fetchResourceById(resourceId);
          if (existingResource) {
            setFormData({
              name: existingResource.name || "",
              type: existingResource.type || "",
              description: existingResource.description || "",
              category: existingResource.category || "",
              location: existingResource.location || "",
              capacity: existingResource.capacity?.toString() || "",
              specifications: {
                brand: existingResource.specifications?.brand || "",
                model: existingResource.specifications?.model || "",
                serialNumber: existingResource.specifications?.serialNumber || "",
                purchaseDate: existingResource.specifications?.purchaseDate || "",
                warrantyExpiry: existingResource.specifications?.warrantyExpiry || "",
              },
              operatingHours: existingResource.operatingHours || {
                monday: { start: "", end: "" },
                tuesday: { start: "", end: "" },
                wednesday: { start: "", end: "" },
                thursday: { start: "", end: "" },
                friday: { start: "", end: "" },
                saturday: { start: "", end: "" },
                sunday: { start: "", end: "" },
              },
              maintenanceSchedule: {
                frequency: existingResource.maintenanceSchedule?.frequency || "",
                lastMaintenance: existingResource.maintenanceSchedule?.lastMaintenance || "",
                nextMaintenance: existingResource.maintenanceSchedule?.nextMaintenance || "",
              },
              tags: existingResource.tags || [],
            });
          }
        } catch (error) {
          console.error("Failed to load resource:", error);
          toast.error("Failed to load resource data");
        }
      };
      loadResource();
    }
  }, [mode, resourceId, fetchResourceById]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Resource name is required";
    }

    if (!formData.type) {
      newErrors.type = "Resource type is required";
    }

    if (formData.capacity && isNaN(Number(formData.capacity))) {
      newErrors.capacity = "Capacity must be a valid number";
    }

    // Validate operating hours format
    Object.entries(formData.operatingHours).forEach(([day, hours]) => {
      if (hours.start && hours.end) {
        if (hours.start >= hours.end) {
          newErrors[`${day}_hours`] = "Start time must be before end time";
        }
      } else if (hours.start || hours.end) {
        newErrors[`${day}_hours`] = "Both start and end times are required";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error("Please fix the form errors");
      return;
    }

    setIsLoading(true);

    try {
      // Prepare data for submission
      const resourceData = {
        name: formData.name.trim(),
        type: formData.type,
        description: formData.description.trim() || undefined,
        category: formData.category.trim() || undefined,
        location: formData.location.trim() || undefined,
        capacity: formData.capacity ? Number(formData.capacity) : undefined,
        specifications: Object.values(formData.specifications).some(v => v.trim()) ? {
          brand: formData.specifications.brand.trim() || undefined,
          model: formData.specifications.model.trim() || undefined,
          serialNumber: formData.specifications.serialNumber.trim() || undefined,
          purchaseDate: formData.specifications.purchaseDate || undefined,
          warrantyExpiry: formData.specifications.warrantyExpiry || undefined,
        } : undefined,
        operatingHours: Object.entries(formData.operatingHours).some(([_, hours]) => hours.start && hours.end) ? 
          Object.fromEntries(
            Object.entries(formData.operatingHours)
              .filter(([_, hours]) => hours.start && hours.end)
              .map(([day, hours]) => [day, hours])
          ) : undefined,
        maintenanceSchedule: formData.maintenanceSchedule.frequency ? {
          frequency: formData.maintenanceSchedule.frequency,
          lastMaintenance: formData.maintenanceSchedule.lastMaintenance || undefined,
          nextMaintenance: formData.maintenanceSchedule.nextMaintenance || undefined,
        } : undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
      };

      if (mode === "create") {
        await createResource({
          clinicId,
          ...resourceData,
        } as CreateResourceParams);
        toast.success("Resource created successfully!");
      } else if (resourceId) {
        await updateResource(resourceId, resourceData as UpdateResourceParams);
        toast.success("Resource updated successfully!");
      }

      onClose();
    } catch (error) {
      console.error("Failed to save resource:", error);
      toast.error("Failed to save resource. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()],
      }));
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove),
    }));
  };

  const handleOperatingHoursChange = (day: string, field: "start" | "end", value: string) => {
    setFormData(prev => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        [day]: {
          ...prev.operatingHours[day as keyof typeof prev.operatingHours],
          [field]: value,
        },
      },
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add New Resource" : "Edit Resource"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create" 
              ? "Create a new resource for your clinic (equipment, room, staff, or vehicle)."
              : "Update the resource information and settings."
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Resource Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Treatment Table 1, Room A, Dr. Smith"
                className={errors.name ? "border-red-500" : ""}
              />
              {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Resource Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData(prev => ({ ...prev, type: value as any }))}
              >
                <SelectTrigger className={errors.type ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select resource type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="room">Room</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="vehicle">Vehicle</SelectItem>
                </SelectContent>
              </Select>
              {errors.type && <p className="text-sm text-red-500">{errors.type}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                placeholder="e.g., Physical Therapy, Diagnostic"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                placeholder="e.g., Room 101, Building A"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData(prev => ({ ...prev, capacity: e.target.value }))}
                placeholder="Maximum people/patients"
                className={errors.capacity ? "border-red-500" : ""}
              />
              {errors.capacity && <p className="text-sm text-red-500">{errors.capacity}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Detailed description of the resource..."
              rows={3}
            />
          </div>

          {/* Specifications */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Specifications</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  value={formData.specifications.brand}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    specifications: { ...prev.specifications, brand: e.target.value }
                  }))}
                  placeholder="e.g., Philips, GE"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={formData.specifications.model}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    specifications: { ...prev.specifications, model: e.target.value }
                  }))}
                  placeholder="e.g., MX450, Series 3000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serialNumber">Serial Number</Label>
                <Input
                  id="serialNumber"
                  value={formData.specifications.serialNumber}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    specifications: { ...prev.specifications, serialNumber: e.target.value }
                  }))}
                  placeholder="Equipment serial number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchaseDate">Purchase Date</Label>
                <Input
                  id="purchaseDate"
                  type="date"
                  value={formData.specifications.purchaseDate}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    specifications: { ...prev.specifications, purchaseDate: e.target.value }
                  }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="warrantyExpiry">Warranty Expiry</Label>
                <Input
                  id="warrantyExpiry"
                  type="date"
                  value={formData.specifications.warrantyExpiry}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    specifications: { ...prev.specifications, warrantyExpiry: e.target.value }
                  }))}
                />
              </div>
            </div>
          </div>

          {/* Operating Hours */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Operating Hours</h3>
            <div className="space-y-3">
              {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => (
                <div key={day} className="flex items-center gap-4">
                  <div className="w-20 text-sm font-medium capitalize">{day}</div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={formData.operatingHours[day as keyof typeof formData.operatingHours].start}
                      onChange={(e) => handleOperatingHoursChange(day, "start", e.target.value)}
                      className="w-32"
                    />
                    <span className="text-sm text-gray-500">to</span>
                    <Input
                      type="time"
                      value={formData.operatingHours[day as keyof typeof formData.operatingHours].end}
                      onChange={(e) => handleOperatingHoursChange(day, "end", e.target.value)}
                      className="w-32"
                    />
                  </div>
                  {errors[`${day}_hours`] && (
                    <p className="text-sm text-red-500">{errors[`${day}_hours`]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Maintenance Schedule */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Maintenance Schedule</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="frequency">Frequency</Label>
                <Select
                  value={formData.maintenanceSchedule.frequency}
                  onValueChange={(value) => setFormData(prev => ({
                    ...prev,
                    maintenanceSchedule: { ...prev.maintenanceSchedule, frequency: value as any }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastMaintenance">Last Maintenance</Label>
                <Input
                  id="lastMaintenance"
                  type="date"
                  value={formData.maintenanceSchedule.lastMaintenance}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    maintenanceSchedule: { ...prev.maintenanceSchedule, lastMaintenance: e.target.value }
                  }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nextMaintenance">Next Maintenance</Label>
                <Input
                  id="nextMaintenance"
                  type="date"
                  value={formData.maintenanceSchedule.nextMaintenance}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    maintenanceSchedule: { ...prev.maintenanceSchedule, nextMaintenance: e.target.value }
                  }))}
                />
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Tags</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.tags.map((tag, index) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add a tag..."
                onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
              />
              <Button type="button" onClick={handleAddTag} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : mode === "create" ? "Create Resource" : "Update Resource"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
