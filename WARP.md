# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands & workflows

### Install & run locally
- Install dependencies (project uses `pnpm-lock.yaml`, prefer pnpm):
  - `pnpm install`
- Start full local stack (Next.js frontend + Convex backend + Convex dashboard):
  - `pnpm dev`
  - This runs `next dev` and `convex dev` in parallel, with `convex dashboard` as a `predev` step.

### Linting, types, and build
- Lint Next.js app:
  - `pnpm lint`
- Type-check TypeScript:
  - `pnpm typecheck`
- Build frontend for production:
  - `pnpm build` (or `npm run build` as in `PRODUCTION_DEPLOYMENT.md`)
- Run built app:
  - `pnpm start`

### Convex backend tooling
- Run Convex dev server only:
  - `pnpm convex:dev` (wrapper for `convex dev`)
- Deploy Convex functions:
  - `pnpm convex:deploy`
- Regenerate Convex client types and API references:
  - `pnpm convex:codegen`

### Tests (Playwright end-to-end)
Playwright is the primary automated test runner.

- Run full Playwright suite:
  - `pnpm test`
- Focused suites by area:
  - `pnpm test:features` – feature flows (`tests/features`)
  - `pnpm test:integration` – integration flows (`tests/integration`)
  - `pnpm test:security`
  - `pnpm test:performance`
- Frequently used feature-specific runs:
  - `pnpm test:appointment`
  - `pnpm test:patient`
  - `pnpm test:treatment`
  - `pnpm test:auth`
  - `pnpm test:dashboard`
- UI / debugging modes:
  - `pnpm test:ui` – Playwright UI runner
  - `pnpm test:headed` – headed browser
  - `pnpm test:debug` – debug mode
- CI-oriented run:
  - `pnpm test:ci` – GitHub reporter
- Run a single test file or test name (use Playwright CLI directly):
  - `npx playwright test tests/features/appointment-management.spec.ts`
  - `npx playwright test tests/features/appointment-management.spec.ts -g "specific test name"`

### Domain-specific utilities
- Reminder system tests (see `TESTING_GUIDE.md` for details):
  - Via Convex dashboard functions:
    - `api.test_reminders.checkTestData()`
    - `api.test_reminders.testAllReminders()`
    - Individual: `api.test_reminders.testExerciseReminders()`, `testInvoiceReminders()`, `testAppointmentReminders()`
  - There is also a test UI documented at `http://localhost:3001/dashboard/admin/test-reminders`.
- Billing flow tests:
  - `pnpm test:billing`
  - `pnpm test:billing-flow`
- Bundle analysis (Next.js):
  - `pnpm analyze`
  - `pnpm analyze:server`
  - `pnpm analyze:browser`
- Basic security/audit check:
  - `pnpm audit`

## High-level architecture

### Overall stack
- **Frontend:** Next.js App Router (TypeScript, React 19) in `app/` with Tailwind-based UI and shadcn-style components under `components/ui` plus rich domain-specific components under `components/**`.
- **Backend:** Convex for database, server logic, schedulers, and HTTP endpoints in `convex/**`, with a large domain schema in `convex/schema.ts`.
- **Auth:** Clerk for authentication, wired into both Next.js (via `@clerk/nextjs`) and Convex (`convex/auth.ts`, `convex/users.ts`).
- **Payments & billing:** Paystack-based billing system with split payments, invoices, payouts, and payment records implemented in Convex; production deployment details in `PRODUCTION_DEPLOYMENT.md`.
- **Observability & analytics:** Sentry, custom monitoring (`@/lib/monitoring`), Convex analytics/metrics tables, and Redis caching via Upstash.

### Frontend structure (Next.js)
- **Global layout & providers**
  - `app/layout.tsx` sets up HTML shell, SEO metadata, OG/Twitter tags, font loading, and integrates:
    - `ClerkProvider` for auth.
    - `ConvexClientProvider` for Convex React hooks (`useQuery`, `useMutation`).
    - `SyncUserWithConvex` and `AutoOnboardClinicOwner` to keep Convex `users` in sync with Clerk and to bootstrap clinic-owner onboarding.
    - `ConditionalLayout` to switch between marketing layout and authenticated app/dashboards.
  - `app/providers.tsx` is a client-side provider wrapper that configures:
    - A shared `QueryClient` for `@tanstack/react-query` (with tuned retry/refetch defaults).
    - Global monitoring hooks (route-based `analytics.trackPageView` and `initMonitoring(user?.id)`).
    - `NextTopLoader` progress bar and Cookiebot consent management.

