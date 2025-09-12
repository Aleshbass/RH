# Treatment Templates & Plans

This document explains the schema, backend APIs, and UI flows for physiotherapist treatment templates and patient treatment plans.

## Schema Overview

Tables updated/added in `convex/schema.ts`:

- `treatmentTemplates`
  - Fields: `title`, `description?`, `category?`, `difficulty? (Beginner|Intermediate|Advanced)`, `duration?`
  - `goals?`: array of `{ description, targetValue?, timeline?, measurable? }`
  - `phases?`: array of phases with `{ name, description?, duration?, order, exercises: [] }`
  - `exercises` include media support: `exerciseRefId?`, `exerciseId?`, `sets?`, `reps?`, `duration?`, `frequency?`, `notes?`, `videoUrl?`, `youtubeId?`
  - Visibility/access: `createdBy`, `clinicId?`, `isPublic`, `usageCount?`, timestamps

- `treatmentPlans`
  - Patient-specific instances created from templates
  - Exercises now include media fields to surface videos in patient/therapist views: `videoUrl?`, `youtubeId?`

## Backend APIs (Convex)

Located in `convex/treatmentPlans.ts`:

- Queries
  - `getTreatmentTemplates({ category?, difficulty? })`
  - `getTreatmentTemplateById({ templateId })`
  - `getTreatmentPlan({ treatmentPlanId })`

- Mutations
  - `createTreatmentTemplate({...})` – maps simple creator UI fields to full schema
  - `updateTreatmentTemplate({...})` – updates any combination of fields; phases and exercises fully typed
  - `deleteTreatmentTemplate({ templateId })`
  - `assignTemplateToPatient({ templateId, patientId, clinicId?, title?, description?, priority?, activate? })`
    - Copies phases, exercises, and media fields into a new `treatmentPlans` document

Additional patient queries in `convex/patients.ts`:
- `getMyPatients({ limit?, searchTerm? })` – used when assigning a template to a patient

## UI Flows

### Physiotherapist – Templates
- List: `app/dashboard/physiotherapist/treatment-templates/page.tsx`
  - Create new template
  - Use/Assign to patient
  - Preview and Edit actions
- Create: `.../treatment-templates/create/page.tsx` (simple builder -> backend maps to schema)
- Detail: `.../treatment-templates/[templateId]/page.tsx` (renders goals, phases, and exercise media via `VideoEmbed`)
- Edit: `.../treatment-templates/[templateId]/edit/page.tsx`
  - Includes `TemplateBuilder` for full phase/exercise editing
- Use: `.../treatment-templates/[templateId]/use/page.tsx`
  - Select patient from `getMyPatients`
  - Configure plan title/description/priority/activation

### Plan Views
- Physiotherapist: `components/dashboard/physiotherapist/treatment/InteractiveTreatmentPlan.tsx`
  - Media rendered via `VideoEmbed` (hosted) or `LazyExerciseMedia` fallback
- Patient: `components/dashboard/patient/PatientTreatmentPlanView.tsx`
  - Real-time plan + updates; media fields available for surface if needed

## Media Embedding
- `components/media/VideoEmbed.tsx` supports:
  - YouTube via `youtubeId`
  - Hosted video via `url` with lazy loading and poster
- Used in template detail and therapist plan

## Authorization Guards
- UI guard: `components/auth/PhysiotherapistGuard.tsx`
- Route-level layout: `app/dashboard/physiotherapist/layout.tsx`
- Backend: all Convex APIs enforce auth + role checks

## Error & Loading UX
- Route loading: `.../treatment-templates/loading.tsx`
- Route error: `.../treatment-templates/error.tsx`
- Toasts added in create/edit/assign flows

## Developer Notes
- After changing Convex schema, run codegen:
  - `pnpm convex:codegen`
- Consider adding e2e tests for template CRUD and assignment.
