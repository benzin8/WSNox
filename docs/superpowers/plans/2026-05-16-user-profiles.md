# User Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose user profiles via REST API and display them as modal windows in the React frontend.

**Architecture:** Profile model and DB table already exist. We add ProfileCRUD, a `/profiles` router, auto-creation on registration, and two frontend modal components. Own profile is opened from the sidebar avatar; other users' profiles are opened by clicking the username in the chat header.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic v2, React 18, Tailwind CSS, axios, lucide-react

---

## File Map

**Create:**
- `src/messenger/backend/app/crud/profile.py` — ProfileCRUD (get, create_default, update)
- `src/messenger/backend/app/api_v1/routers/profile_router.py` — GET /profiles/me, PUT /profiles/me, GET /profiles/{user_id}
- `src/messenger/frontend_react/src/hooks/useProfile.js` — axios calls for profile API
- `src/messenger/frontend_react/src/components/profile/ProfileModal.jsx` — read/view modal
- `src/messenger/frontend_react/src/components/profile/EditProfileModal.jsx` — edit own profile form

**Modify:**
- `src/messenger/backend/app/api_v1/schemas/user.py` — add `UserProfileResponse`
- `src/messenger/backend/app/crud/user.py` — auto-create profile on registration
- `src/messenger/backend/app/main.py` — register profile_router
- `src/messenger/frontend_react/src/pages/chat/ChatPage.jsx` — avatar click → own profile modal
- `src/messenger/frontend_react/src/components/chat/ChatWindow.jsx` — username click → other user's profile

---

### Task 1: Add UserProfileResponse schema

**Files:**
- Modify: `src/messenger/backend/app/api_v1/schemas/user.py`

- [ ] **Step 1: Add UserProfileResponse to schemas**

Open `src/messenger/backend/app/api_v1/schemas/user.py` and add this class at the end of the file:

```python
class UserProfileResponse(BaseModel):
    """Combined response for user + profile data returned by profile endpoints."""
    user_id: int
    username: str
    name: str
    display_name: Optional[str] = None
    bio: Optional[str] = None
    status: str = "Offline"
    profile_photos: List[str] = []

    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/backend/app/api_v1/schemas/user.py
git commit -m "feat(profiles): add UserProfileResponse schema"
```

---

### Task 2: Create ProfileCRUD

**Files:**
- Create: `src/messenger/backend/app/crud/profile.py`

- [ ] **Step 1: Create the file**

```python
# src/messenger/backend/app/crud/profile.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from sqlalchemy import select

from messenger.backend.models.profile import Profile
from messenger.backend.models.user import User
from messenger.backend.app.api_v1.schemas.user import ProfileUpdate


class ProfileCRUD:
    @staticmethod
    async def get_user_with_profile(session: AsyncSession, user_id: int) -> User | None:
        """Load User row with its Profile eagerly in a single query."""
        query = (
            select(User)
            .options(joinedload(User.profile))
            .where(User.id == user_id)
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_default_profile(session: AsyncSession, user_id: int, display_name: str) -> Profile:
        """Create a blank profile for a newly registered user."""
        profile = Profile(
            user_id=user_id,
            display_name=display_name,
            bio="",
            status="Online",
            profile_photos=[],
        )
        session.add(profile)
        await session.flush()  # persist within the caller's open transaction
        return profile

    @staticmethod
    async def update_profile(session: AsyncSession, user_id: int, data: ProfileUpdate) -> Profile | None:
        """Apply partial update to a user's profile. Returns None if profile not found."""
        query = select(Profile).where(Profile.user_id == user_id)
        result = await session.execute(query)
        profile = result.scalar_one_or_none()
        if not profile:
            return None

        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)

        await session.commit()
        await session.refresh(profile)
        return profile
```

- [ ] **Step 2: Register ProfileCRUD in the crud __init__.py**

Open `src/messenger/backend/app/crud/__init__.py` and add:

```python
from .profile import ProfileCRUD
```

- [ ] **Step 3: Commit**

```bash
git add src/messenger/backend/app/crud/profile.py src/messenger/backend/app/crud/__init__.py
git commit -m "feat(profiles): add ProfileCRUD"
```

---

### Task 3: Auto-create profile on registration

**Files:**
- Modify: `src/messenger/backend/app/crud/user.py`

- [ ] **Step 1: Update create_user to also create a default profile**