- **Routing domains (selected)**
  - Public / marketing:
    - `app/page.tsx`, `app/blog`, `app/find-a-physio`, `app/platform/*`, `app/marketplace/*`, `app/support`, etc.
  - Auth/onboarding flows:
    - `app/(onboarding)/role-selection`, `app/(onboarding)/clinic-owner`, `app/(onboarding)/physiotherapist`, `app/(onboarding)/onboarding-complete`.
  - Dashboard shell:
    - `app/dashboard/layout.tsx` is an authenticated server layout that:
      - Uses Clerk server-side `auth()` for gating.
      - Renders `DashboardHeader`, the left-hand `DashboardSidebarWrapper`, and global toasters (`NotificationToaster`, `sonner` `Toaster`).
  - Role-specific dashboards:
    - `app/dashboard/page.tsx` (client) inspects `api.users.getMyUser` and `api.queries.checkDashboardAccess` and redirects to:
      - `/dashboard/physiotherapist`
      - `/dashboard/clinic`
      - `/dashboard/patient`
      - `/dashboard/admin`
      or to onboarding / pending-approval experiences based on Convex state.
    - Each role has its own page and layout segment (e.g. `app/dashboard/physiotherapist/page.tsx` renders `PhysiotherapistDashboardV2` and re-checks role).

- **Component organization (selected)**
  - `components/dashboard/**` contains most domain UIs split by role:
    - `admin/*`: system analytics, approvals, user management, monitoring.
    - `clinic-owner/*`: staff management, patient invites, clinic owner dashboards.
    - `clinic/*`: clinic-side staff management and invites.
    - `patient/*`: patient dashboard, treatment views, stats, sidebars.
    - `physiotherapist/*`: core physio dashboard, calendar integration, patient overview, treatment planning, recent sessions, schedule widgets.
    - `shared/*`: shared dashboard chrome, notification components, quick actions, profile uploader, cached stats.
  - `components/calendar/**`: calendar views, DayPilot-based scheduler, appointment modals, series editing.
  - `components/appointments`, `components/patient`, `components/resources`, `components/video`, `components/chat`, etc. provide focused UIs over Convex-backed domains.
  - UI primitives (`components/ui/*`) are reusable shadcn-style components used across pages.

### Backend structure (Convex)
- **Schema as single source of truth**
  - `convex/schema.ts` defines nearly all business entities with explicit validators and indexes.
  - Major domains include:
    - **Core identity:** `users`, `clinics`, `physiotherapistProfiles`, `patientProfiles`, `clinicOwnerProfiles`, `patientInvitations`, `clinicStaffInvitations`, `patientPhysiotherapistRelationships`, `familyAccessGrants`.
    - **Scheduling:** `appointments`, `recurringSeries`, `seriesExceptions`, `resourceBookings`, plus calendar integration tables (`calendarEvents`, `googleCalendarCredentials`, `userCalendars`, `calendarWatchChannels`).
    - **Care delivery:** `sessionLogs`, `exercises`, `treatmentTemplates`, `treatmentPlans`, `treatmentProgress`, `prescribedExercises`, `exerciseProgress`, `assessments`.
    - **Notifications & reminders:** `notifications`, `notificationRetryQueue`, `emailRetryQueue`, plus user `settings` and `clinicSettings` for notification preferences.
    - **Messaging & video:** `conversations`, `messages`, `typingStatus`, `videoCalls`, `videoCallMessages`, `videoCallParticipants`, `videoCallRecordings`.
    - **Billing & marketplace:** `invoices`, `payments`, `payouts`, `bankAccounts`, `physiotherapistBankAccounts`, `splitConfigurations`, `paymentRecords`, `transactions`, `marketplaceBookings`, `marketplaceReviews`, `marketplaceTransactions`.
    - **Analytics & monitoring:** `analytics_events`, `businessMetrics`, `performanceMetrics`, `auditLogs`, `userActivity`, `systemHealth`, `systemLogs`, `reports`.
    - **Resources & content:** `resources`, `treatmentPlanVersions`, `notesTemplates`, `resourcesBookings` (via `resourceBookings`), plus multiple `*Documents` tables backed by Convex `_storage`.
  - Many tables carry denormalized fields (e.g. patient names/emails on `patients`, earnings on `physiotherapistProfiles`) to support index-based queries per Convex best practices.

