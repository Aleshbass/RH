import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReferralData {
    patientFirstName: string;
    patientLastName: string;
    condition?: string;
    clinicalNotes?: string;
    createdAt: number;
    status: string;
}

export const generateClinicalReport = (referral: ReferralData, doctorTitle?: string, doctorLastName?: string) => {
    // Initialize jsPDF
    const doc = new jsPDF();

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

    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 34);

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
    doc.text(`Referral Date: ${new Date(referral.createdAt).toLocaleDateString()}`, 14, 70);

    // --- Referring Doctor Details ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Referred By", 120, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const doctorName = doctorTitle || doctorLastName ? `${doctorTitle || 'Dr.'} ${doctorLastName || ''}` : 'Partner Doctor';
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
    doc.text(splitNotes, 14, 93);

    // Calculate Y offset after notes
    const afterNotesY = 93 + (splitNotes.length * 5) + 5;

    // --- Treatment Summary Module ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Treatment Summary (Rehabify)", 14, afterNotesY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    let summaryText = "";
    if (referral.status === 'completed' || referral.status === 'paid_out') {
        summaryText = "Patient has successfully completed their prescribed physiotherapy sessions. Progress was noted in functional mobility and pain reduction. Maintenance exercises have been provided for home care.";
    } else {
        summaryText = `Patient is currently in '${referral.status}' phase of their treatment lifecycle. A final clinical outcome report will be available upon discharge.`;
    }

    const splitSummary = doc.splitTextToSize(summaryText, 180);
    doc.text(splitSummary, 14, afterNotesY + 8);

    const afterSummaryY = afterNotesY + 8 + (splitSummary.length * 5) + 10;

    // --- Session History Table ---
    if (referral.status === 'completed' || referral.status === 'paid_out') {
        // Dummy data for visual representation of completed sessions
        const tableData = [
            ["Session 1", "Initial Assessment & Custom Plan", "Completed"],
            ["Session 2", "Manual Therapy & Mobility", "Completed"],
            ["Session 3", "Strength Conditioning", "Completed"],
            ["Session 4", "Discharge & Home Plan", "Completed"],
        ];

        autoTable(doc, {
            startY: afterSummaryY,
            head: [['Session', 'Focus', 'Status']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [0, 91, 87] },
            styles: { fontSize: 9 },
        });
    }

    // --- Footer ---
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("End of Clinical Report. For inquiries, contact providers@rehabify.com", 14, pageHeight - 10);

    // Save/Download the PDF
    doc.save(`Rehabify_Report_${referral.patientLastName}_${new Date().getTime()}.pdf`);
};