Replace the current `create_user` method in `src/messenger/backend/app/crud/user.py`:

```python
from messenger.backend.models import User
from messenger.backend.app.api_v1.schemas.user import UserCreate
from messenger.backend.app.crud.profile import ProfileCRUD

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select

from messenger.backend.core.security import hash_password

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
            await session.flush()  # get user.id before creating profile

            # Every new user gets a default profile automatically
            await ProfileCRUD.create_default_profile(session, user.id, user_data.name)

            await session.commit()
            await session.refresh(user)
            return user
        except IntegrityError:
            await session.rollback()
            return None

    @staticmethod
    async def get_user_by_phone(session: AsyncSession, phone_number: str) -> User | None:
        query = (
            select(User)
            .where(User.phone_number == phone_number)
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def login_user(session: AsyncSession, phone_number: str, password: str) -> User:
        query = (
            select(User)
            .where(User.phone_number == phone_number)
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/backend/app/crud/user.py
git commit -m "feat(profiles): auto-create default profile on user registration"
```

---

### Task 4: Profile router

**Files:**
- Create: `src/messenger/backend/app/api_v1/routers/profile_router.py`

- [ ] **Step 1: Create the router file**

```python
# src/messenger/backend/app/api_v1/routers/profile_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.db.session import get_db_session
from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.api_v1.schemas.user import ProfileUpdate, UserProfileResponse
from messenger.backend.app.crud.profile import ProfileCRUD

profile_router = APIRouter(prefix="/profiles", tags=["profiles"])


def _build_response(user) -> UserProfileResponse:
    """Flatten User + Profile ORM objects into a single response model."""
    p = user.profile
    return UserProfileResponse(
        user_id=user.id,
        username=user.username,
        name=user.name,
        display_name=p.display_name if p else None,
        bio=p.bio if p else None,
        status=p.status if p else "Offline",
        profile_photos=p.profile_photos if p else [],
    )


@profile_router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Return the authenticated user's own profile."""
    user = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _build_response(user)


@profile_router.put("/me", response_model=UserProfileResponse)
async def update_my_profile(
    data: ProfileUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Update the authenticated user's editable profile fields."""
    profile = await ProfileCRUD.update_profile(db, current_user.id, data)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    user = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    return _build_response(user)


@profile_router.get("/{user_id}", response_model=UserProfileResponse)
async def get_user_profile(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),  # require auth to view profiles
):
    """Return any user's profile (read-only for the requester)."""
    user = await ProfileCRUD.get_user_with_profile(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _build_response(user)
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/backend/app/api_v1/routers/profile_router.py
git commit -m "feat(profiles): add profile API router"
```

---

### Task 5: Register profile router in main.py

**Files:**
- Modify: `src/messenger/backend/app/main.py`

- [ ] **Step 1: Add import and include_router**

In `src/messenger/backend/app/main.py`, add the import after the `chat_router` import line:

```python
from .api_v1.routers.profile_router import profile_router
```

Then add after `app.include_router(chat_router)`:

```python
app.include_router(profile_router)
```

- [ ] **Step 2: Verify manually**

Start the backend and open `http://localhost:8000/docs`. You should see a **profiles** section with three endpoints: `GET /profiles/me`, `PUT /profiles/me`, `GET /profiles/{user_id}`.

Register a new user and call `GET /profiles/me` with the returned access token — it should return the auto-created profile.

- [ ] **Step 3: Commit**

```bash
git add src/messenger/backend/app/main.py
git commit -m "feat(profiles): register profile router in app"
```

---

### Task 6: Frontend — useProfile hook

**Files:**
- Create: `src/messenger/frontend_react/src/hooks/useProfile.js`

- [ ] **Step 1: Create the hook**

