'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarPlus } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { PageContainer, PageHeader, primaryButtonClass } from '@/components/physio/ui';
import { CalendarView } from '@/components/physio/schedule/CalendarView';
import { useBooking } from '@/components/physio/schedule/BookingDrawer';
import { cn } from '@/lib/utils';

/** Schedule → Calendar. `?new=1` (older links) opens a new appointment straight away. */
export default function CalendarPage() {
  const searchParams = useSearchParams();
  const openBooking = useBooking();

  const openedFromQuery = useRef(false);
  useEffect(() => {
    if (!openedFromQuery.current && searchParams.get('new') === '1') {
      openedFromQuery.current = true;
      openBooking();
    }
  }, [searchParams, openBooking]);

  return (
    <PageContainer className="max-w-7xl">
      <CalendarView
        header={
          <PageHeader
            title="Calendar"
            description="Your week at a glance. Tap free time to book it, or a session to open it."
            info="White is your working hours, shaded is outside them. Sessions are coloured by what they need from you, and the green line is now. Times are Lagos time, and everything updates live."
            actions={
              <Button onClick={() => openBooking()} className={cn(primaryButtonClass, 'h-10 px-4')}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                New appointment
              </Button>
            }
          />
        }
      />
    </PageContainer>
  );
}
