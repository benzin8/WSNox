# Email Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace phone number with email as the primary auth identifier; add dismissible phone number banner in chat.

**Architecture:** Email is required for registration/login and receives verification codes via Yandex SMTP (aiosmtplib). Phone number becomes optional and can be added later from the profile page. Redis keys updated from phone-based to email-based. Frontend pages updated to use email input.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Redis, aiosmtplib, React (Vite), Tailwind CSS

---

## File Map

**Backend — modify:**
- `pyproject.toml` — add aiosmtplib dependency
- `src/messenger/backend/core/config.py` — add SMTP settings
- `src/messenger/backend/services/verification.py` — send email instead of console print
- `src/messenger/backend/models/user.py` — phone nullable, email not null
- `src/messenger/backend/app/api_v1/schemas/user.py` — EmailRequest, EmailVerify, updated UserLogin/UserResponse
- `src/messenger/backend/app/crud/user.py` — get_user_by_email, login by email
- `src/messenger/backend/app/api_v1/routers/auth_router.py` — use email throughout
- `src/messenger/backend/app/api_v1/schemas/user.py` — add phone_number to UserProfileResponse
- `src/messenger/backend/app/api_v1/routers/profile_router.py` — expose phone_number in response

**Backend — create:**
- `alembic/versions/<hash>_email_auth_migration.py` — new migration

**Frontend — modify:**
- `src/messenger/frontend_react/src/pages/auth/SendCodePage.jsx`
- `src/messenger/frontend_react/src/pages/auth/VerifyCodePage.jsx`
- `src/messenger/frontend_react/src/pages/auth/RegisterPage.jsx`
- `src/messenger/frontend_react/src/pages/auth/LoginPage.jsx`
- `src/messenger/frontend_react/src/pages/chat/ChatPage.jsx` — phone number banner

---

### Task 1: Add aiosmtplib dependency

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Add aiosmtplib to dependencies**

In `pyproject.toml`, add to the `dependencies` list:
```toml
"aiosmtplib (>=3.0.0,<4.0.0)",
```

- [ ] **Step 2: Regenerate lock file**

```bash
cd /Users/dmitryvislobokov/python/messenger && poetry lock
```

Expected: lock file updated, no errors.

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml poetry.lock
git commit -m "chore: add aiosmtplib dependency for email sending"
```

---

### Task 2: SMTP config in Settings

**Files:**
- Modify: `src/messenger/backend/core/config.py`

- [ ] **Step 1: Add SMTP fields to Settings**

Replace the current `Settings` class with:
```python
import os

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

from messenger import PROJECT_ROOT


class Settings(BaseSettings):
    db_user: str
    db_pass: str
    db_host: str = "127.0.0.1"
    db_port: int = 5432
    db_name: str

    secret_key: str
    algorithm: str
    redis_url: str

    smtp_host: str = "smtp.yandex.ru"
    smtp_port: int = 465
    smtp_user: str
    smtp_password: str

    DOCKER_MODE: bool = os.getenv("DOCKER_MODE", "false").lower() == "true"

    @computed_field
    @property
    def database_url(self) -> str:
        return f"postgresql+psycopg://{self.db_user}:{self.db_pass}@{self.db_host}:{self.db_port}/{self.db_name}"

    @computed_field
    @property
    def redis_host(self) -> str:
        return self.redis_url

    model_config = SettingsConfigDict(
        env_file=os.path.join(PROJECT_ROOT, ".env"),
        extra="ignore"
    )

settings = Settings()
```

- [ ] **Step 2: Verify .env has the SMTP fields**

Check that `.env` contains:
```
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=dimavislo1@yandex.ru
SMTP_PASSWORD=ibicjmwrtzuzshwp
```

- [ ] **Step 3: Commit**

```bash
git add src/messenger/backend/core/config.py
git commit -m "feat: add SMTP configuration to Settings"
```

---

### Task 3: Email verification service

**Files:**
- Modify: `src/messenger/backend/services/verification.py`

- [ ] **Step 1: Rewrite verification service**

Replace the entire file with:
```python
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
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/backend/services/verification.py
git commit -m "feat: send verification code via Yandex SMTP email"
```

---

### Task 4: Pydantic schemas

**Files:**
- Modify: `src/messenger/backend/app/api_v1/schemas/user.py`

- [ ] **Step 1: Update schemas**

Replace the entire file with:
```python
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ProfileBase(BaseModel):
    display_name: Optional[str] = Field(None, max_length=32)
    bio: Optional[str] = Field(None, max_length=256)
    status: str = "Offline"
    profile_photos: List[str] = []

