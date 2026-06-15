"""
Endpoint de estado del sistema — devuelve la configuración activa en memoria.
Solo lectura: los cambios requieren editar .env y reiniciar el contenedor.
"""
from fastapi import APIRouter
from app.core.config import settings

router = APIRouter(prefix="/admin/system", tags=["Admin"])


@router.get("/status")
async def get_system_status():
    """Devuelve la configuración real que está corriendo en este momento."""
    return {
        # Seguridad
        "anti_spoofing_enabled": settings.ANTI_SPOOFING_ENABLED,
        "liveness_required": settings.LIVENESS_REQUIRED,
        # Motor facial
        "deepface_model": settings.DEEPFACE_MODEL,
        "deepface_detector": settings.DEEPFACE_DETECTOR,
        "deepface_threshold": settings.DEEPFACE_THRESHOLD,
        "face_quality_min": settings.FACE_QUALITY_MIN,
        # Precios
        "price_enrollment": settings.PRICE_ENROLLMENT,
        "price_auth": settings.PRICE_AUTH,
        "price_antifaud_addon": settings.PRICE_ANTIFAUD_ADDON,
        "price_liveness_check": settings.PRICE_LIVENESS_CHECK,
        # Meta
        "app_env": settings.APP_ENV,
        "app_version": settings.APP_VERSION,
    }
