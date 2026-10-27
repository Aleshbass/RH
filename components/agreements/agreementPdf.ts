/**
 * The signed copy of an agreement as a PDF, built in the browser with jsPDF: the full text with
 * the signer's details, both signatures and the signing record (fingerprint, times, method).
 * Standard PDF fonts can't print ₦, so amounts read "NGN".
 */
import type { LegalBlock } from '@/lib/legal/types';
import { AGREEMENTS, filledAgreement, REHABIFY_SIGNATORIES, type AgreementId } from '@/lib/agreements';

export type SignedAgreement = {
  id: string;
  agreementId: AgreementId;
  version: string;
  values: Record<string, string>;
  signatureName: string;
  signatureTitle: string | null;
  signatureDrawing: string | null;
  signerEmail: string;
  documentHash: string;
  signedAt: number;
  status: 'awaiting_countersign' | 'active' | 'void';
  countersignName: string | null;
  countersignTitle: string | null;
  countersignedAt: number | null;
};

const MM = { left: 20, right: 20, top: 22, bottom: 20 };
const INK: [number, number, number] = [11, 19, 18];
const MUTED: [number, number, number] = [96, 104, 103];
const RULE: [number, number, number] = [222, 216, 206];

const WIN_ANSI_EXTRAS = new Set('‘’“”–—•…€™'.split(''));

/** Keep to what the standard PDF fonts can draw. */
function pdfSafe(text: string): string {
  return Array.from(text.replace(/₦/g, 'NGN ').replace(/[⟦⟧]/g, ''))
    .map((ch) => (ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRAS.has(ch) ? ch : ''))
    .join('');
}

export function formatSigned(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
    timeZoneName: 'short',
  });
}

/** A typed or drawn signature as a PNG, for the signature line. */
async function signatureImage(sig: SignedAgreement, fontFamily: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 360;
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.fillStyle = 'rgb(11,19,18)';
  c.strokeStyle = 'rgb(11,19,18)';
  if (sig.signatureDrawing) {
    // Drawn on a 600 × 180 pad
    c.scale(2, 2);
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke(new Path2D(sig.signatureDrawing));
  } else {
    try {
      await document.fonts.load(`120px ${fontFamily}`);
    } catch {
      // Falls back to the browser's cursive font
    }
    c.font = `120px ${fontFamily}, cursive`;
    c.textBaseline = 'middle';
    let size = 120;
    while (c.measureText(sig.signatureName).width > 1140 && size > 40) {
      size -= 8;
      c.font = `${size}px ${fontFamily}, cursive`;
    }
    c.fillText(sig.signatureName, 30, 190);
  }
  return canvas.toDataURL('image/png');
}

type Run = { text: string; bold: boolean };

const toRuns = (text: string): Run[] =>
  pdfSafe(text)
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => (part.startsWith('**') && part.endsWith('**') ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false }));

