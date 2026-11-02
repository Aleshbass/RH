/** Before the offline tests: both fake test accounts are in the offline pilot. */
import { CLINIC_OWNER_ID, PHYSIO_ID, setPilot } from './helpers';

export default function globalSetup() {
  setPilot(PHYSIO_ID, true);
  setPilot(CLINIC_OWNER_ID, true);
}
