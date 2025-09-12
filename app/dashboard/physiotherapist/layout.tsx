import React from 'react'
import PhysiotherapistGuard from '@/components/auth/PhysiotherapistGuard'

export default function PhysiotherapistLayout({ children }: { children: React.ReactNode }) {
  return (
    <PhysiotherapistGuard>
      {children}
    </PhysiotherapistGuard>
  )
}
