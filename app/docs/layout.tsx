import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';
import Link from 'next/link';

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      search={{
        enabled: true,
      }}
    >
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: (
            <div className="flex items-center gap-2.5 font-bold text-base text-gray-900 dark:text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-white font-bold text-sm shadow-sm">
                R
              </span>
              <span className="tracking-tight">
                Rehabify <span className="text-teal-600 font-semibold text-xs bg-teal-50 dark:bg-teal-950/80 dark:text-teal-400 px-2 py-0.5 rounded-full border border-teal-200/60 dark:border-teal-800/60">DEVELOPER</span>
              </span>
            </div>
          ),
          url: '/docs',
        }}
        links={[
          {
            text: 'Partnerships',
            url: '/partnerships',
            active: 'nested-url',
          },
          {
            text: 'Main Platform',
            url: '/',
          },
        ]}
        githubUrl="https://github.com/Aleshbass/RH"
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
