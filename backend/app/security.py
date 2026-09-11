import secrets
import hashlib
import hmac
import os
import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from jose import jwt, JWTError
from fastapi import Request, HTTPException, status

SECRET_KEY = os.getenv("JWT_SECRET", "astranex-super-secret-production-key-change-me-32chars-min!")
ALGORITHM = "HS256"
SESSION_COOKIE_NAME = "astranex_session"
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_COOKIE_NAME = "astranex_csrf"

def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode('utf-8')[:72]
    hash_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(pwd_bytes, hash_bytes)

def generate_secure_token(length: int = 32) -> str:
    """Generate high-entropy cryptographically secure random token string."""
    return secrets.token_urlsafe(length)

def hash_token(token: str) -> str:
    """Hash token using SHA-256 for storage in DB."""
    return hashlib.sha256(token.encode('utf-8')).hexdigest()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(hours=2)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

def generate_csrf_token() -> str:
    return secrets.token_hex(32)

def verify_csrf_token(request: Request):
    """
    Verify CSRF token for state-changing HTTP requests.
    Validates X-CSRF-Token header against astranex_csrf cookie.
    """
    if request.method in ["GET", "HEAD", "OPTIONS"]:
        return
    
    header_csrf = request.headers.get(CSRF_HEADER_NAME)
    cookie_csrf = request.cookies.get(CSRF_COOKIE_NAME)

    if not header_csrf or not cookie_csrf or not hmac.compare_digest(header_csrf, cookie_csrf):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF validation failed. Invalid or missing CSRF token."
        )
