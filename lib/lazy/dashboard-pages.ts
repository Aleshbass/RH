import { createLazyPage } from './index'

// Admin dashboard pages - lazy loaded
export const LazyAdminPages = {
  AdminDashboard: createLazyPage(
    () => import('@/app/dashboard/admin/page'),
    'AdminDashboard'
  ),
  AdminUsers: createLazyPage(
    () => import('@/app/dashboard/admin/users/page'),
    'AdminUsers'
  ),
  AdminAnalytics: createLazyPage(
    () => import('@/app/dashboard/admin/analytics/page'),
    'AdminAnalytics'
  ),
  AdminHealth: createLazyPage(
    () => import('@/app/dashboard/admin/health/page'),
    'AdminHealth'
  ),
  AdminApprovals: createLazyPage(
    () => import('@/app/dashboard/admin/approvals/page'),
    'AdminApprovals'
  ),
  AdminSecurity: createLazyPage(
    () => import('@/app/dashboard/admin/security/page'),
    'AdminSecurity'
  ),
  AdminSystem: createLazyPage(
    () => import('@/app/dashboard/admin/system/page'),
    'AdminSystem'
  )
}

// Clinic dashboard pages - lazy loaded
export const LazyClinicPages = {
  ClinicDashboard: createLazyPage(
    () => import('@/app/dashboard/clinic/page'),
    'ClinicDashboard'
  ),
  ClinicAppointments: createLazyPage(
    () => import('@/app/dashboard/clinic/appointments/page'),
    'ClinicAppointments'
  ),
  ClinicPatients: createLazyPage(
    () => import('@/app/dashboard/clinic/patients/page'),
    'ClinicPatients'
  ),
  ClinicStaff: createLazyPage(
    () => import('@/app/dashboard/clinic/staff/page'),
    'ClinicStaff'
  ),
  ClinicBilling: createLazyPage(
    () => import('@/app/dashboard/clinic/billing/page'),
    'ClinicBilling'
  ),
  ClinicReports: createLazyPage(
    () => import('@/app/dashboard/clinic/reports/page'),
    'ClinicReports'
  ),
  ClinicSettings: createLazyPage(
    () => import('@/app/dashboard/clinic/settings/page'),
    'ClinicSettings'
  ),
  ClinicVideoCalls: createLazyPage(
    () => import('@/app/dashboard/clinic/video-calls/page'),
    'ClinicVideoCalls'
  )
}

// Physiotherapist dashboard pages - lazy loaded
export const LazyPhysiotherapistPages = {
  PhysiotherapistDashboard: createLazyPage(
    () => import('@/app/dashboard/physiotherapist/page'),
    'PhysiotherapistDashboard'
  ),
  PhysiotherapistAppointments: createLazyPage(
    () => import('@/app/dashboard/physiotherapist/appointments/page'),
    'PhysiotherapistAppointments'
  ),
  PhysiotherapistPatients: createLazyPage(
    () => import('@/app/dashboard/physiotherapist/patients/page'),
    'PhysiotherapistPatients'
  ),
  PhysiotherapistCalendar: createLazyPage(
    () => import('@/app/dashboard/physiotherapist/calendar/page'),
    'PhysiotherapistCalendar'
  ),
  PhysiotherapistBilling: createLazyPage(
    () => import('@/app/dashboard/physiotherapist/billing/page'),
    'PhysiotherapistBilling'
  ),
  PhysiotherapistReports: createLazyPage(
    () => import('@/app/dashboard/physiotherapist/reports/page'),
    'PhysiotherapistReports'
  ),
  PhysiotherapistSettings: createLazyPage(
    () => import('@/app/dashboard/physiotherapist/settings/page'),
    'PhysiotherapistSettings'
  ),
  PhysiotherapistMessages: createLazyPage(
    () => import('@/app/dashboard/physiotherapist/messages/page'),
    'PhysiotherapistMessages'
  )
}

// Patient dashboard pages - lazy loaded
export const LazyPatientPages = {
  PatientDashboard: createLazyPage(
    () => import('@/app/dashboard/patient/page'),
    'PatientDashboard'
  ),
  PatientAppointments: createLazyPage(
    () => import('@/app/dashboard/patient/appointments/page'),
    'PatientAppointments'
  ),
  PatientInvoices: createLazyPage(
    () => import('@/app/dashboard/patient/invoices/page'),
    'PatientInvoices'
  ),
  PatientMessages: createLazyPage(
    () => import('@/app/dashboard/patient/messages/page'),
    'PatientMessages'
  ),
  PatientVideoCalls: createLazyPage(
    () => import('@/app/dashboard/patient/video-calls/page'),
    'PatientVideoCalls'
  )
}

// Onboarding pages - lazy loaded
export const LazyOnboardingPages = {
  RoleSelection: createLazyPage(
    () => import('@/app/(onboarding)/role-selection/page'),
    'RoleSelection'
  ),
  ClinicOwnerStep1: createLazyPage(
    () => import('@/app/(onboarding)/clinic-owner/step1/page'),
    'ClinicOwnerStep1'
  ),
  ClinicOwnerStep2: createLazyPage(
    () => import('@/app/(onboarding)/clinic-owner/step2/page'),
    'ClinicOwnerStep2'
  ),
  ClinicOwnerStep3: createLazyPage(
    () => import('@/app/(onboarding)/clinic-owner/step3/page'),
    'ClinicOwnerStep3'
  ),
  ClinicOwnerStep4: createLazyPage(
    () => import('@/app/(onboarding)/clinic-owner/step4/page'),
    'ClinicOwnerStep4'
  ),
  PhysiotherapistStep1: createLazyPage(
    () => import('@/app/(onboarding)/physiotherapist/step1/page'),
    'PhysiotherapistStep1'
  ),
  PhysiotherapistStep2: createLazyPage(
    () => import('@/app/(onboarding)/physiotherapist/step2/page'),
    'PhysiotherapistStep2'
  ),
  PhysiotherapistStep3: createLazyPage(
    () => import('@/app/(onboarding)/physiotherapist/step3/page'),
    'PhysiotherapistStep3'
  ),
  PatientStep1: createLazyPage(
    () => import('@/app/(onboarding)/patient/step1/page'),
    'PatientStep1'
  ),
  PatientStep2: createLazyPage(
    () => import('@/app/(onboarding)/patient/step2/page'),
    'PatientStep2'
  ),
  OnboardingComplete: createLazyPage(
    () => import('@/app/(onboarding)/onboarding-complete/page'),
    'OnboardingComplete'
  )
}

// Preload functions for route-based optimization
export const preloadDashboardPages = (userRole: string) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      switch (userRole) {
        case 'admin':
          // Preload admin pages
          import('@/app/dashboard/admin/page')
          import('@/app/dashboard/admin/users/page')
          break
        case 'clinic_owner':
          // Preload clinic pages
          import('@/app/dashboard/clinic/page')
          import('@/app/dashboard/clinic/appointments/page')
          break
        case 'physiotherapist':
          // Preload physiotherapist pages
          import('@/app/dashboard/physiotherapist/page')
          import('@/app/dashboard/physiotherapist/appointments/page')
          break
        case 'patient':
          // Preload patient pages
          import('@/app/dashboard/patient/page')
          import('@/app/dashboard/patient/appointments/page')
          break
      }
    })
  }
}
