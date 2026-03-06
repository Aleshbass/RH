import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReferralData {
    patientFirstName: string;
    patientLastName: string;
    condition?: string;
    clinicalNotes?: string;
    createdAt: number;
    status: string;
    _id?: string;
}

/** Human-readable labels for internal referral status codes */
const STATUS_LABELS: Record<string, string> = {
    pending: 'Pending Review',
    contacted: 'Patient Contacted',
    booked: 'Session Booked',
    completed: 'Treatment Completed',
    paid_out: 'Commission Paid Out',
    cancelled: 'Cancelled',
};

function getStatusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Sanitise a string for use in a filename:
 * strip accents, replace non-alphanumeric chars, limit length.
 */
function sanitizeFilename(raw: string, maxLength = 30): string {
    return raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, maxLength) || 'Patient';
}

/** Render text with automatic page-break handling, returns the Y position after the last rendered line. */
function renderWrappedText(doc: jsPDF, lines: string[], startX: number, startY: number, lineHeight: number, bottomMargin: number): number {
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = startY;
    for (const line of lines) {
        if (y + lineHeight > pageHeight - bottomMargin) {
            doc.addPage();
            y = 20; // reset to top of new page
        }
        doc.text(line, startX, y);
        y += lineHeight;
    }
    return y;
}

export const generateClinicalReport = (referral: ReferralData, doctorTitle?: string, doctorLastName?: string) => {
    const doc = new jsPDF();
    const FOOTER_MARGIN = 20;

    // Setup Document Properties
    doc.setProperties({
        title: `Clinical Report - ${referral.patientFirstName} ${referral.patientLastName}`,
        subject: 'Rehabify Post-Care Summary',
        author: 'Rehabify Health',
    });

    // --- Header Section ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(0, 91, 87); // #005b57 (Rehabify Brand Color)
    doc.text("Rehabify Health", 14, 20);

    doc.setFontSize(14);
    doc.setTextColor(100, 100, 100);
    doc.text("Clinical Summary & Closed-Loop Report", 14, 28);

    // Use stable date format (YYYY-MM-DD) for consistency across environments
    const generatedDate = new Date().toISOString().slice(0, 10);
    doc.setFontSize(10);
    doc.text(`Generated on: ${generatedDate}`, 14, 34);

    // Separator line
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 38, 196, 38);

    // --- Patient Details ---
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.setFont("helvetica", "bold");
    doc.text("Patient Information", 14, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Name: ${referral.patientFirstName} ${referral.patientLastName}`, 14, 58);
    doc.text(`Primary Condition: ${referral.condition || 'Not specified'}`, 14, 64);
    doc.text(`Referral Date: ${new Date(referral.createdAt).toISOString().slice(0, 10)}`, 14, 70);

    // --- Referring Doctor Details ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Referred By", 120, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // Build doctor name properly: use title+lastName when both exist,
    // just lastName when only lastName is provided, or fallback to generic label
    let doctorName: string;
    if (doctorTitle && doctorLastName) {
        doctorName = `${doctorTitle} ${doctorLastName}`;
    } else if (doctorLastName) {
        doctorName = doctorLastName;
    } else if (doctorTitle) {
        doctorName = doctorTitle;
    } else {
        doctorName = 'Partner Doctor';
    }
    doc.text(`Name: ${doctorName}`, 120, 58);
    doc.text(`Facility: Rehabify Partner Network`, 120, 64);

    // --- Initial Notes Module ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Original Referral Notes", 14, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // Split text to fit page width
    const splitNotes = doc.splitTextToSize(referral.clinicalNotes || 'No initial clinical notes provided by referring doctor.', 180);

    // Use measured line height for accurate Y calculations
    const fontSize = doc.getFontSize();
    const lineHeight = (fontSize * 1.15) / doc.internal.scaleFactor;

    let currentY = renderWrappedText(doc, splitNotes, 14, 93, lineHeight, FOOTER_MARGIN);
    currentY += lineHeight; // gap after notes

    // --- Treatment Summary Module ---
    // Check for page break before section header
    const pageHeight = doc.internal.pageSize.getHeight();
    if (currentY + lineHeight * 4 > pageHeight - FOOTER_MARGIN) {
        doc.addPage();
        currentY = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Treatment Summary (Rehabify)", 14, currentY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // Map internal status codes to user-friendly labels
    const statusLabel = getStatusLabel(referral.status);
    let summaryText = "";
    if (referral.status === 'completed' || referral.status === 'paid_out') {
        summaryText = "Patient has successfully completed their prescribed physiotherapy sessions. Progress was noted in functional mobility and pain reduction. Maintenance exercises have been provided for home care.";
    } else {
        summaryText = `Patient is currently in the "${statusLabel}" phase of their treatment lifecycle. A final clinical outcome report will be available upon discharge.`;
    }

    const splitSummary = doc.splitTextToSize(summaryText, 180);
    currentY = renderWrappedText(doc, splitSummary, 14, currentY + 8, lineHeight, FOOTER_MARGIN);
    currentY += lineHeight * 2; // gap after summary

    // --- Session History Table ---
    if (referral.status === 'completed' || referral.status === 'paid_out') {
        // Placeholder session data — replace with real session records once available
        const tableData = [
            ["Session 1", "Initial Assessment & Custom Plan", "Completed"],
            ["Session 2", "Manual Therapy & Mobility", "Completed"],
            ["Session 3", "Strength Conditioning", "Completed"],
            ["Session 4", "Discharge & Home Plan", "Completed"],
        ];

        autoTable(doc, {
            startY: currentY,
            head: [['Session', 'Focus', 'Status']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [0, 91, 87] },
            styles: { fontSize: 9 },
        });
    }

    // --- Footer ---
    const lastPageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("End of Clinical Report. For inquiries, contact providers@rehabify.com", 14, lastPageHeight - 10);

    // Save/Download the PDF — use sanitized identifier
    const safeId = referral._id
        ? sanitizeFilename(String(referral._id))
        : sanitizeFilename(referral.patientLastName);
    doc.save(`Rehabify_Report_${safeId}_${Date.now()}.pdf`);
};
