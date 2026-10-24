'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { Repeat } from '@/components/icons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { RecurringAppointmentModal } from '@/components/appointments/RecurringAppointmentModal';
import { RecurringSeriesManager } from '@/components/appointments/RecurringSeriesManager';
import { secondaryButtonClass } from '@/components/physio/ui';
import { ScheduleList } from '@/components/physio/schedule/ScheduleList';
import { useBooking } from '@/components/physio/schedule/BookingDrawer';
import { cn } from '@/lib/utils';

type PatientLite = { _id: string; firstName?: string; lastName?: string };

/** Schedule → Requests & list. `?patient=<id>` (older links) opens the booking drawer for that patient. */
export default function AppointmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openBooking = useBooking();
  const preselectedPatientId = (searchParams?.get('patient') || '').trim();

  const currentUser = useQuery(api.users.getMyUser);
  const patients = useQuery(api.patients.getMyPatientOptions, preselectedPatientId ? {} : 'skip') as PatientLite[] | undefined;
  const [recurringOpen, setRecurringOpen] = useState(false);

  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !preselectedPatientId || !patients) return;
    handled.current = true;
    const patient = patients.find((p) => p._id === preselectedPatientId);
    if (patient) openBooking({ patient: { id: patient._id, name: [patient.firstName, patient.lastName].filter(Boolean).join(' ') || 'Patient' } });
    router.replace('/dashboard/physiotherapist/appointments');
  }, [preselectedPatientId, patients, openBooking, router]);

  return (
    <>
      <ScheduleList
        extraActions={
          <Button className={cn(secondaryButtonClass, 'h-10 px-4')} onClick={() => setRecurringOpen(true)}>
            <Repeat className="mr-2 h-4 w-4" />
            Repeating
          </Button>
        }
        repeating={currentUser ? <RecurringSeriesManager userId={currentUser._id as Id<'users'>} role="physiotherapist" /> : null}
      />
      {currentUser && (
        <RecurringAppointmentModal
          isOpen={recurringOpen}
          onClose={() => setRecurringOpen(false)}
          userId={currentUser._id as Id<'users'>}
          role="physiotherapist"
        />
      )}
    </>
  );
}
