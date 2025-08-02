'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'

import { 
  Check, 
  X, 
  Clock, 
  User, 
  Stethoscope, 
  Building2, 
  Shield,
  FileText,
  Download,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Languages
} from 'lucide-react'



interface PhysiotherapistProfile {
  licenseNumber?: string
  yearsOfExperience?: number
  specializations?: string[]
  languagesSpoken?: string[]
  bio?: string
}

interface ClinicProfile {
  name: string
  address?: string
  city?: string
  country?: string
  contactEmail?: string
  contactPhone?: string
}

interface UserApprovalDialogProps {
  userId: Id<'users'> | null
  isOpen: boolean
  onClose: () => void
  onApprove: (userId: Id<'users'>, comments?: string) => Promise<void>
  onDecline: (userId: Id<'users'>, comments: string) => Promise<void>
}

export function UserApprovalDialog({ 
  userId, 
  isOpen, 
  onClose, 
  onApprove, 
  onDecline 
}: UserApprovalDialogProps) {
  const [action, setAction] = useState<'approve' | 'decline' | null>(null)
  const [comments, setComments] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Get detailed user information
  const approvalDetails = useQuery(
    api.accountApproval.getApprovalDetails,
    userId ? { userId } : 'skip'
  )

  if (!userId || !approvalDetails) return null

  const { user, approvalStatus, profileDetails, documents } = approvalDetails

  const handleAction = async () => {
    if (!action || !userId) return

    setIsLoading(true)
    try {
      if (action === 'approve') {
        await onApprove(userId, comments || undefined)
        toast.success('User approved successfully')
      } else {
        if (!comments.trim()) {
          toast.error('Comments are required when declining a user')
          return
        }
        await onDecline(userId, comments)
        toast.success('User declined')
      }
      onClose()
      setAction(null)
      setComments('')
    } catch {
      toast.error(`Failed to ${action} user`)
    } finally {
      setIsLoading(false)
    }
  }

  const roleConfig = {
    physiotherapist: { label: 'Physiotherapist', icon: Stethoscope, color: 'blue' },
    clinic_owner: { label: 'Clinic Owner', icon: Building2, color: 'green' },
    patient: { label: 'Patient', icon: User, color: 'purple' },
    family_member: { label: 'Family Member', icon: User, color: 'gray' },
    admin: { label: 'Administrator', icon: Shield, color: 'red' }
  }

  const config = roleConfig[user.role as keyof typeof roleConfig] || roleConfig.patient
  const Icon = config.icon

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const renderDocuments = () => {
    if (!documents || documents.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No documents uploaded</p>
        </div>
      )
    }

    return (
      <div className="grid gap-4">
        {documents.map((doc) => (
          <Card key={doc._id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="font-medium">{doc.fileName}</p>
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      {doc.documentType}
                    </Badge>
                    <span>{formatFileSize(doc.fileSize)}</span>
                    <span>•</span>
                    <span>{format(new Date(doc.uploadedAt), 'MMM dd, yyyy')}</span>
                  </div>
                </div>
              </div>
              {doc.downloadUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => doc.downloadUrl && window.open(doc.downloadUrl, '_blank')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  View
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    )
  }

  const renderProfileDetails = () => {
    if (!profileDetails) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <p>No profile details available</p>
        </div>
      )
    }

    if (user.role === 'physiotherapist') {
      const physioProfile = profileDetails as PhysiotherapistProfile
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {physioProfile.licenseNumber && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">License Number</label>
                <p className="font-medium">{physioProfile.licenseNumber}</p>
              </div>
            )}
            {physioProfile.yearsOfExperience && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Years of Experience</label>
                <p className="font-medium">{physioProfile.yearsOfExperience} years</p>
              </div>
            )}
          </div>
          
          {physioProfile.specializations && physioProfile.specializations.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Specializations</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {physioProfile.specializations.map((spec: string, index: number) => (
                  <Badge key={index} variant="secondary">{spec}</Badge>
                ))}
              </div>
            </div>
          )}
          
          {physioProfile.languagesSpoken && physioProfile.languagesSpoken.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Languages Spoken</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {physioProfile.languagesSpoken.map((lang: string, index: number) => (
                  <Badge key={index} variant="outline">
                    <Languages className="h-3 w-3 mr-1" />
                    {lang}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {physioProfile.bio && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Bio</label>
              <p className="mt-2 text-sm leading-relaxed">{physioProfile.bio}</p>
            </div>
          )}
        </div>
      )
    }

    if (user.role === 'clinic_owner') {
      const clinicProfile = profileDetails as ClinicProfile
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Clinic Name</label>
              <p className="font-medium">{clinicProfile.name}</p>
            </div>
          </div>
          
          {(clinicProfile.address || clinicProfile.city || clinicProfile.country) && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Address</label>
              <div className="flex items-start space-x-2 mt-2">
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  {clinicProfile.address && <p>{clinicProfile.address}</p>}
                  {(clinicProfile.city || clinicProfile.country) && (
                    <p className="text-sm text-muted-foreground">
                      {[clinicProfile.city, clinicProfile.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            {clinicProfile.contactEmail && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Contact Email</label>
                <div className="flex items-center space-x-2 mt-1">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">{clinicProfile.contactEmail}</p>
                </div>
              </div>
            )}
            {clinicProfile.contactPhone && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Contact Phone</label>
                <div className="flex items-center space-x-2 mt-1">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">{clinicProfile.contactPhone}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Review User Application</DialogTitle>
          <DialogDescription>
            Complete user information and documents for approval decision
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* User Info Header */}
            <div className="flex items-center space-x-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user.imageUrl} />
                <AvatarFallback>
                  {user.firstName?.charAt(0) || user.email?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">
                  {user.firstName} {user.lastName}
                </h3>
                <p className="text-muted-foreground">{user.email}</p>
                <div className="flex items-center space-x-2 mt-2">
                  <Badge variant="outline">
                    <Icon className="mr-1 h-3 w-3" />
                    {config.label}
                  </Badge>
                  {approvalStatus && (
                    <Badge variant="secondary">
                      <Clock className="mr-1 h-3 w-3" />
                      Submitted {format(new Date(approvalStatus.submittedAt), 'MMM dd, yyyy')}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Tabbed Content */}
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="profile">Profile Details</TabsTrigger>
                <TabsTrigger value="documents">
                  Documents ({documents?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="contact">Contact Info</TabsTrigger>
              </TabsList>
              
              <TabsContent value="profile" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Professional Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {renderProfileDetails()}
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="documents" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Uploaded Documents</CardTitle>
                    <CardDescription>
                      Review all documents submitted by the user
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {renderDocuments()}
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="contact" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Email</label>
                          <div className="flex items-center space-x-2 mt-1">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <p className="font-medium">{user.email}</p>
                          </div>
                        </div>
                        {user.phoneNumber && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Phone</label>
                            <div className="flex items-center space-x-2 mt-1">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              <p className="font-medium">{user.phoneNumber}</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Member Since</label>
                        <div className="flex items-center space-x-2 mt-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <p className="font-medium">
                            {format(new Date(user._creationTime), 'PPP')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Action Selection */}
            {!action && (
              <div className="flex space-x-4">
                <Button 
                  onClick={() => setAction('approve')} 
                  className="flex-1"
                  variant="default"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Approve User
                </Button>
                <Button 
                  onClick={() => setAction('decline')} 
                  className="flex-1"
                  variant="destructive"
                >
                  <X className="mr-2 h-4 w-4" />
                  Decline User
                </Button>
              </div>
            )}

            {/* Comments Section */}
            {action && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center">
                    {action === 'approve' ? (
                      <Check className="h-5 w-5 text-green-600 mr-2" />
                    ) : (
                      <X className="h-5 w-5 text-red-600 mr-2" />
                    )}
                    {action === 'approve' ? 'Approving User' : 'Declining User'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    <label className="text-sm font-medium">
                      Comments {action === 'decline' && <span className="text-red-500">*</span>}
                    </label>
                    <Textarea
                      placeholder={
                        action === 'approve' 
                          ? "Optional: Add any notes for the user..."
                          : "Required: Please explain why this application is being declined..."
                      }
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      rows={3}
                      className="mt-2"
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          {action && (
            <Button 
              onClick={handleAction} 
              disabled={isLoading || (action === 'decline' && !comments.trim())}
              variant={action === 'approve' ? 'default' : 'destructive'}
            >
              {isLoading ? 'Processing...' : `${action === 'approve' ? 'Approve' : 'Decline'} User`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 