"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LocationSearch from "./LocationSearch";

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
  const [customSpec, setCustomSpec] = useState("");

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

  const handleAddCustomSpec = () => {
    if (!customSpec.trim()) return;

    const spec = customSpec.trim();
    const current = filters.specializations || [];

    if (!current.includes(spec)) {
      onFiltersChange({ ...filters, specializations: [...current, spec] });
    }
    setCustomSpec("");
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

  // Combine common specializations with any selected ones not in the list
  const allSpecializations = [...COMMON_SPECIALIZATIONS];
  (filters.specializations || []).forEach(spec => {
    if (!allSpecializations.includes(spec)) {
      allSpecializations.push(spec);
    }
  });

  return (
    <div className="space-y-8">
      {/* Location */}
      <div className="space-y-3">
        <Label className="text-gray-900 text-sm font-bold">
          Location
        </Label>
        <LocationSearch
          value={filters.location || ""}
          onChange={(value) =>
            onFiltersChange({ ...filters, location: value })
          }
        />
      </div>

      {/* Price Range */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-gray-900 text-sm font-bold">
            Price Range
          </Label>
          <span className="text-xs font-medium text-[#005b57]">
            ₦{priceRange[0].toLocaleString()} - ₦{priceRange[1].toLocaleString()}
          </span>
        </div>
        <div className="px-1 pt-2">
          <Slider
            value={priceRange}
            onValueChange={handlePriceChange}
            onValueCommit={handlePriceCommit}
            min={2000}
            max={32000}
            step={1000}
            className="mb-4"
          />
        </div>
      </div>

      {/* Session Type */}
      <div className="space-y-3">
        <Label className="text-gray-900 text-sm font-bold">
          Session Type
        </Label>
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <Checkbox
              id="online"
              checked={filters.offersOnline === true}
              onCheckedChange={(checked) =>
                onFiltersChange({ ...filters, offersOnline: checked === true ? true : undefined })
              }
              className="border-gray-300 data-[state=checked]:bg-[#005b57] data-[state=checked]:border-[#005b57] text-white rounded-md h-5 w-5"
            />
            <label
              htmlFor="online"
              className="text-sm text-gray-600 cursor-pointer font-medium select-none"
            >
              Online Sessions
            </label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox
              id="in-person"
              checked={filters.offersInPerson === true}
              onCheckedChange={(checked) =>
                onFiltersChange({ ...filters, offersInPerson: checked === true ? true : undefined })
              }
              className="border-gray-300 data-[state=checked]:bg-[#005b57] data-[state=checked]:border-[#005b57] text-white rounded-md h-5 w-5"
            />
            <label
              htmlFor="in-person"
              className="text-sm text-gray-600 cursor-pointer font-medium select-none"
            >
              In-Person Sessions
            </label>
          </div>
        </div>
      </div>

      {/* Specializations */}
      <div className="space-y-3">
        <Label className="text-gray-900 text-sm font-bold">
          Specializations
        </Label>

        {/* List */}
        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
          {allSpecializations.map((spec) => (
            <div key={spec} className="flex items-center space-x-3 group">
              <Checkbox
                id={spec}
                checked={filters.specializations?.includes(spec)}
                onCheckedChange={() => handleSpecializationToggle(spec)}
                className="border-gray-300 data-[state=checked]:bg-[#005b57] data-[state=checked]:border-[#005b57] text-white rounded-md h-5 w-5"
              />
              <label
                htmlFor={spec}
                className="text-sm text-gray-600 cursor-pointer font-medium select-none flex-1 group-hover:text-gray-900 transition-colors"
              >
                {spec}
              </label>
            </div>
          ))}
        </div>

        {/* Add Custom */}
        <div className="pt-2">
          <Label className="text-xs text-gray-500 mb-1.5 block">
            Add other specialization
          </Label>
          <div className="flex gap-2">
            <Input
              value={customSpec}
              onChange={(e) => setCustomSpec(e.target.value)}
              placeholder="e.g. Sports Massage"
              className="h-9 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomSpec();
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddCustomSpec}
              className="h-9 w-9 p-0 shrink-0 border-dashed border-gray-300 hover:border-[#005b57] hover:text-[#005b57]"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Minimum Experience */}
      <div className="space-y-3">
        <Label className="text-gray-900 text-sm font-bold">
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
          <SelectTrigger className="bg-white border-gray-200 text-gray-900 focus:ring-[#005b57]/20 h-10 rounded-xl hover:border-gray-300 transition-colors">
            <SelectValue placeholder="Any experience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any experience</SelectItem>
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