- **Function modules (selected)**
  - Each domain has a dedicated Convex module under `convex/`:
    - `users.ts`, `clinics.ts`, `physiotherapistProfiles.ts`, `physiotherapists.ts`, `patients.ts`, `patientInvitations.ts` handle identity and relationships.
    - `appointments.ts`, `recurringAppointments.ts`, `resourceManagement.ts`, `calendar/*` implement scheduling, recurring logic, and Google Calendar sync.
    - `treatmentPlans.ts`, `treatmentPlanSync.ts`, `exerciseTemplates.ts`, `exercises.ts`, `sessionLogs.ts` implement treatment planning and progress.
    - `notifications.ts` and `notifications/*` implement notification CRUD, email sending, retry queues, and higher-level services.
    - `reminderSystem.ts`, `reminders.ts`, `scheduled/*`, `test_reminders.ts`, and `testing/testReminders.ts` implement cron-driven reminders and their test harness.
    - `billing.ts`, `payments.ts`, `payouts.ts`, `paystack.ts`, `paystackVerify.ts`, `webhooks/paystack.ts` implement the Paystack billing pipeline, split payments, and verification.
    - `marketplace/*` implements physiotherapist marketplace search, verification badges, earnings, and bookings.
    - `chat.ts`, `videoCalls.ts`, `stream*` and `stream.*` files implement chat and video call orchestration (including Stream and Daily integrations).
    - `analytics.ts`, `health.ts`, `reports.ts`, `settings.ts`, `settings/service.ts` handle reporting, analytics, health checks, and user/clinic settings.

- **HTTP endpoints & webhooks**
  - `convex/http.ts` uses `httpRouter` to register Convex HTTP endpoints:
    - `POST /webhooks/google-calendar` → `calendar/webhook.calendarWebhook` for Google Calendar push notifications.
    - `GET /webhooks/health` → `calendar/webhook.webhookHealth` for webhook health checks.
    - `POST /paystack-webhook` → `webhooks/paystack.paystackWebhook` for Paystack payment events.
    - `POST /verify-payment` → `paystackVerify.verifyPayment` for payment verification (bypassing Next.js).

- **Cron jobs & background processing**
  - `convex/crons.ts` defines cron jobs via `cronJobs()` that:
    - Process notification retries on an interval using `helpers/triggerRetryProcessing`.
    - Periodically run `internal.resourceNotifications.*` maintenance and conflict detection jobs.
    - Drive appointment, exercise, invoice, and invitation reminders (via `internal.scheduled.*` and `internal.reminderSystem.*`).
  - Domain-specific schedulers and helpers live in `convex/scheduled/*` and the reminder modules mentioned above.

- **Auth & user synchronization**
  - `convex/auth.ts` and `convex/users.ts` coordinate Clerk identities with Convex `users`:
    - `updateOrCreateUser` (internal mutation) consumes Clerk webhook payloads to upsert Convex users by `clerkId`.
    - `storeUserFromClerk` (public mutation) is used by client-side sync components.
    - Queries like `getMyUser`, `getUserById`, `getUserByEmail`, and helpers like `getUserByIdOrThrow` encapsulate common access patterns.
  - Frontend auth-aware components (`SyncUserWithConvex`, `DashboardAuthGuard`, dashboard pages) consistently rely on these Convex APIs.

### Notifications & reminder system architecture
- Notifications are modularized under `convex/notifications/*`:
  - `core.ts` – notification CRUD and unread counts.
  - `email.ts` – email sending via Resend.
  - `retry.ts` – retry queue management backed by `notificationRetryQueue` and `emailRetryQueue` tables.
  - `service.ts` – higher-level orchestration like `sendNotificationWithFallback`, cleanup scheduling, and test helpers.
