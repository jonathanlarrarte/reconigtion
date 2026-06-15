import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.core.config import settings
from app.api.v1.router import api_router
from app.api.v1.endpoints import widget as widget_module
from app.db.base import engine, Base
from app.services.scheduler import start_scheduler, scheduler
from app.services.redis_client import close_redis
from app.services.face_engine import face_engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting FaceID SaaS v{settings.APP_VERSION} [{settings.APP_ENV}]")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    start_scheduler()
    # Pre-carga ArcFace en memoria para que la primera autenticación no tenga overhead
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, face_engine._warmup)
    yield
    scheduler.shutdown(wait=False)
    await close_redis()
    logger.info("Shutting down...")
    await engine.dispose()


_servers = [{"url": settings.PUBLIC_URL, "description": "Production"}] if settings.PUBLIC_URL else None

app = FastAPI(
    title="FaceID SaaS API",
    docs_url="/api-docs",
    redoc_url="/api-redoc",
    servers=_servers,
    description="""
## Reconocimiento Facial como Servicio

API para integrar autenticación facial en cualquier aplicación.

### Flujo básico
1. **Obtén tu API Key** desde el panel de administración
2. **Enrola** a tus usuarios con `POST /v1/faces/enroll/{external_id}`
3. **Autentica** con `POST /v1/faces/authenticate/{external_id}`

### Seguridad
- Anti-spoofing integrado (detecta fotos de fotos y pantallas)
- Detección de deepfakes
- Todos los intentos quedan registrados en el audit log

### Autenticación
Incluye tu API Key en el header: `X-API-Key: fid_...`
    """,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(widget_module.router)  # /widget — served without /v1 prefix


@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "ok", "version": settings.APP_VERSION, "env": settings.APP_ENV}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request.headers.get("X-Request-ID")},
    )
