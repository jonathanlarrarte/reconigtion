"""
Endpoints principales de la API de reconocimiento facial.

POST /v1/faces/enroll/{external_id}       → Registrar una cara
POST /v1/faces/authenticate/{external_id} → Autenticar una cara
GET  /v1/faces/subjects                   → Listar sujetos del tenant
DELETE /v1/faces/subjects/{external_id}   → Eliminar un sujeto
"""
import uuid
import logging
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Depends, Header, UploadFile, File, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.base import get_db
from app.models.tenant import Tenant
from app.models.face_subject import FaceSubject
from app.models.audit import AuthAttempt, AuditLog
from app.schemas.face import EnrollResponse, AuthResponse, SubjectOut, SubjectStatus
from app.core.config import settings
from app.core.security import get_current_tenant
from app.services.billing import billing_service
from app.services.face_engine import face_engine
from app.services.liveness import consume_challenge
from app.services.webhook import send_fraud_webhook

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/faces", tags=["Face Recognition"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE_MB = 5


async def _validate_image(file: UploadFile) -> bytes:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Formato de imagen no válido. Se aceptan JPEG, PNG y WebP. Tipo recibido: {file.content_type}",
        )
    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"La imagen supera el tamaño máximo permitido de {MAX_IMAGE_SIZE_MB}MB.",
        )
    return image_bytes


