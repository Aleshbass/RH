'use client';

import { useAuth, SignOutButton } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, User, Bell, Shield, Palette, Calendar as CalendarIcon, DollarSign, Store, Clock, LogOut, Key, Camera, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarConnectionStatus } from '@/components/settings/CalendarConnectionStatus';
import { PayoutSettings } from '@/components/dashboard/physiotherapist/settings/PayoutSettings';
import MarketplaceSettingsForm from '@/components/marketplace/MarketplaceSettingsForm';
import { AvailabilityScheduler } from '@/components/onboarding/common/AvailabilityScheduler';
import { toast } from 'sonner';

export default function PhysiotherapistSettingsPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  // Get current user
  const currentUser = useQuery(api.users.getMyUser);
  const currentUserProfile = useQuery(api.queries.getCurrentUser);

  const marketplaceSettings = useQuery(api.marketplace.settings.getMyMarketplaceSettings);
  const updateAvailabilityMutation = useMutation(api.physiotherapists.updateAvailability);

  // Local state for availability
  const [availabilitySchedule, setAvailabilitySchedule] = useState<any>(null);

  useEffect(() => {
    if (currentUserProfile?.profileData?.availabilitySchedule) {
      setAvailabilitySchedule(currentUserProfile.profileData.availabilitySchedule);
    }
  }, [currentUserProfile]);

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  // Redirect if not physiotherapist
  useEffect(() => {
    if (currentUser && currentUser.role !== 'physiotherapist') {
      router.push('/dashboard');
    }
  }, [currentUser, router]);

  // Loading state
  if (!isLoaded || currentUser === undefined || currentUserProfile === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      // TODO: Add profile update logic here when mutation is available
      // await updateProfileMutation({ ... });

      toast.success('Profile settings saved successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAvailability = async () => {
    if (!availabilitySchedule) return;
    setIsSaving(true);
    try {
      await updateAvailabilityMutation({ availabilitySchedule });
      toast.success('Availability schedule updated successfully!');
    } catch (error) {
      console.error('Error saving availability:', error);
      toast.error('Failed to update availability. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your account preferences and profile settings</p>
      </div>

      {/* Settings Tabs */}
      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid w-full h-auto grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="payout">Payout</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Picture */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full bg-gray-200 overflow-hidden">
                    {currentUser?.imageUrl ? (
                      <img src={currentUser.imageUrl} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-2xl font-semibold text-gray-500">
                        {currentUser?.firstName?.[0]}{currentUser?.lastName?.[0]}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full p-0"
                    onClick={() => window.open('/user', '_blank')}
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <h4 className="font-medium">Profile Picture</h4>
                  <p className="text-sm text-gray-600">Click the camera icon to change your photo</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    defaultValue={currentUser?.firstName || ''}
                    placeholder="Enter your first name"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    defaultValue={currentUser?.lastName || ''}
                    placeholder="Enter your last name"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    defaultValue={currentUser?.email || ''}
                    placeholder="Enter your email"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    defaultValue={currentUser?.phoneNumber || ''}
                    placeholder="Enter your phone number"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="bio">Professional Bio</Label>
                <Textarea
                  id="bio"
                  defaultValue={currentUserProfile.profileData?.bio || ''}
                  placeholder="Tell us about your professional background..."
                  rows={4}
                />
              </div>

              <div>
                <Label htmlFor="specializations">Specializations</Label>
                <Input
                  id="specializations"
                  defaultValue={currentUserProfile.profileData?.specializations?.join(', ') || ''}
                  placeholder="e.g., Sports Therapy, Neurological Rehabilitation"
                />
              </div>

              <Button onClick={handleSaveProfile} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Profile'
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketplace" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Marketplace Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              {marketplaceSettings ? (
                <MarketplaceSettingsForm settings={marketplaceSettings} />
              ) : (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="availability" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Availability Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800">
                  Set your weekly availability here. This schedule will be visible to patients when they book appointments with you.
                </p>
              </div>

              {availabilitySchedule ? (
                <AvailabilityScheduler
                  value={availabilitySchedule}
                  onChange={setAvailabilitySchedule}
                />
              ) : (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className="flex flex-col py-4 border-b border-gray-200 last:border-0">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4 w-32 pt-2">
                          <Skeleton className="h-6 w-10 rounded-full" />
                          <Skeleton className="h-4 w-16" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 justify-end">
                            <Skeleton className="h-9 w-28" />
                            <Skeleton className="h-9 w-28" />
                            <Skeleton className="h-8 w-8 rounded-md" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-4">
                <Button onClick={handleSaveAvailability} disabled={isSaving} className="bg-[#005b57] hover:bg-[#00443e]">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Availability'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Calendar Integration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CalendarConnectionStatus currentUser={currentUser} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payout" className="space-y-4">
          <PayoutSettings currentUser={currentUser} />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Appointment Reminders</h4>
                  <p className="text-sm text-gray-600">Get notified about upcoming appointments</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">New Patient Registrations</h4>
                  <p className="text-sm text-gray-600">Get notified when new patients join</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Email Notifications</h4>
                  <p className="text-sm text-gray-600">Receive important updates via email</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Privacy & Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Profile Visibility</h4>
                  <p className="text-sm text-gray-600">Allow other healthcare providers to see your profile</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Two-Factor Authentication</h4>
                  <p className="text-sm text-gray-600">Add an extra layer of security to your account</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.open('/user', '_blank')}>
                  <Key className="h-4 w-4 mr-2" />
                  Configure
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Change Password</h4>
                  <p className="text-sm text-gray-600">Update your account password</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.open('/user', '_blank')}>
                  <Key className="h-4 w-4 mr-2" />
                  Change Password
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Sign Out</h4>
                  <p className="text-sm text-gray-600">Sign out of your account on this device</p>
                </div>
                <SignOutButton>
                  <Button variant="outline" size="sm">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </SignOutButton>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-red-600">Deactivate Account</h4>
                  <p className="text-sm text-gray-600">Temporarily disable your account. You can reactivate it later.</p>
                </div>
                <Button variant="outline" size="sm" className="border-red-300 text-red-600 hover:bg-red-50">
                  Deactivate
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-red-600">Delete Account</h4>
                  <p className="text-sm text-gray-600">Permanently delete your account and all associated data.</p>
                </div>
                <Button variant="destructive" size="sm">
                  Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                App Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="timezone">Timezone</Label>
                <div className="mt-1">
                  <Select defaultValue="UTC+1 (West Africa Time)">
                    <SelectTrigger id="timezone" className="w-full">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC+1 (West Africa Time)">UTC+1 (West Africa Time)</SelectItem>
                      <SelectItem value="UTC (Greenwich Mean Time)">UTC (Greenwich Mean Time)</SelectItem>
                      <SelectItem value="UTC-5 (Eastern Time)">UTC-5 (Eastern Time)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Separator />
              <div>
                <Label htmlFor="language">Language</Label>
                <div className="mt-1">
                  <Select defaultValue="English">
                    <SelectTrigger id="language" className="w-full">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="English">English</SelectItem>
                      <SelectItem value="French">French</SelectItem>
                      <SelectItem value="Yoruba">Yoruba</SelectItem>
                      <SelectItem value="Hausa">Hausa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}