- `convex/notifications.ts` is a compatibility layer that re-exports functions from these modules and maps legacy names (`create`, `markAsRead`, etc.) to the new implementations.
- Reminder flows (exercise reminders, invoice reminders, appointment reminders) are implemented in `reminderSystem.ts`, `reminders.ts`, and `scheduled/*`, wired to cron entries in `crons.ts`, and are testable via `test_reminders` functions and the admin test UI documented in `TESTING_GUIDE.md`.

### Billing & marketplace architecture (high level)
- Convex tables `invoices`, `payments`, `payouts`, `bankAccounts*`, `splitConfigurations`, `paymentRecords`, and `transactions` represent the full lifecycle from invoice issuance through Paystack collection and payouts to physiotherapists/clinics.
- `PRODUCTION_DEPLOYMENT.md` documents the production-ready billing stack, including required environment variables, Paystack webhook configuration, and monitoring expectations.
- Marketplace-related modules (`convex/marketplace/*`, `marketplaceBookings`, `marketplaceReviews`, `marketplaceTransactions`) sit on top of these primitives, connecting bookings and verification badges to billing and treatment relationships.

## Convex conventions & rules
These summarize the important Convex rules from `.cursor/rules/convex_rules.mdc` and how the repo is structured.

- **Function definitions**
  - Always use the new Convex function syntax (`query`, `mutation`, `action`, `internalQuery`, `internalMutation`, `internalAction`) imported from `./_generated/server`.
  - Every function should declare both `args` and `returns` validators using `v.*` (including `v.null()` when returning `null` / nothing).
  - Public vs internal APIs:
    - Public: `query`, `mutation`, `action` → called via `api.*` from clients and other functions.
    - Internal: `internalQuery`, `internalMutation`, `internalAction` → called only from Convex functions via `internal.*`.
  - Use function references from `convex/_generated/api` (`api.module.fn`, `internal.module.fn`), never pass raw function definitions into `ctx.runQuery` / `ctx.runMutation` / `ctx.runAction`.

- **HTTP & actions**
  - HTTP endpoints live in `convex/http.ts` and are registered via `httpRouter().route({ path, method, handler })`.
  - HTTP handlers themselves should be `httpAction`-based where they need Convex context (see the rules file for the canonical pattern).
  - Actions that use Node.js APIs must include a top-of-file `"use node";` directive.

- **Database & queries**
  - Prefer index-backed queries using `.withIndex` or `.withSearchIndex` as defined in `schema.ts`; avoid `.filter`-based table scans.
  - Use `.unique()` for queries expected to return a single document.
  - For pagination, follow the `paginationOptsValidator` pattern shown in the rules file and return the Convex pagination object (`page`, `isDone`, `continueCursor`).

- **Scheduling & crons**
  - Cron jobs are declared in `convex/crons.ts` using the `cronJobs()` helper.
  - Jobs should target function references (from `internal.*`), not plain functions.
  - Where adding new scheduled jobs, keep responsibilities narrow and reuse existing helper modules (e.g. notification retry helpers, reminder system helpers) instead of inlining logic.

- **Types & IDs**
  - Prefer Convex `Id<"table">` for document identifiers rather than raw strings; utilities for this live in `./_generated/dataModel`.
  - When returning structured data, encode the shape in validators (e.g. `v.object({ ... })`) so clients have typed responses via `convex/_generated/api`.

## Key local documentation
When extending or debugging, these local docs are especially useful:

- `README.md` – original Convex + Next.js + Clerk starter readme; good for basic stack orientation.
- `BUILD_FLOW.md` – high-level MVP build plan; describes intended phases and core workflows (clinic owner, physiotherapist, patient).
- `README-notifications-refactor.md` – detailed explanation of the notification system refactor and the modular `convex/notifications/*` layout (recommended import style for new code).
- `TESTING_GUIDE.md` – end-to-end testing guide for the reminder system, including Convex functions to run and expected outputs.
- `PRODUCTION_DEPLOYMENT.md` – production readiness and deployment guide for billing, including Paystack, Redis, email, and monitoring configuration.
- Numerous `*_FIX_*.md`, `*_STATUS.md`, and feature-specific markdown files document audits, completed fixes, and planned improvements per subsystem (appointments, marketplace, sidebar, verification badges, webhooks, etc.); skim the ones relevant to the area you are editing.
