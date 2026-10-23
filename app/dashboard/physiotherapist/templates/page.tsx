'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from '@/components/icons'

export default function TemplatesRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/physiotherapist/treatment-templates')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
        <p className="text-gray-600">Redirecting...</p>
      </div>
    </div>
  )
}