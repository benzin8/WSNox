# Восстановление и смена пароля

Два независимых пути: «забыл пароль» (через email-ссылку) и «сменить пароль» (внутри профиля, когда уже залогинен). Делают разные вещи и используют разные эндпойнты.

## Забыл пароль (с экрана логина)

1. На `LoginPage` ссылка «Забыли пароль?» → `ForgotPasswordPage` → email.
2. `POST /auth/forgot-password` — генерит 32-байтный `secrets.token_urlsafe(32)`, кладёт в Redis `password_reset:<token> → email` с TTL 30 минут, шлёт HTML-письмо с кнопкой «Сбросить пароль» и брендингом WSNox.
3. Эндпойнт **всегда** отвечает `200 {ok: true}` — намеренно, чтобы не дать перебирать email на «зарегистрирован / нет».
4. Клик в письме → `/auth/reset-password?token=...` → новый пароль → `POST /auth/reset-password` → токен консьюмится (single-use), пароль хешится bcrypt, сразу выдаётся JWT-пара → редирект в `/chat`.

Ключевые свойства:
- Токен **одноразовый** — после первого использования сразу удаляется из Redis.
- TTL 30 минут — после этого ссылка протухает, надо запрашивать новую.
- Сам email никогда не сравнивается с базой на стороне `/forgot-password` для ответа — поэтому ответ одинаковый при любом адресе.

## Смена пароля в профиле (уже залогинен)

- Таб «Безопасность» в `EditProfileModal`.
- `POST /profiles/me/password {current_password, new_password}` — проверяет текущий через `verify_password`, отказывает при совпадении нового со старым, обновляет хеш.
- Без email-подтверждения — по дизайну (наличие текущего пароля достаточно).

## API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/forgot-password` | `{email}` → всегда 200, шлёт письмо если адрес зарегистрирован |
| POST | `/auth/reset-password` | `{token, new_password}` → новый JWT-пара, токен консьюмится |
| POST | `/profiles/me/password` | `{current_password, new_password}` → 204 |

## Конфигурация (env)

```env
FRONTEND_BASE_URL=https://wsnox.urldot.ru   # для построения ссылок в письме
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=your@yandex.ru
SMTP_PASSWORD=...
```

Без SMTP письма не уходят, эндпойнт `/forgot-password` молча отвечает 200.

## Файлы

| Слой | Где |
|------|-----|
| Backend — эндпойнты | `src/messenger/backend/app/api_v1/routers/auth_router.py` (`forgot_password`, `reset_password`) |
| Backend — отправка письма | `src/messenger/backend/services/verification.py` (`_render_reset_email_html`, `send_reset_email`) |
| Backend — смена пароля | `src/messenger/backend/app/api_v1/routers/profile_router.py` (`/me/password`) |
| Frontend — забыл | `src/messenger/frontend_react/src/pages/auth/ForgotPasswordPage.jsx`, `ResetPasswordPage.jsx` |
| Frontend — смена | `src/messenger/frontend_react/src/components/profile/EditProfileModal.jsx` |

## Безопасность

- Токен сброса хранится только в Redis, не в БД — после TTL или использования следов не остаётся.
- bcrypt с дефолтным cost (12 раундов) — см. также [Hardening-заметки](../security/hardening.md).
- На `/auth/forgot-password` навешен `rate_limit_send_code` — общий лимит с отправкой email-кодов.
