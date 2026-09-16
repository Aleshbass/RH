import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { JoyAuthError } from "@/lib/joy-integration/auth";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
const schema=z.object({patient_id:z.string().min(1),physiotherapist_id:z.string().min(1),slot_start:z.number().int(),actor:actorSchema}).strict();
export async function POST(request:Request,context:{params:Promise<{bookingId:string}>}){let id=request.headers.get("X-Request-Id")??"unknown";try{const a=await authenticatedJson(request,schema);id=a.requestId;const key=request.headers.get("Idempotency-Key");if(!key)throw new JoyAuthError(400,"IDEMPOTENCY_KEY_REQUIRED","Idempotency-Key is required");if(a.data.actor.persona!=="patient"||(a.data.actor.rh_user_id&&a.data.actor.rh_user_id!==a.data.patient_id))throw new JoyAuthError(403,"FORBIDDEN","Forbidden");const {bookingId}=await context.params;return success(id,await callJoyConvexGateway("reassign_booking",{booking_id:bookingId,physiotherapist_id:a.data.physiotherapist_id,slot_start:a.data.slot_start}));}catch(e){return errorResponse(id,e);}}
