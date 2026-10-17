import { MetadataRoute } from 'next';

/**
 * Dynamic Sitemap Generation for RehabifyHealth
 * 
 * This generates an XML sitemap that tells search engines:
 * - All public pages on the site
 * - How often they change (changeFrequency)
 * - Their importance relative to other pages (priority)
 * - When they were last modified
 * 
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://physioaroundme.com';
  const currentDate = new Date();

  // Static routes with SEO priority
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1.0, // Highest priority for homepage
    },
    {
      url: `${baseUrl}/sign-up`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.9, // High priority for conversion page
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.8, // Important for SEO content
    },
    {
      url: `${baseUrl}/learn`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8, // MSK Specialist Program (cohort dates change per intake)
    },
    // Legal pages - HTML format for better SEO and accessibility
    {
      url: `${baseUrl}/terms-and-conditions`,
      lastModified: new Date('2025-10-02'),
      changeFrequency: 'yearly',
      priority: 0.5, // Increased priority for HTML pages
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: new Date('2025-10-02'),
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/payment-policy`,
      lastModified: new Date('2025-10-02'),
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    // Add more public routes as your site grows
    // Examples:
    // {
    //   url: `${baseUrl}/about`,
    //   lastModified: currentDate,
    //   changeFrequency: 'monthly',
    //   priority: 0.7,
    // },
    // {
    //   url: `${baseUrl}/pricing`,
    //   lastModified: currentDate,
    //   changeFrequency: 'weekly',
    //   priority: 0.8,
    // },
    // {
    //   url: `${baseUrl}/how-it-works`,
    //   lastModified: currentDate,
    //   changeFrequency: 'monthly',
    //   priority: 0.7,
    // },
    // {
    //   url: `${baseUrl}/contact`,
    //   lastModified: currentDate,
    //   changeFrequency: 'monthly',
    //   priority: 0.6,
    // },
  ];

  // TODO: Add dynamic routes from your database
  // Examples of what you can add when you have the data:
  
  // 1. Blog posts (if you have a blog)
  // const blogPosts = await getBlogPosts();
  // const blogRoutes: MetadataRoute.Sitemap = blogPosts.map((post) => ({
  //   url: `${baseUrl}/blog/${post.slug}`,
  //   lastModified: post.updatedAt || post.createdAt,
  //   changeFrequency: 'weekly',
  //   priority: 0.6,
  // }));

  // 2. Public physiotherapist profiles (if you want them indexed)
  // const physiotherapists = await getPublicPhysiotherapists();
  // const physioRoutes: MetadataRoute.Sitemap = physiotherapists.map((physio) => ({
  //   url: `${baseUrl}/physiotherapists/${physio.id}`,
  //   lastModified: physio.updatedAt,
  //   changeFrequency: 'weekly',
  //   priority: 0.5,
  // }));

  // 3. Educational content/resources
  // const resources = await getResources();
  // const resourceRoutes: MetadataRoute.Sitemap = resources.map((resource) => ({
  //   url: `${baseUrl}/resources/${resource.slug}`,
  //   lastModified: resource.updatedAt,
  //   changeFrequency: 'monthly',
  //   priority: 0.5,
  // }));

  return [
    ...staticRoutes,
    // ...blogRoutes,
    // ...physioRoutes,
    // ...resourceRoutes,
  ];
}

/**
 * SITEMAP BEST PRACTICES:
 * 
 * 1. PRIORITY GUIDELINES:
 *    - 1.0: Homepage only
 *    - 0.8-0.9: Key conversion pages (signup, pricing)
 *    - 0.6-0.7: Important content (blog, about, services)
 *    - 0.4-0.5: Secondary pages (individual blog posts, profiles)
 * 
 * 2. CHANGE FREQUENCY:
 *    - 'always': Real-time content (rarely used)
 *    - 'hourly': Very dynamic content
 *    - 'daily': Frequently updated (blog index, homepage)
 *    - 'weekly': Regular updates (blog posts, profiles)
 *    - 'monthly': Occasional updates (about, pricing)
 *    - 'yearly': Static content (legal pages)
 *    - 'never': Archived content
 * 
 * 3. SIZE LIMITS:
 *    - Max 50,000 URLs per sitemap
 *    - Max 50MB uncompressed
 *    - For larger sites, create a sitemap index
 * 
 * 4. WHAT TO INCLUDE:
 *    ✅ All public pages users can access
 *    ✅ Blog posts and articles
 *    ✅ Service/product pages
 *    ✅ Category/archive pages
 * 
 * 5. WHAT TO EXCLUDE:
 *    ❌ Login/signup pages (can include in robots allow though)
 *    ❌ Dashboard/admin pages
 *    ❌ API routes
 *    ❌ Duplicate content
 *    ❌ Low-value pages (thank you pages, etc.)
 */
