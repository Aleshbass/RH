'use client';

import { useEffect, useState, useCallback } from 'react';
import { driver, Driver, DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter, usePathname } from 'next/navigation';
import { useSidebarStore } from '@/stores/sidebarStore';

// Tour version - increment to trigger tour for existing users
const TOUR_VERSION = 5;

// Custom styles for Rehabify branding
const CUSTOM_STYLES = `
  .driver-popover {
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 91, 87, 0.15), 0 8px 24px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(0, 91, 87, 0.1);
    max-width: 340px;
  }
  
  .driver-popover-title {
    font-size: 18px;
    font-weight: 700;
    color: #005b57;
    padding: 20px 20px 8px 20px;
  }
  
  .driver-popover-description {
    font-size: 14px;
    color: #4b5563;
    line-height: 1.6;
    padding: 0 20px 16px 20px;
  }
  
  .driver-popover-progress-text {
    font-size: 12px;
    color: #9ca3af;
    font-weight: 500;
  }
  
  .driver-popover-prev-btn {
    background: transparent;
    border: 1px solid #e5e7eb;
    color: #6b7280;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
  }
  
  .driver-popover-prev-btn:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }
  
  .driver-popover-next-btn {
    background: linear-gradient(135deg, #005b57 0%, #00857f 100%);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 8px 20px;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 91, 87, 0.3);
  }
  
  .driver-popover-next-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(0, 91, 87, 0.4);
  }
  
  .driver-popover-close-btn {
    color: #9ca3af;
    width: 28px;
    height: 28px;
    top: 12px;
    right: 12px;
  }
  
  .driver-popover-close-btn:hover {
    color: #6b7280;
  }
  
  .driver-popover-arrow-side-left.driver-popover-arrow,
  .driver-popover-arrow-side-right.driver-popover-arrow,
  .driver-popover-arrow-side-top.driver-popover-arrow,
  .driver-popover-arrow-side-bottom.driver-popover-arrow {
    border-color: #ffffff;
  }
  
  .driver-popover-footer {
    padding: 12px 20px 20px 20px;
    border-top: 1px solid #f3f4f6;
    margin-top: 8px;
  }
  
  /* Mobile styles */
  @media (max-width: 768px) {
    .driver-popover {
      max-width: calc(100vw - 32px);
      margin: 0 16px;
      border-radius: 12px;
    }
    
    .driver-popover-title {
      font-size: 16px;
      padding: 16px 16px 8px 16px;
    }
    
    .driver-popover-description {
      font-size: 13px;
      padding: 0 16px 12px 16px;
    }
    
    .driver-popover-footer {
      padding: 12px 16px 16px 16px;
    }
    
    .driver-popover-next-btn,
    .driver-popover-prev-btn {
      padding: 10px 16px;
      min-height: 44px;
    }
  }
  
  /* Overlay styles */
  .tour-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  
  .tour-card {
    background: white;
    border-radius: 20px;
    padding: 32px;
    max-width: 420px;
    width: 100%;
    text-align: center;
    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.2);
    animation: slideUp 0.4s ease-out;
  }
  
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .tour-emoji {
    font-size: 64px;
    margin-bottom: 16px;
  }
  
  .tour-title {
    font-size: 24px;
    font-weight: 700;
    color: #005b57;
    margin-bottom: 12px;
  }
  
  .tour-description {
    font-size: 15px;
    color: #6b7280;
    line-height: 1.6;
    margin-bottom: 24px;
  }
  
  .tour-highlight {
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    border: 1px solid #a7f3d0;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
  }
  
  .tour-highlight p {
    color: #065f46;
    font-size: 14px;
    margin: 0;
  }
  
  .tour-checklist {
    text-align: left;
    background: #f9fafb;
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 24px;
  }
  
  .tour-checklist-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    color: #374151;
    font-size: 14px;
  }
  
  .tour-checklist-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  
  .tour-primary-btn {
    background: linear-gradient(135deg, #005b57 0%, #00857f 100%);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 14px 32px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    transition: all 0.2s ease;
    box-shadow: 0 8px 20px rgba(0, 91, 87, 0.3);
  }
  
  .tour-primary-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 28px rgba(0, 91, 87, 0.4);
  }
  
  .tour-skip-btn {
    margin-top: 16px;
    background: none;
    border: none;
    color: #9ca3af;
    font-size: 14px;
    cursor: pointer;
    padding: 8px;
  }
  
  .tour-skip-btn:hover {
    color: #6b7280;
  }
  
  @media (max-width: 768px) {
    .tour-card {
      padding: 24px;
      margin: 16px;
    }
    
    .tour-emoji {
      font-size: 48px;
    }
    
    .tour-title {
      font-size: 20px;
    }
    
    .tour-description {
      font-size: 14px;
    }
  }
`;