class ProfileRead(ProfileBase):
    model_config = ConfigDict(from_attributes=True)

class ProfileUpdate(ProfileBase):
    phone_number: Optional[str] = Field(None, max_length=20)

class EmailRequest(BaseModel):
    email: EmailStr

class EmailVerify(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=4, max_length=6)

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    name: str = Field(..., min_length=2, max_length=32)
    email: EmailStr
    phone_number: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    name: str
    username: str
    phone_number: Optional[str] = None
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True

class AuthResponse(BaseModel):
    status: str
    user: UserResponse
    access_token: str
    refresh_token: str

class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    profile: ProfileRead

class UserUpdate(UserBase):
    pass

class UserProfileResponse(BaseModel):
    user_id: int
    username: str
    name: str
    phone_number: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    status: str = "Offline"
    profile_photos: List[str] = []

    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/backend/app/api_v1/schemas/user.py
git commit -m "feat: update schemas to use email as primary auth identifier"
```

---

### Task 5: User model

**Files:**
- Modify: `src/messenger/backend/models/user.py`

- [ ] **Step 1: Update User model**

Replace the column definitions for `phone_number` and `email`:
```python
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from messenger.backend.db import Base

if TYPE_CHECKING:
    from .message import Message
    from .profile import Profile

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    phone_number: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False)
    sent_messages: Mapped[list["Message"]] = relationship(
        "Message",
        back_populates="sender",
        foreign_keys="Message.sender_id")
    received_messages: Mapped[list["Message"]] = relationship(
        "Message",
        back_populates="recipient",
        foreign_keys="Message.recipient_id")

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', name='{self.name}')>"
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/backend/models/user.py
git commit -m "feat: make phone_number nullable, email required in User model"
```

---

### Task 6: Alembic migration

**Files:**
- Create: `alembic/versions/<generated>_email_auth_migration.py`

- [ ] **Step 1: Generate migration file**

```bash
cd /Users/dmitryvislobokov/python/messenger && poetry run alembic revision --autogenerate -m "email_auth_migration"
```

Expected: new file created in `alembic/versions/`.

- [ ] **Step 2: Verify migration content**

Open the generated file and confirm it contains something like:
```python
def upgrade() -> None:
    op.alter_column('users', 'phone_number', nullable=True)
    op.alter_column('users', 'email', nullable=False)

def downgrade() -> None:
    op.alter_column('users', 'email', nullable=True)
    op.alter_column('users', 'phone_number', nullable=False)
```

If autogenerate produced different content, replace it with the above.

- [ ] **Step 3: Apply migration on fresh DB (pre-production)**

```bash
docker-compose down -v && docker-compose up -d db
```

Wait 3 seconds for Postgres to start, then:

```bash
cd /Users/dmitryvislobokov/python/messenger && poetry run alembic upgrade head
```

Expected: `Running upgrade ... -> <hash>, email_auth_migration`

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/
git commit -m "feat: alembic migration - phone nullable, email required"
```

---

### Task 7: UserCRUD

**Files:**
- Modify: `src/messenger/backend/app/crud/user.py`

- [ ] **Step 1: Replace the entire file**

```python
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.schemas.user import UserCreate
from messenger.backend.app.crud.profile import ProfileCRUD
from messenger.backend.core.security import hash_password
from messenger.backend.models import User


class UserCRUD:
    @staticmethod
    async def create_user(session: AsyncSession, user_data: UserCreate, password: str):
        hashed_password = hash_password(password)
        try:
            user = User(
                name=user_data.name,
                username=user_data.username,
                email=user_data.email,
                phone_number=user_data.phone_number,
                hashed_password=hashed_password,
            )
            session.add(user)
            await session.flush()

            await ProfileCRUD.create_default_profile(session, user.id, user_data.name)

            await session.commit()
            await session.refresh(user)
            return user
        except IntegrityError:
            await session.rollback()
            return None

    @staticmethod
    async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
        query = select(User).where(User.email == email)
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def login_user(session: AsyncSession, email: str, password: str) -> User | None:
        query = select(User).where(User.email == email)
        result = await session.execute(query)
        return result.scalar_one_or_none()
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/backend/app/crud/user.py
git commit -m "feat: replace get_user_by_phone with get_user_by_email in UserCRUD"
```

