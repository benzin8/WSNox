"""Send web-push notifications to all subscriptions of a given user."""

import json
import logging

from pywebpush import WebPushException, webpush

from messenger.backend.app.crud.push_subscription import (
    PushSubscriptionCRUD,
    cached_push_subs,
)
from messenger.backend.core.config import settings
from messenger.backend.core.redis import get_redis
from messenger.backend.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


async def send_push_to_user(user_id: int, payload: dict) -> None:
    """Fire-and-forget push to every subscription of *user_id*.

    Подписки читаются через read-through кэш (пустой список кэшируется).
    Stale subscriptions (410 Gone) are automatically removed and the cache busted.
    """
    if not settings.vapid_private_key or not settings.vapid_public_key:
        return

    redis = get_redis()
    async with AsyncSessionLocal() as db:
        subs = await cached_push_subs(redis, db, user_id)
        if not subs:
            return

        data = json.dumps(payload, ensure_ascii=False)
        stale_ids: list[int] = []

        for sub in subs:
            subscription_info = {
                "endpoint": sub["endpoint"],
                "keys": {
                    "p256dh": sub["p256dh"],
                    "auth": sub["auth"],
                },
            }
            try:
                webpush(
                    subscription_info=subscription_info,
                    data=data,
                    vapid_private_key=settings.vapid_private_key,
                    vapid_claims={"sub": settings.vapid_mailto},
                )
            except WebPushException as e:
                if e.response and e.response.status_code == 410:
                    stale_ids.append(sub["id"])
                    logger.info("Removing stale push subscription %s", sub["endpoint"])
                else:
                    logger.warning("WebPush failed for %s: %s", sub["endpoint"], e)
            except Exception:
                logger.exception("Unexpected error sending push to %s", sub["endpoint"])

        for sub_id in stale_ids:
            await PushSubscriptionCRUD.delete_by_id(
                db, sub_id, user_id=user_id, redis=redis
            )
