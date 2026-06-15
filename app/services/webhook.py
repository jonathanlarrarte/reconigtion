import hashlib
import hmac
import json
import logging
import httpx
from datetime import datetime, timezone

from app.models.tenant import Tenant

logger = logging.getLogger(__name__)


def _sign_payload(payload: dict, secret: str) -> str:
    """HMAC-SHA256 sobre el JSON del payload — el receptor puede verificar autenticidad."""
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def send_fraud_webhook(tenant: Tenant, payload: dict) -> None:
    """
    Entrega un evento de fraude al webhook configurado por el tenant.
    Se llama como BackgroundTask — el cliente ya recibió la respuesta HTTP.
    """
    if not tenant.webhook_url:
        return

    payload["timestamp"] = datetime.now(timezone.utc).isoformat()
    signature = _sign_payload(payload, tenant.api_key)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                tenant.webhook_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-FaceID-Event": payload.get("event", "fraud.detected"),
                    "X-FaceID-Signature": signature,
                },
            )
            if resp.status_code >= 400:
                logger.warning(
                    f"Webhook returned {resp.status_code} for tenant={tenant.slug} url={tenant.webhook_url}"
                )
    except Exception as e:
        logger.warning(f"Webhook delivery failed for tenant={tenant.slug}: {e}")