---

### Task 8: Auth router

**Files:**
- Modify: `src/messenger/backend/app/api_v1/routers/auth_router.py`

- [ ] **Step 1: Replace the entire file**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.schemas.user import (
    AuthResponse,
    EmailRequest,
    EmailVerify,
    UserCreate,
    UserLogin,
    UserResponse,
)
from messenger.backend.app.crud.user import UserCRUD
from messenger.backend.core.redis import get_redis
from messenger.backend.core.security import create_pair_jwt_tokens, verify_password
from messenger.backend.db.session import get_db_session
from messenger.backend.services.verification import send_verification_code, verify_code

auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/send-code")
async def send_code(data: EmailRequest):
    await send_verification_code(data.email)
    return {"message": True}


@auth_router.post("/verify-code")
async def verify_sms(data: EmailVerify, db: AsyncSession = Depends(get_db_session)):
    is_valid = await verify_code(data.email, data.code)
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid code")

    user = await UserCRUD.get_user_by_email(db, data.email)
    redis = get_redis()
    if user:
        await redis.setex(f"verified_for_login:{data.email}", 300, "true")
        return {
            "status": "need_password",
            "message": "Email verified. Please enter your password."
        }
    else:
        await redis.setex(f"verified_for_reg:{data.email}", 600, "true")
        return {
            "status": "register",
            "message": "Email verified. Please register."
        }


@auth_router.post("/register", response_model=AuthResponse)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db_session)):
    redis = get_redis()
    verified = await redis.get(f"verified_for_reg:{data.email}")
    if not verified:
        raise HTTPException(status_code=400, detail="Phone number not verified")

    user = await UserCRUD.create_user(db, data, data.password)
    if not user:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    tokens = create_pair_jwt_tokens(user.id)
    await redis.delete(f"verified_for_reg:{data.email}")
    return {
        "status": "success",
        "user": UserResponse.model_validate(user),
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "bearer"
    }


