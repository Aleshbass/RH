from fastapi import FastAPI
from app.api.health import router as health_router
from app.api.internal.simulate import router as simulate_router
from app.api.webhooks.paystack import router as paystack_router
from app.api.webhooks.whatsapp import router as whatsapp_router

app = FastAPI(title="Joy AI")
app.include_router(health_router)
app.include_router(whatsapp_router)
app.include_router(paystack_router)
app.include_router(simulate_router)
