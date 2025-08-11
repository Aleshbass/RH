"use client";

import React from "react";

type Props = {
  current: number;
  total: number;
  className?: string;
};

export default function OnboardingProgress({ current, total, className }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round((current / Math.max(1, total)) * 100)));
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[#002e2c]">Step {current} of {total}</span>
        <span className="text-sm text-gray-600">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="w-full h-2 bg-gray-200 rounded-full overflow-hidden"
      >
        <div className="h-full bg-[#005b57] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
