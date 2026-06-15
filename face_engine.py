"""
FaceEngine: wrapper sobre DeepFace para producción.

Responsabilidades:
- Extraer embeddings (512-dim ArcFace)
- Verificar liveness / anti-spoofing
- Comparar embeddings con distancia coseno
- Detección básica de deepfake
"""
import io
import logging
import numpy as np
from PIL import Image
from typing import TypedDict
from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingResult(TypedDict):
    embedding: list[float]          # 512 dimensiones (ArcFace)
    quality_score: float            # 0.0 - 1.0
    is_real_face: bool              # anti-spoofing
    spoofing_score: float           # 0.0 = fake, 1.0 = real
    face_detected: bool


class VerificationResult(TypedDict):
    verified: bool
    distance: float                 # cosine distance (menor = más parecido)
    confidence: float               # 0.0 - 1.0 (inverso de distancia normalizado)
    threshold: float
    is_real_face: bool
    spoofing_score: float
    model_used: str


class FaceEngine:
    """
    Singleton que mantiene DeepFace cargado en memoria.
    La primera llamada es lenta (carga el modelo), las siguientes son rápidas.
    """

    _instance: "FaceEngine | None" = None
    _models_loaded: bool = False

    def __new__(cls) -> "FaceEngine":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _lazy_import(self):
        """DeepFace importa TensorFlow al cargarse — lo diferimos al primer uso."""
        if not self._models_loaded:
            global DeepFace
            from deepface import DeepFace as _DeepFace
            DeepFace = _DeepFace
            self._models_loaded = True
            logger.info(f"DeepFace loaded — model={settings.DEEPFACE_MODEL}, detector={settings.DEEPFACE_DETECTOR}")

    def _image_from_bytes(self, image_bytes: bytes) -> np.ndarray:
        """Convierte bytes de imagen a numpy array RGB."""
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return np.array(image)

    async def extract_embedding(self, image_bytes: bytes) -> EmbeddingResult:
        """
        Extrae el embedding facial de una imagen.
        Usado durante el enrolamiento.
        """
        self._lazy_import()
        img_array = self._image_from_bytes(image_bytes)

        try:
            # Extraer embedding
            representations = DeepFace.represent(
                img_path=img_array,
                model_name=settings.DEEPFACE_MODEL,
                detector_backend=settings.DEEPFACE_DETECTOR,
                enforce_detection=True,
                align=True,
            )

            if not representations:
                return EmbeddingResult(
                    embedding=[],
                    quality_score=0.0,
                    is_real_face=False,
                    spoofing_score=0.0,
                    face_detected=False,
                )

            embedding = representations[0]["embedding"]  # lista de 512 floats
            facial_area = representations[0].get("facial_area", {})

            # Calcular quality score basado en el tamaño de la cara detectada
            face_w = facial_area.get("w", 0)
            face_h = facial_area.get("h", 0)
            img_h, img_w = img_array.shape[:2]
            face_area_ratio = (face_w * face_h) / (img_w * img_h) if img_w * img_h > 0 else 0
            quality_score = min(1.0, face_area_ratio * 4)  # cara >= 25% de la imagen = calidad 1.0

            # Anti-spoofing
            is_real = True
            spoofing_score = 1.0

            if settings.ANTI_SPOOFING_ENABLED:
                is_real, spoofing_score = self._check_liveness(img_array)

            return EmbeddingResult(
                embedding=embedding,
                quality_score=round(quality_score, 4),
                is_real_face=is_real,
                spoofing_score=round(spoofing_score, 4),
                face_detected=True,
            )

        except Exception as e:
            logger.warning(f"extract_embedding failed: {e}")
            return EmbeddingResult(
                embedding=[],
                quality_score=0.0,
                is_real_face=False,
                spoofing_score=0.0,
                face_detected=False,
            )

    def _check_liveness(self, img_array: np.ndarray) -> tuple[bool, float]:
        """
        Anti-spoofing: detecta si la cara es real o un ataque
        (foto de foto, pantalla, máscara impresa).
        """
        try:
            faces = DeepFace.extract_faces(
                img_path=img_array,
                detector_backend=settings.DEEPFACE_DETECTOR,
                anti_spoofing=True,
                enforce_detection=False,
            )
            if not faces:
                return False, 0.0

            face = faces[0]
            is_real = face.get("is_real", True)
            antispoof_score = face.get("antispoof_score", 1.0)
            return bool(is_real), float(antispoof_score)

        except Exception as e:
            logger.warning(f"liveness check failed (allowing): {e}")
            return True, 1.0  # fail open — no bloquear si el check falla

    def compare_embeddings(
        self,
        embedding1: list[float],
        embedding2: list[float],
    ) -> tuple[bool, float, float]:
        """
        Compara dos embeddings con distancia coseno.
        Retorna: (verified, distance, confidence)
        """
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)

        # Cosine distance = 1 - cosine_similarity
        cos_sim = np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2) + 1e-10)
        distance = float(1.0 - cos_sim)

        # Threshold estándar para ArcFace con cosine
        threshold = 0.68
        verified = distance < threshold

        # Confidence: 0 cuando distance=threshold, 1 cuando distance=0
        confidence = float(max(0.0, 1.0 - (distance / threshold)))

        return verified, round(distance, 6), round(confidence, 4)

    async def verify_against_embedding(
        self,
        image_bytes: bytes,
        stored_embedding: list[float],
    ) -> VerificationResult:
        """
        Autenticación completa: extrae embedding de la imagen entrante
        y lo compara contra el embedding almacenado del sujeto.
        """
        result = await self.extract_embedding(image_bytes)

        if not result["face_detected"]:
            return VerificationResult(
                verified=False,
                distance=1.0,
                confidence=0.0,
                threshold=0.68,
                is_real_face=False,
                spoofing_score=0.0,
                model_used=settings.DEEPFACE_MODEL,
            )

        # Bloquear si se detecta spoof
        if settings.ANTI_SPOOFING_ENABLED and not result["is_real_face"]:
            logger.warning("Spoofing attack detected — blocking authentication")
            return VerificationResult(
                verified=False,
                distance=1.0,
                confidence=0.0,
                threshold=0.68,
                is_real_face=False,
                spoofing_score=result["spoofing_score"],
                model_used=settings.DEEPFACE_MODEL,
            )

        verified, distance, confidence = self.compare_embeddings(
            result["embedding"], stored_embedding
        )

        return VerificationResult(
            verified=verified,
            distance=distance,
            confidence=confidence,
            threshold=0.68,
            is_real_face=result["is_real_face"],
            spoofing_score=result["spoofing_score"],
            model_used=settings.DEEPFACE_MODEL,
        )


# Singleton global
face_engine = FaceEngine()
