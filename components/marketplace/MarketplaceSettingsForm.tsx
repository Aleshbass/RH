"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface MarketplaceSettingsFormProps {
  settings: any;
}

// Fee calculation helper - patient pays session fee, fees deducted from physiotherapist
function calculateFees(sessionFee: number) {
  if (!sessionFee || sessionFee <= 0) return {
    youReceive: 0,
    platformFee: 0,
    paystackFee: 0,
    patientPays: 0
  };

  // Patient pays only the session fee
  const patientPays = sessionFee;

  // Platform fee is fixed at ₦1,000
  const platformFee = 1000;

  // Paystack charges 1.5% + ₦100 on (session fee + platform fee)
  const chargeableAmount = sessionFee + platformFee;
  const paystackFee = Math.round(chargeableAmount * 0.015) + 100;

  // Physiotherapist receives: session fee - platform fee - paystack fee
  const youReceive = sessionFee - platformFee - paystackFee;

  return {
    youReceive: Math.max(0, youReceive), // Ensure non-negative
    platformFee,
    paystackFee,
    patientPays,
  };
}

const LOCATIONS = [
  "Lagos",
  "Abuja",
  "Port Harcourt",
  "Ibadan",
  "Kano",
  "Enugu",
  "Online Only",
];

const SPECIALIZATIONS = [
  "Sports Physiotherapy",
  "Neurological Physiotherapy",
  "Orthopedic Physiotherapy",
  "Pediatric Physiotherapy",
  "Geriatric Physiotherapy",
  "Cardiopulmonary Physiotherapy",
  "Women's Health Physiotherapy",
  "Post-Surgery Rehabilitation",
];

