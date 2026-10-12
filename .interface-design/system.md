# Rehabify Clinic OS — Design System & Craft Tokens

## Direction & Intent
- **Human**: Clinical Director & Practice Manager managing multi-therapist rehabilitation centers across Nigeria.
- **Task**: Immediate schedule oversight, clinical EHR chart review (SOAP notes, ROM progress), fee collections (₦ NGN), and specialist referral triage.
- **Feel**: Authoritative clinical precision, calm and non-fatiguing, refined tactile interaction (Linear meets Apple Health).

## Brand & Palette
- **Primary Brand Accent**: `#005b57` (Rehabify Deep Teal)
- **Primary Brand Hover/Dark**: `#00443e` (Teal Shade)
- **Deepest Brand Accent / Ink**: `#002e2c` (Teal Night)
- **Brand Subsurface Tint**: `rgba(0, 91, 87, 0.08)` / `#e6f0ef`
- **Neutral Canvas**: Light `#F8F9FA` · Dark `#111214`
- **Neutral Card / Surface**: Light `#FFFFFF` · Dark `#1A1B1E`
- **Surface Elevation 2**: Light `#F4F5F7` · Dark `#24252A`
- **Subtle Borders**: Light `rgba(0, 0, 0, 0.06)` · Dark `rgba(255, 255, 255, 0.07)`
- **Emphasized Borders**: Light `rgba(0, 91, 87, 0.20)` · Dark `rgba(0, 91, 87, 0.35)`
- **Semantic Status**:
  - Success / Active: `#005b57` (Brand Teal) & `#10B981` (Emerald)
  - Warning / Preview / Review: `#D97706` / `#F59E0B` (Amber)
  - Destructive: `#DC2626` (Crimson)
  - Neutral Muted: Light `#6B7280` · Dark `#9CA3AF`

## Typography Hierarchy
- Ratio: ~1.25 stepping
- Rule: **Weight and color opacity beat raw font size**.
- Dynamic Numbers: tabular numbers (`font-mono tabular-nums` or `tabular-nums`) for currency (₦), times, dates, and metrics to prevent layout shifts.
- Optical tracking: headings slightly negative (`tracking-tight`), micro labels uppercase tracked (`tracking-wider text-[11px] font-semibold`).

## Spacing & Density
- Base unit: 4px / 8px grid.
- Density: 16–20px padding inside workbench cards, 24px between macro sections.
- Hit areas: 40px minimum. Concentric border radii: `outer = inner + padding`.
- Press feedback: `active:scale-[0.98]` on buttons and actionable cards.
