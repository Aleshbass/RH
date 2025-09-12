'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import FileUpload from '@/components/ui/FileUpload'
import { usePatientDocuments, type PatientDocument, type PatientDocumentType } from '@/lib/hooks/usePatientDocuments'
import { format } from 'date-fns'
import { Download, FileText, Filter, Loader2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Id } from '@/convex/_generated/dataModel'

export default function PatientRecordsPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const user = useQuery(api.users.getMyUser) as (null | { role?: string; patientProfileId?: Id<'patientProfiles'> } | undefined)
  const patientProfileId = user?.patientProfileId as Id<'patientProfiles'> | undefined

  // Documents hook and UI state MUST be defined before any early returns to satisfy rules-of-hooks
  const {
    documents = [],
    isLoadingDocuments,
    documentsError,
    uploadPatientDocument,
    isUploadingPatientDocument,
    uploadProgress,
    uploadError,
  } = usePatientDocuments({ patientProfileId })

  // UI state
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | PatientDocumentType>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest')
  const [selectedType, setSelectedType] = useState<PatientDocumentType>('medicalRecord')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const isUploadingRef = useRef(false)

  const filteredDocs = useMemo(() => {
    let list = (documents as PatientDocument[]) || []
    if (typeFilter !== 'all') {
      list = list.filter(d => d.documentType === typeFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d => d.fileName.toLowerCase().includes(q))
    }
    switch (sortOrder) {
      case 'newest':
        list = [...list].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))
        break
      case 'oldest':
        list = [...list].sort((a, b) => (a.uploadedAt || 0) - (b.uploadedAt || 0))
        break
      case 'name':
        list = [...list].sort((a, b) => a.fileName.localeCompare(b.fileName))
        break
    }
    return list
  }, [documents, typeFilter, search, sortOrder])

  // Redirect unauthenticated users
  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      router.push('/sign-in')
      return
    }
  }, [isLoaded, isSignedIn, router])

  // Role guard: only patients
  useEffect(() => {
    if (!user) return
    if (user && user.role !== 'patient') {
      router.push('/dashboard')
    }
  }, [user, router])

  // Loading state while auth/user are loading
  if (!isLoaded || user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Preparing your records...</p>
        </div>
      </div>
    )
  }

  if (user === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-600">User not found. Please try signing in again.</p>
      </div>
    )
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // filteredDocs defined above to satisfy rules-of-hooks

  const handleUpload = async () => {
    if (!patientProfileId) {
      toast.error('Your patient profile is not available. Please try again later.')
      return
    }
    if (!selectedFile) {
      toast.error('Please select a file to upload')
      return
    }
    try {
      isUploadingRef.current = true
      await uploadPatientDocument(selectedFile, selectedType, patientProfileId)
      toast.success('Document uploaded successfully')
      setSelectedFile(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to upload document'
      toast.error(msg)
    } finally {
      isUploadingRef.current = false
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-[#005b57]">My Health Records</h1>
        <p className="text-gray-600">Upload, manage, and download your medical documents securely.</p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-[#005b57]" />
            Upload Document
          </CardTitle>
          <CardDescription>Select the document type and upload a file (PDF, PNG, JPG)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <Select value={selectedType} onValueChange={(v) => setSelectedType(v as PatientDocumentType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medicalRecord">Medical Record</SelectItem>
                  <SelectItem value="referralLetter">Referral Letter</SelectItem>
                  <SelectItem value="insuranceCard">Insurance Card</SelectItem>
                  <SelectItem value="otherDocument">Other Document</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <FileUpload
                id="patient-record-upload"
                label="Choose file"
                accept="application/pdf,image/jpeg,image/jpg,image/png"
                onChange={(f) => setSelectedFile((Array.isArray(f) ? f[0] : f) || null)}
                maxSizeInMB={10}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleUpload} disabled={!selectedFile || isUploadingPatientDocument}>
                {isUploadingPatientDocument ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Upload'
                )}
              </Button>
              {isUploadingPatientDocument && (
                <span className="text-sm text-gray-600">{Math.round((uploadProgress || 0) * 100)}%</span>
              )}
            </div>
          </div>
          {uploadError && (
            <p className="text-sm text-red-600">{String(uploadError)}</p>
          )}
        </CardContent>
      </Card>

      {/* Filters & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | PatientDocumentType)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="medicalRecord">Medical Record</SelectItem>
              <SelectItem value="referralLetter">Referral Letter</SelectItem>
              <SelectItem value="insuranceCard">Insurance Card</SelectItem>
              <SelectItem value="otherDocument">Other Document</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as 'newest' | 'oldest' | 'name')}>
            <SelectTrigger>
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search documents by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Documents List */}
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>Your uploaded medical records</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingDocuments ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : documentsError ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              Failed to load documents. Please try again later.
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="h-10 w-10 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-700 font-medium">No documents found</p>
              <p className="text-sm text-gray-500">Try adjusting filters or upload a new document.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDocs.map((doc) => (
                <div key={String(doc._id)} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#D4FAE8] rounded-full">
                      <FileText className="h-5 w-5 text-[#005b57]" />
                    </div>
                    <div>
                      <p className="font-medium break-all">{doc.fileName}</p>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                        <Badge variant="secondary" className="capitalize">{doc.documentType.replace(/([A-Z])/g, ' $1').toLowerCase()}</Badge>
                        <span>{format(new Date(doc.uploadedAt), 'PP')}</span>
                        <span>•</span>
                        <span>{formatBytes(doc.fileSize)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4 mr-2" /> Download
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance Note */}
      <div className="text-xs text-gray-500">
        Documents are stored securely. Only you and authorized professionals with active treatment relationships can access your records.
      </div>
    </div>
  )
}