@auth_router.post("/login", response_model=AuthResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db_session)):
    redis = get_redis()
    verified = await redis.get(f"verified_for_login:{data.email}")
    if not verified:
        raise HTTPException(status_code=400, detail="Phone number not verified")

    user = await UserCRUD.login_user(db, data.email, data.password)
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    tokens = create_pair_jwt_tokens(user.id)
    await redis.delete(f"verified_for_login:{data.email}")
    return {
        "status": "success",
        "user": UserResponse.model_validate(user),
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "bearer"
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/backend/app/api_v1/routers/auth_router.py
git commit -m "feat: update auth router to use email instead of phone number"
```

---

### Task 9: Expose phone_number in profile router

**Files:**
- Modify: `src/messenger/backend/app/api_v1/routers/profile_router.py`

The `UserProfileResponse` schema already has `phone_number: Optional[str]` after Task 4. Now update `_build_response` to include it.

- [ ] **Step 1: Update _build_response**

In `profile_router.py`, update `_build_response`:
```python
def _build_response(user) -> UserProfileResponse:
    p = user.profile
    return UserProfileResponse(
        user_id=user.id,
        username=user.username,
        name=user.name,
        phone_number=user.phone_number,
        display_name=p.display_name if p else None,
        bio=p.bio if p else None,
        status=p.status if p else "Offline",
        profile_photos=p.profile_photos if p else [],
    )
```

- [ ] **Step 2: Update ProfileCRUD to save phone_number**

Open `src/messenger/backend/app/crud/profile.py` and find `update_profile`. Add phone_number handling. The method receives a `ProfileUpdate` object — add:
```python
if data.phone_number is not None:
    user = await session.get(User, user_id)
    if user:
        user.phone_number = data.phone_number
        await session.flush()
```

Add `from messenger.backend.models import User` import if not present.

- [ ] **Step 3: Commit**

```bash
git add src/messenger/backend/app/api_v1/routers/profile_router.py src/messenger/backend/app/crud/profile.py
git commit -m "feat: expose phone_number in profile response and allow saving it"
```

---

### Task 10: Frontend — SendCodePage

**Files:**
- Modify: `src/messenger/frontend_react/src/pages/auth/SendCodePage.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function SendCodePage() {
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState(location.state?.email || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await axios.post(`${API_BASE}/auth/send-code`, { email });
            navigate('/auth/verify', { state: { email } });
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to send code');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-lime-400">WSNox</h1>
                    <p className="mt-2 text-zinc-400">Введите ваш email для получения кода подтверждения</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            className="mt-2 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-lime-400 p-4 font-bold text-zinc-900 hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg shadow-lime-500/20"
                    >
                        {loading ? 'Отправка...' : 'Отправить код'}
                    </button>
                </form>

                <div className="mt-8 text-center text-xs text-zinc-500">
                    Продолжая, вы соглашаетесь с Условиями и Политикой конфиденциальности.
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/frontend_react/src/pages/auth/SendCodePage.jsx
git commit -m "feat: replace phone input with email input in SendCodePage"
```

---

### Task 11: Frontend — VerifyCodePage

**Files:**
- Modify: `src/messenger/frontend_react/src/pages/auth/VerifyCodePage.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function VerifyCodePage() {
    const location = useLocation();
    const navigate = useNavigate();
    const email = location.state?.email || '';

    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await axios.post(`${API_BASE}/auth/verify-code`, {
                email,
                code
            });

            if (response.data.status === 'register') {
                navigate('/auth/register', { state: { email } });
            } else if (response.data.status === 'need_password') {
                navigate('/auth/login', { state: { email } });
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Invalid verification code');
        } finally {
            setLoading(false);
        }
    };

    if (!email) {
        return <Navigate to="/auth/send-code" replace />;
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-lime-400">Введите код</h1>
                    <p className="mt-2 text-zinc-400">Отправлен на <strong>{email}</strong></p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="code" className="block text-sm font-medium text-zinc-300">
                            Код подтверждения
                        </label>
                        <input
                            id="code"
                            type="text"
                            placeholder="123456"
                            className="mt-2 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-center tracking-[0.5em] text-2xl font-bold text-lime-400 placeholder:text-zinc-700 placeholder:tracking-normal focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            required
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-lime-400 p-4 font-bold text-zinc-900 hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg shadow-lime-500/20"
                    >
                        {loading ? 'Проверка...' : 'Проверить'}
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/auth/send-code')}
                        className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        Сменить email
                    </button>
                </form>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/frontend_react/src/pages/auth/VerifyCodePage.jsx
git commit -m "feat: update VerifyCodePage to use email state instead of phone_number"
```

---

### Task 12: Frontend — RegisterPage

**Files:**
- Modify: `src/messenger/frontend_react/src/pages/auth/RegisterPage.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function RegisterPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const email = location.state?.email || '';

    const [formData, setFormData] = useState({ name: '', username: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await axios.post(`${API_BASE}/auth/register`, {
                email,
                ...formData
            });

            const { access_token, refresh_token } = response.data;
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);

            window.dispatchEvent(new Event('storage'));
            navigate('/chat');
        } catch (err) {
            if (err.response?.data?.detail === 'Phone number not verified') {
                navigate('/auth/send-code', { state: { email } });
                return;
            }
            setError(err.response?.data?.detail || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    if (!email) {
        return <Navigate to="/auth/send-code" replace />;
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-lime-400">Заполните профиль</h1>
                    <p className="mt-2 text-zinc-400">Почти готово! Последний штрих.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300">Отображаемое имя</label>
                        <input
                            type="text"
                            className="mt-1 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-300">Юзернейм</label>
                        <input
                            type="text"
                            className="mt-1 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={formData.username}
                            onChange={(e) => setFormData({...formData, username: e.target.value})}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-300">Пароль</label>
                        <input
                            type="password"
                            className="mt-1 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={formData.password}
                            onChange={(e) => setFormData({...formData, password: e.target.value})}
                            required
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-lime-400 p-4 font-bold text-zinc-900 hover:bg-lime-300 disabled:opacity-50 transition-all active:scale-[0.98] mt-4"
                    >
                        {loading ? 'Регистрация...' : 'Зарегистрироваться'}
                    </button>
                </form>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/frontend_react/src/pages/auth/RegisterPage.jsx
git commit -m "feat: update RegisterPage to use email from state"
```

---

### Task 13: Frontend — LoginPage

**Files:**
- Modify: `src/messenger/frontend_react/src/pages/auth/LoginPage.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function LoginPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const email = location.state?.email || '';

    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await axios.post(`${API_BASE}/auth/login`, {
                email,
                password,
            });

            const { access_token, refresh_token } = response.data;
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);

            navigate('/chat');
        } catch (err) {
            if (err.response?.data?.detail === 'Phone number not verified') {
                navigate('/auth/send-code', { state: { email } });
                return;
            }
            setError(err.response?.data?.detail || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    if (!email) {
        return <Navigate to="/auth/send-code" replace />;
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-lime-400">WSNox</h1>
                    <p className="mt-2 text-zinc-400">Введите ваш пароль для <strong>{email}</strong></p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300">Пароль</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            className="mt-2 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-lime-400 p-4 font-bold text-zinc-900 hover:bg-lime-300 disabled:opacity-50 transition-all active:scale-[0.98]"
                    >
                        {loading ? 'Вход...' : 'Войти'}
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/auth/send-code')}
                        className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        Зайти под другим аккаунтом
                    </button>
                </form>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/frontend_react/src/pages/auth/LoginPage.jsx
git commit -m "feat: update LoginPage to use email instead of phone number"
```

---

### Task 14: Frontend — Phone number banner in ChatPage

**Files:**
- Modify: `src/messenger/frontend_react/src/pages/chat/ChatPage.jsx`

- [ ] **Step 1: Add banner state after existing state declarations**

After the line `const [showEditModal, setShowEditModal] = useState(false);`, add:
```jsx
const [showPhoneBanner, setShowPhoneBanner] = useState(false);
```

- [ ] **Step 2: Add banner effect after the fetchInitialData useEffect**

After the `useEffect` that calls `fetchInitialData`, add:
```jsx
useEffect(() => {
  if (currentUser && !currentUser.phone_number) {
    const dismissed = localStorage.getItem('phone_banner_dismissed');
    if (!dismissed) setShowPhoneBanner(true);
  }
}, [currentUser]);
```

- [ ] **Step 3: Add dismiss handler after handleLogout**

```jsx
const handleDismissBanner = () => {
  localStorage.setItem('phone_banner_dismissed', 'true');
  setShowPhoneBanner(false);
};
```

- [ ] **Step 4: Wrap existing return JSX to add banner**

Change the top-level `return` from:
```jsx
return (
  <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
```

To:
```jsx
return (
  <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
    {showPhoneBanner && (
      <div className="flex items-center justify-between px-6 py-2 bg-lime-400/10 border-b border-lime-400/30 shrink-0">
        <span className="text-lime-400 font-semibold text-sm">
          Добавьте номер телефона для дополнительной безопасности
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenOwnProfile}
            className="text-sm font-bold text-zinc-900 bg-lime-400 px-3 py-1 rounded-lg hover:bg-lime-300 transition-colors"
          >
            Добавить
          </button>
          <button
            onClick={handleDismissBanner}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>
      </div>
    )}
    <div className="flex flex-1 overflow-hidden">
```

And close it before the final `</div>`:
```jsx
    </div>
  </div>
);
```

- [ ] **Step 5: Commit**

```bash
git add src/messenger/frontend_react/src/pages/chat/ChatPage.jsx
git commit -m "feat: add dismissible phone number banner in ChatPage"
```

---

### Task 15: Final push

- [ ] **Step 1: Push all commits**

```bash
git push
```

- [ ] **Step 2: Verify docker build works**

```bash
cd /Users/dmitryvislobokov/python/messenger && docker-compose up --build -d
```

Check logs:
```bash
docker logs messenger_backend --tail 30
```

Expected: no import errors, server starts on port 8000.
