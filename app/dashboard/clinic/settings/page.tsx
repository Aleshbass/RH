'use client'

import { useQuery, useMutation } from 'convex/react'
import type { Doc } from '@/convex/_generated/dataModel'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  Building2,
  Bell,
  Shield,
  CreditCard,
  Users,
  MapPin,
  Save,
  Calendar
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import ClinicBillingView from '@/components/dashboard/clinic/ClinicBillingView'
import ClinicAuditView from '@/components/dashboard/clinic/ClinicAuditView'
import { CalendarConnectionStatus } from '@/components/settings/CalendarConnectionStatus'

export default function ClinicSettingsPage() {
  const clinic = useQuery(api.clinics.getMyClinic)
  const currentUser = useQuery(api.users.getMyUser)
  const updateClinic = useMutation(api.clinics.updateClinic)
  const [isLoading, setIsLoading] = useState(false)

  if (clinic === undefined) {
    return (
      <div className="p-8">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const handleSaveSettings = async (data: Partial<Doc<'clinics'>>) => {
    setIsLoading(true)
    try {
      await updateClinic(data)
      toast.success('Settings updated successfully')
    } catch {
      toast.error('Failed to update settings')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-gray-600">Manage your clinic configuration and preferences</p>
          </div>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="general" className="space-y-4">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="billing-invoicing">Billing & Invoicing</TabsTrigger>
            <TabsTrigger value="audit-logs">Audit Logs</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>

            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Building2 className="h-5 w-5" />
                    <span>Clinic Information</span>
                  </CardTitle>
                  <CardDescription>Basic information about your clinic</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="clinicName">Clinic Name</Label>
                    <Input
                      id="clinicName"
                      defaultValue={clinic?.name || ''}
                      placeholder="Enter clinic name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      defaultValue={''}
                      placeholder="Brief description of your clinic"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="specializations">Specializations</Label>
                    <Input
                      id="specializations"
                      defaultValue={(clinic as any)?.specializations?.join(', ') || ''}
                      placeholder="e.g., Sports Therapy, Orthopedic Rehab"
                    />
                  </div>
                  <Button onClick={() => handleSaveSettings({ name: 'Updated Name' })} disabled={isLoading}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MapPin className="h-5 w-5" />
                    <span>Contact & Location</span>
                  </CardTitle>
                  <CardDescription>How patients can reach and find you</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Textarea
                      id="address"
                      defaultValue={clinic?.address || ''}
                      placeholder="Full clinic address"
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        defaultValue={clinic?.contactPhone || ''}
                        placeholder="+234 123-4564567"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        defaultValue={clinic?.contactEmail || ''}
                        placeholder="contact@clinic.com"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      defaultValue={''}
                      placeholder="https://www.yourclinic.com"
                    />
                  </div>
                  <Button disabled={isLoading}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="billing-invoicing">
            <ClinicBillingView />
          </TabsContent>

          <TabsContent value="audit-logs">
            <ClinicAuditView />
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Bell className="h-5 w-5" />
                  <span>Notification Preferences</span>
                </CardTitle>
                <CardDescription>Configure how and when you receive notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Email Notifications</Label>
                      <p className="text-sm text-gray-600">Receive notifications via email</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>New Appointment Bookings</Label>
                      <p className="text-sm text-gray-600">Get notified when patients book appointments</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Appointment Cancellations</Label>
                      <p className="text-sm text-gray-600">Get notified when appointments are cancelled</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Payment Notifications</Label>
                      <p className="text-sm text-gray-600">Get notified about payments and invoices</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Staff Updates</Label>
                      <p className="text-sm text-gray-600">Get notified about staff-related activities</p>
                    </div>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>System Maintenance</Label>
                      <p className="text-sm text-gray-600">Get notified about system updates and maintenance</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
                <Button disabled={isLoading}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>



          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="h-5 w-5" />
                  <span>Security Settings</span>
                </CardTitle>
                <CardDescription>Manage security and privacy settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Two-Factor Authentication</Label>
                      <p className="text-sm text-gray-600">Add an extra layer of security to your account</p>
                    </div>
                    <Button variant="outline">Enable 2FA</Button>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Session Timeout</Label>
                      <p className="text-sm text-gray-600">Automatically log out after inactivity</p>
                    </div>
                    <div className="w-32">
                      <Input defaultValue="30" type="number" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Data Backup</Label>
                      <p className="text-sm text-gray-600">Automatic daily backups of your data</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Login Notifications</Label>
                      <p className="text-sm text-gray-600">Get notified of new login attempts</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Change Password</Label>
                  <div className="space-y-2">
                    <Input type="password" placeholder="Current password" />
                    <Input type="password" placeholder="New password" />
                    <Input type="password" placeholder="Confirm new password" />
                  </div>
                  <Button variant="outline">Update Password</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Team Settings</span>
                </CardTitle>
                <CardDescription>Manage team permissions and roles</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Auto-approve Staff Invitations</Label>
                      <p className="text-sm text-gray-600">Automatically approve new staff member invitations</p>
                    </div>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Allow Staff Schedule Management</Label>
                      <p className="text-sm text-gray-600">Let staff members manage their own schedules</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Staff Can View All Patients</Label>
                      <p className="text-sm text-gray-600">Allow staff to view all patient information</p>
                    </div>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Require Manager Approval for Cancellations</Label>
                      <p className="text-sm text-gray-600">Staff need approval to cancel appointments</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Default Staff Role</Label>
                  <Input defaultValue="Physiotherapist" placeholder="Default role for new staff" />
                </div>
                <Button disabled={isLoading}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Team Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5" />
                  <span>Calendar Integrations</span>
                </CardTitle>
                <CardDescription>Connect your external calendars for seamless scheduling</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <CalendarConnectionStatus currentUser={currentUser} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
