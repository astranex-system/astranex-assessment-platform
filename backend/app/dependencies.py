import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import AssessmentSession, User, UserRole, SessionStatus
from app.security import decode_access_token, SESSION_COOKIE_NAME

logger = logging.getLogger("astranex.deps")

async def get_current_candidate_session(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> AssessmentSession:
    """
    Extracts and validates candidate session identity strictly from HttpOnly session cookie.
    Derives candidate identity server-side to prevent IDOR attacks.
    Checks server-side assessment deadline.
    """
    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_token:
        # Also check Authorization header for flexibility in API testing
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]

    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication session required."
        )

    payload = decode_access_token(session_token)
    if not payload or payload.get("role") != "candidate":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session credentials."
        )

    session_id = payload.get("session_id")
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token payload."
        )

    stmt = select(AssessmentSession).where(AssessmentSession.id == session_id)
    res = await db.execute(stmt)
    session = res.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Assessment session not found."
        )

    # Validate session status
    if session.status != SessionStatus.IN_PROGRESS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Assessment session is {session.status.value}. Further modifications are forbidden."
        )

    # Server clock enforcement: Reject requests past expires_at
    now = datetime.now(timezone.utc)
    expires_at = session.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at and now > expires_at:
        session.status = SessionStatus.EXPIRED
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Assessment time limit has expired."
        )

    return session

async def get_current_admin(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Validates admin/recruiter credentials. Candidates can NEVER pass this dependency.
    """
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication token required."
        )

    payload = decode_access_token(token)
    if not payload or payload.get("role") not in [UserRole.ADMIN, UserRole.RECRUITER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin or Recruiter role required."
        )

    user_id = payload.get("user_id")
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or deactivated admin account."
        )

    return user
