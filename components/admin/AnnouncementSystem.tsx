'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Megaphone, 
  Send, 
  Users, 
  UserCheck, 
  Building2, 
  Stethoscope,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react'
import { toast } from 'sonner'

interface AnnouncementFormData {
  title: string
  message: string
  targetRoles: string[]
  priority: 'low' | 'medium' | 'high'
}

export function AnnouncementSystem() {
  const [formData, setFormData] = useState<AnnouncementFormData>({
    title: '',
    message: '',
    targetRoles: [],
    priority: 'medium'
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState<{ announcementId: string; recipientCount: number } | null>(null)

  const broadcastAnnouncement = useMutation(api.admin.broadcastAnnouncement)

  const roleOptions = [
    { value: 'physiotherapist', label: 'Physiotherapists', icon: Stethoscope, color: 'bg-blue-100 text-blue-800' },
    { value: 'clinic_owner', label: 'Clinic Owners', icon: Building2, color: 'bg-green-100 text-green-800' },
    { value: 'patient', label: 'Patients', icon: Users, color: 'bg-purple-100 text-purple-800' },
    { value: 'admin', label: 'Administrators', icon: UserCheck, color: 'bg-red-100 text-red-800' },
  ]

  const priorityOptions = [
    { value: 'low', label: 'Low Priority', color: 'bg-gray-100 text-gray-800' },
    { value: 'medium', label: 'Medium Priority', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'high', label: 'High Priority', color: 'bg-red-100 text-red-800' },
  ]

  const handleRoleToggle = (roleValue: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      targetRoles: checked 
        ? [...prev.targetRoles, roleValue]
        : prev.targetRoles.filter(role => role !== roleValue)
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title.trim() || !formData.message.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    if (formData.targetRoles.length === 0) {
      toast.error('Please select at least one target audience')
      return
    }

    setIsSubmitting(true)
    
    try {
      const result = await broadcastAnnouncement({
        title: formData.title,
        message: formData.message,
        targetRoles: formData.targetRoles,
        priority: formData.priority
      })

      setLastResult(result)
      
      toast.success('Announcement sent successfully!', {
        description: `Delivered to ${result.recipientCount} users`,
        duration: 5000,
      })

      // Reset form
      setFormData({
        title: '',
        message: '',
        targetRoles: [],
        priority: 'medium'
      })
    } catch (error) {
      console.error('Failed to send announcement:', error)
      toast.error('Failed to send announcement', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        duration: 5000,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedRoles = roleOptions.filter(role => formData.targetRoles.includes(role.value))
  const selectedPriority = priorityOptions.find(p => p.value === formData.priority)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Announcements</h1>
          <p className="text-muted-foreground">
            Broadcast important notifications to platform users
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Megaphone className="h-3 w-3" />
            Broadcast System
          </Badge>
        </div>
      </div>

      {/* Success Message */}
      {lastResult && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Last announcement successfully sent to <strong>{lastResult.recipientCount} users</strong>
            {' '}(ID: {lastResult.announcementId})
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Announcement Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Megaphone className="mr-2 h-5 w-5" />
              Create Announcement
            </CardTitle>
            <CardDescription>
              Compose and send announcements to specific user groups
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Announcement Title *</Label>
                <Input
                  id="title"
                  placeholder="Enter announcement title..."
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label htmlFor="message">Message *</Label>
                <Textarea
                  id="message"
                  placeholder="Enter your announcement message..."
                  value={formData.message}
                  onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                  rows={4}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  {formData.message.length}/500 characters
                </p>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label>Priority Level</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    priority: value as 'low' | 'medium' | 'high' 
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map((priority) => (
                      <SelectItem key={priority.value} value={priority.value}>
                        <div className="flex items-center space-x-2">
                          <Badge variant="secondary" className={priority.color}>
                            {priority.label}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Target Roles */}
              <div className="space-y-3">
                <Label>Target Audience *</Label>
                <div className="grid grid-cols-2 gap-3">
                  {roleOptions.map((role) => {
                    const Icon = role.icon
                    const isChecked = formData.targetRoles.includes(role.value)
                    
                    return (
                      <div
                        key={role.value}
                        className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          isChecked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                        }`}
                        onClick={() => handleRoleToggle(role.value, !isChecked)}
                      >
                        <Checkbox
                          checked={isChecked}
                          onChange={(checked) => handleRoleToggle(role.value, checked)}
                        />
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{role.label}</span>
                      </div>
                    )
                  })}
                </div>
                {formData.targetRoles.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Select at least one user group to send the announcement to
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormData({
                    title: '',
                    message: '',
                    targetRoles: [],
                    priority: 'medium'
                  })}
                  disabled={isSubmitting}
                >
                  Clear
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || formData.targetRoles.length === 0}
                >
                  {isSubmitting ? (
                    <>
                      <Clock className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Announcement
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Preview & Summary */}
        <div className="space-y-6">
          {/* Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preview</CardTitle>
              <CardDescription>
                How your announcement will appear to users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.title || formData.message ? (
                <div className="p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold">
                      {formData.title || 'Announcement Title'}
                    </h4>
                    {selectedPriority && (
                      <Badge variant="secondary" className={selectedPriority.color}>
                        {selectedPriority.label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formData.message || 'Your announcement message will appear here...'}
                  </p>
                  <div className="flex items-center mt-3 text-xs text-muted-foreground">
                    <Clock className="mr-1 h-3 w-3" />
                    Just now • Platform Announcement
                  </div>
                </div>
              ) : (
                <div className="p-4 border rounded-lg bg-muted/30 text-center text-muted-foreground">
                  <Megaphone className="mx-auto h-8 w-8 mb-2" />
                  <p className="text-sm">Preview will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Summary</CardTitle>
              <CardDescription>
                Announcement details overview
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Priority:</span>
                  <Badge variant="secondary" className={selectedPriority?.color}>
                    {selectedPriority?.label}
                  </Badge>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span>Target Groups:</span>
                  <span className="font-medium">
                    {selectedRoles.length > 0 ? selectedRoles.length : 'None selected'}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span>Message Length:</span>
                  <span className="font-medium">{formData.message.length} chars</span>
                </div>
              </div>

              {selectedRoles.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm">Selected Audiences:</Label>
                  <div className="space-y-1">
                    {selectedRoles.map((role) => {
                      const Icon = role.icon
                      return (
                        <div key={role.value} className="flex items-center space-x-2 text-sm">
                          <Icon className="h-3 w-3" />
                          <span>{role.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Guidelines */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Guidelines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Keep messages clear and concise</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Use high priority sparingly for urgent matters</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Target specific user groups when possible</span>
              </div>
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>All users will receive email notifications</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
} 