```js
// src/messenger/frontend_react/src/hooks/useProfile.js
import { useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const getAuthConfig = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
});

export const useProfile = () => {
    const [isLoading, setIsLoading] = useState(false);

    // Fetch the current user's own profile
    const fetchMyProfile = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/profiles/me`, getAuthConfig());
            return res.data;
        } catch (err) {
            console.error("Failed to fetch own profile", err);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch any user's profile by their ID
    const fetchUserProfile = async (userId) => {
        setIsLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/profiles/${userId}`, getAuthConfig());
            return res.data;
        } catch (err) {
            console.error("Failed to fetch user profile", err);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    // Update own profile fields
    const updateMyProfile = async (data) => {
        try {
            const res = await axios.put(`${API_BASE}/profiles/me`, data, getAuthConfig());
            return res.data;
        } catch (err) {
            console.error("Failed to update profile", err);
            return null;
        }
    };

    return { isLoading, fetchMyProfile, fetchUserProfile, updateMyProfile };
};
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/frontend_react/src/hooks/useProfile.js
git commit -m "feat(profiles): add useProfile hook"
```

---

### Task 7: Frontend — ProfileModal component

**Files:**
- Create: `src/messenger/frontend_react/src/components/profile/ProfileModal.jsx`

- [ ] **Step 1: Create the component**

```jsx
// src/messenger/frontend_react/src/components/profile/ProfileModal.jsx
import { X, Edit3 } from "lucide-react";

/**
 * ProfileModal — shows a user's profile.
 * Props:
 *   profile      — UserProfileResponse object from API
 *   isOwnProfile — bool, show Edit button when true
 *   onClose      — called when overlay or X is clicked
 *   onEdit       — called when Edit button is clicked (own profile only)
 */
export const ProfileModal = ({ profile, isOwnProfile, onClose, onEdit }) => {
    if (!profile) return null;

    // Show up to two uppercase initials as the avatar placeholder
    const initials = (profile.display_name || profile.name || profile.username)
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("");

    return (
        // Dark overlay — clicking outside closes the modal
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            {/* Modal card — stop click propagation so overlay handler doesn't fire */}
            <div
                className="relative w-80 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                    <X size={18} />
                </button>

                {/* Avatar */}
                <div className="w-20 h-20 rounded-full bg-lime-400 flex items-center justify-center text-zinc-900 text-2xl font-bold select-none">
                    {initials}
                </div>

                {/* Display name + username */}
                <div className="text-center">
                    <h2 className="text-lg font-bold text-zinc-100">
                        {profile.display_name || profile.name}
                    </h2>
                    <p className="text-sm text-zinc-400">@{profile.username}</p>
                </div>

                {/* Status badge */}
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                    profile.status === "Online"
                        ? "bg-lime-400/15 text-lime-400"
                        : "bg-zinc-700 text-zinc-400"
                }`}>
                    {profile.status}
                </span>

                {/* Bio */}
                {profile.bio && (
                    <p className="text-sm text-zinc-300 text-center leading-relaxed">
                        {profile.bio}
                    </p>
                )}

                {/* Edit button — visible only for own profile */}
                {isOwnProfile && (
                    <button
                        onClick={onEdit}
                        className="mt-2 flex items-center gap-2 bg-lime-400 text-zinc-900 font-semibold text-sm px-5 py-2 rounded-xl hover:bg-lime-300 transition-colors"
                    >
                        <Edit3 size={15} />
                        Редактировать
                    </button>
                )}
            </div>
        </div>
    );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/frontend_react/src/components/profile/ProfileModal.jsx
git commit -m "feat(profiles): add ProfileModal component"
```

---

### Task 8: Frontend — EditProfileModal component

**Files:**
- Create: `src/messenger/frontend_react/src/components/profile/EditProfileModal.jsx`

- [ ] **Step 1: Create the component**

```jsx
// src/messenger/frontend_react/src/components/profile/EditProfileModal.jsx
import { useState } from "react";
import { X, Save } from "lucide-react";

const STATUS_OPTIONS = ["Online", "Offline", "Не беспокоить", "Недоступен"];

/**
 * EditProfileModal — form to update own profile.
 * Props:
 *   profile       — current UserProfileResponse (pre-fills the form)
 *   onClose       — called on cancel / overlay click
 *   onSave        — async (data) => updatedProfile; closes modal after success
 */
