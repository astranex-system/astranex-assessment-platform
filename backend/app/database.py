import os
from typing import AsyncGenerator
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.models import Base

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
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
