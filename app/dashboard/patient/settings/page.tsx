'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

import { CalendarConnectionStatus } from '@/components/settings/CalendarConnectionStatus';
import { ProfilePhotoUploader } from '@/components/dashboard/shared/ProfilePhotoUploader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, Loader2, Mail, Trash2 } from 'lucide-react';
import { TourGuide } from '@/components/shared/TourGuide';
import { RehabifyId } from '@/components/shared/RehabifyId';
import { PageContainer, PageHeader, Panel, primaryButtonClass, softButtonClass } from '@/components/physio/ui';

type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

const SUPPORT_EMAIL = 'hello@myrehabifyhealth.com';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  phone: '',
  dateOfBirth: '',
  gender: '' as Gender | '',
  address: '',
  city: '',
  emergencyName: '',
  emergencyRelationship: '',
  emergencyPhone: '',
};

function readableError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : '';
  const match = raw.match(/(?:Uncaught Error|ConvexError):\s*(.+?)(?:\n|\s+at\s|$)/);
  return match?.[1] || fallback;
}

export default function PatientSettingsPage() {
  const { user: clerkUser } = useUser();
  const convex = useConvex();
  const patient = useQuery(api.patients.getPatientByUserId, {});
  const currentUser = useQuery(api.users.getMyUser);
  const updateProfile = useMutation(api.patients.updateMyPatientProfile);
  const updateNotificationPreferences = useMutation(api.users.updateNotificationPreferences);

  const [form, setForm] = useState(EMPTY_FORM);
  const [formLoaded, setFormLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [calendarNotice, setCalendarNotice] = useState<'success' | 'access_denied' | 'error' | null>(null);

  // Fill the form once the saved details arrive (not on every live update, so typing isn't overwritten)
  useEffect(() => {
    if (!patient || formLoaded) return;
    const profile = patient.profile;
    setForm({
      firstName: patient.firstName ?? '',
      lastName: patient.lastName ?? '',
      phone: patient.phone ?? '',
      dateOfBirth: profile?.dateOfBirth?.slice(0, 10) ?? '',
      gender: (profile?.gender as Gender | undefined) ?? '',
      address: profile?.address ?? '',
      city: profile?.city ?? '',
      emergencyName: profile?.emergencyContact?.name ?? '',
      emergencyRelationship: profile?.emergencyContact?.relationship ?? '',
      emergencyPhone: profile?.emergencyContact?.phone ?? '',
    });
    setFormLoaded(true);
  }, [patient, formLoaded]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar_success')) setCalendarNotice('success');
    else if (params.get('calendar_error')) setCalendarNotice(params.get('calendar_error') === 'access_denied' ? 'access_denied' : 'error');
  }, []);

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleProfileUpdate = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('Please enter your first and last name');
      return;
    }
    const hasEmergency = form.emergencyName.trim() || form.emergencyPhone.trim();
    if (hasEmergency && (!form.emergencyName.trim() || !form.emergencyPhone.trim())) {
      toast.error("Please add both your emergency contact's name and phone number");
      return;
    }
    setSavingProfile(true);
    try {
      // Clerk holds the sign-in name; keep it in step so the next sign-in doesn't revert it
      if (clerkUser && (clerkUser.firstName !== form.firstName.trim() || clerkUser.lastName !== form.lastName.trim())) {
        try {
          await clerkUser.update({ firstName: form.firstName.trim(), lastName: form.lastName.trim() });
        } catch (error) {
          console.warn('Could not update the name on the sign-in account:', error);
        }
      }
      await updateProfile({
        firstName: form.firstName,
        lastName: form.lastName,
        phoneNumber: form.phone.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        address: form.address,
        city: form.city,
        emergencyContact: hasEmergency
          ? {
              name: form.emergencyName.trim(),
              relationship: form.emergencyRelationship.trim() || 'Not specified',
              phone: form.emergencyPhone.trim(),
            }
          : undefined,
      });
      toast.success('Profile saved');
    } catch (error) {
      toast.error(readableError(error, "We couldn't save your profile. Please try again."));
    } finally {
      setSavingProfile(false);
    }
  };

  const remindersOn = patient?.notificationPreferences?.appointmentReminders !== false;
  const handleRemindersChange = async (checked: boolean) => {
    try {
      await updateNotificationPreferences({ notificationPreferences: { appointmentReminders: checked } });
      toast.success(checked ? 'Reminders on' : 'Reminders off');
    } catch (error) {
      toast.error(readableError(error, "We couldn't update your reminders."));
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await convex.query(api.patients.exportMyData, {});
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rehabify-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(readableError(error, "We couldn't prepare your data. Please try again."));
    } finally {
      setExporting(false);
    }
  };

  const deletionMailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Delete my Rehabify account')}&body=${encodeURIComponent(
    `Please delete my Rehabify account.\n\nAccount email: ${patient?.email ?? ''}\nName: ${patient?.firstName ?? ''} ${patient?.lastName ?? ''}`
  )}`;

  return (
    <PageContainer className="max-w-4xl">
      <div id="settings-header">
        <PageHeader eyebrow="Account" title="Settings" description="Your details, reminders and data" />
      </div>

      <Tabs defaultValue="profile" className="space-y-5">
        <TabsList id="settings-tabs" className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-soft sm:grid-cols-4">
          <TabsTrigger id="tab-profile" value="profile" className="rounded-xl py-2 data-[state=active]:bg-rh-teal data-[state=active]:text-white">Profile</TabsTrigger>
          <TabsTrigger id="tab-notifications" value="notifications" className="rounded-xl py-2 data-[state=active]:bg-rh-teal data-[state=active]:text-white">Reminders</TabsTrigger>
          <TabsTrigger id="tab-privacy" value="privacy" className="rounded-xl py-2 data-[state=active]:bg-rh-teal data-[state=active]:text-white">Privacy &amp; data</TabsTrigger>
          <TabsTrigger id="tab-calendar" value="calendar" className="rounded-xl py-2 data-[state=active]:bg-rh-teal data-[state=active]:text-white">
            Calendar <span className="ml-1 text-[10px] font-medium uppercase tracking-wide opacity-70">Soon</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-5">
          <Panel bodyClassName="p-5">
            <ProfilePhotoUploader currentImageUrl={currentUser?.imageUrl} size="md" />
          </Panel>

          <Panel title="Personal details" description="Your physiotherapist sees these details" bodyClassName="space-y-4 p-5">
            {!formLoaded ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input id="firstName" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input id="lastName" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={patient?.email ?? ''} disabled />
                  <p className="text-xs text-neutral-500">This is the email you sign in with.</p>
                </div>

                {currentUser?.patientNumber && (
                  <div className="space-y-2">
                    <Label>Patient ID</Label>
                    <div>
                      <RehabifyId value={currentUser.patientNumber} className="text-xs" />
                    </div>
                    <p className="text-xs text-neutral-500">Your permanent Rehabify number. Quote it when you contact a clinic or support.</p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone number</Label>
                    <Input id="phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+234…" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of birth</Label>
                    <Input id="dateOfBirth" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} max={new Date().toISOString().slice(0, 10)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={form.gender} onValueChange={(value) => setForm((f) => ({ ...f, gender: value as Gender }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
                  <div className="space-y-2">
                    <Label htmlFor="address">Home address</Label>
                    <Input id="address" value={form.address} onChange={set('address')} autoComplete="street-address" placeholder="Used for home visits" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={form.city} onChange={set('city')} autoComplete="address-level2" />
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl bg-rh-canvas p-4">
                  <p className="text-sm font-medium text-rh-night">Emergency contact</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Input aria-label="Emergency contact name" placeholder="Name" value={form.emergencyName} onChange={set('emergencyName')} className="bg-white" />
                    <Input aria-label="Relationship" placeholder="Relationship" value={form.emergencyRelationship} onChange={set('emergencyRelationship')} className="bg-white" />
                    <Input aria-label="Emergency contact phone" type="tel" placeholder="Phone" value={form.emergencyPhone} onChange={set('emergencyPhone')} className="bg-white" />
                  </div>
                </div>

                <Button onClick={handleProfileUpdate} disabled={savingProfile} className={`${primaryButtonClass} h-11 w-full sm:w-auto sm:px-8`}>
                  {savingProfile ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : 'Save profile'}
                </Button>
              </>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="notifications">
          <Panel title="Reminders" bodyClassName="space-y-4 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="appointment-reminders">Appointment and exercise reminders</Label>
                <p className="text-sm text-neutral-500">An email and dashboard reminder before each visit, and a morning reminder in your dashboard when you have home exercises</p>
              </div>
              <Switch
                id="appointment-reminders"
                checked={remindersOn}
                disabled={patient === undefined}
                onCheckedChange={handleRemindersChange}
              />
            </div>
            <p className="rounded-xl bg-rh-canvas p-3 text-xs text-neutral-600">
              Messages about your care, such as booking confirmations, changes and invoices, are always sent.
            </p>
          </Panel>
        </TabsContent>

        <TabsContent value="privacy" className="space-y-5">
          <Panel title="Download your data" description="A copy of your profile, appointments, check-ins, exercise logs, invoices and document list" bodyClassName="p-5">
            <Button onClick={handleExport} disabled={exporting} className={`${softButtonClass} h-11`}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download my data
            </Button>
          </Panel>

          <Panel title="Delete your account" bodyClassName="space-y-3 p-5">
            <p className="text-sm text-neutral-600">
              Email us to close your account. Some clinical records must be kept for the period the law requires; we&apos;ll
              confirm what is deleted and what is kept.
            </p>
            <Button asChild variant="outline" className="h-11 rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800">
              <a href={deletionMailto}>
                <Trash2 className="mr-2 h-4 w-4" />
                Request account deletion
              </a>
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-neutral-500">
              <Mail className="h-3.5 w-3.5" /> {SUPPORT_EMAIL}
            </p>
          </Panel>
        </TabsContent>

        <TabsContent value="calendar">
          <Panel
            title="Calendar"
            description="Adding your visits to Google Calendar is coming soon."
            bodyClassName="space-y-4 p-5"
          >
            {calendarNotice === 'success' && (
              <Alert className="border-green-200 bg-green-50 text-green-800">
                <AlertDescription>Google Calendar connected.</AlertDescription>
              </Alert>
            )}
            {(calendarNotice === 'access_denied' || calendarNotice === 'error') && (
              <Alert variant="destructive">
                <AlertDescription>
                  Couldn&apos;t connect your calendar: {calendarNotice === 'access_denied' ? 'access was denied' : 'something went wrong'}.
                </AlertDescription>
              </Alert>
            )}
            <CalendarConnectionStatus currentUser={currentUser} />
          </Panel>
        </TabsContent>
      </Tabs>
      <TourGuide
        tourId="patient-settings-tour"
        steps={[
          {
            target: "#settings-header",
            title: "Account Settings",
            content: "Manage your personal information, reminders and data.",
            position: "bottom",
          },
          {
            target: "#tab-profile",
            title: "Profile",
            content: "Update your contact details and emergency contact.",
            position: "bottom",
          },
          {
            target: "#tab-notifications",
            title: "Reminders",
            content: "Choose whether we remind you before appointments and about your home exercises.",
            position: "bottom",
          },
          {
            target: "#tab-privacy",
            title: "Privacy & data",
            content: "Download a copy of your data or ask us to close your account.",
            position: "bottom",
          },
          {
            target: "#tab-calendar",
            title: "Calendar Integration",
            content: "Adding your visits to Google Calendar is coming soon.",
            position: "bottom",
          },
        ]}
      />
    </PageContainer>
  );
}
