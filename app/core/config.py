from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_ENV: str = "development"
    APP_VERSION: str = "0.1.0"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/faceid_saas"
    DATABASE_SYNC_URL: str = "postgresql://postgres:password@localhost:5432/faceid_saas"

    SECRET_KEY: str = "change-me-in-production-min-32-chars-long-xxx"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    REDIS_URL: str = "redis://localhost:6379/0"

    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    DEEPFACE_MODEL: str = "ArcFace"
    DEEPFACE_DETECTOR: str = "opencv"      # opciones: opencv (rápido), yunet, mtcnn, retinaface (lento/preciso)
    DEEPFACE_DISTANCE_METRIC: str = "cosine"
    DEEPFACE_THRESHOLD: float = 0.55       # distancia coseno: <0.4 estricto, 0.55 balanceado, 0.68 permisivo
    FACE_QUALITY_MIN: float = 0.35         # ratio mínimo cara/imagen (0.35 ≈ cara cubre 9% del frame)
    ANTI_SPOOFING_ENABLED: bool = True

    PRICE_ENROLLMENT: float = 0.10
    PRICE_AUTH: float = 0.02
    PRICE_ANTIFAUD_ADDON: float = 0.03
    PRICE_LIVENESS_CHECK: float = 0.01

    PORTAL_TOKEN_EXPIRE_HOURS: int = 8

    # Liveness — si True, authenticate exige X-Liveness-Token
    LIVENESS_REQUIRED: bool = False

    # CORS — en producción pon el dominio exacto: "https://tudominio.com"
    # Para APIs públicas (tenants integran desde cualquier origen) usa "*"
    CORS_ORIGINS: str = "*"

    # URL pública del servidor — usada en Swagger UI para "Try it out"
    # Ej: https://13.140.187.184  o  https://api.tudominio.com
    PUBLIC_URL: str = ""

    # Credenciales del panel admin (validadas en Next.js API route)
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "faceid2024"
    ADMIN_SECRET:   str = ""  # Si vacío, usa SECRET_KEY

    # Uvicorn workers — 1 en dev, 2-4 en producción (cada worker carga ArcFace en RAM)
    API_WORKERS: int = 1

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
