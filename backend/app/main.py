import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.middleware import SecurityHeadersMiddleware, RateLimitMiddleware, GenericExceptionMiddleware
from app.routers import candidate, admin

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("astranex.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing AstraNex Defence Assessment Platform Backend...")
    await init_db()
    yield
    logger.info("Shutting down backend services.")

app = FastAPI(
    title="AstraNex Defence Secure Assessment API",
    version="1.0.0",
    docs_url=None,  # Disable Swagger UI in production to prevent schema/endpoint enumeration
    redoc_url=None,
    lifespan=lifespan
)

# CORS: Allow only explicitly configured origin (Never wildcard *)
ALLOWED_ORIGINS = [
    os.getenv("FRONTEND_ORIGIN", "http://localhost:3000"),
    "http://127.0.0.1:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
)

# Security & Audit Middleware
app.add_middleware(GenericExceptionMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=120)
app.add_middleware(SecurityHeadersMiddleware)

# Register API Routers
app.include_router(candidate.router)
app.include_router(admin.router)

@app.get("/health")
async def health_check():
    return {"status": "HEALTHY", "platform": "AstraNex Defence Secure Engine"}
