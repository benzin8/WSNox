import secrets
from email.message import EmailMessage

import aiosmtplib
from fastapi import HTTPException

from messenger.backend.core.config import settings
from messenger.backend.core.redis import get_redis

PASSWORD_RESET_TTL_SECONDS = 30 * 60


async def _send_email(to: str, subject: str, text: str, html: str | None = None) -> None:
    msg = EmailMessage()
    msg["From"] = settings.smtp_user
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html is not None:
        msg.add_alternative(html, subtype="html")

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
        raise HTTPException(status_code=503, detail="Не удалось отправить письмо. Попробуйте ещё раз")


async def send_verification_code(email: str) -> None:
    redis = get_redis()
    existing_code = await redis.get(f"verification:{email}")
    if existing_code:
        code = existing_code
    else:
        code = str(secrets.randbelow(900000) + 100000)
        await redis.setex(f"verification:{email}", 300, code)

    await _send_email(
        to=email,
        subject="Код подтверждения WSNox",
        text=f"Ваш код подтверждения: {code}\n\nКод действителен 5 минут.",
    )


async def verify_code(email: str, code: str) -> bool:
    redis = get_redis()
    key = f"verification:{email}"
    stored_code = await redis.get(key)

    if stored_code is not None and stored_code == code:
        await redis.delete(key)
        return True

    return False


def _render_reset_email_html(link: str) -> str:
    return f"""\
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e4e4e7;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#09090b;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background:#18181b;border:1px solid #27272a;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:32px 32px 8px 32px;text-align:center;">
          <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#a3e635;">WSNox</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0 32px;">
          <h1 style="margin:16px 0 8px 0;font-size:20px;font-weight:700;color:#fafafa;">Сброс пароля</h1>
          <p style="margin:0 0 24px 0;font-size:14px;line-height:1.55;color:#a1a1aa;">
            Кто-то (надеемся, вы) запросил сброс пароля для аккаунта WSNox. Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действительна 30 минут.
          </p>
        </td></tr>
        <tr><td align="center" style="padding:0 32px 24px 32px;">
          <a href="{link}" style="display:inline-block;background:#a3e635;color:#18181b;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:12px;font-size:15px;">Сбросить пароль</a>
        </td></tr>
        <tr><td style="padding:0 32px 24px 32px;">
          <p style="margin:0;font-size:12px;color:#71717a;line-height:1.55;">
            Если кнопка не работает, скопируйте ссылку в браузер:<br>
            <a href="{link}" style="color:#a3e635;word-break:break-all;">{link}</a>
          </p>
        </td></tr>
        <tr><td style="padding:24px 32px;border-top:1px solid #27272a;">
          <p style="margin:0;font-size:11px;color:#52525b;line-height:1.55;">
            Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо. Ваш текущий пароль останется без изменений.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def send_password_reset_email(email: str, token: str) -> None:
    link = f"{settings.frontend_base_url.rstrip('/')}/auth/reset-password?token={token}"
    text = (
        "Сброс пароля WSNox\n\n"
        f"Перейдите по ссылке, чтобы задать новый пароль (действует 30 минут):\n{link}\n\n"
        "Если вы не запрашивали сброс — проигнорируйте это письмо."
    )
    await _send_email(
        to=email,
        subject="Сброс пароля — WSNox",
        text=text,
        html=_render_reset_email_html(link),
    )


async def create_password_reset_token(email: str) -> str:
    """Generate a one-time reset token, store it in Redis bound to *email*."""
    redis = get_redis()
    token = secrets.token_urlsafe(32)
    await redis.setex(f"password_reset:{token}", PASSWORD_RESET_TTL_SECONDS, email)
    return token


async def consume_password_reset_token(token: str) -> str | None:
    """Return the email bound to *token* and delete it (single-use)."""
    redis = get_redis()
    key = f"password_reset:{token}"
    email = await redis.get(key)
    if not email:
        return None
    await redis.delete(key)
    return email
