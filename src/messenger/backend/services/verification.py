import secrets

import aiosmtplib
from email.message import EmailMessage
from fastapi import HTTPException

from messenger.backend.core.config import settings
from messenger.backend.core.redis import get_redis


async def send_verification_code(email: str) -> None:
    redis = get_redis()
    existing_code = await redis.get(f"verification:{email}")
    if existing_code:
        code = existing_code
    else:
        code = str(secrets.randbelow(900000) + 100000)
        await redis.setex(f"verification:{email}", 300, code)

    msg = EmailMessage()
    msg["From"] = settings.smtp_user
    msg["To"] = email
    msg["Subject"] = "Код подтверждения WSNox"
    msg.set_content(
        f"Ваш код подтверждения: {code}\n\nКод действителен 5 минут."
    )

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            use_tls=True,
        )
    except Exception:
        raise HTTPException(status_code=503, detail="Failed to send verification email")


async def verify_code(email: str, code: str) -> bool:
    redis = get_redis()
    key = f"verification:{email}"
    stored_code = await redis.get(key)

    if stored_code is not None and stored_code == code:
        await redis.delete(key)
        return True

    return False
