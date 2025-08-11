'use client';

import React, { useEffect, useState } from 'react';
import { useCookieConsent } from '@/hooks/useCookieConsent';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cookie, Shield, Eye, Settings, CheckCircle, XCircle } from 'lucide-react';

export default function CookieTestPage() {
  const [mounted, setMounted] = useState(false);
  const [cookiebotLoaded, setCookiebotLoaded] = useState(false);
  const [domainGroupId, setDomainGroupId] = useState('');
  
  const {
    consent,
    consented,
    declined,
    hasResponse,
    doNotTrack,
    isGDPRApplicable,
    isCCPAApplicable,
    showConsentDialog,
    canUseAnalytics,
    canUseMarketing,
  } = useCookieConsent();

  useEffect(() => {
    setMounted(true);
    
    // Check if Cookiebot is loaded
    const checkCookiebot = () => {
      if (typeof window !== 'undefined') {
        setCookiebotLoaded(!!window.Cookiebot);
        setDomainGroupId(process.env.NEXT_PUBLIC_COOKIEBOT_DOMAIN_GROUP_ID || 'Not set');
      }
    };

    checkCookiebot();
    const interval = setInterval(checkCookiebot, 1000);
    
    return () => clearInterval(interval);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Cookie className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold">Cookie Consent Test Page</h1>
          </div>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page tests the ReactCookiebot integration and displays real-time consent status.
          </p>
        </div>

        {/* Integration Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              ReactCookiebot Integration Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {cookiebotLoaded ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className="font-medium">
                    Cookiebot Script: {cookiebotLoaded ? 'Loaded' : 'Not Loaded'}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  <strong>Domain Group ID:</strong> {domainGroupId}
                </div>
                <div className="text-sm text-gray-600">
                  <strong>Environment:</strong> {process.env.NODE_ENV}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {hasResponse ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-orange-600" />
                  )}
                  <span className="font-medium">
                    User Response: {hasResponse ? 'Given' : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {consented ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : declined ? (
                    <XCircle className="h-5 w-5 text-red-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-gray-400" />
                  )}
                  <span className="font-medium">
                    Consent Status: {consented ? 'Consented' : declined ? 'Declined' : 'No Response'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex justify-center">
              <Button onClick={showConsentDialog} className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Show Cookie Consent Dialog
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Consent Categories */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Cookie Consent Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-white rounded-lg border">
                <Badge 
                  variant={consent.necessary ? "default" : "secondary"}
                  className="mb-2"
                >
                  Necessary
                </Badge>
                <p className="text-sm font-medium">
                  {consent.necessary ? 'Enabled' : 'Disabled'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Required for platform functionality
                </p>
              </div>
              
              <div className="text-center p-4 bg-white rounded-lg border">
                <Badge 
                  variant={consent.preferences ? "default" : "secondary"}
                  className="mb-2"
                >
                  Preferences
                </Badge>
                <p className="text-sm font-medium">
                  {consent.preferences ? 'Enabled' : 'Disabled'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  User preferences and settings
                </p>
              </div>
              
              <div className="text-center p-4 bg-white rounded-lg border">
                <Badge 
                  variant={consent.statistics ? "default" : "secondary"}
                  className="mb-2"
                >
                  Analytics
                </Badge>
                <p className="text-sm font-medium">
                  {canUseAnalytics ? 'Enabled' : 'Disabled'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Usage analytics and tracking
                </p>
              </div>
              
              <div className="text-center p-4 bg-white rounded-lg border">
                <Badge 
                  variant={consent.marketing ? "default" : "secondary"}
                  className="mb-2"
                >
                  Marketing
                </Badge>
                <p className="text-sm font-medium">
                  {canUseMarketing ? 'Enabled' : 'Disabled'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Marketing and advertising
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compliance Status */}
        <Card>
          <CardHeader>
            <CardTitle>Compliance & Regulations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <Badge variant={isGDPRApplicable ? "default" : "secondary"} className="mb-2">
                  GDPR
                </Badge>
                <p className="text-sm">
                  {isGDPRApplicable ? 'Applicable' : 'Not Applicable'}
                </p>
              </div>
              
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <Badge variant={isCCPAApplicable ? "default" : "secondary"} className="mb-2">
                  CCPA
                </Badge>
                <p className="text-sm">
                  {isCCPAApplicable ? 'Applicable' : 'Not Applicable'}
                </p>
              </div>
              
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <Badge variant={doNotTrack ? "destructive" : "default"} className="mb-2">
                  Do Not Track
                </Badge>
                <p className="text-sm">
                  {doNotTrack ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conditional Content Examples */}
        <Card>
          <CardHeader>
            <CardTitle>Conditional Content Examples</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canUseAnalytics ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-semibold text-green-800">✅ Analytics Content Visible</h4>
                <p className="text-sm text-green-700 mt-1">
                  This content is only shown when analytics cookies are accepted.
                  Google Analytics, tracking pixels, and usage analytics would load here.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h4 className="font-semibold text-gray-600">❌ Analytics Content Hidden</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Analytics content is hidden because analytics cookies are not accepted.
                </p>
              </div>
            )}

            {canUseMarketing ? (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <h4 className="font-semibold text-purple-800">✅ Marketing Content Visible</h4>
                <p className="text-sm text-purple-700 mt-1">
                  This content is only shown when marketing cookies are accepted.
                  Advertising pixels, remarketing tags, and promotional content would load here.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h4 className="font-semibold text-gray-600">❌ Marketing Content Hidden</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Marketing content is hidden because marketing cookies are not accepted.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Debug Information */}
        <Card>
          <CardHeader>
            <CardTitle>Debug Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <pre>{JSON.stringify({
                cookiebotLoaded,
                domainGroupId,
                consent,
                consented,
                declined,
                hasResponse,
                doNotTrack,
                isGDPRApplicable,
                isCCPAApplicable,
                canUseAnalytics,
                canUseMarketing,
                windowCookiebot: typeof window !== 'undefined' ? !!window.Cookiebot : false,
              }, null, 2)}</pre>
            </div>
          </CardContent>
        </Card>

        {/* Cookiebot Integration Note */}
        <Card>
          <CardHeader>
            <CardTitle>Cookiebot Integration</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Cookiebot is integrated globally in the app layout with group ID: 48b36e33-f5f8-41b6-a59d-fb929da85bcf
            </p>
            <p className="text-sm text-gray-600 mt-2">
              Cookie consent banner and preferences are managed by Cookiebot automatically.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