export async function downloadAgreementPdf(sig: SignedAgreement, signatureFontFamily: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const spec = AGREEMENTS[sig.agreementId];
  const doc = filledAgreement(sig.agreementId, sig.values, sig.signedAt);
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const width = pageW - MM.left - MM.right;
  let y = MM.top;

  const ensure = (height: number) => {
    if (y + height > pageH - MM.bottom) {
      pdf.addPage();
      y = MM.top;
    }
  };
  const setFont = (bold: boolean, size: number, color = INK) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
  };

  /** Wraps rich text, keeping bold words bold. */
  const paragraph = (runs: Run[], opts: { size?: number; indent?: number; gapAfter?: number; color?: typeof INK } = {}) => {
    const size = opts.size ?? 9.5;
    const lineH = size * 0.47;
    const x0 = MM.left + (opts.indent ?? 0);
    const max = width - (opts.indent ?? 0);
    const lines: Run[][] = [[]];
    let lineW = 0;
    for (const run of runs) {
      for (const word of run.text.split(/(\s+)/)) {
        if (!word) continue;
        setFont(run.bold, size);
        const w = pdf.getTextWidth(word);
        const isSpace = /^\s+$/.test(word);
        if (!isSpace && lineW + w > max && lineW > 0) {
          lines.push([]);
          lineW = 0;
        }
        if (isSpace && lineW === 0) continue;
        lines[lines.length - 1].push({ text: word, bold: run.bold });
        lineW += w;
      }
    }
    for (const line of lines) {
      ensure(lineH);
      let x = x0;
      for (const piece of line) {
        setFont(piece.bold, size, opts.color);
        pdf.text(piece.text, x, y + lineH * 0.8);
        x += pdf.getTextWidth(piece.text);
      }
      y += lineH;
    }
    y += opts.gapAfter ?? 2.2;
  };

  const table = (head: string[], rows: string[][]) => {
    const cols = head.length;
    const widths = cols === 2 ? [width * 0.32, width * 0.68] : head.map(() => width / cols);
    const pad = 1.8;
    const size = 8.5;
    const lineH = size * 0.47;
    const drawRow = (cells: string[], header: boolean) => {
      const wrapped = cells.map((cell, i) => {
        setFont(header || i === 0, size);
        return pdf.splitTextToSize(pdfSafe(cell.replace(/\*\*/g, '')), widths[i] - pad * 2) as string[];
      });
      const h = Math.max(...wrapped.map((lines) => lines.length)) * lineH + pad * 2;
      ensure(h);
      if (header) {
        pdf.setFillColor(244, 237, 227);
        pdf.rect(MM.left, y, width, h, 'F');
      }
      pdf.setDrawColor(...RULE);
      pdf.line(MM.left, y + h, MM.left + width, y + h);
      let x = MM.left;
      wrapped.forEach((lines, i) => {
        setFont(header || i === 0, size);
        lines.forEach((line, j) => pdf.text(line, x + pad, y + pad + lineH * (j + 0.8)));
        x += widths[i];
      });
      y += h;
    };
    drawRow(head, true);
    rows.forEach((row) => drawRow(row, false));
    y += 3;
  };

  const block = (b: LegalBlock) => {
    if (b.type === 'p') paragraph(toRuns(b.text));
    else if (b.type === 'table') table(b.head, b.rows);
    else
      b.items.forEach((item, i) => {
        const marker = b.type === 'ol' ? `${i + 1}.` : '•';
        const startY = y;
        paragraph(toRuns(item), { indent: 8, gapAfter: 1.2 });
        setFont(false, 9.5);
        pdf.text(marker, MM.left + 2, startY + 9.5 * 0.47 * 0.8);
      });
  };

  // Title
  setFont(true, 17);
  for (const line of pdf.splitTextToSize(pdfSafe(doc.title), width) as string[]) {
    pdf.text(line, MM.left, y + 6);
    y += 7.5;
  }
  setFont(false, 9, MUTED);
  pdf.text(pdfSafe(`Version ${sig.version} · Signed electronically on Rehabify · Record ${sig.id}`), MM.left, y + 3);
  y += 9;

  doc.intro.forEach(block);
  for (const section of doc.sections) {
    ensure(14);
    y += 2;
    setFont(true, 11.5);
    for (const line of pdf.splitTextToSize(pdfSafe(section.title), width) as string[]) {
      pdf.text(line, MM.left, y + 4);
      y += 5.6;
    }
    y += 1.5;
    section.blocks.forEach(block);
  }

  // Execution
  pdf.addPage();
  y = MM.top;
  paragraph(toRuns(spec.witness), { size: 10, gapAfter: 6 });

  const boxW = (width - 8) / 2;
  const boxH = 62;
  const drawParty = (x: number, heading: string, lines: [string, string][], image: string | null, note?: string) => {
    pdf.setDrawColor(...RULE);
    pdf.roundedRect(x, y, boxW, boxH, 2, 2, 'S');
    setFont(true, 9.5);
    pdf.text(pdfSafe(heading), x + 4, y + 7);
    if (image) pdf.addImage(image, 'PNG', x + 4, y + 10, 52, 15.6);
    else if (note) {
      setFont(false, 9, MUTED);
      pdf.text(pdf.splitTextToSize(pdfSafe(note), boxW - 8) as string[], x + 4, y + 17);
    }
    pdf.setDrawColor(...INK);
    pdf.line(x + 4, y + 27, x + boxW - 4, y + 27);
    let ly = y + 33;
    for (const [label, value] of lines) {
      setFont(false, 8, MUTED);
      pdf.text(pdfSafe(label), x + 4, ly);
      setFont(false, 9);
      const wrapped = pdf.splitTextToSize(pdfSafe(value || '—'), boxW - 32) as string[];
      pdf.text(wrapped, x + 28, ly);
      ly += 5.4 * Math.max(1, wrapped.length);
    }
  };

  const signed = formatSigned(sig.signedAt);
  const rehabifyLines: [string, string][] =
    sig.countersignedAt && sig.countersignName
      ? [
          ['Name', sig.countersignName],
          ['Designation', sig.countersignTitle ?? ''],
          ['Date', formatSigned(sig.countersignedAt)],
        ]
      : [
          ['Name', spec.countersign ? '' : REHABIFY_SIGNATORIES[0].name],
          ['Designation', spec.countersign ? '' : REHABIFY_SIGNATORIES[0].title],
          ['Date', spec.countersign ? '' : signed],
        ];
  const rehabifyNote = sig.countersignedAt
    ? `Signed electronically by ${sig.countersignName}`
    : spec.countersign
      ? 'Awaiting Rehabify’s signature'
      : 'Offered on the Platform and accepted electronically by the other party';
  drawParty(MM.left, 'For and on behalf of REHABIFY LIMITED', rehabifyLines, null, rehabifyNote);

  const partyHeading =
    spec.party === 'clinic' ? `For and on behalf of ${sig.values.clinicLegalName ?? 'the Clinic'}` : spec.countersign ? 'Signed by the CONTRACTOR' : 'THE PRACTITIONER';
  const partyLines: [string, string][] =
    spec.party === 'clinic'
      ? [
          ['Name', sig.signatureName],
          ['Designation', sig.signatureTitle ?? ''],
          ['Date', signed],
        ]
      : [
          ['Name', sig.signatureName],
          ['MRTB Reg. No.', sig.values.mrtbNumber ?? ''],
          ['Date', signed],
        ];
  drawParty(MM.left + boxW + 8, partyHeading, partyLines, await signatureImage(sig, signatureFontFamily));
  y += boxH + 10;

  // Signing record
  setFont(true, 11);
  pdf.text('Signing record', MM.left, y);
  y += 6;
  const record: [string, string][] = [
    ['Agreement', `${spec.title}, version ${sig.version}`],
    ['Record', sig.id],
    ['Signed by', `${sig.signatureName} (${sig.signerEmail})`],
    ['Signed at', signed],
    [
      'How',
      `Signed in to Rehabify; ${sig.signatureDrawing ? 'drew and typed their signature' : 'typed their full name as their signature'} and confirmed “I agree”.`,
    ],
    [
      'Rehabify',
      sig.countersignedAt
        ? `Countersigned by ${sig.countersignName}, ${sig.countersignTitle}, ${formatSigned(sig.countersignedAt)}`
        : spec.countersign
          ? 'Awaiting countersignature'
          : 'Not required: accepted electronically',
    ],
    ['Fingerprint', `SHA-256 ${sig.documentHash}`],
  ];
  table(['Item', 'Detail'], record);
  paragraph(
    toRuns(
      'The fingerprint is calculated from the exact wording above, including the details filled in. Rehabify keeps the record and can recalculate it to show this copy is unchanged. Electronic signatures are valid under the Evidence Act 2011.'
    ),
    { size: 8.5, color: MUTED }
  );

  // Footer on every page
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    setFont(false, 7.5, MUTED);
    pdf.text(pdfSafe(`${spec.title} · v${sig.version} · ${sig.id}`), MM.left, pageH - 10);
    pdf.text(`Page ${i} of ${pages}`, pageW - MM.right, pageH - 10, { align: 'right' });
  }

  const who = (sig.values.clinicLegalName ?? sig.signatureName).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  pdf.save(`Rehabify-${spec.shortTitle.replace(/\s+/g, '-')}-${who}-${sig.version}.pdf`);
}

/** Recalculates the fingerprint in the browser, to show the stored record matches the text. */
export async function verifyFingerprint(sig: SignedAgreement): Promise<boolean> {
  const { agreementPlainText } = await import('@/lib/agreements');
  if (typeof crypto === 'undefined' || !crypto.subtle) return false;
  const bytes = new TextEncoder().encode(agreementPlainText(sig.agreementId, sig.values, sig.signedAt));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex === sig.documentHash;
}