// Sidebar steps for mobile navigation
const getMobileSidebarSteps = (): DriveStep[] => [
  {
    element: '#mobile-menu-trigger',
    popover: {
      title: '📂 Access Your Menu',
      description: 'Click this button to open the sidebar. You can access Appointments, Patients, and Settings here.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '#nav-item-dashboard',
    popover: {
      title: '📊 Dashboard',
      description: 'Your central hub for practice overview.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '#nav-item-patients',
    popover: {
      title: '👥 Patients',
      description: 'Manage your patient list and records.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '#nav-item-settings',
    popover: {
      title: '⚙️ Settings',
      description: 'Configure your profile, availability and payments.',
      side: 'right',
      align: 'center',
    },
  }
];

// Tour steps for dashboard (works on both desktop and mobile)
const DASHBOARD_STEPS: DriveStep[] = [
  {
    element: '#tour-add-patient-btn',
    popover: {
      title: '➕ Invite Your First Patient',
      description: 'Click here to send an invitation to your patients. They\'ll receive an email to join Rehabify and connect with you.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-metrics-grid',
    popover: {
      title: '📈 Your Key Metrics',
      description: 'Track your practice at a glance - total patients, appointments, sessions, and pending invites. These update in real-time.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-todays-schedule',
    popover: {
      title: '🗓️ Today\'s Schedule',
      description: 'Your upcoming appointments for today. Click on any appointment to view details or start a video call.',
      side: 'top',
      align: 'center',
    },
  },
];

// Settings steps for DESKTOP only (sidebar visible)
const SETTINGS_STEPS_DESKTOP: DriveStep[] = [
  {
    element: '#settings-nav-profile',
    popover: {
      title: '👤 Complete Your Profile',
      description: 'Add your photo, bio, and specializations. A complete profile builds trust with patients.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#settings-nav-availability',
    popover: {
      title: '⏰ Set Your Availability',
      description: 'Define when you\'re available for appointments. Patients can only book during these times.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#settings-nav-marketplace',
    popover: {
      title: '🚀 Go Live on Marketplace!',
      description: 'Toggle your profile visibility ON to appear in the Rehabify marketplace. Patients can discover and book you directly!',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#settings-nav-payout',
    popover: {
      title: '💰 Link Your Bank Account',
      description: 'Connect your bank account to receive payments from patients. This is required before you can accept paid appointments.',
      side: 'right',
      align: 'start',
    },
  },
];

interface PhysiotherapistTourProps {
  forceShow?: boolean;
}

export function PhysiotherapistTour({ forceShow = false }: PhysiotherapistTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [showWelcome, setShowWelcome] = useState(false);
  const [showMobileSettingsGuide, setShowMobileSettingsGuide] = useState(false);
  const [driverInstance, setDriverInstance] = useState<Driver | null>(null);
  const [tourPhase, setTourPhase] = useState<'idle' | 'dashboard' | 'settings' | 'complete'>('idle');
  const [isMobile, setIsMobile] = useState(false);
  const { openMobile, closeMobile } = useSidebarStore();

  // Get onboarding status from Convex
  const onboardingStatus = useQuery(api.users.getOnboardingStatus);
  const completeOnboardingMutation = useMutation(api.users.completeOnboarding);

  // Check for mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Check if tour should be shown
  useEffect(() => {
    if (forceShow) {
      setShowWelcome(true);
      return;
    }

    // Check localStorage first
    const localCompleted = localStorage.getItem('hasCompletedOnboarding');
    const localVersion = localStorage.getItem('onboardingVersion');

    if (localCompleted === 'true' && Number(localVersion) >= TOUR_VERSION) {
      return; // Tour already completed
    }

    // Check Convex status
    if (onboardingStatus) {
      if (onboardingStatus.hasCompletedOnboarding && onboardingStatus.onboardingVersion >= TOUR_VERSION) {
        // Sync to localStorage
        localStorage.setItem('hasCompletedOnboarding', 'true');
        localStorage.setItem('onboardingVersion', String(TOUR_VERSION));
        return;
      }

      // Show welcome modal
      setShowWelcome(true);
    }
  }, [onboardingStatus, forceShow]);

  // Inject custom styles
  useEffect(() => {
    const styleId = 'driver-custom-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = CUSTOM_STYLES;
      document.head.appendChild(style);
    }

    return () => {
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  // Complete the tour
  const completeTour = useCallback(async () => {
    setShowWelcome(false);
    setShowMobileSettingsGuide(false);
    setTourPhase('complete');

    // Optimistic update
    localStorage.setItem('hasCompletedOnboarding', 'true');
    localStorage.setItem('onboardingVersion', String(TOUR_VERSION));

    // Persist to backend
    try {
      await completeOnboardingMutation({ version: TOUR_VERSION });
    } catch (error) {
      console.error('Failed to save onboarding status:', error);
    }

    // Clean up driver instance
    if (driverInstance) {
      driverInstance.destroy();
      setDriverInstance(null);
    }
  }, [completeOnboardingMutation, driverInstance]);

  // Start the dashboard tour
  const startDashboardTour = useCallback(() => {
    setShowWelcome(false);
    setTourPhase('dashboard');

    // Ensure we're on the dashboard page
    if (!pathname.includes('/dashboard/physiotherapist') || pathname.includes('/settings')) {
      router.push('/dashboard/physiotherapist');
      // Wait for navigation and DOM to be ready
      setTimeout(() => {
        initDashboardDriver();
      }, 800);
    } else {
      // Already on dashboard, start directly
      setTimeout(() => {
        initDashboardDriver();
      }, 300);
    }
  }, [pathname, router]);

  const initDashboardDriver = useCallback(() => {
    const isMobileView = window.innerWidth < 768;

    let steps = [...DASHBOARD_STEPS];

    // If mobile, prepend sidebar steps (starting with hamburger)
    if (isMobileView) {
      steps = [...getMobileSidebarSteps(), ...DASHBOARD_STEPS];
    }

    // Filter steps to only those whose elements exist
    const availableSteps = steps.filter(step => {
      const el = document.querySelector(step.element as string);
      return el !== null;
    });

    if (availableSteps.length === 0) {
      goToSettingsTour();
      return;
    }

    const driverObj = driver({
      showProgress: true,
      steps: availableSteps,
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Continue to Settings →',
      progressText: '{{current}} of {{total}}',
      allowClose: true,
      overlayColor: 'rgba(0, 0, 0, 0.7)',
      stagePadding: 8,
      stageRadius: 8,
      popoverOffset: 12,
      onCloseClick: () => {
        driverObj.destroy();
        completeTour();
      },
      onPopoverRender: (popover, { state }) => {
        const activeIndex = state.activeIndex;
        const currentStep = availableSteps[activeIndex];

        // Mobile Sidebar Logic
        if (isMobileView) {
          // Step 0: Hamburger menu (Click to open sidebar)
          if (activeIndex === 0) {
            // Make sure sidebar is CLOSED initially
            // We don't force close here to avoid jitter, but we assume it's closed
          }

          // Steps 1, 2, 3: Sidebar items (Dashboard, Patients, Settings)
          // Open sidebar if we are navigating TO these steps
          if (activeIndex >= 1 && activeIndex <= 3) {
            openMobile();
          }

          // Step 4+: Dashboard content (Close sidebar)
          if (activeIndex >= 4) {
            closeMobile();
          }
        }
      },
      onDestroyed: () => {
        // Tour finished, go to settings
        if (tourPhase === 'dashboard') {
          goToSettingsTour();
        }
      },
    });

    setDriverInstance(driverObj);
    driverObj.drive();
  }, [completeTour, tourPhase, openMobile, closeMobile]);

  // Go to settings tour
  const goToSettingsTour = useCallback(() => {
    // Clean up existing driver
    if (driverInstance) {
      driverInstance.destroy();
      setDriverInstance(null);
    }

    setTourPhase('settings');

    // On mobile, show the mobile settings guide modal instead of trying to highlight hidden sidebar
    if (isMobile) {
      setShowMobileSettingsGuide(true);
      return;
    }

    // Desktop: Navigate to settings and run driver
    router.push('/dashboard/physiotherapist/settings');

    // Wait for navigation and DOM
    setTimeout(() => {
      initSettingsDriver();
    }, 1000);
  }, [router, driverInstance, isMobile]);

  const initSettingsDriver = useCallback(() => {
    // Filter steps to only those whose elements exist
    const availableSteps = SETTINGS_STEPS_DESKTOP.filter(step => {
      const el = document.querySelector(step.element as string);
      return el !== null;
    });

    if (availableSteps.length === 0) {
      // No elements found, complete tour
      completeTour();
      return;
    }

    const driverObj = driver({
      showProgress: true,
      steps: availableSteps,
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Finish Tour 🎉',
      progressText: '{{current}} of {{total}}',
      allowClose: true,
      overlayColor: 'rgba(0, 0, 0, 0.7)',
      stagePadding: 8,
      stageRadius: 8,
      popoverOffset: 12,
      onCloseClick: () => {
        driverObj.destroy();
        completeTour();
      },
      onDestroyed: () => {
        completeTour();
      },
    });

    setDriverInstance(driverObj);
    driverObj.drive();
  }, [completeTour]);

  // Handle mobile settings guide completion
  const handleMobileSettingsComplete = useCallback(() => {
    setShowMobileSettingsGuide(false);
    router.push('/dashboard/physiotherapist/settings/profile');
    completeTour();
  }, [router, completeTour]);

  // Skip tour handler
  const skipTour = useCallback(() => {
    completeTour();
  }, [completeTour]);

  // Welcome modal
  if (showWelcome) {
    return (
      <div className="tour-overlay">
        <div className="tour-card">
          <div className="tour-emoji">🎉</div>
          <h2 className="tour-title">Welcome to Rehabify Health!</h2>
          <p className="tour-description">
            Congratulations on being approved! Let&apos;s take a quick tour to help you get started and make the most of your dashboard.
          </p>
          <div className="tour-highlight">
            <p>
              <strong>⚡ This tour is important!</strong><br />
              You&apos;ll learn how to set up your profile, go live on the marketplace, and start accepting patients.
            </p>
          </div>
          <button
            className="tour-primary-btn"
            onClick={startDashboardTour}
          >
            🚀 Start the Tour
          </button>
          <button
            className="tour-skip-btn"
            onClick={skipTour}
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // Mobile Settings Guide (shown instead of driver on mobile)
  if (showMobileSettingsGuide) {
    return (
      <div className="tour-overlay">
        <div className="tour-card">
          <div className="tour-emoji">⚙️</div>
          <h2 className="tour-title">Set Up Your Practice</h2>
          <p className="tour-description">
            Complete these important settings to start accepting patients:
          </p>

          <div className="tour-checklist">
            <div className="tour-checklist-item">
              <span className="tour-checklist-icon">👤</span>
              <span><strong>Profile</strong> - Add photo, bio & specializations</span>
            </div>
            <div className="tour-checklist-item">
              <span className="tour-checklist-icon">⏰</span>
              <span><strong>Availability</strong> - Set your working hours</span>
            </div>
            <div className="tour-checklist-item">
              <span className="tour-checklist-icon">🚀</span>
              <span><strong>Marketplace</strong> - Toggle visibility ON</span>
            </div>
            <div className="tour-checklist-item">
              <span className="tour-checklist-icon">💰</span>
              <span><strong>Payout</strong> - Connect your bank account</span>
            </div>
          </div>

          <button
            className="tour-primary-btn"
            onClick={handleMobileSettingsComplete}
          >
            Go to Settings 🚀
          </button>
          <button
            className="tour-skip-btn"
            onClick={skipTour}
          >
            I&apos;ll do this later
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default PhysiotherapistTour;
