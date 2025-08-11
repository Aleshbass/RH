declare module 'react-cookiebot' {
  import { ComponentType } from 'react';

  export interface CookiebotProps {
    /**
     * Your Cookiebot domain group ID
     */
    domainGroupId: string;
    
    /**
     * Blocking mode for cookie consent
     * @default "auto"
     */
    blockingMode?: 'auto' | 'manual';
    
    /**
     * Consent level
     * @default "strict"
     */
    level?: 'strict' | 'bulk';
    
    /**
     * Language/culture code
     * @default "en"
     */
    culture?: string;
    
    /**
     * Framework compliance
     * @default "TCFv2.2"
     */
    framework?: 'TCFv2.2' | 'TCFv2.0' | 'IAB';
    
    /**
     * Custom CSS for the consent banner
     */
    customCSS?: string;
    
    /**
     * Callback function when consent is given
     */
    onAccept?: () => void;
    
    /**
     * Callback function when consent is declined
     */
    onDecline?: () => void;
    
    /**
     * Callback function when consent dialog is loaded
     */
    onLoad?: () => void;
  }

  /**
   * ReactCookiebot component for cookie consent management
   */
  const ReactCookiebot: ComponentType<CookiebotProps>;
  
  export default ReactCookiebot;

  /**
   * Global Cookiebot object available after initialization
   */
  declare global {
    interface Window {
      Cookiebot?: {
        consent: {
          marketing: boolean;
          statistics: boolean;
          preferences: boolean;
          necessary: boolean;
        };
        consented: boolean;
        declined: boolean;
        hasResponse: boolean;
        doNotTrack: boolean;
        regulations: {
          gdprApplies: boolean;
          ccpaApplies: boolean;
        };
        show: () => void;
        hide: () => void;
        renew: () => void;
        getScript: (category: string, async?: boolean) => void;
        runScripts: () => void;
      };
    }
  }
}
