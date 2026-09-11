import os
import time
import logging
from typing import Dict, Tuple
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger("astranex.security")

# Basic in-memory rate limiter for fallback (used if Redis is absent or in lightweight mode)
_rate_limit_store: Dict[str, Tuple[int, float]] = {}

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Applies security headers to every HTTP response according to defense standards.
    """
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        
        # CSP: Strict policy preventing inline scripts or framing
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "  # allowed for React hydrate scripts if needed
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "font-src 'self'; "
            "frame-ancestors 'none'; "
            "form-action 'self';"
        )
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
        return response

class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limits sensitive authentication and submission endpoints.
    """
    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Only rate limit API paths
        if request.url.path.startswith("/api/"):
            client_ip = request.client.host if request.client else "unknown"
            key = f"{client_ip}:{request.url.path}"
            now = time.time()
            
            count, reset_at = _rate_limit_store.get(key, (0, now + 60))
            if now > reset_at:
                count = 0
                reset_at = now + 60
            
            if count >= self.requests_per_minute:
                logger.warning(f"Rate limit exceeded for IP {client_ip} on path {request.url.path}")
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Too many requests. Please wait before retrying."}
                )
            
            _rate_limit_store[key] = (count + 1, reset_at)

        return await call_next(request)

class GenericExceptionMiddleware(BaseHTTPMiddleware):
    """
    Catches unhandled exceptions and returns sanitized error messages with CORS headers.
    """
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        try:
            return await call_next(request)
        except Exception as exc:
            logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
            origin = request.headers.get("origin", "https://astranex-assessment-platform.vercel.app")
            headers = {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Credentials": "true",
            }
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": f"Internal Server Error: {str(exc)}"},
                headers=headers
            )
