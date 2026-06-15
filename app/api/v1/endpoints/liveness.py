"""
GET /v1/liveness/challenge  →  genera un challenge nonce de 30 segundos
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import get_current_tenant
from app.models.tenant import Tenant
from app.services.liveness import create_challenge

router = APIRouter(prefix="/liveness", tags=["Liveness"])


class ChallengeOut(BaseModel):
    challenge_id: str
    expires_in: int
    hint: str = "Usa este challenge_id en el header X-Challenge-Id al autenticar. Expira en 30 segundos."


@router.get("/challenge", response_model=ChallengeOut)
async def get_challenge(tenant: Tenant = Depends(get_current_tenant)):
    """
    Genera un challenge de un solo uso válido por 30 segundos.

    **Flujo de autenticación con liveness:**
    1. Llama este endpoint para obtener `challenge_id`
    2. Captura la foto del usuario
    3. Llama `POST /v1/faces/authenticate/{id}` con el header `X-Challenge-Id: {challenge_id}`

    El challenge bloquea ataques de replay — cada autenticación necesita un challenge fresco.
    """
    data = await create_challenge()
    return ChallengeOut(**data)
