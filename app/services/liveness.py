"""
Liveness con challenge nonce de corta vida.

Flujo para el cliente:
  1. GET  /v1/liveness/challenge  → {challenge_id, expires_in: 30}
  2. POST /v1/faces/authenticate  + header X-Challenge-Id: {challenge_id}

El challenge expira en 30 segundos y es de un solo uso.
Combinado con el anti-spoofing de DeepFace, bloquea:
  - Ataques de replay (captura y reenvío de requests)
  - Ataques con foto impresa / pantalla (anti-spoofing)
"""
import logging
import uuid

from app.services.redis_client import get_redis

logger = logging.getLogger(__name__)

CHALLENGE_TTL = 30   # segundos — el usuario debe autenticar dentro de este tiempo


async def create_challenge() -> dict:
    challenge_id = str(uuid.uuid4())
    r = await get_redis()
    # Almacena el challenge; se borra solo al consumirse o al expirar
    await r.setex(f"liveness:challenge:{challenge_id}", CHALLENGE_TTL, "1")
    logger.debug(f"Challenge created: {challenge_id}")
    return {
        "challenge_id": challenge_id,
        "expires_in": CHALLENGE_TTL,
    }


async def consume_challenge(challenge_id: str) -> bool:
    """
    Valida y elimina el challenge atómicamente (one-time use).
    Retorna False si no existe o ya fue usado.
    """
    r = await get_redis()
    # GETDEL: obtiene y borra en una sola operación — previene race conditions
    result = await r.getdel(f"liveness:challenge:{challenge_id}")
    if result is None:
        logger.warning(f"Challenge invalid or expired: {challenge_id}")
        return False
    return True
