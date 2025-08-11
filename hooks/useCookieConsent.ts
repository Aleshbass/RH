import React, { useState, useEffect } from 'react';

export interface CookieConsentState {
  necessary: boolean;
  preferences: boolean;
  statistics: boolean;
  marketing: boolean;
}

export interface CookieConsentHook {
  consent: CookieConsentState;
  consented: boolean;
  declined: boolean;
  hasResponse: boolean;
  doNotTrack: boolean;
  isGDPRApplicable: boolean;
  isCCPAApplicable: boolean;
  showConsentDialog: () => void;
  hideConsentDialog: () => void;
  renewConsent: () => void;
  isConsentGiven: (category?: keyof CookieConsentState) => boolean;
  canUseAnalytics: boolean;
  canUseMarketing: boolean;
}

/**
 * Hook for managing cookie consent with Cookiebot
 * Provides easy access to consent status and controls
 */
export const useCookieConsent = (): CookieConsentHook => {
  const [consent, setConsent] = useState<CookieConsentState>({
    necessary: true, // Always true as necessary cookies are required
    preferences: false,
    statistics: false,
    marketing: false,
  });

  const [consented, setConsented] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [hasResponse, setHasResponse] = useState(false);
  const [doNotTrack, setDoNotTrack] = useState(false);
  const [isGDPRApplicable, setIsGDPRApplicable] = useState(false);
  const [isCCPAApplicable, setIsCCPAApplicable] = useState(false);

  useEffect(() => {
    // Check if Cookiebot is available
    const checkCookiebot = () => {
      if (typeof window !== 'undefined' && window.Cookiebot) {
        const cb = window.Cookiebot;
        
        // Update consent state
        setConsent({
          necessary: cb.consent.necessary,
          preferences: cb.consent.preferences,
          statistics: cb.consent.statistics,
          marketing: cb.consent.marketing,
        });

        // Update other states
        setConsented(cb.consented);
        setDeclined(cb.declined);
        setHasResponse(cb.hasResponse);
        setDoNotTrack(cb.doNotTrack);
        setIsGDPRApplicable(cb.regulations?.gdprApplies || false);
        setIsCCPAApplicable(cb.regulations?.ccpaApplies || false);
      }
    };

    // Initial check
    checkCookiebot();

    // Set up interval to check for changes
    const interval = setInterval(checkCookiebot, 1000);

    // Listen for Cookiebot events if available
    if (typeof window !== 'undefined') {
      const handleConsentChanged = () => {
        checkCookiebot();
      };

      // Add event listeners for Cookiebot events
      window.addEventListener('CookiebotOnAccept', handleConsentChanged);
      window.addEventListener('CookiebotOnDecline', handleConsentChanged);
      window.addEventListener('CookiebotOnDialogInit', handleConsentChanged);

      return () => {
        clearInterval(interval);
        window.removeEventListener('CookiebotOnAccept', handleConsentChanged);
        window.removeEventListener('CookiebotOnDecline', handleConsentChanged);
        window.removeEventListener('CookiebotOnDialogInit', handleConsentChanged);
      };
    }

    return () => clearInterval(interval);
  }, []);

  const showConsentDialog = () => {
    if (typeof window !== 'undefined' && window.Cookiebot) {
      window.Cookiebot.show();
    }
  };

  const hideConsentDialog = () => {
    if (typeof window !== 'undefined' && window.Cookiebot) {
      window.Cookiebot.hide();
    }
  };

  const renewConsent = () => {
    if (typeof window !== 'undefined' && window.Cookiebot) {
      window.Cookiebot.renew();
    }
  };

  const isConsentGiven = (category?: keyof CookieConsentState): boolean => {
    if (!category) {
      return consented;
    }
    return consent[category];
  };

  // Convenience properties for common use cases
  const canUseAnalytics = consent.statistics;
  const canUseMarketing = consent.marketing;

  return {
    consent,
    consented,
    declined,
    hasResponse,
    doNotTrack,
    isGDPRApplicable,
    isCCPAApplicable,
    showConsentDialog,
    hideConsentDialog,
    renewConsent,
    isConsentGiven,
    canUseAnalytics,
    canUseMarketing,
  };
};

/**
 * Higher-order component to conditionally render content based on cookie consent
 */
export const withCookieConsent = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  requiredCategory: keyof CookieConsentState
) => {
  return (props: P) => {
    const { isConsentGiven } = useCookieConsent();
    
    if (!isConsentGiven(requiredCategory)) {
      return null;
    }
    
    return React.createElement(WrappedComponent, props);
  };
};

/**
 * Utility function to check if a specific cookie category is consented
 * Useful for conditional loading of third-party scripts
 */
export const checkCookieConsent = (category: keyof CookieConsentState): boolean => {
  if (typeof window === 'undefined' || !window.Cookiebot) {
    return false;
  }
  
  return window.Cookiebot.consent[category];
};

/**
 * Utility function to load scripts conditionally based on cookie consent
 */
export const loadScriptWithConsent = (
  category: keyof CookieConsentState,
  scriptSrc: string,
  async: boolean = true
): void => {
  if (typeof window === 'undefined') return;
  
  if (checkCookieConsent(category)) {
    const script = document.createElement('script');
    script.src = scriptSrc;
    script.async = async;
    document.head.appendChild(script);
  }
};