export const EditProfileModal = ({ profile, onClose, onSave }) => {
    const [displayName, setDisplayName] = useState(profile?.display_name || "");
    const [bio, setBio] = useState(profile?.bio || "");
    const [status, setStatus] = useState(profile?.status || "Online");
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        await onSave({ display_name: displayName, bio, status });
        setIsSaving(false);
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative w-80 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-zinc-100">Редактировать профиль</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Display name field */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-400 font-medium">Отображаемое имя</label>
                    <input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        maxLength={100}
                        className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 transition-all"
                        placeholder="Как тебя называть?"
                    />
                </div>

                {/* Bio field */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-400 font-medium">О себе</label>
                    <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        maxLength={256}
                        rows={3}
                        className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 transition-all resize-none"
                        placeholder="Расскажи о себе..."
                    />
                </div>

                {/* Status select */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-400 font-medium">Статус</label>
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 transition-all"
                    >
                        {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 mt-2">
                    <button
                        onClick={onClose}
                        className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2 rounded-xl hover:bg-zinc-700 transition-colors"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 flex items-center justify-center gap-2 bg-lime-400 text-zinc-900 text-sm font-semibold py-2 rounded-xl hover:bg-lime-300 transition-colors disabled:opacity-50"
                    >
                        <Save size={14} />
                        {isSaving ? "Сохранение..." : "Сохранить"}
                    </button>
                </div>
            </div>
        </div>
    );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/frontend_react/src/components/profile/EditProfileModal.jsx
git commit -m "feat(profiles): add EditProfileModal component"
```

---

### Task 9: Wire up ChatPage — own profile from sidebar avatar

**Files:**
- Modify: `src/messenger/frontend_react/src/pages/chat/ChatPage.jsx`

- [ ] **Step 1: Add profile state and imports to ChatPage**

At the top of `ChatPage.jsx`, add to the existing imports:

```jsx
import { useProfile } from '../../hooks/useProfile';
import { ProfileModal } from '../../components/profile/ProfileModal';
import { EditProfileModal } from '../../components/profile/EditProfileModal';
```

Inside the `ChatPage` function, after the existing hook calls, add:

```jsx
const { fetchMyProfile, fetchUserProfile, updateMyProfile } = useProfile();
const [profileModal, setProfileModal] = useState(null); // { profile, isOwnProfile }
const [showEditModal, setShowEditModal] = useState(false);
```

- [ ] **Step 2: Add handler functions**

Add these handlers inside `ChatPage`, before the `return`:

```jsx
// Open own profile modal
const handleOpenOwnProfile = async () => {
    const p = await fetchMyProfile();
    if (p) setProfileModal({ profile: p, isOwnProfile: true });
};

// Open another user's profile modal by their user ID
const handleOpenUserProfile = async (userId) => {
    const p = await fetchUserProfile(userId);
    if (p) setProfileModal({ profile: p, isOwnProfile: false });
};

// Save changes from EditProfileModal and refresh profile state
const handleSaveProfile = async (data) => {
    const updated = await updateMyProfile(data);
    if (updated) setProfileModal({ profile: updated, isOwnProfile: true });
};
```

- [ ] **Step 3: Make sidebar avatar clickable**

In the `return` JSX, find the sidebar avatar div (currently):
```jsx
<div className="w-10 h-10 rounded-full bg-lime-400 flex items-center justify-center text-zinc-900 font-bold">
  {currentUser?.username?.toUpperCase()}
</div>
```

Replace it with:
```jsx
<div
  onClick={handleOpenOwnProfile}
  className="w-10 h-10 rounded-full bg-lime-400 flex items-center justify-center text-zinc-900 font-bold cursor-pointer hover:bg-lime-300 transition-colors"
  title="Мой профиль"
>
  {currentUser?.username?.slice(0, 1)?.toUpperCase()}
</div>
```

- [ ] **Step 4: Pass onOpenProfile to ChatWindow and render modals**

Update the `<ChatWindow>` call to pass the handler:
```jsx
<ChatWindow
  activeChat={activeChat}
  messages={messages}
  setMessages={setMessages}
  sendMessage={handleSendMessage}
  isConnected={isConnected}
  messagesEndRef={messagesEndRef}
  inputText={inputText}
  setInputText={setInputText}
  chatName={chatName}
  onOpenProfile={() => activeChat?.recipient_id && handleOpenUserProfile(activeChat.recipient_id)}
/>
```

After the closing `</div>` of the whole component (just before the final `}`), add the modal renders:
```jsx
{profileModal && (
  <ProfileModal
    profile={profileModal.profile}
    isOwnProfile={profileModal.isOwnProfile}
    onClose={() => setProfileModal(null)}
    onEdit={() => setShowEditModal(true)}
  />
)}

{showEditModal && profileModal && (
  <EditProfileModal
    profile={profileModal.profile}
    onClose={() => setShowEditModal(false)}
    onSave={handleSaveProfile}
  />
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/messenger/frontend_react/src/pages/chat/ChatPage.jsx
git commit -m "feat(profiles): wire own profile modal in ChatPage sidebar"
```

---

### Task 10: Wire up ChatWindow — other user's profile from header

**Files:**
- Modify: `src/messenger/frontend_react/src/components/chat/ChatWindow.jsx`

- [ ] **Step 1: Accept and use onOpenProfile prop**

Replace the current `ChatWindow` component with this updated version. The only changes are: accepting `onOpenProfile` in props and making the username `<h3>` clickable.

```jsx
import React from "react";
import { User, Phone, MoreVertical } from 'lucide-react';
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";

export const ChatWindow = ({
    messages, setMessages, activeChat, sendMessage,
    isConnected, messagesEndRef, inputText, setInputText,
    chatName, onOpenProfile
}) => {
    if (!activeChat) {
        return (
            <div className="flex-grow flex items-center justify-center bg-zinc-900 text-zinc-500">
                Выберите чат, чтобы начать общение
            </div>
        );
    }
    return (
      <div className="flex-grow flex flex-col bg-zinc-900 shadow-2xl">
        {/* Chat Header */}
        <header className="h-20 flex-shrink-0 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-900/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <User size={20} className="text-lime-400" />
            </div>
            <div>
              {/* Clicking the name opens the other user's profile */}
              <h3
                onClick={onOpenProfile}
                className="font-bold leading-tight cursor-pointer hover:text-lime-400 transition-colors"
                title="Открыть профиль"
              >
                {chatName}
              </h3>
              <p className="text-xs text-lime-400 font-medium">{isConnected ? "В сети" : "Офлайн"}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-zinc-400">
            <Phone size={20} className="hover:text-lime-400 cursor-pointer transition-colors" />
            <MoreVertical size={20} className="hover:text-lime-400 cursor-pointer transition-colors" />
          </div>
        </header>

        <MessageList messages={messages} setMessages={setMessages} messagesEndRef={messagesEndRef} />
        <InputArea inputText={inputText} setInputText={setInputText} sendMessage={sendMessage} isConnected={isConnected} />
      </div>
    );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/messenger/frontend_react/src/components/chat/ChatWindow.jsx
git commit -m "feat(profiles): open other user's profile from chat header"
```

---

### Task 11: Write the feature description MD file

**Files:**
- Create: `PROFILES.md` (project root)

- [ ] **Step 1: Create the file**

```markdown
# Профили пользователей

## Описание

Каждый пользователь мессенджера имеет профиль с информацией о себе.

## Что хранится в профиле

| Поле           | Описание                            |
|----------------|-------------------------------------|
| display_name   | Отображаемое имя (до 100 символов)  |
| bio            | О себе (до 256 символов)            |
| status         | Текущий статус (Online / Offline и др.) |
| profile_photos | Список URL фотографий (зарезервировано) |

## Как работает

- При регистрации профиль создаётся автоматически с `display_name = имя пользователя` и `status = Online`.
- Свой профиль открывается кликом на аватар в левой панели.
- Профиль собеседника открывается кликом на его имя в хедере чата.
- Редактировать можно только свой профиль (кнопка «Редактировать» в модальном окне).

## API

| Метод  | Путь                  | Описание                          |
|--------|-----------------------|-----------------------------------|
| GET    | `/profiles/me`        | Получить свой профиль             |
| PUT    | `/profiles/me`        | Обновить свой профиль             |
| GET    | `/profiles/{user_id}` | Получить профиль любого пользователя |

Все эндпоинты требуют Bearer-токен авторизации.
```

- [ ] **Step 2: Commit everything and finalize branch**

```bash
git add PROFILES.md
git commit -m "docs: add PROFILES.md feature description"
```

---

## Final Verification Checklist

- [ ] Backend starts without errors
- [ ] `GET /profiles/me` returns profile data for authenticated user
- [ ] `PUT /profiles/me` updates and returns the new profile
- [ ] `GET /profiles/{user_id}` returns another user's profile
- [ ] New user registration automatically creates a profile (check DB)
- [ ] Clicking sidebar avatar opens own profile modal with Edit button
- [ ] Clicking Edit opens the edit form pre-filled
- [ ] Saving updates the displayed profile without page refresh
- [ ] Clicking a chat partner's username opens their profile (read-only, no Edit button)
- [ ] Clicking outside any modal closes it
