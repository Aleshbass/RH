/** Before the offline tests: the local build is running, and both fake test accounts are in the offline pilot. */
import { CLINIC_OWNER_ID, PHYSIO_ID, setPilot, startWebsite } from './helpers';

export default async function globalSetup() {
  await startWebsite();
  setPilot(PHYSIO_ID, true);
  setPilot(CLINIC_OWNER_ID, true);
}
