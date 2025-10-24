/**
 * Homepage SEO Component
 * 
 * Injects critical structured data for the homepage
 * to help search engines understand RehabifyHealth
 */

'use client';

import { OrganizationSchema, WebSiteSchema } from './StructuredData';

export function HomePageSEO() {
  return (
    <>
      <OrganizationSchema />
      <WebSiteSchema />
    </>
  );
}
