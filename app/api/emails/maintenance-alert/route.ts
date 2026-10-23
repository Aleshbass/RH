import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { format } from 'date-fns';
import { escapeHtml, isServerOrAdmin } from '../_auth';
import { actions, button, bulletList, callout, details, heading, renderEmail, statusPill, type EmailTone } from '@/lib/email/layout';

export const dynamic = 'force-dynamic';

interface MaintenanceAlertRequest {
  clinicId: string;
  resourceName: string;
  maintenanceType: 'scheduled' | 'urgent' | 'overdue';
  scheduledDate: number;
  description?: string;
}

export async function POST(request: NextRequest) {
  // Only our own server (x-rehabify-server-secret) or a signed-in admin may send this.
  if (!(await isServerOrAdmin(request))) {
    return NextResponse.json({ success: false, error: 'Not authorised' }, { status: 401 });
  }

  try {
    const body: MaintenanceAlertRequest = await request.json();
    const { maintenanceType, scheduledDate } = body;
    if (!body.resourceName || typeof scheduledDate !== 'number') {
      return NextResponse.json({ success: false, error: 'resourceName and scheduledDate are required' }, { status: 400 });
    }
    // Caller-supplied text goes into HTML, so escape it.
    const resourceName = escapeHtml(body.resourceName);
    const description = body.description ? escapeHtml(body.description) : undefined;
    const subjectName = String(body.resourceName).replace(/\s+/g, ' ').slice(0, 120);

    // Get clinic details (you would fetch this from your database)
    // For now, using placeholder data
    const clinicEmail = 'admin@physioaroundme.com'; // This should be fetched from clinic data
    // Note: clinicId and clinicName would be used in production to fetch actual clinic details

    const formattedDate = format(new Date(scheduledDate), 'PPP');
    const formattedTime = format(new Date(scheduledDate), 'p');

    const getSubject = () => {
      switch (maintenanceType) {
        case 'scheduled':
          return `Upcoming Maintenance Alert - ${subjectName}`;
        case 'urgent':
          return `🚨 URGENT: Maintenance Required - ${subjectName}`;
        case 'overdue':
          return `⚠️ OVERDUE: Maintenance Alert - ${subjectName}`;
        default:
          return `Maintenance Alert - ${subjectName}`;
      }
    };

    const alert: { title: string; label: string; tone: EmailTone; actions: string[] } =
      maintenanceType === 'urgent'
        ? {
            title: 'Urgent maintenance required',
            label: 'Urgent',
            tone: 'danger',
            actions: [
              'Stop using the resource immediately',
              'Contact the maintenance team urgently',
              'Reschedule affected appointments',
              'Find alternative resources if available',
              'Update the resource status in the system',
            ],
          }
        : maintenanceType === 'overdue'
          ? {
              title: 'Maintenance overdue',
              label: 'Overdue',
              tone: 'warning',
              actions: [
                'Complete maintenance as soon as possible',
                'Check for any safety concerns',
                'Update the maintenance schedule',
                'Review resource availability',
                'Notify affected staff and patients',
              ],
            }
          : {
              title: 'Upcoming maintenance scheduled',
              label: 'Scheduled',
              tone: 'success',
              actions: [
                'Prepare for the scheduled maintenance',
                'Make sure the resource is available at the scheduled time',
                'Reschedule conflicting appointments',
                'Prepare the tools and materials needed',
                'Tell staff about the maintenance window',
              ],
            };

    const html = renderEmail({
      eyebrow: 'Resource management',
      tone: alert.tone,
      title: alert.title,
      preheader: `${subjectName}: ${formattedDate} at ${formattedTime}`,
      body: [
        details([
          ['Resource', resourceName],
          ['Scheduled date', formattedDate],
          ['Scheduled time', formattedTime],
          ['Priority', statusPill(alert.label, alert.tone)],
        ]),
        description ? callout('brand', 'Maintenance description', description) : '',
        heading('Recommended actions'),
        bulletList(alert.actions),
        actions(button('View resource dashboard', `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/physiotherapist/appointments?tab=resources`)),
      ].join(''),
      signOff: false,
      safetyNote: false,
      footerNote: 'Automated message from the Rehabify resource management system.',
    });

    const emailData = {
      from: 'RehabifyHealth <info@physioaroundme.com>',
      to: [clinicEmail],
      subject: getSubject(),
      html,
    };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: true, skipped: true, message: 'Resend API key missing; skipped email send' });
    }
    const resend = new Resend(apiKey);
    const result = await resend.emails.send(emailData);

    return NextResponse.json({
      success: true,
      messageId: result.data?.id,
      message: 'Maintenance alert email sent successfully',
    });

  } catch (error) {
    console.error('Error sending maintenance alert email:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send maintenance alert email',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
