/**
 * Live check of the MediLoan (MyItura) connection, using the keys in .env.local.
 *
 *   npx tsx scripts/myitura-sandbox-check.ts                       # read-only: products + a quote
 *   npx tsx scripts/myitura-sandbox-check.ts --initiate 0803…      # also start a SANDBOX application
 *                                                                    texted to that phone
 *
 * Needs MYITURA_API_URL, MYITURA_PUBLIC_KEY and MYITURA_SECRET_KEY. Starting an application is
 * refused with live keys, so this never creates a real loan.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env.local: rely on the shell's environment
  }
}

async function main() {
  loadEnvLocal();
  const { getMediLoanProducts, getMediLoanQuote, initiateMediLoan, myituraBaseUrl, myituraMode, findMediLoansByClientReference } = await import(
    '../lib/myitura/myitura'
  );

  const missing = ['MYITURA_API_URL', 'MYITURA_PUBLIC_KEY', 'MYITURA_SECRET_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing in .env.local: ${missing.join(', ')}`);
    console.error('Sandbox: MYITURA_API_URL=https://devloansapi.myitura.com with pk_test_/sk_test_ keys from the MyItura dashboard (Api Key).');
    process.exit(2);
  }
  const mode = myituraMode();
  console.log(`MyItura ${mode} at ${myituraBaseUrl()}`);
  if (!process.env.MYITURA_WEBHOOK_SECRET) console.warn('Note: MYITURA_WEBHOOK_SECRET is not set; the webhook route refuses every delivery without it.');

  const products = await getMediLoanProducts();
  console.log(`\n✓ GET /sdk/products → ${products.length} product(s)`);
  console.log(JSON.stringify(products.slice(0, 3), null, 2));

  const tenor = (products.find((p) => typeof p.tenorMonths === 'number')?.tenorMonths as number | undefined) ?? 3;
  const principal = 5_000_000; // ₦50,000
  try {
    const quote = await getMediLoanQuote(principal, tenor);
    console.log(`\n✓ POST /sdk/quote (₦50,000 over ${tenor} months) →`, quote);
  } catch (error) {
    console.log(`\n✗ POST /sdk/quote failed: ${(error as Error).message}`);
  }

  const phoneIndex = process.argv.indexOf('--initiate');
  if (phoneIndex === -1) {
    console.log('\nRead-only checks done. Add --initiate <phone> to start a sandbox application.');
    return;
  }
  if (mode !== 'sandbox') {
    console.error('\nRefusing to start an application with live keys.');
    process.exit(3);
  }
  const phone = process.argv[phoneIndex + 1];
  if (!phone) throw new Error('Give a phone number after --initiate');
  const clientReference = `RH-LOAN-TEST-${Date.now()}`;
  const created = await initiateMediLoan({
    clientReference,
    firstName: 'Sandbox',
    lastName: 'Test',
    phoneNumber: phone,
    treatment: 'Physiotherapy (sandbox test)',
    treatmentAmount: principal,
  });
  console.log('\n✓ POST /sdk/loans/initiate →', created.data);
  const found = await findMediLoansByClientReference(clientReference);
  console.log(`✓ GET /sdk/loans?clientReference=${clientReference} → ${found.length} record(s)`, found[0] ?? '');
}

main().catch((error) => {
  console.error('\n✗ Check failed:', error instanceof Error ? `${error.message}${(error as { code?: string }).code ? ` (${(error as { code?: string }).code})` : ''}` : error);
  process.exit(1);
});
