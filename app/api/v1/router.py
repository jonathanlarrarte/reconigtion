from fastapi import APIRouter

from app.api.v1.endpoints import faces, tenants, stats, liveness, portal, system

api_router = APIRouter(prefix="/v1")
api_router.include_router(faces.router)
api_router.include_router(tenants.router)
api_router.include_router(stats.router)
api_router.include_router(liveness.router)
api_router.include_router(portal.router)
api_router.include_router(system.router)
