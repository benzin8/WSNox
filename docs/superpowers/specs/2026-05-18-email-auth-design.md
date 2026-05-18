# Email Auth Migration Design

**Date:** 2026-05-18
**Status:** Approved

## Overview

Replace phone number as the primary auth identifier with email. Email becomes required and is used for verification codes and login. Phone number becomes optional and can be added later from the profile page. A dismissible banner prompts users to add their phone number.

## Database

**`users` table changes:**
- `phone_number`: `nullable=False` → `nullable=True` (unique constraint stays)
- `email`: `nullable=True` → `nullable=False`, `unique=True`

New alembic migration handles both changes atomically.

## Backend

### Settings (`core/config.py`)
Add four new fields read from `.env`:
```
smtp_host: str
smtp_port: int
smtp_user: str
smtp_password: str
```

### Verification service (`services/verification.py`)
- Replace `import secrets` + console print with async email sending via `aiosmtplib`
- `send_verification_code(email: str)` — generates 6-digit code, stores in Redis as `verification:{email}` with 300s TTL, sends email via Yandex SMTP (SSL, port 465)
- `verify_code(email: str, code: str)` — unchanged logic, just operates on email key
- Redis keys for post-verify flags: `verified_for_reg:{email}` (600s TTL), `verified_for_login:{email}` (300s TTL)

### Schemas (`schemas/user.py`)
| Old | New |
|-----|-----|
| `PhoneNumberRequest` | `EmailRequest` — `email: EmailStr` |
| `PhoneVerify` | `EmailVerify` — `email: EmailStr`, `code: str` |
| `UserLogin` | `email: EmailStr` replaces `phone_number` |
| `UserResponse` | `phone_number: Optional[str]`, `email: EmailStr` (required) |
| `UserBase` | `email: EmailStr` required, `phone_number: Optional[str]` |

### CRUD (`crud/user.py`)
- `get_user_by_phone` → `get_user_by_email`
- `create_user` — accepts email as identifier
- `login_user` — lookup by email instead of phone_number

### Auth router (`routers/auth_router.py`)
All three endpoints updated to use email:
- `POST /auth/send-code` — accepts `EmailRequest`
- `POST /auth/verify-code` — accepts `EmailVerify`, checks user by email
- `POST /auth/register` — verifies `verified_for_reg:{email}` flag
- `POST /auth/login` — accepts email + password, verifies `verified_for_login:{email}` flag

Session expiry redirect logic (already in frontend) works unchanged — keep error detail string `"Phone number not verified"` as-is to avoid frontend changes.

## Frontend

### `SendCodePage.jsx`
- Replace `PatternFormat` phone input with standard `<input type="email">`
- State variable `phoneNumber` → `email`
- Navigate to `/auth/verify` passing `{ email }` in state

### `VerifyCodePage.jsx`
- Read `email` from `location.state` instead of `phone_number`
- Display email in subtitle
- Pass `{ email }` to register/login pages

### `RegisterPage.jsx`
- Read `email` from state (no `code` needed in state anymore — backend reads from Redis)
- Remove phone number field entirely
- POST body: `{ email, name, username, password }`

### `LoginPage.jsx`
- Read `email` from state
- POST body: `{ email, password }`

### `SendCodePage.jsx` — session expiry redirect
Both `RegisterPage` and `LoginPage` redirect to `/auth/send-code` with `{ email }` in state on `"Not verified"` error. `SendCodePage` pre-fills the email field from state.

### Phone number banner (`ChatPage.jsx`)
- Shown when `user.phone_number` is null/empty
- Dismissed state stored in `localStorage` key `phone_banner_dismissed`
- Contains: lime-colored text "Добавьте номер телефона для дополнительной безопасности", button "Добавить" → navigates to profile, × button to dismiss
- Banner does not reappear after dismissal even on page reload

### Profile page
Phone number field already exists — no new UI needed, just confirm it saves correctly.

## Dependencies

Add `aiosmtplib` to `pyproject.toml`:
```
aiosmtplib (>=3.0.0,<4.0.0)
```

## Error handling

- SMTP failure during `send_verification_code` → raise `HTTPException(503, "Failed to send verification email")`
- Invalid/expired code → existing 400 behavior unchanged
- Email already registered → existing 400 behavior unchanged

## Migration strategy

Existing users have `phone_number` set and `email` null. The migration makes `phone_number` nullable first, then makes `email` not-null. Since existing rows have `email=null`, the migration must set a placeholder or be run on a fresh DB. Given this is pre-production, a fresh DB is acceptable — document this in migration comment.
