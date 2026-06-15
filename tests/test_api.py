"""
Tests de integración para los endpoints de la API.
Usa la app FastAPI directamente (sin HTTP real) con BD y face_engine mockeados.
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
import io
from PIL import Image


def _make_jpeg_bytes() -> bytes:
    """Imagen mínima válida para pasar la validación de content_type."""
    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color=(128, 128, 128)).save(buf, format="JPEG")
    return buf.getvalue()


# ── /health ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_check(api_client):
    resp = await api_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data


# ── POST /v1/faces/enroll/{id} ────────────────────────────────────────────────

MOCK_EMBEDDING_RESULT = {
    "embedding": [0.1] * 512,
    "quality_score": 0.85,
    "is_real_face": True,
    "spoofing_score": 0.95,
    "face_detected": True,
}


@pytest.mark.asyncio
async def test_enroll_success(api_client, mock_db):
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=lambda: None))

    with patch(
        "app.api.v1.endpoints.faces.face_engine.extract_embedding",
        new=AsyncMock(return_value=MOCK_EMBEDDING_RESULT),
    ), patch(
        "app.api.v1.endpoints.faces.billing_service.record_enrollment",
        new=AsyncMock(return_value=0.10),
    ):
        resp = await api_client.post(
            "/v1/faces/enroll/user_test",
            files={"image": ("face.jpg", _make_jpeg_bytes(), "image/jpeg")},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["enrolled"] is True
    assert data["external_id"] == "user_test"
    assert data["quality_score"] == 0.85
    assert data["amount_charged"] == 0.10


@pytest.mark.asyncio
async def test_enroll_no_face_detected(api_client):
    no_face = {**MOCK_EMBEDDING_RESULT, "face_detected": False, "embedding": []}
    with patch(
        "app.api.v1.endpoints.faces.face_engine.extract_embedding",
        new=AsyncMock(return_value=no_face),
    ):
        resp = await api_client.post(
            "/v1/faces/enroll/user_test",
            files={"image": ("face.jpg", _make_jpeg_bytes(), "image/jpeg")},
        )
    assert resp.status_code == 422
    assert "No face detected" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_enroll_spoofing_detected(api_client):
    spoof = {**MOCK_EMBEDDING_RESULT, "is_real_face": False, "spoofing_score": 0.02}
    with patch(
        "app.api.v1.endpoints.faces.face_engine.extract_embedding",
        new=AsyncMock(return_value=spoof),
    ):
        resp = await api_client.post(
            "/v1/faces/enroll/user_test",
            files={"image": ("face.jpg", _make_jpeg_bytes(), "image/jpeg")},
        )
    assert resp.status_code == 422
    assert "Liveness check failed" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_enroll_rejects_wrong_content_type(api_client):
    resp = await api_client.post(
        "/v1/faces/enroll/user_test",
        files={"image": ("doc.pdf", b"fakepdf", "application/pdf")},
    )
    assert resp.status_code == 422
    assert "JPEG, PNG or WebP" in resp.json()["detail"]


# ── POST /v1/faces/authenticate/{id} ─────────────────────────────────────────

MOCK_VERIFY_RESULT = {
    "verified": True,
    "distance": 0.22,
    "confidence": 0.68,
    "threshold": 0.68,
    "is_real_face": True,
    "spoofing_score": 0.97,
    "model_used": "ArcFace",
}


@pytest.mark.asyncio
async def test_authenticate_subject_not_found(api_client, mock_db):
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=lambda: None))

    resp = await api_client.post(
        "/v1/faces/authenticate/unknown_user",
        files={"image": ("face.jpg", _make_jpeg_bytes(), "image/jpeg")},
    )
    assert resp.status_code == 404
    assert "No enrolled face" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_authenticate_enrollment_limit_exceeded(api_client, mock_tenant):
    mock_tenant.current_month_auths = mock_tenant.monthly_auth_limit  # límite alcanzado

    resp = await api_client.post(
        "/v1/faces/authenticate/user_test",
        files={"image": ("face.jpg", _make_jpeg_bytes(), "image/jpeg")},
    )
    assert resp.status_code == 429
