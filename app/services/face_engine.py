"""
FaceEngine: wrapper sobre DeepFace para producción.

Optimizaciones vs versión original:
- Una sola detección por imagen (extract_faces → represent con detector="skip")
- Toda la inferencia corre en ThreadPoolExecutor (no bloquea el event loop)
- Warmup al arrancar para que la primera petición sea rápida
"""
import asyncio
import io
import logging
import numpy as np
from PIL import Image
from typing import TypedDict
from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingResult(TypedDict):
    embedding: list[float]
    quality_score: float
    is_real_face: bool
    spoofing_score: float
    face_detected: bool


class VerificationResult(TypedDict):
    verified: bool
    distance: float
    confidence: float
    threshold: float
    is_real_face: bool
    spoofing_score: float
    model_used: str


class FaceEngine:
    """
    Singleton. Mantiene modelos en memoria y corre inferencia en un thread pool
    para no bloquear el event loop de FastAPI.
    """

    _instance: "FaceEngine | None" = None
    _models_loaded: bool = False

    def __new__(cls) -> "FaceEngine":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _lazy_import(self):
        if not self._models_loaded:
            global DeepFace
            from deepface import DeepFace as _DeepFace
            DeepFace = _DeepFace
            self._models_loaded = True
            logger.info(
                f"DeepFace loaded — model={settings.DEEPFACE_MODEL}, "
                f"detector={settings.DEEPFACE_DETECTOR}"
            )

    def _image_from_bytes(self, image_bytes: bytes) -> np.ndarray:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        # Cap resolution to 640x640 — DeepFace no necesita más para embeddings
        image.thumbnail((640, 640), Image.LANCZOS)
        return np.array(image)

    # ── Core sync pipeline (corre en ThreadPoolExecutor) ────────────────────────

    def _process_image_sync(self, img_array: np.ndarray) -> dict:
        """
        Una sola pasada de detección:
          1. extract_faces  → face crop alineado + anti-spoof (si está activo)
          2. represent(detector="skip") → embedding sobre el crop ya detectado

        Evita la segunda detección completa que tenía la versión anterior.
        """
        # Paso 1: detectar cara + anti-spoof en una sola llamada.
        # Si anti-spoof falla (ej. PyTorch no instalado), reintentar sin él (fail open).
        try:
            faces = DeepFace.extract_faces(
                img_path=img_array,
                detector_backend=settings.DEEPFACE_DETECTOR,
                anti_spoofing=settings.ANTI_SPOOFING_ENABLED,
                enforce_detection=False,
                align=True,
            )
        except Exception as e:
            if settings.ANTI_SPOOFING_ENABLED and "torch" in str(e).lower():
                logger.warning("Anti-spoofing requires torch (not installed) — running without")
                try:
                    faces = DeepFace.extract_faces(
                        img_path=img_array,
                        detector_backend=settings.DEEPFACE_DETECTOR,
                        anti_spoofing=False,
                        enforce_detection=False,
                        align=True,
                    )
                except Exception as e2:
                    logger.warning(f"extract_faces error: {e2}")
                    return {"face_detected": False}
            else:
                logger.warning(f"extract_faces error: {e}")
                return {"face_detected": False}

        if not faces:
            return {"face_detected": False}

        face_data = faces[0]

        is_real = True
        antispoof_score = 1.0
        if settings.ANTI_SPOOFING_ENABLED:
            is_real = bool(face_data.get("is_real", True))
            antispoof_score = float(face_data.get("antispoof_score", 1.0))
            if not is_real:
                logger.warning(
                    f"PAD (presentation attack) detected — "
                    f"antispoof_score={antispoof_score:.3f} "
                    f"(screen/print/mask attack probable)"
                )

        fa = face_data.get("facial_area", {})
        fw = fa.get("w", img_array.shape[1])
        fh = fa.get("h", img_array.shape[0])
        ih, iw = img_array.shape[:2]
        quality = min(1.0, (fw * fh) / max(iw * ih, 1) * 4)

        # Paso 2: embedding sobre el crop ya alineado — sin re-detectar
        face_img = face_data.get("face")
        if face_img is None:
            return {"face_detected": False}

        if face_img.dtype != np.uint8:
            face_img = (face_img * 255).clip(0, 255).astype(np.uint8)

        try:
            representations = DeepFace.represent(
                img_path=face_img,
                model_name=settings.DEEPFACE_MODEL,
                detector_backend="skip",  # ya detectado y alineado arriba
                enforce_detection=False,
                align=False,
            )
        except Exception as e:
            logger.warning(f"represent error: {e}")
            return {"face_detected": False}

        if not representations:
            return {"face_detected": False}

        return {
            "face_detected": True,
            "embedding": representations[0]["embedding"],
            "quality_score": round(quality, 4),
            "is_real_face": is_real,
            "spoofing_score": round(antispoof_score, 4),
        }

    def _warmup(self):
        """Pre-carga ArcFace y MiniFASNet en memoria. Llamar una vez al arrancar."""
        self._lazy_import()
        dummy = np.zeros((112, 112, 3), dtype=np.uint8)
        try:
            DeepFace.represent(
                img_path=dummy,
                model_name=settings.DEEPFACE_MODEL,
                detector_backend="skip",
                enforce_detection=False,
            )
            logger.info("FaceEngine warmup OK — ArcFace listo en memoria")
        except Exception as e:
            logger.warning(f"FaceEngine warmup (ArcFace) non-fatal: {e}")

        if settings.ANTI_SPOOFING_ENABLED:
            try:
                # Usar una imagen con variación para que el detector encuentre algo
                rng_img = np.random.randint(80, 180, (480, 640, 3), dtype=np.uint8)
                DeepFace.extract_faces(
                    img_path=rng_img,
                    detector_backend=settings.DEEPFACE_DETECTOR,
                    anti_spoofing=True,
                    enforce_detection=False,
                    align=True,
                )
                logger.info("FaceEngine warmup OK — MiniFASNet anti-spoofing listo en memoria")
            except Exception as e:
                logger.warning(f"FaceEngine warmup (MiniFASNet) non-fatal: {e}")

    # ── API pública async ────────────────────────────────────────────────────────

    async def extract_embedding(self, image_bytes: bytes) -> EmbeddingResult:
        self._lazy_import()
        img_array = self._image_from_bytes(image_bytes)
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, self._process_image_sync, img_array)
        if not result.get("face_detected"):
            return EmbeddingResult(
                embedding=[], quality_score=0.0,
                is_real_face=False, spoofing_score=0.0, face_detected=False,
            )
        return EmbeddingResult(**result)

    def compare_embeddings(
        self,
        embedding1: list[float],
        embedding2: list[float],
    ) -> tuple[bool, float, float]:
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)
        cos_sim = np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2) + 1e-10)
        distance = float(1.0 - cos_sim)
        threshold = settings.DEEPFACE_THRESHOLD
        verified = distance < threshold
        confidence = float(max(0.0, 1.0 - (distance / threshold)))
        return verified, round(distance, 6), round(confidence, 4)

    async def verify_against_embedding(
        self,
        image_bytes: bytes,
        stored_embedding: list[float],
    ) -> VerificationResult:
        """
        Extrae embedding y compara — sin bloquear por anti-spoof aquí.
        El caller (faces.py) decide si bloquear según el contexto (liveness, etc.).
        """
        result = await self.extract_embedding(image_bytes)

        if not result["face_detected"]:
            return VerificationResult(
                verified=False, distance=1.0, confidence=0.0, threshold=settings.DEEPFACE_THRESHOLD,
                is_real_face=False, spoofing_score=0.0, model_used=settings.DEEPFACE_MODEL,
            )

        verified, distance, confidence = self.compare_embeddings(
            result["embedding"], stored_embedding
        )
        return VerificationResult(
            verified=verified, distance=distance, confidence=confidence, threshold=settings.DEEPFACE_THRESHOLD,
            is_real_face=result["is_real_face"], spoofing_score=result["spoofing_score"],
            model_used=settings.DEEPFACE_MODEL,
        )


face_engine = FaceEngine()
