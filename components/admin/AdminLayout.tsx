'use client'


import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AdminSidebar } from './AdminSidebar'
import { AdminCheck } from './AdminCheck'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { usePathname } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { ShieldCheck } from 'lucide-react'

interface AdminLayoutProps {
  children: React.ReactNode
  defaultOpen?: boolean
}

function getBreadcrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean)
  const breadcrumbs = []
  
  // Always start with Dashboard
  breadcrumbs.push({
    href: '/dashboard',
    label: 'Dashboard',
  })
  
  // Add admin specific breadcrumbs
  if (segments.includes('admin')) {
    const adminIndex = segments.indexOf('admin')
    const adminPath = segments.slice(0, adminIndex + 1).join('/')
    
    breadcrumbs.push({
      href: `/${adminPath}`,
      label: 'Admin',
    })
    
    // Add sub-pages
    const subPages = segments.slice(adminIndex + 1)
    let currentPath = `/${adminPath}`
    
    subPages.forEach((segment, index) => {
      currentPath += `/${segment}`
      const isLast = index === subPages.length - 1
      
      const labelMap: Record<string, string> = {
        users: 'User Management',
        approvals: 'Account Approvals',
        analytics: 'Platform Analytics',
        roles: 'Role Management',
        activity: 'User Activity',
        health: 'System Health',
        exercises: 'Exercise Library',
        cpd: 'CPD Courses',
        moderation: 'Content Moderation',
        system: 'System Settings',
        emails: 'Email Templates',
        security: 'Security Settings',
        announcements: 'Announcements',
        preferences: 'Admin Preferences',
      }
      
      breadcrumbs.push({
        href: isLast ? undefined : currentPath,
        label: labelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1),
      })
    })
  }
  
  return breadcrumbs
}

export function AdminLayout({ children, defaultOpen = true }: AdminLayoutProps) {
  const pathname = usePathname()
  const breadcrumbs = getBreadcrumbs(pathname)
  
  return (
    <AdminCheck>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AdminSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            
            {/* Breadcrumb */}
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((breadcrumb, index) => (
                  <div key={breadcrumb.label} className="flex items-center">
                    <BreadcrumbItem>
                      {breadcrumb.href ? (
                        <BreadcrumbLink href={breadcrumb.href}>
                          {breadcrumb.label}
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage className="font-medium">
                          {breadcrumb.label}
                        </BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                    {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                  </div>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
            
            {/* Admin Badge */}
            <div className="ml-auto">
              <Badge variant="secondary" className="flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3" />
                Admin Dashboard
              </Badge>
            </div>
          </header>
          
          <div className="flex flex-1 flex-col gap-4 p-4">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AdminCheck>
  )
}

// For Next.js App Router with server-side rendering
export async function AdminLayoutServer({ 
  children, 
}: { 
  children: React.ReactNode 
}) {
  // This would be used in a server component to get the default open state
  // const cookieStore = await cookies()
  // const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true'
  
  // For now, we'll use client-side state management
  return <AdminLayout defaultOpen={true}>{children}</AdminLayout>
} 