import os
import logging
from typing import AsyncGenerator
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select
from app.models import Base, User, UserRole
from app.security import hash_password

logger = logging.getLogger("astranex.database")

RAW_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./astranex.db")

def sanitize_asyncpg_url(url_str: str) -> str:
    """
    Strips PostgreSQL query parameters incompatible with asyncpg (e.g. channel_binding, sslmode)
    and converts them to asyncpg-supported ssl parameters.
    """
    if not url_str.startswith("postgresql"):
        return url_str
    
    # Standardize scheme for async SQLAlchemy
    if url_str.startswith("postgresql://"):
        url_str = url_str.replace("postgresql://", "postgresql+asyncpg://", 1)
        
    parsed = urlparse(url_str)
    if not parsed.query:
        return url_str
        
    query_params = parse_qs(parsed.query)
    needs_ssl = "sslmode" in parsed.query
    
    # Strip parameters unsupported by asyncpg
    for param in ["sslmode", "channel_binding", "gssencmode", "target_session_attrs", "sslrootcert"]:
        query_params.pop(param, None)
                
    if needs_ssl and "ssl" not in query_params:
        query_params["ssl"] = ["require"]

    new_query = urlencode(query_params, doseq=True)
    new_parsed = parsed._replace(query=new_query)
    return urlunparse(new_parsed)

DATABASE_URL = sanitize_asyncpg_url(RAW_DATABASE_URL)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    connect_args=connect_args
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

async def init_db():
    from sqlalchemy import text
    
    # 1. Create any missing tables
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        logger.warning(f"Error during Base.metadata.create_all: {e}")

    # 2. Database migrations for existing tables
    is_postgres = "postgresql" in str(engine.url).lower()

    if is_postgres:
        pg_migration_statements = [
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS phone VARCHAR(50);",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';",
            "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS role VARCHAR(255) DEFAULT 'Software Engineering';",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS total_marks FLOAT DEFAULT 100.0;",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS passing_marks FLOAT DEFAULT 60.0;",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 1;",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_code VARCHAR(50);",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS section VARCHAR(255) DEFAULT 'General';",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty VARCHAR(50) DEFAULT 'Medium';",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS tags VARCHAR(255) DEFAULT '';",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';",
            "ALTER TABLE assessment_sessions ALTER COLUMN token_id DROP NOT NULL;",
            """
            CREATE TABLE IF NOT EXISTS candidate_assessment_assignments (
                id VARCHAR(36) PRIMARY KEY,
                candidate_id VARCHAR(36) NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
                assessment_id VARCHAR(36) NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
                assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deadline TIMESTAMP WITH TIME ZONE,
                attempts_used INTEGER DEFAULT 0,
                status VARCHAR(50) DEFAULT 'NOT_STARTED',
                CONSTRAINT uq_cand_asm_assignment UNIQUE (candidate_id, assessment_id)
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS integrity_events (
                id VARCHAR(36) PRIMARY KEY,
                candidate_id VARCHAR(36) REFERENCES candidates(id) ON DELETE CASCADE,
                assessment_id VARCHAR(36) REFERENCES assessments(id) ON DELETE CASCADE,
                session_id VARCHAR(36) REFERENCES assessment_sessions(id) ON DELETE CASCADE,
                event_type VARCHAR(100) NOT NULL,
                risk_level VARCHAR(20) DEFAULT 'LOW',
                details JSON,
                status VARCHAR(50) DEFAULT 'PENDING',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        ]
        for stmt in pg_migration_statements:
            try:
                async with engine.begin() as conn:
                    await conn.execute(text(stmt))
            except Exception as e:
                logger.warning(f"Postgres migration notice for [{stmt.strip()[:60]}...]: {e}")
    else:
        sqlite_migration_statements = [
            "ALTER TABLE candidates ADD COLUMN phone VARCHAR(50);",
            "ALTER TABLE candidates ADD COLUMN status VARCHAR(50) DEFAULT 'ACTIVE';",
            "ALTER TABLE candidates ADD COLUMN password_hash VARCHAR(255);",
            "ALTER TABLE assessments ADD COLUMN role VARCHAR(255) DEFAULT 'Software Engineering';",
            "ALTER TABLE assessments ADD COLUMN total_marks FLOAT DEFAULT 100.0;",
            "ALTER TABLE assessments ADD COLUMN passing_marks FLOAT DEFAULT 60.0;",
            "ALTER TABLE assessments ADD COLUMN max_attempts INTEGER DEFAULT 1;",
            "ALTER TABLE assessments ADD COLUMN status VARCHAR(50) DEFAULT 'ACTIVE';",
            "ALTER TABLE questions ADD COLUMN question_code VARCHAR(50);",
            "ALTER TABLE questions ADD COLUMN section VARCHAR(255) DEFAULT 'General';",
            "ALTER TABLE questions ADD COLUMN difficulty VARCHAR(50) DEFAULT 'Medium';",
            "ALTER TABLE questions ADD COLUMN tags VARCHAR(255) DEFAULT '';",
            "ALTER TABLE questions ADD COLUMN status VARCHAR(50) DEFAULT 'ACTIVE';",
        ]
        for stmt in sqlite_migration_statements:
            try:
                async with engine.begin() as conn:
                    await conn.execute(text(stmt))
            except Exception:
                pass  # Column already exists in SQLite

    # Seed default admin user if none exists in production DB
    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.role == UserRole.ADMIN)
        res = await session.execute(stmt)
        admin = res.scalar_one_or_none()

        if not admin:
            logger.info("Seeding default administrator account...")
            default_admin = User(
                email="admin@astranex.def",
                password_hash=hash_password("admin123"),
                full_name="System Administrator",
                role=UserRole.ADMIN
            )
            session.add(default_admin)
            await session.commit()
            logger.info("Default admin created: admin@astranex.def / admin123")

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
