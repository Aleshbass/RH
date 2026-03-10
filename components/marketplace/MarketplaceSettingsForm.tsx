"use client";

import { useState, useMemo } from "react";
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
import { Loader2, Info, TrendingUp, Star, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  calculatePlatformFee,
  calculatePackagePrice,
  getRecommendedDiscount,
  formatNaira,
  AVAILABLE_PACKAGES,
  PACKAGE_INFO,
  type PackageSize,
} from "@/lib/pricing";

interface MarketplaceSettingsFormProps {
  settings: any;
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

const DISCOUNT_OPTIONS = [
  { value: 5, label: "5%", tag: "Conservative" },
  { value: 7, label: "7%", tag: "Recommended", recommended: true },
  { value: 10, label: "10%", tag: "Competitive" },
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
    packageDiscountPercent: settings.packageDiscountPercent || 0,
    location: settings.location || "",
    offersOnlineSessions: settings.offersOnlineSessions,
    offersInPersonSessions: settings.offersInPersonSessions,
    bio: settings.bio || "",
    specializations: settings.specializations || [],
  });

  const [customDiscount, setCustomDiscount] = useState("");
  const [useCustomDiscount, setUseCustomDiscount] = useState(
    formData.packageDiscountPercent > 0 &&
    !DISCOUNT_OPTIONS.some(o => o.value === formData.packageDiscountPercent)
  );

  // Calculate recommended discount based on rate
  const recommendedDiscount = useMemo(
    () => getRecommendedDiscount(formData.hourlyRate),
    [formData.hourlyRate]
  );

  // Active discount for preview
  const activeDiscount = formData.packageDiscountPercent || recommendedDiscount;

  // Package previews
  const packagePreviews = useMemo(() => {
    if (!formData.hourlyRate || formData.hourlyRate <= 0) return [];
    return AVAILABLE_PACKAGES.filter(s => s > 1).map(sessions => {
      try {
        return calculatePackagePrice(formData.hourlyRate, sessions, activeDiscount);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }, [formData.hourlyRate, activeDiscount]);

  // Earnings comparison (with vs without packages)
  const earningsComparison = useMemo(() => {
    if (!formData.hourlyRate || formData.hourlyRate <= 0) return null;
    const avgSessionsWithout = 2.4; // industry average without packages
    const earningsWithout = formData.hourlyRate * avgSessionsWithout;
    const pkg8 = packagePreviews.find(p => p && p.sessions === 8);
    if (!pkg8) return null;
    return {
      withoutPackages: earningsWithout,
      with8Package: pkg8.physioEarnings,
      advantage: pkg8.physioEarnings - earningsWithout,
      percentageGain: Math.round(((pkg8.physioEarnings - earningsWithout) / earningsWithout) * 100),
    };
  }, [formData.hourlyRate, packagePreviews]);

  const handleSpecializationToggle = (spec: string) => {
    setFormData((prev) => ({
      ...prev,
      specializations: prev.specializations.includes(spec)
        ? prev.specializations.filter((s: string) => s !== spec)
        : [...prev.specializations, spec],
    }));
  };

  const handleToggleVisibility = async (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      isAvailableOnMarketplace: checked,
    }));

    try {
      await updateSettings({
        isAvailableOnMarketplace: checked,
        hourlyRate: Math.round(formData.hourlyRate * 100),
        initialConsultRate: Math.round(formData.initialConsultRate * 100),
        packageDiscountPercent: formData.packageDiscountPercent,
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
        hourlyRate: Math.round(formData.hourlyRate * 100),
        initialConsultRate: Math.round(formData.initialConsultRate * 100),
        packageDiscountPercent: formData.packageDiscountPercent,
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

  // Platform fee preview
  const feePreview = useMemo(() => {
    const rate = formData.hourlyRate;
    if (!rate || rate <= 0) return null;
    const platformFee = calculatePlatformFee(rate);
    return {
      patientPays: rate + platformFee,
      platformFee,
      youReceive: rate,
    };
  }, [formData.hourlyRate]);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
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

      {/* ── PRICING SECTION ── */}
      <div className="space-y-6">
        <div>
          <Label className="text-base font-semibold mb-1 block">Session Pricing</Label>
          <p className="text-sm text-gray-600 mb-4">
            Set your session rates in Nigerian Naira (₦). Platform fees are separate and transparent.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* Fee Breakdown */}
        {feePreview && (
          <Card className="border border-gray-200 shadow-sm bg-gray-50/50">
            <CardContent className="pt-5">
              <div className="flex items-start gap-2 mb-3">
                <div className="p-1.5 bg-white rounded-md border border-gray-200 shadow-sm">
                  <Info className="h-4 w-4 text-gray-700" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 text-sm">Platform Fee Structure</h4>
                  <p className="text-xs text-gray-500">Per follow-up session</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Your session rate</span>
                  <span className="font-medium text-gray-900">{formatNaira(feePreview.youReceive)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Platform fee {formData.hourlyRate > 25000 ? `(₦1k + 5% on excess)` : `(flat)`}</span>
                  <span className="text-gray-500">+{formatNaira(feePreview.platformFee)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <span className="font-semibold text-gray-900">Patient pays</span>
                  <span className="font-bold text-gray-900">{formatNaira(feePreview.patientPays)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-green-700">You receive</span>
                  <span className="font-bold text-green-600">{formatNaira(feePreview.youReceive)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── PACKAGE DISCOUNT SECTION ── */}
      {formData.hourlyRate > 0 && (
        <div className="space-y-5">
          <div className="border-t border-gray-100 pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <Label className="text-base font-semibold">Package Discount Settings</Label>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Offer discounted rates for multi-session packages. Patients who commit to more sessions save money, and you get guaranteed bookings.
            </p>
          </div>

          {/* Discount Options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {DISCOUNT_OPTIONS.map((option) => {
              const isActive = !useCustomDiscount && formData.packageDiscountPercent === option.value;
              const pkg8 = (() => {
                try { return calculatePackagePrice(formData.hourlyRate, 8, option.value); }
                catch { return null; }
              })();
              return (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, packageDiscountPercent: option.value }));
                    setUseCustomDiscount(false);
                  }}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${isActive
                      ? "border-[#005b57] bg-[#e6f0ef]/50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                >
                  {option.recommended && (
                    <span className="absolute -top-2.5 left-3 px-2 py-0.5 bg-amber-400 text-[10px] font-bold text-amber-900 rounded-full flex items-center gap-1">
                      <Star className="w-3 h-3" /> RECOMMENDED
                    </span>
                  )}
                  <p className={`text-2xl font-bold ${isActive ? "text-[#005b57]" : "text-gray-900"}`}>
                    {option.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{option.tag}</p>
                  {pkg8 && (
                    <p className="text-xs text-gray-600 mt-2">
                      Patient saves {formatNaira(pkg8.patientSaves)} on 8 sessions
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom discount */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setUseCustomDiscount(!useCustomDiscount)}
              className={`text-sm font-medium cursor-pointer ${useCustomDiscount ? "text-[#005b57]" : "text-gray-500 hover:text-gray-700"}`}
            >
              {useCustomDiscount ? "✓ Using custom discount" : "Or set a custom %"}
            </button>
            {useCustomDiscount && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={5}
                  max={15}
                  value={customDiscount || formData.packageDiscountPercent}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setCustomDiscount(e.target.value);
                    setFormData(prev => ({ ...prev, packageDiscountPercent: Math.max(5, Math.min(15, val)) }));
                  }}
                  className="w-20 h-9 text-center font-semibold"
                  placeholder="7"
                />
                <span className="text-sm text-gray-500">% (5-15% allowed)</span>
              </div>
            )}
          </div>

          {/* Earnings Preview */}
          {earningsComparison && (
            <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50/50">
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-gray-900 text-sm">Your Earnings Preview</h4>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Per session (after {activeDiscount}% discount)</span>
                    <span className="font-semibold text-gray-900">
                      {formatNaira(Math.round(formData.hourlyRate * (1 - activeDiscount / 100)))}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">8-session package earnings</span>
                    <span className="font-bold text-green-600">
                      {formatNaira(earningsComparison.with8Package)}
                    </span>
                  </div>

                  <div className="border-t border-green-200 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 text-xs">vs No packages (2.4 sessions avg)</span>
                      <span className="text-xs text-gray-500">
                        {formatNaira(earningsComparison.withoutPackages)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="font-semibold text-green-700">Package advantage</span>
                      <span className="font-bold text-green-600">
                        +{formatNaira(earningsComparison.advantage)} (+{earningsComparison.percentageGain}%) 🎉
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Package Pricing Preview */}
          {packagePreviews.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">What patients will see:</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {packagePreviews.map((pkg) => {
                  if (!pkg) return null;
                  const info = PACKAGE_INFO[pkg.sessions as PackageSize];
                  return (
                    <div
                      key={pkg.sessions}
                      className={`p-4 rounded-xl border ${info?.popular ? "border-[#005b57] bg-[#f0faf9] ring-1 ring-[#005b57]/20" : "border-gray-200 bg-white"
                        }`}
                    >
                      {info?.popular && (
                        <span className="text-[10px] font-bold text-[#005b57] uppercase tracking-wider">
                          Most Popular
                        </span>
                      )}
                      <p className="font-bold text-gray-900 text-lg">
                        {pkg.sessions} Sessions
                      </p>
                      <p className="text-xs text-gray-500">{info?.description}</p>
                      <p className="font-bold text-gray-900 mt-2">
                        {formatNaira(pkg.packageTotal)}
                      </p>
                      <p className="text-xs text-green-600 font-medium">
                        Save {formatNaira(pkg.patientSaves)}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {formatNaira(Math.round(pkg.packageTotal / pkg.sessions))}/session avg
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
