/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.SITE_URL || 'https://physioaroundme.com',
  generateRobotsTxt: true, // (optional)
  sitemapSize: 7000,
  exclude: ['/dashboard/*', '/admin/*', '/auth/*'], // Exclude private routes
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/admin', '/auth'],
      },
    ],
  },
};
