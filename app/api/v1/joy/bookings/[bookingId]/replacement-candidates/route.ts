import { z } from "zod";
import { actorSchema, authenticatedJson, errorResponse, success } from "@/lib/joy-integration/http";
import { JoyAuthError } from "@/lib/joy-integration/auth";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";
const schema = z.object({ patient_id: z.string().min(1), actor: actorSchema }).strict();
export async function POST(request: Request, context: { params: Promise<{ bookingId: string }> }) { let id=request.headers.get("X-Request-Id")??"unknown"; try { const a=await authenticatedJson(request,schema); id=a.requestId; if(a.data.actor.persona!=="patient"||(a.data.actor.rh_user_id&&a.data.actor.rh_user_id!==a.data.patient_id)) throw new JoyAuthError(403,"FORBIDDEN","Forbidden"); const {bookingId}=await context.params; return success(id,await callJoyConvexGateway("replacement_candidates",{booking_id:bookingId})); } catch(e){return errorResponse(id,e);} }
