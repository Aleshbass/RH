"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SearchFiltersProps {
  filters: {
    specializations: string[];
    location: string;
    minPrice?: number;
    maxPrice?: number;
    offersOnline?: boolean;
    offersInPerson?: boolean;
    minYearsExperience?: number;
  };
  onFiltersChange: (filters: any) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
}

const COMMON_SPECIALIZATIONS = [
  "Sports Physiotherapy",
  "Neurological Physiotherapy",
  "Orthopedic Physiotherapy",
  "Pediatric Physiotherapy",
  "Geriatric Physiotherapy",
  "Cardiopulmonary Physiotherapy",
  "Women's Health Physiotherapy",
  "Post-Surgery Rehabilitation",
];

const LOCATIONS = [
  "Lagos",
  "Abuja",
  "Port Harcourt",
  "Ibadan",
  "Kano",
  "Enugu",
];

export default function SearchFilters({
  filters,
  onFiltersChange,
  sortBy,
  onSortChange,
}: SearchFiltersProps) {
  const [priceRange, setPriceRange] = useState([
    filters.minPrice || 2000,
    filters.maxPrice || 32000,
  ]);

  // Sync price range when filters change externally
  useEffect(() => {
    setPriceRange([
      filters.minPrice || 2000,
      filters.maxPrice || 32000,
    ]);
  }, [filters.minPrice, filters.maxPrice]);

  const handleSpecializationToggle = (spec: string) => {
    const current = filters.specializations || [];
    const updated = current.includes(spec)
      ? current.filter((s) => s !== spec)
      : [...current, spec];
    onFiltersChange({ ...filters, specializations: updated });
  };

  const handlePriceChange = (value: number[]) => {
    setPriceRange(value);
  };

  const handlePriceCommit = (value: number[]) => {
    onFiltersChange({
      ...filters,
      minPrice: value[0],
      maxPrice: value[1],
    });
  };

  return (
    <div className="space-y-6">
      {/* Location */}
      <div>
        <Label className="text-white text-base font-semibold mb-3 block">
          Location
        </Label>
        <Select
          value={filters.location || "all"}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, location: value === "all" ? "" : value })
          }
        >
          <SelectTrigger className="bg-white/10 border-white/20 text-white focus:ring-pink-400">
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {LOCATIONS.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Price Range */}
      <div>
        <Label className="text-white text-base font-semibold mb-3 block">
          Price Range
        </Label>
        <div className="px-2">
          <Slider
            value={priceRange}
            onValueChange={handlePriceChange}
            onValueCommit={handlePriceCommit}
            min={2000}
            max={32000}
            step={1000}
            className="mb-4"
          />
          <div className="flex justify-between text-sm text-white/80">
            <span>₦{priceRange[0].toLocaleString()}</span>
            <span>₦{priceRange[1].toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Session Type */}
      <div>
        <Label className="text-white text-base font-semibold mb-3 block">
          Session Type
        </Label>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="online"
              checked={filters.offersOnline === true}
              onCheckedChange={(checked) =>
                onFiltersChange({ ...filters, offersOnline: checked === true ? true : undefined })
              }
              className="border-white/40 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500"
            />
            <label
              htmlFor="online"
              className="text-sm text-white/90 cursor-pointer"
            >
              Online Sessions
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="in-person"
              checked={filters.offersInPerson === true}
              onCheckedChange={(checked) =>
                onFiltersChange({ ...filters, offersInPerson: checked === true ? true : undefined })
              }
              className="border-white/40 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500"
            />
            <label
              htmlFor="in-person"
              className="text-sm text-white/90 cursor-pointer"
            >
              In-Person Sessions
            </label>
          </div>
        </div>
      </div>

      {/* Specializations */}
      <div>
        <Label className="text-white text-base font-semibold mb-3 block">
          Specializations
        </Label>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {COMMON_SPECIALIZATIONS.map((spec) => (
            <div key={spec} className="flex items-center space-x-2">
              <Checkbox
                id={spec}
                checked={filters.specializations.includes(spec)}
                onCheckedChange={() => handleSpecializationToggle(spec)}
                className="border-white/40 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500"
              />
              <label
                htmlFor={spec}
                className="text-sm text-white/90 cursor-pointer"
              >
                {spec}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Minimum Experience */}
      <div>
        <Label className="text-white text-base font-semibold mb-3 block">
          Minimum Experience
        </Label>
        <Select
          value={filters.minYearsExperience?.toString() || "any"}
          onValueChange={(value) =>
            onFiltersChange({
              ...filters,
              minYearsExperience: value === "any" ? undefined : parseInt(value),
            })
          }
        >
          <SelectTrigger className="bg-white/10 border-white/20 text-white focus:ring-pink-400">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            <SelectItem value="1">1+ years</SelectItem>
            <SelectItem value="3">3+ years</SelectItem>
            <SelectItem value="5">5+ years</SelectItem>
            <SelectItem value="10">10+ years</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
