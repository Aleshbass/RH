from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.safety.protocol_runtime import validate_active_protocol
from app.api.health import router as health_router
from app.api.internal.admin_panel import router as admin_panel_router
from app.api.internal.jobs import router as jobs_router
from app.api.internal.partner_portal import router as partner_portal_router
from app.api.internal.physio_profile import router as physio_profile_router
from app.api.internal.receipts import router as receipts_router
from app.api.internal.simulate import router as simulate_router
from app.api.webhooks.paystack import router as paystack_router
from app.api.webhooks.whatsapp import router as whatsapp_router

@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_active_protocol()
    yield


app = FastAPI(title="Joy AI", lifespan=lifespan)
app.include_router(health_router)
app.include_router(whatsapp_router)
app.include_router(paystack_router)
app.include_router(simulate_router)
app.include_router(jobs_router)
app.include_router(admin_panel_router)
app.include_router(physio_profile_router)
app.include_router(partner_portal_router)
app.include_router(receipts_router)