export default function MarketplaceSettingsForm({
  settings,
}: MarketplaceSettingsFormProps) {
  const [isSaving, setIsSaving] = useState(false);

  const updateSettings = useMutation(
    api.marketplace.settings.updateMarketplaceSettings
  );

  const [formData, setFormData] = useState({
    isAvailableOnMarketplace: settings.isAvailableOnMarketplace,
    hourlyRate: settings.hourlyRate,
    initialConsultRate: settings.initialConsultRate,
    location: settings.location || "",
    offersOnlineSessions: settings.offersOnlineSessions,
    offersInPersonSessions: settings.offersInPersonSessions,
    bio: settings.bio || "",
    specializations: settings.specializations || [],
  });

  const handleSpecializationToggle = (spec: string) => {
    setFormData((prev) => ({
      ...prev,
      specializations: prev.specializations.includes(spec)
        ? prev.specializations.filter((s: string) => s !== spec)
        : [...prev.specializations, spec],
    }));
  };

  const handleToggleVisibility = async (checked: boolean) => {
    // Update local state immediately for responsive UI
    setFormData((prev) => ({
      ...prev,
      isAvailableOnMarketplace: checked,
    }));

    // Save to database
    try {
      await updateSettings({
        isAvailableOnMarketplace: checked,
        hourlyRate: Math.round(formData.hourlyRate * 100),
        initialConsultRate: Math.round(formData.initialConsultRate * 100),
        location: formData.location,
        offersOnlineSessions: formData.offersOnlineSessions,
        offersInPersonSessions: formData.offersInPersonSessions,
        bio: formData.bio,
        specializations: formData.specializations,
      });

      toast.success(
        checked ? "Profile now visible" : "Profile hidden",
        {
          description: checked
            ? "Your profile is now visible in the marketplace"
            : "Your profile has been hidden from the marketplace",
        }
      );
    } catch (error) {
      console.error("Error updating visibility:", error);
      // Revert on error
      setFormData((prev) => ({
        ...prev,
        isAvailableOnMarketplace: !checked,
      }));
      toast.error("Error", {
        description: "Failed to update visibility. Please try again.",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await updateSettings({
        isAvailableOnMarketplace: formData.isAvailableOnMarketplace,
        hourlyRate: Math.round(formData.hourlyRate * 100), // Convert to kobo
        initialConsultRate: Math.round(formData.initialConsultRate * 100),
        location: formData.location,
        offersOnlineSessions: formData.offersOnlineSessions,
        offersInPersonSessions: formData.offersInPersonSessions,
        bio: formData.bio,
        specializations: formData.specializations,
      });

      toast.success("Settings saved", {
        description: "Your marketplace profile has been updated successfully.",
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Error", {
        description: "Failed to save settings. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Marketplace Visibility */}
      {/* Marketplace Visibility */}
      <div className="flex items-center justify-between p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="flex-1">
          <Label className="text-base font-semibold text-gray-900">
            Show on Marketplace
          </Label>
          <p className="text-sm text-gray-500 mt-1">
            Make your profile visible to patients searching for physiotherapists
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className={`h-2 w-2 rounded-full ${formData.isAvailableOnMarketplace ? 'bg-green-500' : 'bg-gray-300'}`} />
            <p className="text-xs font-medium text-gray-600">
              {formData.isAvailableOnMarketplace ? "Your profile is live" : "Your profile is hidden"}
            </p>
          </div>
        </div>
        <Switch
          checked={formData.isAvailableOnMarketplace}
          onCheckedChange={handleToggleVisibility}
          className="data-[state=checked]:bg-black"
        />
      </div>

      {/* Bio */}
      <div>
        <Label htmlFor="bio" className="text-base font-semibold">
          Professional Bio
        </Label>
        <p className="text-sm text-gray-600 mb-2">
          Describe your approach, expertise, and what makes you unique
        </p>
        <Textarea
          id="bio"
          value={formData.bio}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, bio: e.target.value }))
          }
          placeholder="I specialize in sports injuries and post-surgery rehabilitation with over 10 years of experience..."
          rows={4}
          className="resize-none"
        />
        <p className="text-xs text-gray-500 mt-1">
          {formData.bio.length} / 500 characters
        </p>
      </div>

      {/* Location */}
      <div>
        <Label htmlFor="location" className="text-base font-semibold">
          Location
        </Label>
        <Select
          value={formData.location}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, location: value }))
          }
        >
          <SelectTrigger className="mt-2">
            <SelectValue placeholder="Select location" />
          </SelectTrigger>
          <SelectContent>
            {LOCATIONS.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Pricing */}
      <div>
        <Label className="text-base font-semibold mb-4 block">Pricing</Label>
        <p className="text-sm text-gray-600 mb-4">
          Set your session rates. Prices are in Nigerian Naira (₦).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <Label htmlFor="initialConsultRate" className="text-sm font-medium">
              Initial Consultation Rate
            </Label>
            <p className="text-xs text-gray-600 mb-2">First session price</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">₦</span>
              <Input
                id="initialConsultRate"
                type="number"
                value={formData.initialConsultRate}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    initialConsultRate: parseFloat(e.target.value) || 0,
                  }))
                }
                placeholder="10,000"
                min={0}
                step={500}
                className="text-lg font-semibold pl-8"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Suggested: ₦8,000 - ₦25,000</p>
          </div>

          <div>
            <Label htmlFor="hourlyRate" className="text-sm font-medium">
              Follow-up Rate
            </Label>
            <p className="text-xs text-gray-600 mb-2">Subsequent sessions</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">₦</span>
              <Input
                id="hourlyRate"
                type="number"
                value={formData.hourlyRate}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    hourlyRate: parseFloat(e.target.value) || 0,
                  }))
                }
                placeholder="8,000"
                min={0}
                step={500}
                className="text-lg font-semibold pl-8"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Suggested: ₦5,000 - ₦20,000</p>
          </div>
        </div>

        {/* Fee Breakdown Cards */}
        {(formData.initialConsultRate > 0 || formData.hourlyRate > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {formData.initialConsultRate > 0 && (
              <Card className="border border-gray-200 shadow-sm bg-gray-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-2 mb-4">
                    <div className="p-1.5 bg-white rounded-md border border-gray-200 shadow-sm">
                      <Info className="h-4 w-4 text-gray-700" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 text-sm">Initial Consultation</h4>
                      <p className="text-xs text-gray-500">Fee breakdown</p>
                    </div>
                  </div>

                  {(() => {
                    const fees = calculateFees(formData.initialConsultRate);
                    return (
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Patient Pays</span>
                          <span className="font-medium text-gray-900">₦{fees.patientPays.toLocaleString()}</span>
                        </div>

                        <div className="pt-3 border-t border-gray-200 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500">Platform Fee</span>
                            <span className="text-gray-500">-₦{fees.platformFee.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500">Processing</span>
                            <span className="text-gray-500">-₦{fees.paystackFee.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                          <span className="font-semibold text-gray-900">You Receive</span>
                          <span className="font-bold text-green-600">₦{fees.youReceive.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {formData.hourlyRate > 0 && (
              <Card className="border border-gray-200 shadow-sm bg-gray-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-2 mb-4">
                    <div className="p-1.5 bg-white rounded-md border border-gray-200 shadow-sm">
                      <Info className="h-4 w-4 text-gray-700" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 text-sm">Follow-up Session</h4>
                      <p className="text-xs text-gray-500">Fee breakdown</p>
                    </div>
                  </div>

                  {(() => {
                    const fees = calculateFees(formData.hourlyRate);
                    return (
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Patient Pays</span>
                          <span className="font-medium text-gray-900">₦{fees.patientPays.toLocaleString()}</span>
                        </div>

                        <div className="pt-3 border-t border-gray-200 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500">Platform Fee</span>
                            <span className="text-gray-500">-₦{fees.platformFee.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500">Processing</span>
                            <span className="text-gray-500">-₦{fees.paystackFee.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                          <span className="font-semibold text-gray-900">You Receive</span>
                          <span className="font-bold text-green-600">₦{fees.youReceive.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Session Types */}
      <div>
        <Label className="text-base font-semibold mb-3 block">
          Session Types Offered
        </Label>
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="online"
              checked={formData.offersOnlineSessions}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  offersOnlineSessions: !!checked,
                }))
              }
            />
            <label
              htmlFor="online"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Online/Telehealth Sessions
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="in-person"
              checked={formData.offersInPersonSessions}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  offersInPersonSessions: !!checked,
                }))
              }
            />
            <label
              htmlFor="in-person"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              In-Person Sessions
            </label>
          </div>
        </div>
      </div>

      {/* Specializations */}
      <div>
        <Label className="text-base font-semibold mb-3 block">
          Specializations
        </Label>
        <p className="text-sm text-gray-600 mb-3">
          Select all that apply (helps patients find you)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SPECIALIZATIONS.map((spec) => (
            <div key={spec} className="flex items-center space-x-2">
              <Checkbox
                id={spec}
                checked={formData.specializations.includes(spec)}
                onCheckedChange={() => handleSpecializationToggle(spec)}
              />
              <label
                htmlFor={spec}
                className="text-sm font-medium leading-none cursor-pointer"
              >
                {spec}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          type="submit"
          disabled={isSaving}
          className="bg-black hover:bg-gray-800 text-white"
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </form>
  );
}