@router.post("/enroll/{external_id}", response_model=EnrollResponse)
async def enroll_face(
    external_id: str,
    request: Request,
    image: UploadFile = File(..., description="Face image (JPEG/PNG/WebP, max 5MB)"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    """
    Registra la cara de un usuario en el sistema.

    - `external_id`: ID del usuario en el sistema del cliente (ej: "user_123")
    - `image`: foto del rostro (recomendado: fondo neutro, buena iluminación)

    Cobra $0.10 por enrolamiento exitoso.
    Si el usuario ya tiene una cara registrada, la actualiza.
    """
    allowed, reason = await billing_service.check_limits(tenant, "enrollment")
    if not allowed:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=reason)

    image_bytes = await _validate_image(image)
    request_id = str(uuid.uuid4())

    result = await face_engine.extract_embedding(image_bytes)

    if not result["face_detected"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No se detectó ningún rostro en la imagen. Asegúrate de que el rostro esté centrado, bien iluminado y sin obstrucciones.",
        )

    if not result["is_real_face"]:
        logger.warning(f"Spoofing attempt during enrollment: tenant={tenant.slug} external_id={external_id}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La imagen no parece ser un rostro real. Usa una foto tomada en vivo, no una imagen impresa ni en pantalla.",
        )

    if result["quality_score"] < settings.FACE_QUALITY_MIN:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Calidad de imagen insuficiente (puntaje: {result['quality_score']:.2f}). Usa una foto más nítida con buena iluminación.",
        )

    stmt = select(FaceSubject).where(
        FaceSubject.tenant_id == tenant.id,
        FaceSubject.external_id == external_id,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()

    if existing:
        existing.face_embedding = result["embedding"]
        existing.enrollment_quality_score = result["quality_score"]
        existing.enrollment_images_count += 1
        existing.embedding_detector = settings.DEEPFACE_DETECTOR
        existing.is_enrolled = True
        existing.enrolled_at = datetime.utcnow()
        subject = existing
    else:
        subject = FaceSubject(
            tenant_id=tenant.id,
            external_id=external_id,
            face_embedding=result["embedding"],
            enrollment_quality_score=result["quality_score"],
            enrollment_images_count=1,
            embedding_detector=settings.DEEPFACE_DETECTOR,
            is_enrolled=True,
            enrolled_at=datetime.utcnow(),
        )
        db.add(subject)

    await db.flush()

    amount = await billing_service.record_enrollment(tenant, db)

    db.add(AuditLog(
        tenant_id=tenant.id,
        event_type="subject.enrolled",
        actor_id=external_id,
        actor_type="api",
        payload={"quality_score": result["quality_score"], "request_id": request_id},
        ip_address=request.client.host if request.client else None,
    ))

    logger.info(f"Enrolled: tenant={tenant.slug} external_id={external_id} quality={result['quality_score']:.2f}")

    return EnrollResponse(
        subject_id=subject.id,
        external_id=external_id,
        enrolled=True,
        quality_score=result["quality_score"],
        is_real_face=result["is_real_face"],
        message="Rostro registrado exitosamente.",
        amount_charged=amount,
        request_id=request_id,
    )


@router.post("/authenticate/{external_id}", response_model=AuthResponse)
async def authenticate_face(
    external_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    image: UploadFile = File(..., description="Face image to authenticate"),
    x_challenge_id: str | None = Header(None, alias="X-Challenge-Id"),
    x_active_liveness: str | None = Header(None, alias="X-Active-Liveness"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    """
    Autentica un usuario comparando su foto contra el embedding registrado.

    - Incluye anti-spoofing automático
    - Retorna score de confianza y distancia
    - Registra el intento en el audit log

    Cobra $0.02 por intento. Si se usa liveness (X-Challenge-Id o X-Active-Liveness) cobra $0.01 adicional.
    """
    allowed, reason = await billing_service.check_limits(tenant, "auth")
    if not allowed:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=reason)

    # Determinar si se usó liveness en esta autenticación
    liveness_used = False

    # Liveness obligatorio si: la config global lo exige O el tenant tiene liveness_required=True
    tenant_liveness_required = bool(getattr(tenant, "liveness_required", False))
    require_liveness = settings.LIVENESS_REQUIRED or tenant_liveness_required

    if require_liveness:
        if not x_challenge_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Este tenant requiere liveness. Obtén un challenge con GET /v1/liveness/challenge y envíalo en el header X-Challenge-Id.",
            )
        if not await consume_challenge(x_challenge_id):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Challenge inválido, expirado (30s) o ya utilizado.",
            )
        liveness_used = True
    elif x_challenge_id and await consume_challenge(x_challenge_id):
        liveness_used = True

    # Liveness activo desde el cliente (validado en frontend con movimiento de cabeza)
    if x_active_liveness and x_active_liveness.lower() == "true":
        liveness_used = True

    image_bytes = await _validate_image(image)
    request_id = str(uuid.uuid4())

    stmt = select(FaceSubject).where(
        FaceSubject.tenant_id == tenant.id,
        FaceSubject.external_id == external_id,
        FaceSubject.is_enrolled == True,
        FaceSubject.is_active == True,
    )
    subject = (await db.execute(stmt)).scalar_one_or_none()

    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El usuario '{external_id}' no tiene un rostro registrado. Debe enrolarse primero.",
        )

    # Advertir si el detector cambió desde el enrolamiento — embeddings incompatibles
    enrolled_detector = getattr(subject, "embedding_detector", None)
    if enrolled_detector and enrolled_detector != settings.DEEPFACE_DETECTOR:
        logger.warning(
            f"Detector mismatch: enrolled with '{enrolled_detector}' "
            f"but current detector is '{settings.DEEPFACE_DETECTOR}' — "
            f"re-enroll '{external_id}' for reliable results"
        )

    result = await face_engine.verify_against_embedding(image_bytes, subject.face_embedding)

    # Anti-spoofing activo si: (1) habilitado globalmente en el servidor Y (2) el tenant lo tiene ON.
    # Permite que un tenant desactive anti-spoof por cuenta propia (ej: reduce latencia y costo).
    tenant_antispoof = bool(getattr(tenant, "anti_spoofing_enabled", True))
    antispoof_active = settings.ANTI_SPOOFING_ENABLED and tenant_antispoof

    # Si liveness ya fue verificado en esta sesión, el challenge prueba presencia real.
    # En ese caso, un anti-spoof negativo es probablemente un falso positivo (cara ladeada
    # durante el movimiento, blur, crop impreciso con detector rápido) — solo se advierte.
    antispoof_failed = antispoof_active and not result["is_real_face"]
    if antispoof_failed and liveness_used:
        logger.info(
            f"Anti-spoof uncertain on liveness-verified auth (tenant={tenant.slug} "
            f"external_id={external_id} score={result['spoofing_score']:.2f}) — allowing"
        )
        antispoof_failed = False

    fraud_detected = antispoof_failed
    # Anti-spoofing failure blocks auth even if embeddings coincidentally match.
    # (A photo of the real person IS the right face — but it's still an attack.)
    effective_verified = result["verified"] and not fraud_detected

    amount = await billing_service.record_auth(
        tenant, db, with_antifraud=tenant.anti_spoofing_enabled
    )

    if liveness_used:
        liveness_ok, _ = await billing_service.check_limits(tenant, "liveness")
        if liveness_ok:
            liveness_amount = await billing_service.record_liveness(tenant, db)
            amount = round(amount + liveness_amount, 4)

    attempt = AuthAttempt(
        tenant_id=tenant.id,
        subject_id=subject.id,
        success=result["verified"],
        confidence_score=result["confidence"],
        distance=result["distance"],
        is_real_face=result["is_real_face"],
        spoofing_score=result["spoofing_score"],
        deepfake_detected=fraud_detected,
        fraud_signals={"model": result["model_used"]} if fraud_detected else None,
        billed=True,
        amount_charged=amount,
        ip_address=request.client.host if request.client else None,
        request_id=request_id,
    )
    db.add(attempt)

    if fraud_detected:
        logger.warning(
            f"Fraud detected: tenant={tenant.slug} external_id={external_id} "
            f"spoofing_score={result['spoofing_score']:.2f}"
        )
        background_tasks.add_task(
            send_fraud_webhook,
            tenant,
            {
                "event": "fraud.detected",
                "tenant_id": str(tenant.id),
                "subject_id": str(subject.id),
                "external_id": external_id,
                "request_id": request_id,
                "spoofing_score": result["spoofing_score"],
                "model_used": result["model_used"],
            },
        )

    return AuthResponse(
        request_id=request_id,
        verified=effective_verified,
        subject_id=subject.id,
        external_id=external_id,
        confidence=result["confidence"],
        distance=result["distance"],
        is_real_face=result["is_real_face"],
        spoofing_score=result["spoofing_score"],
        fraud_detected=fraud_detected,
        amount_charged=amount,
        timestamp=datetime.utcnow(),
    )


