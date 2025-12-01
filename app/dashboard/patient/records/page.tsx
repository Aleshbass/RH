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
import { Download, FileText, Filter, Loader2, Upload as UploadIcon, Search, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import type { Id } from '@/convex/_generated/dataModel'
import { Switch } from '@/components/ui/switch'

export default function PatientRecordsPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const user = useQuery(api.users.getMyUser) as (null | { role?: string; patientProfileId?: Id<'patientProfiles'> } | undefined)
  const patientProfileId = user?.patientProfileId as Id<'patientProfiles'> | undefined

  const {
    documents = [],
    isLoadingDocuments,
    documentsError,
    uploadPatientDocument,
    isUploadingPatientDocument,
    uploadProgress,
    uploadError,
    toggleSharing,
    isTogglingSharing,
  } = usePatientDocuments({ patientProfileId })

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

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      router.push('/sign-in')
      return
    }
  }, [isLoaded, isSignedIn, router])

  useEffect(() => {
    if (!user) return
    if (user && user.role !== 'patient') {
      router.push('/dashboard')
    }
  }, [user, router])

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

  const getDocumentTypeColor = (type: string) => {
    switch (type) {
      case 'medicalRecord':
        return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'referralLetter':
        return 'bg-purple-100 text-purple-700 border-purple-200'
      case 'insuranceCard':
        return 'bg-green-100 text-green-700 border-green-200'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="bg-white border border-brand/20 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                Health Records
              </h1>
              <p className="text-gray-600 text-sm sm:text-base">
                Securely upload, manage, and access your medical documents
              </p>
            </div>
            <div className="hidden sm:block p-3 bg-brand/10 rounded-xl">
              <FolderOpen className="h-8 w-8 text-brand" />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mt-6">
            <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
              <p className="text-xs sm:text-sm text-gray-500">Total Documents</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{documents.length}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
              <p className="text-xs sm:text-sm text-gray-500">This Month</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">
                {documents.filter(d => {
                  const uploadDate = new Date(d.uploadedAt)
                  const now = new Date()
                  return uploadDate.getMonth() === now.getMonth() && uploadDate.getFullYear() === now.getFullYear()
                }).length}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 sm:p-4 col-span-2 sm:col-span-1">
              <p className="text-xs sm:text-sm text-gray-500">Storage Used</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">
                {formatBytes(documents.reduce((sum, d) => sum + d.fileSize, 0))}
              </p>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <Card className="border-2 border-dashed border-gray-200 hover:border-brand/50 transition-colors shadow-sm">
          <CardHeader className="pb-3 px-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <UploadIcon className="h-5 w-5 text-brand" />
              Upload New Document
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Accepted formats: PDF, JPG, PNG (Max 10MB)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Document Type</label>
                <Select value={selectedType} onValueChange={(v) => setSelectedType(v as PatientDocumentType)}>
                  <SelectTrigger className="h-11">
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
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Choose File</label>
                <FileUpload
                  id="patient-record-upload"
                  label="Select file"
                  accept="application/pdf,image/jpeg,image/jpg,image/png"
                  onChange={(f) => setSelectedFile((Array.isArray(f) ? f[0] : f) || null)}
                  maxSizeInMB={10}
                />
              </div>
            </div>

            {selectedFile && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-sm text-blue-900 truncate">{selectedFile.name}</span>
                </div>
                <span className="text-xs text-blue-700 ml-2 shrink-0">{formatBytes(selectedFile.size)}</span>
              </div>
            )}

            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isUploadingPatientDocument}
              className="w-full bg-brand hover:bg-brand-dark text-white h-11"
            >
              {isUploadingPatientDocument ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading... {Math.round((uploadProgress || 0) * 100)}%
                </>
              ) : (
                <>
                  <UploadIcon className="h-4 w-4 mr-2" />
                  Upload Document
                </>
              )}
            </Button>
            {uploadError && (
              <p className="text-sm text-red-600">{String(uploadError)}</p>
            )}
          </CardContent>
        </Card>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | PatientDocumentType)}>
              <SelectTrigger className="w-full sm:w-[180px] h-10">
                <Filter className="h-4 w-4 mr-2" />
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
              <SelectTrigger className="w-full sm:w-[140px] h-10">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="name">By Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
        </div>

        {/* Documents List */}
        <Card className="shadow-sm">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-base sm:text-lg">My Documents</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {filteredDocs.length} {filteredDocs.length === 1 ? 'document' : 'documents'} found
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            {isLoadingDocuments ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-xl">
                    <div className="flex items-center gap-3 flex-1">
                      <Skeleton className="h-12 w-12 rounded-xl" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-9 w-24" />
                  </div>
                ))}
              </div>
            ) : documentsError ? (
              <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
                <p className="text-red-700 font-medium">Failed to load documents</p>
                <p className="text-sm text-red-600 mt-1">Please refresh the page or try again later</p>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex p-4 bg-gray-100 rounded-full mb-4">
                  <FileText className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Documents Found</h3>
                <p className="text-sm text-gray-500 mb-6">
                  {search || typeFilter !== 'all'
                    ? 'Try adjusting your filters or search query'
                    : 'Upload your first document to get started'}
                </p>
                {!search && typeFilter === 'all' && (
                  <Button
                    onClick={() => document.getElementById('patient-record-upload')?.click()}
                    className="bg-brand hover:bg-brand-dark text-white"
                  >
                    <UploadIcon className="h-4 w-4 mr-2" />
                    Upload Document
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDocs.map((doc) => (
                  <div
                    key={String(doc._id)}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-gray-200 rounded-xl hover:border-brand/50 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0 mb-3 sm:mb-0">
                      <div className="p-3 bg-brand/10 rounded-xl shrink-0 group-hover:bg-brand/20 transition-colors">
                        <FileText className="h-5 w-5 text-brand" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate text-sm sm:text-base">{doc.fileName}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge
                            variant="outline"
                            className={`text-xs capitalize ${getDocumentTypeColor(doc.documentType)}`}
                          >
                            {doc.documentType.replace(/([A-Z])/g, ' $1').trim()}
                          </Badge>
                          <span className="text-xs text-gray-500">{format(new Date(doc.uploadedAt), 'MMM d, yyyy')}</span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">{formatBytes(doc.fileSize)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                      <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                        <span className="text-xs font-medium text-gray-700">
                          Share with Physio
                        </span>
                        <Switch
                          checked={doc.sharedWithPhysiotherapist !== false}
                          onCheckedChange={async (checked) => {
                            try {
                              await toggleSharing({ documentId: doc._id, shared: checked })
                              toast.success(checked ? 'Document shared with physiotherapist' : 'Document made private')
                            } catch (error) {
                              toast.error('Failed to update sharing settings')
                            }
                          }}
                          disabled={isTogglingSharing}
                          className="data-[state=checked]:bg-brand scale-125"
                        />
                        <span className="text-xs font-semibold" style={{ color: doc.sharedWithPhysiotherapist !== false ? '#005b57' : '#6b7280' }}>
                          {doc.sharedWithPhysiotherapist !== false ? '✓ Shared' : 'Private'}
                        </span>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4 mr-2" /> Download
                        </a>
                      </Button>
                    </div>
                  </div>))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Privacy Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs sm:text-sm text-blue-900">
            <span className="font-semibold">🔒 Secure & Private:</span> Your documents are encrypted and stored securely.
            Only you and authorized healthcare professionals with active treatment relationships can access your records.
          </p>
        </div>
      </div>
    </div>
  )
}
