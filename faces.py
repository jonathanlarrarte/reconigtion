"""
Endpoints principales de la API de reconocimiento facial.

POST /v1/faces/enroll/{external_id}   → Registrar una cara
POST /v1/faces/authenticate/{external_id} → Autenticar una cara
GET  /v1/faces/subjects               → Listar sujetos del tenant
DELETE /v1/faces/subjects/{external_id} → Eliminar un sujeto
"""
import uuid
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.db.base import get_db
from app.models.tenant import Tenant
from app.models.face_subject import FaceSubject
from app.models.audit import AuthAttempt, AuditLog
from app.schemas.face import EnrollResponse, AuthResponse, SubjectOut
from app.services.face_engine import face_engine
from app.services.billing import billing_service
from app.core.security import get_current_tenant

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/faces", tags=["Face Recognition"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE_MB = 5


async def _validate_image(file: UploadFile) -> bytes:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Image must be JPEG, PNG or WebP. Got: {file.content_type}",
        )
    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image must be smaller than {MAX_IMAGE_SIZE_MB}MB",
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
    
    **Cobra:** ${price_enrollment} por enrolamiento exitoso.
    Si el usuario ya tiene una cara registrada, la actualiza.
    """
    # Verificar límites del plan
    allowed, reason = await billing_service.check_limits(tenant, "enrollment")
    if not allowed:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=reason)

    image_bytes = await _validate_image(image)
    request_id = str(uuid.uuid4())

    # Extraer embedding
    result = await face_engine.extract_embedding(image_bytes)

    if not result["face_detected"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No face detected in the image. Ensure the face is clearly visible and well-lit.",
        )

    if not result["is_real_face"]:
        logger.warning(f"Spoofing attempt during enrollment: tenant={tenant.slug} external_id={external_id}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Liveness check failed. The image does not appear to be a real face.",
        )

    if result["quality_score"] < 0.2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Image quality too low (score: {result['quality_score']:.2f}). Use a clearer photo.",
        )

    # Buscar o crear el sujeto
    stmt = select(FaceSubject).where(
        FaceSubject.tenant_id == tenant.id,
        FaceSubject.external_id == external_id,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()

    if existing:
        existing.face_embedding = result["embedding"]
        existing.enrollment_quality_score = result["quality_score"]
        existing.enrollment_images_count += 1
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
            is_enrolled=True,
            enrolled_at=datetime.utcnow(),
        )
        db.add(subject)

    await db.flush()

    # Billing
    amount = await billing_service.record_enrollment(tenant, db)

    # Audit log
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
        message="Face enrolled successfully",
        amount_charged=amount,
        request_id=request_id,
    )


@router.post("/authenticate/{external_id}", response_model=AuthResponse)
async def authenticate_face(
    external_id: str,
    request: Request,
    image: UploadFile = File(..., description="Face image to authenticate"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    """
    Autentica un usuario comparando su foto contra el embedding registrado.
    
    - Incluye anti-spoofing automático
    - Retorna score de confianza y distancia
    - Registra el intento en el audit log
    
    **Cobra:** ${price_auth} por intento (exitoso o fallido).
    """
    allowed, reason = await billing_service.check_limits(tenant, "auth")
    if not allowed:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=reason)

    image_bytes = await _validate_image(image)
    request_id = str(uuid.uuid4())

    # Obtener el sujeto
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
            detail=f"No enrolled face found for external_id='{external_id}'",
        )

    # Verificar cara contra embedding almacenado
    result = await face_engine.verify_against_embedding(image_bytes, subject.face_embedding)

    fraud_detected = not result["is_real_face"]

    # Billing
    amount = await billing_service.record_auth(
        tenant, db, with_antifraud=tenant.anti_spoofing_enabled
    )

    # Registrar intento
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

    return AuthResponse(
        request_id=request_id,
        verified=result["verified"],
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


@router.delete("/subjects/{external_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject(
    external_id: str,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    """Elimina (desactiva) un sujeto y su embedding facial."""
    stmt = select(FaceSubject).where(
        FaceSubject.tenant_id == tenant.id,
        FaceSubject.external_id == external_id,
    )
    subject = (await db.execute(stmt)).scalar_one_or_none()

    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # Soft delete + borrar el embedding por privacidad
    subject.is_active = False
    subject.face_embedding = None
