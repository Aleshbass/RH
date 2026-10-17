import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { format } from 'date-fns';
import { escapeHtml, isServerOrAdmin } from '../_auth';

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

    const getEmailContent = () => {
      const baseContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">RehabifyHealth</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Resource Management System</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              ${getAlertIcon()}
              <h2 style="color: #333; margin: 15px 0 10px 0;">${getAlertTitle()}</h2>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
              <h3 style="color: #333; margin: 0 0 15px 0;">Resource Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Resource Name:</td>
                  <td style="padding: 8px 0; color: #333;">${resourceName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Scheduled Date:</td>
                  <td style="padding: 8px 0; color: #333;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Scheduled Time:</td>
                  <td style="padding: 8px 0; color: #333;">${formattedTime}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Priority:</td>
                  <td style="padding: 8px 0;">${getPriorityBadge()}</td>
                </tr>
              </table>
            </div>
            
            ${description ? `
              <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid #2196f3;">
                <h4 style="color: #1976d2; margin: 0 0 10px 0;">Maintenance Description</h4>
                <p style="color: #333; margin: 0; line-height: 1.6;">${description}</p>
              </div>
            ` : ''}
            
            <div style="background: ${getActionBackground()}; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
              <h4 style="color: ${getActionColor()}; margin: 0 0 15px 0;">Recommended Actions</h4>
              <ul style="color: #333; margin: 0; padding-left: 20px; line-height: 1.8;">
                ${getRecommendedActions()}
              </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/physiotherapist/appointments?tab=resources" 
                 style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                View Resource Dashboard
              </a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #666; font-size: 14px;">
            <p>This is an automated message from RehabifyHealth Resource Management System.</p>
            <p>© 2024 RehabifyHealth. All rights reserved.</p>
          </div>
        </div>
      `;

      return baseContent;
    };

    const getAlertIcon = () => {
      switch (maintenanceType) {
        case 'urgent':
          return '<div style="font-size: 48px;">🚨</div>';
        case 'overdue':
          return '<div style="font-size: 48px;">⚠️</div>';
        default:
          return '<div style="font-size: 48px;">🔧</div>';
      }
    };

    const getAlertTitle = () => {
      switch (maintenanceType) {
        case 'scheduled':
          return 'Upcoming Maintenance Scheduled';
        case 'urgent':
          return 'Urgent Maintenance Required';
        case 'overdue':
          return 'Maintenance Overdue';
        default:
          return 'Maintenance Alert';
      }
    };

    const getPriorityBadge = () => {
      switch (maintenanceType) {
        case 'urgent':
          return '<span style="background: #f44336; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">URGENT</span>';
        case 'overdue':
          return '<span style="background: #ff9800; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">OVERDUE</span>';
        default:
          return '<span style="background: #4caf50; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">SCHEDULED</span>';
      }
    };

    const getActionBackground = () => {
      switch (maintenanceType) {
        case 'urgent':
          return '#ffebee';
        case 'overdue':
          return '#fff3e0';
        default:
          return '#e8f5e8';
      }
    };

    const getActionColor = () => {
      switch (maintenanceType) {
        case 'urgent':
          return '#c62828';
        case 'overdue':
          return '#ef6c00';
        default:
          return '#2e7d32';
      }
    };

    const getRecommendedActions = () => {
      switch (maintenanceType) {
        case 'urgent':
          return `
            <li>Stop using the resource immediately</li>
            <li>Contact maintenance team urgently</li>
            <li>Reschedule affected appointments</li>
            <li>Find alternative resources if available</li>
            <li>Update resource status in the system</li>
          `;
        case 'overdue':
          return `
            <li>Complete maintenance as soon as possible</li>
            <li>Check for any safety concerns</li>
            <li>Update maintenance schedule</li>
            <li>Review resource availability</li>
            <li>Notify affected staff and patients</li>
          `;
        default:
          return `
            <li>Prepare for scheduled maintenance</li>
            <li>Ensure resource is available at scheduled time</li>
            <li>Reschedule conflicting appointments</li>
            <li>Prepare necessary tools and materials</li>
            <li>Update staff about the maintenance window</li>
          `;
      }
    };

    const emailData = {
      from: 'RehabifyHealth <info@physioaroundme.com>',
      to: [clinicEmail],
      subject: getSubject(),
      html: getEmailContent(),
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
