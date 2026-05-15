# User Profiles — Design Spec

**Date:** 2026-05-16  
**Branch:** `feature/user-profiles`  
**Status:** Approved

## Overview

Add user profile pages to the WSNox messenger. Each user has a profile (model and DB table already exist). The feature exposes profiles via a REST API and displays them as modal windows on the frontend.

- Own profile: opened by clicking the avatar in the sidebar; editable.
- Other user's profile: opened by clicking the username in the chat header; read-only.

---

## Current State

Already in place:
- `Profile` SQLAlchemy model (`models/profile.py`) with fields: `user_id`, `display_name`, `bio`, `status`, `profile_photos`
- `profiles` table in initial Alembic migration
- `ProfileBase`, `ProfileRead`, `ProfileUpdate` Pydantic schemas in `schemas/user.py`
- `User.profile` relationship (one-to-one)

Missing:
- `ProfileCRUD` operations
- Profile API endpoints
- Auto-creation of profile on user registration
- Frontend modals and API hook

---

## Backend

### ProfileCRUD — `app/crud/profile.py`

| Method | Description |
|---|---|
| `get_profile(session, user_id)` | Fetch profile by user_id with joined User row |
| `create_default_profile(session, user_id)` | Create profile with empty defaults (called on registration) |
| `update_profile(session, user_id, data: ProfileUpdate)` | Partial-update mutable fields |

### Profile Router — `app/api_v1/routers/profile_router.py`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/profiles/me` | Bearer | Returns own profile + user fields |
| PUT | `/profiles/me` | Bearer | Updates `display_name`, `bio`, `status` |
| GET | `/profiles/{user_id}` | Bearer | Returns any user's profile (read-only) |

Response schema `UserProfileResponse`:
```
{
  user_id, username, name, phone_number,
  display_name, bio, status, profile_photos
}
```

### Registration Change — `app/crud/user.py`

`UserCRUD.create_user` calls `ProfileCRUD.create_default_profile` after committing the new user. Default values: `display_name = user.name`, `bio = ""`, `status = "Online"`.

### Router Registration — `app/main.py`

Include `profile_router` with prefix `/api/v1`.

---

## Frontend

### New Files

| File | Purpose |
|---|---|
| `hooks/useProfile.js` | API calls: fetchMyProfile, fetchUserProfile, updateMyProfile |
| `components/profile/ProfileModal.jsx` | Read-only profile view (avatar initials, name, bio, status) |
| `components/profile/EditProfileModal.jsx` | Form to edit own display_name, bio, status |

### Changes to Existing Files

| File | Change |
|---|---|
| `pages/chat/ChatPage.jsx` | Clicking own avatar → opens ProfileModal (own, with Edit button) |
| `components/chat/ChatWindow.jsx` | Clicking chat partner's name in header → opens their ProfileModal (read-only) |

### Data Flow

1. User clicks own avatar → `GET /profiles/me` → `ProfileModal` with edit button
2. User clicks Edit → `EditProfileModal` with form pre-filled
3. User saves → `PUT /profiles/me` → modal closes, profile state refreshes
4. User clicks partner name in chat header → `GET /profiles/{user_id}` → read-only `ProfileModal`

---

## Out of Scope

- Avatar image upload (profile_photos field exists but file upload infra is not in place)
- Profile search / discovery
- Online/offline status sync via WebSocket (status field is manually set for now)