@router.get("/subjects", response_model=list[SubjectOut])
async def list_subjects(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    skip: int = 0,
    limit: int = 100,
):
    """Lista todos los sujetos enrolados del tenant."""
    stmt = (
        select(FaceSubject)
        .where(FaceSubject.tenant_id == tenant.id, FaceSubject.is_active == True)
        .offset(skip)
        .limit(limit)
        .order_by(FaceSubject.created_at.desc())
    )
    subjects = (await db.execute(stmt)).scalars().all()
    return subjects


@router.get("/subjects/{external_id}", response_model=SubjectStatus)
async def get_subject_status(
    external_id: str,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    """Consulta si un usuario tiene rostro registrado. Nunca lanza 404 — siempre retorna enrolled: bool."""
    stmt = select(FaceSubject).where(
        FaceSubject.tenant_id == tenant.id,
        FaceSubject.external_id == external_id,
        FaceSubject.is_active == True,
    )
    subject = (await db.execute(stmt)).scalar_one_or_none()
    enrolled = subject is not None and bool(subject.is_enrolled)
    return SubjectStatus(
        external_id=external_id,
        enrolled=enrolled,
        subject_id=subject.id if subject else None,
    )


@router.delete("/subjects/{external_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject(
    external_id: str,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    """Elimina (desactiva) un sujeto y borra su embedding por privacidad."""
    stmt = select(FaceSubject).where(
        FaceSubject.tenant_id == tenant.id,
        FaceSubject.external_id == external_id,
    )
    subject = (await db.execute(stmt)).scalar_one_or_none()

    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")

    subject.is_active = False
    subject.face_embedding = None
