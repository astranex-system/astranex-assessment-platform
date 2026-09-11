import logging
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import AuditLog

logger = logging.getLogger("astranex.audit")

async def log_audit_event(
    db: AsyncSession,
    event_type: str,
    resource: str,
    actor_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    ip_address: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
):
    """
    Persists audit log event to DB and writes structured log entry.
    Ensures passwords, raw tokens, and secret answer keys are never stored in audit metadata.
    """
    # Sanitize metadata to prevent secret leakage
    sanitized_metadata = {}
    if metadata:
        for k, v in metadata.items():
            if any(secret_kw in k.lower() for secret_kw in ["password", "token", "key", "answer", "correct"]):
                sanitized_metadata[k] = "[REDACTED]"
            else:
                sanitized_metadata[k] = v

    audit_entry = AuditLog(
        event_type=event_type,
        actor_id=actor_id,
        actor_role=actor_role,
        resource=resource,
        ip_address=ip_address,
        metadata_json=sanitized_metadata
    )
    db.add(audit_entry)
    await db.commit()

    logger.info(f"AUDIT_EVENT | event={event_type} | actor={actor_id} | resource={resource} | ip={ip_address}")
